import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWorkspaceStore } from '../stores/workspace';
import { useUiStore } from '../stores/ui';
import { TopBar } from '../components/TopBar';
import { SidebarNav } from '../components/Sidebar/SidebarNav';
import { SidebarSearch } from '../components/Sidebar/SidebarSearch';
import { ProjectTree } from '../components/ProjectTree/ProjectTree';
import { SettingsNav } from '../components/Sidebar/SettingsNav';
import { SettingsExitProvider } from '../components/SettingsExitContext';
import { NewWorktreeModal } from '../components/Worktree/NewWorktreeModal';
import { CloneRepoModal } from '../components/Project/CloneRepoModal';
import { SendFeedbackModal } from '../components/Feedback/SendFeedbackModal';
import { GithubConnectModal } from '../components/Github/GithubConnectModal';
import { ScriptPalette } from '../components/Workspace/ScriptPalette';
import { CloudSessionModal } from '../components/CloudSession/CloudSessionModal';
import { CommandPalette } from '../components/CommandPalette/CommandPalette';
import { HelpOverlay } from '../components/HelpOverlay';
import { CloseConfirmDialog } from '../components/CloseConfirmDialog';
import { GitPanel } from '../components/GitPanel/GitPanel';
import { useKeybindings } from '../hooks/useKeybindings';
import { initNotifications, consumePendingFocus } from '../notifications';
import { checkForUpdates } from '../lib/updater';
import { disposeWarmSessions, requestAgentPrewarm } from '../lib/agentPrewarm';
import type { TmuxSessionInfo } from '../types/tmux';
import '../styles.css';

/**
 * Persistent app chrome — top bar, sidebar, git panel, modals, global
 * keybindings — wrapping the routed main content rendered through `<Outlet/>`.
 */
export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const inSettings = location.pathname.startsWith('/settings');
  // The workspace's own TabBar carries the traffic-light clearance and
  // back/forward buttons when the sidebar is collapsed, so the standalone
  // TopBar strip would just be a redundant second bar there.
  const inWorkspace = location.pathname.startsWith('/workspace');

  const [closePrompt, setClosePrompt] = useState<{ open: boolean; sessions: TmuxSessionInfo[] }>({
    open: false,
    sessions: [],
  });

  const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  const setSidebarWidth = useWorkspaceStore((s) => s.setSidebarWidth);
  const saveSession = useWorkspaceStore((s) => s.saveSession);
  const loadSession = useWorkspaceStore((s) => s.loadSession);
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);

  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const helpOpen = useUiStore((s) => s.helpOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const togglePalette = useUiStore((s) => s.togglePalette);
  const setHelpOpen = useUiStore((s) => s.setHelpOpen);
  const toggleHelp = useUiStore((s) => s.toggleHelp);
  const setTreeFocused = useUiStore((s) => s.setTreeFocused);

  // Settings is left by returning here, not by history back: switching sections
  // pushes history entries, so back would walk sections instead of exiting.
  const preSettingsPath = useRef('/');
  useEffect(() => {
    if (inSettings) return;
    preSettingsPath.current = `${location.pathname}${location.search}`;
  }, [inSettings, location.pathname, location.search]);

  const exitSettings = useCallback(() => {
    navigate(preSettingsPath.current);
  }, [navigate]);

  const sessionLoaded = useRef(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (sessionLoaded.current) return;
    sessionLoaded.current = true;
    // Returning from Zen Mode remounts this layout with windows already live and
    // newer than disk — reload only on a genuine cold start, else just resume.
    const ws = useWorkspaceStore.getState();
    if (ws.windows.size > 0) {
      if (ws.activeWindowId) navigate('/workspace');
      return;
    }
    loadSession()
      .then((loaded) => { if (loaded) navigate('/workspace'); })
      .catch(() => null);
  }, [loadSession, navigate]);

  // Keep an agent warm for the active workspace, so ⌘⇧T / ⌘↵ attaches to a
  // running agent instead of waiting for one to start.
  useEffect(() => {
    requestAgentPrewarm(activeWindowId);
  }, [activeWindowId]);
  useEffect(() => () => { requestAgentPrewarm(null); }, []);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      // Prewarmed agents belong to this run and are hidden from the session
      // list, so drop them before deciding whether any session is left to save.
      await disposeWarmSessions();
      const sessions = await invoke<TmuxSessionInfo[]>('list_tmux_sessions').catch(() => []);
      if (sessions.length === 0) { await saveSession(); return; }
      event.preventDefault();
      setClosePrompt({ open: true, sessions });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [saveSession]);

  useEffect(() => {
    const handler = () => {
      saveSession();
      void disposeWarmSessions();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveSession]);

  useEffect(() => {
    const unlisten = listen('menu:settings', () => navigate('/settings'));
    return () => { unlisten.then((fn) => fn()); };
  }, [navigate]);

  useEffect(() => {
    initNotifications().catch(() => null);
  }, []);

  useEffect(() => {
    checkForUpdates().catch(() => null);
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

  const toggleSettings = useCallback(() => {
    if (inSettings) exitSettings();
    else navigate('/settings');
  }, [exitSettings, inSettings, navigate]);

  useKeybindings({
    onTogglePalette: togglePalette,
    onFocusTree: () => setTreeFocused(true),
    onToggleHelp: toggleHelp,
    onToggleSettings: toggleSettings,
    onQuit: handleQuit,
  });

  return (
    <SettingsExitProvider exit={exitSettings}>
      <div className="flex h-full w-full flex-col">
        {sidebarCollapsed && !inWorkspace && <TopBar />}

        <div className="flex min-h-0 flex-1">
          {!sidebarCollapsed && (
            <>
              <aside
                style={{ width: sidebarWidth }}
                className="relative flex shrink-0 flex-col overflow-hidden border-r border-line bg-linear-to-b from-side2 to-side"
              >
                <SidebarNav />
                <SidebarSearch />
                {inSettings ? <SettingsNav /> : <ProjectTree />}
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
            <Outlet />
          </main>

          <GitPanel />
        </div>

        <NewWorktreeModal />
        <CloneRepoModal />
        <SendFeedbackModal />
        <GithubConnectModal />
        <ScriptPalette />
        <CloudSessionModal />

        <CommandPalette
          isOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onFocusTree={() => setTreeFocused(true)}
          onOpenSettings={() => navigate('/settings')}
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
    </SettingsExitProvider>
  );
}
