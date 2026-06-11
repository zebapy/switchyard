import { openUrl } from '@tauri-apps/plugin-opener';
import type { PrInfo } from '../../types/project';
import { PrIcon, ExternalLinkIcon } from '../icons';

interface ReviewTabProps {
  prInfo: PrInfo | null;
}

/** Review tab — pull-request review surface. For now it links out to the PR;
 *  inline review (diffs + comments) lands here later. */
export function ReviewTab({ prInfo }: ReviewTabProps) {
  if (!prInfo) {
    return (
      <div className="grid flex-1 place-items-center px-6 text-center text-[12px] text-ink-faint">
        <div className="flex flex-col items-center gap-2">
          <PrIcon size={20} />
          <p>No pull request for this branch yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 py-4">
      <div className="flex items-center gap-2 text-[13px] text-ink">
        <PrIcon size={14} />
        <span className="font-medium">#{prInfo.number}</span>
        <span className="text-ink-faint">· {prInfo.state.toLowerCase()}</span>
      </div>
      <button
        type="button"
        onClick={() => openUrl(prInfo.url).catch(() => null)}
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-line bg-app px-2.5 py-1.5 text-xs text-ink-dim transition hover:border-guide hover:bg-hover hover:text-ink"
      >
        <ExternalLinkIcon size={13} /> View PR on web
      </button>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Inline review — file-by-file diffs and comments — is coming here.
      </p>
    </div>
  );
}
