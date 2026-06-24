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

/// Where new git worktrees are created.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum WorktreeLocation {
    /// Under the project itself, at `<project>/.claude/worktrees/<branch>`.
    Project,
    /// In a shared global directory, at `~/.switchyard/<project>/<branch>`.
    Global,
}

fn default_worktree_location() -> WorktreeLocation {
    WorktreeLocation::Project
}

/// How a project's worktree list is ordered (the root/main worktree always
/// stays pinned to the top regardless).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum WorktreeSort {
    /// Branch name, A→Z.
    Name,
    /// Working directory creation time, newest first.
    Created,
    /// Last commit time, newest first.
    Updated,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[schemars(title = "AppSettings", description = "User settings for the Switchyard app.")]
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
    /// Per-project worktree-list sort order, keyed by project path. Projects
    /// absent from the map fall back to the default sort.
    #[serde(default)]
    pub project_sort: HashMap<String, WorktreeSort>,
    /// Configured AI agents, ordered by preference. First entry is the default.
    #[serde(default = "default_agents")]
    pub agents: Vec<AgentConfig>,
    /// Where new git worktrees are created: under the project's
    /// `.claude/worktrees`, or in a shared global `~/.switchyard` directory.
    #[serde(default = "default_worktree_location")]
    pub worktree_location: WorktreeLocation,
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
            project_sort: HashMap::new(),
            agents: default_agents(),
            worktree_location: default_worktree_location(),
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
    /// Unix timestamp (seconds) the working directory was created on disk
    /// (filesystem birth time), or None if the platform/filesystem can't report
    /// it. Used as a proxy for when the worktree was created.
    pub created_unix: Option<i64>,
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

/// Filesystem birth time of a directory as Unix seconds. `None` when the
/// platform or filesystem doesn't expose a creation time.
fn dir_created_time(path: &str) -> Option<i64> {
    let created = fs::metadata(path).ok()?.created().ok()?;
    let secs = created
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();
    Some(secs as i64)
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

/// Per-user config directory for Switchyard: `~/.config/switchyard`.
/// (Formerly `cc-tui`; see `migrate_legacy_config_dir`.)
pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("~/.config"))
        .join("switchyard")
}

/// One-time rename of the legacy `cc-tui` config dir to `switchyard`, so the
/// rename doesn't orphan a user's existing settings, pins, session, and tokens.
/// Safe to call on every startup: a no-op once the new directory exists.
pub fn migrate_legacy_config_dir() {
    let Some(base) = dirs::config_dir() else {
        return;
    };
    let legacy = base.join("cc-tui");
    let current = base.join("switchyard");
    if legacy.is_dir() && !current.exists() {
        let _ = fs::rename(&legacy, &current);
    }
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
    let main_created = dir_created_time(&main_path);
    worktrees.push(WorktreeInfo {
        path: main_path,
        branch: branch.clone(),
        is_main: true,
        last_commit_unix: main_last_commit,
        created_unix: main_created,
        // Diff stats are deferred — fetched per worktree via
        // `get_worktree_diff_stats` so the tree renders before every working
        // directory is scanned.
        added: 0,
        deleted: 0,
    });

    // Additional worktrees. Collect their paths first (cheap, and `git2::Repository`
    // is not Sync so it can't be shared across threads), then open each in
    // parallel — the per-worktree open + head/commit-time read are independent
    // filesystem reads that dominate the cost, and this runs for every project on
    // each poll.
    let wt_paths: Vec<String> = repo
        .worktrees()
        .ok()
        .map(|names| {
            names
                .iter()
                .flatten()
                .filter_map(|name| {
                    repo.find_worktree(name)
                        .ok()
                        .map(|wt| wt.path().to_string_lossy().to_string())
                })
                .collect()
        })
        .unwrap_or_default();

    let extra: Vec<WorktreeInfo> = std::thread::scope(|scope| {
        let handles: Vec<_> = wt_paths
            .iter()
            .map(|wt_path| {
                scope.spawn(move || {
                    let (wt_branch, wt_last_commit) = git2::Repository::open(wt_path.as_str())
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
                    WorktreeInfo {
                        path: wt_path.clone(),
                        branch: wt_branch,
                        is_main: false,
                        last_commit_unix: wt_last_commit,
                        created_unix: dir_created_time(wt_path),
                        // Deferred — see main worktree above.
                        added: 0,
                        deleted: 0,
                    }
                })
            })
            .collect();
        handles.into_iter().filter_map(|h| h.join().ok()).collect()
    });
    worktrees.extend(extra);

    Ok(GitInfo { branch, worktrees })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStat {
    pub added: i64,
    pub deleted: i64,
}

/// Uncommitted line counts for a single worktree path. Split out of
/// `get_git_info` so the tree can render before every working directory is
/// scanned; the frontend fires one call per worktree, concurrently.
#[tauri::command(async)]
pub fn get_worktree_diff_stats(path: String) -> Result<DiffStat, String> {
    let repo = git2::Repository::open(&path).map_err(|e| e.to_string())?;
    let (added, deleted) = diff_stats(&repo);
    Ok(DiffStat { added, deleted })
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

/// Root global directory for worktrees: `~/.switchyard`.
fn global_worktree_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".switchyard")
}

