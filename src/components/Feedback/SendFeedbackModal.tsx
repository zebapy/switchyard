import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useUiStore } from '../../stores/ui';
import { BugIcon, CloseIcon, SparkleIcon } from '../icons';

const inputClass =
  'w-full rounded-[9px] border border-line bg-app px-[11px] py-2 text-[13px] text-ink outline-none ' +
  'transition placeholder:text-ink-ghost focus:border-ember-edge focus:shadow-[0_0_0_3px_var(--color-ember-tint)]';

type Kind = 'bug' | 'feature';

// GitHub's default repo labels, so they always exist on zebapy/switchyard.
const KINDS: { value: Kind; label: string; ghLabel: string; Icon: typeof BugIcon }[] = [
  { value: 'bug', label: 'Bug', ghLabel: 'bug', Icon: BugIcon },
  { value: 'feature', label: 'Feature request', ghLabel: 'enhancement', Icon: SparkleIcon },
];

const kindBtnBase =
  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-[11px] py-1.5 text-[12.5px] font-medium transition-colors';

export function SendFeedbackModal() {
  const open = useUiStore((s) => s.feedbackOpen);
  const close = useUiStore((s) => s.closeFeedback);
  const openGithubConnect = useUiStore((s) => s.openGithubConnect);

  const [connected, setConnected] = useState(true);
  const [kind, setKind] = useState<Kind>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  // Reset and refresh connection status whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setKind('bug');
    setTitle('');
    setBody('');
    setError('');
    setIssueUrl(null);
    setSubmitting(false);
    invoke<boolean>('github_is_connected').then(setConnected).catch(() => setConnected(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // The shared connect modal broadcasts success here so the form unlocks.
  useEffect(() => {
    const unlisten = listen('github:connected', () => setConnected(true));
    return () => { unlisten.then((off) => off()); };
  }, []);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Add a title so we know what this is about.');
      return;
    }
    setSubmitting(true);
    setError('');
    const ghLabel = KINDS.find((k) => k.value === kind)!.ghLabel;
    const url = await invoke<string>('github_create_issue', {
      title: trimmed,
      body,
      labels: [ghLabel],
    }).catch((err: unknown) => {
      setError(String(err));
      return null;
    });
    setSubmitting(false);
    if (url) setIssueUrl(url);
  }

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center">
      <div className="absolute inset-0 bg-[rgba(6,7,9,0.62)] backdrop-blur-[3px] animate-fade" onClick={close} />
      <form
        onSubmit={submit}
        className="animate-pop relative z-[1] flex max-h-[calc(100vh-64px)] w-[min(540px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-start gap-3 border-b border-line px-[18px] pb-[14px] pt-[18px]">
          <div>
            <div className="text-base font-bold text-ink">Send feedback</div>
            <div className="mt-0.5 text-[13px] text-ink-faint">
              Files a GitHub issue in <b className="font-semibold text-ink-dim">zebapy/switchyard</b>
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

        {issueUrl ? (
          <div className="flex flex-col items-center gap-3 px-[18px] py-10 text-center">
            <p className="text-[13px] text-ink">Thanks — your feedback was filed.</p>
            <button
              type="button"
              onClick={() => openUrl(issueUrl).catch(() => null)}
              className="inline-flex items-center gap-2 rounded-[9px] border border-ember bg-ember-tint px-4 py-[9px] text-[13px] font-semibold text-ember transition hover:bg-ember hover:text-[#1a1206]"
            >
              View issue on GitHub
            </button>
          </div>
        ) : connected ? (
          <>
            <div className="flex flex-col gap-3.5 px-[18px] py-[15px]">
              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-dim">Type</span>
                <div className="flex gap-[6px]">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      aria-pressed={kind === k.value}
                      onClick={() => setKind(k.value)}
                      className={
                        `${kindBtnBase} ` +
                        (kind === k.value
                          ? 'border-ember-edge bg-ember-tint text-ember'
                          : 'border-line bg-app text-ink-dim hover:border-[#30343c] hover:text-ink')
                      }
                    >
                      <k.Icon size={13} />
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-dim">Title</span>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-ink-dim">Details</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit(e);
                  }}
                  rows={6}
                  placeholder="What happened, and what did you expect?"
                  className={`${inputClass} resize-none`}
                />
              </label>
              {error && <div className="text-xs text-del">{error}</div>}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line-soft px-[18px] py-[11px] text-[11.5px] text-ink-ghost">
              <span>
                <kbd className="rounded border border-line px-1 font-mono text-ink-dim">⌘↵</kbd> to send
                {' · '}
                <kbd className="rounded border border-line px-1 font-mono text-ink-dim">esc</kbd> to close
              </span>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-[9px] border border-ember bg-ember-tint px-3.5 py-[7px] text-[12.5px] font-semibold text-ember transition hover:bg-ember hover:text-[#1a1206] disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-[18px] py-10 text-center">
            <p className="text-[13px] text-ink-faint">Connect GitHub to send feedback.</p>
            <button
              type="button"
              onClick={openGithubConnect}
              className="inline-flex items-center gap-2 rounded-[9px] border border-ember bg-ember-tint px-4 py-[9px] text-[13px] font-semibold text-ember transition hover:bg-ember hover:text-[#1a1206]"
            >
              Connect GitHub
            </button>
            {error && <div className="text-xs text-del">{error}</div>}
          </div>
        )}
      </form>
    </div>
  );
}
