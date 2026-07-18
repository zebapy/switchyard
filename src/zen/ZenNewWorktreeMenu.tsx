import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useProjectsStore } from '../stores/projects';
import { useWorkspaceStore } from '../stores/workspace';
import { useUiStore } from '../stores/ui';
import { useZenStore } from './zenStore';
import { basename } from './zenData';
import { loadIssuePrompt, renderIssuePrompt } from '../components/Worktree/issuePrompt';
import { ZenMenu, type ZenMenuItem } from './ZenMenu';
import { ZenSourceList } from './ZenSourceList';
import { WorktreeIcon, LinearIcon, PrIcon, GitBranchIcon } from '../components/icons';
import type { GhItem } from '../types/project';

/** A remote source the new worktree can be seeded from. */
type Source = 'linear' | 'pr' | 'branch';
/** Which level of the menu is on screen — the root actions, or one source list. */
type View = 'root' | Source;

interface SourceMeta {
  title: string;
  provider: 'linear' | 'github';
  icon: ReactNode;
  /** Fetch the selectable rows for this source. */
  list: (projectPath: string) => Promise<GhItem[]>;
}

const SOURCES: Record<Source, SourceMeta> = {
  linear: {
    title: 'Linear issues',
    provider: 'linear',
    icon: <LinearIcon size={13} />,
    list: () => invoke<GhItem[]>('linear_list_issues', { all: false }),
  },
  pr: {
    title: 'GitHub pull requests',
    provider: 'github',
    icon: <PrIcon size={13} />,
    list: (projectPath) => invoke<GhItem[]>('gh_list_prs', { path: projectPath }),
  },
  branch: {
    title: 'GitHub branches',
    provider: 'github',
    icon: <GitBranchIcon size={13} />,
    list: (projectPath) => invoke<GhItem[]>('gh_list_branches', { path: projectPath }),
  },
};

function lastSegment(branch: string): string {
  return branch.split('/').filter(Boolean).pop() ?? branch;
}

/** `#318` → 318. Returns 0 when the id carries no number. */
function prNumberFrom(id: string): number {
  return Number(id.replace(/\D/g, '')) || 0;
}

/**
 * Land in a freshly created worktree without leaving Zen: drill into it (so the
 * breadcrumb + Focus mode have a worktree path), then — when seeded from a
 * source — start the default agent primed with the issue prompt and focus it.
 */
function openNewWorktree(worktreePath: string, seed?: GhItem) {
  const ps = useProjectsStore.getState();
  const zen = useZenStore.getState();
  zen.enterWorktree(worktreePath);
  if (!seed) return;
  const command = renderIssuePrompt(loadIssuePrompt(), seed) || undefined;
  useWorkspaceStore.getState().addTab(worktreePath, basename(worktreePath), {
    kind: 'Agent',
    cwd: worktreePath,
    agent: ps.agents[0]?.command,
    command,
    label: lastSegment(seed.branch),
  });
  const newId = useWorkspaceStore.getState().windows.get(worktreePath)?.activePaneId;
  if (newId) zen.focus(newId);
}

/**
 * The worktrees-tier "New…" menu (⌘⇧K). Two levels over the shared ZenMenu:
 * a root list (quick worktree, source pickers, and the pane spawns) and, when a
 * source is chosen, its fetched rows — each creating a worktree from that item.
 * Reuses the same back-end commands as the standard NewWorktreeModal.
 */
