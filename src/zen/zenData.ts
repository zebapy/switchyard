import type { ProjectInfo, GitInfo, WorktreeSort, ProjectListSort, PaneSort, PullRequestItem, PrInfo } from '../types/project';
import type { PaneInfo, PaneTree, Window } from '../types/pane';
import { sortWorktrees } from '../lib/sortWorktrees';

/** A top-level repo, with rolled-up worktree and pane counts. */
export interface ProjectRow {
  path: string;
  name: string;
  worktrees: number;
  panes: number;
  /** Unix ms the project's most-recently-focused window was last active (0 if none). */
  lastActiveAt: number;
  /** Pinned to the top of the project list regardless of sort. */
  pinned: boolean;
}

/** Rolled-up live-agent status counts across a worktree's panes. */
export interface PaneStatusCounts {
  /** Agents actively working. */
  working: number;
  /** Agents waiting on user input. */
  waiting: number;
  /** Live agents sitting idle. */
  idle: number;
}

/** A workspace = a repo's root or one of its git worktrees. */
export interface WorktreeRow {
  path: string;
  name: string;
  /** The worktree's checked-out branch, if any — the head ref matched against open PRs. */
  branch: string | null;
  isMain: boolean;
  panes: number;
  /** Live-agent status rollup for this worktree's panes. */
  status: PaneStatusCounts;
  /** Pinned above unpinned worktrees (the root/main worktree still sorts first). */
  pinned: boolean;
  /** The pull request for this worktree's branch (open, merged, or closed), when one exists. */
  pr?: PrInfo;
}

/** A single leaf pane within a worktree's window. */
export interface PaneRow {
  paneId: string;
  info: PaneInfo;
}

type Windows = Map<string, Window>;
type GitInfoMap = Map<string, GitInfo>;
type Panes = Map<string, PaneInfo>;

export function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

function flattenLeaves(tree: PaneTree): string[] {
  if (tree.type === 'leaf') return [tree.paneId];
  return [...flattenLeaves(tree.children[0]), ...flattenLeaves(tree.children[1])];
}

function countPanes(windows: Windows, path: string): number {
  const win = windows.get(path);
  if (!win) return 0;
  return win.tabs.reduce((n, t) => n + flattenLeaves(t.paneTree).length, 0);
}

/** Roll up live-agent statuses across every pane in a worktree's window. */
function countAgentStatuses(windows: Windows, panes: Panes, path: string): PaneStatusCounts {
  const counts: PaneStatusCounts = { working: 0, waiting: 0, idle: 0 };
  const win = windows.get(path);
  if (!win) return counts;
  for (const tab of win.tabs) {
    for (const id of flattenLeaves(tab.paneTree)) {
      const info = panes.get(id);
      if (!info || !isLiveAgent(info)) continue;
      if (info.agentStatus === 'working') counts.working += 1;
      else if (info.agentStatus === 'waiting') counts.waiting += 1;
      else counts.idle += 1;
    }
  }
  return counts;
}

/** A pane's display name: user name > terminal title > kind fallback. */
export function paneLabel(info: PaneInfo): string {
  if (info.customName) return info.customName;
  if (info.title) return info.title;
  if (info.kind === 'Agent') return info.agent || 'agent';
  return basename(info.cwd) || info.kind.toLowerCase();
}

/** Most-recent `lastActiveAt` across a project's own window and its worktree windows. */
function lastActiveAcross(windows: Windows, paths: string[]): number {
  let latest = 0;
  for (const path of paths) {
    const at = windows.get(path)?.lastActiveAt ?? 0;
    if (at > latest) latest = at;
  }
  return latest;
}

/** Reorder project rows by the chosen sort. `manual` keeps the incoming order. */
function sortProjectRows(rows: ProjectRow[], sort: ProjectListSort): ProjectRow[] {
  if (sort === 'manual') return rows;
  const next = [...rows];
  if (sort === 'name') {
    next.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } else if (sort === 'workspaces') {
    next.sort((a, b) => b.worktrees - a.worktrees);
  } else if (sort === 'panes') {
    next.sort((a, b) => b.panes - a.panes);
  } else {
    next.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }
  return next;
}

/** Tier 1 — top-level repos (worktree children are folded into their parent).
 *  Pinned projects float to the top; the chosen sort orders within each group. */
