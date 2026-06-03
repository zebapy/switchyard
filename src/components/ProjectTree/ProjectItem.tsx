import { useEffect, useMemo } from 'react';
import { ContextMenu } from '@base-ui-components/react/context-menu';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';
import { useWorkspaceStore } from '../../stores/workspace';
import { BranchRow } from './BranchRow';
import { PendingBranchRow } from './PendingBranchRow';
import { WorktreeSortMenu } from './WorktreeSortMenu';
import { ChevronIcon, RepoIcon, PlusIcon, BranchPlusIcon, ClearIcon } from '../icons';
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
  const refreshPrInfo = useProjectsStore((s) => s.refreshPrInfo);
  const removeProjectPath = useProjectsStore((s) => s.removeProjectPath);
  const quickWorktree = useProjectsStore((s) => s.quickWorktree);
  const expandProject = useProjectsStore((s) => s.expandProject);
  const agents = useProjectsStore((s) => s.agents);
  const sort = useProjectsStore((s) => s.projectSort[project.path]) ?? DEFAULT_WORKTREE_SORT;
  const setProjectSort = useProjectsStore((s) => s.setProjectSort);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const pendingWorktrees = useProjectsStore((s) => s.pendingWorktrees);
  const openWorktreeModal = useUiStore((s) => s.openWorktreeModal);

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
  const git = gitInfo.get(project.path);
  const pr = prInfo.get(project.path) ?? null;

  useEffect(() => {
    if (isExpanded && project.is_git) {
      refreshGitInfo(project.path);
      refreshPrInfo(project.path);
    }
  }, [isExpanded, project.path, project.is_git, refreshGitInfo, refreshPrInfo]);

  // Root worktree first, then linked worktrees ordered by the project's chosen
  // sort. Non-git projects get a synthetic base.
  const worktrees = useMemo<WorktreeInfo[]>(() => {
    if (git?.worktrees && git.worktrees.length > 0) {
      return sortWorktrees(git.worktrees, sort);
    }
    if (!project.is_git) {
      return [{ path: project.path, branch: null, is_main: true, last_commit_unix: null, created_unix: null, added: 0, deleted: 0 }];
    }
    return [];
  }, [git, sort, project.is_git, project.path]);

  const baseBranch = git?.branch ?? worktrees.find((w) => w.is_main)?.branch ?? null;

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
          <span className="grid place-items-center text-ink-dim"><RepoIcon size={15} /></span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.1px] text-ink">
            {project.name}
          </span>
          {project.is_git && (
            <span className="flex shrink-0 items-center gap-0.5">
              <span
                role="button"
                tabIndex={-1}
                title="New worktree (random name)"
                onClick={(e) => { e.stopPropagation(); void handleQuickWorktree(); }}
                className="grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-ember-tint hover:text-ember"
              >
                <PlusIcon size={13} />
              </span>
              <span
                role="button"
                tabIndex={-1}
                title="Create worktree from Linear, branch, or PR…"
                onClick={(e) => { e.stopPropagation(); openWorktreeModal(project.path, baseBranch); }}
                className="grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-ember-tint hover:text-ember"
              >
                <BranchPlusIcon size={13} />
              </span>
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

      <div className={`grid transition-[grid-template-rows] duration-[260ms] ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="relative pl-[18px] before:absolute before:left-[17px] before:top-0.5 before:bottom-1.5 before:w-px before:bg-guide before:content-['']">
            {worktrees
              .filter((wt) => wt.is_main)
              .map((wt) => (
                <BranchRow key={wt.path} projectPath={project.path} worktree={wt} pr={pr} />
              ))}
            {pending.map((p) => (
              <PendingBranchRow key={p.id} label={p.label} />
            ))}
            {worktrees
              .filter((wt) => !wt.is_main)
              .map((wt) => (
                <BranchRow key={wt.path} projectPath={project.path} worktree={wt} pr={null} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
