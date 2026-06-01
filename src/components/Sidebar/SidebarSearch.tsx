import { useUiStore } from '../../stores/ui';
import { SearchIcon } from '../icons';

/**
 * Search trigger pinned to the top of the left sidebar. The wrapper doubles as
 * the macOS window drag region; its top padding clears the Overlay-style
 * traffic lights (there is no full-width header anymore).
 */
export function SidebarSearch() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);

  return (
    <div data-tauri-drag-region className="flex-none px-3 pb-2 pt-9">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-app px-2.5 py-[6px] text-[13px] transition hover:border-ember-edge"
      >
        <SearchIcon size={14} className="shrink-0 text-ink-faint" />
        <span className="flex-1 text-left text-ink-ghost">Search…</span>
        <kbd className="rounded border border-line bg-side px-1.5 font-mono text-xs text-ink-faint">⌘K</kbd>
      </button>
    </div>
  );
}
