import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

/** Human name for a git hosting provider, used in menu/command labels. */
export function hostLabel(host: string | null | undefined): string {
  if (host === 'github') return 'GitHub';
  if (host === 'gitlab') return 'GitLab';
  if (host === 'bitbucket') return 'Bitbucket';
  return 'remote';
}

/**
 * Open the given branch of the repo at `path` on its `origin` hosting provider
 * in the default browser. The backend resolves the provider-specific tree URL;
 * a repo with no `origin` (or an unparseable remote) resolves to null and
 * quietly does nothing.
 */
export async function openBranchOnRemote(path: string, branch: string): Promise<void> {
  const url = await invoke<string | null>('remote_branch_url', { path, branch }).catch(() => null);
  if (!url) return;
  await openUrl(url).catch(() => null);
}
