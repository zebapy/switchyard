import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface DeviceCode {
  user_code: string;
  verification_uri: string;
}

const sectionClass = 'mb-[18px] border-b border-line pb-4 last:mb-0 last:border-b-0 last:pb-0';
const h3Class = 'mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-ghost';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const btnClass =
  'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-ember-edge hover:bg-ember-tint hover:text-ember disabled:cursor-default disabled:opacity-50';

export function GithubSettings() {
  const [connected, setConnected] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke<boolean>('github_is_connected').then((isConnected) => {
      setConnected(isConnected);
      if (isConnected) invoke<string | null>('github_account').then(setLogin);
    });
  }, []);

  // The backend emits the code the user types on github.com during device flow.
  useEffect(() => {
    const unlisten = listen<DeviceCode>('github:device_code', (event) => {
      setDeviceCode(event.payload);
    });
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setBusy(true);
    setError('');
    setDeviceCode(null);
    const result = await invoke<string>('github_login').catch((e) => String(e));
    setBusy(false);
    setDeviceCode(null);
    if (typeof result === 'string' && result.startsWith('Error')) {
      setError(result);
      return;
    }
    setConnected(true);
    setLogin(typeof result === 'string' && result ? result : null);
  }, []);

  const handleDisconnect = useCallback(async () => {
    await invoke('github_logout');
    setConnected(false);
    setLogin(null);
    setDeviceCode(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (!deviceCode) return;
    navigator.clipboard.writeText(deviceCode.user_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [deviceCode]);

  return (
    <div className={sectionClass}>
      <h3 className={h3Class}>GitHub</h3>

      {!connected && !busy && (
        <>
          <p className={descClass}>Sign in to list issues, branches and PRs, and show PR status.</p>
          <button className={btnClass} onClick={handleConnect}>
            Sign in to GitHub
          </button>
        </>
      )}

      {busy && (
        <>
          {!deviceCode && <p className={descClass}>Starting sign-in…</p>}
          {deviceCode && (
            <div className="rounded-[9px] border border-line bg-app px-3 py-2.5">
              <p className="mb-2 text-xs text-ink-faint">
                Opened github.com in your browser. Enter this code to finish signing in:
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded-md border border-line-soft bg-side px-2.5 py-1 font-mono text-[15px] tracking-[0.18em] text-ink">
                  {deviceCode.user_code}
                </code>
                <button type="button" className={btnClass} onClick={handleCopy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {connected && (
        <>
          <p className={descClass}>
            Connected{login ? <> as <b className="font-semibold text-ink-dim">@{login}</b></> : null}.
          </p>
          <button className={btnClass} onClick={handleDisconnect}>
            Sign out
          </button>
        </>
      )}

      {error && <p className="mt-2 text-xs text-del">{error}</p>}
    </div>
  );
}
