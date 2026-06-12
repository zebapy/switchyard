import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
import { useGitPanelStore } from '../../stores/gitPanel';
import { useUiStore } from '../../stores/ui';
import { AddMenu } from '../ProjectTree/AddMenu';
import { BranchMenu } from '../GitPanel/BranchMenu';
import { OpenInMenu } from './OpenInMenu';
import { RenameField } from '../ProjectTree/RenameField';
import { AiIcon, TermIcon, SplitIcon, CloseIcon, BaseBranchIcon, WorktreeIcon, PanelRightIcon } from '../icons';
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

/** ⌘N hint for the tab at `index`: ⌘1…8 map to the first eight tabs and ⌘9
 *  always jumps to the last — matching the keybindings in useKeybindings. */
function tabSwitchHint(index: number, total: number): string | null {
  if (index < 8) return `⌘${index + 1}`;
  if (index === total - 1) return '⌘9';
  return null;
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
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const gitPanelOpen = useGitPanelStore((s) => s.open);
  const toggleGitPanel = useGitPanelStore((s) => s.toggle);
  const metaHeld = useUiStore((s) => s.metaHeld);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const win = activeWindowId ? windows.get(activeWindowId) ?? null : null;

  // Branch context for the active window, derived the same way as the pane header
  // used to. Memoized so it only re-scans gitInfo when the map or active project
  // changes — not on every pane-status tick that re-renders this strip.
  const { branch, isMainWt, projectRoot } = useMemo(() => {
    const projectPath = win?.projectPath;
    if (!projectPath) return { branch: null as string | null, isMainWt: true, projectRoot: null as string | null };
    for (const [root, info] of gitInfo) {
      const wt = info.worktrees.find((w) => w.path === projectPath);
      if (wt) return { branch: wt.branch, isMainWt: wt.is_main, projectRoot: root };
    }
    return { branch: gitInfo.get(projectPath)?.branch ?? null, isMainWt: true, projectRoot: null as string | null };
  }, [gitInfo, win?.projectPath]);

  if (!win) return null;

  const commitName = (tabId: string, label: string) => {
    if (label.trim()) renameTab(tabId, label.trim());
    setEditingTabId(null);
  };

  return (
    <div data-tauri-drag-region className="flex flex-none flex-col border-b border-line bg-side">
      {/* Top row: workspace + branch on the left, "Open in" on the right. */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 border-b border-line-soft py-1.5 pl-3 pr-3"
      >
        <div data-tauri-drag-region className="flex min-w-0 items-center gap-[7px] text-[13px] text-ink-dim">
          <span className="truncate text-ink-dim">{basename(win.projectPath)}</span>
          {branch && (
            <>
              <span className="text-ink-ghost">/</span>
              <span className={`inline-flex ${isMainWt ? 'text-ink-dim' : 'text-ink-faint'}`}>
                {isMainWt ? <BaseBranchIcon size={13} /> : <WorktreeIcon size={13} />}
              </span>
              <BranchMenu path={win.projectPath} branch={branch} />
            </>
          )}
        </div>
        <div className="ml-auto flex flex-none items-center gap-1">
          <OpenInMenu path={win.projectPath} />
          <button
            type="button"
            onClick={toggleGitPanel}
            title="Toggle Git panel (⌘⇧G)"
            aria-label="Toggle Git panel"
            className={
              'grid size-[26px] place-items-center rounded-md transition-colors ' +
              (gitPanelOpen ? 'bg-active text-ember' : 'text-ink-faint hover:bg-hover hover:text-ink')
            }
          >
            <PanelRightIcon size={14} />
          </button>
        </div>
      </div>

      {/* Bottom row: the tab strip. */}
      <div data-tauri-drag-region className="scroll-thin flex min-w-0 items-center gap-1 overflow-x-auto px-2 py-1.5">
      {win.tabs.map((tab, index) => {
        const leaves = leafIds(tab.paneTree);
        const isSplit = leaves.length > 1;
        const primary = panes.get(leaves[0]);
        const isAi = !isSplit && primary?.kind === 'Agent' && !primary.agentExited;
        const running = leaves.some((id) => isRunning(panes.get(id)));
        const active = win.activeTabId === tab.id;
        const label = isSplit ? tab.label : primary?.customName ?? primary?.title ?? tab.label;
        const switchHint = metaHeld ? tabSwitchHint(index, win.tabs.length) : null;

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
            {switchHint && (
              <kbd className="shrink-0 rounded border border-line bg-app px-1 py-px font-mono text-[11px] leading-none text-ember">
                {switchHint}
              </kbd>
            )}
            <span
              role="button"
              tabIndex={-1}
              aria-label="Close tab"
              onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
              className="grid size-4 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition hover:bg-hover hover:text-del group-hover:opacity-100"
            >
              <CloseIcon size={11} />
            </span>
          </button>
        );
      })}
      <AddMenu
        windowPath={win.projectPath}
        label={basename(win.projectPath)}
        scriptsProjectPath={isMainWt ? projectRoot ?? undefined : undefined}
        compact
      />
      </div>
    </div>
  );
}
