import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWorkspaceStore } from './stores/workspace';
import { useUiStore } from './stores/ui';
import { SidebarSearch } from './components/Sidebar/SidebarSearch';
import { ProjectTree } from './components/ProjectTree/ProjectTree';
import { SettingsNav } from './components/Sidebar/SettingsNav';
import { SplitPane } from './components/Workspace/SplitPane';
import { TabBar } from './components/Workspace/TabBar';
import { Dashboard } from './components/Dashboard/Dashboard';
import { NewWorktreeModal } from './components/Worktree/NewWorktreeModal';
import { CloneRepoModal } from './components/Project/CloneRepoModal';
import { SendFeedbackModal } from './components/Feedback/SendFeedbackModal';
import { GithubConnectModal } from './components/Github/GithubConnectModal';
import { ScriptPalette } from './components/Workspace/ScriptPalette';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { HelpOverlay } from './components/HelpOverlay';
import { SettingsPage } from './components/SettingsPage';
import { CloseConfirmDialog } from './components/CloseConfirmDialog';
import { GitPanel } from './components/GitPanel/GitPanel';
import { useKeybindings } from './hooks/useKeybindings';
import { initNotifications, consumePendingFocus } from './notifications';
import type { TmuxSessionInfo } from './types/tmux';
import './styles.css';

export default function App() {
  const [closePrompt, setClosePrompt] = useState<{ open: boolean; sessions: TmuxSessionInfo[] }>({
    open: false,
    sessions: [],
  });

  const windows = useWorkspaceStore((s) => s.windows);
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  const setSidebarWidth = useWorkspaceStore((s) => s.setSidebarWidth);
  const saveSession = useWorkspaceStore((s) => s.saveSession);
  const loadSession = useWorkspaceStore((s) => s.loadSession);

  const mainView = useUiStore((s) => s.mainView);
  const showPane = useUiStore((s) => s.showPane);
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const helpOpen = useUiStore((s) => s.helpOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const togglePalette = useUiStore((s) => s.togglePalette);
  const setHelpOpen = useUiStore((s) => s.setHelpOpen);
  const toggleHelp = useUiStore((s) => s.toggleHelp);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const toggleSettings = useUiStore((s) => s.toggleSettings);
  const setTreeFocused = useUiStore((s) => s.setTreeFocused);

  const sessionLoaded = useRef(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const activeWindow = activeWindowId ? windows.get(activeWindowId) ?? null : null;
  const activeTab = activeWindow ? activeWindow.tabs.find((t) => t.id === activeWindow.activeTabId) ?? null : null;

  useEffect(() => {
    if (sessionLoaded.current) return;
    sessionLoaded.current = true;
    loadSession()
      .then((loaded) => { if (loaded) showPane(); })
      .catch(() => null);
  }, [loadSession, showPane]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      const sessions = await invoke<TmuxSessionInfo[]>('list_tmux_sessions').catch(() => []);
      if (sessions.length === 0) { await saveSession(); return; }
      event.preventDefault();
      setClosePrompt({ open: true, sessions });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [saveSession]);

  useEffect(() => {
    const handler = () => { saveSession(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveSession]);

  useEffect(() => {
    const unlisten = listen('menu:settings', () => setSettingsOpen(true));
    return () => { unlisten.then((fn) => fn()); };
  }, [setSettingsOpen]);

  useEffect(() => {
    initNotifications().catch(() => null);
  }, []);

  // Desktop notifications can't report which one was clicked, so when the app
  // regains focus (e.g. from a notification click) route to the pane that last
  // notified.
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) return;
      const paneId = consumePendingFocus();
      if (paneId) useWorkspaceStore.getState().focusPane(paneId);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const cancelClose = useCallback(() => setClosePrompt({ open: false, sessions: [] }), []);

  const detachAndClose = useCallback(async () => {
    setClosePrompt({ open: false, sessions: [] });
    await saveSession();
    await getCurrentWindow().destroy();
  }, [saveSession]);

  const killAllAndClose = useCallback(async () => {
    const { sessions } = closePrompt;
    setClosePrompt({ open: false, sessions: [] });
    await Promise.all(sessions.map((s) => invoke('kill_tmux_session', { name: s.name }).catch(() => null)));
    await saveSession();
    await getCurrentWindow().destroy();
  }, [closePrompt, saveSession]);

  const handleQuit = useCallback(async () => {
    await saveSession();
    getCurrentWindow().close();
  }, [saveSession]);

  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      setSidebarWidth(start.startWidth + (ev.clientX - start.startX));
    };
    const onUp = () => {
      dragStartRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      saveSession();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarWidth, setSidebarWidth, saveSession]);

  const handleResizerDoubleClick = useCallback(() => {
    setSidebarWidth(300);
    saveSession();
  }, [setSidebarWidth, saveSession]);

  useKeybindings({
    onTogglePalette: togglePalette,
    onFocusTree: () => setTreeFocused(true),
    onToggleHelp: toggleHelp,
    onToggleSettings: toggleSettings,
    onQuit: handleQuit,
  });

  return (
    <div className="flex h-full w-full">
      {!sidebarCollapsed && (
        <>
          <aside
            style={{ width: sidebarWidth }}
            className="relative flex shrink-0 flex-col overflow-hidden border-r border-line bg-linear-to-b from-side2 to-side"
          >
            <SidebarSearch />
            {mainView === 'settings' ? <SettingsNav /> : <ProjectTree />}
          </aside>

          <div
            className="relative z-[5] -mx-0.5 w-1 shrink-0 cursor-col-resize transition-colors hover:bg-ember/40"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={handleResizerMouseDown}
            onDoubleClick={handleResizerDoubleClick}
          />
        </>
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
        {mainView === 'settings' ? (
          <SettingsPage onClose={() => setSettingsOpen(false)} />
        ) : mainView === 'pane' && activeWindow && activeTab ? (
          <>
            <TabBar />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <SplitPane key={activeTab.id} tree={activeTab.paneTree} tabId={activeTab.id} path={[]} />
            </div>
          </>
        ) : (
          <Dashboard />
        )}
      </main>

      <GitPanel />

      <NewWorktreeModal />
      <CloneRepoModal />
      <SendFeedbackModal />
      <GithubConnectModal />
      <ScriptPalette />

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onFocusTree={() => setTreeFocused(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <HelpOverlay isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <CloseConfirmDialog
        isOpen={closePrompt.open}
        sessions={closePrompt.sessions}
        onCancel={cancelClose}
        onDetach={detachAndClose}
        onKillAll={killAllAndClose}
      />
    </div>
  );
}
