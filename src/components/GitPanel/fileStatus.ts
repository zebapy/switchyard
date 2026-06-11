/** Shared presentation helpers for changed-file rows and diff sections. */

/** Single-letter badge for a git delta status. */
export const STATUS_SHORT: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U',
  typechange: 'T',
  conflicted: '!',
};

/** Tailwind text-colour token for a git delta status. */
export const STATUS_COLOR: Record<string, string> = {
  added: 'text-green',
  untracked: 'text-green',
  deleted: 'text-del',
  conflicted: 'text-del',
  modified: 'text-ember',
  renamed: 'text-ember',
  copied: 'text-ember',
  typechange: 'text-ember',
};

export function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

export function dirname(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.join('/');
}
