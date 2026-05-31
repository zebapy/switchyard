import { useUiStore } from '../stores/ui';
import { DashboardIcon, SearchIcon } from './icons';

/**
 * Full-width window header. Doubles as the macOS window drag region (the left
 * padding clears the Overlay-style traffic lights). Holds the brand on the
 * left and the Dashboard toggle + global search, centered.
 */
export function Header() {
  const mainView = useUiStore((s) => s.mainView);
  const showDashboard = useUiStore((s) => s.showDashboard);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);

  const isDashboard = mainView === 'dashboard';

  return (
    <header
      data-tauri-drag-region
      className="relative flex h-[44px] flex-none items-center border-b border-line bg-side pl-[78px] pr-3"
    >
      {/* Centered controls — absolutely centered to the window, independent of brand width. */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
        <button
          type="button"
          onClick={showDashboard}
          className={
            'flex items-center gap-2 rounded-lg px-3 py-[6px] text-[13px] font-semibold transition-colors ' +
            (isDashboard ? 'bg-ember-tint text-ink' : 'text-ink-dim hover:bg-hover hover:text-ink')
          }
        >
          <span className={`grid place-items-center ${isDashboard ? 'text-ember' : 'text-ink-faint'}`}>
            <DashboardIcon size={15} />
          </span>
          Dashboard
        </button>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex w-[260px] items-center gap-2 rounded-lg border border-line bg-app px-2.5 py-[6px] text-[13px] transition hover:border-ember-edge"
        >
          <SearchIcon size={14} className="shrink-0 text-ink-faint" />
          <span className="flex-1 text-left text-ink-ghost">Search…</span>
          <kbd className="rounded border border-line bg-side px-1.5 font-mono text-xs text-ink-faint">⌘K</kbd>
        </button>
      </div>
    </header>
  );
}
