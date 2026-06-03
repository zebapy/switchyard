//! Git diff/status commands backing the right-hand Git panel. Built on libgit2
//! (`git2`), mirroring the style of `projects.rs`. Three views are exposed via a
//! `source` discriminator:
//!   - `unstaged`: index → working tree (includes untracked files)
//!   - `staged`:   HEAD tree → index
//!   - `base`:     merge-base(HEAD, default branch) → working tree (PR-style)

use serde::Serialize;
use std::collections::HashMap;

/// One changed file in a diff, with its per-file line counts.
#[derive(Debug, Clone, Serialize)]
pub struct FileStatus {
    pub path: String,
    /// added | modified | deleted | renamed | copied | untracked | typechange | conflicted
    pub status: String,
    pub added: i64,
    pub deleted: i64,
}

fn open_repo(path: &str) -> Result<git2::Repository, String> {
    git2::Repository::discover(path).map_err(|e| e.to_string())
}

fn delta_status(status: git2::Delta) -> &'static str {
    use git2::Delta;
    match status {
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Modified => "modified",
        Delta::Renamed => "renamed",
        Delta::Copied => "copied",
        Delta::Untracked => "untracked",
        Delta::Typechange => "typechange",
        Delta::Conflicted => "conflicted",
        _ => "modified",
    }
}

/// Prefer the new path (post-change); fall back to the old path for deletes.
fn delta_path(delta: &git2::DiffDelta) -> String {
    delta
        .new_file()
        .path()
        .or_else(|| delta.old_file().path())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Walk every diff line once, bucketing added/deleted counts by file path.
fn line_counts(diff: &git2::Diff) -> HashMap<String, (i64, i64)> {
    let mut map: HashMap<String, (i64, i64)> = HashMap::new();
    let _ = diff.foreach(
        &mut |_delta, _progress| true,
        None,
        None,
        Some(&mut |delta, _hunk, line| {
            let entry = map.entry(delta_path(&delta)).or_insert((0, 0));
            match line.origin() {
                '+' => entry.0 += 1,
                '-' => entry.1 += 1,
                _ => {}
            }
            true
        }),
    );
    map
}

/// Resolve the repo's default branch name (e.g. "main"). Tries the
/// `origin/HEAD` symbolic ref first, then common names locally and on origin.
fn resolve_default_branch(repo: &git2::Repository) -> Option<String> {
    if let Ok(head) = repo.find_reference("refs/remotes/origin/HEAD") {
        if let Some(target) = head.symbolic_target() {
            if let Some(name) = target.rsplit('/').next() {
                return Some(name.to_string());
            }
        }
    }
    for candidate in ["main", "master", "develop", "trunk"] {
        if repo.find_branch(candidate, git2::BranchType::Local).is_ok() {
            return Some(candidate.to_string());
        }
        if repo
            .find_reference(&format!("refs/remotes/origin/{candidate}"))
            .is_ok()
        {
            return Some(candidate.to_string());
        }
    }
    None
}

/// Merge-base commit between HEAD and the given base branch. Falls back to the
/// base tip if no common ancestor is found.
fn merge_base_commit<'a>(
    repo: &'a git2::Repository,
    base: &str,
) -> Result<git2::Commit<'a>, String> {
    let base_oid = repo
        .revparse_single(&format!("refs/remotes/origin/{base}"))
        .or_else(|_| repo.revparse_single(base))
        .map_err(|e| e.to_string())?
        .peel_to_commit()
        .map_err(|e| e.to_string())?
        .id();
    let head_oid = repo
        .head()
        .map_err(|e| e.to_string())?
        .peel_to_commit()
        .map_err(|e| e.to_string())?
        .id();
    let base_point = repo.merge_base(head_oid, base_oid).unwrap_or(base_oid);
    repo.find_commit(base_point).map_err(|e| e.to_string())
}

/// Build the diff for the requested `source`, optionally scoped to one file.
fn build_diff<'a>(
    repo: &'a git2::Repository,
    source: &str,
    file: Option<&str>,
) -> Result<git2::Diff<'a>, String> {
    let mut opts = git2::DiffOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true);
    if let Some(f) = file {
        opts.pathspec(f);
    }

    match source {
        "staged" => {
            let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
            repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
                .map_err(|e| e.to_string())
        }
        "base" => {
            let base = resolve_default_branch(repo)
                .ok_or("Couldn't determine the default branch (main/master).")?;
            let base_tree = merge_base_commit(repo, &base)?
                .tree()
                .map_err(|e| e.to_string())?;
            repo.diff_tree_to_workdir_with_index(Some(&base_tree), Some(&mut opts))
                .map_err(|e| e.to_string())
        }
        // "unstaged" (default): index → working tree.
        _ => repo
            .diff_index_to_workdir(None, Some(&mut opts))
            .map_err(|e| e.to_string()),
    }
}

