import { useWorkspaceStore } from '../stores/workspace';
import { basename } from '../components/GitPanel/fileStatus';
import type { PaneInfo, PaneTree } from '../types/pane';
import type { DiffSource } from '../types/gitpanel';

/** How committed the user is to the tab being opened. A glance opens a preview
 *  tab — the Workspace's single replaceable slot; a choice opens a stuck tab. */
export type ViewerIntent = 'glance' | 'choose';

function leafIds(tree: PaneTree): string[] {
  if (tree.type === 'leaf') return [tree.paneId];
  return [...leafIds(tree.children[0]), ...leafIds(tree.children[1])];
}

/** Focus the tab already showing `pane`, sticking it when the user chose it
 *  outright (double-click, or the explicit open-in-tab button). Double-clicking
 *  a row therefore sticks the preview tab the first click just opened. */
function revealExistingPane(pane: PaneInfo, intent: ViewerIntent): void {
  const store = useWorkspaceStore.getState();
  store.focusPane(pane.id);
  if (intent === 'glance') return;
  const win = store.findWindowForPane(pane.id);
  const tab = win?.tabs.find((t) => leafIds(t.paneTree).includes(pane.id));
  if (tab) store.stickTab(tab.id);
}

function findPane(match: (pane: PaneInfo) => boolean): PaneInfo | null {
  for (const pane of useWorkspaceStore.getState().panes.values()) {
    if (match(pane)) return pane;
  }
  return null;
}

interface OpenFileTabArgs {
  repoPath: string;
  file: string;
  intent: ViewerIntent;
}

/** Open a file's contents as a workspace viewer tab, reusing a matching tab. */
export function openFileTab({ repoPath, file, intent }: OpenFileTabArgs): void {
  const existing = findPane((p) => p.kind === 'File' && p.cwd === repoPath && p.filePath === file);
  if (existing) {
    revealExistingPane(existing, intent);
    return;
  }
  useWorkspaceStore.getState().addTab(repoPath, basename(file), {
    kind: 'File',
    cwd: repoPath,
    filePath: file,
    label: basename(file),
    preview: intent === 'glance',
  });
}

interface OpenDiffTabArgs {
  repoPath: string;
  file: string;
  source: DiffSource;
  /** Branch a `base` diff compares against; `null` = repo default. */
  base: string | null;
  intent: ViewerIntent;
}

/** The pane's stored compare branch — only `base` diffs have one. */
function paneDiffBase(source: DiffSource, base: string | null): string | undefined {
  if (source === 'base' && base) return base;
  return undefined;
}

/** Open a single file's diff as a workspace viewer tab, reusing a matching tab. */
export function openDiffTab({ repoPath, file, source, base, intent }: OpenDiffTabArgs): void {
  const diffBase = paneDiffBase(source, base);
  const existing = findPane(
    (p) =>
      p.kind === 'Diff' &&
      p.cwd === repoPath &&
      p.diffFile === file &&
      p.diffSource === source &&
      p.diffBase === diffBase,
  );
  if (existing) {
    revealExistingPane(existing, intent);
    return;
  }
  useWorkspaceStore.getState().addTab(repoPath, basename(file), {
    kind: 'Diff',
    cwd: repoPath,
    diffFile: file,
    diffSource: source,
    diffBase,
    label: basename(file),
    preview: intent === 'glance',
  });
}

interface OpenAllDiffsTabArgs {
  repoPath: string;
  source: DiffSource;
  base: string | null;
}

/** Open every changed file's diff stacked in one workspace tab, reusing a match.
 *  Always stuck: reaching it takes a deliberate toolbar action, never a glance. */
export function openAllDiffsTab({ repoPath, source, base }: OpenAllDiffsTabArgs): void {
  const diffBase = paneDiffBase(source, base);
  const existing = findPane(
    (p) => p.kind === 'DiffAll' && p.cwd === repoPath && p.diffSource === source && p.diffBase === diffBase,
  );
  if (existing) {
    useWorkspaceStore.getState().focusPane(existing.id);
    return;
  }
  useWorkspaceStore.getState().addTab(repoPath, 'All changes', {
    kind: 'DiffAll',
    cwd: repoPath,
    diffSource: source,
    diffBase,
    label: 'All changes',
  });
}
