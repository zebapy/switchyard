import { useEffect } from 'react';
import { useWorkspaceStore } from '../stores/workspace';

interface UseKeybindingsOptions {
  onTogglePalette: () => void;
  onFocusTree: () => void;
  onToggleHelp: () => void;
  onToggleSettings: () => void;
  onQuit: () => void;
}

function spawnInActiveWindow(kind: 'Agent' | 'Shell') {
  const state = useWorkspaceStore.getState();
  const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
  if (!win) return;
  state.addTab(win.projectPath, win.projectPath.split('/').pop() ?? win.projectPath, { kind });
}

export function useKeybindings({
  onTogglePalette,
  onFocusTree,
  onToggleHelp,
  onToggleSettings,
  onQuit,
}: UseKeybindingsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Space or Cmd/Ctrl+K: Command Palette
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        onTogglePalette();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onTogglePalette();
        return;
      }

      // Ctrl+E: Focus tree
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        onFocusTree();
        return;
      }

      // Ctrl+Q: Quit
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        onQuit();
        return;
      }

      // Cmd/Ctrl+,: Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        onToggleSettings();
        return;
      }

      // Ctrl+Shift+`: previous Window
      if (e.ctrlKey && e.shiftKey && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        useWorkspaceStore.getState().cycleWindowByRecency(-1);
        return;
      }

      // Ctrl+`: next Window
      if (e.ctrlKey && !e.shiftKey && e.key === '`') {
        e.preventDefault();
        useWorkspaceStore.getState().cycleWindowByRecency(1);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab: cycle tab in active Window
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const state = useWorkspaceStore.getState();
        if (e.shiftKey) state.prevTab();
        else state.nextTab();
        return;
      }

      // Cmd+1..8: switch to tab by index; Cmd+9: last tab (iTerm/browser convention)
      if (e.metaKey && !e.ctrlKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const state = useWorkspaceStore.getState();
        const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
        if (!win || win.tabs.length === 0) return;
        e.preventDefault();
        const n = Number(e.key);
        const tab = n === 9 ? win.tabs[win.tabs.length - 1] : win.tabs[n - 1];
        if (tab) state.setActiveTab(tab.id);
        return;
      }

      // Ctrl+A: New agent (in active Window)
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        spawnInActiveWindow('Agent');
        return;
      }

      // Ctrl+T: New terminal (in active Window)
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        spawnInActiveWindow('Shell');
        return;
      }

      // Ctrl+N: Next pane
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        useWorkspaceStore.getState().cyclePaneForward();
        return;
      }

      // Ctrl+P: Previous pane
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        useWorkspaceStore.getState().cyclePaneBackward();
        return;
      }

      // Ctrl+X or Cmd/Ctrl+W: Close active pane (kills tmux per ADR-0002)
      const isClosePane =
        (e.ctrlKey && e.key === 'x') ||
        ((e.metaKey || e.ctrlKey) && e.key === 'w');
      if (isClosePane) {
        e.preventDefault();
        const state = useWorkspaceStore.getState();
        const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
        const activePaneId = win?.activePaneId;
        if (activePaneId) state.closePane(activePaneId);
        return;
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onTogglePalette, onFocusTree, onToggleHelp, onToggleSettings, onQuit]);
}
