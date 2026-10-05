import { create } from 'zustand';

export const APP_NAME = 'Switchyard';

// Zen Mode is persisted in localStorage (not the Rust session) so it's known
// before any store loads — `main.tsx` reads it to decide which whole interface
// to mount on startup, the standard chrome or the single-focus Zen layout.
const ZEN_MODE_KEY = 'switchyard.zenMode';
function readZenMode(): boolean {
  return localStorage.getItem(ZEN_MODE_KEY) === '1';
}
function persistZenMode(value: boolean): void {
  localStorage.setItem(ZEN_MODE_KEY, value ? '1' : '0');
}

interface WorktreeModalState {
  open: boolean;
  projectPath: string | null;
  baseBranch: string | null;
}

interface ScriptPaletteState {
  open: boolean;
  /** Project root to scan for manifests. */
  projectPath: string | null;
  /** Window + cwd for the spawned tab. */
  windowPath: string | null;
  /** Base label for the spawned tab. */
  label: string | null;
}

interface OpenScriptPaletteArgs {
  projectPath: string;
  windowPath: string;
  label: string;
}

interface CloudSessionModalState {
  open: boolean;
  projectPath: string | null;
  projectName: string | null;
}

interface OpenCloudSessionModalArgs {
  projectPath: string;
  projectName: string;
}

interface UiState {
  worktreeModal: WorktreeModalState;
  openWorktreeModal: (projectPath: string, baseBranch: string | null) => void;
  closeWorktreeModal: () => void;

  cloneModalOpen: boolean;
  openCloneModal: () => void;
  closeCloneModal: () => void;

  /** "Send feedback" modal that files a GitHub issue against the Switchyard repo. */
  feedbackOpen: boolean;
  openFeedback: () => void;
  closeFeedback: () => void;

  /** Shared GitHub device-flow connect modal, reused by settings, feedback and worktree. */
  githubConnectOpen: boolean;
  openGithubConnect: () => void;
  closeGithubConnect: () => void;

  scriptPalette: ScriptPaletteState;
  openScriptPalette: (args: OpenScriptPaletteArgs) => void;
  closeScriptPalette: () => void;

  /** "New cloud session" task prompt that runs `claude --cloud` for a project. */
  cloudSessionModal: CloudSessionModalState;
  openCloudSessionModal: (args: OpenCloudSessionModalArgs) => void;
  closeCloudSessionModal: () => void;

  /** True while the Option/Alt key is held — drives the ⌥N project-switch hints in the tree. */
  altHeld: boolean;
  setAltHeld: (v: boolean) => void;

  /** True while the Command/Meta key is held — drives the ⌘N tab-switch hints in the tab strip. */
  metaHeld: boolean;
  setMetaHeld: (v: boolean) => void;

  // Overlays
  paletteOpen: boolean;
  helpOpen: boolean;
  treeFocused: boolean;
  /** Context-aware "new" menu anchored bottom-left (⌘⇧K). Content follows the active view. */
  addMenuOpen: boolean;
  setAddMenuOpen: (v: boolean) => void;
  toggleAddMenu: () => void;
  setPaletteOpen: (v: boolean) => void;
  togglePalette: () => void;
  setHelpOpen: (v: boolean) => void;
  toggleHelp: () => void;
  setTreeFocused: (v: boolean) => void;

  /** When true, the single-focus Zen layout replaces the standard chrome. */
  zenMode: boolean;
  setZenMode: (v: boolean) => void;
  toggleZenMode: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  worktreeModal: { open: false, projectPath: null, baseBranch: null },
  openWorktreeModal: (projectPath, baseBranch) =>
    set({ worktreeModal: { open: true, projectPath, baseBranch } }),
  closeWorktreeModal: () =>
    set({ worktreeModal: { open: false, projectPath: null, baseBranch: null } }),

  cloneModalOpen: false,
  openCloneModal: () => set({ cloneModalOpen: true }),
  closeCloneModal: () => set({ cloneModalOpen: false }),

  feedbackOpen: false,
  openFeedback: () => set({ feedbackOpen: true }),
  closeFeedback: () => set({ feedbackOpen: false }),

  githubConnectOpen: false,
  openGithubConnect: () => set({ githubConnectOpen: true }),
  closeGithubConnect: () => set({ githubConnectOpen: false }),

  scriptPalette: { open: false, projectPath: null, windowPath: null, label: null },
  openScriptPalette: ({ projectPath, windowPath, label }) =>
    set({ scriptPalette: { open: true, projectPath, windowPath, label } }),
  closeScriptPalette: () =>
    set({ scriptPalette: { open: false, projectPath: null, windowPath: null, label: null } }),

  cloudSessionModal: { open: false, projectPath: null, projectName: null },
  openCloudSessionModal: ({ projectPath, projectName }) =>
    set({ cloudSessionModal: { open: true, projectPath, projectName } }),
  closeCloudSessionModal: () =>
    set({ cloudSessionModal: { open: false, projectPath: null, projectName: null } }),

  altHeld: false,
  setAltHeld: (v) => set((s) => (s.altHeld === v ? s : { altHeld: v })),

  metaHeld: false,
  setMetaHeld: (v) => set((s) => (s.metaHeld === v ? s : { metaHeld: v })),

  paletteOpen: false,
  helpOpen: false,
  treeFocused: false,
  addMenuOpen: false,
  setAddMenuOpen: (v) => set({ addMenuOpen: v }),
  toggleAddMenu: () => set((s) => ({ addMenuOpen: !s.addMenuOpen })),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setHelpOpen: (v) => set({ helpOpen: v }),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  setTreeFocused: (v) => set({ treeFocused: v }),

  zenMode: readZenMode(),
  setZenMode: (v) => { persistZenMode(v); set({ zenMode: v }); },
  toggleZenMode: () => set((s) => { const v = !s.zenMode; persistZenMode(v); return { zenMode: v }; }),
}));
