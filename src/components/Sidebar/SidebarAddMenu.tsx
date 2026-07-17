import { Menu } from '@base-ui-components/react/menu';
import { useLocation } from 'react-router';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { useUiStore } from '../../stores/ui';
import { goToWorkspace } from '../../router';
import {
  PlusIcon, FolderPlusIcon, GitBranchIcon, TermIcon, WorktreeIcon, AgentGlyph,
} from '../icons';

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

/**
 * Context-aware "new" menu anchored to the bottom-left of the sidebar and
 * toggled with ⌘⇧K. On the workspace view it offers new-session actions for the
 * active window; everywhere else it offers project-creation actions.
 */
export function SidebarAddMenu() {
  const location = useLocation();
  const inWorkspace = location.pathname.startsWith('/workspace');

  const addMenuOpen = useUiStore((s) => s.addMenuOpen);
  const setAddMenuOpen = useUiStore((s) => s.setAddMenuOpen);

  return (
    <Menu.Root open={addMenuOpen} onOpenChange={setAddMenuOpen}>
      <Menu.Trigger
        title="New… (⌘⇧K)"
        aria-label="New"
        className="grid size-[30px] flex-none place-items-center rounded-lg text-ink-dim transition-colors hover:bg-hover hover:text-ink data-[popup-open]:bg-hover data-[popup-open]:text-ink"
      >
        <PlusIcon size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[300]" sideOffset={6} align="start" side="top">
          <Menu.Popup className={popupClass}>
            {inWorkspace ? <WorkspaceItems /> : <ProjectItems />}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ProjectItems() {
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);
  const openCloneModal = useUiStore((s) => s.openCloneModal);

  const addLocalFolder = async () => {
    const dir = await open({ directory: true, multiple: false, title: 'Select a project folder' });
    if (typeof dir === 'string') await addProjectPath(dir);
  };

  return (
    <>
      <Menu.Item className={itemClass} onClick={openCloneModal}>
        <span className={iconClass}><GitBranchIcon size={14} /></span> Clone repo…
      </Menu.Item>
      <Menu.Item className={itemClass} onClick={addLocalFolder}>
        <span className={iconClass}><FolderPlusIcon size={14} /></span> Add project…
      </Menu.Item>
    </>
  );
}

function WorkspaceItems() {
  const agents = useProjectsStore((s) => s.agents);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const activeWindow = useWorkspaceStore((s) =>
    s.activeWindowId ? s.windows.get(s.activeWindowId) ?? null : null,
  );
  const openWorktreeModal = useUiStore((s) => s.openWorktreeModal);

  // No active window (e.g. mid-navigation) — fall back to project actions so the
  // menu is never empty.
  if (!activeWindow) return <ProjectItems />;

  const windowPath = activeWindow.projectPath;
  const label = windowPath.split('/').pop() ?? windowPath;

  const spawnAgent = (agentCommand: string) => {
    addTab(windowPath, label, { kind: 'Agent', cwd: windowPath, agent: agentCommand });
    goToWorkspace();
  };
  const spawnShell = () => {
    addTab(windowPath, label, { kind: 'Shell', cwd: windowPath });
    goToWorkspace();
  };

  return (
    <>
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
      <Menu.Separator className={sepClass} />
      <Menu.Item className={itemClass} onClick={() => openWorktreeModal(windowPath, null)}>
        <span className={iconClass}><WorktreeIcon size={14} /></span> New worktree…
      </Menu.Item>
    </>
  );
}
