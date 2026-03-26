export type PaneKind = 'Agent' | 'Shell' | 'Lazygit' | 'Custom';

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
}

export interface Tab {
  id: string;
  label: string;
  projectPath: string;
  paneTree: PaneTree;
}
