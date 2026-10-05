import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useUiStore } from '../stores/ui';
import type { GithubAuthSource, GithubAuthStatus } from '../types/project';

const h3Class = 'mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-ghost';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const btnClass =
  'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-guide hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';

interface AuthSourceOptionProps {
  source: GithubAuthSource;
  label: string;
  summary: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (source: GithubAuthSource) => void;
  children: React.ReactNode;
}

/** One credential source: the radio, its one-line state, and — when it's the
 *  chosen one — the block that acts on it. */
function AuthSourceOption({ source, label, summary, selected, disabled, onSelect, children }: AuthSourceOptionProps) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="radio"
          name="github-auth-source"
          value={source}
          checked={selected}
          disabled={disabled}
          onChange={() => onSelect(source)}
          className="accent-signal"
        />
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="ml-auto text-xs text-ink-dim">{summary}</span>
      </label>
      {selected ? <div className="mt-2.5 pl-[26px]">{children}</div> : null}
    </div>
  );
}

function ghSummary(status: GithubAuthStatus): string {
  if (!status.gh_version) return 'not installed';
  if (status.gh_account) return `gh ${status.gh_version} · @${status.gh_account}`;
  return `gh ${status.gh_version} · not signed in`;
}

function appSummary(status: GithubAuthStatus): string {
  if (status.app_account) return `@${status.app_account}`;
  return status.app_signed_in ? 'signed in' : 'not signed in';
}

export function GithubSettings() {
  const openGithubConnect = useUiStore((s) => s.openGithubConnect);
  const [status, setStatus] = useState<GithubAuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const next = await invoke<GithubAuthStatus>('github_auth_status').catch(() => null);
    if (next) setStatus(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A successful sign-in — here, in the connect modal, or from a source switch
  // — is broadcast on this event.
  useEffect(() => {
    const unlisten = listen('github:connected', () => void refresh());
    return () => {
      unlisten.then((off) => off());
    };
  }, [refresh]);

  const chooseSource = useCallback(
    async (source: GithubAuthSource) => {
      setBusy(true);
      setError('');
      const next = await invoke<GithubAuthStatus>('set_github_auth_source', { source }).catch((e: unknown) => {
        setError(String(e));
        return null;
      });
      setBusy(false);
      if (next) setStatus(next);
    },
    [],
  );

  // Drops the cached token first, so a `gh auth login` run in a terminal a
  // moment ago is picked up rather than the stale failure being re-reported.
  const handleRecheck = useCallback(async () => {
    setBusy(true);
    setError('');
    const next = await invoke<GithubAuthStatus>('github_recheck').catch((e: unknown) => {
      setError(String(e));
      return null;
    });
    setBusy(false);
    if (next) setStatus(next);
  }, []);

  const handleDisconnect = useCallback(async () => {
    setBusy(true);
    await invoke('github_logout').catch((e: unknown) => setError(String(e)));
    await refresh();
    setBusy(false);
  }, [refresh]);

  if (!status) {
    return (
      <div>
        <h3 className={h3Class}>GitHub</h3>
        <p className={descClass}>Checking GitHub credentials…</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className={h3Class}>GitHub</h3>
      <p className={descClass}>
        Where GitHub credentials come from. Used to list issues, branches and PRs, show PR status, and send feedback.
      </p>

      <div className="flex flex-col gap-2">
        <AuthSourceOption
          source="gh-cli"
          label="GitHub CLI (gh)"
          summary={ghSummary(status)}
          selected={status.source === 'gh-cli'}
          disabled={busy}
          onSelect={chooseSource}
        >
          {status.gh_error ? (
            <p className="mb-2.5 text-xs text-del">{status.gh_error}</p>
          ) : (
            <p className={descClass}>
              Using the token from <code className="font-mono text-ink-dim">gh auth token</code>
              {status.gh_account ? (
                <>
                  {' '}
                  (<b className="font-semibold text-ink-dim">@{status.gh_account}</b>)
                </>
              ) : null}
              .
            </p>
          )}
          <button className={btnClass} onClick={handleRecheck} disabled={busy}>
            Recheck
          </button>
        </AuthSourceOption>

        <AuthSourceOption
          source="app"
          label="App sign-in"
          summary={appSummary(status)}
          selected={status.source === 'app'}
          disabled={busy}
          onSelect={chooseSource}
        >
          {status.app_signed_in ? (
            <>
              <p className={descClass}>
                Signed in to Switchyard
                {status.app_account ? (
                  <>
                    {' '}
                    as <b className="font-semibold text-ink-dim">@{status.app_account}</b>
                  </>
                ) : null}
                .
              </p>
              <button className={btnClass} onClick={handleDisconnect} disabled={busy}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className={descClass}>Sign in with a device code — no <code className="font-mono text-ink-dim">gh</code> install needed.</p>
              <button className={btnClass} onClick={openGithubConnect} disabled={busy}>
                Sign in to GitHub
              </button>
            </>
          )}
        </AuthSourceOption>
      </div>

      {error ? <p className="mt-2.5 text-xs text-del">{error}</p> : null}
    </div>
  );
}
