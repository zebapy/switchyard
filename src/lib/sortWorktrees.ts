// Order a project's worktree list for display. The root (main) worktree always
// stays pinned to the top; the rest are ordered by the project's chosen sort.

import type { WorktreeInfo, WorktreeSort } from '../types/project';

/** Display label a name-sort compares on: branch, falling back to the path basename. */
function worktreeLabel(worktree: WorktreeInfo): string {
  if (worktree.branch) return worktree.branch;
  return worktree.path.split('/').filter(Boolean).pop() ?? worktree.path;
}

/** Compare two worktrees by the chosen sort. Missing timestamps sort last. */
function compareBySort(a: WorktreeInfo, b: WorktreeInfo, sort: WorktreeSort): number {
  if (sort === 'name') {
    return worktreeLabel(a).localeCompare(worktreeLabel(b), undefined, { sensitivity: 'base' });
  }
  if (sort === 'created') {
    return (b.created_unix ?? 0) - (a.created_unix ?? 0);
  }
  return (b.last_commit_unix ?? 0) - (a.last_commit_unix ?? 0);
}

/** Return a new array with root first, remaining worktrees ordered by `sort`. */
export function sortWorktrees(worktrees: WorktreeInfo[], sort: WorktreeSort): WorktreeInfo[] {
  return [...worktrees].sort((a, b) => {
    if (a.is_main !== b.is_main) return Number(b.is_main) - Number(a.is_main);
    return compareBySort(a, b, sort);
  });
}
