export type PaneKind = 'Agent' | 'Shell' | 'Lazygit' | 'Custom';

export type AgentStatus = 'working' | 'waiting' | 'idle';

export interface LeafNode {
  type: 'leaf';
  paneId: string;
}

export interface SplitNode {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  ratio: number;
  children: [PaneTree, PaneTree];
}

export type PaneTree = LeafNode | SplitNode;

export interface PaneInfo {
  id: string;
  kind: PaneKind;
  cwd: string;
  title?: string;
  command?: string;
  agentStatus?: AgentStatus;
  accentColor?: string;
  /** Existing tmux session name to attach to (e.g. "wip-<uuid>"). When set, pane attaches instead of creating a new session. */
  tmuxSession?: string;
}

export interface Tab {
  id: string;
  label: string;
  paneTree: PaneTree;
}

export interface Window {
  /** Project working-directory path. Also the stable window id. */
  projectPath: string;
  tabs: Tab[];
  activeTabId: string | null;
  activePaneId: string | null;
  /** Unix ms when this window was last focused; drives recency ordering for switchers. */
  lastActiveAt: number;
}
