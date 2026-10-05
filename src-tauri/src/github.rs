//! GitHub integration over the REST API. The credential comes from one of two
//! sources, chosen by `AppSettings::github_auth_source`:
//!
//! - **`gh` CLI** (the default): the token the local `gh` already holds, read
//!   with `gh auth token`. A machine that ran `gh auth login` needs no second
//!   sign-in here.
//! - **App sign-in**: OAuth **device flow** (no client secret, no loopback
//!   server), with the token persisted via `token_store`.
//!
//! The two never substitute for each other — when the configured source has no
//! usable token the call fails with advice naming both remedies, so the user is
//! never quietly authenticated as somebody else.
//!
//! Mirrors the structure of `linear.rs` (raw `reqwest` + `token_store`).

use crate::projects::GithubAuthSource;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

/// Shared HTTP client. `reqwest::Client` pools connections internally (it wraps
/// an `Arc`), so building it once and cloning cheaply reuses the connection pool
/// and TLS sessions across the polling commands — instead of a fresh client and
/// TLS handshake per request, which is what a per-call `Client::new()` forced.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

/// Client ID of the GitHub **OAuth App** (github.com → Settings → Developer
/// settings → OAuth Apps). The app must have **"Enable Device Flow"** ticked.
/// Client IDs are not secret, so embedding this is safe; device flow needs no
/// client secret.
const CLIENT_ID: &str = "Ov23li4XBrbnyplWQ643";
/// `repo` covers private-repo read + future push; `read:org` lets org repos resolve.
const SCOPE: &str = "repo read:org";

const TOKEN_STORE_SERVICE: &str = "Switchyard";
const TOKEN_STORE_ACCOUNT: &str = "github_access_token";
/// GitHub rejects API requests without a User-Agent header.
const USER_AGENT: &str = "Switchyard";

const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const API_BASE: &str = "https://api.github.com";

/// In-app "Send feedback" files issues against this repo regardless of which
/// project the user currently has open.
const FEEDBACK_OWNER: &str = "zebapy";
const FEEDBACK_REPO: &str = "switchyard";

// ── Credentials ──────────────────────────────────────────────────────────────

/// Every credential failure names both remedies, because neither source is a
/// silent fallback for the other.
const GH_NOT_FOUND: &str = "GitHub CLI (`gh`) isn't installed, or isn't on the app's PATH. Install it (`brew install gh`) and run `gh auth login`, or switch to app sign-in in Settings → GitHub.";
const GH_NOT_AUTHENTICATED: &str = "GitHub CLI isn't signed in. Run `gh auth login` in a terminal, or switch to app sign-in in Settings → GitHub.";
const APP_NOT_SIGNED_IN: &str = "Not signed in to GitHub. Open Settings → GitHub to sign in, or switch to the `gh` CLI.";

/// Cached token plus the source it came from. The polling commands
/// (`get_pr_info`, `github_pr_checks`) run every few seconds, so neither the
/// keychain nor a `gh` process is touched per call. Storing the source means a
/// hand-edited `settings.json` takes effect on the next call rather than at the
/// next launch.
struct CachedToken {
    source: GithubAuthSource,
    token: String,
}

static TOKEN_CACHE: Mutex<Option<CachedToken>> = Mutex::new(None);

fn auth_source() -> GithubAuthSource {
    crate::projects::load_settings().github_auth_source
}

fn read_token() -> Result<String, String> {
    let source = auth_source();
    if let Some(cached) = TOKEN_CACHE.lock().unwrap().as_ref() {
        if cached.source == source {
            return Ok(cached.token.clone());
        }
    }
    let token = match source {
        GithubAuthSource::GhCli => gh_auth_token()?,
        GithubAuthSource::App => stored_token()?,
    };
    *TOKEN_CACHE.lock().unwrap() = Some(CachedToken {
        source,
        token: token.clone(),
    });
    Ok(token)
}

fn forget_token() {
    *TOKEN_CACHE.lock().unwrap() = None;
}

fn stored_token() -> Result<String, String> {
    crate::token_store::get(TOKEN_STORE_SERVICE, TOKEN_STORE_ACCOUNT)
        .map_err(|_| APP_NOT_SIGNED_IN.to_string())
}

