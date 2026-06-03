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
export type WorktreeSort = 'name' | 'created' | 'updated';

/** Default ordering when a project has no saved preference. */
export const DEFAULT_WORKTREE_SORT: WorktreeSort = 'updated';

/** Sort options in display order, for building the sort menu. */
export const WORKTREE_SORT_OPTIONS: { value: WorktreeSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Created' },
  { value: 'updated', label: 'Updated' },
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
  state: string;
  ci_status: string | null;
  url: string;
}

/** A selectable source row in the new-worktree modal (issue / branch / PR). */
export interface GhItem {
  id: string;
  title: string;
  sub: string;
  branch: string;
}
