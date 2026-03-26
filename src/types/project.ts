export interface ProjectInfo {
  name: string;
  path: string;
  is_git: boolean;
}

export interface GitInfo {
  branch: string | null;
  worktrees: WorktreeInfo[];
}

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  is_main: boolean;
}

export interface PrInfo {
  number: number;
  state: string;
  ci_status: string | null;
  url: string;
}