/// The token the local `gh` CLI holds. `gh` refreshes its own OAuth tokens, so
/// re-running this after a 401 picks up a rotated one.
fn gh_auth_token() -> Result<String, String> {
    let output = Command::new("gh")
        .args(["auth", "token"])
        .output()
        .map_err(|_| GH_NOT_FOUND.to_string())?;
    if !output.status.success() {
        return Err(GH_NOT_AUTHENTICATED.to_string());
    }
    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Err(GH_NOT_AUTHENTICATED.to_string());
    }
    Ok(token)
}

/// Installed `gh` version, for the settings readout. `None` when `gh` isn't on
/// the app's PATH.
fn gh_version() -> Option<String> {
    let output = Command::new("gh").arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    parse_gh_version(&String::from_utf8_lossy(&output.stdout))
}

/// `gh --version` opens with a line like `gh version 2.62.0 (2024-11-14)`.
fn parse_gh_version(stdout: &str) -> Option<String> {
    let version = stdout.lines().next()?.split_whitespace().nth(2)?;
    Some(version.to_string())
}

fn store_token(token: &str) -> Result<(), String> {
    crate::token_store::set(TOKEN_STORE_SERVICE, TOKEN_STORE_ACCOUNT, token)?;
    *TOKEN_CACHE.lock().unwrap() = Some(CachedToken {
        source: GithubAuthSource::App,
        token: token.to_string(),
    });
    Ok(())
}

// ── Device flow ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[serde(default = "default_interval")]
    interval: u64,
    expires_in: u64,
}

fn default_interval() -> u64 {
    5
}

/// Emitted to the frontend so it can show the code the user types on github.com.
#[derive(Clone, Serialize)]
struct DeviceCodeEvent {
    user_code: String,
    verification_uri: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    interval: Option<u64>,
}