/// Directory under which a new worktree for `repo_path` is created, per the
/// configured location. Project: `<repo>/.claude/worktrees`. Global:
/// `~/.switchyard/<project-name>`, namespaced by project so branch names don't
/// collide across repos.
fn worktree_base_dir(repo_path: &str, location: WorktreeLocation) -> PathBuf {
    match location {
        WorktreeLocation::Project => Path::new(repo_path).join(".claude").join("worktrees"),
        WorktreeLocation::Global => {
            let project_name = Path::new(repo_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "project".to_string());
            global_worktree_root().join(project_name)
        }
    }
}

#[tauri::command(async)]
pub fn create_worktree(repo_path: String, branch_name: String) -> Result<String, String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let location = load_settings().worktree_location;
    let worktrees_dir = worktree_base_dir(&repo_path, location);
    fs::create_dir_all(&worktrees_dir).map_err(|e| e.to_string())?;

    // Git worktree names (and their on-disk folders) can't contain '/', so the
    // folder is the branch's last segment while the branch keeps its full path
    // (e.g. branch `zebapy/brave-otter` lives in a `brave-otter` folder).
    let folder = branch_name.rsplit('/').next().unwrap_or(&branch_name);
    let worktree_path = worktrees_dir.join(folder);

    let commit = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|e| e.to_string())?;
    let branch = repo
        .branch(&branch_name, &commit, false)
        .map_err(|e| e.to_string())?;
    let reference = branch.into_reference();

    let mut opts = git2::WorktreeAddOptions::new();
    opts.reference(Some(&reference));
    repo.worktree(folder, &worktree_path, Some(&opts))
        .map_err(|e| e.to_string())?;

    Ok(worktree_path.to_string_lossy().to_string())
}

/// Check a GitHub PR out into a fresh worktree. Fetches the PR head via the
/// `pull/<n>/head` ref — which exists for fork PRs too, unlike the head branch on
/// `origin` — then creates a local branch named after the PR's head ref and adds a
/// worktree on it. Shells out to `git` (like `clone_repo`) so the user's
/// credentials and SSH config apply. The local branch is named exactly
/// `branch_name` so the frontend can later match it to this worktree and offer
/// "Go to worktree" instead of creating a duplicate.
#[tauri::command(async)]
pub fn create_worktree_for_pr(
    repo_path: String,
    pr_number: u64,
    branch_name: String,
) -> Result<String, String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let location = load_settings().worktree_location;
    let worktrees_dir = worktree_base_dir(&repo_path, location);
    fs::create_dir_all(&worktrees_dir).map_err(|e| e.to_string())?;

    let folder = branch_name.rsplit('/').next().unwrap_or(&branch_name);
    let worktree_path = worktrees_dir.join(folder);
    if worktree_path.exists() {
        return Err(format!(
            "A worktree folder '{folder}' already exists. Open it from the sidebar instead."
        ));
    }
    // A pre-existing local branch would make `worktree add -b` fail; surface a
    // clear message pointing at the existing checkout rather than git's raw error.
    if repo
        .find_branch(&branch_name, git2::BranchType::Local)
        .is_ok()
    {
        return Err(format!(
            "A local branch '{branch_name}' already exists. Open its worktree or delete the branch first."
        ));
    }

    let fetch = std::process::Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["fetch", "origin", &format!("pull/{pr_number}/head")])
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if !fetch.status.success() {
        let stderr = String::from_utf8_lossy(&fetch.stderr);
        return Err(format!("Couldn't fetch PR #{pr_number}: {}", stderr.trim()));
    }

    let add = std::process::Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["worktree", "add", "-b", &branch_name])
        .arg(&worktree_path)
        .arg("FETCH_HEAD")
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if !add.status.success() {
        let stderr = String::from_utf8_lossy(&add.stderr);
        return Err(format!("Couldn't create the worktree: {}", stderr.trim()));
    }

    Ok(worktree_path.to_string_lossy().to_string())
}

