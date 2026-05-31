use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub const SETTINGS_SCHEMA_VERSION: u32 = 1;

fn default_true() -> bool {
    true
}

fn default_schema_version() -> u32 {
    SETTINGS_SCHEMA_VERSION
}

fn default_schema_ref() -> String {
    "./settings.schema.json".to_string()
}

/// One configured AI coding agent. The agent list is ordered by preference;
/// the first entry is the default used wherever a new agent session is started
/// without an explicit choice.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AgentConfig {
    /// Stable identifier (e.g. "claude"). Used as a React key and for de-duping.
    pub id: String,
    /// Display name shown in menus (e.g. "Claude").
    pub name: String,
    /// Command run in the pane to launch the agent (e.g. "claude").
    pub command: String,
}

fn default_agents() -> Vec<AgentConfig> {
    vec![AgentConfig {
        id: "claude".to_string(),
        name: "Claude".to_string(),
        command: "claude".to_string(),
    }]
}

/// Command for the default (first) configured agent, falling back to "claude"
/// when the list is empty.
pub fn default_agent_command(settings: &AppSettings) -> String {
    settings
        .agents
        .first()
        .map(|a| a.command.clone())
        .unwrap_or_else(|| "claude".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[schemars(title = "AppSettings", description = "User settings for the cc-tui app.")]
pub struct AppSettings {
    /// Path to the JSON Schema describing this file. Lets editors validate it.
    #[serde(rename = "$schema", default = "default_schema_ref")]
    pub schema_ref: String,
    /// Schema version. Bumped when fields change in a backwards-incompatible way.
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    /// Default parent folder shown when creating a new project.
    #[serde(default)]
    pub scan_root: String,
    /// Absolute paths of folders pinned in the project tree.
    #[serde(default)]
    pub added_projects: Vec<String>,
    /// Whether to wrap PTY sessions in tmux for persistence across restarts.
    #[serde(default = "default_true")]
    pub use_tmux: bool,
    /// Whether to show desktop notifications when an agent needs input or finishes a turn.
    #[serde(default = "default_true")]
    pub desktop_notifications: bool,
    /// Per-project list of package.json absolute paths to show in the Scripts section.
    #[serde(default)]
    pub project_scripts: HashMap<String, Vec<String>>,
    /// Configured AI agents, ordered by preference. First entry is the default.
    #[serde(default = "default_agents")]
    pub agents: Vec<AgentConfig>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_ref: default_schema_ref(),
            schema_version: SETTINGS_SCHEMA_VERSION,
            scan_root: String::new(),
            added_projects: Vec::new(),
            use_tmux: true,
            desktop_notifications: true,
            project_scripts: HashMap::new(),
            agents: default_agents(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub is_git: bool,
    /// If this project is a git worktree, the path of the main worktree (parent project)
    pub worktree_parent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitInfo {
    pub branch: Option<String>,
    pub worktrees: Vec<WorktreeInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
    /// Unix timestamp (seconds) of the HEAD commit, or None if unavailable.
    pub last_commit_unix: Option<i64>,
    /// Uncommitted added lines (HEAD tree → workdir, staged + unstaged).
    pub added: i64,
    /// Uncommitted deleted lines (HEAD tree → workdir, staged + unstaged).
    pub deleted: i64,
}

fn head_commit_time(repo: &git2::Repository) -> Option<i64> {
    let head = repo.head().ok()?;
    let commit = head.peel_to_commit().ok()?;
    Some(commit.time().seconds())
}

/// Count uncommitted added/deleted lines from the HEAD tree to the workdir
/// (including staged and unstaged changes). Returns (0, 0) on failure.
fn diff_stats(repo: &git2::Repository) -> (i64, i64) {
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut opts = git2::DiffOptions::new();
    let diff = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts));
    if let Ok(d) = diff {
        if let Ok(stats) = d.stats() {
            return (stats.insertions() as i64, stats.deletions() as i64);
        }
    }
    (0, 0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrInfo {
    pub number: u64,
    pub state: String,
    pub ci_status: Option<String>,
    pub url: String,
}

fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("~/.config"))
        .join("cc-tui")
}

fn ensure_config_dir() -> std::io::Result<PathBuf> {
    let dir = config_dir();
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Detect if a .git file points to a worktree and return the parent repo's workdir path.
/// A linked worktree's .git file contains: `gitdir: /path/to/parent/.git/worktrees/<name>`
fn detect_worktree_parent(git_file: &Path) -> Option<String> {
    let content = fs::read_to_string(git_file).ok()?;
    let gitdir = content.trim().strip_prefix("gitdir: ")?;
    let gitdir_path = PathBuf::from(gitdir);

    // Expected structure: <parent>/.git/worktrees/<name>
    // Walk up to find the .git directory, then get the parent repo workdir
    let mut ancestor = gitdir_path.as_path();
    loop {
        if ancestor.file_name().map(|n| n == "worktrees").unwrap_or(false) {
            let dot_git = ancestor.parent()?; // the .git directory
            if dot_git.file_name().map(|n| n == ".git").unwrap_or(false) {
                let parent_workdir = dot_git.parent()?;
                return Some(parent_workdir.to_string_lossy().to_string());
            }
        }
        ancestor = ancestor.parent()?;
    }
}

#[tauri::command(async)]
pub fn scan_projects(root_dir: String) -> Result<Vec<ProjectInfo>, String> {
    let root = Path::new(&root_dir);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", root_dir));
    }

    let mut projects = Vec::new();
    let entries = fs::read_dir(root).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Skip hidden directories
            if name.starts_with('.') {
                continue;
            }

            let git_path = path.join(".git");
            let is_git = git_path.exists();

            // Detect if this is a linked worktree: .git is a file, not a directory
            let worktree_parent = if is_git && git_path.is_file() {
                detect_worktree_parent(&git_path)
            } else {
                None
            };

            projects.push(ProjectInfo {
                name,
                path: path.to_string_lossy().to_string(),
                is_git,
                worktree_parent,
            });
        }
    }

    projects.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(projects)
}

