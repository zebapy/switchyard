import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useUiStore } from '../stores/ui';

const h3Class = 'mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-ghost';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const btnClass =
  'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-guide hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';

export function GithubSettings() {
  const openGithubConnect = useUiStore((s) => s.openGithubConnect);
  const [connected, setConnected] = useState(false);
  const [login, setLogin] = useState<string | null>(null);

  useEffect(() => {
    invoke<boolean>('github_is_connected').then((isConnected) => {
      setConnected(isConnected);
      if (isConnected) invoke<string | null>('github_account').then(setLogin);
    });
  }, []);

  // The shared connect modal reports success (with the login) here.
  useEffect(() => {
    const unlisten = listen<string>('github:connected', (e) => {
      setConnected(true);
      setLogin(e.payload || null);
    });
    return () => { unlisten.then((off) => off()); };
  }, []);

  const handleDisconnect = useCallback(async () => {
    await invoke('github_logout');
    setConnected(false);
    setLogin(null);
  }, []);

  return (
    <div>
      <h3 className={h3Class}>GitHub</h3>

      {connected ? (
        <>
          <p className={descClass}>
            Connected{login ? <> as <b className="font-semibold text-ink-dim">@{login}</b></> : null}.
          </p>
          <button className={btnClass} onClick={handleDisconnect}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className={descClass}>Sign in to list issues, branches and PRs, show PR status, and send feedback.</p>
          <button className={btnClass} onClick={openGithubConnect}>
            Sign in to GitHub
          </button>
        </>
      )}
    </div>
  );
}
