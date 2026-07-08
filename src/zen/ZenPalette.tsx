import { useMemo } from 'react';
import { Command as Cmdk } from 'cmdk';
import { useWorkspaceStore } from '../stores/workspace';
import { useProjectsStore } from '../stores/projects';
import { useUiStore } from '../stores/ui';
import { useZenStore } from './zenStore';
import { deriveWorktreeRows, derivePaneRows, resolveContext, paneLabel } from './zenData';
import { DEFAULT_WORKTREE_SORT } from '../types/project';

interface ZenTarget {
  id: string;
  label: string;
  hint: string;
  category: 'Pane' | 'Workspace' | 'Zen';
  searchText: string;
  action: () => void;
}

/** The owning top-level project path for a window key (root, worktree, or child). */
function ownerProjectPath(projects: { path: string }[], gitInfo: Map<string, { worktrees: { path: string }[] }>, windowPath: string): string {
  for (const p of projects) {
    if (p.path === windowPath) return p.path;
    if (gitInfo.get(p.path)?.worktrees.some((w) => w.path === windowPath)) return p.path;
  }
  return projects.find((p) => windowPath.startsWith(`${p.path}/`))?.path ?? windowPath;
}

export function ZenPalette() {
  const projects = useProjectsStore((s) => s.projects).filter((p) => !p.worktree_parent);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const projectSort = useProjectsStore((s) => s.projectSort);
  const windows = useWorkspaceStore((s) => s.windows);
  const panes = useWorkspaceStore((s) => s.panes);
  const closePalette = useZenStore((s) => s.closePalette);

  const targets = useMemo<ZenTarget[]>(() => {
    const out: ZenTarget[] = [];

    // Every open pane, flattened across windows.
    for (const win of windows.values()) {
      const ctx = resolveContext(projects, gitInfo, win.projectPath);
      const project = ownerProjectPath(projects, gitInfo, win.projectPath);
      for (const { paneId, info } of derivePaneRows(windows, panes, win.projectPath)) {
        const label = paneLabel(info);
        out.push({
          id: `pane-${paneId}`,
          label,
          hint: `${ctx.projectName} / ${ctx.worktreeName}`,
          category: 'Pane',
          searchText: `${label} ${ctx.projectName} ${ctx.worktreeName}`,
          action: () => {
            useWorkspaceStore.getState().focusPane(paneId);
            useZenStore.getState().jumpToPane(project, win.projectPath, paneId);
          },
        });
      }
    }

    // Every worktree across projects (jump to its pane tier).
    for (const p of projects) {
      for (const wt of deriveWorktreeRows(gitInfo, windows, p.path, projectSort[p.path] ?? DEFAULT_WORKTREE_SORT)) {
        out.push({
          id: `wt-${wt.path}`,
          label: wt.name,
          hint: p.name,
          category: 'Workspace',
          searchText: `${wt.name} ${p.name} ${wt.path}`,
          action: () => useZenStore.getState().jumpToWorktree(p.path, wt.path),
        });
      }
    }

    out.push({
      id: 'exit-zen',
      label: 'Exit Zen Mode',
      hint: 'return to standard layout',
      category: 'Zen',
      searchText: 'exit zen mode standard layout',
      action: () => {
        void useWorkspaceStore.getState().saveSession();
        useUiStore.getState().setZenMode(false);
      },
    });

    return out;
  }, [projects, gitInfo, windows, panes, projectSort]);

  const groups = useMemo(() => {
    const order: ZenTarget['category'][] = ['Pane', 'Workspace', 'Zen'];
    return order
      .map((category) => ({ category, items: targets.filter((t) => t.category === category) }))
      .filter((g) => g.items.length > 0);
  }, [targets]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-[rgba(6,7,9,0.6)] pt-[12vh] backdrop-blur-[3px]"
      onClick={closePalette}
    >
      <Cmdk
        label="Zen jump palette"
        loop
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closePalette(); } }}
        className="flex max-h-[60vh] w-[540px] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Cmdk.Input
          autoFocus
          placeholder="Jump to a pane, workspace, or project…"
          className="w-full border-b border-line bg-transparent px-[18px] py-3.5 text-[15px] text-ink outline-none placeholder:text-ink-ghost"
        />
        <Cmdk.List className="scroll-thin overflow-y-auto p-1.5">
          <Cmdk.Empty className="p-[18px] text-center text-[13px] text-ink-ghost">No matching results</Cmdk.Empty>
          {groups.map(({ category, items }) => (
            <Cmdk.Group
              key={category}
              heading={category}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-ink-ghost"
            >
              {items.map((t) => (
                <Cmdk.Item
                  key={t.id}
                  value={t.searchText}
                  onSelect={() => { t.action(); closePalette(); }}
                  className="flex cursor-pointer items-center gap-3 rounded-[9px] px-3 py-[9px] data-[selected=true]:bg-ember-tint"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t.label}</span>
                  <span className="flex-none truncate pl-3 text-[12px] text-ink-ghost">{t.hint}</span>
                </Cmdk.Item>
              ))}
            </Cmdk.Group>
          ))}
        </Cmdk.List>
      </Cmdk>
    </div>
  );
}
