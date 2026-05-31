import { useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { AddMenu } from '../ProjectTree/AddMenu';
import { RenameField } from '../ProjectTree/RenameField';
import { AiIcon, TermIcon, SplitIcon, CloseIcon } from '../icons';
import type { PaneInfo, PaneTree } from '../../types/pane';

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

function leafIds(tree: PaneTree): string[] {
  if (tree.type === 'leaf') return [tree.paneId];
  return [...leafIds(tree.children[0]), ...leafIds(tree.children[1])];
}

function isRunning(pane: PaneInfo | undefined): boolean {
  return !!pane && pane.kind === 'Agent' && (pane.agentStatus === 'working' || pane.agentStatus === 'waiting');
}

/**
 * Per-Workspace tab strip across the top of the main content area. Mirrors the
 * sidebar's session list as horizontal tabs for the active Workspace. One entry
 * per Tab (a Tab being one SplitPane layout).
 */
export function TabBar() {
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const windows = useWorkspaceStore((s) => s.windows);
  const panes = useWorkspaceStore((s) => s.panes);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const removeTab = useWorkspaceStore((s) => s.removeTab);
  const renameTab = useWorkspaceStore((s) => s.renameTab);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const win = activeWindowId ? windows.get(activeWindowId) ?? null : null;
  if (!win) return null;

  const commitName = (tabId: string, label: string) => {
    if (label.trim()) renameTab(tabId, label.trim());
    setEditingTabId(null);
  };

  return (
    <div className="scroll-thin flex flex-none items-center gap-1 overflow-x-auto border-b border-line bg-side px-2 py-1.5">
      {win.tabs.map((tab) => {
        const leaves = leafIds(tab.paneTree);
        const isSplit = leaves.length > 1;
        const primary = panes.get(leaves[0]);
        const isAi = !isSplit && primary?.kind === 'Agent' && !primary.agentExited;
        const running = leaves.some((id) => isRunning(panes.get(id)));
        const active = win.activeTabId === tab.id;
        const label = isSplit ? tab.label : primary?.customName ?? primary?.title ?? tab.label;

        if (editingTabId === tab.id) {
          return (
            <div key={tab.id} className="flex w-[160px] flex-none items-center rounded-md border border-line bg-active px-2 py-1">
              <RenameField
                initialValue={label}
                onCommit={(value) => commitName(tab.id, value)}
                onCancel={() => setEditingTabId(null)}
              />
            </div>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => setEditingTabId(tab.id)}
            className={
              'group flex max-w-[200px] flex-none items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] transition-colors ' +
              (active
                ? 'border-line bg-active text-ink'
                : 'border-transparent text-ink-dim hover:bg-hover hover:text-ink')
            }
          >
            <span className={`grid shrink-0 place-items-center ${isAi ? 'text-ai' : 'text-ink-faint'}`}>
              {isSplit ? <SplitIcon size={13} /> : isAi ? <AiIcon size={13} /> : <TermIcon size={13} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            {running && <span className="size-1.5 shrink-0 rounded-full bg-green animate-pulse-dot" title="running" />}
            <span
              role="button"
              tabIndex={-1}
              aria-label="Close tab"
              onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
              className="grid size-4 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition hover:bg-ember-tint hover:text-del group-hover:opacity-100"
            >
              <CloseIcon size={11} />
            </span>
          </button>
        );
      })}
      <AddMenu windowPath={win.projectPath} label={basename(win.projectPath)} compact />
    </div>
  );
}
