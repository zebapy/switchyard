import { useMemo } from 'react';
import { useZenStore } from './zenStore';
import { basename } from './zenData';
import { ZenMenu, type ZenMenuItem } from './ZenMenu';
import { ZenActionsCluster, ZenKeyCaps, clusterClass, actionClass } from './ZenActionsCluster';
import { useDefaultBranch } from '../components/GitPanel/useGitData';
import type { DiffSource } from '../types/gitpanel';

/**
 * The diff view's chrome, rendered inside Zen's shared top band (not a second
 * bar of its own — that left a gap). Carries Back (← / Esc), the file
 * breadcrumb, and the ⌘P source picker (unstaged / staged / vs base branch).
 */
export function ZenDiffToolbar({ path }: { path: string }) {
  const closeDiff = useZenStore((s) => s.closeDiff);
  const source = useZenStore((s) => s.diffSource);
  const setDiffSource = useZenStore((s) => s.setDiffSource);
  const pickerOpen = useZenStore((s) => s.diffPickerOpen);
  const openDiffPicker = useZenStore((s) => s.openDiffPicker);
  const closeDiffPicker = useZenStore((s) => s.closeDiffPicker);
  const defaultBranch = useDefaultBranch(path);

  const sourceOptions = useMemo(
    () => [
      { value: 'base' as const, label: `Vs ${defaultBranch ?? 'base branch'}` },
      { value: 'unstaged' as const, label: 'Working tree' },
      { value: 'staged' as const, label: 'Staged' },
    ],
    [defaultBranch],
  );
  const currentLabel = sourceOptions.find((o) => o.value === source)?.label ?? source;

  const pickerItems: ZenMenuItem[] = sourceOptions.map((o) => ({
    id: o.value,
    label: o.label,
    active: o.value === source,
    onSelect: () => setDiffSource(o.value as DiffSource),
  }));

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center pl-3">
        <div className={clusterClass}>
          <button
            type="button"
            onClick={closeDiff}
            title="Back to worktree (Esc)"
            aria-label="Back to worktree"
            className={`${actionClass} text-ink-dim hover:text-ink`}
          >
            <ZenKeyCaps keys="←" />
            <span className="truncate">Back</span>
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 font-mono text-[12px] text-ink-faint">
        <span className="text-ink-dim">Diff</span>
        <span className="text-ink-ghost">›</span>
        <span className="truncate font-semibold text-ink">{basename(path)}</span>
        <span className="hidden text-ink-ghost sm:inline">· hover a line to comment</span>
      </div>

      <div className="flex flex-1 justify-end">
        <ZenActionsCluster
          actions={[
            {
              keys: '⌘P',
              label: currentLabel,
              onClick: openDiffPicker,
              title: 'Change what the diff is against (⌘P)',
            },
          ]}
        />
      </div>

      {pickerOpen && (
        <ZenMenu
          label="Diff source"
          anchor="top-right"
          items={pickerItems}
          onClose={closeDiffPicker}
          emptyText="No sources"
        />
      )}
    </>
  );
}
