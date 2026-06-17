import { useClaudeUsage, type ClaudeUsage, type UsageWindow } from '../../lib/useClaudeUsage';

/** Whole-hour remaining until `resetsAt` (epoch seconds): "3h", "2d4h", "<1h". */
function formatResetsIn(resetsAt: number | null): string | null {
  if (resetsAt === null) return null;
  const seconds = resetsAt - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return 'now';
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (days > 0) return rem > 0 ? `${days}d${rem}h` : `${days}d`;
  if (hours > 0) return `${hours}h`;
  return '<1h';
}

/** Local clock time of a reset, e.g. "Sat 6:30 PM". */
function formatResetAt(resetsAt: number | null): string | null {
  if (resetsAt === null) return null;
  return new Date(resetsAt * 1000).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fillColor(pct: number): string {
  if (pct >= 90) return 'group-hover:text-del';
  if (pct >= 75) return 'group-hover:text-ember-strong';
  return 'group-hover:text-ember';
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

type UsageDonutProps = {
  label: string;
  window: UsageWindow;
};

const DONUT_RADIUS = 7;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function UsageDonut({ label, window }: UsageDonutProps) {
  const pct = clampPct(window.used_percentage);
  const dash = (pct / 100) * DONUT_CIRCUMFERENCE;

  return (
    <div className="flex items-center gap-1.5">
      <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
        <circle cx="9" cy="9" r={DONUT_RADIUS} fill="none" strokeWidth="3" className="stroke-line" />
        <circle
          cx="9"
          cy="9"
          r={DONUT_RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${DONUT_CIRCUMFERENCE}`}
          className={`stroke-current text-ink-ghost transition-[stroke-dasharray,color] ${fillColor(pct)}`}
        />
      </svg>
      <span className="text-[11px] leading-none text-ink-faint">{label}</span>
    </div>
  );
}

type TooltipRowProps = {
  label: string;
  window: UsageWindow;
};

function TooltipRow({ label, window }: TooltipRowProps) {
  const pct = clampPct(window.used_percentage);
  const resetsIn = formatResetsIn(window.resets_at);
  const resetAt = formatResetAt(window.resets_at);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-6">
        <span className="font-light text-ink-dim">{label}</span>
        <span className="tabular-nums font-normal text-ink">{pct}% used</span>
      </div>
      {resetsIn !== null && (
        <div className="text-[12px] font-light text-ink-faint">
          resets in {resetsIn}
          {resetAt !== null && ` · ${resetAt}`}
        </div>
      )}
    </div>
  );
}

type UsageTooltipProps = {
  usage: ClaudeUsage;
};

function UsageTooltip({ usage }: UsageTooltipProps) {
  return (
    <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden w-72 flex-col gap-2 rounded-lg border border-line bg-side2 p-3 text-[12px] leading-none shadow-lg group-hover:flex">
      <div className="text-[12px] font-medium uppercase tracking-wide text-ink-ghost">
        Claude usage
      </div>
      {usage.session !== null && <TooltipRow label="Session (5h)" window={usage.session} />}
      {usage.week !== null && <TooltipRow label="Week (7d)" window={usage.week} />}
    </div>
  );
}

export function UsageBars() {
  const usage = useClaudeUsage();
  if (usage === null) return null;
  if (usage.session === null && usage.week === null) return null;

  return (
    <div className="group relative flex items-center gap-3">
      <UsageTooltip usage={usage} />
      {usage.session !== null && <UsageDonut label="Session" window={usage.session} />}
      {usage.week !== null && <UsageDonut label="Week" window={usage.week} />}
    </div>
  );
}
