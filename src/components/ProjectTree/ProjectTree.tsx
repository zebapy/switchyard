import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';
import { ProjectItem } from './ProjectItem';
import { Footer } from '../Sidebar/Footer';
import { DashboardIcon, PlusIcon } from '../icons';

export function ProjectTree() {
  const projects = useProjectsStore((s) => s.projects);
  const loadAddedProjects = useProjectsStore((s) => s.loadAddedProjects);
  const loadSettings = useProjectsStore((s) => s.loadSettings);
  const loadTmuxSessions = useProjectsStore((s) => s.loadTmuxSessions);
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);

  const mainView = useUiStore((s) => s.mainView);
  const showDashboard = useUiStore((s) => s.showDashboard);
  const treeFocused = useUiStore((s) => s.treeFocused);
  const setTreeFocused = useUiStore((s) => s.setTreeFocused);
  const toggleHelp = useUiStore((s) => s.toggleHelp);

  const treeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isDashboard = mainView === 'dashboard';

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

  return (
    <div
      ref={treeRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col overflow-hidden outline-none"
    >
      <div className="border-b border-line-soft px-3 pb-3 pt-3">
        <button
          type="button"
          onClick={showDashboard}
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

      <div ref={scrollRef} className="scroll-thin flex-1 overflow-y-auto px-2 pb-3 pt-2">
        <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
          <span className="text-sm font-semibold text-white">Projects</span>
          <div className="flex items-center gap-1.5">
            <b className="text-xs font-semibold text-ink-faint">{navList.length}</b>
            <button
              type="button"
              onClick={handleAddProject}
              aria-label="Add project"
              title="Add project"
              className="grid size-5 place-items-center rounded-md text-ink-dim transition-colors hover:bg-hover hover:text-ink"
            >
              <PlusIcon size={15} />
            </button>
          </div>
        </div>

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
          />
        ))}
      </div>

      <Footer />
    </div>
  );
}
