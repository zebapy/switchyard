import { AllDiffsView } from '../GitPanel/AllDiffsView';
import { useChangedFiles } from '../GitPanel/useGitData';
import { useWorkspaceStore } from '../../stores/workspace';
import type { DiffSource } from '../../types/gitpanel';
import type { PaneInfo } from '../../types/pane';

interface AllDiffsPaneProps {
  paneInfo: PaneInfo;
}

const SOURCE_LABEL: Record<string, string> = {
  unstaged: 'Unstaged changes',
  staged: 'Staged changes',
  base: 'Changes vs base branch',
};

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

/** Open a single file's diff as its own workspace tab, reusing a match. */
function openFileDiffInTab(repoPath: string, file: string, source: DiffSource): void {
  const store = useWorkspaceStore.getState();
  for (const pane of store.panes.values()) {
    if (pane.kind === 'Diff' && pane.cwd === repoPath && pane.diffFile === file && pane.diffSource === source) {
      store.focusPane(pane.id);
      return;
    }
  }
  store.addTab(repoPath, basename(file), {
    kind: 'Diff',
    cwd: repoPath,
    diffFile: file,
    diffSource: source,
    label: basename(file),
  });
}

/** A full-width workspace pane showing every changed file's diff stacked,
 *  PR-style. The repo is `cwd`; the diff source is `diffSource`. */
export function AllDiffsPane({ paneInfo }: AllDiffsPaneProps) {
  const source = (paneInfo.diffSource ?? 'unstaged') as DiffSource;
  const { files, loading, error } = useChangedFiles(paneInfo.cwd, source);

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <div className="flex flex-none items-center gap-2 border-b border-line-soft px-3 py-1.5 text-[11px] text-ink-faint">
        <span className="font-mono text-ink-dim">All changed files</span>
        <span className="ml-auto">{SOURCE_LABEL[source] ?? source}</span>
      </div>
      <AllDiffsView
        path={paneInfo.cwd}
        source={source}
        files={files}
        loading={loading}
        error={error}
        onOpenFileInTab={(file) => openFileDiffInTab(paneInfo.cwd, file, source)}
        paneId={paneInfo.id}
      />
    </div>
  );
}
