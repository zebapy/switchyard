export interface ProjectInfo {
  name: string;
  path: string;
  is_git: boolean;
  worktree_parent: string | null;
}

export interface GitInfo {
  branch: string | null;
  worktrees: WorktreeInfo[];
}

/** Hosting provider + owner parsed from a repo's `origin` remote. */
export interface GitRemoteInfo {
  /** "github" | "gitlab" | "bitbucket", or null for unknown/self-hosted hosts. */
  host: string | null;
  /** Repo owner (org or user), or null when it can't be parsed. */
  owner: string | null;
}

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  is_main: boolean;
  last_commit_unix: number | null;
  /** Unix seconds the working directory was created on disk, or null if unknown. */
  created_unix: number | null;
  /** Uncommitted added line count (HEAD → workdir). */
  added: number;
  /** Uncommitted deleted line count (HEAD → workdir). */
  deleted: number;
}

/** How a project's worktree list is ordered. Root/main worktree always stays on top. */
export type WorktreeSort = 'name' | 'created' | 'updated' | 'changes' | 'pr';

/** Default ordering when a project has no saved preference. */
export const DEFAULT_WORKTREE_SORT: WorktreeSort = 'created';

/** Sort options in display order, for building the sort menu. */
export const WORKTREE_SORT_OPTIONS: { value: WorktreeSort; label: string }[] = [
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
  { value: 'name', label: 'Name' },
  { value: 'changes', label: 'Changes' },
  { value: 'pr', label: 'Pull request' },
];

/** How the Zen-mode project list is ordered (global, not per-project). */
export type ProjectListSort = 'manual' | 'recent' | 'name' | 'workspaces' | 'panes';

/** Default project-list ordering — the user's saved drag order. */
export const DEFAULT_PROJECT_LIST_SORT: ProjectListSort = 'manual';

export const PROJECT_LIST_SORT_OPTIONS: { value: ProjectListSort; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'recent', label: 'Recent activity' },
  { value: 'name', label: 'Name' },
  { value: 'workspaces', label: 'Workspaces' },
  { value: 'panes', label: 'Panes' },
];

/** How the Zen-mode pane list within a workspace is ordered (global). */
export type PaneSort = 'status' | 'name' | 'kind';

/** Default pane ordering — surface agents that need attention first. */
export const DEFAULT_PANE_SORT: PaneSort = 'status';

export const PANE_SORT_OPTIONS: { value: PaneSort; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'name', label: 'Name' },
  { value: 'kind', label: 'Kind' },
];

/** Deferred uncommitted line counts for one worktree, fetched after the tree renders. */
export interface DiffStat {
  added: number;
  deleted: number;
}

/** Whether a worktree can be archived, plus what to warn about before doing so. */
export interface WorktreeArchiveStatus {
  /** True when archiving is allowed (no hard blocker). */
  can_archive: boolean;
  /** Why archiving is blocked, when `can_archive` is false. */
  blocked_reason: string | null;
  /** True if git has the worktree locked. */
  locked: boolean;
  /** Uncommitted added lines that archiving would discard. */
  uncommitted_added: number;
  /** Uncommitted deleted lines that archiving would discard. */
  uncommitted_deleted: number;
}

export interface PrInfo {
  number: number;
  /** Uppercased PR state: OPEN | CLOSED | MERGED (from `get_pr_info`). */
  state: string;
  ci_status: string | null;
  url: string;
  title: string;
  draft: boolean;
  /** The branch the PR merges into (e.g. "main", or a parent branch when stacked). */
  base_branch: string;
}

/** A selectable source row in the new-worktree modal (issue / branch / PR). */
export interface GhItem {
  id: string;
  title: string;
  sub: string;
  branch: string;
}

/** An open pull request shown in the Pull requests view. Mirrors the Rust
 *  `PullRequestItem`. `branch` (the PR head ref) is matched against a project's
 *  worktree branches to decide between "Open in worktree" and "Go to worktree". */
export interface PullRequestItem {
  number: number;
  title: string;
  branch: string;
  author: string;
  url: string;
  draft: boolean;
  updated_at: string;
}

/** Where the app gets its GitHub credentials. Mirrors the Rust
 *  `GithubAuthSource`: the local `gh` CLI's token, or an in-app OAuth sign-in. */
export type GithubAuthSource = 'gh-cli' | 'app';

/** Live state of both credential sources, from `github_auth_status`. Only
 *  `source` is in play — the other block is shown so the user can see what
 *  switching would get them. */
export interface GithubAuthStatus {
  source: GithubAuthSource;
  gh_version: string | null;
  gh_account: string | null;
  /** Why `gh` can't be used right now, phrased for the user. */
  gh_error: string | null;
  app_signed_in: boolean;
  app_account: string | null;
}
