import { openUrl } from '@tauri-apps/plugin-opener';
import type { PrInfo } from '../../types/project';
import type { FileStatus } from '../../types/gitpanel';
import { GitBranchIcon, PrIcon, CheckIcon } from '../icons';
import { openCreatePrChat } from './createPr';

interface PanelHeaderProps {
  path: string | null;
  branch: string | null;
  defaultBranch: string | null;
  prInfo: PrInfo | null;
  /** Files changed vs the base branch — fed into the Create-PR prompt. */
  baseFiles: FileStatus[];
  refreshing: boolean;
  onRefresh: () => void;
}

/** Colour for a PR badge by state. */
function prStateClass(state: string): string {
  const upper = state.toUpperCase();
  if (upper === 'MERGED') return 'text-[#b18cff] border-[#b18cff]/40 bg-[#b18cff]/10';
  if (upper === 'CLOSED') return 'text-del border-del/40 bg-del/10';
  return 'text-green border-green/40 bg-green/10';
}

function CiGlyph({ status }: { status: string | null }) {
  if (status === 'passing') return <CheckIcon size={11} className="text-green" />;
  if (status === 'failing') return <span className="text-del">✗</span>;
  if (status === 'pending') return <span className="animate-pulse-dot text-ember">◌</span>;
  return null;
}

export function PanelHeader({
  path,
  branch,
  defaultBranch,
  prInfo,
  baseFiles,
  refreshing,
  onRefresh,
}: PanelHeaderProps) {
  const hasOpenPr = prInfo !== null && prInfo.state.toUpperCase() === 'OPEN';
  const canCreatePr = path !== null && !hasOpenPr;

  return (
    <div data-tauri-drag-region className="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
      <span data-tauri-drag-region className="grid place-items-center text-ink-faint">
        <GitBranchIcon size={13} />
      </span>
      <span
        data-tauri-drag-region
        className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-dim"
        title={branch ?? undefined}
      >
        {branch ?? 'No branch'}
      </span>

      {prInfo && (
        <button
          type="button"
          onClick={() => openUrl(prInfo.url).catch(() => null)}
          title={`Open PR #${prInfo.number} on GitHub`}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${prStateClass(prInfo.state)}`}
        >
          <PrIcon size={11} />
          #{prInfo.number}
          <CiGlyph status={prInfo.ci_status} />
        </button>
      )}

      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh"
        title="Refresh"
        className={`grid size-[26px] flex-none place-items-center rounded-md text-ink-faint transition-colors hover:bg-hover hover:text-ink ${refreshing ? 'animate-pulse-dot' : ''}`}
      >
        ⟳
      </button>

      {canCreatePr && (
        <button
          type="button"
          onClick={() => openCreatePrChat({ path, branch, defaultBranch, baseFiles })}
          title="Open an agent chat to create the pull request"
          aria-label="Create pull request"
          className="inline-flex flex-none items-center gap-1 rounded-md border border-ember-edge bg-ember-tint px-2 py-1 text-[11px] font-medium text-ember transition hover:brightness-110"
        >
          <PrIcon size={12} /> Create PR
        </button>
      )}
    </div>
  );
}
