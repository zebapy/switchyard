import { memo, useCallback } from 'react';
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
  agent?: string;
  isActive: boolean;
}

// Memoized: all props are primitives, so agent-status ticks (which replace the
// panes Map but not this pane's props) skip re-rendering — keeping the heavy
// useTerminal/xterm machinery untouched.
export const TerminalPane = memo(function TerminalPane({ paneId, kind, cwd, command, tmuxSession, agent, isActive }: TerminalPaneProps) {
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const setPaneTitle = useWorkspaceStore((s) => s.setPaneTitle);

  const handleTitleChange = useCallback((title: string) => {
    // tmux emits an empty title until a program sets one (see TMUX_LAUNCH_SCRIPT);
    // ignore blanks so the pane keeps its existing label until a real rename.
    const trimmed = title.trim();
    if (!trimmed) return;
    setPaneTitle(paneId, trimmed);
  }, [paneId, setPaneTitle]);

  const { termRef, focus } = useTerminal({
    paneId,
    kind,
    cwd,
    command,
    tmuxSession,
    agent,
    isActive,
    onTitleChange: handleTitleChange,
  });

  return (
    <div
      className="terminal-pane absolute inset-0 overflow-hidden px-1.5 py-1"
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
});
