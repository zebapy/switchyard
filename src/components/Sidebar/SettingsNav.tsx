import { useUiStore } from '../../stores/ui';
import { ChevronIcon } from '../icons';
import { SETTINGS_SECTIONS } from '../settingsSections';

const navItemClass = 'block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition';

export function SettingsNav() {
  const settingsSection = useUiStore((s) => s.settingsSection);
  const setSettingsSection = useUiStore((s) => s.setSettingsSection);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const goToSection = (id: string) => {
    setSettingsSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-line-soft px-3 pb-3 pt-3">
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-[7px] text-[13px] font-semibold text-ink-dim transition-colors hover:bg-hover hover:text-ink"
        >
          <span className="grid place-items-center text-ink-faint">
            <ChevronIcon size={13} className="rotate-180" />
          </span>
          Back
        </button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-3 pt-2">
        <div className="px-2.5 pb-1 pt-1.5">
          <span className="text-sm font-semibold text-white">Settings</span>
        </div>
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => goToSection(section.id)}
            className={`${navItemClass} ${
              settingsSection === section.id
                ? 'bg-ember-tint text-ink'
                : 'text-ink-dim hover:bg-hover hover:text-ink'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
}
