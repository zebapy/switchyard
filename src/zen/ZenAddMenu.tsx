import { useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../stores/projects';
import { useZenStore, type ZenTier } from './zenStore';
import { spawnPaneAt } from './ZenActionMenu';
import { ZenNewWorktreeMenu } from './ZenNewWorktreeMenu';
import { ZenMenu, type ZenMenuItem } from './ZenMenu';

async function addFolderAsProject() {
  const sel = await open({ directory: true, multiple: false, title: 'Select project folder' });
  if (typeof sel === 'string') await useProjectsStore.getState().addProjectPath(sel);
}

interface AddItem {
  id: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

/**
 * The items the bottom-left "New…" menu offers for the current tier: a new
 * session in the selected workspace, plus add-a-project on the Projects tier
 * (where the selected row is a project and its own main workspace).
 */
function addItemsFor(tier: ZenTier, spawnPath: string | null): AddItem[] {
  const addProject: AddItem = {
    id: 'add-project',
    label: 'Add folder as project…',
    run: () => { void addFolderAsProject(); },
  };

  if (!spawnPath) return [addProject];

  const target =
    tier === 'projects'
      ? { projectPath: spawnPath, worktreePath: spawnPath }
      : { worktreePath: spawnPath };
  const sessions: AddItem[] = [
    { id: 'new-chat', label: 'New agent', shortcut: '⌘⇧T', run: () => spawnPaneAt({ ...target, kind: 'Agent' }) },
    { id: 'new-term', label: 'New terminal', shortcut: '⌘T', run: () => spawnPaneAt({ ...target, kind: 'Shell' }) },
  ];
  return tier === 'projects' ? [...sessions, addProject] : sessions;
}

/** The menu header / trigger label names the tier it acts in — matching the tier list. */
export const TIER_TITLE: Record<ZenTier, string> = {
  projects: 'Projects',
  worktrees: 'Workspaces',
  panes: 'Panes',
};

/**
 * Context-aware "new" menu behind the footer's bottom-left button (and ⌘⇧K).
 * Anchored bottom-left — the card's bottom-left corner hugs the button and the
 * list grows up/rightward, mirroring ZenActionMenu's bottom-right anchor.
 */
export function ZenAddMenu({ tier, spawnPath, projectPath }: { tier: ZenTier; spawnPath: string | null; projectPath: string | null }) {
  const closeAddMenu = useZenStore((s) => s.closeAddMenu);

  const items = useMemo<ZenMenuItem[]>(
    () =>
      addItemsFor(tier, spawnPath).map((item) => ({
        id: item.id,
        label: item.label,
        shortcut: item.shortcut,
        onSelect: () => { item.run(); closeAddMenu(); },
      })),
    [tier, spawnPath, closeAddMenu],
  );

  // On the Workspaces tier the "New…" menu grows into worktree creation (quick,
  // or seeded from Linear / a GitHub PR / a branch), handled by its own stateful
  // component. Other tiers keep the simple static list above.
  if (tier === 'worktrees' && projectPath) {
    return <ZenNewWorktreeMenu projectPath={projectPath} />;
  }

  return (
    <ZenMenu
      label="Zen new"
      anchor="bottom-left"
      items={items}
      onClose={closeAddMenu}
      emptyText="Nothing to add"
    />
  );
}