/// Lowercase, collapse non-alphanumeric runs to '-', trim dashes. Used to turn a
/// git `user.name` into a branch-prefix slug.
fn slugify(value: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

/// Branch-prefix slug derived from git `user.name` (repo config, falling back to
/// the global config). Empty string when unset — callers then skip the prefix.
#[tauri::command]
pub fn git_user_slug(repo_path: String) -> String {
    let name = git2::Repository::open(&repo_path)
        .ok()
        .and_then(|repo| repo.config().ok())
        .and_then(|cfg| cfg.get_string("user.name").ok())
        .or_else(|| {
            git2::Config::open_default()
                .ok()
                .and_then(|cfg| cfg.get_string("user.name").ok())
        })
        .unwrap_or_default();
    slugify(&name)
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

/// Derive a folder name from a git remote URL by taking the last path segment
/// and stripping a trailing `.git`. Handles both SSH (`git@host:owner/repo.git`)
/// and HTTPS (`https://host/owner/repo.git`) forms.
fn repo_name_from_url(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches('/');
    let last = trimmed.rsplit(['/', ':']).next()?;
    let name = last.strip_suffix(".git").unwrap_or(last);
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

/// Clone a git repository into `parent_dir` using the system `git` binary so
/// the user's existing credentials, SSH keys, and credential helpers apply.
/// Returns the cloned project so the frontend can pin and open it.
#[tauri::command(async)]
pub fn clone_repo(url: String, parent_dir: String) -> Result<ProjectInfo, String> {
    let parent = Path::new(&parent_dir);
    if !parent.is_dir() {
        return Err(format!("'{}' is not a directory", parent_dir));
    }
    let name = repo_name_from_url(&url)
        .ok_or_else(|| format!("Could not derive a folder name from '{}'", url))?;
    let dest = parent.join(&name);
    if dest.exists() {
        return Err(format!(
            "'{}' already exists in {} — choose another destination",
            name, parent_dir
        ));
    }
    let dest_str = dest.to_string_lossy().to_string();
    let output = std::process::Command::new("git")
        .args(["clone", url.trim(), &dest_str])
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git clone failed: {}", stderr.trim()));
    }
    Ok(ProjectInfo {
        name,
        path: dest_str,
        is_git: true,
        worktree_parent: None,
    })
}

/// Extract the host portion of a git remote URL. Handles HTTPS
/// (`https://host/owner/repo`), `ssh://git@host/owner/repo`, and scp-like
/// (`git@host:owner/repo`) forms. Returns None when no host can be parsed.
fn remote_host(url: &str) -> Option<String> {
    let url = url.trim();
    if let Some(after_scheme) = url.split("://").nth(1) {
        // Drop an optional `user@`, then take up to the first `/` or `:`.
        let after_user = after_scheme.rsplit('@').next().unwrap_or(after_scheme);
        let host = after_user.split(['/', ':']).next()?;
        return (!host.is_empty()).then(|| host.to_string());
    }
    // scp-like: git@host:owner/repo
    let after_user = url.split('@').nth(1)?;
    let host = after_user.split(':').next()?;
    (!host.is_empty()).then(|| host.to_string())
}

/// Extract the repo owner (org or user) from a git remote URL — the first path
/// segment after the host. Handles HTTPS, `ssh://`, and scp-like
/// (`git@host:owner/repo`) forms; strips a trailing `.git`. Returns None when
/// no owner can be parsed.
fn remote_owner(url: &str) -> Option<String> {
    let url = url.trim().trim_end_matches(".git");
    let path = if let Some(after_scheme) = url.split("://").nth(1) {
        let after_user = after_scheme.rsplit('@').next().unwrap_or(after_scheme);
        // Drop the host, keep the remainder of the path.
        after_user.splitn(2, ['/', ':']).nth(1)?.to_string()
    } else {
        // scp-like: git@host:owner/repo
        url.split(':').nth(1)?.to_string()
    };
    let owner = path.trim_start_matches('/').split('/').next()?;
    (!owner.is_empty()).then(|| owner.to_string())
}

/// Identify the git hosting provider from a remote URL, e.g. "github",
/// "gitlab", "bitbucket". Matches on the host so self-hosted instances
/// (`gitlab.mycorp.com`) are recognized too. Returns None for unrecognized
/// hosts so the UI falls back to a generic repo icon.
fn git_host_from_url(url: &str) -> Option<String> {
    let host = remote_host(url)?.to_lowercase();
    let provider = if host.contains("github") {
        "github"
    } else if host.contains("gitlab") {
        "gitlab"
    } else if host.contains("bitbucket") {
        "bitbucket"
    } else {
        return None;
    };
    Some(provider.to_string())
}

/// Hosting provider and owner parsed from a repo's `origin` remote, used to
/// pick the project icon: the owner avatar when known, else the host mark.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitRemoteInfo {
    /// "github" | "gitlab" | "bitbucket", or None for unknown/self-hosted hosts.
    pub host: Option<String>,
    /// Repo owner (org or user), or None when it can't be parsed.
    pub owner: Option<String>,
}

/// Detect the hosting provider and owner for the repo at `path` from its
/// `origin` remote. Returns None when there's no repo, no `origin`, or no URL —
/// a missing remote is not an error, just "no host icon".
#[tauri::command(async)]
pub fn get_git_remote_info(path: String) -> Result<Option<GitRemoteInfo>, String> {
    let Ok(repo) = git2::Repository::discover(&path) else {
        return Ok(None);
    };
    let Ok(remote) = repo.find_remote("origin") else {
        return Ok(None);
    };
    let Some(url) = remote.url() else {
        return Ok(None);
    };
    Ok(Some(GitRemoteInfo {
        host: git_host_from_url(url),
        owner: remote_owner(url),
    }))
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

/// Whether a linked worktree can be archived, and what to warn about first.
/// Archiving removes the working directory but keeps the branch (and its
/// commits) in the repo, so the only hard blockers are a git lock or a missing
/// worktree; uncommitted changes are a discard warning, not a blocker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeArchiveStatus {
    /// True when archiving is allowed (no hard blocker).
    pub can_archive: bool,
    /// Human-readable reason archiving is blocked, when `can_archive` is false.
    pub blocked_reason: Option<String>,
    /// True if git has the worktree locked (a hard blocker).
    pub locked: bool,
    /// Uncommitted added lines that archiving would discard (warning only).
    pub uncommitted_added: i64,
    /// Uncommitted deleted lines that archiving would discard (warning only).
    pub uncommitted_deleted: i64,
}

/// Inspect a linked worktree to decide whether it can be archived. The base
/// (main) worktree is never a linked worktree, so the frontend handles that case
/// without calling this — here a missing name reports as not-found.
#[tauri::command(async)]
pub fn get_worktree_archive_status(
    repo_path: String,
    name: String,
) -> Result<WorktreeArchiveStatus, String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let wt = match repo.find_worktree(&name) {
        Ok(wt) => wt,
        Err(_) => {
            return Ok(WorktreeArchiveStatus {
                can_archive: false,
                blocked_reason: Some("Worktree no longer exists.".to_string()),
                locked: false,
                uncommitted_added: 0,
                uncommitted_deleted: 0,
            });
        }
    };

    let lock = wt.is_locked().map_err(|e| e.to_string())?;
    let locked = matches!(lock, git2::WorktreeLockStatus::Locked(_));
    let lock_reason = match lock {
        git2::WorktreeLockStatus::Locked(Some(reason)) if !reason.trim().is_empty() => {
            Some(format!("Worktree is locked: {}", reason.trim()))
        }
        git2::WorktreeLockStatus::Locked(_) => Some("Worktree is locked.".to_string()),
        git2::WorktreeLockStatus::Unlocked => None,
    };

    // Uncommitted line counts — a warning the confirm surfaces, not a blocker.
    let (uncommitted_added, uncommitted_deleted) = git2::Repository::open(wt.path())
        .map(|r| diff_stats(&r))
        .unwrap_or((0, 0));

    Ok(WorktreeArchiveStatus {
        can_archive: lock_reason.is_none(),
        blocked_reason: lock_reason,
        locked,
        uncommitted_added,
        uncommitted_deleted,
    })
}

