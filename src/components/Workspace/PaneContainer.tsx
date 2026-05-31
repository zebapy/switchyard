import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
import { TerminalPane } from '../Terminal/TerminalPane';
import { AiIcon, TermIcon, BaseBranchIcon, WorktreeIcon, SplitSquareIcon, CloseIcon } from '../icons';
import type { PaneInfo } from '../../types/pane';

interface PaneContainerProps {
  paneInfo: PaneInfo;
  isActive: boolean;
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

export function PaneContainer({ paneInfo, isActive }: PaneContainerProps) {
  const closePane = useWorkspaceStore((s) => s.closePane);
  const splitPane = useWorkspaceStore((s) => s.splitPane);
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const gitInfo = useProjectsStore((s) => s.gitInfo);

  // The visible pane belongs to the active window; derive its branch context.
  const windowPath = activeWindowId ?? paneInfo.cwd;
  let branch: string | null = null;
  let isMainWt = true;
  for (const info of gitInfo.values()) {
    const wt = info.worktrees.find((w) => w.path === windowPath);
    if (wt) { branch = wt.branch; isMainWt = wt.is_main; break; }
  }
  if (!branch) branch = gitInfo.get(windowPath)?.branch ?? null;

  const isAi = paneInfo.kind === 'Agent' && !paneInfo.agentExited;
  const title = paneInfo.title ?? basename(paneInfo.cwd) ?? 'Terminal';

  const actBtn = 'grid size-[26px] place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-ink';

  return (
    <div className={`flex h-full w-full flex-col overflow-hidden ${isActive ? 'z-[1] shadow-[inset_0_0_0_1.5px_var(--color-ember-edge)]' : ''}`}>
      <div className="flex flex-none items-center gap-2 border-b border-line bg-side px-3.5 py-[11px]">
        <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-ink-dim">
          <span className="truncate text-ink-dim">{basename(windowPath)}</span>
          {branch && (
            <>
              <span className="text-ink-ghost">/</span>
              <span className={`inline-flex ${isMainWt ? 'text-ember' : 'text-ink-faint'}`}>
                {isMainWt ? <BaseBranchIcon size={13} /> : <WorktreeIcon size={13} />}
              </span>
              <span className="truncate font-mono text-[13px] text-ink-dim">{branch}</span>
            </>
          )}
          <span className="text-ink-ghost">·</span>
          <span className={`inline-flex ${isAi ? 'text-ai' : 'text-ink-faint'}`}>
            {isAi ? <AiIcon size={13} /> : <TermIcon size={13} />}
          </span>
          <span className="truncate font-semibold text-ink">{title}</span>
        </div>
        <div className="ml-auto flex flex-none gap-[3px]">
          <button className={actBtn} title="Split right" onClick={(e) => { e.stopPropagation(); splitPane(paneInfo.id, 'horizontal', 'Shell', paneInfo.cwd); }}>
            <SplitSquareIcon size={14} />
          </button>
          <button className={actBtn} title="Split down" onClick={(e) => { e.stopPropagation(); splitPane(paneInfo.id, 'vertical', 'Shell', paneInfo.cwd); }}>
            <span className="rotate-90"><SplitSquareIcon size={14} /></span>
          </button>
          <button className={actBtn} title="Close" onClick={(e) => { e.stopPropagation(); closePane(paneInfo.id); }}>
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
        <TerminalPane
          paneId={paneInfo.id}
          kind={paneInfo.kind}
          cwd={paneInfo.cwd}
          command={paneInfo.command}
          tmuxSession={paneInfo.tmuxSession}
          agent={paneInfo.agent}
          isActive={isActive}
        />
      </div>
    </div>
  );
}
