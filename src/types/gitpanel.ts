/** Which diff the Git panel is showing. Mirrors the Rust `source` discriminator. */
export type DiffSource = 'unstaged' | 'staged' | 'base';

/** One changed file in a diff. Mirrors the Rust `FileStatus` struct. */
export interface FileStatus {
  path: string;
  /** added | modified | deleted | renamed | copied | untracked | typechange | conflicted */
  status: string;
  added: number;
  deleted: number;
}

/** One CI check-run for a commit. Mirrors the Rust `CheckRun` struct. */
export interface CheckRun {
  name: string;
  /** queued | in_progress | completed */
  status: string;
  /** success | failure | neutral | cancelled | skipped | timed_out | action_required | null */
  conclusion: string | null;
  html_url: string;
  details_url: string;
  /** GitHub Actions job id, when the check is an Actions job (enables log fetch). */
  job_id: number | null;
  started_at: string | null;
  completed_at: string | null;
}
