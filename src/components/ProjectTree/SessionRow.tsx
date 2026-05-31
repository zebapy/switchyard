import { useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { useUiStore } from '../../stores/ui';
import type { PaneInfo, PaneTree, Tab } from '../../types/pane';
import { AiIcon, TermIcon, SplitIcon, SplitBadgeIcon, ChevronIcon } from '../icons';
import { RenameField } from './RenameField';

function leafIds(tree: PaneTree): string[] {
  if (tree.type === 'leaf') return [tree.paneId];
  return [...leafIds(tree.children[0]), ...leafIds(tree.children[1])];
}

function isRunning(pane: PaneInfo | undefined): boolean {
  return !!pane && pane.kind === 'Agent' && (pane.agentStatus === 'working' || pane.agentStatus === 'waiting');
}

// Sidebar label: user-given name wins, then the live terminal title (last
// command / running program), then the static fallback.
function paneLabel(pane: PaneInfo | undefined, fallback: string): string {
  return pane?.customName ?? pane?.title ?? fallback;
}

// Hover tooltip exposing session info pulled from the pane: command (if any) + cwd.
function sessionTip(pane: PaneInfo | undefined): string | undefined {
  if (!pane) return undefined;
  return [pane.command, pane.cwd].filter(Boolean).join('\n') || undefined;
}

const connector = "before:absolute before:top-1/2 before:h-px before:bg-guide before:content-['']";

interface SessionRowProps {
  windowPath: string;
  tab: Tab;
  panes: Map<string, PaneInfo>;
  /** This tab is the focused session (its window is active and we're in pane view). */
  isActiveTab: boolean;
  activePaneId: string | null;
}

export function SessionRow({ windowPath, tab, panes, isActiveTab, activePaneId }: SessionRowProps) {
  const switchWindow = useWorkspaceStore((s) => s.switchWindow);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const setPaneName = useWorkspaceStore((s) => s.setPaneName);
  const showPane = useUiStore((s) => s.showPane);
  const [open, setOpen] = useState(true);
  const [editingPaneId, setEditingPaneId] = useState<string | null>(null);

  const select = (paneId?: string) => {
    switchWindow(windowPath);
    setActiveTab(tab.id);
    if (paneId) setActivePane(paneId);
    showPane();
  };

  const commitName = (paneId: string, name: string) => {
    setPaneName(paneId, name);
    setEditingPaneId(null);
  };

  // Single-pane session
  if (tab.paneTree.type === 'leaf') {
    const paneId = tab.paneTree.paneId;
    const pane = panes.get(paneId);
    const isAi = pane?.kind === 'Agent' && !pane.agentExited;
    const label = paneLabel(pane, tab.label);
    const rowClass =
      `relative flex w-full items-center gap-2 rounded-[7px] py-[5px] pl-1.5 pr-2 text-left text-[13px] transition-colors ${connector} before:-left-[11px] before:w-[11px] ` +
      (isActiveTab
        ? 'bg-active text-ink shadow-[inset_0_0_0_1px_var(--color-line)]'
        : 'text-ink-dim hover:bg-hover hover:text-ink');
    const icon = (
      <span className={`grid place-items-center ${isAi ? 'text-ai' : isActiveTab ? 'text-ink' : 'text-ink-faint'}`}>
        {isAi ? <AiIcon size={14} /> : <TermIcon size={14} />}
      </span>
    );

    if (editingPaneId === paneId) {
      return (
        <div className={rowClass}>
          {icon}
          <RenameField
            initialValue={pane?.customName ?? label}
            onCommit={(name) => commitName(paneId, name)}
            onCancel={() => setEditingPaneId(null)}
          />
        </div>
      );
    }

    return (
      <button
        onClick={() => select()}
        onDoubleClick={() => setEditingPaneId(paneId)}
        title={sessionTip(pane)}
        className={rowClass}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {isRunning(pane) && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-green animate-pulse-dot" title="running" />}
      </button>
    );
  }

  // Split-group session (a tab with multiple panes)
  const leaves = leafIds(tab.paneTree);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative flex w-full items-center gap-2 rounded-[7px] py-[5px] pl-1.5 pr-2 text-left text-[13px] text-ink-dim transition-colors hover:bg-hover hover:text-ink ${connector} before:-left-[11px] before:w-[11px]`}
      >
        <span className={`grid place-items-center text-ink-faint transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>
          <ChevronIcon size={11} />
        </span>
        <span className="grid place-items-center text-ink-faint"><SplitIcon size={14} /></span>
        <span className="min-w-0 flex-1 truncate">{tab.label}</span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-[7px] font-mono text-xs leading-[17px] text-ink-faint">
          <SplitBadgeIcon size={10} /> {leaves.length}
        </span>
      </button>
      {open && (
        <div className={`relative pl-[17px] before:absolute before:left-[7px] before:-top-0.5 before:bottom-1.5 before:w-px before:bg-guide before:content-['']`}>
          {leaves.map((paneId) => {
            const pane = panes.get(paneId);
            const isAi = pane?.kind === 'Agent' && !pane.agentExited;
            const active = isActiveTab && activePaneId === paneId;
            const label = paneLabel(pane, pane?.kind ?? 'pane');
            const rowClass =
              `relative flex w-full items-center gap-2 rounded-[7px] py-1 pl-1.5 pr-2 text-left text-[13px] transition-colors ${connector} before:-left-[10px] before:w-[10px] ` +
              (active
                ? 'bg-active text-ink shadow-[inset_0_0_0_1px_var(--color-line)]'
                : 'text-ink-faint hover:bg-hover hover:text-ink');
            const icon = (
              <span className={`grid place-items-center ${isAi ? 'text-ai' : active ? 'text-ink' : 'text-ink-faint'}`}>
                {isAi ? <AiIcon size={13} /> : <TermIcon size={13} />}
              </span>
            );

            if (editingPaneId === paneId) {
              return (
                <div key={paneId} className={rowClass}>
                  {icon}
                  <RenameField
                    initialValue={pane?.customName ?? label}
                    onCommit={(name) => commitName(paneId, name)}
                    onCancel={() => setEditingPaneId(null)}
                  />
                </div>
              );
            }

            return (
              <button
                key={paneId}
                onClick={() => select(paneId)}
                onDoubleClick={() => setEditingPaneId(paneId)}
                title={sessionTip(pane)}
                className={rowClass}
              >
                {icon}
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {isRunning(pane) && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-green animate-pulse-dot" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
