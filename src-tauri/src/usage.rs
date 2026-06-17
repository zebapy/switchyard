use serde::Serialize;
use std::fs;
use std::path::PathBuf;

/// Usage for a single rate-limit window (Claude Code subscription limits).
#[derive(Debug, Clone, Serialize)]
pub struct UsageWindow {
    pub used_percentage: f64,
    /// Unix epoch seconds when this window resets, if known.
    pub resets_at: Option<i64>,
}

/// Claude Code subscription usage: the rolling 5-hour ("session") window and
/// the rolling 7-day ("week") window.
#[derive(Debug, Clone, Serialize)]
pub struct ClaudeUsage {
    pub session: Option<UsageWindow>,
    pub week: Option<UsageWindow>,
}

/// Path to the JSON Claude Code writes for its status line each turn. It holds
/// the freshest `rate_limits` data without us needing the Anthropic API.
fn statusline_input_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("statusline-last-input.json")
}

fn parse_window(value: &serde_json::Value) -> Option<UsageWindow> {
    let used_percentage = value.get("used_percentage")?.as_f64()?;
    let resets_at = value.get("resets_at").and_then(serde_json::Value::as_i64);
    Some(UsageWindow {
        used_percentage,
        resets_at,
    })
}

/// Read the latest Claude Code subscription usage from the status-line input
/// file. Returns empty windows when the file is missing (e.g. no session run
/// yet) rather than erroring.
#[tauri::command]
pub fn get_claude_usage() -> Result<ClaudeUsage, String> {
    let path = statusline_input_path();
    if !path.exists() {
        return Ok(ClaudeUsage {
            session: None,
            week: None,
        });
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let rate_limits = &json["rate_limits"];
    Ok(ClaudeUsage {
        session: parse_window(&rate_limits["five_hour"]),
        week: parse_window(&rate_limits["seven_day"]),
    })
}
