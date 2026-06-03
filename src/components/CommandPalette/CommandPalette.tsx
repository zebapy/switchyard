import { useEffect, useMemo } from 'react';
import { Command as Cmdk } from 'cmdk';
import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';

interface PaletteCommand {
  id: string;
  label: string;
  category: string;
  action: () => void;
  /** Dimmed secondary text shown after the label (e.g. the owning project). */
  hint?: string;
  /** Dimmed line shown beneath the label (e.g. the worktree path / cwd). */
  sublabel?: string;
  /** Text matched against the query when set; falls back to `label`. */
  searchText?: string;
}

/** A branch/worktree (or open window) the palette can locate and open. */
interface BranchTarget {
  path: string;
  branchName: string;
  projectName: string;
  /** lastActiveAt of its open window, or null when no window is open. */
  lastActiveAt: number | null;
}

/** Order categories appear in the list; unknown categories are appended. */
const CATEGORY_ORDER = ['Workspace', 'Branch', 'Pane', 'Tab', 'Navigation', 'Settings', 'Window'];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onFocusTree: () => void;
  onOpenSettings: () => void;
}

export function CommandPalette({ isOpen, onClose, onFocusTree, onOpenSettings }: CommandPaletteProps) {
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
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const closeWindow = useWorkspaceStore((s) => s.closeWindow);
  const useTmux = useProjectsStore((s) => s.useTmux);
  const setUseTmux = useProjectsStore((s) => s.setUseTmux);
  const agents = useProjectsStore((s) => s.agents);
  const projects = useProjectsStore((s) => s.projects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);
  const showPane = useUiStore((s) => s.showPane);

  const activeWindow = activeWindowId ? windows.get(activeWindowId) ?? null : null;
  const activePaneId = activeWindow?.activePaneId ?? null;

  const commands: PaletteCommand[] = useMemo(() => {
    const activeCwd = activePaneId ? panes.get(activePaneId)?.cwd ?? '.' : '.';

    const base: PaletteCommand[] = [
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

    return base;
  }, [
    activePaneId, panes, closePane, detachPane, splitPane,
    cyclePaneForward, cyclePaneBackward, nextTab, prevTab, onFocusTree,
    onOpenSettings, useTmux, setUseTmux, agents, activeWindow, closeWindow,
  ]);

  // Reveal or open a branch/worktree window. Mirrors BranchRow's openWorkspace:
  // switch to the existing window if it has tabs, otherwise start the default
  // agent. Reads live window state so a stale closure can't reopen a dead window.
  const defaultAgent = agents[0]?.command;
  const openTarget = (target: BranchTarget) => {
    const win = useWorkspaceStore.getState().windows.get(target.path);
    if (win && win.tabs.length > 0) {
      switchWindow(target.path);
      setActiveTab(win.activeTabId ?? win.tabs[0].id);
    } else {
      addTab(target.path, target.branchName, { kind: 'Agent', cwd: target.path, agent: defaultAgent });
    }
    showPane();
  };

  // One searchable entry per branch/worktree across every project, plus any open
  // window not yet covered by git info. Matched on "branch project path" so typing
  // any of them locates it; open workspaces are categorised separately.
  const locateCommands: PaletteCommand[] = useMemo(() => {
    const targets = new Map<string, BranchTarget>();

    for (const project of projects) {
      const info = gitInfo.get(project.path);
      if (!info) continue;
      for (const wt of info.worktrees) {
        const win = windows.get(wt.path);
        targets.set(wt.path, {
          path: wt.path,
          branchName: wt.branch ?? basename(wt.path),
          projectName: project.name,
          lastActiveAt: win && win.tabs.length > 0 ? win.lastActiveAt : null,
        });
      }
    }

    // Open windows whose git info hasn't loaded yet still need to be reachable.
    for (const win of windows.values()) {
      if (targets.has(win.projectPath) || win.tabs.length === 0) continue;
      const owner = projects.find(
        (p) => p.path === win.projectPath || win.projectPath.startsWith(`${p.path}/`),
      );
      targets.set(win.projectPath, {
        path: win.projectPath,
        branchName: basename(win.projectPath),
        projectName: owner?.name ?? '',
        lastActiveAt: win.lastActiveAt,
      });
    }

    return Array.from(targets.values())
      .sort((a, b) => {
        // Open workspaces first (most recent on top), then branches by name.
        if (a.lastActiveAt !== null && b.lastActiveAt !== null) return b.lastActiveAt - a.lastActiveAt;
        if (a.lastActiveAt !== null) return -1;
        if (b.lastActiveAt !== null) return 1;
        return a.branchName.localeCompare(b.branchName);
      })
      .map((target) => ({
        id: `locate-${target.path}`,
        label: target.branchName,
        category: target.lastActiveAt !== null ? 'Workspace' : 'Branch',
        hint: target.projectName,
        sublabel: tildePath(target.path),
        searchText: `${target.branchName} ${target.projectName} ${target.path}`.trim(),
        action: () => openTarget(target),
      }));
    // openTarget closes over stable store actions; rebuild only when data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, gitInfo, windows]);

  // Group every command under its category heading, in CATEGORY_ORDER.
  const groups = useMemo(() => {
    const byCategory = new Map<string, PaletteCommand[]>();
    for (const cmd of [...locateCommands, ...commands]) {
      const list = byCategory.get(cmd.category) ?? [];
      list.push(cmd);
      byCategory.set(cmd.category, list);
    }
    const ordered = [...byCategory.keys()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
    return ordered.map((category) => ({ category, items: byCategory.get(category)! }));
  }, [commands, locateCommands]);

  // Load every project's branches when the palette opens so they're all
  // searchable, not just those whose tree row has been expanded.
  useEffect(() => {
    if (!isOpen) return;
    for (const project of projects) {
      if (project.is_git) refreshGitInfo(project.path);
    }
  }, [isOpen, projects, refreshGitInfo]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-[rgba(6,7,9,0.6)] pt-[12vh] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <Cmdk
        label="Command palette"
        loop
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
        className="flex max-h-[60vh] w-[540px] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Cmdk.Input
          autoFocus
          placeholder="Search commands, branches, and workspaces…"
          className="w-full border-b border-line bg-transparent px-[18px] py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-ghost"
        />
        <Cmdk.List className="scroll-thin overflow-y-auto p-1.5">
          <Cmdk.Empty className="p-[18px] text-center text-[13px] text-ink-ghost">
            No matching results
          </Cmdk.Empty>
          {groups.map(({ category, items }) => (
            <Cmdk.Group
              key={category}
              heading={category}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-ink-ghost"
            >
              {items.map((cmd) => (
                <Cmdk.Item
                  key={cmd.id}
                  value={cmd.searchText ?? cmd.label}
                  onSelect={() => { cmd.action(); onClose(); }}
                  className="flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-[9px] data-[selected=true]:bg-ember-tint"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-ink">{cmd.label}</span>
                    {cmd.sublabel && (
                      <span className="truncate font-mono text-[11px] text-ink-ghost">{cmd.sublabel}</span>
                    )}
                  </span>
                  {cmd.hint && (
                    <span className="flex-none self-start truncate pl-3 text-[12px] text-ink-ghost">{cmd.hint}</span>
                  )}
                </Cmdk.Item>
              ))}
            </Cmdk.Group>
          ))}
        </Cmdk.List>
      </Cmdk>
    </div>
  );
}

function paneInTree(tree: import('../../types/pane').PaneTree, paneId: string): boolean {
  if (tree.type === 'leaf') return tree.paneId === paneId;
  return paneInTree(tree.children[0], paneId) || paneInTree(tree.children[1], paneId);
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

/** Abbreviate the home directory to `~` for a shorter, readable cwd. */
function tildePath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~');
}
