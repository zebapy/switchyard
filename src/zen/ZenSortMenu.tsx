import { useMemo } from 'react';
import { useProjectsStore } from '../stores/projects';
import { useZenStore } from './zenStore';
import type { ZenTier } from './zenStore';
import { ZenMenu, type ZenMenuItem } from './ZenMenu';
import {
  WORKTREE_SORT_OPTIONS,
  PROJECT_LIST_SORT_OPTIONS,
  PANE_SORT_OPTIONS,
  DEFAULT_WORKTREE_SORT,
} from '../types/project';

interface SortOption {
  value: string;
  label: string;
}

/** The sort options + current value + setter for the tier the cursor is on. */
function useTierSort(tier: ZenTier, projectPath: string | null): {
  options: SortOption[];
  current: string;
  choose: (value: string) => void;
} {
  const projectListSort = useProjectsStore((s) => s.projectListSort);
  const paneSort = useProjectsStore((s) => s.paneSort);
  const projectSort = useProjectsStore((s) => (projectPath ? s.projectSort[projectPath] : undefined));

  if (tier === 'projects') {
    return {
      options: PROJECT_LIST_SORT_OPTIONS,
      current: projectListSort,
      choose: (value) => { void useProjectsStore.getState().setProjectListSort(value as never); },
    };
  }
  if (tier === 'worktrees') {
    return {
      options: WORKTREE_SORT_OPTIONS,
      current: projectSort ?? DEFAULT_WORKTREE_SORT,
      choose: (value) => {
        if (projectPath) void useProjectsStore.getState().setProjectSort(projectPath, value as never);
      },
    };
  }
  return {
    options: PANE_SORT_OPTIONS,
    current: paneSort,
    choose: (value) => { void useProjectsStore.getState().setPaneSort(value as never); },
  };
}

/**
 * The context-aware sort menu behind the toolbar's ⇅ button (and ⌘P). Shows the
 * sort options for whichever tier the cursor is on — projects, workspaces, or
 * panes — with the active one checked. Choosing one persists it and closes.
 */
export function ZenSortMenu({ tier, projectPath }: { tier: ZenTier; projectPath: string | null }) {
  const closeSortMenu = useZenStore((s) => s.closeSortMenu);
  const { options, current, choose } = useTierSort(tier, projectPath);

  const items = useMemo<ZenMenuItem[]>(
    () =>
      options.map((option) => ({
        id: option.value,
        label: option.label,
        active: option.value === current,
        onSelect: () => { choose(option.value); closeSortMenu(); },
      })),
    [options, current, choose, closeSortMenu],
  );

  return (
    <ZenMenu
      label="Zen sort"
      anchor="top-right"
      items={items}
      onClose={closeSortMenu}
      emptyText="No matching sorts"
    />
  );
}
