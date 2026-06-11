import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface LinearViewer {
  name: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

interface LinearQueryResponse {
  data?: { viewer: LinearViewer };
}

const VIEWER_QUERY = `{
  viewer { name displayName email avatarUrl }
}`;

const sectionClass = 'mb-[18px] border-b border-line pb-4 last:mb-0 last:border-b-0 last:pb-0';
const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const btnClass =
  'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-guide hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';

export function LinearSettings() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<LinearViewer | null>(null);

  const loadViewer = useCallback(async () => {
    const result = await invoke<LinearQueryResponse>('linear_query', { query: VIEWER_QUERY }).catch((e) => String(e));
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    setViewer(result.data?.viewer ?? null);
  }, []);

  useEffect(() => {
    invoke<boolean>('linear_is_connected').then((isConnected) => {
      setConnected(isConnected);
      if (isConnected) loadViewer();
    });
  }, [loadViewer]);

  const handleConnect = useCallback(async () => {
    setBusy(true);
    setError('');
    const result = await invoke('linear_login').catch((e) => String(e));
    setBusy(false);
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    setConnected(true);
    loadViewer();
  }, [loadViewer]);

  const handleDisconnect = useCallback(async () => {
    await invoke('linear_logout');
    setConnected(false);
    setViewer(null);
  }, []);

  return (
    <div className={sectionClass}>
      <h3 className={h3Class}>Linear</h3>
      {!connected && (
        <>
          <p className={descClass}>Connect your Linear workspace to view and manage issues.</p>
          <button className={btnClass} onClick={handleConnect} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Linear'}
          </button>
        </>
      )}
      {connected && (
        <>
          <div className="mb-2.5 flex items-center gap-2.5">
            {viewer?.avatarUrl ? (
              <img
                src={viewer.avatarUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full border border-line object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-app text-xs font-semibold text-ink-dim">
                {(viewer?.displayName || viewer?.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-ink">
                {viewer ? viewer.displayName || viewer.name : 'Connected to Linear'}
              </div>
              {viewer?.email && <div className="truncate text-xs text-ink-faint">{viewer.email}</div>}
            </div>
          </div>
          <button className={btnClass} onClick={handleDisconnect}>
            Sign out
          </button>
        </>
      )}
      {error && <p className="mt-2 text-xs text-del">{error}</p>}
    </div>
  );
}
