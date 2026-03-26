use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub is_git: bool,
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

            let is_git = path.join(".git").exists();

            projects.push(ProjectInfo {
                name,
                path: path.to_string_lossy().to_string(),
                is_git,
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
    worktrees.push(WorktreeInfo {
        path: main_path,
        branch: branch.clone(),
        is_main: true,
    });

    // Additional worktrees
    if let Ok(wt_names) = repo.worktrees() {
        for name in wt_names.iter().flatten() {
            if let Ok(wt) = repo.find_worktree(name) {
                let wt_path = wt.path().to_string_lossy().to_string();
                // Try to get the branch for this worktree
                let wt_branch = git2::Repository::open(wt.path())
                    .ok()
                    .and_then(|r| r.head().ok())
                    .and_then(|h| h.shorthand().map(|s| s.to_string()));
                worktrees.push(WorktreeInfo {
                    path: wt_path,
                    branch: wt_branch,
                    is_main: false,
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
    let worktree_path = Path::new(&repo_path)
        .parent()
        .unwrap_or(Path::new(&repo_path))
        .join(&branch_name);

    repo.worktree(
        &branch_name,
        &worktree_path,
        None,
    )
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
