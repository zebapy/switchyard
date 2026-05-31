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
  /** Uncommitted added line count (HEAD → workdir). */
  added: number;
  /** Uncommitted deleted line count (HEAD → workdir). */
  deleted: number;
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
