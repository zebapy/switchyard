import { useEffect } from 'react';
import { ArchiveIcon } from '../icons';

interface ArchiveConfirmDialogProps {
  isOpen: boolean;
  /** Worktree branch name, shown in the prompt. */
  branchName: string;
  /** Uncommitted lines (added + deleted) that archiving would discard. */
  dirtyLines: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation modal shown before archiving a worktree. Archiving removes the
 *  working directory but keeps the branch and its commits, so the discard
 *  warning is only surfaced when there is uncommitted work. */
export function ArchiveConfirmDialog({
  isOpen,
  branchName,
  dirtyLines,
  onCancel,
  onConfirm,
}: ArchiveConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const cancelBtn =
    'rounded-[9px] border border-line bg-app px-3.5 py-[9px] text-[13px] font-semibold text-ink-dim transition hover:border-[#30343c] hover:text-ink';
  const archiveBtn =
    'rounded-[9px] border border-line bg-app px-3.5 py-[9px] text-[13px] font-semibold text-ink-dim transition hover:border-[rgba(240,117,138,0.45)] hover:bg-[rgba(240,117,138,0.08)] hover:text-del';

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-[rgba(6,7,9,0.6)] backdrop-blur-[3px] animate-fade" />
      <div
        className="animate-pop relative z-[1] w-[440px] rounded-2xl border border-line bg-side p-6 shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span className="grid place-items-center text-ink-faint">
            <ArchiveIcon size={16} />
          </span>
          <h2 className="text-base font-bold text-ink">
            Archive worktree <span className="font-mono text-ember">{branchName}</span>?
          </h2>
        </div>
        <p className="mb-3.5 text-[13px] leading-relaxed text-ink-faint">
          This removes its working directory. The branch and its commits stay in the repo.
        </p>

        {dirtyLines > 0 && (
          <div className="mb-4 rounded-[9px] border border-[rgba(240,117,138,0.3)] bg-[rgba(240,117,138,0.08)] px-3 py-2.5 text-[12.5px] text-del">
            {dirtyLines} uncommitted line{dirtyLines === 1 ? '' : 's'} will be discarded.
          </div>
        )}

        <div className="flex justify-end gap-[9px]">
          <button autoFocus className={cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={archiveBtn} onClick={onConfirm}>
            Archive worktree
          </button>
        </div>
      </div>
    </div>
  );
}
