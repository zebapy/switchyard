use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub windows: Vec<WindowData>,
    pub active_window_id: Option<String>,
    pub sidebar_width: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowData {
    pub project_path: String,
    pub tabs: Vec<TabData>,
    pub active_tab_id: Option<String>,
    pub active_pane_id: Option<String>,
    pub last_active_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabData {
    pub id: String,
    pub label: String,
    pub pane_tree: serde_json::Value,
    /// True for the Workspace's preview tab. Absent in sessions written before
    /// preview tabs existed, so it defaults to a stuck tab.
    #[serde(default)]
    pub preview: bool,
}

fn session_path() -> PathBuf {
    crate::projects::config_dir().join("session.json")
}

#[tauri::command]
pub fn save_session(data: SessionData) -> Result<(), String> {
    let path = session_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_session() -> Result<(), String> {
    let path = session_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn load_session() -> Result<Option<SessionData>, String> {
    let path = session_path();
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let session: SessionData = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(Some(session))
}
