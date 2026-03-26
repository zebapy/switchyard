import { useState, useEffect, useRef, useMemo } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { fuzzyMatch } from './fuzzyMatch';

interface Command {
  id: string;
  label: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onFocusTree: () => void;
}

export function CommandPalette({ isOpen, onClose, onFocusTree }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const closePane = useWorkspaceStore((s) => s.closePane);
  const activePaneId = useWorkspaceStore((s) => s.activePaneId);
  const splitPane = useWorkspaceStore((s) => s.splitPane);
  const panes = useWorkspaceStore((s) => s.panes);
  const nextTab = useWorkspaceStore((s) => s.nextTab);
  const prevTab = useWorkspaceStore((s) => s.prevTab);
  const cyclePaneForward = useWorkspaceStore((s) => s.cyclePaneForward);
  const cyclePaneBackward = useWorkspaceStore((s) => s.cyclePaneBackward);

  const commands: Command[] = useMemo(() => {
    const activeCwd = activePaneId
      ? panes.get(activePaneId)?.cwd ?? '.'
      : '.';

    return [
      {
        id: 'close-pane',
        label: 'Close Pane',
        category: 'Pane',
        action: () => { if (activePaneId) closePane(activePaneId); },
      },
      {
        id: 'split-right',
        label: 'Split Right',
        category: 'Pane',
        action: () => {
          if (activePaneId) splitPane(activePaneId, 'horizontal', 'Shell', activeCwd);
        },
      },
      {
        id: 'split-down',
        label: 'Split Down',
        category: 'Pane',
        action: () => {
          if (activePaneId) splitPane(activePaneId, 'vertical', 'Shell', activeCwd);
        },
      },
      {
        id: 'new-agent',
        label: 'New Agent',
        category: 'Pane',
        action: () => {
          if (activePaneId) splitPane(activePaneId, 'horizontal', 'Agent', activeCwd);
        },
      },
      {
        id: 'new-terminal',
        label: 'New Terminal',
        category: 'Pane',
        action: () => {
          if (activePaneId) splitPane(activePaneId, 'horizontal', 'Shell', activeCwd);
        },
      },
      {
        id: 'next-pane',
        label: 'Next Pane',
        category: 'Pane',
        action: cyclePaneForward,
      },
      {
        id: 'prev-pane',
        label: 'Previous Pane',
        category: 'Pane',
        action: cyclePaneBackward,
      },
      {
        id: 'next-tab',
        label: 'Next Tab',
        category: 'Tab',
        action: nextTab,
      },
      {
        id: 'prev-tab',
        label: 'Previous Tab',
        category: 'Tab',
        action: prevTab,
      },
      {
        id: 'focus-tree',
        label: 'Focus Project Tree',
        category: 'Navigation',
        action: onFocusTree,
      },
    ];
  }, [
    activePaneId, panes, closePane, splitPane,
    cyclePaneForward, cyclePaneBackward, nextTab, prevTab, onFocusTree,
  ]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    return commands
      .map((cmd) => ({ cmd, result: fuzzyMatch(query, cmd.label) }))
      .filter((r) => r.result !== null)
      .sort((a, b) => b.result!.score - a.result!.score)
      .map((r) => r.cmd);
  }, [query, commands]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIdx]) {
          filtered[selectedIdx].action();
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          className="command-palette-input"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette-list">
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`command-palette-item ${idx === selectedIdx ? 'command-palette-item--selected' : ''}`}
              onClick={() => {
                cmd.action();
                onClose();
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="command-category">{cmd.category}</span>
              <span className="command-label">{cmd.label}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="command-palette-empty">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
}
