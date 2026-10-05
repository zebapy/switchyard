use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

use crate::projects::{default_agent_command, load_settings, AppSettings};

// Wrapper script: attach to existing tmux session or create one, hide status bar.
// Args: $1 session name, $2 cwd, $3 inner command (empty = default shell),
// $4 cols, $5 rows, $6 attach (1 = attach when done, 0 = leave detached).
//
// The size args let a session start at the pane's real geometry instead of
// tmux's 80x24 default, so an agent TUI paints once instead of reflowing on
// first attach. Detached mode is what `tmux_prewarm` uses to boot an agent
// before the user asks for it.
//
// set-titles + set-titles-string make tmux forward the inner program's
// terminal title (OSC 0/2, e.g. Claude's chat rename) out to the host PTY, so
// xterm's onTitleChange fires and the sidebar pane name follows it. Without
// this, tmux swallows the title sequence and the rename never reaches the UI.
// The conditional emits an empty title while the pane title is still tmux's
// default (the hostname), so we don't clobber the pane's label until a program
// actually sets a title; the frontend ignores the empty value.
const TMUX_LAUNCH_SCRIPT: &str = r#"
SESSION="$1"; CWD="$2"; CMD="$3"; COLS="${4:-80}"; ROWS="${5:-24}"; ATTACH="${6:-1}"
if tmux has-session -t "$SESSION" 2>/dev/null; then
  if [ "$ATTACH" = "1" ]; then exec tmux attach -t "$SESSION"; fi
  exit 0
fi
# Forward the zsh title-hook env into the new session explicitly: a pre-existing
# tmux server otherwise hands panes its own (stale) environment, so ZDOTDIR set
# at spawn time would never reach the pane's shell. Branches are spelled out so
# each -e value stays a single quoted arg under both zsh and bash.
if [ -n "$CMD" ]; then
  if [ -n "$ZDOTDIR" ]; then
    tmux new-session -d -s "$SESSION" -c "$CWD" -x "$COLS" -y "$ROWS" -e "ZDOTDIR=$ZDOTDIR" -e "WIP_REAL_ZDOTDIR=$WIP_REAL_ZDOTDIR" "$CMD"
  else
    tmux new-session -d -s "$SESSION" -c "$CWD" -x "$COLS" -y "$ROWS" "$CMD"
  fi
else
  if [ -n "$ZDOTDIR" ]; then
    tmux new-session -d -s "$SESSION" -c "$CWD" -x "$COLS" -y "$ROWS" -e "ZDOTDIR=$ZDOTDIR" -e "WIP_REAL_ZDOTDIR=$WIP_REAL_ZDOTDIR"
  else
    tmux new-session -d -s "$SESSION" -c "$CWD" -x "$COLS" -y "$ROWS"
  fi
fi
tmux set-option -t "$SESSION" status off >/dev/null 2>&1
tmux set-option -t "$SESSION" set-titles on >/dev/null 2>&1
tmux set-option -t "$SESSION" set-titles-string '#{?#{==:#T,#{host}},,#T}' >/dev/null 2>&1
# Let the inner shell pass our custom agent-exit OSC marker through to the host.
tmux set-option -g allow-passthrough on >/dev/null 2>&1
if [ "$ATTACH" = "1" ]; then exec tmux attach -t "$SESSION"; fi
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

/// Prefix of a prewarmed session: an agent booted ahead of the user asking for
/// one, waiting to be adopted by the next matching pane. Adoption renames it to
/// the pane's own `wip-<pane id>`, so a session keeping this prefix is one
/// nobody claimed.
const WARM_SESSION_PREFIX: &str = "wip-warm-";

