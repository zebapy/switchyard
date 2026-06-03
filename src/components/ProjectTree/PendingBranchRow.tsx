import { WorktreeIcon } from '../icons';

interface PendingBranchRowProps {
  /** Friendly name of the worktree being created. */
  label: string;
}

/** Optimistic placeholder shown in the project tree while a quick worktree is
 *  being created on disk. Non-interactive — a real BranchRow replaces it once
 *  git info refreshes. Mirrors BranchRow's layout so it doesn't shift the list. */
export function PendingBranchRow({ label }: PendingBranchRowProps) {
  return (
    <div
      className="flex w-full animate-pulse items-center gap-[7px] rounded-lg px-2 py-1.5"
      title={`Creating worktree ${label}…`}
    >
      <span className="grid place-items-center" aria-hidden>
        <span className="size-3 animate-spin rounded-full border-2 border-ember-edge border-t-ember" />
      </span>
      <span className="grid place-items-center text-ink-faint">
        <WorktreeIcon size={14} />
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium tracking-[-0.2px] text-ink-faint">
        {label}
      </span>
      <span className="shrink-0 text-[11px] text-ink-ghost">Creating…</span>
    </div>
  );
}
