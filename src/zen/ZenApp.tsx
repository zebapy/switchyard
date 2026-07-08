import { useCallback, useEffect, useRef } from 'react';
import { useProjectsStore } from '../stores/projects';
import { useWorkspaceStore } from '../stores/workspace';
import { useZenStore } from './zenStore';
import {
  deriveProjectRows,
  deriveWorktreeRows,
  derivePaneRows,
  resolveContext,
  basename,
} from './zenData';
import { ZenTierList } from './ZenTierList';
import { ZenFocus } from './ZenFocus';
import { ZenPalette } from './ZenPalette';
import { ZenActionMenu, spawnPane, type ZenActionTarget } from './ZenActionMenu';
import { DEFAULT_WORKTREE_SORT } from '../types/project';

const TIER_LABEL = {
  projects: 'Tier 1 · Projects',
  worktrees: 'Tier 2 · Workspaces — root + worktrees',
  panes: 'Tier 3 · Panes — terminals + agents',
} as const;

/**
 * The single-focus "Zen" interface — mounted instead of the standard chrome
 * (see `main.tsx`). It drills Projects → Workspaces → Panes one tier at a time
 * over the same stores/back end; focusing a pane reuses the real terminal, so
 * tmux sessions persist across the Standard↔Zen swap. `^←` leaves Focus, `⌘K`
 * opens the jump palette, and the palette's "Exit Zen Mode" returns to Standard.
 */
export function ZenApp() {
  const projects = useProjectsStore((s) => s.projects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const projectSort = useProjectsStore((s) => s.projectSort);
  const prBranches = useProjectsStore((s) => s.prBranches);
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

  // Lazily pull each git project's worktrees so Tier 2 is populated.
  useEffect(() => {
    const { gitInfo: gi, refreshGitInfo } = useProjectsStore.getState();
    for (const p of projects) {
      if (p.is_git && !p.worktree_parent && !gi.has(p.path)) refreshGitInfo(p.path);
    }
  }, [projects]);

  const activeSort = nav.projectPath ? projectSort[nav.projectPath] ?? DEFAULT_WORKTREE_SORT : DEFAULT_WORKTREE_SORT;

  // The 'pr' sort needs to know which branches have an open PR — fetch them for
  // the project whose worktree list is on screen.
  useEffect(() => {
    if (nav.projectPath && activeSort === 'pr') refreshPrBranches(nav.projectPath);
  }, [nav.projectPath, activeSort, refreshPrBranches]);

  const projectRows = deriveProjectRows(projects, gitInfo, windows);
  const worktreeRows = nav.projectPath
    ? deriveWorktreeRows(gitInfo, windows, nav.projectPath, activeSort, prBranches.get(nav.projectPath))
    : [];
  const paneRows = nav.worktreePath ? derivePaneRows(windows, panes, nav.worktreePath) : [];

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
    if (st.tier === 'projects') return list.projectRows.length > 0;
    if (st.tier === 'worktrees') return list.worktreeRows.length > 0;
    return st.worktreePath != null; // panes tier: a pane or the empty worktree
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const st = useZenStore.getState();

      // ⌘P toggles the global jump palette in any mode.
      if (e.metaKey && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        if (st.paletteOpen) st.closePalette();
        else st.openPalette();
        return;
      }
      // ⌘K toggles contextual actions for the current selection.
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        if (st.actionMenuOpen) st.closeActionMenu();
        else if (hasActionTarget()) st.openActionMenu();
        return;
      }
      if (st.paletteOpen || st.actionMenuOpen) return; // an overlay owns the keyboard

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
      else if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); st.back(); }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [move, enterAtCursor, hasActionTarget]);

  // Drop Focus if the pane disappears (closed elsewhere).
  useEffect(() => {
    if (nav.focusedPaneId && !panes.get(nav.focusedPaneId)) useZenStore.getState().escapeFocus();
  }, [nav.focusedPaneId, panes]);

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
          ? { kind: 'project', path: projectRows[nav.cursor.projects].path, name: projectRows[nav.cursor.projects].name }
          : null
        : nav.tier === 'worktrees' && nav.projectPath
          ? worktreeRows[nav.cursor.worktrees]
            ? {
                kind: 'worktree',
                projectPath: nav.projectPath,
                path: worktreeRows[nav.cursor.worktrees].path,
                name: worktreeRows[nav.cursor.worktrees].name,
                isMain: worktreeRows[nav.cursor.worktrees].isMain,
              }
            : null
          : nav.worktreePath
            ? paneRows[nav.cursor.panes]
              ? { kind: 'pane', paneId: paneRows[nav.cursor.panes].paneId, info: paneRows[nav.cursor.panes].info, worktreePath: nav.worktreePath }
              : { kind: 'empty', worktreePath: nav.worktreePath }
            : null;

  const overlays = (
    <>
      {nav.paletteOpen && <ZenPalette />}
      {nav.actionMenuOpen && actionTarget && <ZenActionMenu target={actionTarget} />}
    </>
  );

  if (focusInfo && nav.worktreePath) {
    const ctx = resolveContext(projects, gitInfo, nav.worktreePath);
    return (
      <div className="flex h-screen w-screen flex-col bg-app font-ui text-ink">
        <ZenFocus info={focusInfo} projectName={ctx.projectName} worktreeName={ctx.worktreeName} />
        {overlays}
      </div>
    );
  }

  const projectName = nav.projectPath
    ? projectRows.find((r) => r.path === nav.projectPath)?.name ?? basename(nav.projectPath)
    : null;
  const worktreeName = nav.worktreePath
    ? worktreeRows.find((r) => r.path === nav.worktreePath)?.name ?? basename(nav.worktreePath)
    : null;
  const enterLabel = nav.tier === 'panes' ? '→ focus' : '→ enter';

  return (
    <div className="flex h-screen w-screen flex-col bg-app font-ui text-ink">
      <div className="flex flex-none items-center justify-between border-b border-line-soft px-[22px] py-4">
        <div className="flex items-center gap-2 font-mono text-[12px] text-ink-faint">
          <span>~</span>
          {projectName && (
            <>
              <span className="text-ink-ghost">›</span>
              <span className={nav.tier === 'worktrees' ? 'font-semibold text-ink' : ''}>{projectName}</span>
            </>
          )}
          {worktreeName && (
            <>
              <span className="text-ink-ghost">›</span>
              <span className="font-semibold text-ink">{worktreeName}</span>
            </>
          )}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-ghost">{TIER_LABEL[nav.tier]}</span>
      </div>

      <ZenTierList
        tier={nav.tier}
        projectRows={projectRows}
        worktreeRows={worktreeRows}
        paneRows={paneRows}
        cursor={nav.cursor[nav.tier]}
        onHover={onHover}
        onActivate={onActivate}
      />

      <div className="flex flex-none items-center gap-3.5 border-t border-line-soft px-[18px] py-2.5 font-mono text-[11px] text-ink-faint">
        <span className="rounded-md bg-ember-tint px-2 py-[3px] text-[10px] font-semibold tracking-[0.1em] text-ember">
          NAVIGATE
        </span>
        <span className="text-ink-dim">↑↓ move</span>
        <span className="text-ink-dim">{enterLabel}</span>
        <span className="text-ink-dim">← up</span>
        <span className="text-ink-dim">⌘K actions</span>
        <span className="text-ink-dim">⌘P jump</span>
        {nav.tier === 'panes' && (
          <>
            <span className="ml-auto text-ink-dim">⌘T new terminal</span>
            <span className="text-ink-dim">⌘⇧T new agent</span>
          </>
        )}
      </div>

      {overlays}
    </div>
  );
}
