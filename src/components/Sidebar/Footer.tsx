import { useUiStore } from '../../stores/ui';
import { GearIcon } from '../icons';

export function Footer() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  return (
    <div className="border-t border-line p-2">
      <button
        onClick={() => setSettingsOpen(true)}
        aria-label="Settings"
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-dim transition hover:bg-hover hover:text-ink"
      >
        <GearIcon size={15} />
        <span className="flex-1 truncate">Settings</span>
      </button>
    </div>
  );
}
