import { create } from 'zustand';

export const APP_NAME = 'Switchyard';

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

  // Overlays
  paletteOpen: boolean;
  helpOpen: boolean;
  treeFocused: boolean;
  setPaletteOpen: (v: boolean) => void;
  togglePalette: () => void;
  setHelpOpen: (v: boolean) => void;
  toggleHelp: () => void;
  setTreeFocused: (v: boolean) => void;
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

  paletteOpen: false,
  helpOpen: false,
  treeFocused: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setHelpOpen: (v) => set({ helpOpen: v }),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  setTreeFocused: (v) => set({ treeFocused: v }),
}));
