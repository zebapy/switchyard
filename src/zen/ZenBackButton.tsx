import { useZenStore } from './zenStore';
import { ZenKeyCaps, actionClass, clusterClass } from './ZenActionsCluster';

/**
 * The toolbar's top-left back control, sitting just right of the macOS traffic
 * lights. It mirrors the escape keys: in Focus mode it leaves the pane (`^←`),
 * otherwise it climbs one tier (`←`). Its label names where it lands (the parent
 * worktree, project, or "Projects" root). Hidden at the Projects root, where
 * there's nowhere left to go back to — `destination` is null there.
 */
export function ZenBackButton({ destination }: { destination: string | null }) {
  const focusedPaneId = useZenStore((s) => s.focusedPaneId);

  const focused = focusedPaneId !== null;
  if (!destination) return null;

  const hotkey = focused ? '^←' : '←';
  const label = `Back to ${destination}`;

  const onClick = () => {
    const st = useZenStore.getState();
    if (st.focusedPaneId) st.escapeFocus();
    else st.back();
  };

  return (
    <div className={clusterClass}>
      <button
        type="button"
        onClick={onClick}
        title={`${label} (${hotkey})`}
        aria-label={label}
        className={`${actionClass} text-ink-dim hover:text-ink`}
      >
        <ZenKeyCaps keys={hotkey} />
        <span className="truncate">{destination}</span>
      </button>
    </div>
  );
}
