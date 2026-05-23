use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::projects::load_settings;

// Wrapper script: attach to existing tmux session or create one, hide status bar.
// Args: $1 session name, $2 cwd, $3 inner command (empty = default shell)
const TMUX_LAUNCH_SCRIPT: &str = r#"
SESSION="$1"; CWD="$2"; CMD="$3"
if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach -t "$SESSION"
fi
if [ -n "$CMD" ]; then
  tmux new-session -d -s "$SESSION" -c "$CWD" "$CMD"
else
  tmux new-session -d -s "$SESSION" -c "$CWD"
fi
tmux set-option -t "$SESSION" status off >/dev/null 2>&1
exec tmux attach -t "$SESSION"
"#;

fn tmux_available() -> bool {
    std::process::Command::new("tmux")
        .arg("-V")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn tmux_session_name(id: &str) -> String {
    // tmux disallows '.' and ':' in session names; UUIDs are safe.
    format!("wip-{}", id)
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
    _kind: PaneKind,
}

pub struct PtyState {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
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

    // Inner command (what runs inside the pane). None = login shell.
    let inner_cmd: Option<String> = match (&kind, &command) {
        (PaneKind::Agent, _) => Some("claude".to_string()),
        (PaneKind::Lazygit, _) => Some("lazygit".to_string()),
        (PaneKind::Custom, Some(custom_cmd)) => Some(custom_cmd.clone()),
        _ => None,
    };

    let settings = load_settings();
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

    let instance = PtyInstance {
        child,
        master: pair.master,
        writer,
        _kind: kind,
    };

    state
        .instances
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), instance);

    // Spawn reader thread
    let read_id = id.clone();
    let instances_ref = state.instances.clone();
    std::thread::spawn(move || {
        eprintln!("[pty] reader thread started for {}", read_id);
        let mut buf = [0u8; 4096];
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
        // Clean up when PTY exits
        let _ = instances_ref.lock().map(|mut map| map.remove(&read_id));
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
