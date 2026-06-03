import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
import { goToWorkspace } from '../../router';
import { SessionRow } from './SessionRow';
import { AddMenu } from './AddMenu';
import { ChevronIcon, BaseBranchIcon, WorktreeIcon, CloseIcon } from '../icons';
import type { WorktreeInfo, PrInfo } from '../../types/project';

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

function prClass(state: string): string {
  const s = state.toLowerCase();
  if (s === 'merged') return 'pr-merged border-[rgba(199,155,255,0.3)] text-ai';
  if (s === 'closed') return 'pr-closed border-[rgba(240,117,138,0.3)] text-del';
  return 'pr-open border-[rgba(111,208,140,0.25)] text-add';
}

interface BranchRowProps {
  /** Base project path — used for worktree delete + script registration. */
  projectPath: string;
  worktree: WorktreeInfo;
  /** Shown in the meta slot on the base branch. */
  pr?: PrInfo | null;
}

export function BranchRow({ projectPath, worktree, pr }: BranchRowProps) {
  const path = worktree.path;
  const isMain = worktree.is_main;
  const win = useWorkspaceStore((s) => s.windows.get(path));
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const panes = useWorkspaceStore((s) => s.panes);
  const switchWindow = useWorkspaceStore((s) => s.switchWindow);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const deleteWorktree = useProjectsStore((s) => s.deleteWorktree);
  const expandProject = useProjectsStore((s) => s.expandProject);
  const defaultAgent = useProjectsStore((s) => s.agents[0]?.command);

  const tabs = win?.tabs ?? [];
  const [open, setOpen] = useState(isMain || tabs.length > 0);

  const inWorkspace = useLocation().pathname.startsWith('/workspace');
  const isWindowActive = activeWindowId === path && inWorkspace;

  // When this branch's window becomes the active workspace (Cmd+1-9, window
  // cycling, focusing a pane, session restore), reveal it in the sidebar: open
  // the session list and expand the parent project. Deps only on the active
  // window, so a manual collapse sticks until the next activation.
  useEffect(() => {
    if (activeWindowId !== path) return;
    setOpen(true);
    expandProject(projectPath);
  }, [activeWindowId, path, projectPath, expandProject]);
  const branchName = worktree.branch ?? basename(path);
  const hasDiff = worktree.added > 0 || worktree.deleted > 0;

  // Clicking the row opens this Workspace: reveal its active (or first) tab, or
  // start the default agent if it has no sessions yet. Per Q6c the row also expands
  // the inline session list.
  const openWorkspace = () => {
    setOpen(true);
    if (tabs.length > 0) {
      switchWindow(path);
      setActiveTab(win?.activeTabId ?? tabs[0].id);
    } else {
      addTab(path, branchName, { kind: 'Agent', cwd: path, agent: defaultAgent });
    }
    goToWorkspace();
  };

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteWorktree(projectPath, basename(path)).catch(() => null);
  };

  return (
    <div className="relative">
      <button
        onClick={openWorkspace}
        title={path}
        className={
          'group relative flex w-full items-center gap-[7px] rounded-lg px-2 py-1.5 text-left transition-colors ' +
          (isWindowActive
            ? "bg-ember-tint before:absolute before:-left-2.5 before:top-1/2 before:h-[15px] before:w-[3px] before:-translate-y-1/2 before:rounded-[3px] before:bg-ember-strong before:content-['']"
            : 'hover:bg-hover')
        }
      >
        <span
          role="button"
          tabIndex={-1}
          onClick={toggleOpen}
          aria-label={open ? 'Collapse sessions' : 'Expand sessions'}
          className={`grid cursor-pointer place-items-center rounded text-ink-faint transition-transform duration-200 hover:text-ink ${open ? 'rotate-90' : ''}`}
        >
          <ChevronIcon size={11} />
        </span>
        <span className={`grid place-items-center ${isMain ? 'text-ember' : 'text-ink-faint'}`}>
          {isMain ? <BaseBranchIcon size={14} /> : <WorktreeIcon size={14} />}
        </span>
        <span className={`min-w-0 flex-1 truncate font-mono text-[13px] font-medium tracking-[-0.2px] ${isWindowActive ? 'text-ink' : 'text-ink-dim'}`}>
          {branchName}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-[7px]">
          {pr && (
            <span
              className={`inline-flex items-center rounded-full border px-[7px] font-mono text-xs font-medium leading-[17px] ${prClass(pr.state)}`}
              title={pr.url}
            >
              #{pr.number}
              {pr.ci_status && (
                <span className={`ml-1 ${pr.ci_status === 'passing' ? 'text-add' : pr.ci_status === 'failing' ? 'text-del' : 'text-[#f9e2af]'}`}>
                  {pr.ci_status === 'passing' ? '✓' : pr.ci_status === 'failing' ? '✗' : '◌'}
                </span>
              )}
            </span>
          )}
          {hasDiff && (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium">
              <span className="text-add before:opacity-80 before:content-['+']">{worktree.added}</span>
              <span className="text-del before:opacity-80 before:content-['−']">{worktree.deleted}</span>
            </span>
          )}
          {!isMain && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleDelete}
              title="Delete worktree"
              className="grid size-[18px] cursor-pointer place-items-center rounded-md text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-ember-tint hover:text-del"
            >
              <CloseIcon size={11} />
            </span>
          )}
        </span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-[260ms] ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="relative pl-[19px] before:absolute before:left-2 before:-top-0.5 before:bottom-2 before:w-px before:bg-guide before:content-['']">
            {tabs.map((tab) => (
              <SessionRow
                key={tab.id}
                windowPath={path}
                tab={tab}
                panes={panes}
                isActiveTab={isWindowActive && win?.activeTabId === tab.id}
                activePaneId={win?.activePaneId ?? null}
              />
            ))}
            <AddMenu
              windowPath={path}
              label={branchName}
              scriptsProjectPath={isMain ? projectPath : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
