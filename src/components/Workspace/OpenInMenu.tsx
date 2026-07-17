import { Menu } from '@base-ui-components/react/menu';
import { ExternalLinkIcon, ChevronIcon } from '../icons';
import { OPEN_IN_TARGETS, openPathIn } from '../../lib/openIn';

interface OpenInMenuProps {
  /** Absolute folder path of the active workspace — opened in the chosen app. */
  path: string;
}

const popupClass =
  'z-[300] min-w-[190px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const itemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';
const iconClass = 'grid w-4 place-items-center text-ink-faint';

/** "Open in…" menu pinned to the top-right of the workspace header.
 *  Opens the active workspace folder in Finder or an external editor/terminal. */
export function OpenInMenu({ path }: OpenInMenuProps) {
  const openIn = (app?: string) => openPathIn(path, app);

  return (
    <Menu.Root>
      <Menu.Trigger
        title="Open workspace folder in…"
        aria-label="Open workspace folder in another app"
        className="flex flex-none items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-[13px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
      >
        <ExternalLinkIcon size={13} />
        <span>Open in…</span>
        <ChevronIcon size={10} className="rotate-90 text-ink-faint" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[300]" sideOffset={4} align="end">
          <Menu.Popup className={popupClass}>
            {OPEN_IN_TARGETS.map((target) => (
              <Menu.Item key={target.id} className={itemClass} onClick={() => openIn(target.app)}>
                <span className={iconClass}>{target.icon}</span>
                {target.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