export function deriveProjectRows(
  projects: ProjectInfo[],
  gitInfo: GitInfoMap,
  windows: Windows,
  sort: ProjectListSort,
  pins: ReadonlySet<string>,
): ProjectRow[] {
  const rows = projects
    .filter((p) => !p.worktree_parent)
    .map((p) => {
      const worktrees = gitInfo.get(p.path)?.worktrees ?? [];
      const paneSources = worktrees.length ? worktrees.map((w) => w.path) : [p.path];
      const panes = paneSources.reduce((n, path) => n + countPanes(windows, path), 0);
      return {
        path: p.path,
        name: p.name,
        worktrees: worktrees.length || 1,
        panes,
        lastActiveAt: lastActiveAcross(windows, paneSources),
        pinned: pins.has(p.path),
      };
    });
  const sorted = sortProjectRows(rows, sort);
  // Stable float: pinned first, sort order preserved within each group.
  return [...sorted].sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

/** Tier 2 — a project's root + worktrees (or the project itself when non-git),
 *  ordered by the project's chosen sort (root/main always pinned on top). */
export function deriveWorktreeRows(
  gitInfo: GitInfoMap,
  windows: Windows,
  panes: Panes,
  projectPath: string,
  sort: WorktreeSort,
  pins: ReadonlySet<string>,
  prsByBranch?: Map<string, PullRequestItem>,
  prByPath?: Map<string, PrInfo | null>,
): WorktreeRow[] {
  const worktrees = gitInfo.get(projectPath)?.worktrees ?? [];
  if (worktrees.length) {
    const rows = sortWorktrees(worktrees, sort, { prsByBranch }).map((wt) => ({
      path: wt.path,
      name: wt.branch ?? basename(wt.path),
      branch: wt.branch,
      isMain: wt.is_main,
      panes: countPanes(windows, wt.path),
      status: countAgentStatuses(windows, panes, wt.path),
      pinned: pins.has(wt.path),
      pr: prByPath?.get(wt.path) ?? undefined,
    }));
    // Stable float: root/main stays first, then pinned worktrees, then the rest.
    const rank = (row: WorktreeRow) => (row.isMain ? 0 : row.pinned ? 1 : 2);
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }
  return [{ path: projectPath, name: basename(projectPath), branch: null, isMain: true, panes: countPanes(windows, projectPath), status: countAgentStatuses(windows, panes, projectPath), pinned: pins.has(projectPath) }];
}

/** True while a pane is still a live agent chat (not a shell, not an exited agent). */
function isLiveAgent(info: PaneInfo): boolean {
  return info.kind === 'Agent' && !info.agentExited;
}

/** Which section a pane lists under — agent chats vs everything else (shells, diffs, files). */
export function paneGroup(info: PaneInfo): 'Agents' | 'Terminals' {
  return info.kind === 'Agent' ? 'Agents' : 'Terminals';
}

/** Status priority for the 'status' sort: awaiting input → working → idle → terminals. */
function statusRank(info: PaneInfo): number {
  if (!isLiveAgent(info)) return 3;
  if (info.agentStatus === 'waiting') return 0;
  if (info.agentStatus === 'working') return 1;
  return 2; // idle or unknown
}

/** Reorder pane rows by the chosen sort, keeping insertion order within ties. */
function sortPaneRows(rows: PaneRow[], sort: PaneSort): PaneRow[] {
  const bySort = (() => {
    if (sort === 'name') {
      return [...rows].sort((a, b) =>
        paneLabel(a.info).localeCompare(paneLabel(b.info), undefined, { sensitivity: 'base' }),
      );
    }
    if (sort === 'kind') {
      // Live agents first, then everything else; stable within each group.
      return [...rows].sort((a, b) => Number(isLiveAgent(b.info)) - Number(isLiveAgent(a.info)));
    }
    return [...rows].sort((a, b) => statusRank(a.info) - statusRank(b.info));
  })();
  // Agents always group above terminals (sort applies within each group). Stable
  // sort preserves the chosen order inside a group, and keeps the section
  // headings the tier list draws contiguous.
  return bySort.sort((a, b) => Number(paneGroup(b.info) === 'Agents') - Number(paneGroup(a.info) === 'Agents'));
}

/** Tier 3 — every leaf pane in a worktree's window, flattened across tabs/splits. */
export function derivePaneRows(windows: Windows, panes: Panes, worktreePath: string, sort: PaneSort): PaneRow[] {
  const win = windows.get(worktreePath);
  if (!win) return [];
  const rows: PaneRow[] = [];
  for (const tab of win.tabs) {
    for (const id of flattenLeaves(tab.paneTree)) {
      const info = panes.get(id);
      if (info) rows.push({ paneId: id, info });
    }
  }
  return sortPaneRows(rows, sort);
}

/** Project + worktree names for a window key, for the focus breadcrumb. */
export function resolveContext(
  projects: ProjectInfo[],
  gitInfo: GitInfoMap,
  windowPath: string,
): { projectName: string; worktreeName: string } {
  for (const p of projects) {
    if (p.path === windowPath) return { projectName: p.name, worktreeName: basename(windowPath) };
    const wt = gitInfo.get(p.path)?.worktrees.find((w) => w.path === windowPath);
    if (wt) return { projectName: p.name, worktreeName: wt.branch ?? basename(windowPath) };
  }
  const owner = projects.find((p) => windowPath.startsWith(`${p.path}/`));
  return { projectName: owner?.name ?? basename(windowPath), worktreeName: basename(windowPath) };
}
