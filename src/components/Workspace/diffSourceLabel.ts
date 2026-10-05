import type { DiffSource } from '../../types/gitpanel';

/** Header label for a diff pane, naming the compare branch when there is one. */
export function diffSourceLabel(source: DiffSource, base: string | null): string {
  if (source === 'unstaged') return 'Unstaged changes';
  if (source === 'staged') return 'Staged changes';
  return `Changes vs ${base ?? 'base branch'}`;
}
