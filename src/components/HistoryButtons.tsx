import { useNavigate } from 'react-router';
import { ArrowLeftIcon, ArrowRightIcon } from './icons';
import { useHistoryPosition } from '../hooks/useHistoryPosition';

const navButtonClass =
  'grid size-[26px] place-items-center rounded-md transition-colors ' +
  'text-ink-faint hover:bg-hover hover:text-ink ' +
  'disabled:pointer-events-none disabled:text-ink-ghost disabled:opacity-40';

/** Browser-style back/forward buttons driven by the router history position. */
export function HistoryButtons() {
  const navigate = useNavigate();
  const { canGoBack, canGoForward } = useHistoryPosition();

  return (
    <>
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
    </>
  );
}
