//! Recover the user's login-shell `PATH` when the app is launched from Finder
//! or the Dock.
//!
//! launchd hands GUI apps a bare `PATH` (`/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`),
//! so anything installed by Homebrew, mise, nvm, etc. is invisible to the app and
//! to every PTY it spawns. That silently disables tmux (`tmux_available()` probes
//! the binary and finds nothing), and breaks agent commands like `claude` and
//! `lazygit` inside tmux panes, which inherit this process's environment rather
//! than a login shell's.
//!
//! Launching from a terminal (`pnpm tauri dev`) already inherits a full `PATH`,
//! which is why the problem only shows up in the installed app.

use std::process::Command;

/// The entries launchd seeds a GUI process with. If `PATH` contains nothing
/// beyond these, no login shell has contributed to it yet.
const LAUNCHD_DEFAULT_ENTRIES: [&str; 6] = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    "/opt/X11/bin",
];

/// Directories to fall back on when the login shell can't be probed.
const FALLBACK_ENTRIES: [&str; 3] = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"];

/// Delimiter around the printed `PATH` so shell rc output (banners, motd,
/// prompt escapes) can be stripped from the probe's stdout.
const MARKER: &str = "__SWITCHYARD_PATH__";

/// Replace this process's `PATH` with the login shell's when launchd gave us the
/// bare default. Must run before any PTY is spawned or any binary is probed —
/// `tmux_available()` caches its answer on first call.
pub fn hydrate_path_from_login_shell() {
    let current = std::env::var("PATH").unwrap_or_default();
    if !is_launchd_default(&current) {
        return;
    }

    let resolved = login_shell_path().unwrap_or_else(|| {
        eprintln!("[shell_env] login shell PATH probe failed; using fallback dirs");
        FALLBACK_ENTRIES.join(":")
    });

    let merged = merge_paths(&resolved, &current);
    eprintln!("[shell_env] PATH hydrated from login shell: {merged}");
    std::env::set_var("PATH", merged);
}

fn is_launchd_default(path: &str) -> bool {
    path.split(':')
        .filter(|entry| !entry.is_empty())
        .all(|entry| LAUNCHD_DEFAULT_ENTRIES.contains(&entry))
}

/// Ask the user's login shell for its `PATH`. `-l` loads the profile files and
/// `-i` loads the interactive rc (where `PATH` is commonly set for zsh users).
fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let script = format!("printf '{MARKER}%s{MARKER}' \"$PATH\"");
    let output = Command::new(&shell).args(["-lic", &script]).output().ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let path = stdout.split(MARKER).nth(1)?.trim();
    if path.is_empty() {
        return None;
    }
    Some(path.to_string())
}

/// Login-shell entries first, then anything launchd gave us that the shell
/// didn't already list, so no directory is lost.
fn merge_paths(primary: &str, secondary: &str) -> String {
    let mut merged: Vec<&str> = Vec::new();
    for entry in primary.split(':').chain(secondary.split(':')) {
        if !entry.is_empty() && !merged.contains(&entry) {
            merged.push(entry);
        }
    }
    merged.join(":")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launchd_default_is_detected() {
        assert!(is_launchd_default("/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"));
        assert!(is_launchd_default("/usr/bin:/bin"));
    }

    #[test]
    fn enriched_path_is_left_alone() {
        assert!(!is_launchd_default(
            "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        ));
    }

    #[test]
    fn merge_keeps_login_order_and_drops_duplicates() {
        let merged = merge_paths("/opt/homebrew/bin:/usr/bin", "/usr/bin:/sbin");
        assert_eq!(merged, "/opt/homebrew/bin:/usr/bin:/sbin");
    }
}
