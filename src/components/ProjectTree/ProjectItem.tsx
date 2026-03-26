import { useEffect, useMemo } from 'react';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import type { ProjectInfo } from '../../types/project';
import type { PaneKind } from '../../types/pane';

interface ProjectItemProps {
  project: ProjectInfo;
  isPinned: boolean;
  isSelected?: boolean;
}

export function ProjectItem({ project, isPinned, isSelected }: ProjectItemProps) {
  const togglePin = useProjectsStore((s) => s.togglePin);
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const expandedProjects = useProjectsStore((s) => s.expandedProjects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const prInfo = useProjectsStore((s) => s.prInfo);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);
  const refreshPrInfo = useProjectsStore((s) => s.refreshPrInfo);

  const tabs = useWorkspaceStore((s) => s.tabs);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const addPane = useWorkspaceStore((s) => s.addPane);
  const panes = useWorkspaceStore((s) => s.panes);

  const isExpanded = expandedProjects.has(project.path);
  const git = gitInfo.get(project.path);
  const pr = prInfo.get(project.path);

  // Count running panes for this project
  const runningPanes = useMemo(() => {
    const counts: Partial<Record<PaneKind, number>> = {};
    for (const pane of panes.values()) {
      if (pane.cwd === project.path || pane.cwd.startsWith(project.path + '/')) {
        counts[pane.kind] = (counts[pane.kind] ?? 0) + 1;
      }
    }
    return counts;
  }, [panes, project.path]);

  useEffect(() => {
    if (isExpanded && project.is_git) {
      refreshGitInfo(project.path);
      refreshPrInfo(project.path);
    }
  }, [isExpanded, project.path, project.is_git, refreshGitInfo, refreshPrInfo]);

  const handleSpawn = (kind: PaneKind) => {
    // Find existing tab for this project or create one
    let tab = tabs.find((t) => t.projectPath === project.path);
    if (!tab) {
      const tabId = addTab(project.path, project.name);
      setActiveTab(tabId);
    } else {
      setActiveTab(tab.id);
      addPane(tab.id, kind, project.path);
    }
  };

  return (
    <div className="project-item" data-project-path={project.path}>
      <div
        className={`project-item-header ${isSelected ? 'project-item-header--selected' : ''}`}
        onClick={() => toggleExpanded(project.path)}
      >
        <span className="project-expand-icon">
          {isExpanded ? '▾' : '▸'}
        </span>
        {isPinned && <span className="project-pin-icon">📌</span>}
        <span className="project-name">{project.name}</span>
        {project.is_git && git?.branch && (
          <span className="project-branch">{git.branch}</span>
        )}
        {Object.keys(runningPanes).length > 0 && (
          <span className="project-running-indicators">
            {runningPanes.Agent && (
              <span className="running-indicator running-indicator--agent" title={`${runningPanes.Agent} agent${runningPanes.Agent > 1 ? 's' : ''}`}>
                ● {runningPanes.Agent}
              </span>
            )}
            {runningPanes.Shell && (
              <span className="running-indicator running-indicator--shell" title={`${runningPanes.Shell} terminal${runningPanes.Shell > 1 ? 's' : ''}`}>
                $ {runningPanes.Shell}
              </span>
            )}
            {runningPanes.Lazygit && (
              <span className="running-indicator running-indicator--lazygit" title={`${runningPanes.Lazygit} lazygit`}>
                G {runningPanes.Lazygit}
              </span>
            )}
            {runningPanes.Custom && (
              <span className="running-indicator running-indicator--custom" title={`${runningPanes.Custom} custom`}>
                ⚡ {runningPanes.Custom}
              </span>
            )}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="project-item-details">
          {Object.keys(runningPanes).length > 0 && (
            <div className="project-running-list">
              {Array.from(panes.values())
                .filter((p) => p.cwd === project.path || p.cwd.startsWith(project.path + '/'))
                .map((p) => (
                  <div key={p.id} className="running-pane-row">
                    <span className={`running-pane-icon running-indicator--${p.kind.toLowerCase()}`}>
                      {p.kind === 'Agent' ? '●' : p.kind === 'Shell' ? '$' : p.kind === 'Lazygit' ? 'G' : '⚡'}
                    </span>
                    <span className="running-pane-label">
                      {p.title ?? p.kind}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {pr && (
            <div
              className="project-pr-row"
              onClick={() => {
                if (pr.url) {
                  // Use Tauri opener
                  import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
                    openUrl(pr.url);
                  });
                }
              }}
            >
              <span className={`pr-state pr-state--${pr.state.toLowerCase()}`}>
                #{pr.number}
              </span>
              <span className="pr-status">{pr.state}</span>
              {pr.ci_status && (
                <span className={`ci-status ci-status--${pr.ci_status}`}>
                  {pr.ci_status === 'passing' ? '✓' : pr.ci_status === 'failing' ? '✗' : '◌'}
                </span>
              )}
            </div>
          )}

          {git && git.worktrees.length > 1 && (
            <div className="project-worktrees">
              {git.worktrees.filter((w) => !w.is_main).map((wt) => (
                <div key={wt.path} className="worktree-row">
                  <span className="worktree-branch">{wt.branch ?? '(detached)'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="project-actions">
            <button
              className="project-action-btn"
              onClick={(e) => { e.stopPropagation(); handleSpawn('Agent'); }}
            >
              + agent
            </button>
            <button
              className="project-action-btn"
              onClick={(e) => { e.stopPropagation(); handleSpawn('Shell'); }}
            >
              + terminal
            </button>
            <button
              className="project-action-btn"
              onClick={(e) => { e.stopPropagation(); handleSpawn('Lazygit'); }}
            >
              + lazygit
            </button>
          </div>

          <button
            className="project-pin-btn"
            onClick={(e) => {
              e.stopPropagation();
              togglePin(project.path);
            }}
          >
            {isPinned ? 'Unpin' : 'Pin'}
          </button>
        </div>
      )}
    </div>
  );
}
