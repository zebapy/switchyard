import { goToSettings } from '../../router';
import { GearIcon } from '../icons';
import { HelpMenu } from './HelpMenu';
import { SidebarAddMenu } from './SidebarAddMenu';
import { UsageBars } from './UsageBars';

export function Footer() {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line p-2">
      <div className="flex items-center gap-1">
        <SidebarAddMenu />
        <UsageBars />
      </div>
      <div className="flex items-center gap-1">
        <HelpMenu />
        <button
          onClick={() => goToSettings()}
          aria-label="Settings"
          className="flex items-center rounded-lg px-2.5 py-1.5 text-ink-dim transition hover:bg-hover hover:text-ink"
        >
          <GearIcon size={15} />
        </button>
      </div>
    </div>
  );
}
