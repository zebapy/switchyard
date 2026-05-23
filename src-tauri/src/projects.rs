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
    /// Per-project list of package.json absolute paths to show in the Scripts section.
    #[serde(default)]
    pub project_scripts: HashMap<String, Vec<String>>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_ref: default_schema_ref(),
            schema_version: SETTINGS_SCHEMA_VERSION,
            scan_root: String::new(),
            added_projects: Vec::new(),
            use_tmux: true,
            project_scripts: HashMap::new(),
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
}

fn head_commit_time(repo: &git2::Repository) -> Option<i64> {
    let head = repo.head().ok()?;
    let commit = head.peel_to_commit().ok()?;
    Some(commit.time().seconds())
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

#[tauri::command]
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

#[tauri::command]
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
    worktrees.push(WorktreeInfo {
        path: main_path,
        branch: branch.clone(),
        is_main: true,
        last_commit_unix: main_last_commit,
    });

    // Additional worktrees
    if let Ok(wt_names) = repo.worktrees() {
        for name in wt_names.iter().flatten() {
            if let Ok(wt) = repo.find_worktree(name) {
                let wt_path = wt.path().to_string_lossy().to_string();
                let (wt_branch, wt_last_commit) = git2::Repository::open(wt.path())
                    .ok()
                    .map(|r| {
                        let branch = r
                            .head()
                            .ok()
                            .and_then(|h| h.shorthand().map(|s| s.to_string()));
                        let last = head_commit_time(&r);
                        (branch, last)
                    })
                    .unwrap_or((None, None));
                worktrees.push(WorktreeInfo {
                    path: wt_path,
                    branch: wt_branch,
                    is_main: false,
                    last_commit_unix: wt_last_commit,
                });
            }
        }
    }

    Ok(GitInfo { branch, worktrees })
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

/// Walk a project directory and return absolute paths to every package.json,
/// skipping noisy directories (node_modules, build output, hidden dirs).
#[tauri::command]
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
