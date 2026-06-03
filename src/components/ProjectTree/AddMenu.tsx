import { Menu } from '@base-ui-components/react/menu';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { useUiStore } from '../../stores/ui';
import { goToWorkspace } from '../../router';
import { AgentGlyph, TermIcon, PlusIcon } from '../icons';

interface AddMenuProps {
  /** Path of this branch/worktree — used as the new session's window + cwd. */
  windowPath: string;
  /** Base label for new sessions (branch or project name). */
  label: string;
  /** When set (base branch), surfaces the "New script…" item that scans this project. */
  scriptsProjectPath?: string;
  /** Compact square "+" trigger for the tab strip instead of the full sidebar row. */
  compact?: boolean;
}

const popupClass =
  'z-[300] min-w-[210px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const itemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';
const iconClass = 'grid w-4 place-items-center text-ink-faint';
const sepClass = 'my-[5px] mx-1 h-px bg-line';
const kbdClass =
  'ml-auto rounded-[5px] border border-line bg-app px-1.5 py-px font-mono text-[11px] leading-none text-ink-faint';

export function AddMenu({ windowPath, label, scriptsProjectPath, compact }: AddMenuProps) {
  const addTab = useWorkspaceStore((s) => s.addTab);
  const openScriptPalette = useUiStore((s) => s.openScriptPalette);
  const agents = useProjectsStore((s) => s.agents);

  const spawnAgent = (agentCommand: string) => {
    addTab(windowPath, label, { kind: 'Agent', cwd: windowPath, agent: agentCommand });
    goToWorkspace();
  };

  const spawnShell = () => {
    addTab(windowPath, label, { kind: 'Shell', cwd: windowPath });
    goToWorkspace();
  };

  const openScripts = () => {
    if (!scriptsProjectPath) return;
    openScriptPalette({ projectPath: scriptsProjectPath, windowPath, label });
  };

  return (
    <Menu.Root>
      {compact ? (
        <Menu.Trigger
          title="New tab"
          aria-label="New tab"
          className="grid size-[26px] flex-none place-items-center rounded-md text-ink-faint transition-colors hover:bg-hover hover:text-ink"
          onClick={(e) => e.stopPropagation()}
        >
          <PlusIcon size={14} />
        </Menu.Trigger>
      ) : (
        <Menu.Trigger
          className="group relative flex w-full items-center gap-2 rounded-[7px] py-[5px] pl-1.5 pr-2 text-[13px] text-ink-ghost transition-colors hover:bg-hover hover:text-ember before:absolute before:-left-[11px] before:top-1/2 before:h-px before:w-[11px] before:bg-guide before:content-['']"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="grid size-4 place-items-center rounded-[5px] border border-dashed border-line group-hover:border-ember-edge">
            <PlusIcon size={9} />
          </span>
          New tab
        </Menu.Trigger>
      )}
      <Menu.Portal>
        <Menu.Positioner className="z-[300]" sideOffset={4} align="start">
          <Menu.Popup className={popupClass}>
            {agents.map((agent, i) => (
              <Menu.Item key={agent.id} className={itemClass} onClick={() => spawnAgent(agent.command)}>
                <span className={`${iconClass} text-ai`}>
                  <AgentGlyph name={agent.name} command={agent.command} size={14} />
                </span>
                New {agent.name}
                {i === 0 && <kbd className={kbdClass}>⌘⇧T</kbd>}
              </Menu.Item>
            ))}
            <Menu.Item className={itemClass} onClick={spawnShell}>
              <span className={iconClass}><TermIcon size={14} /></span> New terminal
              <kbd className={kbdClass}>⌘T</kbd>
            </Menu.Item>

            {scriptsProjectPath && (
              <>
                <Menu.Separator className={sepClass} />
                <Menu.Item className={itemClass} onClick={openScripts}>
                  <span className={`${iconClass} font-mono text-ember`}>▸</span> New script…
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
