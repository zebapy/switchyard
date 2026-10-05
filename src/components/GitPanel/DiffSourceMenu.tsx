import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Combobox } from '@base-ui-components/react/combobox';
import type { DiffSource } from '../../types/gitpanel';
import { CheckIcon, ChevronIcon } from '../icons';

/** What the panel's diff is against: a working-tree source, or a compare branch. */
export interface DiffTarget {
  source: DiffSource;
  /** Compare branch for a `base` diff; `null` for unstaged/staged. */
  branch: string | null;
}

interface DiffSourceOption extends DiffTarget {
  id: string;
  label: string;
  /** Why this branch is suggested ("PR base", "default"). */
  hint: string | null;
}

interface DiffSourceMenuProps {
  /** Repo root — its local branches fill the compare list. */
  path: string;
  value: DiffTarget;
  /** The open PR's base branch, if the worktree has one. */
  prBase: string | null;
  defaultBranch: string | null;
  onValueChange: (next: DiffTarget) => void;
}

const triggerClass =
  'group flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left text-[11.5px] ' +
  'text-ink-dim transition-colors hover:bg-hover hover:text-ink data-[popup-open]:bg-hover';
const popupClass =
  'z-[300] flex w-[var(--anchor-width)] min-w-[220px] max-w-[340px] flex-col rounded-[10px] ' +
  'border border-line bg-side p-[5px] font-ui text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const inputClass =
  'mb-[5px] w-full rounded-[7px] border border-line bg-base px-[9px] py-[6px] text-[13px] ' +
  'text-ink placeholder:text-ink-faint outline-none focus:border-ember-edge';
const itemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[6px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';

const WORKING_TREE_OPTIONS: DiffSourceOption[] = [
  { id: 'unstaged', label: 'Unstaged', source: 'unstaged', branch: null, hint: null },
  { id: 'staged', label: 'Staged', source: 'staged', branch: null, hint: null },
];

function branchOption(branch: string | null, hint: string | null): DiffSourceOption {
  return { id: `base:${branch}`, label: `vs ${branch ?? 'base branch'}`, source: 'base', branch, hint };
}

/** Suggested compare branches first (PR base, then default), then every other local branch. */
function buildOptions({
  prBase,
  defaultBranch,
  branches,
}: {
  prBase: string | null;
  defaultBranch: string | null;
  branches: string[];
}): DiffSourceOption[] {
  const suggested: DiffSourceOption[] = [];
  if (prBase) suggested.push(branchOption(prBase, 'PR base'));
  if (defaultBranch && defaultBranch !== prBase) suggested.push(branchOption(defaultBranch, 'default'));
  const suggestedNames = new Set(suggested.map((option) => option.branch));
  const rest = branches.filter((name) => !suggestedNames.has(name)).map((name) => branchOption(name, null));
  return [...WORKING_TREE_OPTIONS, ...suggested, ...rest];
}

function optionId(target: DiffTarget): string {
  if (target.source === 'base') return `base:${target.branch}`;
  return target.source;
}

/** The Git panel's diff picker: unstaged, staged, or vs any branch (PR base suggested first). */
export function DiffSourceMenu({ path, value, prBase, defaultBranch, onValueChange }: DiffSourceMenuProps) {
  const [branches, setBranches] = useState<string[]>([]);
  const [error, setError] = useState('');

  const options = buildOptions({ prBase, defaultBranch, branches });
  const selectedId = optionId(value);
  const selected = options.find((option) => option.id === selectedId) ?? branchOption(value.branch, null);

  const loadBranches = () => {
    setError('');
    invoke<string[]>('git_local_branches', { path })
      .then(setBranches)
      .catch((e) => setError(`Couldn't list branches: ${String(e)}`));
  };

  const handleValueChange = (next: DiffSourceOption | null) => {
    if (!next) return;
    onValueChange({ source: next.source, branch: next.branch });
  };

  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={handleValueChange}
      onOpenChange={(open) => {
        if (open) loadBranches();
      }}
      itemToStringLabel={(option: DiffSourceOption) => option.label}
      isItemEqualToValue={(a: DiffSourceOption, b: DiffSourceOption) => a.id === b.id}
      autoHighlight
    >
      <Combobox.Trigger title="Choose what the diff is against" aria-label="Diff source" className={triggerClass}>
        <span className="min-w-0 flex-1 truncate">{selected.label}</span>
        <ChevronIcon size={9} className="flex-none rotate-90 text-ink-faint group-hover:text-ink-dim" />
      </Combobox.Trigger>

      <Combobox.Portal>
        <Combobox.Positioner className="z-[300]" sideOffset={4} align="start">
          <Combobox.Popup className={popupClass}>
            <Combobox.Input placeholder="Search branches…" className={inputClass} />

            {error && <div className="px-[9px] py-[6px] text-[12px] text-del">{error}</div>}

            <Combobox.Empty className="px-[9px] py-[7px] text-[12px] text-ink-faint">No branches found</Combobox.Empty>
            <Combobox.List className="scroll-thin max-h-[300px] overflow-y-auto">
              {(option: DiffSourceOption, index: number) => (
                <Combobox.Item key={option.id} value={option} index={index} className={itemClass}>
                  <span className="grid w-4 flex-none place-items-center text-ember">
                    {option.id === selectedId && <CheckIcon size={13} />}
                  </span>
                  <span
                    className={
                      'min-w-0 flex-1 truncate text-[12.5px] ' + (option.source === 'base' ? 'font-mono' : '')
                    }
                  >
                    {option.label}
                  </span>
                  {option.hint && <span className="flex-none text-[11px] text-ink-faint">{option.hint}</span>}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
