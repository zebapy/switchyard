import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  PaneTree,
  PaneInfo,
  PaneKind,
  Tab,
  LeafNode,
  SplitNode,
  AgentStatus,
  Window,
} from '../types/pane';
import { maybeNotifyTransition } from '../notifications';

function generateId(): string {
  return crypto.randomUUID();
}

function createLeaf(paneId: string): LeafNode {
  return { type: 'leaf', paneId };
}

function replaceInTree(tree: PaneTree, targetId: string, replacement: PaneTree): PaneTree {
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

function removeFromTree(tree: PaneTree, targetId: string): PaneTree | null {
  if (tree.type === 'leaf') {
    return tree.paneId === targetId ? null : tree;
  }
  const left = removeFromTree(tree.children[0], targetId);
  const right = removeFromTree(tree.children[1], targetId);
  if (left === null) return right;
  if (right === null) return left;
  return { ...tree, children: [left, right] };
}

function findAllLeaves(tree: PaneTree): string[] {
  if (tree.type === 'leaf') return [tree.paneId];
  return [...findAllLeaves(tree.children[0]), ...findAllLeaves(tree.children[1])];
}

function updateRatioInTree(tree: PaneTree, splitPath: number[], ratio: number): PaneTree {
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

function paneSessionName(pane: PaneInfo): string {
  return pane.tmuxSession ?? `wip-${pane.id}`;
}

async function killPaneResources(pane: PaneInfo): Promise<void> {
  await invoke('pty_kill', { id: pane.id }).catch(() => null);
  await invoke('kill_tmux_session', { name: paneSessionName(pane) }).catch(() => null);
}

async function detachPaneResources(pane: PaneInfo): Promise<void> {
  await invoke('pty_kill', { id: pane.id }).catch(() => null);
}

interface AddTabOptions {
  kind?: PaneKind;
  tmuxSession?: string;
  command?: string;
  cwd?: string;
  label?: string;
  /** For Agent panes: command of the chosen agent (e.g. "claude"). Empty = default. */
  agent?: string;
  /** For Diff panes: repo-relative file whose diff is shown. */
  diffFile?: string;
  /** For Diff panes: which diff to show (unstaged | staged | base). */
  diffSource?: string;
  /** For File panes: repo-relative file shown in the viewer. */
  filePath?: string;
}

interface WorkspaceState {
  /** Path -> Window. */
  windows: Map<string, Window>;
  activeWindowId: string | null;
  /** Global pane lookup. Each pane belongs to exactly one Window's tab tree. */
  panes: Map<string, PaneInfo>;
  sidebarWidth: number;
  sidebarCollapsed: boolean;

  // Window actions
  openWindow: (projectPath: string) => void;
  switchWindow: (projectPath: string) => void;
  closeWindow: (projectPath: string) => Promise<void>;
  cycleWindowByRecency: (direction: 1 | -1) => void;

  // Tab actions (operate on a specific window — defaults to active)
  addTab: (projectPath: string, label: string, opts?: AddTabOptions) => string;
  removeTab: (tabId: string) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  renameTab: (tabId: string, label: string) => void;
  nextTab: () => void;
  prevTab: () => void;

  // Pane actions
  addPane: (
    tabId: string,
    kind: PaneKind,
    cwd: string,
    command?: string,
    tmuxSession?: string,
    agent?: string,
  ) => string;
  splitPane: (
    paneId: string,
    direction: 'horizontal' | 'vertical',
    kind: PaneKind,
    cwd: string,
    command?: string,
    tmuxSession?: string,
    agent?: string,
  ) => string;
  closePane: (paneId: string) => Promise<void>;
  detachPane: (paneId: string) => Promise<void>;
  setActivePane: (paneId: string) => void;
  /** Like setActivePane but also activates the pane's window and tab, so the pane becomes visible. */
  focusPane: (paneId: string) => void;
  setRatio: (tabId: string, splitPath: number[], ratio: number) => void;

  cyclePaneForward: () => void;
  cyclePaneBackward: () => void;

  // Pane metadata
  setPaneTitle: (paneId: string, title: string) => void;
  setPaneName: (paneId: string, name: string) => void;
  setAgentStatus: (paneId: string, status: AgentStatus) => void;
  setAgentAccentColor: (paneId: string, color: string) => void;
  setAgentExited: (paneId: string) => void;

  // Layout
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;

  // Session persistence
  saveSession: () => Promise<void>;
  loadSession: () => Promise<boolean>;

  // Lookups
  getActiveWindow: () => Window | null;
  findWindowForTab: (tabId: string) => Window | null;
  findWindowForPane: (paneId: string) => Window | null;
}

function findWindowForTabId(windows: Map<string, Window>, tabId: string): Window | null {
  for (const win of windows.values()) {
    if (win.tabs.some((t) => t.id === tabId)) return win;
  }
  return null;
}

function findWindowForPaneId(windows: Map<string, Window>, paneId: string): Window | null {
  for (const win of windows.values()) {
    for (const tab of win.tabs) {
      if (findAllLeaves(tab.paneTree).includes(paneId)) return win;
    }
  }
  return null;
}

function cloneWindow(win: Window): Window {
  return { ...win, tabs: [...win.tabs] };
}

function withWindow(
  windows: Map<string, Window>,
  projectPath: string,
  patch: (win: Window) => Window | null,
): Map<string, Window> {
  const existing = windows.get(projectPath);
  if (!existing) return windows;
  const next = patch(cloneWindow(existing));
  const out = new Map(windows);
  if (next) out.set(projectPath, next);
  else out.delete(projectPath);
  return out;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  windows: new Map(),
  activeWindowId: null,
  panes: new Map(),
  sidebarWidth: 260,
  sidebarCollapsed: false,

  getActiveWindow: () => {
    const { windows, activeWindowId } = get();
    return activeWindowId ? windows.get(activeWindowId) ?? null : null;
  },

  findWindowForTab: (tabId) => findWindowForTabId(get().windows, tabId),
  findWindowForPane: (paneId) => findWindowForPaneId(get().windows, paneId),

  openWindow: (projectPath) => {
    set((state) => {
      const existing = state.windows.get(projectPath);
      const next = new Map(state.windows);
      if (existing) {
        next.set(projectPath, { ...existing, lastActiveAt: Date.now() });
      } else {
        next.set(projectPath, {
          projectPath,
          tabs: [],
          activeTabId: null,
          activePaneId: null,
          lastActiveAt: Date.now(),
        });
      }
      return { windows: next, activeWindowId: projectPath };
    });
  },

  switchWindow: (projectPath) => {
    set((state) => {
      const win = state.windows.get(projectPath);
      if (!win) return state;
      const next = new Map(state.windows);
      next.set(projectPath, { ...win, lastActiveAt: Date.now() });
      return { windows: next, activeWindowId: projectPath };
    });
  },

  closeWindow: async (projectPath) => {
    const win = get().windows.get(projectPath);
    if (!win) return;
    const paneIds: string[] = [];
    for (const tab of win.tabs) paneIds.push(...findAllLeaves(tab.paneTree));
    const panesMap = get().panes;
    await Promise.all(
      paneIds.map((id) => {
        const pane = panesMap.get(id);
        return pane ? killPaneResources(pane) : Promise.resolve();
      }),
    );
    set((state) => {
      const nextPanes = new Map(state.panes);
      for (const id of paneIds) nextPanes.delete(id);
      const nextWindows = new Map(state.windows);
      nextWindows.delete(projectPath);
      const wasActive = state.activeWindowId === projectPath;
      return {
        windows: nextWindows,
        panes: nextPanes,
        activeWindowId: wasActive ? null : state.activeWindowId,
      };
    });
  },

  cycleWindowByRecency: (direction) => {
    set((state) => {
      const sorted = Array.from(state.windows.values()).sort(
        (a, b) => b.lastActiveAt - a.lastActiveAt,
      );
      if (sorted.length === 0) return state;
      const idx = sorted.findIndex((w) => w.projectPath === state.activeWindowId);
      const nextIdx = (idx + direction + sorted.length) % sorted.length;
      const target = sorted[nextIdx];
      const next = new Map(state.windows);
      next.set(target.projectPath, { ...target, lastActiveAt: Date.now() });
      return { windows: next, activeWindowId: target.projectPath };
    });
  },

  addTab: (projectPath, label, opts) => {
    const tabId = generateId();
    const paneId = generateId();
    const paneInfo: PaneInfo = {
      id: paneId,
      kind: opts?.kind ?? 'Shell',
      cwd: opts?.cwd ?? projectPath,
      command: opts?.command,
      tmuxSession: opts?.tmuxSession,
      agent: opts?.agent,
      diffFile: opts?.diffFile,
      diffSource: opts?.diffSource,
      filePath: opts?.filePath,
    };
    const tab: Tab = {
      id: tabId,
      label: opts?.label ?? label,
      paneTree: createLeaf(paneId),
    };

    set((state) => {
      const nextPanes = new Map(state.panes);
      nextPanes.set(paneId, paneInfo);

      const existing = state.windows.get(projectPath);
      const baseWindow: Window = existing ?? {
        projectPath,
        tabs: [],
        activeTabId: null,
        activePaneId: null,
        lastActiveAt: Date.now(),
      };
      const nextWindow: Window = {
        ...baseWindow,
        tabs: [...baseWindow.tabs, tab],
        activeTabId: tabId,
        activePaneId: paneId,
        lastActiveAt: Date.now(),
      };
      const nextWindows = new Map(state.windows);
      nextWindows.set(projectPath, nextWindow);
      return {
        windows: nextWindows,
        activeWindowId: projectPath,
        panes: nextPanes,
      };
    });

    return tabId;
  },

  removeTab: async (tabId) => {
    const win = findWindowForTabId(get().windows, tabId);
    if (!win) return;
    const tab = win.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const paneIds = findAllLeaves(tab.paneTree);
    const panesMap = get().panes;
    await Promise.all(
      paneIds.map((id) => {
        const pane = panesMap.get(id);
        return pane ? killPaneResources(pane) : Promise.resolve();
      }),
    );
    set((state) => {
      const nextPanes = new Map(state.panes);
      for (const id of paneIds) nextPanes.delete(id);

      const nextWindows = withWindow(state.windows, win.projectPath, (w) => {
        const remainingTabs = w.tabs.filter((t) => t.id !== tabId);
        if (remainingTabs.length === 0) return null; // hard-destroy
        const nextActiveTab =
          w.activeTabId === tabId
            ? remainingTabs[remainingTabs.length - 1].id
            : w.activeTabId;
        const activeTab = remainingTabs.find((t) => t.id === nextActiveTab);
        const nextActivePane = activeTab ? findAllLeaves(activeTab.paneTree)[0] ?? null : null;
        return {
          ...w,
          tabs: remainingTabs,
          activeTabId: nextActiveTab,
          activePaneId: nextActivePane,
        };
      });

      const windowDestroyed = !nextWindows.has(win.projectPath);
      return {
        windows: nextWindows,
        panes: nextPanes,
        activeWindowId:
          windowDestroyed && state.activeWindowId === win.projectPath
            ? null
            : state.activeWindowId,
      };
    });
  },

  setActiveTab: (tabId) => {
    const win = findWindowForTabId(get().windows, tabId);
    if (!win) return;
    set((state) => {
      const tab = win.tabs.find((t) => t.id === tabId);
      if (!tab) return state;
      const leaves = findAllLeaves(tab.paneTree);
      const activePane = leaves.includes(win.activePaneId ?? '') ? win.activePaneId : leaves[0] ?? null;
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        activeTabId: tabId,
        activePaneId: activePane,
        lastActiveAt: Date.now(),
      }));
      return { windows: nextWindows, activeWindowId: win.projectPath };
    });
  },

  renameTab: (tabId, label) => {
    const win = findWindowForTabId(get().windows, tabId);
    if (!win) return;
    set((state) => {
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        tabs: w.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
      }));
      return { windows: nextWindows };
    });
  },

  nextTab: () => {
    set((state) => {
      const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
      if (!win || win.tabs.length === 0) return state;
      const idx = win.tabs.findIndex((t) => t.id === win.activeTabId);
      const next = win.tabs[(idx + 1) % win.tabs.length];
      const leaves = findAllLeaves(next.paneTree);
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        activeTabId: next.id,
        activePaneId: leaves[0] ?? null,
      }));
      return { windows: nextWindows };
    });
  },

  prevTab: () => {
    set((state) => {
      const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
      if (!win || win.tabs.length === 0) return state;
      const idx = win.tabs.findIndex((t) => t.id === win.activeTabId);
      const next = win.tabs[(idx - 1 + win.tabs.length) % win.tabs.length];
      const leaves = findAllLeaves(next.paneTree);
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        activeTabId: next.id,
        activePaneId: leaves[0] ?? null,
      }));
      return { windows: nextWindows };
    });
  },

  addPane: (tabId, kind, cwd, command, tmuxSession, agent) => {
    const win = findWindowForTabId(get().windows, tabId);
    if (!win) return '';
    const paneId = generateId();
    const paneInfo: PaneInfo = { id: paneId, kind, cwd, command, tmuxSession, agent };

    set((state) => {
      const tab = win.tabs.find((t) => t.id === tabId);
      if (!tab) return state;
      const nextPanes = new Map(state.panes);
      nextPanes.set(paneId, paneInfo);

      const leaves = findAllLeaves(tab.paneTree);
      const targetLeaf =
        win.activePaneId && leaves.includes(win.activePaneId) ? win.activePaneId : leaves[0];
      if (!targetLeaf) return state;

      const splitNode: SplitNode = {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        children: [createLeaf(targetLeaf), createLeaf(paneId)],
      };
      const newTree = replaceInTree(tab.paneTree, targetLeaf, splitNode);

      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        tabs: w.tabs.map((t) => (t.id === tabId ? { ...t, paneTree: newTree } : t)),
        activePaneId: paneId,
      }));
      return { windows: nextWindows, panes: nextPanes };
    });

    return paneId;
  },

  splitPane: (paneId, direction, kind, cwd, command, tmuxSession, agent) => {
    const win = findWindowForPaneId(get().windows, paneId);
    if (!win) return '';
    const newPaneId = generateId();
    const paneInfo: PaneInfo = { id: newPaneId, kind, cwd, command, tmuxSession, agent };

    set((state) => {
      const nextPanes = new Map(state.panes);
      nextPanes.set(newPaneId, paneInfo);

      const splitNode: SplitNode = {
        type: 'split',
        direction,
        ratio: 0.5,
        children: [createLeaf(paneId), createLeaf(newPaneId)],
      };

      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        tabs: w.tabs.map((t) => ({
          ...t,
          paneTree: replaceInTree(t.paneTree, paneId, splitNode),
        })),
        activePaneId: newPaneId,
      }));
      return { windows: nextWindows, panes: nextPanes };
    });

    return newPaneId;
  },

  closePane: async (paneId) => {
    const pane = get().panes.get(paneId);
    if (!pane) return;
    await killPaneResources(pane);
    removePaneFromState(paneId);
  },

  detachPane: async (paneId) => {
    const pane = get().panes.get(paneId);
    if (!pane) return;
    await detachPaneResources(pane);
    removePaneFromState(paneId);
  },

  setActivePane: (paneId) => {
    const win = findWindowForPaneId(get().windows, paneId);
    if (!win) return;
    set((state) => {
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        activePaneId: paneId,
        lastActiveAt: Date.now(),
      }));
      return { windows: nextWindows, activeWindowId: win.projectPath };
    });
  },

  focusPane: (paneId) => {
    const win = findWindowForPaneId(get().windows, paneId);
    if (!win) return;
    const tab = win.tabs.find((t) => findAllLeaves(t.paneTree).includes(paneId));
    set((state) => {
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        activeTabId: tab ? tab.id : w.activeTabId,
        activePaneId: paneId,
        lastActiveAt: Date.now(),
      }));
      return { windows: nextWindows, activeWindowId: win.projectPath };
    });
  },

  setRatio: (tabId, splitPath, ratio) => {
    const win = findWindowForTabId(get().windows, tabId);
    if (!win) return;
    set((state) => {
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        tabs: w.tabs.map((t) =>
          t.id === tabId ? { ...t, paneTree: updateRatioInTree(t.paneTree, splitPath, ratio) } : t,
        ),
      }));
      return { windows: nextWindows };
    });
  },

  cyclePaneForward: () => {
    set((state) => {
      const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
      if (!win || !win.activeTabId) return state;
      const tab = win.tabs.find((t) => t.id === win.activeTabId);
      if (!tab) return state;
      const leaves = findAllLeaves(tab.paneTree);
      if (leaves.length === 0) return state;
      const idx = leaves.indexOf(win.activePaneId ?? '');
      const next = leaves[(idx + 1) % leaves.length];
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        activePaneId: next,
      }));
      return { windows: nextWindows };
    });
  },

  cyclePaneBackward: () => {
    set((state) => {
      const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
      if (!win || !win.activeTabId) return state;
      const tab = win.tabs.find((t) => t.id === win.activeTabId);
      if (!tab) return state;
      const leaves = findAllLeaves(tab.paneTree);
      if (leaves.length === 0) return state;
      const idx = leaves.indexOf(win.activePaneId ?? '');
      const next = leaves[(idx - 1 + leaves.length) % leaves.length];
      const nextWindows = withWindow(state.windows, win.projectPath, (w) => ({
        ...w,
        activePaneId: next,
      }));
      return { windows: nextWindows };
    });
  },

  setPaneTitle: (paneId, title) => {
    set((state) => {
      const pane = state.panes.get(paneId);
      if (!pane) return state;
      const next = new Map(state.panes);
      next.set(paneId, { ...pane, title });
      return { panes: next };
    });
  },

  setPaneName: (paneId, name) => {
    set((state) => {
      const pane = state.panes.get(paneId);
      if (!pane) return state;
      // Empty string clears the custom name, falling back to the terminal title.
      const customName = name.trim() || undefined;
      if (pane.customName === customName) return state;
      const next = new Map(state.panes);
      next.set(paneId, { ...pane, customName });
      return { panes: next };
    });
  },

  setAgentStatus: (paneId, status) => {
    const prev = get().panes.get(paneId)?.agentStatus;
    set((state) => {
      const pane = state.panes.get(paneId);
      if (!pane || pane.agentStatus === status) return state;
      const next = new Map(state.panes);
      next.set(paneId, { ...pane, agentStatus: status });
      return { panes: next };
    });
    // Only notify on a real transition (the reducer above no-ops otherwise).
    if (prev !== status) maybeNotifyTransition(paneId, prev, status);
  },

  setAgentAccentColor: (paneId, color) => {
    set((state) => {
      const pane = state.panes.get(paneId);
      if (!pane || pane.accentColor === color) return state;
      const next = new Map(state.panes);
      next.set(paneId, { ...pane, accentColor: color });
      return { panes: next };
    });
  },

  setAgentExited: (paneId) => {
    set((state) => {
      const pane = state.panes.get(paneId);
      if (!pane || pane.agentExited) return state;
      const next = new Map(state.panes);
      // Drop the agent status so it stops counting as a live agent and the
      // sidebar shows it as a plain terminal.
      next.set(paneId, { ...pane, agentExited: true, agentStatus: undefined });
      return { panes: next };
    });
  },

  setSidebarWidth: (width) => {
    set({ sidebarWidth: Math.max(180, Math.min(600, width)) });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  saveSession: async () => {
    const state = useWorkspaceStore.getState();
    if (state.windows.size === 0) {
      await invoke('clear_session');
      return;
    }
    const windows = Array.from(state.windows.values()).map((win) => ({
      project_path: win.projectPath,
      tabs: win.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        pane_tree: serializePaneTree(tab.paneTree, state.panes),
      })),
      active_tab_id: win.activeTabId,
      active_pane_id: win.activePaneId,
      last_active_at: win.lastActiveAt,
    }));
    await invoke('save_session', {
      data: {
        windows,
        active_window_id: state.activeWindowId,
        sidebar_width: state.sidebarWidth,
      },
    });
  },

  loadSession: async () => {
    const result = await invoke<SessionData | null>('load_session');
    if (!result || !result.windows || result.windows.length === 0) return false;

    const panes = new Map<string, PaneInfo>();
    const windows = new Map<string, Window>();
    for (const winData of result.windows) {
      const tabs: Tab[] = winData.tabs.map((tabData) => ({
        id: tabData.id,
        label: tabData.label,
        paneTree: deserializePaneTree(tabData.pane_tree, panes),
      }));
      windows.set(winData.project_path, {
        projectPath: winData.project_path,
        tabs,
        activeTabId: winData.active_tab_id ?? tabs[0]?.id ?? null,
        activePaneId: winData.active_pane_id ?? null,
        lastActiveAt: winData.last_active_at ?? Date.now(),
      });
    }

    set({
      windows,
      activeWindowId: result.active_window_id ?? windows.keys().next().value ?? null,
      panes,
      sidebarWidth: result.sidebar_width ?? 260,
    });
    return true;
  },
}));

