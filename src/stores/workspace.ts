import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { PaneTree, PaneInfo, PaneKind, Tab, LeafNode, SplitNode, AgentStatus } from '../types/pane';

function generateId(): string {
  return crypto.randomUUID();
}

function createLeaf(paneId: string): LeafNode {
  return { type: 'leaf', paneId };
}

// Replace a leaf in the tree with a new node
function replaceInTree(
  tree: PaneTree,
  targetId: string,
  replacement: PaneTree,
): PaneTree {
  if (tree.type === 'leaf') {
    return tree.paneId === targetId ? replacement : tree;
  }
  return {
    ...tree,
    children: [
      replaceInTree(tree.children[0], targetId, replacement),
      replaceInTree(tree.children[1], targetId, replacement),
    ],
  };
}

// Remove a leaf and collapse its parent
function removeFromTree(
  tree: PaneTree,
  targetId: string,
): PaneTree | null {
  if (tree.type === 'leaf') {
    return tree.paneId === targetId ? null : tree;
  }

  const left = removeFromTree(tree.children[0], targetId);
  const right = removeFromTree(tree.children[1], targetId);

  if (left === null) return right;
  if (right === null) return left;

  return { ...tree, children: [left, right] };
}

// Find all leaf pane IDs in the tree
function findAllLeaves(tree: PaneTree): string[] {
  if (tree.type === 'leaf') return [tree.paneId];
  return [
    ...findAllLeaves(tree.children[0]),
    ...findAllLeaves(tree.children[1]),
  ];
}

