import { useWorkspaceStore } from '../../stores/workspace';
import { TerminalPane } from '../Terminal/TerminalPane';
import type { PaneInfo, AgentStatus } from '../../types/pane';

const KIND_ICONS: Record<string, string> = {
  Agent: '●',
  Shell: '$',
  Lazygit: 'G',
  Custom: '⚡',
};

const AGENT_STATUS_ICONS: Record<AgentStatus, string> = {
  working: '●',
  waiting: '◉',
  idle: '○',
};

interface PaneContainerProps {
  paneInfo: PaneInfo;
  isActive: boolean;
}

export function PaneContainer({ paneInfo, isActive }: PaneContainerProps) {
  const closePane = useWorkspaceStore((s) => s.closePane);
  const splitPane = useWorkspaceStore((s) => s.splitPane);

  const handleSplitRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    splitPane(paneInfo.id, 'horizontal', 'Shell', paneInfo.cwd);
  };

  const handleSplitDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    splitPane(paneInfo.id, 'vertical', 'Shell', paneInfo.cwd);
  };

  return (
    <div className={`pane-container ${isActive ? 'pane-container--active' : ''}`}>
      <div className="pane-titlebar">
        <span className={`pane-kind-icon ${paneInfo.kind === 'Agent' && paneInfo.agentStatus ? `agent-status--${paneInfo.agentStatus}` : ''}`}>
          {paneInfo.kind === 'Agent' && paneInfo.agentStatus
            ? AGENT_STATUS_ICONS[paneInfo.agentStatus]
            : (KIND_ICONS[paneInfo.kind] ?? '?')}
        </span>
        <span className="pane-title">
          {paneInfo.title ?? paneInfo.cwd.split('/').pop() ?? 'Terminal'}
        </span>
        <span className="pane-title-kind">{paneInfo.kind}</span>
        <div className="pane-titlebar-actions">
          <button
            className="pane-action-btn"
            onClick={handleSplitRight}
            title="Split Right"
          >
            ⏐
          </button>
          <button
            className="pane-action-btn"
            onClick={handleSplitDown}
            title="Split Down"
          >
            ⏤
          </button>
          <button
            className="pane-action-btn pane-close-btn"
            onClick={(e) => {
              e.stopPropagation();
              closePane(paneInfo.id);
            }}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="pane-content">
        <TerminalPane
          paneId={paneInfo.id}
          kind={paneInfo.kind}
          cwd={paneInfo.cwd}
          command={paneInfo.command}
          tmuxSession={paneInfo.tmuxSession}
          isActive={isActive}
        />
      </div>
    </div>
  );
}
