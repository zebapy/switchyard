use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// Shared HTTP client — built once and reused so the connection pool and TLS
/// sessions survive across calls, instead of a fresh client per request.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

// Set this to the client_id from your Linear OAuth application.
const CLIENT_ID: &str = "cc7e3e8f6e61ef3d7daf5ee1bb56b5c6";
const REDIRECT: &str = "http://127.0.0.1:8123/callback";
const PORT: u16 = 8123;
const SCOPES: &str = "read,write";
const TOKEN_STORE_SERVICE: &str = "Switchyard";
const TOKEN_STORE_ACCOUNT: &str = "linear_access_token";

// ── Token storage (token_store file, cached in memory) ──────────────────────

/// See github.rs: cache the token so the token store is read once per launch
/// rather than on every `linear_query`.
static TOKEN_CACHE: Mutex<Option<String>> = Mutex::new(None);

fn read_token() -> Result<String, String> {
    if let Some(token) = TOKEN_CACHE.lock().unwrap().clone() {
        return Ok(token);
    }
    let token = crate::token_store::get(TOKEN_STORE_SERVICE, TOKEN_STORE_ACCOUNT)
        .map_err(|_| "not connected to Linear".to_string())?;
    *TOKEN_CACHE.lock().unwrap() = Some(token.clone());
    Ok(token)
}

fn store_token(token: &str) -> Result<(), String> {
    crate::token_store::set(TOKEN_STORE_SERVICE, TOKEN_STORE_ACCOUNT, token)?;
    *TOKEN_CACHE.lock().unwrap() = Some(token.to_string());
    Ok(())
}

fn clear_token() -> Result<(), String> {
    *TOKEN_CACHE.lock().unwrap() = None;
    crate::token_store::delete(TOKEN_STORE_SERVICE, TOKEN_STORE_ACCOUNT)
}

