import { useEffect, useMemo } from 'react';
import { ContextMenu } from '@base-ui-components/react/context-menu';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';
import { useWorkspaceStore } from '../../stores/workspace';
import { BranchRow } from './BranchRow';
import { PendingBranchRow } from './PendingBranchRow';
import { WorktreeSortMenu } from './WorktreeSortMenu';
import { WorktreeSortButton } from './WorktreeSortButton';
import { Tooltip } from '../Tooltip';
import { ChevronIcon, PlusIcon, BranchPlusIcon, ClearIcon } from '../icons';
import { ProjectIcon } from './ProjectIcon';
import { DEFAULT_WORKTREE_SORT, type ProjectInfo, type WorktreeInfo } from '../../types/project';
import { sortWorktrees } from '../../lib/sortWorktrees';
import { goToWorkspace } from '../../router';

const menuPopupClass =
  'z-[300] min-w-[180px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const menuItemDestructiveClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-del outline-none data-[highlighted]:bg-del/10 data-[highlighted]:text-del';
const menuSeparatorClass = 'my-[5px] h-px bg-line';

interface ProjectItemProps {
  project: ProjectInfo;
  isSelected?: boolean;
  /** Position in the reorderable list, used for drag-and-drop. */
  index?: number;
  /** True while this row is the one being dragged. */
  isDragging?: boolean;
  /** Render a drop indicator line above this row. */
  showDropLine?: boolean;
  onDragStart?: (index: number) => void;
  onDragOver?: (index: number, e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}

export function ProjectItem({
  project,
  isSelected,
  index,
  isDragging,
  showDropLine,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ProjectItemProps) {
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const expandedProjects = useProjectsStore((s) => s.expandedProjects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const prInfo = useProjectsStore((s) => s.prInfo);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);
  const refreshPrInfoForPaths = useProjectsStore((s) => s.refreshPrInfoForPaths);
  const removeProjectPath = useProjectsStore((s) => s.removeProjectPath);
  const quickWorktree = useProjectsStore((s) => s.quickWorktree);
  const expandProject = useProjectsStore((s) => s.expandProject);
  const agents = useProjectsStore((s) => s.agents);
  const sort = useProjectsStore((s) => s.projectSort[project.path]) ?? DEFAULT_WORKTREE_SORT;
  const setProjectSort = useProjectsStore((s) => s.setProjectSort);
  const prsByBranch = useProjectsStore((s) => s.prsByBranch.get(project.path));
  const refreshPrBranches = useProjectsStore((s) => s.refreshPrBranches);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const pendingWorktrees = useProjectsStore((s) => s.pendingWorktrees);
  const openWorktreeModal = useUiStore((s) => s.openWorktreeModal);
  const altHeld = useUiStore((s) => s.altHeld);

  // ⌥1…9 switch to a project by position; show the hint only on rows that have one.
  const switchHint = altHeld && index !== undefined && index < 9 ? `⌥${index + 1}` : null;

  const pending = useMemo(
    () => pendingWorktrees.filter((p) => p.projectPath === project.path),
    [pendingWorktrees, project.path],
  );

  async function handleQuickWorktree() {
    // Expand first (synchronously) so the optimistic placeholder row is visible
    // the instant the worktree starts creating.
    expandProject(project.path);
    const created = await quickWorktree(project.path).catch(() => null);
    if (!created) return;
    addTab(created.path, created.label, { kind: 'Agent', cwd: created.path, agent: agents[0]?.command });
    goToWorkspace();
  }

  const isExpanded = expandedProjects.has(project.path);
  const gitRemote = useProjectsStore((s) => s.gitHosts.get(project.path));
  const git = gitInfo.get(project.path);

  useEffect(() => {
    if (isExpanded && project.is_git) {
      refreshGitInfo(project.path);
    }
  }, [isExpanded, project.path, project.is_git, refreshGitInfo]);

  // Each worktree row shows a PR badge for its own branch (open, merged, or
  // closed, with CI) — fetch per-worktree PR info once the worktree list loads.
  // Join the paths into a stable primitive so array identity churn from git
  // refreshes doesn't re-trigger the fetch.
  const worktreePaths = git?.worktrees?.map((w) => w.path).join('\n');
  useEffect(() => {
    if (isExpanded && project.is_git && worktreePaths) {
      refreshPrInfoForPaths(worktreePaths.split('\n'));
    }
  }, [isExpanded, project.is_git, worktreePaths, refreshPrInfoForPaths]);

  // Every worktree row shows a PR badge when its branch has an open PR, and the
  // 'pr' sort needs the same data — fetch the project's open PRs on expand.
  useEffect(() => {
    if (isExpanded && project.is_git) {
      refreshPrBranches(project.path);
    }
  }, [isExpanded, project.path, project.is_git, refreshPrBranches]);

  // Root worktree first, then linked worktrees ordered by the project's chosen
  // sort. Non-git projects get a synthetic base.
  const worktrees = useMemo<WorktreeInfo[]>(() => {
    if (git?.worktrees && git.worktrees.length > 0) {
      return sortWorktrees(git.worktrees, sort, { prsByBranch });
    }
    if (!project.is_git) {
      return [{ path: project.path, branch: null, is_main: true, last_commit_unix: null, created_unix: null, added: 0, deleted: 0 }];
    }
    return [];
  }, [git, sort, prsByBranch, project.is_git, project.path]);

  const baseBranch = git?.branch ?? worktrees.find((w) => w.is_main)?.branch ?? null;

  // Merge in-flight placeholders into the same sorted stream as the real linked
  // worktrees, so the spinner sits exactly where its worktree will land instead
  // of being pinned under main and then jumping. A fresh worktree shares the
  // base branch HEAD, so mirror main's last commit (for the 'updated' sort) and
  // treat it as newest-created (for the 'created' sort).
  const belowMain = useMemo<WorktreeInfo[]>(() => {
    const mainLastCommit = worktrees.find((w) => w.is_main)?.last_commit_unix ?? null;
    const nowUnix = Math.floor(Date.now() / 1000);
    const placeholders = pending.map<WorktreeInfo>((p) => ({
      path: `pending:${p.id}`,
      branch: p.label,
      is_main: false,
      last_commit_unix: mainLastCommit,
      created_unix: nowUnix,
      added: 0,
      deleted: 0,
    }));
    const linked = worktrees.filter((w) => !w.is_main);
    return sortWorktrees([...linked, ...placeholders], sort, { prsByBranch });
  }, [worktrees, pending, sort, prsByBranch]);

  const draggable = index !== undefined;

  return (
    <div
      className={`relative mb-0.5 ${isDragging ? 'opacity-40' : ''}`}
      data-project-path={project.path}
      onDragOver={draggable ? (e) => onDragOver?.(index, e) : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); onDrop?.(); } : undefined}
    >
      {showDropLine && (
        <div className="pointer-events-none absolute -top-px left-2 right-2 z-10 h-0.5 rounded-full bg-ember" />
      )}
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <button
              draggable={draggable}
              onDragStart={draggable ? () => onDragStart?.(index) : undefined}
              onDragEnd={draggable ? () => onDragEnd?.() : undefined}
              onClick={() => toggleExpanded(project.path)}
              title={project.path}
              className={
                'group relative flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left transition-colors active:cursor-grabbing ' +
                (isSelected ? 'bg-hover shadow-[inset_0_0_0_1px_var(--color-line)]' : 'hover:bg-hover')
              }
            />
          }
        >
          <span className={`grid place-items-center text-ink-faint transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
            <ChevronIcon size={12} />
          </span>
          <span className="grid place-items-center text-ink-dim"><ProjectIcon remote={gitRemote} size={15} /></span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.1px] text-ink">
            {project.name}
          </span>
          {switchHint && (
            <kbd className="shrink-0 rounded border border-line bg-app px-1 py-px font-mono text-[11px] leading-none text-ember">
              {switchHint}
            </kbd>
          )}
          {project.is_git && (
            <span className="flex shrink-0 items-center gap-0.5">
              <WorktreeSortButton
                sort={sort}
                onSelect={(next) => setProjectSort(project.path, next)}
              />
              <Tooltip label="New worktree (random name)">
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); void handleQuickWorktree(); }}
                  className="grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-hover hover:text-ink"
                >
                  <PlusIcon size={13} />
                </span>
              </Tooltip>
              <Tooltip label="Create worktree from Linear, branch, or PR…">
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); openWorktreeModal(project.path, baseBranch); }}
                  className="grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-hover hover:text-ink"
                >
                  <BranchPlusIcon size={13} />
                </span>
              </Tooltip>
            </span>
          )}
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Positioner className="z-[300]">
            <ContextMenu.Popup className={menuPopupClass}>
              {project.is_git && (
                <>
                  <WorktreeSortMenu
                    sort={sort}
                    onSelect={(next) => setProjectSort(project.path, next)}
                  />
                  <ContextMenu.Separator className={menuSeparatorClass} />
                </>
              )}
              <ContextMenu.Item
                className={menuItemDestructiveClass}
                onClick={() => removeProjectPath(project.path)}
              >
                <span className="grid w-4 place-items-center"><ClearIcon size={14} /></span> Remove project
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <div className={`grid ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="relative pl-[18px] before:absolute before:left-[17px] before:top-0.5 before:bottom-1.5 before:w-px before:bg-guide before:content-['']">
            {worktrees
              .filter((wt) => wt.is_main)
              .map((wt) => (
                <BranchRow key={wt.path} projectPath={project.path} worktree={wt} pr={prInfo.get(wt.path) ?? null} />
              ))}
            {belowMain.map((wt) =>
              wt.path.startsWith('pending:') ? (
                <PendingBranchRow key={wt.path} label={wt.branch ?? ''} />
              ) : (
                <BranchRow key={wt.path} projectPath={project.path} worktree={wt} pr={prInfo.get(wt.path) ?? null} />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
