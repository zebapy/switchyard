import { HistoryButtons } from '../HistoryButtons';

/**
 * Top row of the left sidebar. Right-aligned back/forward buttons sit here so
 * the sidebar/main divider runs to the very top of the window; the empty left
 * half clears the Overlay-style traffic lights and doubles as the drag region.
 */
export function SidebarNav() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-9 flex-none items-center justify-end gap-0.5 px-2"
    >
      <HistoryButtons />
    </div>
  );
}