/// Start the OAuth device flow. Emits `github:device_code` with the user code,
/// opens github.com in the browser, then polls until the user authorizes.
/// Returns the signed-in GitHub login on success.
#[tauri::command]
pub async fn github_login(app: AppHandle) -> Result<String, String> {
    let http = http_client().clone();

    // 1. Request a device + user code.
    let dc: DeviceCodeResponse = http
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[("client_id", CLIENT_ID), ("scope", SCOPE)])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // 2. Show the code to the user and open the verification page.
    app.emit(
        "github:device_code",
        DeviceCodeEvent {
            user_code: dc.user_code.clone(),
            verification_uri: dc.verification_uri.clone(),
        },
    )
    .map_err(|e| e.to_string())?;
    let _ = app.opener().open_url(dc.verification_uri.clone(), None::<&str>);

    // 3. Poll the token endpoint until authorized or expired.
    let mut interval = dc.interval.max(1);
    let mut waited = 0u64;
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
        waited += interval;
        if waited >= dc.expires_in {
            return Err("Sign-in code expired. Open Settings and try again.".into());
        }

        let tr: TokenResponse = http
            .post(TOKEN_URL)
            .header("Accept", "application/json")
            .form(&[
                ("client_id", CLIENT_ID),
                ("device_code", &dc.device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        if let Some(token) = tr.access_token {
            store_token(&token)?;
            let login = fetch_login(&http, &token).await.unwrap_or_default();
            let _ = app.emit("github:connected", &login);
            return Ok(login);
        }

        match tr.error.as_deref() {
            // Not authorized yet — keep waiting.
            Some("authorization_pending") => continue,
            // GitHub asks us to back off — obey the new interval.
            Some("slow_down") => {
                interval = tr.interval.unwrap_or(interval + 5);
                continue;
            }
            Some("access_denied") => return Err("Sign-in was cancelled on GitHub.".into()),
            Some("expired_token") => {
                return Err("Sign-in code expired. Open Settings and try again.".into())
            }
            Some(other) => return Err(format!("GitHub sign-in failed: {other}")),
            None => return Err("Unexpected response from GitHub during sign-in.".into()),
        }
    }
}

#[tauri::command]
pub fn github_logout() -> Result<(), String> {
    forget_token();
    crate::token_store::delete(TOKEN_STORE_SERVICE, TOKEN_STORE_ACCOUNT)
}

/// What each credential source currently offers, so Settings can show the live
/// state of both without the user having to guess which one is in play.
#[derive(Debug, Clone, Serialize)]
pub struct GithubAuthStatus {
    /// The configured source — the one every API call uses.
    pub source: GithubAuthSource,
    /// Installed `gh` version, `None` when the binary isn't on the app's PATH.
    pub gh_version: Option<String>,
    /// Login the `gh` token belongs to.
    pub gh_account: Option<String>,
    /// Why `gh` can't be used right now, phrased for the user.
    pub gh_error: Option<String>,
    pub app_signed_in: bool,
    pub app_account: Option<String>,
}

#[tauri::command]
pub async fn github_auth_status() -> Result<GithubAuthStatus, String> {
    let http = http_client();
    let (gh_account, gh_error) = match gh_auth_token() {
        Ok(token) => (fetch_login(http, &token).await, None),
        Err(e) => (None, Some(e)),
    };
    let app_token = stored_token().ok();
    let app_account = match &app_token {
        Some(token) => fetch_login(http, token).await,
        None => None,
    };
    Ok(GithubAuthStatus {
        source: auth_source(),
        gh_version: gh_version(),
        gh_account,
        gh_error,
        app_signed_in: app_token.is_some(),
        app_account,
    })
}

/// Re-probe the configured source after the user fixed things outside the app
/// (`gh auth login`, `gh auth switch`). Drops the cached token so the next call
/// re-reads it, and broadcasts `github:connected` when the source now works —
/// the worktree pickers and feedback form listen for that event.
#[tauri::command]
pub async fn github_recheck(app: AppHandle) -> Result<GithubAuthStatus, String> {
    forget_token();
    if let Ok(token) = read_token() {
        let login = fetch_login(http_client(), &token).await.unwrap_or_default();
        let _ = app.emit("github:connected", &login);
    }
    github_auth_status().await
}

/// Switch where GitHub credentials come from, then report the new state.
#[tauri::command]
pub async fn set_github_auth_source(
    app: AppHandle,
    source: GithubAuthSource,
) -> Result<GithubAuthStatus, String> {
    let mut settings = crate::projects::load_settings();
    settings.github_auth_source = source;
    crate::projects::save_settings(&settings)?;
    github_recheck(app).await
}

#[tauri::command]
pub fn github_is_connected() -> bool {
    read_token().is_ok()
}

/// The signed-in GitHub login (`@handle`), or `None` when not signed in.
#[tauri::command]
pub async fn github_account() -> Result<Option<String>, String> {
    let Ok(token) = read_token() else {
        return Ok(None);
    };
    Ok(fetch_login(http_client(), &token).await)
}

/// Login for a specific token — used to describe *each* credential source in
/// Settings, so it deliberately bypasses `read_token`.
async fn fetch_login(http: &reqwest::Client, token: &str) -> Option<String> {
    let v: serde_json::Value = authed(http.get(format!("{API_BASE}/user")), token)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    v["login"].as_str().map(|s| s.to_string())
}

// ── Authenticated REST helper ────────────────────────────────────────────────

fn authed(builder: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    builder
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
}

/// Send a request with the configured source's token. On a 401 the cached token
/// is dropped and the request is retried once — `gh` rotates its OAuth token
/// behind our back, so a stale cache is expected rather than exceptional. The
/// retry only happens when the re-read token actually differs, so a revoked
/// token fails on the first response instead of doubling every request.
async fn send_authed(
    make: impl Fn(&str) -> reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
    let token = read_token()?;
    let resp = make(&token).send().await.map_err(|e| e.to_string())?;
    if resp.status() != reqwest::StatusCode::UNAUTHORIZED {
        return Ok(resp);
    }

    forget_token();
    let fresh = read_token()?;
    if fresh == token {
        return Ok(resp);
    }
    make(&fresh).send().await.map_err(|e| e.to_string())
}

async fn api_get(http: &reqwest::Client, url: &str) -> Result<serde_json::Value, String> {
    send_authed(|token| authed(http.get(url), token))
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())
}

