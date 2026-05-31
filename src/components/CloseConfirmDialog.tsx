import type { TmuxSessionInfo } from '../types/tmux';

interface CloseConfirmDialogProps {
  isOpen: boolean;
  sessions: TmuxSessionInfo[];
  onCancel: () => void;
  onDetach: () => void;
  onKillAll: () => void;
}

export function CloseConfirmDialog({ isOpen, sessions, onCancel, onDetach, onKillAll }: CloseConfirmDialogProps) {
  if (!isOpen) return null;
  const count = sessions.length;
  const btn = 'rounded-[9px] border border-line bg-app px-3.5 py-[9px] text-[13px] font-semibold text-ink-dim transition hover:border-[#30343c] hover:text-ink';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(6,7,9,0.6)] backdrop-blur-[3px]"
      onClick={onCancel}
    >
      <div
        className="w-[460px] rounded-2xl border border-line bg-side p-6 shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1.5 text-base font-bold text-ink">Close window</h2>
        <p className="mb-3.5 text-[13px] text-ink-faint">
          {count} active tmux {count === 1 ? 'session' : 'sessions'} found. What to do?
        </p>

        {count > 0 && (
          <ul className="mb-4 max-h-40 list-none overflow-y-auto rounded-[9px] border border-line bg-app p-3 text-xs">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.name} className="flex items-center gap-2 py-0.5">
                <code className="font-mono text-ember">{s.name}</code>
                <span className="truncate font-mono text-ink-ghost">{s.path}</span>
              </li>
            ))}
            {count > 8 && <li className="italic text-ink-ghost">+{count - 8} more</li>}
          </ul>
        )}

        <div className="flex justify-end gap-[9px]">
          <button className={btn} onClick={onCancel}>Cancel</button>
          <button className={btn} onClick={onDetach}>Detach (keep sessions)</button>
          <button
            className="rounded-[9px] border border-line bg-app px-3.5 py-[9px] text-[13px] font-semibold text-ink-dim transition hover:border-[rgba(240,117,138,0.45)] hover:bg-[rgba(240,117,138,0.08)] hover:text-del"
            onClick={onKillAll}
          >
            Kill all sessions
          </button>
        </div>
      </div>
    </div>
  );
}
