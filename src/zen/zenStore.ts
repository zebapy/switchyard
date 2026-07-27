import { create } from 'zustand';
import type { DiffSource } from '../types/gitpanel';

/** Which tier of the drill-down the cursor is currently on. */
export type ZenTier = 'projects' | 'worktrees' | 'panes';

interface ZenNavState {
  tier: ZenTier;
  /** Drilled-into project (a top-level repo path). */
  projectPath: string | null;
  /** Drilled-into worktree (a window key — root or git worktree path). */
  worktreePath: string | null;
  /** Selection index, kept per tier so climbing back restores position. */
  cursor: Record<ZenTier, number>;
  /** Non-null = Focus mode: this pane owns the keyboard, edges glow. */
  focusedPaneId: string | null;
  /** ⌘P — the context-aware sort menu for the current tier. */
  sortMenuOpen: boolean;
  /** ⌘K — contextual actions for the current selection (varies per tier). */
  actionMenuOpen: boolean;
  /** ⌘O — "Open in…" the current directory in an external app. */
  openInOpen: boolean;
  /** ⌘⇧K — context-aware "new" menu anchored bottom-left (add project / new session). */
  addMenuOpen: boolean;
  /** Non-null = the ephemeral "View diff" view is overtaking the main area for this worktree path. */
  diffPath: string | null;
  /** What the open diff is compared against (unstaged / staged / vs base branch). */
  diffSource: DiffSource;
  /** ⌘P — the diff-source picker overlay is open. */
  diffPickerOpen: boolean;
  /** ⌘, — the Settings overlay (standard settings surfaces hosted inside Zen). */
  settingsOpen: boolean;
  /** Toolbar search text — fuzzy-narrows the current tier's list. Cleared on any tier change. */
  query: string;

  setCursor: (tier: ZenTier, index: number) => void;
  /** Update the search query and snap the current tier's cursor back to the top match. */
  setQuery: (query: string) => void;
  enterProject: (projectPath: string) => void;
  enterWorktree: (worktreePath: string) => void;
  back: () => void;
  focus: (paneId: string) => void;
  escapeFocus: () => void;
  openSortMenu: () => void;
  closeSortMenu: () => void;
  openActionMenu: () => void;
  closeActionMenu: () => void;
  openOpenIn: () => void;
  closeOpenIn: () => void;
  openAddMenu: () => void;
  closeAddMenu: () => void;
  /** Overtake the main area with the diff view for `worktreePath`. */
  openDiff: (worktreePath: string) => void;
  closeDiff: () => void;
  setDiffSource: (source: DiffSource) => void;
  openDiffPicker: () => void;
  closeDiffPicker: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useZenStore = create<ZenNavState>((set) => ({
  tier: 'projects',
  projectPath: null,
  worktreePath: null,
  cursor: { projects: 0, worktrees: 0, panes: 0 },
  focusedPaneId: null,
  sortMenuOpen: false,
  actionMenuOpen: false,
  openInOpen: false,
  addMenuOpen: false,
  diffPath: null,
  diffSource: 'base',
  diffPickerOpen: false,
  settingsOpen: false,
  query: '',

  setCursor: (tier, index) =>
    set((s) => ({ cursor: { ...s.cursor, [tier]: Math.max(0, index) } })),

  setQuery: (query) =>
    set((s) => ({ query, cursor: { ...s.cursor, [s.tier]: 0 } })),

  enterProject: (projectPath) =>
    set((s) => ({ tier: 'worktrees', projectPath, worktreePath: null, query: '', cursor: { ...s.cursor, worktrees: 0 } })),

  enterWorktree: (worktreePath) =>
    set((s) => ({ tier: 'panes', worktreePath, query: '', cursor: { ...s.cursor, panes: 0 } })),

  back: () =>
    set((s) => {
      if (s.tier === 'panes') return { tier: 'worktrees', worktreePath: null, query: '' };
      if (s.tier === 'worktrees') return { tier: 'projects', projectPath: null, worktreePath: null, query: '' };
      return s;
    }),

  focus: (paneId) => set({ focusedPaneId: paneId }),
  escapeFocus: () => set({ focusedPaneId: null }),

  openSortMenu: () => set({ sortMenuOpen: true, actionMenuOpen: false, openInOpen: false, addMenuOpen: false }),
  closeSortMenu: () => set({ sortMenuOpen: false }),
  openActionMenu: () => set({ actionMenuOpen: true, sortMenuOpen: false, openInOpen: false, addMenuOpen: false }),
  closeActionMenu: () => set({ actionMenuOpen: false }),
  openOpenIn: () => set({ openInOpen: true, sortMenuOpen: false, actionMenuOpen: false, addMenuOpen: false }),
  closeOpenIn: () => set({ openInOpen: false }),
  openAddMenu: () => set({ addMenuOpen: true, sortMenuOpen: false, actionMenuOpen: false, openInOpen: false }),
  closeAddMenu: () => set({ addMenuOpen: false }),

  openDiff: (worktreePath) =>
    set({
      diffPath: worktreePath,
      diffSource: 'base',
      diffPickerOpen: false,
      actionMenuOpen: false,
      sortMenuOpen: false,
      openInOpen: false,
      addMenuOpen: false,
    }),
  closeDiff: () => set({ diffPath: null, diffPickerOpen: false }),
  setDiffSource: (source) => set({ diffSource: source, diffPickerOpen: false }),
  openDiffPicker: () => set({ diffPickerOpen: true }),
  closeDiffPicker: () => set({ diffPickerOpen: false }),

  openSettings: () =>
    set({ settingsOpen: true, actionMenuOpen: false, sortMenuOpen: false, openInOpen: false, addMenuOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),
}));
