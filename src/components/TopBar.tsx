import { useNavigate } from 'react-router';
import { ArrowLeftIcon, ArrowRightIcon } from './icons';
import { useHistoryPosition } from '../hooks/useHistoryPosition';

const navButtonClass =
  'grid size-[26px] place-items-center rounded-md transition-colors ' +
  'text-ink-faint hover:bg-hover hover:text-ink ' +
  'disabled:pointer-events-none disabled:text-ink-ghost disabled:opacity-40';

/**
 * Full-width window chrome across the top. Doubles as the macOS drag region and
 * clears the Overlay-style traffic lights via the left padding (so the sidebar
 * and tab strip no longer need to). Houses browser-style back/forward buttons.
 */
export function TopBar() {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryPosition();

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 flex-none items-center gap-0.5 border-b border-line bg-side pl-[78px] pr-3"
    >
      <button
        type="button"
        onClick={() => navigate(-1)}
        disabled={!canGoBack}
        aria-label="Back"
        title="Back"
        className={navButtonClass}
      >
        <ArrowLeftIcon size={16} />
      </button>
      <button
        type="button"
        onClick={() => navigate(1)}
        disabled={!canGoForward}
        aria-label="Forward"
        title="Forward"
        className={navButtonClass}
      >
        <ArrowRightIcon size={16} />
      </button>
    </div>
  );
}
