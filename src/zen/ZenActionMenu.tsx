import { useMemo, useState } from 'react';
import { Command as Cmdk } from 'cmdk';
import { useWorkspaceStore } from '../stores/workspace';
import { useProjectsStore } from '../stores/projects';
import { useZenStore } from './zenStore';
import { basename, paneLabel } from './zenData';
import { WORKTREE_SORT_OPTIONS, DEFAULT_WORKTREE_SORT } from '../types/project';
import type { PaneInfo } from '../types/pane';

/** What ⌘K acts on — derived from the current tier/cursor (or focused pane). */
export type ZenActionTarget =
  | { kind: 'project'; path: string; name: string }
  | { kind: 'worktree'; projectPath: string; path: string; name: string; isMain: boolean }
  | { kind: 'pane'; paneId: string; info: PaneInfo; worktreePath: string }
  | { kind: 'empty'; worktreePath: string };

interface ZenAction {
  id: string;
  label: string;
  danger?: boolean;
  shortcut?: string;
  run: () => void;
}

const kbdClass =
  'ml-auto rounded-[5px] border border-line bg-app px-1.5 py-px font-mono text-[11px] leading-none text-ink-faint';

export function spawnPane(worktreePath: string, kind: 'Shell' | 'Agent') {
  const agent = kind === 'Agent' ? useProjectsStore.getState().agents[0]?.command : undefined;
  useWorkspaceStore.getState().addTab(worktreePath, basename(worktreePath), { kind, cwd: worktreePath, agent });
  const newId = useWorkspaceStore.getState().windows.get(worktreePath)?.activePaneId;
  if (newId) useZenStore.getState().focus(newId);
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

// View-level actions on a project's worktree list — reorder the list the same
// way the sidebar's sort button does. Distinct from the selected worktree's own
// item actions (open, archive), which sit above these.
function sortActionsFor(projectPath: string): ZenAction[] {
  const current = useProjectsStore.getState().projectSort[projectPath] ?? DEFAULT_WORKTREE_SORT;
  return WORKTREE_SORT_OPTIONS.map((option) => ({
    id: `sort-${option.value}`,
    label: `Sort worktrees by ${option.label}${option.value === current ? ' ✓' : ''}`,
    run: () => { void useProjectsStore.getState().setProjectSort(projectPath, option.value); },
  }));
}

// `id: 'rename'` is handled inline by the component; the rest run on select.
function actionsFor(target: ZenActionTarget): ZenAction[] {
  const ws = () => useWorkspaceStore.getState();
  const zen = () => useZenStore.getState();

  if (target.kind === 'project') {
    return [{ id: 'open', label: 'Open', run: () => zen().enterProject(target.path) }];
  }

  if (target.kind === 'worktree') {
    const actions: ZenAction[] = [{ id: 'open', label: 'Open', run: () => zen().enterWorktree(target.path) }];
    if (!target.isMain) {
      actions.push({
        id: 'archive',
        label: 'Archive worktree',
        danger: true,
        run: () => { void archive(target.projectPath, basename(target.path)); },
      });
    }
    actions.push(...sortActionsFor(target.projectPath));
    return actions;
  }

  if (target.kind === 'empty') {
    return [
      { id: 'new-term', label: 'New terminal', shortcut: '⌘T', run: () => spawnPane(target.worktreePath, 'Shell') },
      { id: 'new-chat', label: 'New chat', shortcut: '⌘⇧T', run: () => spawnPane(target.worktreePath, 'Agent') },
    ];
  }

  const { paneId, worktreePath } = target;
  return [
    { id: 'rename', label: 'Rename', run: () => {} },
    { id: 'new-term', label: 'New terminal', shortcut: '⌘T', run: () => spawnPane(worktreePath, 'Shell') },
    { id: 'new-chat', label: 'New chat', shortcut: '⌘⇧T', run: () => spawnPane(worktreePath, 'Agent') },
    { id: 'detach', label: 'Detach (keep tmux session alive)', run: () => { void ws().detachPane(paneId); zen().escapeFocus(); } },
    { id: 'close', label: 'Close', danger: true, run: () => { void ws().closePane(paneId); zen().escapeFocus(); } },
  ];
}

function targetTitle(target: ZenActionTarget): string {
  if (target.kind === 'pane') return paneLabel(target.info);
  if (target.kind === 'empty') return basename(target.worktreePath);
  return target.name;
}

const scrimClass = 'fixed inset-0 z-[200] flex items-start justify-center bg-[rgba(6,7,9,0.6)] pt-[12vh] backdrop-blur-[3px]';
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
  const actions = useMemo(() => actionsFor(target), [target]);

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
    <div className={scrimClass} onClick={closeActionMenu}>
      <Cmdk
        label="Zen actions"
        loop
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeActionMenu(); } }}
        className={cardClass}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={headerClass}>{targetTitle(target)}</div>
        <Cmdk.Input
          autoFocus
          placeholder="Action…"
          className="w-full border-b border-line bg-transparent px-[18px] py-3 text-[14px] text-ink outline-none placeholder:text-ink-ghost"
        />
        <Cmdk.List className="scroll-thin overflow-y-auto p-1.5">
          <Cmdk.Empty className="p-[18px] text-center text-[13px] text-ink-ghost">No matching actions</Cmdk.Empty>
          {actions.map((action) => (
            <Cmdk.Item
              key={action.id}
              value={action.label}
              onSelect={() => {
                if (action.id === 'rename') { setRenaming(true); return; }
                action.run();
                closeActionMenu();
              }}
              className={`flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-[9px] text-[13px] data-[selected=true]:bg-ember-tint ${
                action.danger ? 'text-del' : 'text-ink'
              }`}
            >
              {action.label}
              {action.shortcut && <kbd className={kbdClass}>{action.shortcut}</kbd>}
            </Cmdk.Item>
          ))}
        </Cmdk.List>
      </Cmdk>
    </div>
  );
}
