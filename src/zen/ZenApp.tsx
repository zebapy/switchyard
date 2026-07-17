import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useProjectsStore } from '../stores/projects';
import { useWorkspaceStore } from '../stores/workspace';
import { useZenStore } from './zenStore';
import {
  deriveProjectRows,
  deriveWorktreeRows,
  derivePaneRows,
  resolveContext,
  paneLabel,
  basename,
} from './zenData';
import { ZenTierList } from './ZenTierList';
import { ZenFocus } from './ZenFocus';
import { ZenSortMenu } from './ZenSortMenu';
import { ZenActionMenu, spawnPane, type ZenActionTarget } from './ZenActionMenu';
import { ZenActionsCluster, type ClusterAction } from './ZenActionsCluster';
import { ZenOpenIn } from './ZenOpenIn';
import { ZenAddMenu, TIER_TITLE } from './ZenAddMenu';
import { ZenBackButton } from './ZenBackButton';
import { fuzzyMatch } from '../components/CommandPalette/fuzzyMatch';
import {
  DEFAULT_WORKTREE_SORT,
  WORKTREE_SORT_OPTIONS,
  PROJECT_LIST_SORT_OPTIONS,
  PANE_SORT_OPTIONS,
} from '../types/project';

/** Fuzzy-narrow a tier's rows by the toolbar query, best matches first. */
function filterRows<T>(rows: T[], query: string, toText: (row: T) => string): T[] {
  const q = query.trim();
  if (!q) return rows;
  return rows
    .map((row) => ({ row, result: fuzzyMatch(q, toText(row)) }))
    .filter((entry) => entry.result !== null)
    .sort((a, b) => b.result!.score - a.result!.score)
    .map((entry) => entry.row);
}

/**
 * The single-focus "Zen" interface — mounted instead of the standard chrome
 * (see `main.tsx`). It drills Projects → Workspaces → Panes one tier at a time
 * over the same stores/back end; focusing a pane reuses the real terminal, so
 * tmux sessions persist across the Standard↔Zen swap. `^←` leaves Focus, `⌘K`
 * opens contextual actions (including "Exit Zen Mode"), and `⌘P` opens the
 * context-aware sort menu for whichever tier is on screen.
 */