/// Archive a linked worktree: remove its working directory and prune the git
/// registration, leaving the branch and its commits in the repo. Refuses when
/// git has the worktree locked; uncommitted changes are the caller's call
/// (confirmed in the UI) since the work only lives in the working directory.
#[tauri::command(async)]
pub fn archive_worktree(repo_path: String, name: String) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let wt = repo.find_worktree(&name).map_err(|e| e.to_string())?;

    if let git2::WorktreeLockStatus::Locked(reason) =
        wt.is_locked().map_err(|e| e.to_string())?
    {
        let detail = reason
            .filter(|r| !r.trim().is_empty())
            .map(|r| format!(": {}", r.trim()))
            .unwrap_or_default();
        return Err(format!("Worktree is locked{detail}. Unlock it before archiving."));
    }

    let wt_path = wt.path();
    if wt_path.exists() {
        fs::remove_dir_all(wt_path).map_err(|e| e.to_string())?;
    }
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

/// Absolute path to the user-editable settings file. Ensures the file and its
/// JSON Schema both exist on disk first, so an external editor always has
/// something to open and can validate edits against `settings.schema.json`.
#[tauri::command]
pub fn settings_file_path() -> Result<String, String> {
    let settings = load_settings();
    save_settings(&settings)?;
    write_settings_schema()?;
    Ok(settings_path().to_string_lossy().to_string())
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

/// Reorder the user's added projects. `paths` must be a permutation of the
/// existing `added_projects` — any project missing from `paths` is appended in
/// its prior order, and unknown paths are ignored, so the saved set is stable.
#[tauri::command]
pub fn reorder_projects(paths: Vec<String>) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    let existing = settings.added_projects.clone();
    let mut reordered: Vec<String> = paths
        .into_iter()
        .filter(|p| existing.contains(p))
        .collect();
    for p in &existing {
        if !reordered.contains(p) {
            reordered.push(p.clone());
        }
    }
    settings.added_projects = reordered;
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

#[tauri::command]
pub fn set_worktree_location(location: WorktreeLocation) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    settings.worktree_location = location;
    save_settings(&settings)?;
    Ok(settings)
}

