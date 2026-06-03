import { useProjectsStore } from '../stores/projects';
import { Switch } from './Switch';

const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';

export function TerminalSettings() {
  const useTmux = useProjectsStore((s) => s.useTmux);
  const setUseTmux = useProjectsStore((s) => s.setUseTmux);

  return (
    <div>
      <h3 className={h3Class}>Terminal</h3>
      <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
        <span className="flex-1">Use tmux for session persistence</span>
        <Switch checked={useTmux} onCheckedChange={setUseTmux} ariaLabel="Use tmux for session persistence" />
      </label>
      <p className={descClass}>Keeps terminal panes alive across app restarts when tmux is available.</p>
    </div>
  );
}
