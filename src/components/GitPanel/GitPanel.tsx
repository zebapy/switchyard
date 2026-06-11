import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
import { useGitPanelStore } from '../../stores/gitPanel';
import type { DiffSource } from '../../types/gitpanel';
import { PanelHeader } from './PanelHeader';
import { PanelTabs } from './PanelTabs';
import { ChangedFiles } from './ChangedFiles';
import { FileTree } from './FileTree';
import { ReviewTab } from './ReviewTab';
import { PrSection } from './PrSection';
import { ChecksList } from './ChecksList';
import { useChangedFiles, useChecks, useDefaultBranch, useRepoTree } from './useGitData';

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

/** Branch name for a worktree path, derived from cached git info (as TabBar does).
 *  Memoized so it only re-scans gitInfo when the map or path actually changes,
 *  not on every render of the panel. */
function useBranchForPath(path: string | null): string | null {
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  return useMemo(() => {
    if (!path) return null;
    for (const info of gitInfo.values()) {
      const worktree = info.worktrees.find((w) => w.path === path);
      if (worktree) return worktree.branch;
    }
    return gitInfo.get(path)?.branch ?? null;
  }, [gitInfo, path]);
}

/** Open the file's diff as a workspace tab, reusing an existing matching tab. */
function openDiffInTab(repoPath: string, file: string, source: DiffSource): void {
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

/** Open every changed file's diff stacked in one workspace tab, reusing a match. */
function openAllDiffsInTab(repoPath: string, source: DiffSource): void {
  const store = useWorkspaceStore.getState();
  for (const pane of store.panes.values()) {
    if (pane.kind === 'DiffAll' && pane.cwd === repoPath && pane.diffSource === source) {
      store.focusPane(pane.id);
      return;
    }
  }
  store.addTab(repoPath, 'All changes', {
    kind: 'DiffAll',
    cwd: repoPath,
    diffSource: source,
    label: 'All changes',
  });
}

/** Open the file's contents as a workspace viewer tab, reusing a matching tab. */
function openFileInTab(repoPath: string, file: string): void {
  const store = useWorkspaceStore.getState();
  for (const pane of store.panes.values()) {
    if (pane.kind === 'File' && pane.cwd === repoPath && pane.filePath === file) {
      store.focusPane(pane.id);
      return;
    }
  }
  store.addTab(repoPath, basename(file), {
    kind: 'File',
    cwd: repoPath,
    filePath: file,
    label: basename(file),
  });
}

export function GitPanel() {
  const open = useGitPanelStore((s) => s.open);
  const width = useGitPanelStore((s) => s.width);
  const setWidth = useGitPanelStore((s) => s.setWidth);
  const fileView = useGitPanelStore((s) => s.fileView);
  const setFileView = useGitPanelStore((s) => s.setFileView);
  const tab = useGitPanelStore((s) => s.tab);
  const setTab = useGitPanelStore((s) => s.setTab);

  // The panel belongs to the workspace surface only — not the dashboard or
  // settings views.
  const inWorkspace = useLocation().pathname.startsWith('/workspace');

  // The active tab's worktree is its window's project path (windows are keyed by
  // worktree). `null` when no workspace is open.
  const path = useWorkspaceStore((s) => s.activeWindowId);

  const branch = useBranchForPath(path);
  const defaultBranch = useDefaultBranch(path);

  const prInfo = useProjectsStore((s) => (path ? s.prInfo.get(path) ?? null : null));
  const refreshPrInfo = useProjectsStore((s) => s.refreshPrInfo);

  const [source, setSource] = useState<DiffSource>('unstaged');

  const { files, loading: filesLoading, error: filesError, reload: reloadFiles } = useChangedFiles(path, source);
  const baseFiles = useChangedFiles(path, 'base');
  const { checks, loading: checksLoading, error: checksError, reload: reloadChecks } = useChecks(path);
  const repoTree = useRepoTree(path, tab === 'files');

  useEffect(() => {
    if (path) refreshPrInfo(path).catch(() => null);
  }, [path, refreshPrInfo]);

  if (!open || !inWorkspace) return null;

  const handleSelectFile = (file: string) => {
    if (!path) return;
    openDiffInTab(path, file, source);
  };

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => setWidth(startWidth + (startX - ev.clientX));
    const onUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const refreshAll = () => {
    reloadFiles();
    baseFiles.reload();
    reloadChecks();
    repoTree.reload();
    if (path) refreshPrInfo(path).catch(() => null);
  };

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Git panel"
        onMouseDown={handleResizerMouseDown}
        className="relative z-[5] -mx-0.5 w-1 shrink-0 cursor-col-resize transition-colors hover:bg-ember/40"
      />
      <aside
        style={{ width }}
        className="flex flex-none flex-col overflow-hidden border-l border-line bg-side"
      >
        <PanelHeader
          path={path}
          branch={branch}
          defaultBranch={defaultBranch}
          prInfo={prInfo}
          baseFiles={baseFiles.files}
          refreshing={filesLoading || checksLoading || repoTree.loading}
          onRefresh={refreshAll}
        />

        <PanelTabs tab={tab} onChange={setTab} />

        {!path ? (
          <div className="grid flex-1 place-items-center px-4 text-center text-[12px] text-ink-faint">
            Open a worktree to see its Git status.
          </div>
        ) : tab === 'changes' ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col">
              <ChangedFiles
                path={path}
                source={source}
                onSourceChange={setSource}
                defaultBranch={defaultBranch}
                files={files}
                loading={filesLoading}
                error={filesError}
                onSelectFile={handleSelectFile}
                fileView={fileView}
                onFileViewChange={setFileView}
                onOpenAllInTab={() => openAllDiffsInTab(path, source)}
              />
            </div>

            <PrSection prInfo={prInfo} />

            <div className="flex h-[28%] min-h-0 flex-none flex-col">
              <ChecksList
                path={path}
                checks={checks}
                loading={checksLoading}
                error={checksError}
                onRefresh={reloadChecks}
              />
            </div>
          </>
        ) : tab === 'files' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <FileTree
              paths={repoTree.paths}
              loading={repoTree.loading}
              error={repoTree.error}
              onOpenFile={(file) => openFileInTab(path, file)}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <ReviewTab prInfo={prInfo} />
          </div>
        )}
      </aside>
    </>
  );
}
