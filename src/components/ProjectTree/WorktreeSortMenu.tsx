import { ContextMenu } from '@base-ui-components/react/context-menu';
import { CheckIcon, ChevronIcon, SortIcon } from '../icons';
import { WORKTREE_SORT_OPTIONS, type WorktreeSort } from '../../types/project';

const submenuPopupClass =
  'z-[300] min-w-[160px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const triggerClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink ' +
  'data-[popup-open]:bg-hover data-[popup-open]:text-ink';
const radioItemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';
const iconClass = 'grid w-4 place-items-center text-ink-faint';

interface WorktreeSortMenuProps {
  /** Currently active sort for the project. */
  sort: WorktreeSort;
  /** Called with the chosen sort when the user picks one. */
  onSelect: (sort: WorktreeSort) => void;
}

/** "Sort worktrees by" submenu for a project's context menu. */
export function WorktreeSortMenu({ sort, onSelect }: WorktreeSortMenuProps) {
  return (
    <ContextMenu.SubmenuRoot>
      <ContextMenu.SubmenuTrigger className={triggerClass}>
        <span className={iconClass}><SortIcon size={14} /></span>
        <span className="flex-1">Sort worktrees by</span>
        <ChevronIcon size={12} className="text-ink-faint" />
      </ContextMenu.SubmenuTrigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-[300]" sideOffset={2}>
          <ContextMenu.Popup className={submenuPopupClass}>
            <ContextMenu.RadioGroup
              value={sort}
              onValueChange={(value) => onSelect(value as WorktreeSort)}
            >
              {WORKTREE_SORT_OPTIONS.map((option) => (
                <ContextMenu.RadioItem
                  key={option.value}
                  value={option.value}
                  closeOnClick
                  className={radioItemClass}
                >
                  <span className="grid w-4 place-items-center text-ember">
                    <ContextMenu.RadioItemIndicator>
                      <CheckIcon size={13} />
                    </ContextMenu.RadioItemIndicator>
                  </span>
                  <span className="flex-1">{option.label}</span>
                </ContextMenu.RadioItem>
              ))}
            </ContextMenu.RadioGroup>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.SubmenuRoot>
  );
}
