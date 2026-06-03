import { Menu } from '@base-ui-components/react/menu';
import { useUiStore } from '../../stores/ui';
import { HelpIcon, IssueIcon } from '../icons';

const popupClass =
  'z-[300] min-w-[200px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const itemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';
const iconClass = 'grid w-4 place-items-center text-ink-faint';

export function HelpMenu() {
  const openFeedback = useUiStore((s) => s.openFeedback);
  const toggleHelp = useUiStore((s) => s.toggleHelp);

  return (
    <Menu.Root>
      <Menu.Trigger
        title="Help"
        aria-label="Help"
        className="grid size-[30px] flex-none place-items-center rounded-lg text-ink-dim transition-colors hover:bg-hover hover:text-ink data-[popup-open]:bg-hover data-[popup-open]:text-ink"
      >
        <HelpIcon size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[300]" sideOffset={6} align="start" side="top">
          <Menu.Popup className={popupClass}>
            <Menu.Item className={itemClass} onClick={openFeedback}>
              <span className={iconClass}><IssueIcon size={14} /></span>
              Send feedback
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={toggleHelp}>
              <span className={iconClass}><HelpIcon size={14} /></span>
              Keyboard shortcuts
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
