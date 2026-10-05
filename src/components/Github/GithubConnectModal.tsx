import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useUiStore } from '../../stores/ui';
import { CloseIcon } from '../icons';
import type { GithubAuthStatus } from '../../types/project';

interface DeviceCode {
  user_code: string;
  verification_uri: string;
}

const btnClass =
  'rounded-[9px] border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition ' +
  'hover:border-guide hover:bg-hover hover:text-ink disabled:opacity-50';

/**
 * The single GitHub connect surface. Settings, "Send feedback" and the worktree
 * picker all open this via `openGithubConnect()` instead of calling
 * `github_login` blind — so the user always sees the code to enter on
 * github.com. Success is broadcast to every consumer through the backend's
 * `github:connected` event, so this modal needs no per-caller callback.
 *
 * Which panel it shows follows the configured credential source: signing in
 * here would be the wrong fix while the app is set to use the `gh` CLI, so that
 * mode gets the `gh auth login` remedy instead.
 */
export function GithubConnectModal() {
  const open = useUiStore((s) => s.githubConnectOpen);
  const close = useUiStore((s) => s.closeGithubConnect);

  const [status, setStatus] = useState<GithubAuthStatus | null>(null);

  useEffect(() => {
    if (!open) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    invoke<GithubAuthStatus>('github_auth_status')
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const usesGhCli = status?.source === 'gh-cli';

  return (
    <div className="fixed inset-0 z-[260] grid place-items-center">
      <div className="absolute inset-0 bg-[rgba(6,7,9,0.62)] backdrop-blur-[3px] animate-fade" onClick={close} />
      <div className="animate-pop relative z-[1] flex w-[min(420px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]">
        <div className="flex items-start gap-3 border-b border-line px-[18px] pb-[14px] pt-[18px]">
          <div>
            <div className="text-base font-bold text-ink">Connect GitHub</div>
            <div className="mt-0.5 text-[13px] text-ink-faint">
              {usesGhCli ? 'Switchyard is set to use your local GitHub CLI.' : 'Sign in with the device code below.'}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="px-[18px] py-[18px]">
          {!status ? (
            <p className="text-center text-[13px] text-ink-faint">Checking GitHub credentials…</p>
          ) : usesGhCli ? (
            <GhCliPanel status={status} onStatus={setStatus} onClose={close} />
          ) : (
            <DeviceFlowPanel onClose={close} />
          )}
        </div>
      </div>
    </div>
  );
}

interface GhCliPanelProps {
  status: GithubAuthStatus;
  onStatus: (status: GithubAuthStatus) => void;
  onClose: () => void;
}

/** What to do when the `gh` CLI is the configured source: fix `gh`, or switch
 *  the app over to its own sign-in. */
function GhCliPanel({ status, onStatus, onClose }: GhCliPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const recheck = useCallback(async () => {
    setBusy(true);
    setError('');
    const next = await invoke<GithubAuthStatus>('github_recheck').catch((e: unknown) => {
      setError(String(e));
      return null;
    });
    setBusy(false);
    if (next) onStatus(next);
  }, [onStatus]);

  const useAppSignIn = useCallback(async () => {
    setBusy(true);
    setError('');
    const next = await invoke<GithubAuthStatus>('set_github_auth_source', { source: 'app' }).catch((e: unknown) => {
      setError(String(e));
      return null;
    });
    setBusy(false);
    if (next) onStatus(next);
  }, [onStatus]);

  // `gh` already works — whatever opened this modal can carry on.
  useEffect(() => {
    if (status.gh_error) return;
    const timer = setTimeout(onClose, 1000);
    return () => clearTimeout(timer);
  }, [status.gh_error, onClose]);

  if (!status.gh_error) {
    return (
      <p className="text-center text-[13px] text-ink">
        Connected through the GitHub CLI
        {status.gh_account ? <> as @{status.gh_account}</> : null}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-faint">{status.gh_error}</p>
      {error ? <p className="text-[13px] text-del">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={btnClass} onClick={recheck} disabled={busy}>
          Recheck
        </button>
        <button type="button" className={btnClass} onClick={useAppSignIn} disabled={busy}>
          Use app sign-in instead
        </button>
      </div>
    </div>
  );
}

/** OAuth device flow: the backend opens github.com and polls until authorized. */
function DeviceFlowPanel({ onClose }: { onClose: () => void }) {
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // The backend emits the code the user types on github.com during device flow.
  useEffect(() => {
    const unlisten = listen<DeviceCode>('github:device_code', (e) => setDeviceCode(e.payload));
    return () => {
      unlisten.then((off) => off());
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    invoke<string>('github_login')
      .then(() => {
        if (!cancelled) setDone(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close shortly after success so the surface that opened us can resume.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(onClose, 1000);
    return () => clearTimeout(timer);
  }, [done, onClose]);

  function copy() {
    if (!deviceCode) return;
    navigator.clipboard.writeText(deviceCode.user_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (done) return <p className="text-center text-[13px] text-ink">Connected. You're all set.</p>;
  if (error) return <p className="text-[13px] text-del">{error}</p>;
  if (!deviceCode) return <p className="text-center text-[13px] text-ink-faint">Starting sign-in…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-faint">
        Opened github.com in your browser. Enter this code to finish signing in:
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border border-line-soft bg-app px-3 py-2 text-center font-mono text-[18px] tracking-[0.22em] text-ink">
          {deviceCode.user_code}
        </code>
        <button type="button" className={btnClass} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button
        type="button"
        className={`${btnClass} self-start`}
        onClick={() => openUrl(deviceCode.verification_uri).catch(() => null)}
      >
        Reopen github.com
      </button>
    </div>
  );
}
