import { useRef } from 'react';
import { Navigate } from 'react-router';
import { useWorkspaceStore } from '../stores/workspace';
import { TabBar } from '../components/Workspace/TabBar';
import { SplitPane } from '../components/Workspace/SplitPane';
import type { PaneTree } from '../types/pane';

/**
 * The `/workspace` surface: the active window's tab strip and pane layout. The
 * window/tab/pane content itself lives in the workspace store (persisted via
 * Rust), so the URL only marks that the workspace is the active surface. With no
 * active window/tab there is nothing to show — fall back to the dashboard.
 *
 * Every tab that has been activated at least once stays mounted (hidden with
 * `display:none` when not current) instead of being keyed off the active tab.
 * Keying remounted the pane tree on each tab/window switch, and `useTerminal`'s
 * cleanup kills the PTY — so switching tabs used to kill and respawn every
 * terminal/agent, losing scrollback and live work. Keeping them mounted makes
 * switching instant and non-destructive; tabs still spawn lazily on first view.
 */
export function WorkspaceRoute() {
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const windows = useWorkspaceStore((s) => s.windows);

  const activeWindow = activeWindowId ? windows.get(activeWindowId) ?? null : null;
  const activeTabId = activeWindow?.activeTabId ?? null;

  // Tabs activated this mount — kept mounted afterwards regardless of which
  // window/tab is current.
  const activatedTabIds = useRef<Set<string>>(new Set());
  if (activeTabId) activatedTabIds.current.add(activeTabId);

  // Every still-existing tab we've activated, across all windows. Closed tabs
  // drop out naturally (gone from `windows`); their panes are killed elsewhere.
  const mountedTabs: { tabId: string; paneTree: PaneTree }[] = [];
  for (const win of windows.values()) {
    for (const tab of win.tabs) {
      if (activatedTabIds.current.has(tab.id)) {
        mountedTabs.push({ tabId: tab.id, paneTree: tab.paneTree });
      }
    }
  }

  if (!activeWindow || !activeTabId) return <Navigate to="/" replace />;

  return (
    <>
      <TabBar />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {mountedTabs.map(({ tabId, paneTree }) => (
          <div
            key={tabId}
            className="absolute inset-0"
            style={{ display: tabId === activeTabId ? undefined : 'none' }}
          >
            <SplitPane tree={paneTree} tabId={tabId} path={[]} />
          </div>
        ))}
      </div>
    </>
  );
}
