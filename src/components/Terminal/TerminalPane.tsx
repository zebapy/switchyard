import { useCallback } from 'react';
import { useTerminal } from './useTerminal';
import { useWorkspaceStore } from '../../stores/workspace';
import type { PaneKind } from '../../types/pane';
import '@xterm/xterm/css/xterm.css';

interface TerminalPaneProps {
  paneId: string;
  kind: PaneKind;
  cwd: string;
  command?: string;
  tmuxSession?: string;
  isActive: boolean;
}

export function TerminalPane({ paneId, kind, cwd, command, tmuxSession, isActive }: TerminalPaneProps) {
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const setPaneTitle = useWorkspaceStore((s) => s.setPaneTitle);

  const handleTitleChange = useCallback((title: string) => {
    setPaneTitle(paneId, title);
  }, [paneId, setPaneTitle]);

  const { termRef, focus } = useTerminal({
    paneId,
    kind,
    cwd,
    command,
    tmuxSession,
    isActive,
    onTitleChange: handleTitleChange,
  });

  return (
    <div
      className={`terminal-pane ${isActive ? 'terminal-pane--active' : ''}`}
      onClick={() => {
        setActivePane(paneId);
        focus();
      }}
    >
      <div
        ref={termRef}
        className="terminal-xterm"
      />
    </div>
  );
}
