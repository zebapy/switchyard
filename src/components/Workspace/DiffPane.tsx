import { DiffView } from '../GitPanel/DiffView';
import { useFileDiff } from '../GitPanel/useGitData';
import type { DiffSource } from '../../types/gitpanel';
import type { PaneInfo } from '../../types/pane';
import { diffSourceLabel } from './diffSourceLabel';

interface DiffPaneProps {
  paneInfo: PaneInfo;
}

/** A workspace pane that shows a single file's git diff (no PTY). */
export function DiffPane({ paneInfo }: DiffPaneProps) {
  const file = paneInfo.diffFile ?? null;
  const source = (paneInfo.diffSource ?? 'unstaged') as DiffSource;
  const base = paneInfo.diffBase ?? null;
  const { diff, loading, error } = useFileDiff(paneInfo.cwd, file, source, base);

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <div className="flex flex-none items-center gap-2 border-b border-line-soft px-3 py-1.5 text-[11px] text-ink-faint">
        <span className="font-mono text-ink-dim">{file}</span>
        <span className="ml-auto">{diffSourceLabel(source, base)}</span>
      </div>
      <DiffView
        file={file}
        diff={diff}
        loading={loading}
        error={error}
        cwd={paneInfo.cwd}
        source={source}
        paneId={paneInfo.id}
      />
    </div>
  );
}
