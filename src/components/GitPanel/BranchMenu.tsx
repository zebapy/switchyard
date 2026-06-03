import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Combobox } from '@base-ui-components/react/combobox';
import { useProjectsStore } from '../../stores/projects';
import { ChevronIcon, CheckIcon } from '../icons';

interface BranchMenuProps {
  /** Worktree path whose branch is shown and switched. `null` when no workspace is open. */
  path: string | null;
  /** Currently checked-out branch, or `null` if undetectable. */
  branch: string | null;
  /** Called after a successful switch, for callers that need to react (optional). */
  onSwitched?: () => void;
}

const triggerClass =
  'group flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left ' +
  'transition-colors hover:bg-hover data-[popup-open]:bg-hover';
const popupClass =
  'z-[300] flex w-[var(--anchor-width)] min-w-[220px] max-w-[340px] flex-col rounded-[10px] ' +
  'border border-line bg-side p-[5px] font-ui text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const inputClass =
  'mb-[5px] w-full rounded-[7px] border border-line bg-base px-[9px] py-[6px] text-[13px] ' +
  'text-ink placeholder:text-ink-faint outline-none focus:border-ember-edge';
const itemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';

/** The branch name in the workspace header, as a searchable dropdown that
 *  switches the worktree's checked-out branch. */
export function BranchMenu({ path, branch, onSwitched }: BranchMenuProps) {
  const refreshGitInfoForPath = useProjectsStore((s) => s.refreshGitInfoForPath);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');

  if (!path) {
    return <span className="truncate font-mono text-[13px] text-ink-dim">{branch ?? 'No branch'}</span>;
  }

  const loadBranches = () => {
    setLoading(true);
    setError('');
    invoke<string[]>('git_local_branches', { path })
      .then(setBranches)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  const handleValueChange = (next: string | null) => {
    if (!next || next === branch || switching) return;
    setError('');
    setSwitching(true);
    invoke('git_checkout_branch', { path, branch: next })
      .then(() => refreshGitInfoForPath(path))
      .then(() => onSwitched?.())
      .catch((e) => setError(String(e)))
      .finally(() => setSwitching(false));
  };

  return (
    <Combobox.Root
      items={branches}
      value={branch}
      onValueChange={handleValueChange}
      onOpenChange={(open) => {
        if (open) loadBranches();
      }}
      autoHighlight
    >
      <Combobox.Trigger
        title={branch ? `On branch ${branch} — click to switch` : 'Switch branch'}
        aria-label="Switch branch"
        disabled={switching}
        className={triggerClass}
      >
        <span className="min-w-0 truncate font-mono text-[13px] text-ink-dim group-hover:text-ink">
          {branch ?? 'No branch'}
        </span>
        <ChevronIcon size={9} className="flex-none rotate-90 text-ink-faint group-hover:text-ink-dim" />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner className="z-[300]" sideOffset={4} align="start">
          <Combobox.Popup className={popupClass}>
            <Combobox.Input placeholder="Search branches…" className={inputClass} />

            {error && <div className="px-[9px] py-[6px] text-[12px] text-del">{error}</div>}

            {loading ? (
              <div className="px-[9px] py-[7px] text-[12px] text-ink-faint">Loading branches…</div>
            ) : (
              <>
                <Combobox.Empty className="px-[9px] py-[7px] text-[12px] text-ink-faint">
                  No branches found
                </Combobox.Empty>
                <Combobox.List className="scroll-thin max-h-[280px] overflow-y-auto">
                  {(item: string, index: number) => (
                    <Combobox.Item key={item} value={item} index={index} className={itemClass}>
                      <span className="grid w-4 flex-none place-items-center text-ember">
                        {item === branch && <CheckIcon size={13} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{item}</span>
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
