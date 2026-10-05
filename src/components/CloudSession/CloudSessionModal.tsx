import { useEffect, useState } from 'react';
import { useUiStore } from '../../stores/ui';
import { startCloudSession } from '../../lib/cloudSessions';
import { CloseIcon } from '../icons';

const fieldInput =
  'min-h-[96px] resize-y rounded-[9px] border border-line bg-app px-[11px] py-[9px] text-[13px] text-ink outline-none transition focus:border-ember-edge focus:shadow-[0_0_0_3px_var(--color-ember-tint)]';

/** Prompt for a task, then run `claude --cloud` for the chosen project. */
export function CloudSessionModal() {
  const { open, projectPath, projectName } = useUiStore((s) => s.cloudSessionModal);
  const closeModal = useUiStore((s) => s.closeCloudSessionModal);
  const [task, setTask] = useState('');

  useEffect(() => {
    if (open) setTask('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeModal]);

  if (!open || !projectPath || !projectName) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startCloudSession({ projectPath, projectName, task: task.trim() });
    closeModal();
  };

  // Enter submits; Shift+Enter inserts a newline.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center">
      <div className="absolute inset-0 bg-[rgba(6,7,9,0.62)] backdrop-blur-[3px] animate-fade" onClick={closeModal} />
      <form
        onSubmit={handleSubmit}
        className="animate-pop relative z-[1] flex w-[min(520px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-start gap-3 border-b border-line px-[18px] pb-[14px] pt-[18px]">
          <div>
            <div className="text-base font-bold text-ink">New cloud session</div>
            <div className="mt-0.5 text-[13px] text-ink-dim">
              Runs on claude.ai against {projectName}'s GitHub remote at the current branch. Push local commits first.
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-ink-dim hover:bg-hover hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <label className="flex flex-col gap-1.5 px-[18px] pt-[16px]">
          <span className="text-xs font-semibold text-ink-dim">Task</span>
          <textarea
            autoFocus
            required
            className={fieldInput}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Fix the flaky test in auth.spec.ts"
            spellCheck={false}
          />
        </label>

        <div className="flex justify-end gap-[9px] px-[18px] pb-[18px] pt-4">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-[9px] border border-line bg-app px-4 py-[9px] text-[13px] font-semibold text-ink-dim transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-[9px] border border-ember bg-ember px-4 py-[9px] text-[13px] font-semibold text-[#1a1206] transition hover:border-ember-strong hover:bg-ember-strong"
          >
            Start cloud session
          </button>
        </div>
      </form>
    </div>
  );
}
