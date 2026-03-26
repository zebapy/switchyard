import { useTerminal } from './useTerminal';
import { useWorkspaceStore } from '../../stores/workspace';
import type { PaneKind } from '../../types/pane';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  paneId: string;
  kind: PaneKind;
  cwd: string;
  command?: string;
  isActive: boolean;
}

export function TerminalPane({ paneId, kind, cwd, command, isActive }: TerminalPaneProps) {
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);

  const { termRef } = useTerminal({
    paneId,
    kind,
    cwd,
    command,
  });

  return (
    <div
      className={`terminal-pane ${isActive ? 'terminal-pane--active' : ''}`}
      onClick={() => setActivePane(paneId)}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div
        ref={termRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