#[tauri::command(async)]
pub fn get_git_info(path: String) -> Result<GitInfo, String> {
    let repo = git2::Repository::discover(&path).map_err(|e| e.to_string())?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let mut worktrees = Vec::new();

    // Main worktree
    let main_path = repo
        .workdir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let main_last_commit = head_commit_time(&repo);
    let (main_added, main_deleted) = diff_stats(&repo);
    worktrees.push(WorktreeInfo {
        path: main_path,
        branch: branch.clone(),
        is_main: true,
        last_commit_unix: main_last_commit,
        added: main_added,
        deleted: main_deleted,
    });

    // Additional worktrees
    if let Ok(wt_names) = repo.worktrees() {
        for name in wt_names.iter().flatten() {
            if let Ok(wt) = repo.find_worktree(name) {
                let wt_path = wt.path().to_string_lossy().to_string();
                let (wt_branch, wt_last_commit, wt_added, wt_deleted) =
                    git2::Repository::open(wt.path())
                        .ok()
                        .map(|r| {
                            let branch = r
                                .head()
                                .ok()
                                .and_then(|h| h.shorthand().map(|s| s.to_string()));
                            let last = head_commit_time(&r);
                            let (added, deleted) = diff_stats(&r);
                            (branch, last, added, deleted)
                        })
                        .unwrap_or((None, None, 0, 0));
                worktrees.push(WorktreeInfo {
                    path: wt_path,
                    branch: wt_branch,
                    is_main: false,
                    last_commit_unix: wt_last_commit,
                    added: wt_added,
                    deleted: wt_deleted,
                });
            }
        }
    }

    Ok(GitInfo { branch, worktrees })
}

