//! Persistent store for OAuth access tokens: a JSON file in the config dir
//! with owner-only (0600) permissions, keyed by (service, account).
//!
//! Deliberately NOT the macOS keychain. The app is ad-hoc signed
//! (`signingIdentity: "-"`), so every build has a unique code signature, and
//! keychain ACLs are bound to that signature — every rebuild and every
//! auto-update re-triggered the "Switchyard wants to use your confidential
//! information" password prompt, and "Always Allow" never stuck. A 0600 file
//! is the same model git-credential-store, gh, npm, and the AWS CLI use:
//! protected from other users by filesystem permissions, readable by
//! processes running as the owner. Tokens are revocable, scoped API tokens.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// Serializes reads/writes so concurrent commands don't clobber the file.
static STORE_LOCK: Mutex<()> = Mutex::new(());

fn store_path() -> PathBuf {
    crate::projects::config_dir().join("tokens.json")
}

/// Pre-token-store-unification path; see `migrate_legacy_dev_store`.
fn legacy_dev_store_path() -> PathBuf {
    crate::projects::config_dir().join("dev-tokens.json")
}

/// Debug builds used to write `dev-tokens.json`; rename it on first read so
/// existing dev tokens survive the switch to the unified store.
fn migrate_legacy_dev_store() {
    let legacy = legacy_dev_store_path();
    let current = store_path();
    if legacy.exists() && !current.exists() {
        let _ = std::fs::rename(&legacy, &current);
        let _ = restrict_to_owner(&current);
    }
}

fn read_store() -> HashMap<String, String> {
    migrate_legacy_dev_store();
    std::fs::read_to_string(store_path())
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

fn write_store(map: &HashMap<String, String>) -> Result<(), String> {
    let path = store_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    restrict_to_owner(&path)
}

/// chmod 0600 — tokens readable by the owning user only.
#[cfg(unix)]
fn restrict_to_owner(path: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &std::path::Path) -> Result<(), String> {
    Ok(())
}

pub fn get(service: &str, account: &str) -> Result<String, String> {
    let _guard = STORE_LOCK.lock().unwrap();
    read_store()
        .get(&format!("{service}:{account}"))
        .cloned()
        .ok_or_else(|| "no token stored".to_string())
}

pub fn set(service: &str, account: &str, token: &str) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().unwrap();
    let mut map = read_store();
    map.insert(format!("{service}:{account}"), token.to_string());
    write_store(&map)
}

pub fn delete(service: &str, account: &str) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().unwrap();
    let mut map = read_store();
    map.remove(&format!("{service}:{account}"));
    write_store(&map)
}
