import { useMemo } from 'react';
import { Menu } from '@base-ui-components/react/menu';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { useUiStore } from '../../stores/ui';
import { DotsIcon } from '../icons';

const popupClass =
  'z-[300] min-w-[200px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const itemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';

function deriveUser(paths: string[]): string {
  for (const p of paths) {
    const m = p.match(/\/Users\/([^/]+)/) ?? p.match(/\/home\/([^/]+)/);
    if (m) return m[1];
  }
  return 'You';
}

export function Footer() {
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);
  const setScanRoot = useProjectsStore((s) => s.setScanRoot);
  const scanRoot = useProjectsStore((s) => s.scanRoot);
  const addedProjects = useProjectsStore((s) => s.addedProjects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const panes = useWorkspaceStore((s) => s.panes);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const userName = useMemo(() => deriveUser([...addedProjects, scanRoot]), [addedProjects, scanRoot]);

  const worktreeCount = useMemo(() => {
    let n = 0;
    for (const info of gitInfo.values()) n += info.worktrees.filter((w) => !w.is_main).length;
    return n;
  }, [gitInfo]);

  const runningCount = useMemo(() => {
    let n = 0;
    for (const p of panes.values()) {
      if (p.kind === 'Agent' && (p.agentStatus === 'working' || p.agentStatus === 'waiting')) n += 1;
    }
    return n;
  }, [panes]);

  const pickFolder = async (title: string): Promise<string | null> => {
    const sel = await open({ directory: true, multiple: false, title });
    return typeof sel === 'string' ? sel : null;
  };

  const handleAddProject = async () => {
    const dir = await pickFolder('Select project folder');
    if (dir) await addProjectPath(dir);
  };

  const handleSetDefaultFolder = async () => {
    const dir = await pickFolder('Default folder for new projects');
    if (dir) await setScanRoot(dir);
  };

  return (
    <div className="flex flex-col gap-1 border-t border-line bg-side p-2">
      <Menu.Root>
        <Menu.Trigger className="flex w-full items-center gap-[9px] rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover data-[popup-open]:bg-hover">
          <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-linear-to-br from-ember to-[#b56cff] text-xs font-bold text-[#1a1206]">
            {userName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{userName}</span>
            <span className="block truncate text-xs text-ink-faint">
              {worktreeCount} worktree{worktreeCount === 1 ? '' : 's'} · {runningCount} running
            </span>
          </span>
          <span className="ml-auto text-ink-faint"><DotsIcon size={14} /></span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[300]" side="top" align="start" sideOffset={6}>
            <Menu.Popup className={popupClass}>
              <Menu.Item className={itemClass} onClick={() => setSettingsOpen(true)}>Settings…</Menu.Item>
              <Menu.Item className={itemClass} onClick={handleAddProject}>Add existing project…</Menu.Item>
              <Menu.Item className={itemClass} onClick={handleSetDefaultFolder}>Set default folder…</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
