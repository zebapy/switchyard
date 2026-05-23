import type { TmuxSessionInfo } from '../types/tmux';

interface CloseConfirmDialogProps {
  isOpen: boolean;
  sessions: TmuxSessionInfo[];
  onCancel: () => void;
  onDetach: () => void;
  onKillAll: () => void;
}

export function CloseConfirmDialog({
  isOpen,
  sessions,
  onCancel,
  onDetach,
  onKillAll,
}: CloseConfirmDialogProps) {
  if (!isOpen) return null;

  const count = sessions.length;

  return (
    <div className="close-confirm-overlay" onClick={onCancel}>
      <div className="close-confirm-content" onClick={(e) => e.stopPropagation()}>
        <h2 className="close-confirm-title">Close window</h2>
        <p className="close-confirm-desc">
          {count} active tmux {count === 1 ? 'session' : 'sessions'} found. What to do?
        </p>

        {count > 0 && (
          <ul className="close-confirm-list">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.name}>
                <code>{s.name}</code>
                <span className="close-confirm-path">{s.path}</span>
              </li>
            ))}
            {count > 8 && <li className="close-confirm-more">+{count - 8} more</li>}
          </ul>
        )}

        <div className="close-confirm-actions">
          <button className="close-confirm-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="close-confirm-btn" onClick={onDetach}>
            Detach (keep sessions)
          </button>
          <button className="close-confirm-btn close-confirm-btn--danger" onClick={onKillAll}>
            Kill all sessions
          </button>
        </div>
      </div>
    </div>
  );
}
