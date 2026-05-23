import { useState, useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useWorkspaceStore } from './stores/workspace';
import { ProjectTree } from './components/ProjectTree/ProjectTree';
import { TabBar } from './components/Workspace/TabBar';
import { SplitPane } from './components/Workspace/SplitPane';
import { BlankWorkspace } from './components/Workspace/BlankWorkspace';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { HelpOverlay } from './components/HelpOverlay';
import { SettingsOverlay } from './components/SettingsOverlay';
import { CloseConfirmDialog } from './components/CloseConfirmDialog';
import { TopBar } from './components/TopBar';
import { useKeybindings } from './hooks/useKeybindings';
import type { TmuxSessionInfo } from './types/tmux';
import './styles.css';

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [treeFocused, setTreeFocused] = useState(false);
  const [closePrompt, setClosePrompt] = useState<{ open: boolean; sessions: TmuxSessionInfo[] }>({
    open: false,
    sessions: [],
  });

  const windows = useWorkspaceStore((s) => s.windows);
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
  const setSidebarWidth = useWorkspaceStore((s) => s.setSidebarWidth);
  const saveSession = useWorkspaceStore((s) => s.saveSession);
  const loadSession = useWorkspaceStore((s) => s.loadSession);
  const sessionLoaded = useRef(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const activeWindow = activeWindowId ? windows.get(activeWindowId) ?? null : null;
  const activeTab = activeWindow
    ? activeWindow.tabs.find((t) => t.id === activeWindow.activeTabId) ?? null
    : null;

  useEffect(() => {
    if (sessionLoaded.current) return;
    sessionLoaded.current = true;
    loadSession().catch(() => null);
  }, [loadSession]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      const sessions = await invoke<TmuxSessionInfo[]>('list_tmux_sessions').catch(() => []);
      if (sessions.length === 0) {
        await saveSession();
        return;
      }
      event.preventDefault();
      setClosePrompt({ open: true, sessions });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [saveSession]);

  const cancelClose = useCallback(() => {
    setClosePrompt({ open: false, sessions: [] });
  }, []);

  const detachAndClose = useCallback(async () => {
    setClosePrompt({ open: false, sessions: [] });
    await saveSession();
    await getCurrentWindow().destroy();
  }, [saveSession]);

  const killAllAndClose = useCallback(async () => {
    const { sessions } = closePrompt;
    setClosePrompt({ open: false, sessions: [] });
    await Promise.all(
      sessions.map((s) => invoke('kill_tmux_session', { name: s.name }).catch(() => null)),
    );
    await saveSession();
    await getCurrentWindow().destroy();
  }, [closePrompt, saveSession]);

  useEffect(() => {
    const handler = () => { saveSession(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveSession]);

  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);
  const focusTree = useCallback(() => setTreeFocused(true), []);
  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);
  const toggleSettings = useCallback(() => setSettingsOpen((v) => !v), []);

  useEffect(() => {
    const unlisten = listen('menu:settings', () => {
      setSettingsOpen(true);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

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
      const next = start.startWidth + (ev.clientX - start.startX);
      setSidebarWidth(next);
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
    setSidebarWidth(260);
    saveSession();
  }, [setSidebarWidth, saveSession]);

  useKeybindings({
    onTogglePalette: togglePalette,
    onFocusTree: focusTree,
    onToggleHelp: toggleHelp,
    onToggleSettings: toggleSettings,
    onQuit: handleQuit,
  });

  return (
    <div className="app">
      <TopBar onOpenPalette={togglePalette} />
      <div className="app-body">
        <div className="app-sidebar" style={{ width: sidebarWidth }}>
          <ProjectTree
            isFocused={treeFocused}
            onFocusLost={() => setTreeFocused(false)}
            onToggleHelp={toggleHelp}
          />
        </div>

        <div
          className="app-sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onMouseDown={handleResizerMouseDown}
          onDoubleClick={handleResizerDoubleClick}
        />

        <div className="app-main">
          {activeWindow ? <TabBar /> : null}
          <div className="app-workspace">
            {activeWindow && activeTab && (
              <SplitPane
                key={activeTab.id}
                tree={activeTab.paneTree}
                tabId={activeTab.id}
                path={[]}
              />
            )}
            {!activeWindow && <BlankWorkspace />}
          </div>
        </div>
      </div>

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onFocusTree={focusTree}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <HelpOverlay
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      <SettingsOverlay
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

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