async fn api_post(
    http: &reqwest::Client,
    url: &str,
    body: &serde_json::Value,
) -> Result<(reqwest::StatusCode, serde_json::Value), String> {
    let resp = send_authed(|token| authed(http.post(url), token).json(body)).await?;
    let status = resp.status();
    let json = resp.json().await.unwrap_or(serde_json::Value::Null);
    Ok((status, json))
}

/// File a GitHub issue against the Switchyard repo on the signed-in user's
/// behalf — backs the in-app "Send feedback" form. Returns the new issue URL.
#[tauri::command]
pub async fn github_create_issue(
    title: String,
    body: String,
    labels: Vec<String>,
) -> Result<String, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Add a title before sending.".into());
    }
    let http = http_client().clone();
    let url = format!("{API_BASE}/repos/{FEEDBACK_OWNER}/{FEEDBACK_REPO}/issues");
    let payload = serde_json::json!({ "title": title, "body": body, "labels": labels });
    let (status, json) = api_post(&http, &url, &payload).await?;
    if !status.is_success() {
        let msg = json["message"].as_str().unwrap_or("Unknown error");
        return Err(format!(
            "GitHub couldn't create the issue ({status}): {msg}"
        ));
    }
    json["html_url"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "Issue created, but GitHub returned no link.".to_string())
}

// ── owner/repo + branch resolution (libgit2) ─────────────────────────────────

/// Parse `(owner, repo)` from an `origin` remote URL. Handles HTTPS, SSH and
/// `ssh://` forms, with or without a trailing `.git`.
fn repo_slug(path: &str) -> Option<(String, String)> {
    let repo = git2::Repository::open(path).ok()?;
    let remote = repo.find_remote("origin").ok()?;
    parse_slug(remote.url()?)
}

