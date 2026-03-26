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
}

export interface Tab {
  id: string;
  label: string;
  projectPath: string;
  paneTree: PaneTree;
}
