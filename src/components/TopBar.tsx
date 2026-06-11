import { HistoryButtons } from './HistoryButtons';

/**
 * Full-width window chrome shown only when the sidebar is collapsed — with no
 * sidebar to host them, this clears the Overlay-style traffic lights, provides
 * the macOS drag region, and keeps the back/forward buttons reachable.
 */
export function TopBar() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-9 flex-none items-center gap-0.5 border-b border-line bg-side pl-[78px] pr-3"
    >
      <HistoryButtons />
    </div>
  );
}
