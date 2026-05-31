import { useCallback, useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';
import { CloseIcon, GitBranchIcon, FolderPlusIcon } from '../icons';

const fieldInput =
  'rounded-[9px] border border-line bg-app px-[11px] py-[9px] font-mono text-[13px] text-ink outline-none transition focus:border-ember-edge focus:shadow-[0_0_0_3px_var(--color-ember-tint)]';

interface FieldErrors {
  url?: string;
  destination?: string;
  general?: string;
}

/** Derive the folder name a `git clone` would create from a remote URL. */
function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  const last = trimmed.split(/[/:]/).pop() ?? '';
  return last.replace(/\.git$/, '');
}

export function CloneRepoModal() {
  const isOpen = useUiStore((s) => s.cloneModalOpen);
  const closeModal = useUiStore((s) => s.closeCloneModal);
  const scanRoot = useProjectsStore((s) => s.scanRoot);
  const cloneRepo = useProjectsStore((s) => s.cloneRepo);

  const [url, setUrl] = useState('');
  const [destination, setDestination] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setUrl('');
    setDestination(scanRoot);
    setErrors({});
    setBusy(false);
  }, [isOpen, scanRoot]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closeModal]);

  const handlePickDestination = useCallback(async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: destination || scanRoot || undefined,
      title: 'Destination folder for clone',
    });
    if (typeof selected === 'string') setDestination(selected);
  }, [destination, scanRoot]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const next: FieldErrors = {};
      if (!url.trim()) next.url = 'Enter a repository URL.';
      if (!destination.trim()) next.destination = 'Choose a destination folder.';
      setErrors(next);
      if (Object.keys(next).length > 0) return;

      setBusy(true);
      const path = await cloneRepo(url.trim(), destination.trim()).catch((err: unknown) => {
        setErrors({ general: String(err) });
        return null;
      });
      setBusy(false);
      if (path) closeModal();
    },
    [url, destination, cloneRepo, closeModal],
  );

  if (!isOpen) return null;

  const derivedName = repoNameFromUrl(url);

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center">
      <div className="absolute inset-0 bg-[rgba(6,7,9,0.62)] backdrop-blur-[3px] animate-fade" onClick={closeModal} />
      <form
        onSubmit={handleSubmit}
        className="animate-pop relative z-[1] flex w-[min(520px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-start gap-3 border-b border-line px-[18px] pb-[14px] pt-[18px]">
          <div>
            <div className="text-base font-bold text-ink">Clone repository</div>
            <div className="mt-0.5 text-[13px] text-ink-faint">Clone a git repo and add it to your projects.</div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-[15px] px-[18px] pb-1 pt-[16px]">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-dim">
              <GitBranchIcon size={12} className="text-ink-faint" /> Repository URL
            </span>
            <input
              autoFocus
              className={fieldInput}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="git@github.com:owner/repo.git"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!errors.url}
            />
            {errors.url && <span className="text-xs text-del">{errors.url}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-dim">
              <FolderPlusIcon size={12} className="text-ink-faint" /> Destination folder
            </span>
            <div className="flex items-stretch gap-2">
              <input
                className={`${fieldInput} flex-1`}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="~/code"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.destination}
              />
              <button
                type="button"
                onClick={handlePickDestination}
                className="shrink-0 rounded-[9px] border border-line bg-app px-3 text-[13px] font-semibold text-ink-dim transition hover:border-[#30343c] hover:text-ink"
              >
                Choose…
              </button>
            </div>
            {errors.destination && <span className="text-xs text-del">{errors.destination}</span>}
          </label>

          <div className="min-h-[16px] text-xs text-ink-faint">
            {derivedName && destination.trim() && (
              <>
                Clones into{' '}
                <code className="rounded border border-line-soft bg-app px-1 font-mono text-ink-dim">
                  {destination.trim().replace(/\/+$/, '')}/{derivedName}
                </code>
              </>
            )}
          </div>
        </div>

        {errors.general && <div className="px-[18px] pt-1.5 text-xs text-del">{errors.general}</div>}

        <div className="flex justify-end gap-[9px] px-[18px] pb-[18px] pt-4">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-[9px] border border-line bg-app px-4 py-[9px] text-[13px] font-semibold text-ink-dim transition hover:border-[#30343c] hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-[9px] border border-ember bg-ember px-4 py-[9px] text-[13px] font-semibold text-[#1a1206] transition hover:border-ember-strong hover:bg-ember-strong disabled:opacity-50"
          >
            {busy ? 'Cloning…' : 'Clone repository'}
          </button>
        </div>
      </form>
    </div>
  );
}
