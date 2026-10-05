import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
import { useGitPanelStore } from '../../stores/gitPanel';
import { PanelHeader } from './PanelHeader';
import { PanelTabs } from './PanelTabs';
import { ChangedFiles } from './ChangedFiles';
import type { DiffTarget } from './DiffSourceMenu';
import { FileTree } from './FileTree';
import { ReviewTab } from './ReviewTab';
import { PrSection } from './PrSection';
import { ChecksList } from './ChecksList';
import { useChangedFiles, useChecks, useDefaultBranch, useRepoTree } from './useGitData';
import { openAllDiffsTab, openDiffTab, openFileTab } from '../../lib/viewerTabs';
import type { ViewerIntent } from '../../lib/viewerTabs';

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

/** A compare-branch pick only sticks to the worktree it was made in. */
interface DiffTargetChoice {
  path: string;
  target: DiffTarget;
}

/** Resolve what the panel diffs against. A `base` diff compares against the
 *  user's picked branch, else the PR's base branch, else the repo default. */
function resolveDiffTarget({
  choice,
  path,
  prBase,
  defaultBranch,
}: {
  choice: DiffTargetChoice | null;
  path: string | null;
  prBase: string | null;
  defaultBranch: string | null;
}): DiffTarget {
  const picked = choice?.path === path ? choice.target : null;
  if (picked?.source === 'base') return { source: 'base', branch: picked.branch ?? prBase ?? defaultBranch };
  if (picked) return picked;
  return { source: 'unstaged', branch: null };
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

  const prBase = prInfo?.base_branch || null;
  const [diffChoice, setDiffChoice] = useState<DiffTargetChoice | null>(null);
  const diffTarget = resolveDiffTarget({ choice: diffChoice, path, prBase, defaultBranch });
  const { source, branch: compareBranch } = diffTarget;

  const { files, loading: filesLoading, error: filesError, reload: reloadFiles } = useChangedFiles(
    path,
    source,
    compareBranch,
  );
  // Files the PR would contain — against the PR's base when there is one.
  const baseFiles = useChangedFiles(path, 'base', prBase);
  const { checks, loading: checksLoading, error: checksError, reload: reloadChecks } = useChecks(path);
  const repoTree = useRepoTree(path, tab === 'files');

  useEffect(() => {
    if (path) refreshPrInfo(path).catch(() => null);
  }, [path, refreshPrInfo]);

  if (!open || !inWorkspace) return null;

  const handleSelectFile = (file: string, intent: ViewerIntent) => {
    if (!path) return;
    openDiffTab({ repoPath: path, file, source, base: compareBranch, intent });
  };

  const handleSelectRepoFile = (file: string, intent: ViewerIntent) => {
    if (!path) return;
    openFileTab({ repoPath: path, file, intent });
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
                diffTarget={diffTarget}
                onDiffTargetChange={(target) => setDiffChoice({ path, target })}
                prBase={prBase}
                defaultBranch={defaultBranch}
                files={files}
                loading={filesLoading}
                error={filesError}
                onSelectFile={handleSelectFile}
                fileView={fileView}
                onFileViewChange={setFileView}
                onOpenAllInTab={() => openAllDiffsTab({ repoPath: path, source, base: compareBranch })}
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
              onOpenFile={handleSelectRepoFile}
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
