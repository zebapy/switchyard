import { AllDiffsView } from '../GitPanel/AllDiffsView';
import { useChangedFiles } from '../GitPanel/useGitData';
import { openDiffTab } from '../../lib/viewerTabs';
import type { DiffSource } from '../../types/gitpanel';
import type { PaneInfo } from '../../types/pane';
import { diffSourceLabel } from './diffSourceLabel';

interface AllDiffsPaneProps {
  paneInfo: PaneInfo;
}

/** A full-width workspace pane showing every changed file's diff stacked,
 *  PR-style. The repo is `cwd`; the diff source is `diffSource`. */
export function AllDiffsPane({ paneInfo }: AllDiffsPaneProps) {
  const source = (paneInfo.diffSource ?? 'unstaged') as DiffSource;
  const base = paneInfo.diffBase ?? null;
  const { files, loading, error } = useChangedFiles(paneInfo.cwd, source, base);

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <div className="flex flex-none items-center gap-2 border-b border-line-soft px-3 py-1.5 text-[11px] text-ink-faint">
        <span className="font-mono text-ink-dim">All changed files</span>
        <span className="ml-auto">{diffSourceLabel(source, base)}</span>
      </div>
      <AllDiffsView
        path={paneInfo.cwd}
        source={source}
        base={base}
        files={files}
        loading={loading}
        error={error}
        onOpenFileInTab={(file) => openDiffTab({ repoPath: paneInfo.cwd, file, source, base, intent: 'choose' })}
        paneId={paneInfo.id}
      />
    </div>
  );
}
