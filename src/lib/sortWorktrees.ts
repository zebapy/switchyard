// Order a project's worktree list for display. The root (main) worktree always
// stays pinned to the top; the rest are ordered by the project's chosen sort.

import type { WorktreeInfo, WorktreeSort } from '../types/project';

/** Extra data some sorts need that doesn't live on the worktree itself. */
export interface SortContext {
  /** Branch names that have an open pull request, for the 'pr' sort. */
  prBranches?: Set<string>;
}

/** Display label a name-sort compares on: branch, falling back to the path basename. */
function worktreeLabel(worktree: WorktreeInfo): string {
  if (worktree.branch) return worktree.branch;
  return worktree.path.split('/').filter(Boolean).pop() ?? worktree.path;
}

/** Total uncommitted lines touched — the 'changes' sort key. */
function changeCount(worktree: WorktreeInfo): number {
  return worktree.added + worktree.deleted;
}

/** Whether this worktree's branch has an open pull request. */
function hasPr(worktree: WorktreeInfo, prBranches: Set<string> | undefined): boolean {
  return worktree.branch !== null && (prBranches?.has(worktree.branch) ?? false);
}

/** Compare two worktrees by the chosen sort. Missing timestamps sort last. */
function compareBySort(
  a: WorktreeInfo,
  b: WorktreeInfo,
  sort: WorktreeSort,
  context: SortContext,
): number {
  if (sort === 'name') {
    return worktreeLabel(a).localeCompare(worktreeLabel(b), undefined, { sensitivity: 'base' });
  }
  if (sort === 'created') {
    return (b.created_unix ?? 0) - (a.created_unix ?? 0);
  }
  if (sort === 'changes') {
    return changeCount(b) - changeCount(a);
  }
  if (sort === 'pr') {
    // PR-bearing worktrees first, then most-recently-committed within each group.
    const prDiff = Number(hasPr(b, context.prBranches)) - Number(hasPr(a, context.prBranches));
    if (prDiff !== 0) return prDiff;
    return (b.last_commit_unix ?? 0) - (a.last_commit_unix ?? 0);
  }
  return (b.last_commit_unix ?? 0) - (a.last_commit_unix ?? 0);
}

/** Return a new array with root first, remaining worktrees ordered by `sort`. */
export function sortWorktrees(
  worktrees: WorktreeInfo[],
  sort: WorktreeSort,
  context: SortContext = {},
): WorktreeInfo[] {
  return [...worktrees].sort((a, b) => {
    if (a.is_main !== b.is_main) return Number(b.is_main) - Number(a.is_main);
    return compareBySort(a, b, sort, context);
  });
}
