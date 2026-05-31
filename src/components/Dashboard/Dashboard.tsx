import { useMemo } from 'react';
import { Menu } from '@base-ui-components/react/menu';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { useUiStore } from '../../stores/ui';
import type { ProjectInfo, WorktreeInfo } from '../../types/project';
import type { PaneInfo, PaneTree, Tab } from '../../types/pane';
import {
  RepoIcon, BaseBranchIcon, WorktreeIcon, AiIcon, TermIcon, SplitIcon, PlusIcon,
  FolderPlusIcon, GitBranchIcon, ChevronIcon,
} from '../icons';

const menuPopupClass =
  'z-[300] min-w-[200px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const menuItemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';
const menuIconClass = 'grid w-4 place-items-center text-ink-faint';

function leafIds(tree: PaneTree): string[] {
  if (tree.type === 'leaf') return [tree.paneId];
  return [...leafIds(tree.children[0]), ...leafIds(tree.children[1])];
}
function isRunning(pane: PaneInfo | undefined): boolean {
  return !!pane && pane.kind === 'Agent' && (pane.agentStatus === 'working' || pane.agentStatus === 'waiting');
}

function worktreesFor(project: ProjectInfo, git: { worktrees: WorktreeInfo[] } | undefined): WorktreeInfo[] {
  if (git?.worktrees?.length) return [...git.worktrees].sort((a, b) => Number(b.is_main) - Number(a.is_main));
  if (!project.is_git) return [{ path: project.path, branch: null, is_main: true, last_commit_unix: null, added: 0, deleted: 0 }];
  return [];
}

