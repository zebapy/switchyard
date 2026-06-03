import { useUiStore } from '../../stores/ui';
import { GearIcon } from '../icons';
import { HelpMenu } from './HelpMenu';

export function Footer() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  return (
    <div className="flex items-center gap-1 border-t border-line p-2">
      <HelpMenu />
      <button
        onClick={() => setSettingsOpen(true)}
        aria-label="Settings"
        className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-dim transition hover:bg-hover hover:text-ink"
      >
        <GearIcon size={15} />
        <span className="flex-1 truncate">Settings</span>
      </button>
    </div>
  );
}