// Update ratio at a specific split node path
function updateRatioInTree(
  tree: PaneTree,
  splitPath: number[],
  ratio: number,
): PaneTree {
  if (splitPath.length === 0 && tree.type === 'split') {
    return { ...tree, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
  }
  if (tree.type === 'split' && splitPath.length > 0) {
    const [next, ...rest] = splitPath;
    const newChildren: [PaneTree, PaneTree] = [...tree.children];
    newChildren[next] = updateRatioInTree(newChildren[next], rest, ratio);
    return { ...tree, children: newChildren };
  }
  return tree;
}

interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string | null;
  panes: Map<string, PaneInfo>;
  activePaneId: string | null;
  sidebarWidth: number;

  // Tab actions
  addTab: (projectPath: string, label: string, kind?: PaneKind) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Pane actions
  addPane: (tabId: string, kind: PaneKind, cwd: string, command?: string) => string;
  splitPane: (paneId: string, direction: 'horizontal' | 'vertical', kind: PaneKind, cwd: string, command?: string) => string;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  setRatio: (tabId: string, splitPath: number[], ratio: number) => void;

  // Navigation
  cyclePaneForward: () => void;
  cyclePaneBackward: () => void;
  nextTab: () => void;
  prevTab: () => void;

  // Pane metadata
  setPaneTitle: (paneId: string, title: string) => void;
  setAgentStatus: (paneId: string, status: AgentStatus) => void;
  setAgentAccentColor: (paneId: string, color: string) => void;

  // Layout
  setSidebarWidth: (width: number) => void;

  // Session persistence
  saveSession: () => Promise<void>;
  loadSession: () => Promise<boolean>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, _get) => ({
  tabs: [],
  activeTabId: null,
  panes: new Map(),
  activePaneId: null,
  sidebarWidth: 260,

  addTab: (projectPath, label, kind) => {
    const tabId = generateId();
    const paneId = generateId();
    const paneInfo: PaneInfo = { id: paneId, kind: kind ?? 'Shell', cwd: projectPath };
    const tab: Tab = {
      id: tabId,
      label,
      projectPath,
      paneTree: createLeaf(paneId),
    };

    set((state) => {
      const newPanes = new Map(state.panes);
      newPanes.set(paneId, paneInfo);
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tabId,
        panes: newPanes,
        activePaneId: paneId,
      };
    });

    return tabId;
  },

  removeTab: (tabId) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return state;

      const leafIds = findAllLeaves(tab.paneTree);
      const newPanes = new Map(state.panes);
      leafIds.forEach((id) => newPanes.delete(id));

      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      const newActiveTabId =
        state.activeTabId === tabId
          ? newTabs[newTabs.length - 1]?.id ?? null
          : state.activeTabId;

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
        panes: newPanes,
        activePaneId:
          newActiveTabId
            ? findAllLeaves(
                newTabs.find((t) => t.id === newActiveTabId)!.paneTree,
              )[0] ?? null
            : null,
      };
    });
  },

  setActiveTab: (tabId) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return state;
      const leaves = findAllLeaves(tab.paneTree);
      return {
        activeTabId: tabId,
        activePaneId: leaves.includes(state.activePaneId ?? '')
          ? state.activePaneId
          : leaves[0] ?? null,
      };
    });
  },

  addPane: (tabId, kind, cwd, command) => {
    const paneId = generateId();
    const paneInfo: PaneInfo = { id: paneId, kind, cwd, command };

    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return state;

      // If tab has a single leaf, split it
      const activeTab = state.tabs.find((t) => t.id === tabId)!;
      const newPanes = new Map(state.panes);
      newPanes.set(paneId, paneInfo);

      const leaves = findAllLeaves(activeTab.paneTree);
      const targetLeaf = state.activePaneId && leaves.includes(state.activePaneId)
        ? state.activePaneId
        : leaves[0];

      if (!targetLeaf) return state;

      const splitNode: SplitNode = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        children: [
          createLeaf(targetLeaf),
          createLeaf(paneId),
        ],
      };

      const newTree = replaceInTree(activeTab.paneTree, targetLeaf, splitNode);

      return {
        tabs: state.tabs.map((t) =>
          t.id === tabId ? { ...t, paneTree: newTree } : t,
        ),
        panes: newPanes,
        activePaneId: paneId,
      };
    });

    return paneId;
  },

  splitPane: (paneId, direction, kind, cwd, command) => {
    const newPaneId = generateId();
    const paneInfo: PaneInfo = { id: newPaneId, kind, cwd, command };

    set((state) => {
      const newPanes = new Map(state.panes);
      newPanes.set(newPaneId, paneInfo);

      const splitNode: SplitNode = {
        type: 'split',
        direction,
        ratio: 0.5,
        children: [createLeaf(paneId), createLeaf(newPaneId)],
      };

      const newTabs = state.tabs.map((tab) => ({
        ...tab,
        paneTree: replaceInTree(tab.paneTree, paneId, splitNode),
      }));

      return {
        tabs: newTabs,
        panes: newPanes,
        activePaneId: newPaneId,
      };
    });

    return newPaneId;
  },

  closePane: (paneId) => {
    set((state) => {
      const newPanes = new Map(state.panes);
      newPanes.delete(paneId);

      const newTabs = state.tabs
        .map((tab) => {
          const newTree = removeFromTree(tab.paneTree, paneId);
          if (!newTree) return null;
          return { ...tab, paneTree: newTree };
        })
        .filter((t): t is Tab => t !== null);

      let newActivePaneId = state.activePaneId;
      if (state.activePaneId === paneId) {
        const activeTab = newTabs.find((t) => t.id === state.activeTabId);
        if (activeTab) {
          const leaves = findAllLeaves(activeTab.paneTree);
          newActivePaneId = leaves[0] ?? null;
        } else {
          newActivePaneId = null;
        }
      }

      return {
        tabs: newTabs,
        panes: newPanes,
        activePaneId: newActivePaneId,
        activeTabId:
          newTabs.find((t) => t.id === state.activeTabId)
            ? state.activeTabId
            : newTabs[0]?.id ?? null,
      };
    });
  },

  setActivePane: (paneId) => {
    set({ activePaneId: paneId });
  },

  setRatio: (tabId, splitPath, ratio) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, paneTree: updateRatioInTree(tab.paneTree, splitPath, ratio) }
          : tab,
      ),
    }));
  },

  cyclePaneForward: () => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return state;
      const leaves = findAllLeaves(tab.paneTree);
      const idx = leaves.indexOf(state.activePaneId ?? '');
      const next = leaves[(idx + 1) % leaves.length];
      return { activePaneId: next };
    });
  },

  cyclePaneBackward: () => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (!tab) return state;
      const leaves = findAllLeaves(tab.paneTree);
      const idx = leaves.indexOf(state.activePaneId ?? '');
      const prev = leaves[(idx - 1 + leaves.length) % leaves.length];
      return { activePaneId: prev };
    });
  },

  nextTab: () => {
    set((state) => {
      if (state.tabs.length === 0) return state;
      const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
      const next = state.tabs[(idx + 1) % state.tabs.length];
      return { activeTabId: next.id };
    });
  },

  prevTab: () => {
    set((state) => {
      if (state.tabs.length === 0) return state;
      const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
      const prev = state.tabs[(idx - 1 + state.tabs.length) % state.tabs.length];
      return { activeTabId: prev.id };
    });
  },

  setPaneTitle: (paneId, title) => {
    set((state) => {
      const pane = state.panes.get(paneId);
      if (!pane) return state;
      const newPanes = new Map(state.panes);
      newPanes.set(paneId, { ...pane, title });
      return { panes: newPanes };
    });
  },

  setAgentStatus: (paneId, status) => {
    set((state) => {
      const pane = state.panes.get(paneId);
      if (!pane || pane.agentStatus === status) return state;
      const newPanes = new Map(state.panes);
      newPanes.set(paneId, { ...pane, agentStatus: status });
      return { panes: newPanes };
    });
  },

  setAgentAccentColor: (paneId, color) => {
    set((state) => {
      const pane = state.panes.get(paneId);
      if (!pane || pane.accentColor === color) return state;
      const newPanes = new Map(state.panes);
      newPanes.set(paneId, { ...pane, accentColor: color });
      return { panes: newPanes };
    });
  },

  setSidebarWidth: (width) => {
    set({ sidebarWidth: Math.max(200, Math.min(500, width)) });
  },

  saveSession: async () => {
    const state = useWorkspaceStore.getState();
    // Clear session file if all panes are closed so next launch starts fresh
    if (state.tabs.length === 0) {
      await invoke('clear_session');
      return;
    }

    const tabs = state.tabs.map((tab) => ({
      id: tab.id,
      label: tab.label,
      project_path: tab.projectPath,
      pane_tree: serializePaneTree(tab.paneTree, state.panes),
    }));

    await invoke('save_session', {
      data: {
        tabs,
        active_tab_id: state.activeTabId,
        sidebar_width: state.sidebarWidth,
      },
    });
  },

  loadSession: async () => {
    const result = await invoke<SessionData | null>('load_session');
    if (!result || result.tabs.length === 0) return false;

    const panes = new Map<string, PaneInfo>();
    const tabs: Tab[] = result.tabs.map((tabData) => {
      const paneTree = deserializePaneTree(tabData.pane_tree, panes);
      return {
        id: tabData.id,
        label: tabData.label,
        projectPath: tabData.project_path,
        paneTree,
      };
    });

    set({
      tabs,
      activeTabId: result.active_tab_id ?? tabs[0]?.id ?? null,
      panes,
      sidebarWidth: result.sidebar_width ?? 260,
      activePaneId: (() => {
        const activeTab = tabs.find((t) => t.id === result.active_tab_id) ?? tabs[0];
        if (!activeTab) return null;
        const leaves = findAllLeaves(activeTab.paneTree);
        return leaves[0] ?? null;
      })(),
    });

    return true;
  },
}));

