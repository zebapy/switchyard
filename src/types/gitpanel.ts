/** Which diff the Git panel is showing. Mirrors the Rust `source` discriminator. */
export type DiffSource = 'unstaged' | 'staged' | 'base';

/** One queued line comment awaiting send to a single combined agent chat. */
export interface QueuedFeedback {
  id: string;
  /** Repo-relative file the comment targets. */
  file: string;
  /** Line label, e.g. "42" or "42-50". */
  lineLabel: string;
  /** The selected diff lines, each prefixed with +/-/space. */
  snippet: string;
  /** The user's free-text comment. */
  comment: string;
  source: DiffSource;
}

/**
 * Optional hooks that redirect a diff's agent interactions to a host view
 * (Zen). When absent, the diff launches chats itself the standard way.
 */
export interface DiffAgentHooks {
  /** Queue a line comment for a later combined send instead of launching now. */
  queueComment: (feedback: Omit<QueuedFeedback, 'id'>) => void;
  /** Launch a one-off prompt (e.g. "Explain this") in a host-focused chat. */
  launch: (prompt: string, label: string, agentCommand?: string) => void;
}

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
