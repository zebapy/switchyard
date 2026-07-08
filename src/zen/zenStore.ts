import { create } from 'zustand';

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
  /** ⌘P — the global jump palette. */
  paletteOpen: boolean;
  /** ⌘K — contextual actions for the current selection (varies per tier). */
  actionMenuOpen: boolean;

  setCursor: (tier: ZenTier, index: number) => void;
  enterProject: (projectPath: string) => void;
  enterWorktree: (worktreePath: string) => void;
  back: () => void;
  focus: (paneId: string) => void;
  escapeFocus: () => void;
  /** Jump straight to a focused pane (from the palette), setting its context. */
  jumpToPane: (projectPath: string, worktreePath: string, paneId: string) => void;
  /** Jump to a worktree's pane tier (from the palette). */
  jumpToWorktree: (projectPath: string, worktreePath: string) => void;
  openPalette: () => void;
  closePalette: () => void;
  openActionMenu: () => void;
  closeActionMenu: () => void;
}

export const useZenStore = create<ZenNavState>((set) => ({
  tier: 'projects',
  projectPath: null,
  worktreePath: null,
  cursor: { projects: 0, worktrees: 0, panes: 0 },
  focusedPaneId: null,
  paletteOpen: false,
  actionMenuOpen: false,

  setCursor: (tier, index) =>
    set((s) => ({ cursor: { ...s.cursor, [tier]: Math.max(0, index) } })),

  enterProject: (projectPath) =>
    set((s) => ({ tier: 'worktrees', projectPath, worktreePath: null, cursor: { ...s.cursor, worktrees: 0 } })),

  enterWorktree: (worktreePath) =>
    set((s) => ({ tier: 'panes', worktreePath, cursor: { ...s.cursor, panes: 0 } })),

  back: () =>
    set((s) => {
      if (s.tier === 'panes') return { tier: 'worktrees' };
      if (s.tier === 'worktrees') return { tier: 'projects' };
      return s;
    }),

  focus: (paneId) => set({ focusedPaneId: paneId }),
  escapeFocus: () => set({ focusedPaneId: null }),

  jumpToPane: (projectPath, worktreePath, paneId) =>
    set({ tier: 'panes', projectPath, worktreePath, focusedPaneId: paneId, paletteOpen: false, actionMenuOpen: false }),

  jumpToWorktree: (projectPath, worktreePath) =>
    set((s) => ({ tier: 'panes', projectPath, worktreePath, focusedPaneId: null, paletteOpen: false, actionMenuOpen: false, cursor: { ...s.cursor, panes: 0 } })),

  openPalette: () => set({ paletteOpen: true, actionMenuOpen: false }),
  closePalette: () => set({ paletteOpen: false }),
  openActionMenu: () => set({ actionMenuOpen: true, paletteOpen: false }),
  closeActionMenu: () => set({ actionMenuOpen: false }),
}));