/// A single runnable script extracted from a manifest.
#[derive(Serialize, Clone)]
pub struct ScriptEntry {
    pub name: String,
    pub command: String,
}

/// A manifest (package.json or pyproject.toml) and the scripts it defines,
/// along with the detected runner used to execute them.
#[derive(Serialize, Clone)]
pub struct ScriptSource {
    /// Absolute path to the manifest file.
    pub manifest_path: String,
    /// Directory the script should run in (the manifest's parent).
    pub dir: String,
    /// Package name (from the manifest) or directory basename as a fallback.
    pub project_name: String,
    /// Manifest filename: "package.json" or "pyproject.toml".
    pub manifest: String,
    /// Detected runner: npm | pnpm | yarn | bun | pdm | uv.
    pub runner: String,
    /// "js" or "py" — drives the badge colour in the UI.
    pub lang: String,
    /// Human label for where scripts came from, e.g. "scripts" or "[tool.pdm.scripts]".
    pub source: String,
    pub scripts: Vec<ScriptEntry>,
}

/// Directory names that never contain project scripts worth surfacing.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".venv",
    "venv",
    "__pycache__",
    ".git",
];

/// Walk a project directory and return every package.json / pyproject.toml that
/// defines runnable scripts, grouped per manifest with its detected runner.
///
/// Respects `.gitignore`, skips hidden + build/dependency dirs, and caps depth.
#[tauri::command(async)]
pub fn discover_scripts(project_path: String) -> Result<Vec<ScriptSource>, String> {
    let root = Path::new(&project_path);
    if !root.is_dir() {
        return Err(format!("{} is not a directory", project_path));
    }

    let walker = ignore::WalkBuilder::new(root)
        .standard_filters(true) // .gitignore, .ignore, hidden files, git excludes
        .max_depth(Some(8))
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            !SKIP_DIRS.contains(&name.as_ref())
        })
        .build();

    let mut sources: Vec<ScriptSource> = Vec::new();
    for entry in walker.flatten() {
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let path = entry.path();
        let name = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();
        let source = match name.as_ref() {
            "package.json" => read_package_json_source(path, root),
            "pyproject.toml" => read_pyproject_source(path, root),
            _ => None,
        };
        if let Some(src) = source {
            if !src.scripts.is_empty() {
                sources.push(src);
            }
        }
    }

    sources.sort_by(|a, b| a.manifest_path.cmp(&b.manifest_path));
    Ok(sources)
}