#[tauri::command(async)]
pub fn get_pr_info(path: String) -> Result<Option<PrInfo>, String> {
    // Use `gh` CLI to get PR info
    let output = std::process::Command::new("gh")
        .args([
            "pr", "view", "--json", "number,state,url,statusCheckRollup",
        ])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;

    let number = json["number"].as_u64().unwrap_or(0);
    let state = json["state"].as_str().unwrap_or("UNKNOWN").to_string();
    let url = json["url"].as_str().unwrap_or("").to_string();

    let ci_status = json["statusCheckRollup"]
        .as_array()
        .map(|checks| {
            if checks.iter().all(|c| c["conclusion"] == "SUCCESS") {
                "passing".to_string()
            } else if checks.iter().any(|c| c["conclusion"] == "FAILURE") {
                "failing".to_string()
            } else {
                "pending".to_string()
            }
        });

    Ok(Some(PrInfo {
        number,
        state,
        ci_status,
        url,
    }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhItem {
    pub id: String,
    pub title: String,
    pub sub: String,
    pub branch: String,
}

/// Turn arbitrary text into a git-branch-friendly slug: lowercase, runs of
/// non-alphanumeric chars collapse to a single '-', leading/trailing '-'
/// trimmed, then truncated to 40 chars (trailing '-' trimmed again).
fn slug(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.to_lowercase().chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    let mut result: String = trimmed.chars().take(40).collect();
    while result.ends_with('-') {
        result.pop();
    }
    result
}

/// Run a `gh` subcommand in `path` and parse its stdout as a JSON array.
/// Returns an empty vec if `gh` is missing or the command exits non-zero.
fn gh_json_array(path: &str, args: &[&str]) -> Vec<serde_json::Value> {
    let output = std::process::Command::new("gh")
        .args(args)
        .current_dir(path)
        .output();
    let output = match output {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    if !output.status.success() {
        return Vec::new();
    }
    let json: serde_json::Value = match serde_json::from_slice(&output.stdout) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    json.as_array().cloned().unwrap_or_default()
}

#[tauri::command(async)]
pub fn gh_list_prs(path: String) -> Result<Vec<GhItem>, String> {
    let items = gh_json_array(
        &path,
        &[
            "pr",
            "list",
            "--json",
            "number,title,headRefName,state",
            "--limit",
            "30",
        ],
    )
    .into_iter()
    .map(|el| {
        let number = el.get("number").and_then(|v| v.as_u64()).unwrap_or(0);
        let title = el
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let branch = el
            .get("headRefName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let state = el
            .get("state")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_lowercase();
        GhItem {
            id: format!("#{}", number),
            title,
            sub: format!("{} · {}", branch, state),
            branch,
        }
    })
    .collect();
    Ok(items)
}

#[tauri::command(async)]
pub fn gh_list_issues(path: String) -> Result<Vec<GhItem>, String> {
    let items = gh_json_array(
        &path,
        &["issue", "list", "--json", "number,title,labels", "--limit", "30"],
    )
    .into_iter()
    .map(|el| {
        let number = el.get("number").and_then(|v| v.as_u64()).unwrap_or(0);
        let title = el
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let sub = el
            .get("labels")
            .and_then(|v| v.as_array())
            .and_then(|labels| labels.first())
            .and_then(|label| label.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("issue")
            .to_string();
        let branch = format!("{}-{}", number, slug(&title));
        GhItem {
            id: format!("#{}", number),
            title,
            sub,
            branch,
        }
    })
    .collect();
    Ok(items)
}

#[tauri::command(async)]
pub fn gh_list_branches(path: String) -> Result<Vec<GhItem>, String> {
    let items = gh_json_array(&path, &["api", "repos/{owner}/{repo}/branches"])
        .into_iter()
        .take(30)
        .filter_map(|el| {
            let name = el.get("name").and_then(|v| v.as_str())?.to_string();
            Some(GhItem {
                id: name.clone(),
                title: name.clone(),
                sub: String::new(),
                branch: name,
            })
        })
        .collect();
    Ok(items)
}

#[tauri::command]
pub fn get_pinned_projects() -> Result<Vec<String>, String> {
    let path = config_dir().join("pins.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_pin(project_path: String) -> Result<Vec<String>, String> {
    let config = ensure_config_dir().map_err(|e| e.to_string())?;
    let pins_file = config.join("pins.json");

    let mut pins: Vec<String> = if pins_file.exists() {
        let data = fs::read_to_string(&pins_file).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    if let Some(pos) = pins.iter().position(|p| p == &project_path) {
        pins.remove(pos);
    } else {
        pins.push(project_path);
    }

    let data = serde_json::to_string_pretty(&pins).map_err(|e| e.to_string())?;
    fs::write(&pins_file, data).map_err(|e| e.to_string())?;

    Ok(pins)
}

#[tauri::command(async)]
pub fn create_worktree(repo_path: String, branch_name: String) -> Result<String, String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let worktrees_dir = Path::new(&repo_path).join(".claude").join("worktrees");
    fs::create_dir_all(&worktrees_dir).map_err(|e| e.to_string())?;
    let worktree_path = worktrees_dir.join(&branch_name);

    repo.worktree(&branch_name, &worktree_path, None)
        .map_err(|e| e.to_string())?;

    Ok(worktree_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_project(parent_dir: String, name: String) -> Result<ProjectInfo, String> {
    let project_path = Path::new(&parent_dir).join(&name);
    if project_path.exists() {
        return Err(format!("Directory '{}' already exists", name));
    }

    fs::create_dir_all(&project_path).map_err(|e| e.to_string())?;

    // git init
    git2::Repository::init(&project_path).map_err(|e| e.to_string())?;

    Ok(ProjectInfo {
        name,
        path: project_path.to_string_lossy().to_string(),
        is_git: true,
        worktree_parent: None,
    })
}

#[tauri::command(async)]
pub fn delete_worktree(repo_path: String, name: String) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let wt = repo.find_worktree(&name).map_err(|e| e.to_string())?;

    // Remove the worktree directory
    let wt_path = wt.path();
    if wt_path.exists() {
        fs::remove_dir_all(wt_path).map_err(|e| e.to_string())?;
    }

    // Prune the worktree reference
    wt.prune(None).map_err(|e| e.to_string())?;

    Ok(())
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

fn schema_path() -> PathBuf {
    config_dir().join("settings.schema.json")
}

pub fn load_settings() -> AppSettings {
    let path = settings_path();
    if !path.exists() {
        return AppSettings::default();
    }
    let mut loaded: AppSettings = fs::read_to_string(&path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default();
    // Refresh schema pointer + version in case the file predates them.
    loaded.schema_ref = default_schema_ref();
    loaded.schema_version = SETTINGS_SCHEMA_VERSION;
    loaded
}

fn save_settings(settings: &AppSettings) -> Result<(), String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(settings_path(), data).map_err(|e| e.to_string())
}

/// Write the JSON Schema describing AppSettings next to settings.json.
/// Called at startup so editors can validate the file via the `$schema` ref.
pub fn write_settings_schema() -> Result<(), String> {
    ensure_config_dir().map_err(|e| e.to_string())?;
    let schema = schemars::schema_for!(AppSettings);
    let data = serde_json::to_string_pretty(&schema).map_err(|e| e.to_string())?;
    fs::write(schema_path(), data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_app_settings() -> Result<AppSettings, String> {
    Ok(load_settings())
}

#[tauri::command]
pub fn get_settings_schema() -> Result<serde_json::Value, String> {
    let schema = schemars::schema_for!(AppSettings);
    serde_json::to_value(&schema).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_scan_root(root: String) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    settings.scan_root = root;
    save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn add_project_path(path: String) -> Result<AppSettings, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("'{}' is not a directory", path));
    }
    let mut settings = load_settings();
    if !settings.added_projects.contains(&path) {
        settings.added_projects.push(path);
    }
    save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn remove_project_path(path: String) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    settings.added_projects.retain(|p| p != &path);
    save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn set_use_tmux(value: bool) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    settings.use_tmux = value;
    save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn set_desktop_notifications(value: bool) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    settings.desktop_notifications = value;
    save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn set_agents(agents: Vec<AgentConfig>) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    settings.agents = agents;
    save_settings(&settings)?;
    Ok(settings)
}

/// Walk a project directory and return absolute paths to every package.json,
/// skipping noisy directories (node_modules, build output, hidden dirs).
#[tauri::command(async)]
pub fn find_package_jsons(project_path: String) -> Result<Vec<String>, String> {
    let root = Path::new(&project_path);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", project_path));
    }
    let mut results = Vec::new();
    collect_package_jsons(root, &mut results, 0);
    results.sort();
    Ok(results)
}

fn collect_package_jsons(dir: &Path, results: &mut Vec<String>, depth: u32) {
    if depth > 6 {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if name.starts_with('.')
            || name == "node_modules"
            || name == "target"
            || name == "dist"
            || name == "build"
            || name == "out"
        {
            continue;
        }
        if path.is_dir() {
            collect_package_jsons(&path, results, depth + 1);
        } else if name == "package.json" {
            results.push(path.to_string_lossy().to_string());
        }
    }
}

/// Read the `scripts` object from a package.json. Missing scripts yields an empty map.
#[tauri::command]
pub fn read_package_json_scripts(path: String) -> Result<HashMap<String, String>, String> {
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    let scripts = json
        .get("scripts")
        .and_then(|s| s.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();
    Ok(scripts)
}

#[tauri::command]
pub fn set_project_scripts(
    project_path: String,
    paths: Vec<String>,
) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    if paths.is_empty() {
        settings.project_scripts.remove(&project_path);
    } else {
        settings.project_scripts.insert(project_path, paths);
    }
    save_settings(&settings)?;
    Ok(settings)
}
