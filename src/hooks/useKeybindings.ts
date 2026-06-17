import { useEffect } from 'react';
import { useWorkspaceStore } from '../stores/workspace';
import { useProjectsStore } from '../stores/projects';
import { useGitPanelStore } from '../stores/gitPanel';
import { useUiStore } from '../stores/ui';
import { goToWorkspace } from '../router';

interface UseKeybindingsOptions {
  onTogglePalette: () => void;
  onFocusTree: () => void;
  onToggleHelp: () => void;
  onToggleSettings: () => void;
  onQuit: () => void;
}

/** New tab in the active window (does not split the current pane). Agents launch
 *  with the default (first configured) agent. */
function spawnInActiveWindow(kind: 'Agent' | 'Shell') {
  const state = useWorkspaceStore.getState();
  const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
  if (!win) return;
  const agent = kind === 'Agent' ? useProjectsStore.getState().agents[0]?.command : undefined;
  state.addTab(win.projectPath, win.projectPath.split('/').pop() ?? win.projectPath, { kind, agent });
  goToWorkspace();
}

function activePane() {
  const state = useWorkspaceStore.getState();
  const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
  const paneId = win?.activePaneId ?? null;
  return { state, win, paneId };
}

/** Split the active pane, spawning a shell in the new half. */
function splitActivePane(direction: 'horizontal' | 'vertical') {
  const { state, paneId } = activePane();
  if (!paneId) return;
  const cwd = state.panes.get(paneId)?.cwd ?? '.';
  state.splitPane(paneId, direction, 'Shell', cwd);
  goToWorkspace();
}

function closeActivePane() {
  const { state, paneId } = activePane();
  if (paneId) state.closePane(paneId);
}

function detachActivePane() {
  const { state, paneId } = activePane();
  if (paneId) state.detachPane(paneId);
}

function closeActiveTab() {
  const { state, win } = activePane();
  if (win?.activeTabId) state.removeTab(win.activeTabId);
}

/** Switch to the Nth top-level project (1-based) — same as clicking its base
 *  branch in the sidebar: reveal its window if open, else start the default
 *  agent there. Worktree children are excluded so numbering matches the tree. */
function switchToProjectByIndex(n: number) {
  const navList = useProjectsStore.getState().projects.filter((p) => !p.worktree_parent);
  const project = navList[n - 1];
  if (!project) return;
  const ws = useWorkspaceStore.getState();
  const win = ws.windows.get(project.path);
  if (win && win.tabs.length > 0) {
    ws.switchWindow(project.path);
    ws.setActiveTab(win.activeTabId ?? win.tabs[0].id);
  } else {
    const agent = useProjectsStore.getState().agents[0]?.command;
    ws.addTab(project.path, project.name, { kind: 'Agent', cwd: project.path, agent });
  }
  goToWorkspace();
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
      // ---- Global ----

      // Ctrl+Space or ⌘K: command palette
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        onTogglePalette();
        return;
      }
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        onTogglePalette();
        return;
      }

      // ⌘/ or F1: help overlay
      if ((e.metaKey && e.key === '/') || e.key === 'F1') {
        e.preventDefault();
        onToggleHelp();
        return;
      }

      // ⌘,: settings
      if (e.metaKey && e.key === ',') {
        e.preventDefault();
        onToggleSettings();
        return;
      }

      // ⌘⇧E: focus project tree
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        onFocusTree();
        return;
      }

      // ⌘B: toggle sidebar
      if (e.metaKey && !e.shiftKey && e.key === 'b') {
        e.preventDefault();
        useWorkspaceStore.getState().toggleSidebar();
        return;
      }

      // ⌘⇧G: toggle the Git panel
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        useGitPanelStore.getState().toggle();
        return;
      }

      // Ctrl+Q: quit
      if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        onQuit();
        return;
      }

      // ---- Windows ----

      // ⌥1..9: switch to the Nth top-level project. Option (not Control) because
      // macOS reserves ⌃1..9 for Mission Control "switch to Desktop N" — the OS
      // eats those before the app ever sees them. Match e.code so the special
      // glyphs Option produces (¡™£…) don't matter; stopPropagation so the
      // keystroke doesn't also leak an Esc-sequence into a focused terminal.
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        switchToProjectByIndex(Number(e.code.slice(5)));
        return;
      }

      // Ctrl+Shift+`: previous window
      if (e.ctrlKey && e.shiftKey && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        useWorkspaceStore.getState().cycleWindowByRecency(-1);
        return;
      }
      // Ctrl+`: next window
      if (e.ctrlKey && !e.shiftKey && e.key === '`') {
        e.preventDefault();
        useWorkspaceStore.getState().cycleWindowByRecency(1);
        return;
      }

      // ---- Tabs (sessions) ----

      // Ctrl+Tab / Ctrl+Shift+Tab: cycle tab in active window
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const state = useWorkspaceStore.getState();
        if (e.shiftKey) state.prevTab();
        else state.nextTab();
        goToWorkspace();
        return;
      }

      // ⌘1..8: switch to tab by index; ⌘9: last tab (iTerm/browser convention)
      if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const state = useWorkspaceStore.getState();
        const win = state.activeWindowId ? state.windows.get(state.activeWindowId) : null;
        if (!win || win.tabs.length === 0) return;
        e.preventDefault();
        const n = Number(e.key);
        const tab = n === 9 ? win.tabs[win.tabs.length - 1] : win.tabs[n - 1];
        if (tab) { state.setActiveTab(tab.id); goToWorkspace(); }
        return;
      }

      // ⌘T: new terminal tab
      if (e.metaKey && !e.shiftKey && e.key === 't') {
        e.preventDefault();
        spawnInActiveWindow('Shell');
        return;
      }

      // ⌘⇧T: new chat (agent) tab
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        spawnInActiveWindow('Agent');
        return;
      }

      // ⌘↵: new agent tab
      if (e.metaKey && !e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        spawnInActiveWindow('Agent');
        return;
      }

      // ⌘⇧W: close tab
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        closeActiveTab();
        return;
      }

      // ---- Panes ----

      // ⌘D: split right
      if (e.metaKey && !e.shiftKey && e.key === 'd') {
        e.preventDefault();
        splitActivePane('horizontal');
        return;
      }
      // ⌘⇧D: split down
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        splitActivePane('vertical');
        return;
      }

      // ⌘]: next pane
      if (e.metaKey && e.key === ']') {
        e.preventDefault();
        useWorkspaceStore.getState().cyclePaneForward();
        return;
      }
      // ⌘[: previous pane
      if (e.metaKey && e.key === '[') {
        e.preventDefault();
        useWorkspaceStore.getState().cyclePaneBackward();
        return;
      }

      // ⌘⇧X: detach pane (keeps tmux session alive)
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        detachActivePane();
        return;
      }

      // ⌘W: close active pane (kills tmux per ADR-0002)
      if (e.metaKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault();
        closeActivePane();
        return;
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onTogglePalette, onFocusTree, onToggleHelp, onToggleSettings, onQuit]);

  // Mirror the Option/Alt and Command/Meta held state into the UI store so the
  // project tree can show ⌥N switch hints and the tab strip can show ⌘N hints.
  // Reset on blur so a hint can't stick if focus is lost mid-hold (keyup never fires).
  useEffect(() => {
    const { setAltHeld, setMetaHeld } = useUiStore.getState();
    const onKey = (e: KeyboardEvent) => {
      setAltHeld(e.altKey);
      setMetaHeld(e.metaKey);
    };
    const onBlur = () => {
      setAltHeld(false);
      setMetaHeld(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
