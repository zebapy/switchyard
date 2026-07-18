import { useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useWorkspaceStore } from '../stores/workspace';
import { useProjectsStore } from '../stores/projects';
import { useUiStore } from '../stores/ui';
import { useZenStore } from './zenStore';
import { basename, paneLabel } from './zenData';
import { loadPrTemplate, renderPrPrompt } from '../components/GitPanel/createPr';
import { ZenMenu, type ZenMenuItem } from './ZenMenu';
import type { PaneInfo } from '../types/pane';
import type { PrInfo } from '../types/project';

/** What ⌘K acts on — derived from the current tier/cursor (or focused pane). */
export type ZenActionTarget =
  | { kind: 'projects' } // the project list itself (e.g. when it's empty)
  | { kind: 'project'; path: string; name: string; pinned: boolean }
  | { kind: 'worktree'; projectPath: string; path: string; name: string; branch: string | null; isMain: boolean; pinned: boolean; pr?: PrInfo }
  | { kind: 'pane'; paneId: string; info: PaneInfo; worktreePath: string }
  | { kind: 'empty'; worktreePath: string };

interface ZenAction {
  id: string;
  label: string;
  danger?: boolean;
  shortcut?: string;
  run: () => void;
}

export function spawnPane(worktreePath: string, kind: 'Shell' | 'Agent', command?: string) {
  const agent = kind === 'Agent' ? useProjectsStore.getState().agents[0]?.command : undefined;
  useWorkspaceStore.getState().addTab(worktreePath, basename(worktreePath), { kind, cwd: worktreePath, agent, command });
  const newId = useWorkspaceStore.getState().windows.get(worktreePath)?.activePaneId;
  if (newId) useZenStore.getState().focus(newId);
}

// Start a Create-PR agent chat in the worktree, seeded with the same prompt the
// Git panel uses, and focus it. Kept inside Zen (no goToWorkspace) so the flow
// stays in the single-focus layout.
function createPrInWorktree(worktreePath: string, branch: string | null, defaultBranch: string | null) {
  const agent = useProjectsStore.getState().agents[0]?.command;
  const prompt = renderPrPrompt(loadPrTemplate(), { branch, base: defaultBranch, files: [] });
  useWorkspaceStore.getState().addTab(worktreePath, basename(worktreePath), {
    kind: 'Agent',
    cwd: worktreePath,
    agent,
    command: prompt,
    label: 'Create PR',
  });
  const newId = useWorkspaceStore.getState().windows.get(worktreePath)?.activePaneId;
  if (newId) useZenStore.getState().focus(newId);
}

async function addFolderAsProject() {
  const sel = await open({ directory: true, multiple: false, title: 'Select project folder' });
  if (typeof sel === 'string') await useProjectsStore.getState().addProjectPath(sel);
}

async function archive(projectPath: string, name: string) {
  const ps = useProjectsStore.getState();
  const status = await ps.getWorktreeArchiveStatus(projectPath, name).catch(() => null);
  if (!status?.can_archive) {
    alert(status?.blocked_reason ?? 'This worktree can’t be archived.');
    return;
  }
  const dirty = status.uncommitted_added + status.uncommitted_deleted;
  const warning = dirty > 0 ? `\n\n${dirty} uncommitted line(s) will be discarded.` : '';
  if (!confirm(`Archive worktree “${name}”? Its working directory is removed; the branch is kept.${warning}`)) return;
  await ps.archiveWorktree(projectPath, name);
  useZenStore.getState().back();
}

// Always available, regardless of what's selected — the in-Zen way back to the
// standard layout (formerly the jump palette's "Exit Zen Mode" entry).
const exitZenAction: ZenAction = {
  id: 'exit-zen',
  label: 'Exit Zen Mode',
  run: () => {
    void useWorkspaceStore.getState().saveSession();
    useUiStore.getState().setZenMode(false);
  },
};

