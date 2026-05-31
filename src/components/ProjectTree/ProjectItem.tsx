import { useEffect, useMemo } from 'react';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';
import { BranchRow } from './BranchRow';
import { ChevronIcon, RepoIcon, PlusIcon } from '../icons';
import type { ProjectInfo, WorktreeInfo } from '../../types/project';

interface ProjectItemProps {
  project: ProjectInfo;
  isSelected?: boolean;
}

export function ProjectItem({ project, isSelected }: ProjectItemProps) {
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const expandedProjects = useProjectsStore((s) => s.expandedProjects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const prInfo = useProjectsStore((s) => s.prInfo);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);
  const refreshPrInfo = useProjectsStore((s) => s.refreshPrInfo);
  const openWorktreeModal = useUiStore((s) => s.openWorktreeModal);

  const isExpanded = expandedProjects.has(project.path);
  const git = gitInfo.get(project.path);
  const pr = prInfo.get(project.path) ?? null;

  useEffect(() => {
    if (isExpanded && project.is_git) {
      refreshGitInfo(project.path);
      refreshPrInfo(project.path);
    }
  }, [isExpanded, project.path, project.is_git, refreshGitInfo, refreshPrInfo]);

  // Base branch first, then linked worktrees. Non-git projects get a synthetic base.
  const worktrees = useMemo<WorktreeInfo[]>(() => {
    if (git?.worktrees && git.worktrees.length > 0) {
      return [...git.worktrees].sort((a, b) => Number(b.is_main) - Number(a.is_main));
    }
    if (!project.is_git) {
      return [{ path: project.path, branch: null, is_main: true, last_commit_unix: null, added: 0, deleted: 0 }];
    }
    return [];
  }, [git, project.is_git, project.path]);

  const baseBranch = git?.branch ?? worktrees.find((w) => w.is_main)?.branch ?? null;

  return (
    <div className="mb-0.5" data-project-path={project.path}>
      <button
        onClick={() => toggleExpanded(project.path)}
        title={project.path}
        className={
          'group relative flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left transition-colors ' +
          (isSelected ? 'bg-hover shadow-[inset_0_0_0_1px_var(--color-line)]' : 'hover:bg-hover')
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
          <span
            role="button"
            tabIndex={-1}
            title="New worktree"
            onClick={(e) => { e.stopPropagation(); openWorktreeModal(project.path, baseBranch); }}
            className="grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-ember-tint hover:text-ember"
          >
            <PlusIcon size={13} />
          </span>
        )}
      </button>

      <div className={`grid transition-[grid-template-rows] duration-[260ms] ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="relative pl-[18px] before:absolute before:left-[17px] before:top-0.5 before:bottom-1.5 before:w-px before:bg-guide before:content-['']">
            {worktrees.map((wt) => (
              <BranchRow
                key={wt.path}
                projectPath={project.path}
                worktree={wt}
                pr={wt.is_main ? pr : null}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
