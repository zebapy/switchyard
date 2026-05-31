/** One configured AI coding agent. Mirrors the Rust `AgentConfig` struct. */
export interface AgentConfig {
  /** Stable identifier (e.g. "claude"). Used as a React key and for de-duping. */
  id: string;
  /** Display name shown in menus (e.g. "Claude"). */
  name: string;
  /** Command run in the pane to launch the agent (e.g. "claude"). */
  command: string;
}

export const DEFAULT_AGENT: AgentConfig = { id: 'claude', name: 'Claude', command: 'claude' };