function removePaneFromState(paneId: string) {
  const win = findWindowForPaneId(useWorkspaceStore.getState().windows, paneId);
  if (!win) return;
  useWorkspaceStore.setState((state) => {
    const nextPanes = new Map(state.panes);
    nextPanes.delete(paneId);

    const nextWindows = withWindow(state.windows, win.projectPath, (w) => {
      const newTabs: Tab[] = [];
      for (const tab of w.tabs) {
        const newTree = removeFromTree(tab.paneTree, paneId);
        if (newTree) newTabs.push({ ...tab, paneTree: newTree });
      }
      if (newTabs.length === 0) return null; // hard-destroy Window

      let nextActiveTabId = w.activeTabId;
      let nextActivePaneId = w.activePaneId === paneId ? null : w.activePaneId;
      // If the active tab disappeared, fall back to the last remaining tab.
      if (!newTabs.find((t) => t.id === nextActiveTabId)) {
        nextActiveTabId = newTabs[newTabs.length - 1].id;
      }
      if (!nextActivePaneId) {
        const activeTab = newTabs.find((t) => t.id === nextActiveTabId);
        nextActivePaneId = activeTab ? findAllLeaves(activeTab.paneTree)[0] ?? null : null;
      }
      return {
        ...w,
        tabs: newTabs,
        activeTabId: nextActiveTabId,
        activePaneId: nextActivePaneId,
      };
    });

    const windowDestroyed = !nextWindows.has(win.projectPath);
    return {
      windows: nextWindows,
      panes: nextPanes,
      activeWindowId:
        windowDestroyed && state.activeWindowId === win.projectPath
          ? null
          : state.activeWindowId,
    };
  });
}

