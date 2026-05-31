import { useState, useEffect, useRef, useMemo } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
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
  onOpenSettings: () => void;
}

export function CommandPalette({ isOpen, onClose, onFocusTree, onOpenSettings }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const closePane = useWorkspaceStore((s) => s.closePane);
  const detachPane = useWorkspaceStore((s) => s.detachPane);
  const splitPane = useWorkspaceStore((s) => s.splitPane);
  const panes = useWorkspaceStore((s) => s.panes);
  const nextTab = useWorkspaceStore((s) => s.nextTab);
  const prevTab = useWorkspaceStore((s) => s.prevTab);
  const cyclePaneForward = useWorkspaceStore((s) => s.cyclePaneForward);
  const cyclePaneBackward = useWorkspaceStore((s) => s.cyclePaneBackward);
  const windows = useWorkspaceStore((s) => s.windows);
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const switchWindow = useWorkspaceStore((s) => s.switchWindow);
  const closeWindow = useWorkspaceStore((s) => s.closeWindow);
  const useTmux = useProjectsStore((s) => s.useTmux);
  const setUseTmux = useProjectsStore((s) => s.setUseTmux);
  const agents = useProjectsStore((s) => s.agents);

  const activeWindow = activeWindowId ? windows.get(activeWindowId) ?? null : null;
  const activePaneId = activeWindow?.activePaneId ?? null;

  const commands: Command[] = useMemo(() => {
    const activeCwd = activePaneId ? panes.get(activePaneId)?.cwd ?? '.' : '.';

    const base: Command[] = [
      {
        id: 'close-pane',
        label: 'Close Pane',
        category: 'Pane',
        action: () => { if (activePaneId) closePane(activePaneId); },
      },
      {
        id: 'detach-pane',
        label: 'Detach Pane (keep tmux session alive)',
        category: 'Pane',
        action: () => { if (activePaneId) detachPane(activePaneId); },
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
      ...agents.map((agent) => ({
        id: `new-agent-${agent.id}`,
        label: `New ${agent.name}`,
        category: 'Pane',
        action: () => {
          if (activePaneId)
            splitPane(activePaneId, 'horizontal', 'Agent', activeCwd, undefined, undefined, agent.command);
        },
      })),
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
      {
        id: 'open-settings',
        label: 'Open Settings',
        category: 'Settings',
        action: onOpenSettings,
      },
      {
        id: 'toggle-tmux',
        label: useTmux
          ? 'Disable tmux session persistence'
          : 'Enable tmux session persistence',
        category: 'Settings',
        action: () => { setUseTmux(!useTmux).catch(console.error); },
      },
    ];

    if (activeWindow) {
      const label = activeWindow.projectPath.split('/').pop() || activeWindow.projectPath;
      base.push({
        id: 'close-window',
        label: `Close Window: ${label}`,
        category: 'Window',
        action: () => {
          const win = useWorkspaceStore.getState().windows.get(activeWindow.projectPath);
          if (!win) return;
          const liveAgents = Array.from(useWorkspaceStore.getState().panes.values()).some(
            (p) => p.kind === 'Agent' &&
              win.tabs.some((t) => paneInTree(t.paneTree, p.id)),
          );
          if (win.tabs.length > 1 || liveAgents) {
            const ok = confirm(`Close Window "${label}" and kill ${win.tabs.length} tab(s)?`);
            if (!ok) return;
          }
          closeWindow(activeWindow.projectPath);
        },
      });
    }

    const sortedWindows = Array.from(windows.values())
      .filter((w) => w.projectPath !== activeWindowId)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    for (const win of sortedWindows) {
      const label = win.projectPath.split('/').pop() || win.projectPath;
      base.push({
        id: `switch-window-${win.projectPath}`,
        label: `Switch to Window: ${label}`,
        category: 'Window',
        action: () => switchWindow(win.projectPath),
      });
    }

    return base;
  }, [
    activePaneId, panes, closePane, detachPane, splitPane,
    cyclePaneForward, cyclePaneBackward, nextTab, prevTab, onFocusTree,
    onOpenSettings, useTmux, setUseTmux, agents, windows, activeWindowId, activeWindow,
    switchWindow, closeWindow,
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
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-[rgba(6,7,9,0.6)] pt-[12vh] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[60vh] w-[540px] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          className="w-full border-b border-line bg-transparent px-[18px] py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-ghost"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="scroll-thin overflow-y-auto p-1.5">
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              className={`flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-[9px] ${idx === selectedIdx ? 'bg-ember-tint' : ''}`}
              onClick={() => { cmd.action(); onClose(); }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="w-[72px] flex-none text-[11px] uppercase tracking-[0.06em] text-ink-ghost">{cmd.category}</span>
              <span className="text-[13px] text-ink">{cmd.label}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-[18px] text-center text-[13px] text-ink-ghost">No matching commands</div>
          )}
        </div>
      </div>
    </div>
  );
}

function paneInTree(tree: import('../../types/pane').PaneTree, paneId: string): boolean {
  if (tree.type === 'leaf') return tree.paneId === paneId;
  return paneInTree(tree.children[0], paneId) || paneInTree(tree.children[1], paneId);
}
