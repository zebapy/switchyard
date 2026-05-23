import { useEffect, useMemo } from 'react';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { useHomeDir, displayDir } from '../../hooks/useHomeDir';
import { ProjectSections } from './ProjectSections';
import { Worktrees } from './Worktrees';
import type { ProjectInfo } from '../../types/project';
import type { AgentStatus, PaneInfo } from '../../types/pane';
import type { TmuxSessionInfo } from '../../types/tmux';

const AGENT_STATUS_ICONS: Record<AgentStatus, string> = {
  working: '●',
  waiting: '◉',
  idle: '○',
};

const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  working: 'Working',
  waiting: 'Waiting for input',
  idle: 'Idle',
};

interface ProjectItemProps {
  project: ProjectInfo;
  isPinned: boolean;
  isSelected?: boolean;
  worktreeChildren?: ProjectInfo[];
  tmuxSessions?: TmuxSessionInfo[];
}

export function ProjectItem({ project, isPinned, isSelected, tmuxSessions }: ProjectItemProps) {
  const togglePin = useProjectsStore((s) => s.togglePin);
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const expandedProjects = useProjectsStore((s) => s.expandedProjects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const prInfo = useProjectsStore((s) => s.prInfo);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);
  const refreshPrInfo = useProjectsStore((s) => s.refreshPrInfo);

  const windows = useWorkspaceStore((s) => s.windows);
  const switchWindow = useWorkspaceStore((s) => s.switchWindow);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const panes = useWorkspaceStore((s) => s.panes);
  const killTmuxSession = useProjectsStore((s) => s.killTmuxSession);

  const hasWindow = windows.has(project.path);

  const attachableSessions = useMemo(() => {
    if (!tmuxSessions || tmuxSessions.length === 0) return [];
    const openSessionNames = new Set<string>();
    for (const pane of panes.values()) {
      if (pane.tmuxSession) openSessionNames.add(pane.tmuxSession);
    }
    return tmuxSessions.filter((s) => !openSessionNames.has(s.name));
  }, [tmuxSessions, panes]);

  const home = useHomeDir();
  const isExpanded = expandedProjects.has(project.path);
  const git = gitInfo.get(project.path);
  const pr = prInfo.get(project.path);
  const parentDirDisplay = useMemo(() => {
    const idx = project.path.lastIndexOf('/');
    if (idx <= 0) return project.path;
    return displayDir(project.path.slice(0, idx), home);
  }, [project.path, home]);

  // Counts for the collapsed header indicators.
  const { agentPanes, terminalPanes } = useMemo(() => {
    const agentList: PaneInfo[] = [];
    const terminalList: PaneInfo[] = [];
    for (const pane of panes.values()) {
      const inProject = pane.cwd === project.path || pane.cwd.startsWith(project.path + '/');
      if (!inProject) continue;
      if (pane.kind === 'Agent') agentList.push(pane);
      else if (pane.kind === 'Shell' || pane.kind === 'Lazygit') terminalList.push(pane);
    }
    return { agentPanes: agentList, terminalPanes: terminalList };
  }, [panes, project.path]);

  const { agentAggregateStatus, agentAccentColor } = useMemo(() => {
    if (agentPanes.length === 0) return { agentAggregateStatus: null, agentAccentColor: null };
    let hasWaiting = false;
    let hasWorking = false;
    let accentColor: string | null = null;
    for (const p of agentPanes) {
      if (p.agentStatus === 'waiting') hasWaiting = true;
      if (p.agentStatus === 'working') hasWorking = true;
      if (p.accentColor && !accentColor) accentColor = p.accentColor;
    }
    const status: AgentStatus = hasWaiting ? 'waiting' : hasWorking ? 'working' : 'idle';
    return { agentAggregateStatus: status, agentAccentColor: accentColor };
  }, [agentPanes]);

  useEffect(() => {
    if (isExpanded && project.is_git) {
      refreshGitInfo(project.path);
      refreshPrInfo(project.path);
    }
  }, [isExpanded, project.path, project.is_git, refreshGitInfo, refreshPrInfo]);

  const handleAttachSession = (session: TmuxSessionInfo) => {
    addTab(project.path, project.name, {
      kind: 'Shell',
      tmuxSession: session.name,
      cwd: session.path || project.path,
    });
  };

  const handleHeaderClick = () => {
    toggleExpanded(project.path);
    if (hasWindow) switchWindow(project.path);
  };

  const handleOpenPr = () => {
    if (pr?.url) {
      import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(pr.url));
    }
  };

  return (
    <div className="project-item" data-project-path={project.path}>
      <div
        className={`project-item-header ${isSelected ? 'project-item-header--selected' : ''} ${hasWindow ? 'project-item-header--live' : ''}`}
        onClick={handleHeaderClick}
        title={project.path}
      >
        <span
          className={`project-window-indicator ${hasWindow ? 'project-window-indicator--live' : ''}`}
          aria-label={hasWindow ? 'Window open' : 'No window'}
        />
        {isPinned && <span className="project-pin-icon" aria-label="pinned" />}
        <span className="project-item-body">
          <span className="project-item-main">
            <span className="project-name">{project.name}</span>
          </span>
          {!isExpanded && (
            <span className="project-item-meta">
              <span className="project-dir">{parentDirDisplay}</span>
              {project.is_git && git?.branch && (
                <span className="project-branch">{git.branch}</span>
              )}
            </span>
          )}
        </span>
        {!isExpanded && (agentPanes.length > 0 || terminalPanes.length > 0) && (
          <span className="project-running-indicators">
            {agentPanes.length > 0 && (
              <span
                className={`running-indicator running-indicator--agent ${agentAggregateStatus ? `agent-status--${agentAggregateStatus}` : ''}`}
                title={`${agentPanes.length} agent${agentPanes.length > 1 ? 's' : ''}${agentAggregateStatus ? ` (${AGENT_STATUS_LABELS[agentAggregateStatus]})` : ''}`}
                style={agentAccentColor ? { color: agentAccentColor } : undefined}
              >
                {agentAggregateStatus ? AGENT_STATUS_ICONS[agentAggregateStatus] : '●'} {agentPanes.length}
              </span>
            )}
            {terminalPanes.length > 0 && (
              <span className="running-indicator running-indicator--shell" title={`${terminalPanes.length} terminal${terminalPanes.length > 1 ? 's' : ''}`}>
                $ {terminalPanes.length}
              </span>
            )}
          </span>
        )}
        {!isExpanded && attachableSessions.length > 0 && (
          <span
            className="running-indicator running-indicator--tmux"
            title={`${attachableSessions.length} detached tmux session${attachableSessions.length > 1 ? 's' : ''}`}
          >
            ⌗ {attachableSessions.length}
          </span>
        )}
        <span className="project-expand-icon project-expand-icon--right">
          {isExpanded ? '▾' : '▸'}
        </span>
      </div>

      {isExpanded && (
        <div className="project-item-details">
          {(git?.branch || pr) && (
            <div className="project-git-info">
              {git?.branch && (
                <span className="project-git-branch" title="Current branch">
                  ⎇ {git.branch}
                </span>
              )}
              {pr && (
                <button className={`project-pr-badge pr-state--${pr.state.toLowerCase()}`} onClick={handleOpenPr} title={pr.url}>
                  <span className="pr-number">#{pr.number}</span>
                  <span className="pr-state-text">{pr.state}</span>
                  {pr.ci_status && (
                    <span className={`ci-dot ci-status--${pr.ci_status}`}>
                      {pr.ci_status === 'passing' ? '✓' : pr.ci_status === 'failing' ? '✗' : '◌'}
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          <ProjectSections projectPath={project.path} projectName={project.name} />

          {project.is_git && <Worktrees projectPath={project.path} />}

          {attachableSessions.length > 0 && (
            <div className="project-tmux-sessions">
              <div className="tmux-sessions-label">Existing sessions</div>
              {attachableSessions.map((session) => (
                <div key={session.name} className="tmux-session-row">
                  <button
                    className="tmux-session-attach"
                    onClick={(e) => { e.stopPropagation(); handleAttachSession(session); }}
                    title={`Attach to ${session.name}\n${session.path}`}
                  >
                    <span className="tmux-session-icon">⌗</span>
                    <span className="tmux-session-name">{session.name.replace(/^wip-/, '')}</span>
                    {session.attached && <span className="tmux-session-badge">attached</span>}
                  </button>
                  <button
                    className="tmux-session-kill"
                    onClick={(e) => { e.stopPropagation(); killTmuxSession(session.name); }}
                    title={`Kill ${session.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

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
