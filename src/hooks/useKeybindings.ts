import { useEffect } from 'react';
import { useWorkspaceStore } from '../stores/workspace';

interface UseKeybindingsOptions {
  onTogglePalette: () => void;
  onFocusTree: () => void;
  onToggleHelp: () => void;
  onQuit: () => void;
}

export function useKeybindings({
  onTogglePalette,
  onFocusTree,
  onToggleHelp,
  onQuit,
}: UseKeybindingsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Space: Command Palette
      if (e.ctrlKey && e.code === 'Space') {
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

      // Ctrl+A: New agent
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        const state = useWorkspaceStore.getState();
        if (state.activePaneId) {
          const pane = state.panes.get(state.activePaneId);
          if (pane) {
            state.splitPane(state.activePaneId, 'horizontal', 'Agent', pane.cwd);
          }
        }
        return;
      }

      // Ctrl+T: New terminal
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        const state = useWorkspaceStore.getState();
        if (state.activePaneId) {
          const pane = state.panes.get(state.activePaneId);
          if (pane) {
            state.splitPane(state.activePaneId, 'horizontal', 'Shell', pane.cwd);
          }
        }
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

      // Ctrl+X: Close pane
      if (e.ctrlKey && e.key === 'x') {
        e.preventDefault();
        const state = useWorkspaceStore.getState();
        if (state.activePaneId) {
          state.closePane(state.activePaneId);
        }
        return;
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onTogglePalette, onFocusTree, onToggleHelp, onQuit]);
}
