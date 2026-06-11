import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { CheckRun } from '../../types/gitpanel';
import { CheckIcon, ExternalLinkIcon, ChevronIcon } from '../icons';

interface ChecksListProps {
  path: string;
  checks: CheckRun[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

function StatusGlyph({ check }: { check: CheckRun }) {
  if (check.status !== 'completed') return <span className="animate-pulse-dot text-ember">◌</span>;
  switch (check.conclusion) {
    case 'success':
      return <CheckIcon size={12} className="text-green" />;
    case 'neutral':
    case 'skipped':
      return <span className="text-ink-faint">○</span>;
    case 'failure':
    case 'timed_out':
    case 'action_required':
      return <span className="text-del">✗</span>;
    case 'cancelled':
      return <span className="text-ink-faint">⊘</span>;
    default:
      return <span className="text-ink-faint">·</span>;
  }
}

function CheckDetail({ path, check }: { path: string; check: CheckRun }) {
  const [log, setLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLog = () => {
    if (check.job_id === null) return;
    setLoading(true);
    setError('');
    invoke<string>('github_check_log', { path, jobId: check.job_id })
      .then((result) => setLog(result))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  return (
    <div className="border-t border-line-soft px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-3">
        {check.job_id !== null && log === null && (
          <button
            type="button"
            onClick={loadLog}
            className="rounded border border-line px-2 py-0.5 text-[11px] text-ink-dim transition hover:border-guide hover:text-ink"
          >
            {loading ? 'Loading…' : 'View log'}
          </button>
        )}
        {check.job_id === null && <span className="text-[11px] text-ink-faint">No inline log for this check.</span>}
        {check.html_url && (
          <button
            type="button"
            onClick={() => openUrl(check.html_url).catch(() => null)}
            className="inline-flex items-center gap-1 text-[11px] text-ink-faint transition hover:text-ink"
          >
            <ExternalLinkIcon size={11} /> Open on GitHub
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-del">{error}</p>}
      {log !== null && (
        <pre className="scroll-thin max-h-64 overflow-auto whitespace-pre-wrap rounded bg-side px-2 py-1.5 font-mono text-[11px] leading-relaxed text-ink-dim">
          {log.slice(-20000)}
        </pre>
      )}
    </div>
  );
}

function CheckItem({ path, check }: { path: string; check: CheckRun }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-ink-dim transition-colors hover:bg-hover"
      >
        <span className="grid w-3 flex-none place-items-center text-ink-faint">
          <ChevronIcon size={10} className={open ? 'rotate-90' : ''} />
        </span>
        <span className="grid w-3.5 flex-none place-items-center">
          <StatusGlyph check={check} />
        </span>
        <span className="min-w-0 flex-1 truncate">{check.name}</span>
      </button>
      {open && <CheckDetail path={path} check={check} />}
    </div>
  );
}

export function ChecksList({ path, checks, loading, error, onRefresh }: ChecksListProps) {
  return (
    <div className="flex min-h-0 flex-col border-t border-line">
      <div className="flex flex-none items-center gap-2 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-ghost">Checks</span>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh checks"
          className="ml-auto text-[12px] text-ink-faint transition hover:text-ink"
        >
          ↻
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-1">
        {error && <p className="px-3 py-1.5 text-[11.5px] text-ink-faint">{error}</p>}
        {!error && loading && checks.length === 0 && (
          <p className="px-3 py-1.5 text-[11.5px] text-ink-faint">Loading…</p>
        )}
        {!error && !loading && checks.length === 0 && (
          <p className="px-3 py-1.5 text-[11.5px] text-ink-faint">No checks.</p>
        )}
        {checks.map((check) => (
          <CheckItem key={`${check.name}-${check.details_url}`} path={path} check={check} />
        ))}
      </div>
    </div>
  );
}
