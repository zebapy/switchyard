import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router';
import { Menu } from '@base-ui-components/react/menu';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';
import { goToDashboard } from '../../router';
import { ProjectItem } from './ProjectItem';
import { Footer } from '../Sidebar/Footer';
import { DashboardIcon, FolderPlusIcon, GitBranchIcon } from '../icons';

const menuPopupClass =
  'z-[300] min-w-[200px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const menuItemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';
const menuIconClass = 'grid w-4 place-items-center text-ink-faint';

export function ProjectTree() {
  const projects = useProjectsStore((s) => s.projects);
  const loadAddedProjects = useProjectsStore((s) => s.loadAddedProjects);
  const loadSettings = useProjectsStore((s) => s.loadSettings);
  const loadTmuxSessions = useProjectsStore((s) => s.loadTmuxSessions);
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);
  const reorderProjects = useProjectsStore((s) => s.reorderProjects);

  const treeFocused = useUiStore((s) => s.treeFocused);
  const setTreeFocused = useUiStore((s) => s.setTreeFocused);
  const toggleHelp = useUiStore((s) => s.toggleHelp);
  const openCloneModal = useUiStore((s) => s.openCloneModal);

  const treeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Drag-to-reorder: index of the row being dragged, and the insertion slot (0..len) it would drop into.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const isDashboard = useLocation().pathname === '/';

  useEffect(() => {
    const init = async () => {
      await loadSettings();
      loadAddedProjects();
      loadTmuxSessions();
    };
    init();
  }, [loadSettings, loadAddedProjects, loadTmuxSessions]);

  // Keep git info fresh for every git project (drives diffs, dashboard, footer stats).
  useEffect(() => {
    const refreshAll = () => {
      const { projects: ps, refreshGitInfo, refreshPrInfo, loadTmuxSessions: lts } = useProjectsStore.getState();
      for (const p of ps) {
        if (p.is_git && !p.worktree_parent) {
          refreshGitInfo(p.path);
          refreshPrInfo(p.path);
        }
      }
      lts();
    };
    refreshAll();
    const interval = setInterval(refreshAll, 15000);
    return () => clearInterval(interval);
  }, [projects]);

  const handleAddProject = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false, title: 'Select a project folder' });
    if (typeof dir === 'string') await addProjectPath(dir);
  }, [addProjectPath]);

  const navList = useMemo(() => projects.filter((p) => !p.worktree_parent), [projects]);

  useEffect(() => {
    setSelectedIndex((prev) => (navList.length === 0 ? 0 : Math.min(prev, navList.length - 1)));
  }, [navList.length]);

  useEffect(() => {
    if (treeFocused) treeRef.current?.focus();
  }, [treeFocused]);

  useEffect(() => {
    if (!treeFocused || navList.length === 0) return;
    const path = navList[selectedIndex]?.path;
    if (!path || !scrollRef.current) return;
    scrollRef.current.querySelector(`[data-project-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, treeFocused, navList]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const len = navList.length;
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, len - 1));
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const project = navList[selectedIndex];
        if (project) toggleExpanded(project.path);
        break;
      }
      case '?':
        e.preventDefault();
        toggleHelp();
        break;
      case 'q':
      case 'Escape':
        e.preventDefault();
        setTreeFocused(false);
        break;
    }
  }, [navList, selectedIndex, toggleExpanded, toggleHelp, setTreeFocused]);

  const resetDrag = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
    setDropIndex(null);
  }, []);

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    if (dragIndex === null) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropIndex(after ? index + 1 : index);
  }, [dragIndex]);

  const handleDrop = useCallback(() => {
    if (dragIndex === null || dropIndex === null) return resetDrag();
    let insertAt = dropIndex;
    if (dragIndex < dropIndex) insertAt -= 1;
    if (insertAt === dragIndex) return resetDrag();
    const paths = navList.map((p) => p.path);
    const [moved] = paths.splice(dragIndex, 1);
    paths.splice(insertAt, 0, moved);
    reorderProjects(paths);
    resetDrag();
  }, [dragIndex, dropIndex, navList, reorderProjects, resetDrag]);

  // A drop slot only gets an indicator when landing there actually moves the row.
  const isRealMove = (slot: number) =>
    dragIndex !== null && slot !== dragIndex && slot !== dragIndex + 1;

  return (
    <div
      ref={treeRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
    >
      <div className="border-b border-line-soft px-3 pb-3 pt-3">
        <button
          type="button"
          onClick={goToDashboard}
          className={
            'flex w-full items-center gap-2 rounded-lg px-3 py-[7px] text-[13px] font-semibold transition-colors ' +
            (isDashboard ? 'bg-ember-tint text-ink' : 'text-ink-dim hover:bg-hover hover:text-ink')
          }
        >
          <span className={`grid place-items-center ${isDashboard ? 'text-ember' : 'text-ink-faint'}`}>
            <DashboardIcon size={15} />
          </span>
          Dashboard
        </button>
      </div>

      <div className="flex items-center justify-between px-[18px] pb-1 pt-3">
        <span className="text-sm font-semibold text-white">Projects</span>
        <div className="flex items-center gap-1.5">
          <Menu.Root>
            <Menu.Trigger
              aria-label="Add project"
              title="Add project"
              className="grid size-5 place-items-center rounded-md text-ink-dim transition-colors hover:bg-hover hover:text-ink data-[popup-open]:bg-hover data-[popup-open]:text-ink"
            >
              <FolderPlusIcon size={15} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="z-[300]" sideOffset={6} align="end">
                <Menu.Popup className={menuPopupClass}>
                  <Menu.Item className={menuItemClass} onClick={openCloneModal}>
                    <span className={menuIconClass}><GitBranchIcon size={14} /></span> Clone repo
                  </Menu.Item>
                  <Menu.Item className={menuItemClass} onClick={handleAddProject}>
                    <span className={menuIconClass}><FolderPlusIcon size={14} /></span> Add local folder
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>

      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {navList.length === 0 && (
          <div className="px-2.5 py-6 text-center text-xs leading-relaxed text-ink-faint">
            No projects yet.
            <br />
            <span className="text-ink-ghost">Use “Add project” below to pick a folder.</span>
          </div>
        )}

        {navList.map((project, idx) => (
          <ProjectItem
            key={project.path}
            project={project}
            isSelected={treeFocused && idx === selectedIndex}
            index={idx}
            isDragging={dragIndex === idx}
            showDropLine={dropIndex === idx && isRealMove(idx)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={resetDrag}
          />
        ))}
        {dragIndex !== null && navList.length > 0 && (
          <div
            className="relative h-3"
            onDragOver={(e) => { e.preventDefault(); setDropIndex(navList.length); }}
            onDrop={(e) => { e.preventDefault(); handleDrop(); }}
          >
            {dropIndex === navList.length && isRealMove(navList.length) && (
              <div className="pointer-events-none absolute top-0 left-2 right-2 h-0.5 rounded-full bg-ember" />
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
