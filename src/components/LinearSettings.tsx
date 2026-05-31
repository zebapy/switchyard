import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface LinearIssue {
  identifier: string;
  title: string;
  state: { name: string };
}

interface LinearQueryResponse {
  data?: { issues: { nodes: LinearIssue[] } };
}

const ISSUES_QUERY = `{
  issues(first: 10, orderBy: updatedAt) {
    nodes { identifier title state { name } }
  }
}`;

const sectionClass = 'mb-[18px] border-b border-line pb-4 last:mb-0 last:border-b-0 last:pb-0';
const h3Class = 'mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-ghost';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const btnClass =
  'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-ember-edge hover:bg-ember-tint hover:text-ember disabled:cursor-default disabled:opacity-50';

export function LinearSettings() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<LinearIssue[] | null>(null);

  useEffect(() => {
    invoke<boolean>('linear_is_connected').then(setConnected);
  }, []);

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
  }, []);

  const handleDisconnect = useCallback(async () => {
    await invoke('linear_logout');
    setConnected(false);
    setIssues(null);
  }, []);

  const handleLoadIssues = useCallback(async () => {
    setBusy(true);
    setError('');
    const result = await invoke<LinearQueryResponse>('linear_query', { query: ISSUES_QUERY }).catch((e) => String(e));
    setBusy(false);
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    setIssues(result.data?.issues.nodes ?? []);
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
          <p className={descClass}>Connected to Linear.</p>
          <div className="flex gap-2">
            <button className={btnClass} onClick={handleLoadIssues} disabled={busy}>
              {busy ? 'Loading…' : 'Load recent issues'}
            </button>
            <button className={btnClass} onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
          {issues && issues.length === 0 && <p className="mt-2.5 text-xs italic text-ink-ghost">No issues found.</p>}
          {issues && issues.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {issues.map((issue) => (
                <li
                  key={issue.identifier}
                  className="flex items-center gap-2 rounded-[9px] border border-line bg-app px-2.5 py-2 text-xs"
                >
                  <span className="shrink-0 font-mono text-ink-faint">{issue.identifier}</span>
                  <span className="flex-1 truncate text-ink" title={issue.title}>
                    {issue.title}
                  </span>
                  <span className="shrink-0 text-ink-faint">{issue.state.name}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="mt-2 text-xs text-del">{error}</p>}
    </div>
  );
}
