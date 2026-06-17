import { Menu } from '@base-ui-components/react/menu';
import { Tooltip } from '../Tooltip';
import { CheckIcon, SortIcon } from '../icons';
import { WORKTREE_SORT_OPTIONS, type WorktreeSort } from '../../types/project';

const menuPopupClass =
  'z-[300] min-w-[150px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const radioItemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';
const buttonClass =
  'grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-md text-ink-faint ' +
  'opacity-0 transition group-hover:opacity-100 hover:bg-hover hover:text-ink ' +
  'data-[popup-open]:opacity-100 data-[popup-open]:bg-hover data-[popup-open]:text-ink';

interface WorktreeSortButtonProps {
  /** Currently active sort for the project. */
  sort: WorktreeSort;
  /** Called with the chosen sort when the user picks one. */
  onSelect: (sort: WorktreeSort) => void;
}

/** Icon button that opens a dropdown to choose the project's worktree sort order. */
export function WorktreeSortButton({ sort, onSelect }: WorktreeSortButtonProps) {
  return (
    <Menu.Root>
      <Tooltip label="Sort worktrees">
        <Menu.Trigger
          render={
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              className={buttonClass}
            >
              <SortIcon size={13} />
            </span>
          }
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner className="z-[300]" side="bottom" align="start" sideOffset={4}>
          <Menu.Popup className={menuPopupClass}>
            <Menu.RadioGroup
              value={sort}
              onValueChange={(value) => onSelect(value as WorktreeSort)}
            >
              {WORKTREE_SORT_OPTIONS.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  closeOnClick
                  className={radioItemClass}
                >
                  <span className="grid w-4 place-items-center text-ember">
                    <Menu.RadioItemIndicator>
                      <CheckIcon size={13} />
                    </Menu.RadioItemIndicator>
                  </span>
                  <span className="flex-1">{option.label}</span>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
