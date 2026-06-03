import { useProjectsStore } from '../stores/projects';
import { Switch } from './Switch';

const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';

export function NotificationsSettings() {
  const desktopNotifications = useProjectsStore((s) => s.desktopNotifications);
  const setDesktopNotifications = useProjectsStore((s) => s.setDesktopNotifications);

  return (
    <div>
      <h3 className={h3Class}>Notifications</h3>
      <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-ink">
        <span className="flex-1">Desktop notifications</span>
        <Switch checked={desktopNotifications} onCheckedChange={setDesktopNotifications} ariaLabel="Desktop notifications" />
      </label>
      <p className={descClass}>Notify when an agent needs input or finishes a turn.</p>
    </div>
  );
}