fn tmux_has_session(name: &str) -> bool {
    std::process::Command::new("tmux")
        .args(["has-session", "-t", name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Hand a prewarmed session over to the pane that claimed it by renaming it to
/// the pane's canonical session name. After this the pane owns it like any
/// session it started itself — same name, same kill path — and the attach below
/// lands on an agent that is already booted.
fn adopt_warm_session(warm: &str, session: &str) {
    if warm == session || !warm.starts_with(WARM_SESSION_PREFIX) {
        return;
    }
    if !tmux_has_session(warm) || tmux_has_session(session) {
        return;
    }
    let _ = std::process::Command::new("tmux")
        .args(["rename-session", "-t", warm, session])
        .output();
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
        // Unclaimed prewarmed agents are the app's own scaffolding, not user
        // work: they must not show up as restorable sessions or block quitting.
        if !name.starts_with("wip-") || name.starts_with(WARM_SESSION_PREFIX) {
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

/// Kill every prewarmed session nobody adopted. Called on quit, and at startup
/// to reap what a crash left behind.
#[tauri::command]
pub fn kill_warm_sessions() -> Result<(), String> {
    if !tmux_available() {
        return Ok(());
    }
    let output = std::process::Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(()); // no server running
    }
    for name in String::from_utf8_lossy(&output.stdout).lines() {
        if name.starts_with(WARM_SESSION_PREFIX) {
            let _ = std::process::Command::new("tmux")
                .args(["kill-session", "-t", name])
                .output();
        }
    }
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
    // Each pane's writer is behind its own lock so pty_write only holds the
    // global instances lock long enough to clone this Arc — a slow/backpressured
    // write to one pane no longer blocks writes, resizes, or kills on every other.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
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

/// The command that runs inside a pane. `None` means a plain login shell.
/// `command` on an Agent pane is a starting prompt, not a program.
fn inner_command(
    kind: &PaneKind,
    command: Option<&str>,
    agent: Option<&str>,
    settings: &AppSettings,
    shell: &str,
) -> Option<String> {
    let base = match (kind, command) {
        // The chosen agent command (e.g. "claude", "codex"), falling back to the
        // default agent from settings. A non-empty `command` seeds the agent with
        // a starting prompt (e.g. from the new-worktree modal).
        (PaneKind::Agent, prompt) => {
            let agent_cmd = agent
                .map(str::trim)
                .filter(|a| !a.is_empty())
                .map(|a| a.to_string())
                .unwrap_or_else(|| default_agent_command(settings));
            match prompt {
                Some(p) if !p.trim().is_empty() => Some(format!("{} {}", agent_cmd, shell_quote(p))),
                _ => Some(agent_cmd),
            }
        }
        (PaneKind::Lazygit, _) => Some("lazygit".to_string()),
        (PaneKind::Custom, Some(custom_cmd)) => Some(custom_cmd.to_string()),
        _ => None,
    };

    // For agents, drop back to an interactive shell once the agent process
    // exits so the pane stays a live terminal instead of closing on quit. The
    // OSC marker (swallowed by the frontend's parser) tells the UI to re-label
    // the pane from agent to plain terminal.
    match kind {
        PaneKind::Agent => base.map(|c| format!("{}; {}; exec {} -l -i", c, agent_exit_marker(), shell)),
        _ => base,
    }
}

/// zsh only: the `ZDOTDIR` / `WIP_REAL_ZDOTDIR` pair that installs the
/// last-command title hook. Returned as env vars so every shell downstream —
/// including one an agent execs on exit — inherits it.
fn zsh_title_env(shell: &str) -> Option<(String, String)> {
    let is_zsh = std::path::Path::new(shell)
        .file_name()
        .map(|n| n == "zsh")
        .unwrap_or(false);
    if !is_zsh {
        return None;
    }
    let dir = zsh_integration_dir().ok()?;
    let real = std::env::var("ZDOTDIR")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    Some((real, dir.to_string_lossy().to_string()))
}

/// Boot an agent in a detached tmux session so a pane can adopt it already
/// running. Started while the user is still deciding (hovering a workspace,
/// sitting in one), it turns the agent's multi-second startup into an attach.
///
/// Best effort: a `false` return, or a session that dies before anyone claims
/// it, just means the next pane starts its agent the normal way.
#[tauri::command]
pub async fn tmux_prewarm(
    session: String,
    cwd: String,
    agent: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<bool, String> {
    let settings = load_settings();
    if !settings.prewarm_agent || !settings.use_tmux || !tmux_available() {
        return Ok(false);
    }
    if !session.starts_with(WARM_SESSION_PREFIX) {
        return Err(format!("prewarm session must start with {WARM_SESSION_PREFIX}"));
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let cmd = inner_command(&PaneKind::Agent, None, agent.as_deref(), &settings, &shell)
        .unwrap_or_default();
    let zsh_env = zsh_title_env(&shell);

    let started = tauri::async_runtime::spawn_blocking(move || {
        let mut c = std::process::Command::new(&shell);
        c.arg("-c")
            .arg(TMUX_LAUNCH_SCRIPT)
            .arg("wip-tmux")
            .arg(&session)
            .arg(&cwd)
            .arg(&cmd)
            .arg(cols.unwrap_or(80).to_string())
            .arg(rows.unwrap_or(24).to_string())
            .arg("0"); // create only — nothing attaches until a pane claims it
        if let Some((real, dir)) = zsh_env {
            c.env("WIP_REAL_ZDOTDIR", real);
            c.env("ZDOTDIR", dir);
        }
        c.env("TERM", "xterm-256color");
        c.status().map(|st| st.success()).unwrap_or(false)
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(started)
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
    rows: Option<u16>,
    cols: Option<u16>,
    warm_session: Option<String>,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    // Open at the pane's real geometry when the frontend knows it, so a TUI
    // paints once instead of drawing at 80x24 and reflowing on the first resize.
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let settings = load_settings();

    let inner_cmd = inner_command(
        &kind,
        command.as_deref(),
        agent.as_deref(),
        &settings,
        &shell,
    );

    let use_tmux = settings.use_tmux && tmux_available();

    let mut cmd = if use_tmux {
        let session = tmux_session
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| tmux_session_name(&id));
        // A prewarmed agent claimed by this pane becomes the pane's own session,
        // so the attach below finds it already booted.
        if let Some(warm) = warm_session.as_deref().filter(|w| !w.is_empty()) {
            adopt_warm_session(warm, &session);
        }
        let mut c = CommandBuilder::new(&shell);
        c.arg("-c");
        c.arg(TMUX_LAUNCH_SCRIPT);
        c.arg("wip-tmux");
        c.arg(&session);
        c.arg(&cwd);
        c.arg(inner_cmd.clone().unwrap_or_default());
        c.arg(cols.unwrap_or(80).to_string());
        c.arg(rows.unwrap_or(24).to_string());
        c.arg("1"); // attach once the session exists
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
    if let Some((real, dir)) = zsh_title_env(&shell) {
        cmd.env("WIP_REAL_ZDOTDIR", real);
        cmd.env("ZDOTDIR", dir);
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
        writer: Arc::new(Mutex::new(writer)),
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

    // Reader + emitter split. The reader does blocking reads and hands each
    // chunk to the emitter over a channel; the emitter coalesces whatever has
    // already queued into a single base64 IPC event. Bursty output (build logs,
    // agent spinners) collapses into far fewer events, and the encode+emit work
    // runs off the reader thread so it never stalls draining the PTY. Coalescing
    // only merges already-queued chunks (no waiting), so interactive echo keeps
    // its latency.
    let read_id = id.clone();
    let emit_id = id.clone();
    let instances_ref = state.instances.clone();
    let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();

    std::thread::spawn(move || {
        // Cap a coalesced batch so one burst can't build an unbounded payload.
        const MAX_BATCH: usize = 256 * 1024;
        while let Ok(first) = rx.recv() {
            let mut batch = first;
            while batch.len() < MAX_BATCH {
                match rx.try_recv() {
                    Ok(more) => batch.extend_from_slice(&more),
                    Err(_) => break, // nothing more queued (or sender gone)
                }
            }
            let encoded = BASE64.encode(&batch);
            let _ = app.emit(
                &format!("pty-output-{}", emit_id),
                PtyOutputPayload {
                    id: emit_id.clone(),
                    data: encoded,
                },
            );
        }
    });

    std::thread::spawn(move || {
        eprintln!("[pty] reader thread started for {} (epoch {})", read_id, epoch);
        // Large buffer coalesces bursty output: one read drains up to 64 KiB.
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
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break; // emitter gone
                    }
                }
                Err(_) => break,
            }
        }
        // Close the channel so the emitter thread exits.
        drop(tx);
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
    // Clone the pane's writer handle while briefly holding the global lock, then
    // release it before the blocking write so other panes aren't serialized.
    let writer = {
        let instances = state.instances.lock().map_err(|e| e.to_string())?;
        match instances.get(&id) {
            Some(instance) => instance.writer.clone(),
            None => return Ok(()),
        }
    };
    let mut writer = writer.lock().map_err(|e| e.to_string())?;
    writer.write_all(&data).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_with_agent(command: &str) -> AppSettings {
        let mut settings = AppSettings::default();
        settings.agents = vec![crate::projects::AgentConfig {
            id: "default".into(),
            name: "Default".into(),
            command: command.into(),
        }];
        settings
    }

    #[test]
    fn agent_pane_falls_back_to_the_default_agent() {
        let cmd = inner_command(
            &PaneKind::Agent,
            None,
            None,
            &settings_with_agent("claude"),
            "/bin/zsh",
        )
        .unwrap();
        assert!(cmd.starts_with("claude;"), "{cmd}");
        // Agents drop to a shell on exit so the pane stays usable.
        assert!(cmd.ends_with("exec /bin/zsh -l -i"), "{cmd}");
    }

    #[test]
    fn agent_prompt_is_quoted_as_a_single_argument() {
        let cmd = inner_command(
            &PaneKind::Agent,
            Some("fix the bug; rm -rf /"),
            Some("codex"),
            &settings_with_agent("claude"),
            "/bin/zsh",
        )
        .unwrap();
        assert!(cmd.starts_with("codex 'fix the bug; rm -rf /';"), "{cmd}");
    }

    #[test]
    fn a_prewarmed_agent_starts_with_no_prompt() {
        // What tmux_prewarm boots: the same agent, minus any starting prompt,
        // so any chat for that workspace can adopt it.
        let cmd = inner_command(
            &PaneKind::Agent,
            None,
            Some("claude"),
            &AppSettings::default(),
            "/bin/zsh",
        )
        .unwrap();
        assert!(cmd.starts_with("claude;"), "{cmd}");
    }

    #[test]
    fn a_cloud_session_task_is_passed_as_one_quoted_argument() {
        let cmd = inner_command(
            &PaneKind::Agent,
            Some("fix Bob's bug; rm -rf /"),
            Some("claude --cloud"),
            &AppSettings::default(),
            "/bin/zsh",
        )
        .unwrap();
        assert!(cmd.starts_with("claude --cloud 'fix Bob'\\''s bug; rm -rf /';"), "{cmd}");
    }

    #[test]
    fn shell_panes_run_a_plain_login_shell() {
        assert!(inner_command(&PaneKind::Shell, None, None, &AppSettings::default(), "/bin/zsh").is_none());
    }
}