fn parse_slug(url: &str) -> Option<(String, String)> {
    let rest = url
        .split("github.com")
        .nth(1)?
        .trim_start_matches([':', '/']);
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut parts = rest.split('/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.trim_end_matches('/').to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

fn current_branch(path: &str) -> Option<String> {
    let repo = git2::Repository::open(path).ok()?;
    let head = repo.head().ok()?;
    head.shorthand().map(|s| s.to_string())
}

/// Turn arbitrary text into a git-branch-friendly slug: lowercase, runs of
/// non-alphanumeric chars collapse to a single '-', leading/trailing '-'
/// trimmed, then truncated to 40 chars (trailing '-' trimmed again).
fn slug(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.to_lowercase().chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    let mut result: String = trimmed.chars().take(40).collect();
    while result.ends_with('-') {
        result.pop();
    }
    result
}

// ── Data commands (drop-in replacements for the old `gh` shell-outs) ──────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrInfo {
    pub number: u64,
    pub state: String,
    pub ci_status: Option<String>,
    pub url: String,
    pub title: String,
    pub draft: bool,
    /// The branch the PR merges into (e.g. "main", or a parent branch when stacked).
    pub base_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhItem {
    pub id: String,
    pub title: String,
    pub sub: String,
    pub branch: String,
}

/// A richer open-PR row for the Pull requests view: enough to filter to the
/// signed-in user, match against local worktrees (by `branch`), and link out.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequestItem {
    pub number: u64,
    pub title: String,
    /// Head ref (the PR's branch) — matched against local worktree branches.
    pub branch: String,
    /// Author login, used by the client-side "only mine" filter.
    pub author: String,
    pub url: String,
    pub draft: bool,
    /// ISO-8601 last-updated timestamp from GitHub.
    pub updated_at: String,
}

/// PR associated with the repo's current branch, plus a rolled-up CI status.
#[tauri::command]
pub async fn get_pr_info(path: String) -> Result<Option<PrInfo>, String> {
    if read_token().is_err() {
        return Ok(None);
    }
    let Some((owner, repo)) = repo_slug(&path) else {
        return Ok(None);
    };
    let Some(branch) = current_branch(&path) else {
        return Ok(None);
    };

    let http = http_client().clone();
    let url = format!(
        "{API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=all&per_page=1"
    );
    let arr = api_get(&http, &url).await.unwrap_or(serde_json::Value::Null);
    let Some(pr) = arr.as_array().and_then(|a| a.first()) else {
        return Ok(None);
    };

    let number = pr["number"].as_u64().unwrap_or(0);
    let state = if pr["merged_at"].is_string() {
        "MERGED".to_string()
    } else {
        pr["state"].as_str().unwrap_or("UNKNOWN").to_uppercase()
    };
    let url = pr["html_url"].as_str().unwrap_or("").to_string();
    let title = pr["title"].as_str().unwrap_or("").to_string();
    let draft = pr["draft"].as_bool().unwrap_or(false);
    let base_branch = pr["base"]["ref"].as_str().unwrap_or("").to_string();
    let sha = pr["head"]["sha"].as_str().unwrap_or("").to_string();

    let ci_status = if sha.is_empty() {
        None
    } else {
        compute_ci(&http, &owner, &repo, &sha).await
    };

    Ok(Some(PrInfo {
        number,
        state,
        ci_status,
        url,
        title,
        draft,
        base_branch,
    }))
}

/// Roll up check-runs + legacy commit statuses for `sha` into
/// `passing` / `failing` / `pending` (matching the old `statusCheckRollup`
/// reduction), or `None` when there are no checks at all.
async fn compute_ci(
    http: &reqwest::Client,
    owner: &str,
    repo: &str,
    sha: &str,
) -> Option<String> {
    let mut any = false;
    let mut failing = false;
    let mut pending = false;

    // The check-runs and commit-status endpoints are independent — fetch both
    // concurrently rather than awaiting one after the other. This runs per PR on
    // every poll, so the saved round-trip compounds. (URLs are bound first so the
    // borrowed strings outlive the joined futures.)
    let check_runs_url = format!("{API_BASE}/repos/{owner}/{repo}/commits/{sha}/check-runs");
    let status_url = format!("{API_BASE}/repos/{owner}/{repo}/commits/{sha}/status");
    let (cr_res, st_res) = tokio::join!(
        api_get(http, &check_runs_url),
        api_get(http, &status_url),
    );

    if let Ok(cr) = cr_res {
        if let Some(runs) = cr["check_runs"].as_array() {
            for run in runs {
                any = true;
                if run["status"].as_str().unwrap_or("") != "completed" {
                    pending = true;
                    continue;
                }
                match run["conclusion"].as_str().unwrap_or("") {
                    "success" | "neutral" | "skipped" => {}
                    "" => pending = true,
                    _ => failing = true,
                }
            }
        }
    }

    if let Ok(st) = st_res {
        let total = st["total_count"].as_u64().unwrap_or(0);
        match st["state"].as_str().unwrap_or("") {
            "failure" | "error" => {
                any = true;
                failing = true;
            }
            "pending" if total > 0 => {
                any = true;
                pending = true;
            }
            "success" if total > 0 => any = true,
            _ => {}
        }
    }

    if !any {
        None
    } else if failing {
        Some("failing".to_string())
    } else if pending {
        Some("pending".to_string())
    } else {
        Some("passing".to_string())
    }
}

#[tauri::command]
pub async fn gh_list_prs(path: String) -> Result<Vec<GhItem>, String> {
    Ok(list_prs(&path).await.unwrap_or_default())
}

async fn list_prs(path: &str) -> Option<Vec<GhItem>> {
    read_token().ok()?;
    let (owner, repo) = repo_slug(path)?;
    let http = http_client().clone();
    let arr = api_get(
        &http,
        &format!("{API_BASE}/repos/{owner}/{repo}/pulls?state=open&per_page=30"),
    )
    .await
    .ok()?;
    let items = arr
        .as_array()?
        .iter()
        .map(|el| {
            let number = el["number"].as_u64().unwrap_or(0);
            let title = el["title"].as_str().unwrap_or("").to_string();
            let branch = el["head"]["ref"].as_str().unwrap_or("").to_string();
            let state = el["state"].as_str().unwrap_or("").to_lowercase();
            GhItem {
                id: format!("#{number}"),
                title,
                sub: format!("{branch} · {state}"),
                branch,
            }
        })
        .collect();
    Some(items)
}

/// Open PRs for the project's GitHub repo, richest-first (most recently updated),
/// for the Pull requests view. Unlike `gh_list_prs` (which feeds the worktree
/// modal's selector) this surfaces author, draft and url so the frontend can
/// filter to the signed-in user and link out. Errors propagate so the view can
/// distinguish "not signed in" / "not a GitHub repo" from an empty list.
#[tauri::command]
pub async fn gh_list_pull_requests(path: String) -> Result<Vec<PullRequestItem>, String> {
    read_token()?;
    let (owner, repo) = repo_slug(&path)
        .ok_or_else(|| "Not a GitHub repository (no github.com 'origin' remote).".to_string())?;
    let http = http_client().clone();
    let arr = api_get(
        &http,
        &format!("{API_BASE}/repos/{owner}/{repo}/pulls?state=open&per_page=50&sort=updated&direction=desc"),
    )
    .await?;
    let rows = arr.as_array().ok_or_else(|| {
        arr.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unexpected response from GitHub.")
            .to_string()
    })?;
    let items = rows
        .iter()
        .map(|el| PullRequestItem {
            number: el["number"].as_u64().unwrap_or(0),
            title: el["title"].as_str().unwrap_or("").to_string(),
            branch: el["head"]["ref"].as_str().unwrap_or("").to_string(),
            author: el["user"]["login"].as_str().unwrap_or("").to_string(),
            url: el["html_url"].as_str().unwrap_or("").to_string(),
            draft: el["draft"].as_bool().unwrap_or(false),
            updated_at: el["updated_at"].as_str().unwrap_or("").to_string(),
        })
        .collect();
    Ok(items)
}

#[tauri::command]
pub async fn gh_list_issues(path: String) -> Result<Vec<GhItem>, String> {
    Ok(list_issues(&path).await.unwrap_or_default())
}

async fn list_issues(path: &str) -> Option<Vec<GhItem>> {
    read_token().ok()?;
    let (owner, repo) = repo_slug(path)?;
    let http = http_client().clone();
    let arr = api_get(
        &http,
        &format!("{API_BASE}/repos/{owner}/{repo}/issues?state=open&per_page=30"),
    )
    .await
    .ok()?;
    let items = arr
        .as_array()?
        .iter()
        // The issues endpoint also returns PRs; skip anything with a pull_request field.
        .filter(|el| el.get("pull_request").is_none())
        .map(|el| {
            let number = el["number"].as_u64().unwrap_or(0);
            let title = el["title"].as_str().unwrap_or("").to_string();
            let sub = el["labels"]
                .as_array()
                .and_then(|labels| labels.first())
                .and_then(|label| label["name"].as_str())
                .unwrap_or("issue")
                .to_string();
            let branch = format!("{}-{}", number, slug(&title));
            GhItem {
                id: format!("#{number}"),
                title,
                sub,
                branch,
            }
        })
        .collect();
    Some(items)
}

#[tauri::command]
pub async fn gh_list_branches(path: String) -> Result<Vec<GhItem>, String> {
    Ok(list_branches(&path).await.unwrap_or_default())
}

async fn list_branches(path: &str) -> Option<Vec<GhItem>> {
    read_token().ok()?;
    let (owner, repo) = repo_slug(path)?;
    let http = http_client().clone();
    let arr = api_get(
        &http,
        &format!("{API_BASE}/repos/{owner}/{repo}/branches?per_page=30"),
    )
    .await
    .ok()?;
    let items = arr
        .as_array()?
        .iter()
        .take(30)
        .filter_map(|el| {
            let name = el["name"].as_str()?.to_string();
            Some(GhItem {
                id: name.clone(),
                title: name.clone(),
                sub: String::new(),
                branch: name,
            })
        })
        .collect();
    Some(items)
}

// ── PR checks + GitHub Actions job logs ──────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct CheckRun {
    pub name: String,
    /// queued | in_progress | completed
    pub status: String,
    /// success | failure | neutral | cancelled | skipped | timed_out | action_required | null
    pub conclusion: Option<String>,
    pub html_url: String,
    pub details_url: String,
    /// GitHub Actions job id parsed from `details_url` when this check is an
    /// Actions job (lets us fetch its log inline). `None` for other checks.
    pub job_id: Option<u64>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

/// Local HEAD commit sha, used as a fallback when the branch has no PR yet.
fn head_sha(path: &str) -> Option<String> {
    let repo = git2::Repository::open(path).ok()?;
    let sha = repo.head().ok()?.peel_to_commit().ok()?.id().to_string();
    Some(sha)
}

/// Pull the trailing Actions job id out of a check-run `details_url` shaped like
/// `https://github.com/owner/repo/actions/runs/123/job/456`.
fn parse_job_id(details_url: &str) -> Option<u64> {
    let tail = details_url.split("/job/").nth(1)?;
    let digits: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// Individual check-runs for the current branch's PR head commit, falling back
/// to the local HEAD commit when there is no PR yet.
#[tauri::command]
pub async fn github_pr_checks(path: String) -> Result<Vec<CheckRun>, String> {
    read_token()?;
    let (owner, repo) = repo_slug(&path).ok_or("No GitHub `origin` remote for this repo.")?;
    let http = http_client().clone();

    let pr_sha = if let Some(branch) = current_branch(&path) {
        let url = format!(
            "{API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=all&per_page=1"
        );
        api_get(&http, &url).await.ok().and_then(|arr| {
            arr.as_array()
                .and_then(|a| a.first())
                .and_then(|pr| pr["head"]["sha"].as_str().map(String::from))
        })
    } else {
        None
    };

    let Some(sha) = pr_sha.or_else(|| head_sha(&path)) else {
        return Ok(Vec::new());
    };

    let cr = api_get(
        &http,
        &format!("{API_BASE}/repos/{owner}/{repo}/commits/{sha}/check-runs"),
    )
    .await?;

    let mut out = Vec::new();
    if let Some(runs) = cr["check_runs"].as_array() {
        for run in runs {
            let details_url = run["details_url"].as_str().unwrap_or("").to_string();
            let html_url = run["html_url"].as_str().unwrap_or(&details_url).to_string();
            out.push(CheckRun {
                name: run["name"].as_str().unwrap_or("(unnamed check)").to_string(),
                status: run["status"].as_str().unwrap_or("").to_string(),
                conclusion: run["conclusion"].as_str().map(String::from),
                job_id: parse_job_id(&details_url),
                details_url,
                html_url,
                started_at: run["started_at"].as_str().map(String::from),
                completed_at: run["completed_at"].as_str().map(String::from),
            });
        }
    }
    Ok(out)
}

/// Plain-text log for a GitHub Actions job. The API 302-redirects to a
/// short-lived storage URL with the raw text, which reqwest follows.
#[tauri::command]
pub async fn github_check_log(path: String, job_id: u64) -> Result<String, String> {
    let (owner, repo) = repo_slug(&path).ok_or("No GitHub `origin` remote for this repo.")?;
    let http = http_client().clone();
    let url = format!("{API_BASE}/repos/{owner}/{repo}/actions/jobs/{job_id}/logs");
    let resp = send_authed(|token| authed(http.get(&url), token)).await?;
    if !resp.status().is_success() {
        return Err(format!(
            "Couldn't fetch logs (HTTP {}). This check may not be a GitHub Actions job — open it on GitHub instead.",
            resp.status()
        ));
    }
    resp.text().await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gh_version_line() {
        assert_eq!(
            parse_gh_version("gh version 2.62.0 (2024-11-14)\nhttps://github.com/cli/cli/releases"),
            Some("2.62.0".to_string())
        );
        assert_eq!(parse_gh_version(""), None);
    }

    #[test]
    fn parses_https_and_ssh_remotes() {
        let expected = Some(("octocat".to_string(), "Hello-World".to_string()));
        assert_eq!(parse_slug("https://github.com/octocat/Hello-World.git"), expected);
        assert_eq!(parse_slug("https://github.com/octocat/Hello-World"), expected);
        assert_eq!(parse_slug("git@github.com:octocat/Hello-World.git"), expected);
        assert_eq!(parse_slug("ssh://git@github.com/octocat/Hello-World.git"), expected);
        assert_eq!(parse_slug("https://gitlab.com/octocat/Hello-World.git"), None);
    }
}
