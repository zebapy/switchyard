import type { ReactNode } from 'react';
import { Command as Cmdk } from 'cmdk';
import type { GhItem } from '../types/project';

interface ZenSourceListProps {
  /** Uppercase header label, e.g. "Linear issues". */
  title: string;
  icon: ReactNode;
  providerName: string;
  connected: boolean;
  loading: boolean;
  /** Non-empty message shown in place of the list (fetch failure). */
  error: string;
  /** True while a worktree is being created from the chosen item. */
  busy: boolean;
  connecting: boolean;
  items: GhItem[];
  /** Climb back to the root "New…" menu (also bound to Escape). */
  onBack: () => void;
  /** Dismiss the whole flow (backdrop click). */
  onClose: () => void;
  onConnect: () => void;
  onSelect: (item: GhItem) => void;
}

/**
 * The full-size list a Linear/GitHub source expands into — a wide, centered card
 * of rich two-line rows (identifier + title, then branch + sub-detail) so you can
 * eyeball an issue/PR before creating its worktree. cmdk owns search + ↑↓/Enter;
 * Escape climbs back to the compact "New…" menu rather than dismissing.
 */
export function ZenSourceList({
  title, icon, providerName, connected, loading, error, busy, connecting, items,
  onBack, onClose, onConnect, onSelect,
}: ZenSourceListProps) {
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-[rgba(6,7,9,0.2)] p-6 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <Cmdk
        label={title}
        loop
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onBack(); } }}
        className="flex max-h-[70vh] w-[min(620px,100%)] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="grid size-6 place-items-center rounded-md text-ink-faint transition hover:bg-hover hover:text-ink"
          >
            ←
          </button>
          <span className="grid place-items-center text-ink-faint">{icon}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-ghost">{title}</span>
          {busy && <span className="ml-auto text-[12px] text-ink-ghost">Creating worktree…</span>}
        </div>

        {connected ? (
          <>
            <Cmdk.Input
              autoFocus
              placeholder="Search…"
              className="w-full border-b border-line bg-transparent px-[18px] py-3 text-[14px] text-ink outline-none placeholder:text-ink-ghost"
            />
            <Cmdk.List className="scroll-thin min-h-[160px] overflow-y-auto p-1.5">
              {loading ? (
                <div className="p-8 text-center text-[13px] text-ink-ghost">Loading…</div>
              ) : (
                <>
                  <Cmdk.Empty className="p-8 text-center text-[13px] text-ink-ghost">
                    {error || 'No matches'}
                  </Cmdk.Empty>
                  {items.map((item) => (
                    <Cmdk.Item
                      key={`${item.id}-${item.branch}`}
                      value={`${item.id} ${item.title} ${item.branch}`}
                      disabled={busy}
                      onSelect={() => onSelect(item)}
                      className="group flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-2.5 data-[selected=true]:bg-signal-dim"
                    >
                      <span className="grid size-4 flex-none place-items-center text-ink-faint">{icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          {item.id && <span className="flex-none font-mono text-xs text-ink-dim">{item.id}</span>}
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.title}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-ghost">
                          {item.branch && <span className="min-w-0 truncate font-mono">{item.branch}</span>}
                          {item.sub && <span className="flex-none">· {item.sub}</span>}
                        </div>
                      </div>
                      <span className="flex-none text-ink-dim opacity-0 transition group-data-[selected=true]:opacity-100">→</span>
                    </Cmdk.Item>
                  ))}
                </>
              )}
            </Cmdk.List>
            {error && items.length > 0 && <div className="px-[18px] pb-2 text-xs text-del">{error}</div>}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-[18px] py-12 text-center">
            <p className="text-[13px] text-ink-faint">{providerName} not connected.</p>
            <button
              type="button"
              disabled={connecting}
              onClick={onConnect}
              className="inline-flex items-center gap-2 rounded-[9px] border border-ember bg-ember-tint px-4 py-[9px] text-[13px] font-semibold text-ember transition hover:bg-ember hover:text-[#1a1206] disabled:opacity-50"
            >
              {connecting ? 'Connecting…' : `Connect ${providerName}`}
            </button>
          </div>
        )}
      </Cmdk>
    </div>
  );
}