export function ZenApp() {
  const projects = useProjectsStore((s) => s.projects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const projectSort = useProjectsStore((s) => s.projectSort);
  const projectListSort = useProjectsStore((s) => s.projectListSort);
  const paneSort = useProjectsStore((s) => s.paneSort);
  const pins = useProjectsStore((s) => s.pins);
  const prsByBranch = useProjectsStore((s) => s.prsByBranch);
  const refreshPrBranches = useProjectsStore((s) => s.refreshPrBranches);
  const windows = useWorkspaceStore((s) => s.windows);
  const panes = useWorkspaceStore((s) => s.panes);
  const nav = useZenStore();

  // Bootstrap the same data the standard layout loads, but only on a cold start
  // (Zen mounted first, stores empty). When toggled in from Standard the stores
  // are already populated and newer than disk — reloading would clobber them.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const ps = useProjectsStore.getState();
    const ws = useWorkspaceStore.getState();
    if (ps.projects.length === 0) {
      Promise.resolve(ps.loadSettings()).then(() => ps.loadAddedProjects()).catch(() => null);
    }
    if (ws.windows.size === 0) ws.loadSession().catch(() => null);
  }, []);

  // Best-effort session save if the app closes while Zen is the active layout
  // (the standard layout owns the richer close-confirm flow).
  useEffect(() => {
    const save = () => { useWorkspaceStore.getState().saveSession(); };
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, []);

  // Pins drive the "Pinned" sections on the Projects/Workspaces tiers. The
  // standard layout never loads them, so pull them whenever Zen mounts.
  useEffect(() => {
    useProjectsStore.getState().loadPins();
  }, []);

  // Zen's toolbar is taller than the standard chrome, so the macOS traffic
  // lights (fixed near the window top) look crammed against the top. Center them
  // in the toolbar band and give them a left inset matching its right padding.
  // Applied while Zen owns the window; restored to the default on exit.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const TRAFFIC_LEFT_INSET = 22; // matches the toolbar's pr-[22px]
  useEffect(() => {
    const applyTrafficLights = () => {
      const bandHeight = toolbarRef.current?.offsetHeight;
      if (!bandHeight) return;
      invoke('center_traffic_lights', { leftInset: TRAFFIC_LEFT_INSET, bandHeight }).catch(() => null);
    };
    applyTrafficLights();
    // Full-screen transitions rebuild the titlebar, so reapply on every resize.
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onResized(applyTrafficLights)
      .then((fn) => { unlisten = fn; })
      .catch(() => null);
    return () => {
      unlisten?.();
      invoke('reset_traffic_lights').catch(() => null);
    };
  }, []);

  // Lazily pull each git project's worktrees so Tier 2 is populated.
  useEffect(() => {
    const { gitInfo: gi, refreshGitInfo } = useProjectsStore.getState();
    for (const p of projects) {
      if (p.is_git && !p.worktree_parent && !gi.has(p.path)) refreshGitInfo(p.path);
    }
  }, [projects]);

  const activeSort = nav.projectPath ? projectSort[nav.projectPath] ?? DEFAULT_WORKTREE_SORT : DEFAULT_WORKTREE_SORT;

  // Fetch open PRs for the project whose worktree list is on screen — used both
  // for the 'pr' sort and the per-worktree PR indicator / action, so always load.
  useEffect(() => {
    if (nav.projectPath) refreshPrBranches(nav.projectPath);
  }, [nav.projectPath, refreshPrBranches]);

  const allProjectRows = deriveProjectRows(projects, gitInfo, windows, projectListSort, pins);
  const allWorktreeRows = nav.projectPath
    ? deriveWorktreeRows(gitInfo, windows, nav.projectPath, activeSort, pins, prsByBranch.get(nav.projectPath))
    : [];
  const allPaneRows = nav.worktreePath ? derivePaneRows(windows, panes, nav.worktreePath, paneSort) : [];

  // Toolbar search narrows whichever tier is on screen. Everything downstream —
  // keyboard nav, ⌘K target, ⌘O dir, the rendered list — reads the filtered rows
  // so the cursor and actions always track what's actually visible.
  const projectRows = filterRows(allProjectRows, nav.query, (r) => r.name);
  const worktreeRows = filterRows(allWorktreeRows, nav.query, (r) => `${r.name} ${r.branch ?? ''}`);
  const paneRows = filterRows(allPaneRows, nav.query, (r) => paneLabel(r.info));

  // Keep the latest derived lists in a ref so the once-registered key handler
  // always reads fresh data without re-binding the listener.
  const listRef = useRef({ projectRows, worktreeRows, paneRows });
  listRef.current = { projectRows, worktreeRows, paneRows };

  const move = useCallback((delta: number) => {
    const st = useZenStore.getState();
    const list = listRef.current;
    const len =
      st.tier === 'projects' ? list.projectRows.length
      : st.tier === 'worktrees' ? list.worktreeRows.length
      : list.paneRows.length;
    if (len === 0) return;
    st.setCursor(st.tier, Math.min(len - 1, Math.max(0, st.cursor[st.tier] + delta)));
  }, []);

  const enterAtCursor = useCallback(() => {
    const st = useZenStore.getState();
    const list = listRef.current;

    if (st.tier === 'projects') {
      const row = list.projectRows[st.cursor.projects];
      if (!row) return;
      useProjectsStore.getState().refreshGitInfo(row.path);
      st.enterProject(row.path);
      return;
    }
    if (st.tier === 'worktrees') {
      const row = list.worktreeRows[st.cursor.worktrees];
      if (!row) return;
      st.enterWorktree(row.path);
      return;
    }

    const row = list.paneRows[st.cursor.panes];
    if (row) {
      useWorkspaceStore.getState().focusPane(row.paneId);
      st.focus(row.paneId);
      return;
    }
    // Empty worktree → start the default agent there (mirrors standard openTarget).
    const path = st.worktreePath;
    if (!path) return;
    const agent = useProjectsStore.getState().agents[0]?.command;
    useWorkspaceStore.getState().addTab(path, basename(path), { kind: 'Agent', cwd: path, agent });
    const newId = useWorkspaceStore.getState().windows.get(path)?.activePaneId;
    if (newId) st.focus(newId);
  }, []);

  // Whether ⌘K has something to act on in the current context.
  const hasActionTarget = useCallback(() => {
    const st = useZenStore.getState();
    const list = listRef.current;
    if (st.focusedPaneId) return true;
    if (st.tier === 'projects') return true; // a project row, or list-level actions like "Add folder"
    if (st.tier === 'worktrees') return list.worktreeRows.length > 0;
    return st.worktreePath != null; // panes tier: a pane or the empty worktree
  }, []);

  const toggleActionMenu = useCallback(() => {
    const st = useZenStore.getState();
    if (st.actionMenuOpen) st.closeActionMenu();
    else if (hasActionTarget()) st.openActionMenu();
  }, [hasActionTarget]);

  const toggleSortMenu = useCallback(() => {
    const st = useZenStore.getState();
    if (st.sortMenuOpen) st.closeSortMenu();
    else st.openSortMenu();
  }, []);

  // The directory ⌘O opens: the focused pane's / cursor row's worktree, project,
  // or worktree path depending on the tier. Reads live state + the latest rows.
  const computeOpenDir = useCallback((): string | null => {
    const st = useZenStore.getState();
    const list = listRef.current;
    if (st.focusedPaneId) return st.worktreePath;
    if (st.tier === 'projects') return list.projectRows[st.cursor.projects]?.path ?? null;
    if (st.tier === 'worktrees') return list.worktreeRows[st.cursor.worktrees]?.path ?? null;
    return st.worktreePath;
  }, []);

  const toggleOpenIn = useCallback(() => {
    const st = useZenStore.getState();
    if (st.openInOpen) st.closeOpenIn();
    else if (computeOpenDir()) st.openOpenIn();
  }, [computeOpenDir]);

  // The workspace the bottom-left "New…" menu spawns a session into: the focused
  // pane's / cursor worktree's / drilled-in worktree path. Null on the Projects
  // tier, where the menu offers add-project instead.
  const computeAddSpawnPath = useCallback((): string | null => {
    const st = useZenStore.getState();
    const list = listRef.current;
    if (st.focusedPaneId) return st.worktreePath;
    if (st.tier === 'projects') return null;
    if (st.tier === 'worktrees') return list.worktreeRows[st.cursor.worktrees]?.path ?? null;
    return st.worktreePath;
  }, []);

  const toggleAddMenu = useCallback(() => {
    const st = useZenStore.getState();
    if (st.addMenuOpen) st.closeAddMenu();
    else st.openAddMenu();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const st = useZenStore.getState();

      // ⌘P toggles the context-aware sort menu for the current tier.
      if (e.metaKey && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        if (!st.focusedPaneId) toggleSortMenu();
        return;
      }
      // ⌘⇧K toggles the context-aware "new" menu (bottom-left).
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        toggleAddMenu();
        return;
      }
      // ⌘K toggles contextual actions for the current selection.
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        toggleActionMenu();
        return;
      }
      // ⌘O opens the current directory in an external app.
      if (e.metaKey && e.key === 'o') {
        e.preventDefault();
        e.stopPropagation();
        toggleOpenIn();
        return;
      }
      if (st.sortMenuOpen || st.actionMenuOpen || st.openInOpen || st.addMenuOpen) return; // an overlay owns the keyboard

      // ⌘T new terminal / ⌘⇧T new agent in the current worktree (panes tier or focus).
      if (e.metaKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        e.stopPropagation();
        if (st.worktreePath) spawnPane(st.worktreePath, e.shiftKey ? 'Agent' : 'Shell');
        return;
      }

      if (st.focusedPaneId) {
        // Focus mode: the pane owns the keyboard; only ^← escapes it.
        if (e.ctrlKey && e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          st.escapeFocus();
        }
        return;
      }

      // Navigate mode.
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); enterAtCursor(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); st.back(); }
      // Escape clears an active search first, then climbs a tier.
      else if (e.key === 'Escape') { e.preventDefault(); if (st.query) st.setQuery(''); else st.back(); }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [move, enterAtCursor, toggleActionMenu, toggleSortMenu, toggleOpenIn, toggleAddMenu]);

  // Drop Focus if the pane disappears (closed elsewhere).
  useEffect(() => {
    if (nav.focusedPaneId && !panes.get(nav.focusedPaneId)) useZenStore.getState().escapeFocus();
  }, [nav.focusedPaneId, panes]);

  // Keep the toolbar search always focused so typing narrows the list right away —
  // yielding only while an overlay or Focus mode owns the keyboard.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (nav.sortMenuOpen || nav.actionMenuOpen || nav.openInOpen || nav.addMenuOpen || nav.focusedPaneId) return;
    searchRef.current?.focus();
  }, [nav.tier, nav.sortMenuOpen, nav.actionMenuOpen, nav.openInOpen, nav.addMenuOpen, nav.focusedPaneId]);

  const onHover = (index: number) => useZenStore.getState().setCursor(nav.tier, index);
  const onActivate = (index: number) => {
    useZenStore.getState().setCursor(nav.tier, index);
    enterAtCursor();
  };

  const focusInfo = nav.focusedPaneId ? panes.get(nav.focusedPaneId) : undefined;

  // What ⌘K acts on: the focused pane, else the cursor's row in the current tier.
  const actionTarget: ZenActionTarget | null =
    focusInfo && nav.focusedPaneId && nav.worktreePath
      ? { kind: 'pane', paneId: nav.focusedPaneId, info: focusInfo, worktreePath: nav.worktreePath }
      : nav.tier === 'projects'
        ? projectRows[nav.cursor.projects]
          ? { kind: 'project', path: projectRows[nav.cursor.projects].path, name: projectRows[nav.cursor.projects].name, pinned: projectRows[nav.cursor.projects].pinned }
          : { kind: 'projects' }
        : nav.tier === 'worktrees' && nav.projectPath
          ? worktreeRows[nav.cursor.worktrees]
            ? {
                kind: 'worktree',
                projectPath: nav.projectPath,
                path: worktreeRows[nav.cursor.worktrees].path,
                name: worktreeRows[nav.cursor.worktrees].name,
                branch: worktreeRows[nav.cursor.worktrees].branch,
                isMain: worktreeRows[nav.cursor.worktrees].isMain,
                pinned: worktreeRows[nav.cursor.worktrees].pinned,
                pr: worktreeRows[nav.cursor.worktrees].pr,
              }
            : null
          : nav.worktreePath
            ? paneRows[nav.cursor.panes]
              ? { kind: 'pane', paneId: paneRows[nav.cursor.panes].paneId, info: paneRows[nav.cursor.panes].info, worktreePath: nav.worktreePath }
              : { kind: 'empty', worktreePath: nav.worktreePath }
            : null;

  const openDir = computeOpenDir();
  const addSpawnPath = computeAddSpawnPath();
  const overlays = (
    <>
      {nav.sortMenuOpen && <ZenSortMenu tier={nav.tier} projectPath={nav.projectPath} />}
      {nav.actionMenuOpen && actionTarget && <ZenActionMenu target={actionTarget} />}
      {nav.openInOpen && openDir && <ZenOpenIn dir={openDir} />}
      {nav.addMenuOpen && <ZenAddMenu tier={nav.tier} spawnPath={addSpawnPath} />}
    </>
  );

  // Focus mode is just a different middle region — it keeps the same toolbar and
  // footer as the tier list, so the breadcrumb stays put and the pane body swaps in.
  const focused = !!(focusInfo && nav.worktreePath);
  const ctx = focused && nav.worktreePath ? resolveContext(projects, gitInfo, nav.worktreePath) : null;

  const projectName = focused
    ? ctx!.projectName
    : nav.projectPath
      ? allProjectRows.find((r) => r.path === nav.projectPath)?.name ?? basename(nav.projectPath)
      : null;
  const worktreeName = focused
    ? ctx!.worktreeName
    : nav.worktreePath
      ? allWorktreeRows.find((r) => r.path === nav.worktreePath)?.name ?? basename(nav.worktreePath)
      : null;
  const focusedLabel = focused && focusInfo ? paneLabel(focusInfo) : null;

  // Where the Back button lands, and its label: out of a focused pane → its
  // worktree; up from panes → the project; up from worktrees → the Projects root.
  const backDestination = focused
    ? worktreeName
    : nav.tier === 'panes'
      ? projectName
      : nav.tier === 'worktrees'
        ? 'Projects'
        : null;

  const searchPlaceholder =
    nav.tier === 'projects' ? 'Search projects…'
    : nav.tier === 'worktrees' ? 'Search worktrees…'
    : 'Search terminals & chats…';

  // The current tier's active sort, shown on the toolbar's sort button.
  const sortLabel = (() => {
    if (nav.tier === 'projects') return PROJECT_LIST_SORT_OPTIONS.find((o) => o.value === projectListSort)?.label ?? '';
    if (nav.tier === 'worktrees') return WORKTREE_SORT_OPTIONS.find((o) => o.value === activeSort)?.label ?? '';
    return PANE_SORT_OPTIONS.find((o) => o.value === paneSort)?.label ?? '';
  })();

  // The button mirroring the Enter key: whatever `enterAtCursor` would open for
  // the current selection. Null when there's nothing under the cursor to open.
  const enterActionLabel = (() => {
    if (nav.tier === 'projects') return projectRows[nav.cursor.projects] ? 'Open project' : null;
    if (nav.tier === 'worktrees') return worktreeRows[nav.cursor.worktrees] ? 'Open worktree' : null;
    const row = paneRows[nav.cursor.panes];
    if (row) {
      if (row.info.kind === 'Agent') return 'Open chat';
      if (row.info.kind === 'Shell') return 'Open terminal';
      return 'Open pane';
    }
    return nav.worktreePath ? 'Start chat' : null;
  })();

  return (
    <div className="flex h-screen w-screen flex-col bg-app font-ui text-ink">
      {/* Zen owns the window's top-left chrome, so this strip is the drag region
          and must clear the Overlay-style macOS traffic lights (hence pl-[78px]). */}
      <div
        ref={toolbarRef}
        data-tauri-drag-region
        className="flex flex-none items-center gap-4 border-b border-line-soft py-4 pl-[78px] pr-[22px]"
      >
        <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center pl-3">
          <ZenBackButton destination={backDestination} />
        </div>
        <div data-tauri-drag-region className="flex flex-1 justify-center">
          {!focused && (
            <input
              ref={searchRef}
              type="text"
              value={nav.query}
              onChange={(e) => nav.setQuery(e.target.value)}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full max-w-[340px] rounded-md border border-line bg-transparent px-3 py-[5px] font-mono text-[12px] text-ink outline-none transition placeholder:text-ink-ghost focus:border-guide focus:bg-hover"
            />
          )}
        </div>
        <div data-tauri-drag-region className="flex flex-1 justify-end">
          <ZenActionsCluster
            actions={[
              openDir && { keys: '⌘O', label: 'Open in…', onClick: toggleOpenIn, title: 'Open the current directory in an external app' },
              !focused && { keys: '⌘P', label: `Sort: ${sortLabel}`, onClick: toggleSortMenu, title: 'Sort the current list' },
            ].filter(Boolean) as ClusterAction[]}
          />
        </div>
      </div>

      {focused && focusInfo ? (
        <ZenFocus info={focusInfo} />
      ) : (
        <ZenTierList
          tier={nav.tier}
          projectRows={projectRows}
          worktreeRows={worktreeRows}
          paneRows={paneRows}
          cursor={nav.cursor[nav.tier]}
          query={nav.query}
          onHover={onHover}
          onActivate={onActivate}
        />
      )}

      <div className="flex flex-none items-center gap-3.5 border-t border-line-soft px-[18px] py-2.5 font-mono text-[11px] text-ink-faint">
        <ZenActionsCluster
          actions={[{ keys: '⌘⇧K', label: TIER_TITLE[nav.tier], onClick: toggleAddMenu, title: 'New… (⌘⇧K)' }]}
        />
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span>~</span>
          {projectName && (
            <>
              <span className="text-ink-ghost">›</span>
              <span className={`truncate ${nav.tier === 'worktrees' ? 'font-semibold text-ink' : ''}`}>{projectName}</span>
            </>
          )}
          {worktreeName && (
            <>
              <span className="text-ink-ghost">›</span>
              <span className={`truncate ${focusedLabel ? '' : 'font-semibold text-ink'}`}>{worktreeName}</span>
            </>
          )}
          {focusedLabel && (
            <>
              <span className="text-ink-ghost">›</span>
              <span className="truncate font-semibold text-ink">{focusedLabel}</span>
            </>
          )}
        </div>
        <div className="ml-auto">
          <ZenActionsCluster
            actions={[
              !focused && enterActionLabel && { keys: '→', label: enterActionLabel, onClick: enterAtCursor },
              { keys: '⌘K', label: 'Actions', onClick: toggleActionMenu },
            ].filter(Boolean) as ClusterAction[]}
          />
        </div>
      </div>

      {overlays}
    </div>
  );
}
