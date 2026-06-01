import { create } from 'zustand';
import { SETTINGS_SECTIONS } from '../components/settingsSections';

export const APP_NAME = 'Switchyard';

interface WorktreeModalState {
  open: boolean;
  projectPath: string | null;
  baseBranch: string | null;
}

interface UiState {
  /** Which surface fills the main region. */
  mainView: 'dashboard' | 'pane' | 'settings';
  showDashboard: () => void;
  showPane: () => void;

  worktreeModal: WorktreeModalState;
  openWorktreeModal: (projectPath: string, baseBranch: string | null) => void;
  closeWorktreeModal: () => void;

  cloneModalOpen: boolean;
  openCloneModal: () => void;
  closeCloneModal: () => void;

  // Overlays
  paletteOpen: boolean;
  helpOpen: boolean;
  treeFocused: boolean;
  setPaletteOpen: (v: boolean) => void;
  togglePalette: () => void;
  setHelpOpen: (v: boolean) => void;
  toggleHelp: () => void;
  setSettingsOpen: (v: boolean) => void;
  toggleSettings: () => void;
  setTreeFocused: (v: boolean) => void;

  /** Active settings section, shared between the sidebar nav and the settings page. */
  settingsSection: string;
  setSettingsSection: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mainView: 'dashboard',
  showDashboard: () => set({ mainView: 'dashboard' }),
  showPane: () => set({ mainView: 'pane' }),

  worktreeModal: { open: false, projectPath: null, baseBranch: null },
  openWorktreeModal: (projectPath, baseBranch) =>
    set({ worktreeModal: { open: true, projectPath, baseBranch } }),
  closeWorktreeModal: () =>
    set({ worktreeModal: { open: false, projectPath: null, baseBranch: null } }),

  cloneModalOpen: false,
  openCloneModal: () => set({ cloneModalOpen: true }),
  closeCloneModal: () => set({ cloneModalOpen: false }),

  paletteOpen: false,
  helpOpen: false,
  treeFocused: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setHelpOpen: (v) => set({ helpOpen: v }),
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  setSettingsOpen: (v) =>
    set({ mainView: v ? 'settings' : 'pane', settingsSection: SETTINGS_SECTIONS[0].id }),
  toggleSettings: () =>
    set((s) => ({
      mainView: s.mainView === 'settings' ? 'pane' : 'settings',
      settingsSection: SETTINGS_SECTIONS[0].id,
    })),
  setTreeFocused: (v) => set({ treeFocused: v }),

  settingsSection: SETTINGS_SECTIONS[0].id,
  setSettingsSection: (id) => set({ settingsSection: id }),
}));