// Session serialization types
interface SessionData {
  tabs: SessionTabData[];
  active_tab_id: string | null;
  sidebar_width: number;
}

interface SessionTabData {
  id: string;
  label: string;
  project_path: string;
  pane_tree: SerializedPaneTree;
}

type SerializedPaneTree =
  | { type: 'leaf'; pane_id: string; kind: PaneKind; cwd: string; command?: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; ratio: number; children: [SerializedPaneTree, SerializedPaneTree] };

function serializePaneTree(tree: PaneTree, panes: Map<string, PaneInfo>): SerializedPaneTree {
  if (tree.type === 'leaf') {
    const pane = panes.get(tree.paneId);
    return {
      type: 'leaf',
      pane_id: tree.paneId,
      kind: pane?.kind ?? 'Shell',
      cwd: pane?.cwd ?? '/home',
      command: pane?.command,
    };
  }
  return {
    type: 'split',
    direction: tree.direction,
    ratio: tree.ratio,
    children: [
      serializePaneTree(tree.children[0], panes),
      serializePaneTree(tree.children[1], panes),
    ],
  };
}

function deserializePaneTree(data: SerializedPaneTree, panes: Map<string, PaneInfo>): PaneTree {
  if (data.type === 'leaf') {
    const paneId = data.pane_id;
    panes.set(paneId, {
      id: paneId,
      kind: data.kind,
      cwd: data.cwd,
      command: data.command,
    });
    return { type: 'leaf', paneId };
  }
  return {
    type: 'split',
    direction: data.direction,
    ratio: data.ratio,
    children: [
      deserializePaneTree(data.children[0], panes),
      deserializePaneTree(data.children[1], panes),
    ],
  };
}