export function Dashboard() {
  const projects = useProjectsStore((s) => s.projects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);
  const windows = useWorkspaceStore((s) => s.windows);
  const panes = useWorkspaceStore((s) => s.panes);
  const switchWindow = useWorkspaceStore((s) => s.switchWindow);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const showPane = useUiStore((s) => s.showPane);
  const openWorktreeModal = useUiStore((s) => s.openWorktreeModal);
  const openCloneModal = useUiStore((s) => s.openCloneModal);

  const topProjects = useMemo(() => projects.filter((p) => !p.worktree_parent), [projects]);

  const { branchCount, runningCount } = useMemo(() => {
    let branches = 0;
    for (const p of topProjects) branches += worktreesFor(p, gitInfo.get(p.path)).length;
    let running = 0;
    for (const pane of panes.values()) if (isRunning(pane)) running += 1;
    return { branchCount: branches, runningCount: running };
  }, [topProjects, gitInfo, panes]);

  const select = (wtPath: string, tab: Tab, paneId?: string) => {
    switchWindow(wtPath);
    setActiveTab(tab.id);
    if (paneId) setActivePane(paneId);
    showPane();
  };

  const handleAddLocalFolder = async () => {
    const sel = await open({ directory: true, multiple: false, title: 'Select project folder' });
    if (typeof sel === 'string') await addProjectPath(sel);
  };

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: 'radial-gradient(900px 480px at 85% -10%, rgba(255,148,56,0.05), transparent 60%), var(--color-canvas)' }}
    >
      <div className="flex flex-none items-end justify-between gap-4 border-b border-line px-[26px] pb-[18px] pt-[22px]">
        <div>
          <div className="text-[22px] font-bold tracking-[-0.4px] text-ink">Dashboard</div>
          <div className="mt-1 text-[13px] text-ink-faint">
            {topProjects.length} projects · {branchCount} branches · <b className="font-semibold text-green">{runningCount} running</b>
          </div>
        </div>
        <Menu.Root>
          <Menu.Trigger
            title="New project"
            aria-label="New project"
            className="flex flex-none items-center gap-1.5 rounded-[9px] border border-line bg-side px-[12px] py-[9px] text-ink-dim transition hover:border-ember-edge hover:bg-ember-tint hover:text-ember data-[popup-open]:border-ember-edge data-[popup-open]:bg-ember-tint data-[popup-open]:text-ember"
          >
            <FolderPlusIcon size={16} />
            <ChevronIcon size={10} className="rotate-90 text-ink-faint" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-[300]" sideOffset={6} align="end">
              <Menu.Popup className={menuPopupClass}>
                <Menu.Item className={menuItemClass} onClick={openCloneModal}>
                  <span className={menuIconClass}><GitBranchIcon size={14} /></span> Clone repo
                </Menu.Item>
                <Menu.Item className={menuItemClass} onClick={handleAddLocalFolder}>
                  <span className={menuIconClass}><FolderPlusIcon size={14} /></span> Add local folder
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-[26px] pb-[34px] pt-5">
        {topProjects.length === 0 && (
          <div className="p-10 text-center text-sm text-ink-ghost">No projects yet — add one from the sidebar.</div>
        )}
        {topProjects.map((project) => {
          const worktrees = worktreesFor(project, gitInfo.get(project.path));
          return (
            <div key={project.path} className="mb-7">
              <div className="mb-[13px] flex items-center gap-[9px]">
                <span className="grid place-items-center text-ink-dim"><RepoIcon size={15} /></span>
                <span className="text-sm font-semibold text-ink">{project.name}</span>
                <span className="font-mono text-xs text-ink-ghost">
                  {worktrees.length} {worktrees.length === 1 ? 'branch' : 'branches'}
                </span>
                {project.is_git && (
                  <button
                    onClick={() => openWorktreeModal(project.path, worktrees.find((w) => w.is_main)?.branch ?? null)}
                    className="ml-auto flex items-center gap-1.5 rounded-[7px] border border-dashed border-line px-[9px] py-[5px] text-xs text-ink-faint transition hover:border-ember-edge hover:text-ember"
                  >
                    <PlusIcon size={11} /> worktree
                  </button>
                )}
              </div>

              <div className="grid gap-[13px] [grid-template-columns:repeat(auto-fill,minmax(248px,1fr))]">
                {worktrees.map((wt) => (
                  <BranchCard
                    key={wt.path}
                    worktree={wt}
                    tabs={windows.get(wt.path)?.tabs ?? []}
                    panes={panes}
                    onSelect={(tab, paneId) => select(wt.path, tab, paneId)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface BranchCardProps {
  worktree: WorktreeInfo;
  tabs: Tab[];
  panes: Map<string, PaneInfo>;
  onSelect: (tab: Tab, paneId?: string) => void;
}

function BranchCard({ worktree, tabs, panes, onSelect }: BranchCardProps) {
  const isBase = worktree.is_main;
  const name = worktree.branch ?? worktree.path.split('/').filter(Boolean).pop() ?? worktree.path;
  const total = worktree.added + worktree.deleted;
  const addPct = total > 0 ? Math.round((worktree.added / total) * 100) : 0;

  const openFirst = () => {
    if (tabs.length > 0) onSelect(tabs[0]);
  };

  return (
    <div
      onClick={openFirst}
      className={
        'group relative cursor-pointer overflow-hidden rounded-[13px] border bg-linear-to-b from-side2 to-side p-[14px_15px_13px] transition hover:-translate-y-0.5 hover:border-[#30343c] hover:shadow-[0_16px_34px_-22px_rgba(0,0,0,0.9)] ' +
        (isBase
          ? "border-ember-edge before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ember-strong before:content-['']"
          : 'border-line')
      }
    >
      <div className="mb-[11px] flex items-center gap-2">
        <span className={`grid shrink-0 place-items-center ${isBase ? 'text-ember' : 'text-ink-faint'}`}>
          {isBase ? <BaseBranchIcon size={14} /> : <WorktreeIcon size={14} />}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium text-ink">{name}</span>
      </div>

      <div className="mb-3 flex items-center gap-2.5 border-b border-line-soft pb-3 font-mono text-xs">
        {total > 0 ? (
          <>
            <span className="text-add before:opacity-80 before:content-['+']">{worktree.added}</span>
            <span className="text-del before:opacity-80 before:content-['−']">{worktree.deleted}</span>
            <span className="ml-auto flex h-1 max-w-[90px] flex-1 overflow-hidden rounded bg-del">
              <i className="block h-full bg-add" style={{ width: `${addPct}%` }} />
            </span>
          </>
        ) : (
          <span className="text-ink-ghost">no changes</span>
        )}
      </div>

      <div className="flex flex-col gap-[5px]">
        {tabs.length === 0 && <div className="px-0.5 py-1 text-xs text-ink-ghost">No sessions yet</div>}
        {tabs.map((tab) => {
          if (tab.paneTree.type === 'leaf') {
            const pane = panes.get(tab.paneTree.paneId);
            const isAi = pane?.kind === 'Agent' && !pane.agentExited;
            return (
              <button
                key={tab.id}
                onClick={(e) => { e.stopPropagation(); onSelect(tab, tab.paneTree.type === 'leaf' ? tab.paneTree.paneId : undefined); }}
                className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-app px-[9px] py-1.5 text-left text-[12.5px] text-ink-dim transition hover:border-line hover:bg-hover hover:text-ink"
              >
                <span className={`grid shrink-0 place-items-center ${isAi ? 'text-ai' : 'text-ink-faint'}`}>
                  {isAi ? <AiIcon size={13} /> : <TermIcon size={13} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{pane?.title ?? tab.label}</span>
                {isRunning(pane) && <span className="size-1.5 shrink-0 rounded-full bg-green" />}
              </button>
            );
          }
          const leaves = leafIds(tab.paneTree);
          return (
            <button
              key={tab.id}
              onClick={(e) => { e.stopPropagation(); onSelect(tab, leaves[0]); }}
              className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-app px-[9px] py-1.5 text-left text-[12.5px] text-ink-dim transition hover:border-line hover:bg-hover hover:text-ink"
            >
              <span className="grid shrink-0 place-items-center text-ink-faint"><SplitIcon size={13} /></span>
              <span className="min-w-0 flex-1 truncate">{tab.label}</span>
              <span className="shrink-0 rounded-full border border-line px-1.5 font-mono text-[11px] leading-4 text-ink-faint">{leaves.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
