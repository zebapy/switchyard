use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use crate::projects::{default_agent_command, load_settings};

// Wrapper script: attach to existing tmux session or create one, hide status bar.
// Args: $1 session name, $2 cwd, $3 inner command (empty = default shell)
//
// set-titles + set-titles-string make tmux forward the inner program's
// terminal title (OSC 0/2, e.g. Claude's chat rename) out to the host PTY, so
// xterm's onTitleChange fires and the sidebar pane name follows it. Without
// this, tmux swallows the title sequence and the rename never reaches the UI.
// The conditional emits an empty title while the pane title is still tmux's
// default (the hostname), so we don't clobber the pane's label until a program
// actually sets a title; the frontend ignores the empty value.
const TMUX_LAUNCH_SCRIPT: &str = r#"
SESSION="$1"; CWD="$2"; CMD="$3"
if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach -t "$SESSION"
fi
# Forward the zsh title-hook env into the new session explicitly: a pre-existing
# tmux server otherwise hands panes its own (stale) environment, so ZDOTDIR set
# at spawn time would never reach the pane's shell. Branches are spelled out so
# each -e value stays a single quoted arg under both zsh and bash.
if [ -n "$CMD" ]; then
  if [ -n "$ZDOTDIR" ]; then
    tmux new-session -d -s "$SESSION" -c "$CWD" -e "ZDOTDIR=$ZDOTDIR" -e "WIP_REAL_ZDOTDIR=$WIP_REAL_ZDOTDIR" "$CMD"
  else
    tmux new-session -d -s "$SESSION" -c "$CWD" "$CMD"
  fi
else
  if [ -n "$ZDOTDIR" ]; then
    tmux new-session -d -s "$SESSION" -c "$CWD" -e "ZDOTDIR=$ZDOTDIR" -e "WIP_REAL_ZDOTDIR=$WIP_REAL_ZDOTDIR"
  else
    tmux new-session -d -s "$SESSION" -c "$CWD"
  fi
fi
tmux set-option -t "$SESSION" status off >/dev/null 2>&1
tmux set-option -t "$SESSION" set-titles on >/dev/null 2>&1
tmux set-option -t "$SESSION" set-titles-string '#{?#{==:#T,#{host}},,#T}' >/dev/null 2>&1
# Let the inner shell pass our custom agent-exit OSC marker through to the host.
tmux set-option -g allow-passthrough on >/dev/null 2>&1
exec tmux attach -t "$SESSION"
"#;

// Custom OSC code emitted when an agent command exits and drops to a shell.
// Must match AGENT_EXIT_OSC in the frontend's useTerminal.ts.
const AGENT_EXIT_OSC: u32 = 8765;

/// Shell snippet that emits the agent-exit OSC marker. Inside tmux the raw OSC
/// would be swallowed, so when $TMUX is set it wraps the sequence in tmux's
/// passthrough DCS (requires `allow-passthrough on`, set in TMUX_LAUNCH_SCRIPT).
fn agent_exit_marker() -> String {
    format!(
        r#"if [ -n "$TMUX" ]; then printf '\033Ptmux;\033\033]{0};\007\033\\'; else printf '\033]{0};\007'; fi"#,
        AGENT_EXIT_OSC
    )
}

/// Build a private ZDOTDIR whose startup files forward to the user's real
/// dotfiles, then install a `preexec` hook that sets the terminal title (OSC 0)
/// to each command as it runs. The host PTY forwards that title to xterm's
/// onTitleChange, so the sidebar pane name follows the last command run.
///
/// Returned via env (ZDOTDIR + WIP_REAL_ZDOTDIR) so it is inherited by both the
/// launching shell and any shell it `exec`s (e.g. the post-agent shell).
fn zsh_integration_dir() -> std::io::Result<std::path::PathBuf> {
    let dir = std::env::temp_dir().join("wip-zsh-integration");
    std::fs::create_dir_all(&dir)?;

    // Forward each non-rc startup file to the user's real one so PATH/env stay intact.
    let forward = |file: &str| {
        format!(
            "[ -f \"${{WIP_REAL_ZDOTDIR:-$HOME}}/{0}\" ] && source \"${{WIP_REAL_ZDOTDIR:-$HOME}}/{0}\"\n",
            file
        )
    };
    std::fs::write(dir.join(".zshenv"), forward(".zshenv"))?;
    std::fs::write(dir.join(".zprofile"), forward(".zprofile"))?;
    std::fs::write(dir.join(".zlogin"), forward(".zlogin"))?;

    // .zshrc: load the user's real rc, then install title hooks. preexec sets
    // the title to the running command; precmd re-asserts that last command at
    // the prompt so it persists (frameworks like oh-my-zsh reset the title to
    // the cwd on precmd, and our hook runs last to win). Seed with the cwd.
    let zshrc = "[ -f \"${WIP_REAL_ZDOTDIR:-$HOME}/.zshrc\" ] && source \"${WIP_REAL_ZDOTDIR:-$HOME}/.zshrc\"\n\
autoload -Uz add-zsh-hook 2>/dev/null\n\
_wip_preexec() { _WIP_LAST_CMD=\"$1\"; printf '\\033]0;%s\\007' \"$1\" }\n\
_wip_precmd() { [ -n \"$_WIP_LAST_CMD\" ] && printf '\\033]0;%s\\007' \"$_WIP_LAST_CMD\" }\n\
add-zsh-hook preexec _wip_preexec 2>/dev/null\n\
add-zsh-hook precmd _wip_precmd 2>/dev/null\n\
printf '\\033]0;%s\\007' \"${PWD:t}\"\n";
    std::fs::write(dir.join(".zshrc"), zshrc)?;
    Ok(dir)
}

