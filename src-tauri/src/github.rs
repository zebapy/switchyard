//! GitHub integration via OAuth **device flow** (no client secret, no loopback
//! server) with the access token stored in the OS keychain. Replaces the old
//! `gh` CLI shell-outs: the data commands (`get_pr_info`, `gh_list_*`) keep the
//! same names and return types so the frontend contract is unchanged.
//!
//! Mirrors the structure of `linear.rs` (raw `reqwest` + `keyring`).

use serde::{Deserialize, Serialize};
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

const KEYCHAIN_SERVICE: &str = "Switchyard";
const KEYCHAIN_ACCOUNT: &str = "github_access_token";
/// GitHub rejects API requests without a User-Agent header.
const USER_AGENT: &str = "Switchyard";

const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const API_BASE: &str = "https://api.github.com";

/// In-app "Send feedback" files issues against this repo regardless of which
/// project the user currently has open.
const FEEDBACK_OWNER: &str = "zebapy";
const FEEDBACK_REPO: &str = "switchyard";

// ── Token storage (OS keychain) ──────────────────────────────────────────────

/// Process-wide cache of the access token so we read the OS keychain only once
/// per launch. macOS prompts the user on every keychain *read* when the app's
/// code signature doesn't match the item's ACL — which happens on every dev
/// rebuild — so polling commands (`get_pr_info`, `github_pr_checks`) that fire
/// every few seconds would otherwise trigger a popup each time. Populated on
/// first read and after login; cleared on logout.
static TOKEN_CACHE: Mutex<Option<String>> = Mutex::new(None);

fn read_token() -> Result<String, String> {
    if let Some(token) = TOKEN_CACHE.lock().unwrap().clone() {
        return Ok(token);
    }
    let token = crate::token_store::get(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|_| "Not signed in to GitHub. Open Settings to sign in.".to_string())?;
    *TOKEN_CACHE.lock().unwrap() = Some(token.clone());
    Ok(token)
}

fn store_token(token: &str) -> Result<(), String> {
    crate::token_store::set(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, token)?;
    *TOKEN_CACHE.lock().unwrap() = Some(token.to_string());
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
    *TOKEN_CACHE.lock().unwrap() = None;
    crate::token_store::delete(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
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

async fn fetch_login(http: &reqwest::Client, token: &str) -> Option<String> {
    let v: serde_json::Value = api_get(http, token, &format!("{API_BASE}/user"))
        .await
        .ok()?;
    v["login"].as_str().map(|s| s.to_string())
}

// ── Authenticated REST helper ────────────────────────────────────────────────

async fn api_get(
    http: &reqwest::Client,
    token: &str,
    url: &str,
) -> Result<serde_json::Value, String> {
    http.get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}

async fn api_post(
    http: &reqwest::Client,
    token: &str,
    url: &str,
    body: &serde_json::Value,
) -> Result<(reqwest::StatusCode, serde_json::Value), String> {
    let resp = http
        .post(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let json = resp
        .json()
        .await
        .unwrap_or(serde_json::Value::Null);
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
    let token =
        read_token().map_err(|_| "Sign in to GitHub in Settings to send feedback.".to_string())?;
    let http = http_client().clone();
    let url = format!("{API_BASE}/repos/{FEEDBACK_OWNER}/{FEEDBACK_REPO}/issues");
    let payload = serde_json::json!({ "title": title, "body": body, "labels": labels });
    let (status, json) = api_post(&http, &token, &url, &payload).await?;
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhItem {
    pub id: String,
    pub title: String,
    pub sub: String,
    pub branch: String,
}

/// PR associated with the repo's current branch, plus a rolled-up CI status.
#[tauri::command]
pub async fn get_pr_info(path: String) -> Result<Option<PrInfo>, String> {
    let Ok(token) = read_token() else {
        return Ok(None);
    };
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
    let arr = api_get(&http, &token, &url).await.unwrap_or(serde_json::Value::Null);
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
    let sha = pr["head"]["sha"].as_str().unwrap_or("").to_string();

    let ci_status = if sha.is_empty() {
        None
    } else {
        compute_ci(&http, &token, &owner, &repo, &sha).await
    };

    Ok(Some(PrInfo {
        number,
        state,
        ci_status,
        url,
    }))
}

/// Roll up check-runs + legacy commit statuses for `sha` into
/// `passing` / `failing` / `pending` (matching the old `statusCheckRollup`
/// reduction), or `None` when there are no checks at all.
async fn compute_ci(
    http: &reqwest::Client,
    token: &str,
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
        api_get(http, token, &check_runs_url),
        api_get(http, token, &status_url),
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
    let token = read_token().ok()?;
    let (owner, repo) = repo_slug(path)?;
    let http = http_client().clone();
    let arr = api_get(
        &http,
        &token,
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

#[tauri::command]
pub async fn gh_list_issues(path: String) -> Result<Vec<GhItem>, String> {
    Ok(list_issues(&path).await.unwrap_or_default())
}

async fn list_issues(path: &str) -> Option<Vec<GhItem>> {
    let token = read_token().ok()?;
    let (owner, repo) = repo_slug(path)?;
    let http = http_client().clone();
    let arr = api_get(
        &http,
        &token,
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
    let token = read_token().ok()?;
    let (owner, repo) = repo_slug(path)?;
    let http = http_client().clone();
    let arr = api_get(
        &http,
        &token,
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
    let token = read_token()?;
    let (owner, repo) = repo_slug(&path).ok_or("No GitHub `origin` remote for this repo.")?;
    let http = http_client().clone();

    let pr_sha = if let Some(branch) = current_branch(&path) {
        let url = format!(
            "{API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=all&per_page=1"
        );
        api_get(&http, &token, &url).await.ok().and_then(|arr| {
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
        &token,
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
    let token = read_token()?;
    let (owner, repo) = repo_slug(&path).ok_or("No GitHub `origin` remote for this repo.")?;
    let http = http_client().clone();
    let resp = http
        .get(format!(
            "{API_BASE}/repos/{owner}/{repo}/actions/jobs/{job_id}/logs"
        ))
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| e.to_string())?;
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
    fn parses_https_and_ssh_remotes() {
        let expected = Some(("octocat".to_string(), "Hello-World".to_string()));
        assert_eq!(parse_slug("https://github.com/octocat/Hello-World.git"), expected);
        assert_eq!(parse_slug("https://github.com/octocat/Hello-World"), expected);
        assert_eq!(parse_slug("git@github.com:octocat/Hello-World.git"), expected);
        assert_eq!(parse_slug("ssh://git@github.com/octocat/Hello-World.git"), expected);
        assert_eq!(parse_slug("https://gitlab.com/octocat/Hello-World.git"), None);
    }
}
