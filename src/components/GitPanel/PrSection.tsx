import { openUrl } from '@tauri-apps/plugin-opener';
import type { PrInfo } from '../../types/project';
import { ExternalLinkIcon } from '../icons';

interface PrSectionProps {
  prInfo: PrInfo | null;
}

export function PrSection({ prInfo }: PrSectionProps) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
      {prInfo && (
        <button
          type="button"
          onClick={() => openUrl(prInfo.url).catch(() => null)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-app px-2.5 py-1.5 text-xs text-ink-dim transition hover:border-ember-edge hover:bg-ember-tint hover:text-ember"
        >
          <ExternalLinkIcon size={13} /> View PR on web
        </button>
      )}
      <span className="ml-auto text-[11px] text-ink-faint">
        {prInfo
          ? `#${prInfo.number} · ${prInfo.state.toLowerCase()}${prInfo.ci_status ? ` · ${prInfo.ci_status}` : ''}`
          : 'No PR yet'}
      </span>
    </div>
  );
}
