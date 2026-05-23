import { useMemo } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { ProjectScripts } from './ProjectScripts';
import type { PaneKind, AgentStatus, PaneInfo } from '../../types/pane';

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

interface ProjectSectionsProps {
  projectPath: string;
  projectName: string;
}

export function ProjectSections({ projectPath, projectName }: ProjectSectionsProps) {
  const addTab = useWorkspaceStore((s) => s.addTab);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const panes = useWorkspaceStore((s) => s.panes);

  const { agentPanes, terminalPanes } = useMemo(() => {
    const agentList: PaneInfo[] = [];
    const terminalList: PaneInfo[] = [];
    for (const pane of panes.values()) {
      const inProject = pane.cwd === projectPath || pane.cwd.startsWith(projectPath + '/');
      if (!inProject) continue;
      if (pane.kind === 'Agent') agentList.push(pane);
      else if (pane.kind === 'Shell' || pane.kind === 'Lazygit') terminalList.push(pane);
    }
    return { agentPanes: agentList, terminalPanes: terminalList };
  }, [panes, projectPath]);

  // Sidebar actions always create a new Tab in this project's Window.
  // Lazy-creates the Window if needed and switches focus to it.
  const handleSpawn = (kind: PaneKind) => {
    addTab(projectPath, projectName, { kind });
  };

  const handleFocusPane = (paneId: string) => {
    setActivePane(paneId);
  };

  return (
    <>
      <div className="project-section">
        <div className="project-section-header">
          <span className="project-section-label">Agents</span>
          <button
            className="project-section-action"
            onClick={(e) => { e.stopPropagation(); handleSpawn('Agent'); }}
          >
            + new agent
          </button>
        </div>
        {agentPanes.length > 0 && (
          <div className="project-section-items">
            {agentPanes.map((p) => (
              <button
                key={p.id}
                className={`project-pane-row ${p.agentStatus ? `agent-status--${p.agentStatus}` : ''}`}
                onClick={(e) => { e.stopPropagation(); handleFocusPane(p.id); }}
              >
                <span
                  className="project-pane-icon running-indicator--agent"
                  style={p.accentColor ? { color: p.accentColor } : undefined}
                >
                  {p.agentStatus ? AGENT_STATUS_ICONS[p.agentStatus] : '●'}
                </span>
                <span className="project-pane-label">
                  {p.title ?? 'Agent'}
                  {p.agentStatus && (
                    <span className="agent-status-label"> ({AGENT_STATUS_LABELS[p.agentStatus]})</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="project-section">
        <div className="project-section-header">
          <span className="project-section-label">Terminals</span>
          <button
            className="project-section-action"
            onClick={(e) => { e.stopPropagation(); handleSpawn('Shell'); }}
          >
            + new terminal
          </button>
        </div>
        {terminalPanes.length > 0 && (
          <div className="project-section-items">
            {terminalPanes.map((p) => (
              <button
                key={p.id}
                className="project-pane-row"
                onClick={(e) => { e.stopPropagation(); handleFocusPane(p.id); }}
              >
                <span className={`project-pane-icon running-indicator--${p.kind.toLowerCase()}`}>
                  {p.kind === 'Lazygit' ? 'G' : '$'}
                </span>
                <span className="project-pane-label">{p.title ?? p.kind}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ProjectScripts projectPath={projectPath} projectName={projectName} />
    </>
  );
}
