export interface ClusterAction {
  /** The shortcut, e.g. '⌘K' or '^←' — split into one outlined box per key. */
  keys: string;
  /** Plain-text label shown beside the keys. */
  label: string;
  onClick: () => void;
  danger?: boolean;
  title?: string;
}

export const clusterClass =
  'flex items-center gap-1 rounded-[9px] border border-line bg-hover px-1.5 py-[3px]';
export const actionClass =
  'group flex items-center gap-[7px] rounded-md px-[7px] py-[3px] font-mono text-[11px] transition hover:bg-active';
const keysClass = 'flex items-center gap-[3px]';
const keyClass =
  'inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-[4px] border border-line bg-app px-1 font-mono text-[11px] leading-none text-ink-faint transition group-hover:border-[rgba(64,224,192,0.42)] group-hover:bg-signal-dim group-hover:text-signal';

/** A shortcut drawn as one outlined box per key, glowing teal when its parent
 *  `.group` (an action button) is hovered. */
export function ZenKeyCaps({ keys }: { keys: string }) {
  if (!keys) return null;
  return (
    <span className={keysClass}>
      {[...keys].map((key, i) => (
        <span key={i} className={keyClass}>{key}</span>
      ))}
    </span>
  );
}

/**
 * The bottom-right / top-right actions in Zen, drawn as one framed cluster: each
 * action is a plain-text label whose shortcut sits in per-key outlined boxes that
 * light up teal on hover. Replaces the old row of individually-bordered buttons.
 */
export function ZenActionsCluster({ actions }: { actions: ClusterAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className={clusterClass}>
      {actions.map((action) => (
        <button
          key={action.keys + action.label}
          type="button"
          onClick={action.onClick}
          title={action.title}
          className={`${actionClass} ${action.danger ? 'text-del hover:text-del' : 'text-ink-dim hover:text-ink'}`}
        >
          <ZenKeyCaps keys={action.keys} />
          {action.label}
        </button>
      ))}
    </div>
  );
}
