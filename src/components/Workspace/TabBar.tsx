import { useWorkspaceStore } from '../../stores/workspace';

export function TabBar() {
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const windows = useWorkspaceStore((s) => s.windows);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const removeTab = useWorkspaceStore((s) => s.removeTab);

  const win = activeWindowId ? windows.get(activeWindowId) : null;
  if (!win || win.tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      {win.tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === win.activeTabId ? 'tab--active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="tab-label">{tab.label}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              removeTab(tab.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