// `id: 'rename'` is handled inline by the component; the rest run on select.
function actionsFor(target: ZenActionTarget): ZenAction[] {
  const ws = () => useWorkspaceStore.getState();
  const zen = () => useZenStore.getState();

  const addProjectAction: ZenAction = {
    id: 'add-project',
    label: 'Add folder as project…',
    run: () => { void addFolderAsProject(); },
  };

  if (target.kind === 'projects') {
    return [addProjectAction];
  }

  if (target.kind === 'project') {
    return [
      { id: 'open', label: 'Open', run: () => zen().enterProject(target.path) },
      {
        id: 'pin',
        label: target.pinned ? 'Unpin project' : 'Pin project',
        run: () => { void useProjectsStore.getState().togglePin(target.path); },
      },
      addProjectAction,
    ];
  }

  if (target.kind === 'worktree') {
    const actions: ZenAction[] = [
      { id: 'open', label: 'Open', run: () => zen().enterWorktree(target.path) },
      { id: 'view-diff', label: 'View diff…', run: () => zen().openDiff(target.path) },
    ];
    // The root/main worktree is pinned to the top implicitly and can't be toggled.
    if (!target.isMain) {
      actions.push({
        id: 'pin',
        label: target.pinned ? 'Unpin workspace' : 'Pin workspace',
        run: () => { void useProjectsStore.getState().togglePin(target.path); },
      });
    }
    // View any existing PR (open, merged, or closed); offer to create one
    // whenever there is no *open* PR for the branch.
    if (target.pr) {
      const prUrl = target.pr.url;
      const state = target.pr.state.toLowerCase();
      const stateLabel = state === 'open' ? '' : ` (${state})`;
      actions.push({
        id: 'open-pr',
        label: `Open pull request #${target.pr.number}${stateLabel} on GitHub`,
        run: () => { void openUrl(prUrl); },
      });
    }
    if (target.pr?.state?.toUpperCase() !== 'OPEN') {
      const defaultBranch = useProjectsStore.getState().gitInfo.get(target.projectPath)?.branch ?? null;
      actions.push({
        id: 'create-pr',
        label: 'Create pull request…',
        run: () => createPrInWorktree(target.path, target.branch, defaultBranch),
      });
    }
    if (!target.isMain) {
      actions.push({
        id: 'archive',
        label: 'Archive worktree',
        danger: true,
        run: () => { void archive(target.projectPath, basename(target.path)); },
      });
    }
    return actions;
  }

  // New agent / new terminal moved to the panes footer cluster (see ZenApp).
  if (target.kind === 'empty') {
    return [];
  }

  const { paneId } = target;
  return [
    { id: 'rename', label: 'Rename', run: () => {} },
    { id: 'detach', label: 'Detach (keep tmux session alive)', run: () => { void ws().detachPane(paneId); zen().escapeFocus(); } },
    { id: 'close', label: 'Close', danger: true, run: () => { void ws().closePane(paneId); zen().escapeFocus(); } },
  ];
}

function targetTitle(target: ZenActionTarget): string {
  if (target.kind === 'projects') return 'Projects';
  if (target.kind === 'pane') return paneLabel(target.info);
  if (target.kind === 'empty') return basename(target.worktreePath);
  return target.name;
}

// Anchored above the bottom-right "⌘K actions" button — the card's bottom-right
// corner hugs the button and the list grows up/leftward, staying in the window.
const scrimClass = 'fixed inset-0 z-[200] flex items-end justify-end bg-[rgba(6,7,9,0.2)] pb-[58px] pr-[18px] backdrop-blur-[3px]';
const cardClass = 'flex max-h-[60vh] w-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]';
const headerClass = 'border-b border-line px-[18px] py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-ghost';

function RenamePane({ info, paneId, title, onDone }: { info: PaneInfo; paneId: string; title: string; onDone: () => void }) {
  const [value, setValue] = useState(info.customName ?? info.title ?? '');
  return (
    <div className={scrimClass} onClick={onDone}>
      <form
        className={cardClass}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const name = value.trim();
          if (name) useWorkspaceStore.getState().setPaneName(paneId, name);
          onDone();
        }}
      >
        <div className={headerClass}>Rename · {title}</div>
        <input
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onDone(); } }}
          placeholder="New name…"
          className="w-full bg-transparent px-[18px] py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-ghost"
        />
      </form>
    </div>
  );
}

export function ZenActionMenu({ target }: { target: ZenActionTarget }) {
  const closeActionMenu = useZenStore((s) => s.closeActionMenu);
  const [renaming, setRenaming] = useState(false);

  const items = useMemo<ZenMenuItem[]>(
    () =>
      [...actionsFor(target), exitZenAction].map((action) => ({
        id: action.id,
        label: action.label,
        shortcut: action.shortcut,
        danger: action.danger,
        onSelect: () => {
          if (action.id === 'rename') { setRenaming(true); return; }
          action.run();
          closeActionMenu();
        },
      })),
    [target, closeActionMenu],
  );

  if (renaming && target.kind === 'pane') {
    return (
      <RenamePane
        info={target.info}
        paneId={target.paneId}
        title={targetTitle(target)}
        onDone={closeActionMenu}
      />
    );
  }

  return (
    <ZenMenu
      label="Zen actions"
      anchor="bottom-right"
      width={420}
      items={items}
      onClose={closeActionMenu}
      emptyText="No matching actions"
    />
  );
}
