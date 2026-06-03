import { Navigate } from 'react-router';
import { useWorkspaceStore } from '../stores/workspace';
import { TabBar } from '../components/Workspace/TabBar';
import { SplitPane } from '../components/Workspace/SplitPane';

/**
 * The `/workspace` surface: the active window's tab strip and pane layout. The
 * window/tab/pane content itself lives in the workspace store (persisted via
 * Rust), so the URL only marks that the workspace is the active surface. With no
 * active window/tab there is nothing to show — fall back to the dashboard.
 */
export function WorkspaceRoute() {
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const windows = useWorkspaceStore((s) => s.windows);

  const activeWindow = activeWindowId ? windows.get(activeWindowId) ?? null : null;
  const activeTab = activeWindow
    ? activeWindow.tabs.find((t) => t.id === activeWindow.activeTabId) ?? null
    : null;

  if (!activeWindow || !activeTab) return <Navigate to="/" replace />;

  return (
    <>
      <TabBar />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <SplitPane key={activeTab.id} tree={activeTab.paneTree} tabId={activeTab.id} path={[]} />
      </div>
    </>
  );
}
