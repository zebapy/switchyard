//! Persistent store for OAuth access tokens.
//!
//! In **release** builds tokens live in the OS keychain (secure, survives
//! restarts). In **debug** builds the keychain is bypassed entirely: macOS
//! re-authorizes keychain access whenever the binary's code signature changes,
//! and every `cargo`/`tauri dev` rebuild produces a new ad-hoc signature, so the
//! keychain prompt fires constantly during development. Instead we keep tokens
//! in a plain JSON file under the config dir. That file is NOT secure — it
//! exists only to keep local development free of keychain popups.
//!
//! Both backends expose the same `get`/`set`/`delete` keyed by (service, account).

#[cfg(not(debug_assertions))]
pub fn get(service: &str, account: &str) -> Result<String, String> {
    keyring::Entry::new(service, account)
        .and_then(|entry| entry.get_password())
        .map_err(|e| e.to_string())
}

#[cfg(not(debug_assertions))]
pub fn set(service: &str, account: &str, token: &str) -> Result<(), String> {
    keyring::Entry::new(service, account)
        .and_then(|entry| entry.set_password(token))
        .map_err(|e| e.to_string())
}

#[cfg(not(debug_assertions))]
pub fn delete(service: &str, account: &str) -> Result<(), String> {
    keyring::Entry::new(service, account)
        .and_then(|entry| entry.delete_credential())
        .map_err(|e| e.to_string())
}

// ── Debug backend: plaintext JSON file, no keychain ──────────────────────────

#[cfg(debug_assertions)]
use std::collections::HashMap;
#[cfg(debug_assertions)]
use std::path::PathBuf;
#[cfg(debug_assertions)]
use std::sync::Mutex;

/// Serializes reads/writes so concurrent commands don't clobber the file.
#[cfg(debug_assertions)]
static DEV_LOCK: Mutex<()> = Mutex::new(());

#[cfg(debug_assertions)]
fn dev_store_path() -> PathBuf {
    crate::projects::config_dir().join("dev-tokens.json")
}

#[cfg(debug_assertions)]
fn read_dev_store() -> HashMap<String, String> {
    std::fs::read_to_string(dev_store_path())
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

#[cfg(debug_assertions)]
fn write_dev_store(map: &HashMap<String, String>) -> Result<(), String> {
    let path = dev_store_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[cfg(debug_assertions)]
pub fn get(service: &str, account: &str) -> Result<String, String> {
    let _guard = DEV_LOCK.lock().unwrap();
    read_dev_store()
        .get(&format!("{service}:{account}"))
        .cloned()
        .ok_or_else(|| "no token stored".to_string())
}

#[cfg(debug_assertions)]
pub fn set(service: &str, account: &str, token: &str) -> Result<(), String> {
    let _guard = DEV_LOCK.lock().unwrap();
    let mut map = read_dev_store();
    map.insert(format!("{service}:{account}"), token.to_string());
    write_dev_store(&map)
}

#[cfg(debug_assertions)]
pub fn delete(service: &str, account: &str) -> Result<(), String> {
    let _guard = DEV_LOCK.lock().unwrap();
    let mut map = read_dev_store();
    map.remove(&format!("{service}:{account}"));
    write_dev_store(&map)
}