fn tmux_available() -> bool {
    // The tmux binary won't appear or disappear mid-session, so probe once and
    // cache it — this is hit on every pane spawn and every (polled) session list.
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        std::process::Command::new("tmux")
            .arg("-V")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

fn tmux_session_name(id: &str) -> String {
    // tmux disallows '.' and ':' in session names; UUIDs are safe.
    format!("wip-{}", id)
}

/// Wrap a string in single quotes for safe use in a `sh -c` command line.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub path: String,
    pub attached: bool,
    pub created: u64,
}

#[tauri::command]
pub fn list_tmux_sessions() -> Result<Vec<TmuxSessionInfo>, String> {
    if !tmux_available() {
        return Ok(Vec::new());
    }
    let output = std::process::Command::new("tmux")
        .args([
            "list-sessions",
            "-F",
            "#{session_name}\t#{session_path}\t#{session_attached}\t#{session_created}",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        // No sessions or tmux server not running -> empty list
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut sessions = Vec::new();
    for line in stdout.lines() {
        let mut parts = line.splitn(4, '\t');
        let name = parts.next().unwrap_or("").to_string();
        let path = parts.next().unwrap_or("").to_string();
        let attached = parts.next().map(|s| s != "0").unwrap_or(false);
        let created = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
        if !name.starts_with("wip-") {
            continue;
        }
        sessions.push(TmuxSessionInfo { name, path, attached, created });
    }
    Ok(sessions)
}

#[tauri::command]
pub fn kill_tmux_session(name: String) -> Result<(), String> {
    if !tmux_available() {
        return Ok(());
    }
    let _ = std::process::Command::new("tmux")
        .args(["kill-session", "-t", &name])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PaneKind {
    Agent,
    Shell,
    Lazygit,
    Custom,
}

struct PtyInstance {
    child: Box<dyn Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    // Distinguishes a pane's current instance from a stale, respawned one so a
    // dying reader thread never removes the live instance that replaced it.
    epoch: u64,
    _kind: PaneKind,
}

pub struct PtyState {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
    next_epoch: AtomicU64,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
            next_epoch: AtomicU64::new(0),
        }
    }
}

#[derive(Clone, Serialize)]
struct PtyOutputPayload {
    id: String,
    data: String, // base64 encoded
}

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    state: tauri::State<'_, PtyState>,
    id: String,
    kind: PaneKind,
    cwd: String,
    command: Option<String>,
    tmux_session: Option<String>,
    agent: Option<String>,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let settings = load_settings();

    // Inner command (what runs inside the pane). None = login shell.
    let inner_cmd: Option<String> = match (&kind, &command) {
        // The chosen agent command (e.g. "claude", "codex"), falling back to the
        // default agent from settings. A non-empty `command` seeds the agent with
        // a starting prompt (e.g. from the new-worktree modal).
        (PaneKind::Agent, prompt) => {
            let agent_cmd = agent
                .as_deref()
                .map(str::trim)
                .filter(|a| !a.is_empty())
                .map(|a| a.to_string())
                .unwrap_or_else(|| default_agent_command(&settings));
            match prompt {
                Some(p) if !p.trim().is_empty() => {
                    Some(format!("{} {}", agent_cmd, shell_quote(p)))
                }
                _ => Some(agent_cmd),
            }
        }
        (PaneKind::Lazygit, _) => Some("lazygit".to_string()),
        (PaneKind::Custom, Some(custom_cmd)) => Some(custom_cmd.clone()),
        _ => None,
    };

    // For agents, drop back to an interactive shell once the agent process
    // exits so the pane stays a live terminal instead of closing on quit. The
    // OSC marker (swallowed by the frontend's parser) tells the UI to re-label
    // the pane from agent to plain terminal.
    let inner_cmd = match &kind {
        PaneKind::Agent => inner_cmd
            .map(|c| format!("{}; {}; exec {} -l -i", c, agent_exit_marker(), shell)),
        _ => inner_cmd,
    };

    let use_tmux = settings.use_tmux && tmux_available();

    let mut cmd = if use_tmux {
        let session = tmux_session
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| tmux_session_name(&id));
        let mut c = CommandBuilder::new(&shell);
        c.arg("-c");
        c.arg(TMUX_LAUNCH_SCRIPT);
        c.arg("wip-tmux");
        c.arg(&session);
        c.arg(&cwd);
        c.arg(inner_cmd.clone().unwrap_or_default());
        c
    } else {
        let mut c = CommandBuilder::new(&shell);
        c.arg("-l");
        c.arg("-i");
        if let Some(inner) = &inner_cmd {
            c.arg("-c");
            c.arg(inner);
        }
        c
    };

    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");

    // zsh: install the last-command title hook via a private ZDOTDIR. Inherited
    // by any shell this one execs (e.g. the shell an agent drops to on quit).
    let shell_is_zsh = std::path::Path::new(&shell)
        .file_name()
        .map(|n| n == "zsh")
        .unwrap_or(false);
    if shell_is_zsh {
        if let Ok(dir) = zsh_integration_dir() {
            let real = std::env::var("ZDOTDIR")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_default();
            cmd.env("WIP_REAL_ZDOTDIR", real);
            cmd.env("ZDOTDIR", dir.to_string_lossy().to_string());
        }
    }

    eprintln!(
        "[pty] spawning {:?} in {:?} (shell={}, id={}, tmux={})",
        kind, cwd, shell, id, use_tmux
    );

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| {
            eprintln!("[pty] spawn error: {}", e);
            e.to_string()
        })?;

    // Drop slave - we only need the master side
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| e.to_string())?;

    let epoch = state.next_epoch.fetch_add(1, Ordering::Relaxed);

    let instance = PtyInstance {
        child,
        master: pair.master,
        writer,
        epoch,
        _kind: kind,
    };

    // Replace any existing instance for this id, killing the old child so a
    // respawn (e.g. React StrictMode remount) can't orphan a live shell.
    {
        let mut map = state.instances.lock().map_err(|e| e.to_string())?;
        if let Some(mut old) = map.insert(id.clone(), instance) {
            let _ = old.child.kill();
        }
    }

    // Spawn reader thread
    let read_id = id.clone();
    let instances_ref = state.instances.clone();
    std::thread::spawn(move || {
        eprintln!("[pty] reader thread started for {} (epoch {})", read_id, epoch);
        // Large buffer coalesces bursty output into far fewer IPC events: one
        // read drains up to 64 KiB of pending output instead of 4 KiB.
        let mut buf = [0u8; 65536];
        let mut total_bytes = 0usize;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    eprintln!("[pty] reader EOF for {} (total: {} bytes)", read_id, total_bytes);
                    break;
                }
                Ok(n) => {
                    total_bytes += n;
                    let encoded = BASE64.encode(&buf[..n]);
                    let _ = app.emit(
                        &format!("pty-output-{}", read_id),
                        PtyOutputPayload {
                            id: read_id.clone(),
                            data: encoded,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        // Clean up when PTY exits, but only if this instance is still the live
        // one — a respawn may have replaced it under the same id.
        let _ = instances_ref.lock().map(|mut map| {
            if map.get(&read_id).map(|i| i.epoch) == Some(epoch) {
                map.remove(&read_id);
            }
        });
    });

    Ok(())
}

#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyState>, id: String, data: Vec<u8>) -> Result<(), String> {
    let mut instances = state.instances.lock().map_err(|e| e.to_string())?;
    if let Some(instance) = instances.get_mut(&id) {
        instance
            .writer
            .write_all(&data)
            .map_err(|e| e.to_string())?;
        instance.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let instances = state.instances.lock().map_err(|e| e.to_string())?;
    if let Some(instance) = instances.get(&id) {
        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut instances = state.instances.lock().map_err(|e| e.to_string())?;
    if let Some(mut instance) = instances.remove(&id) {
        let _ = instance.child.kill();
    }
    Ok(())
}