export function ZenNewWorktreeMenu({ projectPath }: { projectPath: string }) {
  const closeAddMenu = useZenStore((s) => s.closeAddMenu);
  const createWorktree = useProjectsStore((s) => s.createWorktree);
  const createWorktreeForPr = useProjectsStore((s) => s.createWorktreeForPr);
  const quickWorktree = useProjectsStore((s) => s.quickWorktree);
  const openGithubConnect = useUiStore((s) => s.openGithubConnect);

  const [view, setView] = useState<View>('root');
  const [items, setItems] = useState<GhItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Bumped to re-run the load effect after a fresh connection (view is unchanged).
  const [reloadKey, setReloadKey] = useState(0);

  // Load the chosen source's rows (after checking the provider is connected).
  useEffect(() => {
    if (view === 'root') return;
    const source = SOURCES[view];
    let cancelled = false;
    setLoading(true);
    setItems([]);
    setError('');
    const check = source.provider === 'linear' ? 'linear_is_connected' : 'github_is_connected';
    invoke<boolean>(check)
      .then((ok) => {
        if (cancelled) return;
        setConnected(ok);
        if (!ok) { setLoading(false); return; }
        source
          .list(projectPath)
          .then((rows) => { if (!cancelled) setItems(rows); })
          .catch((e: unknown) => { if (!cancelled) setError(String(e)); })
          .finally(() => { if (!cancelled) setLoading(false); });
      })
      .catch(() => { if (!cancelled) { setConnected(false); setLoading(false); } });
    return () => { cancelled = true; };
  }, [view, projectPath, reloadKey]);

  // The shared GitHub connect modal reports success here — pick the rows back up.
  useEffect(() => {
    const unlisten = listen('github:connected', () => { setConnected(true); setReloadKey((k) => k + 1); });
    return () => { unlisten.then((off) => off()); };
  }, []);

  async function connect() {
    if (view === 'root') return;
    if (SOURCES[view].provider === 'github') { openGithubConnect(); return; }
    setConnecting(true);
    setError('');
    await invoke('linear_login').catch((e: unknown) => setError(String(e)));
    const ok = await invoke<boolean>('linear_is_connected').catch(() => false);
    setConnected(ok);
    setConnecting(false);
    if (ok) setReloadKey((k) => k + 1);
  }

  async function quick() {
    const res = await quickWorktree(projectPath).catch((e: unknown) => { setError(String(e)); return null; });
    if (!res) return;
    useProjectsStore.getState().expandProject(projectPath);
    openNewWorktree(res.path);
    closeAddMenu();
  }

  async function createFrom(item: GhItem) {
    if (busy || !item.branch) return;
    setBusy(true);
    setError('');
    const created =
      view === 'pr'
        ? await createWorktreeForPr({ repoPath: projectPath, prNumber: prNumberFrom(item.id), branchName: item.branch })
            .catch((e: unknown) => { setError(String(e)); return null; })
        : await createWorktree(projectPath, item.branch)
            .catch((e: unknown) => { setError(String(e)); return null; });
    setBusy(false);
    if (!created) return;
    useProjectsStore.getState().expandProject(projectPath);
    openNewWorktree(created, item);
    closeAddMenu();
  }

  const rootItems = useMemo<ZenMenuItem[]>(() => [
    { id: 'quick', label: 'New worktree', icon: <WorktreeIcon size={13} />, shortcut: '↵', onSelect: () => void quick() },
    { id: 'from-linear', label: 'New worktree from Linear issue…', icon: SOURCES.linear.icon, onSelect: () => setView('linear') },
    { id: 'from-pr', label: 'New worktree from GitHub PR…', icon: SOURCES.pr.icon, onSelect: () => setView('pr') },
    { id: 'from-branch', label: 'New worktree from GitHub branch…', icon: SOURCES.branch.icon, onSelect: () => setView('branch') },
    // quick reads fresh store state, so this list is static.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  if (view === 'root') {
    return (
      <ZenMenu
        label="Zen new worktree"
        anchor="bottom-left"
        items={rootItems}
        onClose={closeAddMenu}
        emptyText="Nothing to add"
      />
    );
  }

  const source = SOURCES[view];
  return (
    <ZenSourceList
      title={source.title}
      icon={source.icon}
      providerName={source.provider === 'linear' ? 'Linear' : 'GitHub'}
      connected={connected}
      loading={loading}
      error={error}
      busy={busy}
      connecting={connecting}
      items={items}
      onBack={() => setView('root')}
      onClose={closeAddMenu}
      onConnect={() => void connect()}
      onSelect={(item) => void createFrom(item)}
    />
  );
}
