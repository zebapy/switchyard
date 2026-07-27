import type { ReactNode } from 'react';
import { Command as Cmdk } from 'cmdk';

/** One row in a Zen menu. `active` shows a ✓; `danger` tints it destructive-red. */
export interface ZenMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  active?: boolean;
  onSelect: () => void;
}

/** Where the card hugs the screen edge, matching the button that opens it. */
type ZenMenuAnchor = 'top-right' | 'bottom-right' | 'bottom-left';

interface ZenMenuProps {
  /** Accessible name for the underlying combobox. */
  label: string;
  anchor: ZenMenuAnchor;
  items: ZenMenuItem[];
  onClose: () => void;
  /** Escape handler. Defaults to `onClose`; override to climb a nested menu instead of dismissing. */
  onEscape?: () => void;
  /** Card width in px. Defaults to 320. */
  width?: number;
  /** Text shown when the search matches nothing. */
  emptyText?: string;
}

const anchorClass: Record<ZenMenuAnchor, string> = {
  'top-right': 'items-start justify-end pt-[60px] pr-[18px]',
  'bottom-right': 'items-end justify-end pb-[58px] pr-[18px]',
  'bottom-left': 'items-end justify-start pb-[58px] pl-[18px]',
};

const kbdClass =
  'rounded-[5px] border border-line bg-app px-1.5 py-px font-mono text-[11px] leading-none text-ink-faint';

/**
 * The shared combobox behind every Zen overlay — ⌘K actions, ⇅ sort, ⌘O open-in,
 * and the "New…" menu. Each renders a scrim, an autofocused search that fuzzy-
 * narrows the list (cmdk owns the filtering + up/down/Enter keyboard nav), and a
 * list of selectable items. Callers supply the items and where the card anchors;
 * everything else — layout, styling, Escape-to-close — lives here.
 */
export function ZenMenu({
  label,
  anchor,
  items,
  onClose,
  onEscape,
  width = 320,
  emptyText = 'No matches',
}: ZenMenuProps) {
  const handleEscape = onEscape ?? onClose;
  // Footer menus grow upward, so the search sits at the bottom (nearest the
  // button that opened it); the toolbar's top-anchored menus keep it on top.
  const searchAtBottom = anchor !== 'top-right';
  const input = (
    <Cmdk.Input
      autoFocus
      placeholder="Search…"
      className={`w-full bg-transparent px-[18px] py-3 text-[14px] text-ink outline-none placeholder:text-ink-ghost ${
        searchAtBottom ? 'border-t' : 'border-b'
      } border-line`}
    />
  );
  return (
    <div
      className={`fixed inset-0 z-[200] flex ${anchorClass[anchor]}`}
      onClick={onClose}
    >
      <Cmdk
        label={label}
        loop
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); handleEscape(); } }}
        style={{ width }}
        className="flex max-h-[60vh] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        {!searchAtBottom && input}
        <Cmdk.List className="scroll-thin overflow-y-auto p-1.5">
          <Cmdk.Empty className="p-[18px] text-center text-[13px] text-ink-ghost">{emptyText}</Cmdk.Empty>
          {items.map((item) => (
            <Cmdk.Item
              key={item.id}
              value={item.label}
              onSelect={item.onSelect}
              className={`flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-[9px] text-[13px] data-[selected=true]:bg-signal-dim ${
                item.danger ? 'text-del' : 'text-ink'
              }`}
            >
              {item.icon && <span className="grid w-4 flex-none place-items-center text-ink-faint">{item.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && <kbd className={kbdClass}>{item.shortcut}</kbd>}
              {item.active && <span className="flex-none text-signal">✓</span>}
            </Cmdk.Item>
          ))}
        </Cmdk.List>
        {searchAtBottom && input}
      </Cmdk>
    </div>
  );
}