/// Changed files for one of the three diff sources, with per-file line counts.
#[tauri::command(async)]
pub fn git_changed_files(path: String, source: String) -> Result<Vec<FileStatus>, String> {
    let repo = open_repo(&path)?;
    let diff = build_diff(&repo, &source, None)?;
    let counts = line_counts(&diff);

    let mut out: Vec<FileStatus> = diff
        .deltas()
        .map(|delta| {
            let path = delta_path(&delta);
            let (added, deleted) = counts.get(&path).copied().unwrap_or((0, 0));
            FileStatus {
                status: delta_status(delta.status()).to_string(),
                path,
                added,
                deleted,
            }
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Unified-diff patch text for a single file under one diff source. Feeds the
/// frontend diff renderer.
#[tauri::command(async)]
pub fn git_file_diff(path: String, file: String, source: String) -> Result<String, String> {
    let repo = open_repo(&path)?;
    let diff = build_diff(&repo, &source, Some(&file))?;

    let mut buf = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        // Re-prefix content/added/deleted lines; header lines already carry
        // their own text (with newlines), so emit those verbatim.
        match line.origin() {
            '+' | '-' | ' ' => buf.push(line.origin()),
            _ => {}
        }
        buf.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })
    .map_err(|e| e.to_string())?;
    Ok(buf)
}

/// The repo's default branch name (e.g. "main"), or `None` if undetectable.
#[tauri::command(async)]
pub fn git_default_branch(path: String) -> Result<Option<String>, String> {
    let repo = open_repo(&path)?;
    Ok(resolve_default_branch(&repo))
}

/// Local branch names in the repo, sorted case-insensitively. Powers the branch
/// switcher dropdown in the panel header.
#[tauri::command(async)]
pub fn git_local_branches(path: String) -> Result<Vec<String>, String> {
    let repo = open_repo(&path)?;
    let branches = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| e.to_string())?;

    let mut names: Vec<String> = Vec::new();
    for entry in branches {
        let (branch, _) = entry.map_err(|e| e.to_string())?;
        if let Some(name) = branch.name().map_err(|e| e.to_string())? {
            names.push(name.to_string());
        }
    }
    names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(names)
}

/// Switch the worktree at `path` to the local `branch`. Uses a SAFE checkout so
/// it errors rather than clobbering uncommitted changes — the caller surfaces
/// that message to the user.
#[tauri::command(async)]
pub fn git_checkout_branch(path: String, branch: String) -> Result<(), String> {
    let repo = open_repo(&path)?;

    let reference = repo
        .find_branch(&branch, git2::BranchType::Local)
        .map_err(|_| format!("Branch '{branch}' not found."))?
        .into_reference();
    let ref_name = reference
        .name()
        .ok_or("Branch reference has no name.")?
        .to_string();
    let tree_object = reference.peel(git2::ObjectType::Tree).map_err(|e| e.to_string())?;

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.safe();
    repo.checkout_tree(&tree_object, Some(&mut checkout))
        .map_err(|e| {
            format!("Couldn't switch to '{branch}': {e}. Commit or stash your changes first.")
        })?;

    repo.set_head(&ref_name).map_err(|e| e.to_string())?;
    Ok(())
}

/// Every working-tree file path that git knows about — tracked files (from the
/// index) plus untracked-but-not-ignored files. Powers the Files tab's codebase
/// tree. Paths are repo-relative, forward-slashed, and sorted.
#[tauri::command(async)]
pub fn git_list_tree(path: String) -> Result<Vec<String>, String> {
    let repo = open_repo(&path)?;
    let mut paths: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();

    // Tracked files: every entry in the index.
    let index = repo.index().map_err(|e| e.to_string())?;
    for entry in index.iter() {
        if let Ok(p) = std::str::from_utf8(&entry.path) {
            paths.insert(p.to_string());
        }
    }

    // Untracked files that aren't gitignored.
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .include_unmodified(false);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;
    for entry in statuses.iter() {
        if entry.status().is_wt_new() {
            if let Some(p) = entry.path() {
                paths.insert(p.to_string());
            }
        }
    }

    Ok(paths.into_iter().collect())
}

/// UTF-8 contents of a single repo file, for the Files tab's in-app viewer.
/// Rejects oversized or non-text files so the pane never tries to render a
/// huge blob or binary garbage — the caller falls back to "open in editor".
#[tauri::command(async)]
pub fn read_file_text(path: String, file: String) -> Result<String, String> {
    // `file` comes from the repo's own tree, but guard against traversal anyway.
    if file.split('/').any(|seg| seg == "..") {
        return Err("Invalid file path.".to_string());
    }
    let full = std::path::Path::new(&path).join(&file);
    let meta = std::fs::metadata(&full).map_err(|e| e.to_string())?;

    const MAX_BYTES: u64 = 2 * 1024 * 1024;
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "File is too large to preview ({} KB). Open it in your editor instead.",
            meta.len() / 1024
        ));
    }

    let bytes = std::fs::read(&full).map_err(|e| e.to_string())?;
    String::from_utf8(bytes)
        .map_err(|_| "This looks like a binary file. Open it in your editor instead.".to_string())
}
