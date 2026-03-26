use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PaneKind {
    Agent,
    Shell,
    Lazygit,
    Custom,
}

struct PtyInstance {
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

    let mut cmd = match (&kind, &command) {
        (PaneKind::Agent, _) => {
            let mut c = CommandBuilder::new("claude");
            c
        }
        (PaneKind::Lazygit, _) => {
            let mut c = CommandBuilder::new("lazygit");
            c
        }
        (PaneKind::Custom, Some(custom_cmd)) => {
            let mut c = CommandBuilder::new(&shell);
            c.arg("-c");
            c.arg(custom_cmd);
            c
        }
        _ => {
            let mut c = CommandBuilder::new(&shell);
            c
        }
    };

    cmd.cwd(&cwd);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    // Drop slave - we only need the master side
    drop(pair.slave);
    drop(child);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| e.to_string())?;

    let instance = PtyInstance {
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
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
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
    instances.remove(&id);
    Ok(())
}
