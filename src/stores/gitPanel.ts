import { create } from 'zustand';

/**
 * Open/collapsed state and width of the right-hand Git panel. Persisted to
 * localStorage (kept out of the Rust session blob, which only tracks the
 * window/tab tree and the left sidebar width).
 */

const OPEN_KEY = 'gitPanel.open';
const WIDTH_KEY = 'gitPanel.width';
const VIEW_KEY = 'gitPanel.fileView';
const TAB_KEY = 'gitPanel.tab';
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 280;
const MAX_WIDTH = 760;

/** How the changed-files area is laid out.
 *  - `tree` / `list`: the file list (click a row to open its diff in a tab)
 *  - `inline`: every file's diff stacked inline, PR-style, no clicking needed */
export type FileView = 'tree' | 'list' | 'inline';

/** Which top-level section of the Git panel is showing. */
export type PanelTab = 'files' | 'changes' | 'review';

function clampWidth(width: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
}

function readOpen(): boolean {
  // Open by default; only collapsed when the user explicitly closed it before.
  return localStorage.getItem(OPEN_KEY) !== '0';
}

function readWidth(): number {
  const stored = Number(localStorage.getItem(WIDTH_KEY));
  if (Number.isFinite(stored) && stored > 0) return clampWidth(stored);
  return DEFAULT_WIDTH;
}

function readFileView(): FileView {
  const stored = localStorage.getItem(VIEW_KEY);
  if (stored === 'list' || stored === 'inline') return stored;
  return 'tree';
}

function readTab(): PanelTab {
  const stored = localStorage.getItem(TAB_KEY);
  if (stored === 'files' || stored === 'review') return stored;
  return 'changes';
}

interface GitPanelState {
  open: boolean;
  width: number;
  fileView: FileView;
  tab: PanelTab;
  toggle: () => void;
  setOpen: (value: boolean) => void;
  setWidth: (width: number) => void;
  setFileView: (view: FileView) => void;
  setTab: (tab: PanelTab) => void;
}

export const useGitPanelStore = create<GitPanelState>((set) => ({
  open: readOpen(),
  width: readWidth(),
  fileView: readFileView(),
  tab: readTab(),
  toggle: () =>
    set((state) => {
      const open = !state.open;
      localStorage.setItem(OPEN_KEY, open ? '1' : '0');
      return { open };
    }),
  setOpen: (value) => {
    localStorage.setItem(OPEN_KEY, value ? '1' : '0');
    set({ open: value });
  },
  setWidth: (width) => {
    const next = clampWidth(width);
    localStorage.setItem(WIDTH_KEY, String(next));
    set({ width: next });
  },
  setFileView: (view) => {
    localStorage.setItem(VIEW_KEY, view);
    set({ fileView: view });
  },
  setTab: (tab) => {
    localStorage.setItem(TAB_KEY, tab);
    set({ tab });
  },
}));