// Returns (verifier, challenge) for the PKCE flow.
fn pkce() -> (String, String) {
    let verifier = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

// Blocks until Linear redirects back to the loopback address; returns (code, state).
fn await_callback() -> Result<(String, String), String> {
    let server = tiny_http::Server::http(("127.0.0.1", PORT)).map_err(|e| e.to_string())?;
    let req = server.recv().map_err(|e| e.to_string())?;
    let url = req.url().to_string(); // /callback?code=..&state=..
    let query_string = url.split('?').nth(1).unwrap_or("");
    let mut code = String::new();
    let mut state = String::new();
    for pair in query_string.split('&') {
        match pair.split_once('=') {
            Some(("code", value)) => code = value.to_string(),
            Some(("state", value)) => state = value.to_string(),
            _ => {}
        }
    }
    let header = "Content-Type: text/html"
        .parse::<tiny_http::Header>()
        .map_err(|_| "failed to build response header".to_string())?;
    let _ = req.respond(
        tiny_http::Response::from_string("<h2>Linear connected. You can close this tab.</h2>")
            .with_header(header),
    );
    if code.is_empty() {
        return Err("no code in callback".into());
    }
    Ok((code, state))
}

#[tauri::command]
pub async fn linear_login(app: AppHandle) -> Result<(), String> {
    let (verifier, challenge) = pkce();
    let state = uuid::Uuid::new_v4().to_string();

    let auth_url = format!(
        "https://linear.app/oauth/authorize?response_type=code&client_id={CLIENT_ID}\
&redirect_uri={REDIRECT}&scope={SCOPES}&state={state}\
&code_challenge={challenge}&code_challenge_method=S256"
    );

    // Start the loopback listener BEFORE opening the browser.
    let listener = tokio::task::spawn_blocking(await_callback);
    app.opener()
        .open_url(auth_url, None::<&str>)
        .map_err(|e| e.to_string())?;

    let (code, got_state) = listener.await.map_err(|e| e.to_string())??;
    if got_state != state {
        return Err("state mismatch — possible CSRF".into());
    }

    let res: serde_json::Value = http_client()
        .post("https://api.linear.app/oauth/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", REDIRECT),
            ("client_id", CLIENT_ID),
            ("code_verifier", &verifier),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let token = res["access_token"].as_str().ok_or_else(|| {
        eprintln!("[linear] token exchange returned no access_token: {res}");
        format!("token exchange failed: {res}")
    })?;
    store_token(token).map_err(|e| {
        eprintln!("[linear] token store write failed: {e}");
        e
    })?;
    eprintln!("[linear] token stored");
    Ok(())
}

#[tauri::command]
pub async fn linear_query(query: String) -> Result<serde_json::Value, String> {
    let token = read_token()?;
    http_client()
        .post("https://api.linear.app/graphql")
        .header("Authorization", token) // Linear expects the raw token, no "Bearer" prefix.
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}

/// Issues for the worktree picker, mapped to the shared `GhItem` shape so the
/// frontend renders them like GitHub items. `all = false` lists the viewer's own
/// active issues; `all = true` lists every active issue across their teams.
#[tauri::command]
pub async fn linear_list_issues(all: bool) -> Result<Vec<crate::github::GhItem>, String> {
    let token = read_token()?;
    let query = if all {
        r#"{ issues(first: 50, filter: { state: { type: { nin: ["completed","canceled"] } } }, orderBy: updatedAt) { nodes { identifier title branchName state { name } assignee { displayName } } } }"#
    } else {
        r#"{ viewer { assignedIssues(first: 50, filter: { state: { type: { nin: ["completed","canceled"] } } }, orderBy: updatedAt) { nodes { identifier title branchName state { name } } } } }"#
    };

    let res: serde_json::Value = http_client()
        .post("https://api.linear.app/graphql")
        .header("Authorization", token) // Linear expects the raw token, no "Bearer" prefix.
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let nodes = if all {
        &res["data"]["issues"]["nodes"]
    } else {
        &res["data"]["viewer"]["assignedIssues"]["nodes"]
    };

    let items = nodes
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|node| {
                    let state = node["state"]["name"].as_str().unwrap_or("");
                    let assignee = node["assignee"]["displayName"].as_str().unwrap_or("");
                    let sub = if all && !assignee.is_empty() {
                        format!("{state} · {assignee}")
                    } else {
                        state.to_string()
                    };
                    crate::github::GhItem {
                        id: node["identifier"].as_str().unwrap_or("").to_string(),
                        title: node["title"].as_str().unwrap_or("").to_string(),
                        sub,
                        branch: node["branchName"].as_str().unwrap_or("").to_string(),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(items)
}

/// Resolve a Linear issue identifier (e.g. `FDY-123`) to its canonical web URL
/// by looking it up via the API. Returns `Ok(None)` when no matching issue
/// exists. Splitting the identifier into team key + number lets us filter
/// precisely instead of full-text searching.
#[tauri::command]
pub async fn linear_issue_url(identifier: String) -> Result<Option<String>, String> {
    let token = read_token()?;
    let (team_key, number) = identifier
        .rsplit_once('-')
        .ok_or_else(|| format!("invalid Linear identifier: {identifier}"))?;
    let number: u64 = number
        .parse()
        .map_err(|_| format!("invalid Linear identifier number: {identifier}"))?;
    let team_key = team_key.to_uppercase();

    let query = format!(
        r#"{{ issues(first: 1, filter: {{ number: {{ eq: {number} }}, team: {{ key: {{ eq: "{team_key}" }} }} }}) {{ nodes {{ url }} }} }}"#
    );

    let res: serde_json::Value = http_client()
        .post("https://api.linear.app/graphql")
        .header("Authorization", token) // Linear expects the raw token, no "Bearer" prefix.
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let url = res["data"]["issues"]["nodes"]
        .as_array()
        .and_then(|nodes| nodes.first())
        .and_then(|node| node["url"].as_str())
        .map(|s| s.to_string());
    Ok(url)
}

#[tauri::command]
pub fn linear_logout() -> Result<(), String> {
    clear_token()
}

#[tauri::command]
pub fn linear_is_connected() -> bool {
    read_token().is_ok()
}