/// Directory of a manifest and a sorted vec of (name, command) pairs.
fn manifest_dir(path: &Path) -> String {
    path.parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Walk up from `dir` to `root` looking for any of `markers`; returns the first match.
fn find_marker_upward(dir: &Path, root: &Path, markers: &[&str]) -> bool {
    let mut current = dir;
    loop {
        for marker in markers {
            if current.join(marker).exists() {
                return true;
            }
        }
        if current == root {
            break;
        }
        match current.parent() {
            Some(parent) if parent.starts_with(root) || parent == root => current = parent,
            _ => break,
        }
    }
    false
}

/// Detect the JS package manager from the nearest lockfile, defaulting to npm.
fn detect_js_runner(dir: &Path, root: &Path) -> String {
    if find_marker_upward(dir, root, &["pnpm-lock.yaml"]) {
        return "pnpm".to_string();
    }
    if find_marker_upward(dir, root, &["yarn.lock"]) {
        return "yarn".to_string();
    }
    if find_marker_upward(dir, root, &["bun.lockb", "bun.lock"]) {
        return "bun".to_string();
    }
    "npm".to_string()
}

fn read_package_json_source(path: &Path, root: &Path) -> Option<ScriptSource> {
    let data = fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&data).ok()?;
    let scripts: Vec<ScriptEntry> = json
        .get("scripts")
        .and_then(|s| s.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| {
                    v.as_str().map(|s| ScriptEntry {
                        name: k.clone(),
                        command: s.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let dir = manifest_dir(path);
    let project_name = json
        .get("name")
        .and_then(|n| n.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| basename_or(&dir));

    Some(ScriptSource {
        manifest_path: path.to_string_lossy().to_string(),
        dir: dir.clone(),
        project_name,
        manifest: "package.json".to_string(),
        runner: detect_js_runner(Path::new(&dir), root),
        lang: "js".to_string(),
        source: "scripts".to_string(),
        scripts,
    })
}

/// Stringify a PDM script value, which may be a bare string or a table with
/// `cmd` / `shell` / `call` / `composite` keys.
fn pdm_command_string(value: &toml::Value) -> Option<String> {
    if let Some(s) = value.as_str() {
        return Some(s.to_string());
    }
    let table = value.as_table()?;
    if let Some(cmd) = table.get("cmd") {
        if let Some(s) = cmd.as_str() {
            return Some(s.to_string());
        }
        if let Some(arr) = cmd.as_array() {
            let parts: Vec<String> = arr.iter().filter_map(|v| v.as_str().map(String::from)).collect();
            return Some(parts.join(" "));
        }
    }
    if let Some(shell) = table.get("shell").and_then(|v| v.as_str()) {
        return Some(shell.to_string());
    }
    if let Some(call) = table.get("call").and_then(|v| v.as_str()) {
        return Some(format!("call {call}"));
    }
    if let Some(comp) = table.get("composite").and_then(|v| v.as_array()) {
        let parts: Vec<String> = comp.iter().filter_map(|v| v.as_str().map(String::from)).collect();
        return Some(parts.join(" && "));
    }
    None
}

fn read_pyproject_source(path: &Path, root: &Path) -> Option<ScriptSource> {
    let data = fs::read_to_string(path).ok()?;
    let doc: toml::Value = toml::from_str(&data).ok()?;
    let dir = manifest_dir(path);
    let dir_path = Path::new(&dir);

    let has_tool_uv = doc.get("tool").and_then(|t| t.get("uv")).is_some();
    let has_tool_pdm = doc.get("tool").and_then(|t| t.get("pdm")).is_some();
    let uv_detected = has_tool_uv || find_marker_upward(dir_path, root, &["uv.lock"]);
    let _pdm_detected = has_tool_pdm || find_marker_upward(dir_path, root, &["pdm.lock"]);

    // PDM's scripts table is an explicit task runner — always surface it as pdm.
    let pdm_scripts = doc
        .get("tool")
        .and_then(|t| t.get("pdm"))
        .and_then(|p| p.get("scripts"))
        .and_then(|s| s.as_table());

    let (runner, source, scripts) = if let Some(table) = pdm_scripts.filter(|t| !t.is_empty()) {
        let scripts: Vec<ScriptEntry> = table
            .iter()
            .filter(|(k, _)| *k != "_") // PDM uses "_" for shared script options
            .filter_map(|(k, v)| {
                pdm_command_string(v).map(|command| ScriptEntry {
                    name: k.clone(),
                    command,
                })
            })
            .collect();
        ("pdm".to_string(), "[tool.pdm.scripts]".to_string(), scripts)
    } else if uv_detected {
        // uv runs console-script entry points declared under [project.scripts].
        let table = doc
            .get("project")
            .and_then(|p| p.get("scripts"))
            .and_then(|s| s.as_table())
            .filter(|t| !t.is_empty())?;
        let scripts: Vec<ScriptEntry> = table
            .iter()
            .filter_map(|(k, v)| {
                v.as_str().map(|s| ScriptEntry {
                    name: k.clone(),
                    command: s.to_string(),
                })
            })
            .collect();
        ("uv".to_string(), "[project.scripts]".to_string(), scripts)
    } else {
        return None;
    };

    let project_name = doc
        .get("project")
        .and_then(|p| p.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| basename_or(&dir));

    Some(ScriptSource {
        manifest_path: path.to_string_lossy().to_string(),
        dir: dir.clone(),
        project_name,
        manifest: "pyproject.toml".to_string(),
        runner,
        lang: "py".to_string(),
        source,
        scripts,
    })
}

fn basename_or(dir: &str) -> String {
    Path::new(dir)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| dir.to_string())
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

#[tauri::command]
pub fn set_project_sort(
    project_path: String,
    sort: WorktreeSort,
) -> Result<AppSettings, String> {
    let mut settings = load_settings();
    settings.project_sort.insert(project_path, sort);
    save_settings(&settings)?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::{git_host_from_url, remote_host, remote_owner};

    #[test]
    fn parses_host_from_url_forms() {
        assert_eq!(
            remote_host("https://github.com/owner/repo.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(
            remote_host("https://git@gitlab.com/owner/repo.git").as_deref(),
            Some("gitlab.com")
        );
        assert_eq!(
            remote_host("ssh://git@bitbucket.org/owner/repo.git").as_deref(),
            Some("bitbucket.org")
        );
        assert_eq!(
            remote_host("git@github.com:owner/repo.git").as_deref(),
            Some("github.com")
        );
        assert_eq!(remote_host("not a url"), None);
    }

    #[test]
    fn detects_known_providers_and_falls_through() {
        assert_eq!(
            git_host_from_url("git@github.com:o/r.git").as_deref(),
            Some("github")
        );
        assert_eq!(
            git_host_from_url("https://gitlab.com/o/r.git").as_deref(),
            Some("gitlab")
        );
        assert_eq!(
            git_host_from_url("https://bitbucket.org/o/r.git").as_deref(),
            Some("bitbucket")
        );
        // Self-hosted instance still matches on the host substring.
        assert_eq!(
            git_host_from_url("https://gitlab.mycorp.com/o/r.git").as_deref(),
            Some("gitlab")
        );
        // Unknown host → no icon.
        assert_eq!(git_host_from_url("https://git.example.com/o/r.git"), None);
    }

    #[test]
    fn parses_owner_from_url_forms() {
        assert_eq!(
            remote_owner("https://github.com/acme/repo.git").as_deref(),
            Some("acme")
        );
        assert_eq!(
            remote_owner("https://git@gitlab.com/acme/repo.git").as_deref(),
            Some("acme")
        );
        assert_eq!(
            remote_owner("ssh://git@bitbucket.org/acme/repo.git").as_deref(),
            Some("acme")
        );
        assert_eq!(
            remote_owner("git@github.com:acme/repo.git").as_deref(),
            Some("acme")
        );
        assert_eq!(remote_owner("not a url"), None);
    }
}
