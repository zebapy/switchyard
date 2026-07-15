import { useUiStore } from '../stores/ui';
import { useWorkspaceStore } from '../stores/workspace';
import { Switch } from './Switch';

const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';

export function ZenModeSettings() {
  const zenMode = useUiStore((s) => s.zenMode);
  const setZenMode = useUiStore((s) => s.setZenMode);

  const onToggle = (next: boolean) => {
    if (next) void useWorkspaceStore.getState().saveSession();
    setZenMode(next);
  };

  return (
    <div>
      <h3 className={h3Class}>Zen Mode</h3>
      <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
        <span className="flex-1">Zen Mode</span>
        <Switch checked={zenMode} onCheckedChange={onToggle} ariaLabel="Zen Mode" />
      </label>
      <p className={descClass}>
        A single-focus layout that drills one tier at a time — projects, then a repo's worktrees,
        then panes. Also toggleable from the ⌘K command palette. Persists across restarts.
      </p>
    </div>
  );
}
