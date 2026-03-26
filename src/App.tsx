import { useState, useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useWorkspaceStore } from './stores/workspace';
import { ProjectTree } from './components/ProjectTree/ProjectTree';
import { TabBar } from './components/Workspace/TabBar';
import { SplitPane } from './components/Workspace/SplitPane';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { HelpOverlay } from './components/HelpOverlay';
import { useKeybindings } from './hooks/useKeybindings';
import './styles.css';

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [treeFocused, setTreeFocused] = useState(false);

  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const sidebarWidth = useWorkspaceStore((s) => s.sidebarWidth);
  const saveSession = useWorkspaceStore((s) => s.saveSession);
  const loadSession = useWorkspaceStore((s) => s.loadSession);
  const sessionLoaded = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Load session on startup, fall back to default tab
  useEffect(() => {
    if (sessionLoaded.current) return;
    sessionLoaded.current = true;

    loadSession().then((restored) => {
      if (!restored) {
        const cwd = '/home';
        addTab(cwd, 'Home');
      }
    }).catch(() => {
      const cwd = '/home';
      addTab(cwd, 'Home');
    });
  }, []);

  // Save session on window close
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      await saveSession();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [saveSession]);

  // Save session on beforeunload as fallback
  useEffect(() => {
    const handler = () => {
      saveSession();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveSession]);

  const togglePalette = useCallback(() => {
    setPaletteOpen((v) => !v);
  }, []);

  const focusTree = useCallback(() => {
    setTreeFocused(true);
  }, []);

  const toggleHelp = useCallback(() => {
    setHelpOpen((v) => !v);
  }, []);

  const handleQuit = useCallback(async () => {
    await saveSession();
    getCurrentWindow().close();
  }, [saveSession]);

  useKeybindings({
    onTogglePalette: togglePalette,
    onFocusTree: focusTree,
    onToggleHelp: toggleHelp,
    onQuit: handleQuit,
  });

  return (
    <div className="app">
      <div className="app-sidebar" style={{ width: sidebarWidth }}>
        <ProjectTree
          isFocused={treeFocused}
          onFocusLost={() => setTreeFocused(false)}
          onToggleHelp={toggleHelp}
        />
      </div>

      <div className="app-main">
        <TabBar />
        <div className="app-workspace">
          {activeTab ? (
            <SplitPane
              tree={activeTab.paneTree}
              tabId={activeTab.id}
              path={[]}
            />
          ) : (
            <div className="app-empty">
              <p>No open tabs</p>
              <p className="app-empty-hint">
                Select a project from the sidebar or press Ctrl+T for a new terminal
              </p>
            </div>
          )}
        </div>
      </div>

      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onFocusTree={focusTree}
      />

      <HelpOverlay
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
    </div>
  );
}
