import type { ProjectInfo, GitInfo, WorktreeSort } from '../types/project';
import type { PaneInfo, PaneTree, Window } from '../types/pane';
import { sortWorktrees } from '../lib/sortWorktrees';

/** A top-level repo, with rolled-up worktree and pane counts. */
export interface ProjectRow {
  path: string;
  name: string;
  worktrees: number;
  panes: number;
}

/** A workspace = a repo's root or one of its git worktrees. */
export interface WorktreeRow {
  path: string;
  name: string;
  isMain: boolean;
  panes: number;
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

/** A pane's display name: user name > terminal title > kind fallback. */
export function paneLabel(info: PaneInfo): string {
  if (info.customName) return info.customName;
  if (info.title) return info.title;
  if (info.kind === 'Agent') return info.agent || 'agent';
  return basename(info.cwd) || info.kind.toLowerCase();
}

/** Tier 1 — top-level repos (worktree children are folded into their parent). */
export function deriveProjectRows(projects: ProjectInfo[], gitInfo: GitInfoMap, windows: Windows): ProjectRow[] {
  return projects
    .filter((p) => !p.worktree_parent)
    .map((p) => {
      const worktrees = gitInfo.get(p.path)?.worktrees ?? [];
      const paneSources = worktrees.length ? worktrees.map((w) => w.path) : [p.path];
      const panes = paneSources.reduce((n, path) => n + countPanes(windows, path), 0);
      return { path: p.path, name: p.name, worktrees: worktrees.length || 1, panes };
    });
}

/** Tier 2 — a project's root + worktrees (or the project itself when non-git),
 *  ordered by the project's chosen sort (root/main always pinned on top). */
export function deriveWorktreeRows(
  gitInfo: GitInfoMap,
  windows: Windows,
  projectPath: string,
  sort: WorktreeSort,
  prBranches?: Set<string>,
): WorktreeRow[] {
  const worktrees = gitInfo.get(projectPath)?.worktrees ?? [];
  if (worktrees.length) {
    return sortWorktrees(worktrees, sort, { prBranches }).map((wt) => ({
      path: wt.path,
      name: wt.branch ?? basename(wt.path),
      isMain: wt.is_main,
      panes: countPanes(windows, wt.path),
    }));
  }
  return [{ path: projectPath, name: basename(projectPath), isMain: true, panes: countPanes(windows, projectPath) }];
}

/** Tier 3 — every leaf pane in a worktree's window, flattened across tabs/splits. */
export function derivePaneRows(windows: Windows, panes: Panes, worktreePath: string): PaneRow[] {
  const win = windows.get(worktreePath);
  if (!win) return [];
  const rows: PaneRow[] = [];
  for (const tab of win.tabs) {
    for (const id of flattenLeaves(tab.paneTree)) {
      const info = panes.get(id);
      if (info) rows.push({ paneId: id, info });
    }
  }
  return rows;
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
