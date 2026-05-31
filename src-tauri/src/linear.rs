use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

// Set this to the client_id from your Linear OAuth application.
const CLIENT_ID: &str = "cc7e3e8f6e61ef3d7daf5ee1bb56b5c6";
const REDIRECT: &str = "http://127.0.0.1:8123/callback";
const PORT: u16 = 8123;
const SCOPES: &str = "read,write";
const KEYCHAIN_SERVICE: &str = "Switchyard";
const KEYCHAIN_ACCOUNT: &str = "linear_access_token";

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

    let res: serde_json::Value = reqwest::Client::new()
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
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .and_then(|entry| entry.set_password(token))
        .map_err(|e| {
            eprintln!("[linear] keychain write failed: {e}");
            e.to_string()
        })?;
    eprintln!("[linear] token stored in keychain");
    Ok(())
}

#[tauri::command]
pub async fn linear_query(query: String) -> Result<serde_json::Value, String> {
    let token = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .and_then(|entry| entry.get_password())
        .map_err(|_| "not connected to Linear".to_string())?;
    reqwest::Client::new()
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

#[tauri::command]
pub fn linear_logout() -> Result<(), String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .and_then(|entry| entry.delete_credential())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn linear_is_connected() -> bool {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .and_then(|entry| entry.get_password())
        .is_ok()
}