// ---------------- Session serialisation ----------------

interface SessionData {
  windows: SessionWindowData[];
  active_window_id: string | null;
  sidebar_width: number;
}

interface SessionWindowData {
  project_path: string;
  tabs: SessionTabData[];
  active_tab_id: string | null;
  active_pane_id: string | null;
  last_active_at: number;
}

interface SessionTabData {
  id: string;
  label: string;
  pane_tree: SerializedPaneTree;
}

type SerializedPaneTree =
  | {
      type: 'leaf';
      pane_id: string;
      kind: PaneKind;
      cwd: string;
      command?: string;
      custom_name?: string;
      tmux_session?: string;
      agent?: string;
      diff_file?: string;
      diff_source?: string;
      file_path?: string;
    }
  | {
      type: 'split';
      direction: 'horizontal' | 'vertical';
      ratio: number;
      children: [SerializedPaneTree, SerializedPaneTree];
    };

function serializePaneTree(tree: PaneTree, panes: Map<string, PaneInfo>): SerializedPaneTree {
  if (tree.type === 'leaf') {
    const pane = panes.get(tree.paneId);
    return {
      type: 'leaf',
      pane_id: tree.paneId,
      kind: pane?.kind ?? 'Shell',
      cwd: pane?.cwd ?? '/home',
      command: pane?.command,
      custom_name: pane?.customName,
      tmux_session: pane?.tmuxSession,
      agent: pane?.agent,
      diff_file: pane?.diffFile,
      diff_source: pane?.diffSource,
      file_path: pane?.filePath,
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

function deserializePaneTree(
  data: SerializedPaneTree,
  panes: Map<string, PaneInfo>,
): PaneTree {
  if (data.type === 'leaf') {
    const paneId = data.pane_id;
    panes.set(paneId, {
      id: paneId,
      kind: data.kind,
      cwd: data.cwd,
      command: data.command,
      customName: data.custom_name,
      tmuxSession: data.tmux_session,
      agent: data.agent,
      diffFile: data.diff_file,
      diffSource: data.diff_source,
      filePath: data.file_path,
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
