import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Check the GitHub Releases `latest.json` for a newer signed build. If one
 * exists, download + install it and relaunch. Errors propagate to the caller,
 * which decides whether to surface or ignore them.
 */
export async function checkForUpdates() {
  const update = await check();
  if (!update) return;

  await update.downloadAndInstall();
  await relaunch();
}
