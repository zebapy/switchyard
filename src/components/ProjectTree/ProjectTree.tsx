import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';
import { ProjectItem } from './ProjectItem';
import { Footer } from '../Sidebar/Footer';
import { SearchIcon, PlusIcon } from '../icons';

export function ProjectTree() {
  const projects = useProjectsStore((s) => s.projects);
  const filter = useProjectsStore((s) => s.filter);
  const setFilter = useProjectsStore((s) => s.setFilter);
  const loadAddedProjects = useProjectsStore((s) => s.loadAddedProjects);
  const loadSettings = useProjectsStore((s) => s.loadSettings);
  const loadTmuxSessions = useProjectsStore((s) => s.loadTmuxSessions);
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);

  const treeFocused = useUiStore((s) => s.treeFocused);
  const setTreeFocused = useUiStore((s) => s.setTreeFocused);
  const toggleHelp = useUiStore((s) => s.toggleHelp);

  const filterRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterFocused, setFilterFocused] = useState(false);

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

  const navList = useMemo(() => {
    const top = projects.filter((p) => !p.worktree_parent);
    if (!filter) return top;
    const q = filter.toLowerCase();
    return top.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, filter]);

  useEffect(() => {
    setSelectedIndex((prev) => (navList.length === 0 ? 0 : Math.min(prev, navList.length - 1)));
  }, [navList.length]);

  useEffect(() => {
    if (treeFocused && !filterFocused) treeRef.current?.focus();
  }, [treeFocused, filterFocused]);

  useEffect(() => {
    if (!treeFocused || navList.length === 0) return;
    const path = navList[selectedIndex]?.path;
    if (!path || !scrollRef.current) return;
    scrollRef.current.querySelector(`[data-project-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, treeFocused, navList]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (filterFocused) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (filter) setFilter('');
        else { setFilterFocused(false); treeRef.current?.focus(); }
      }
      return;
    }
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
      case '/':
        e.preventDefault();
        setFilterFocused(true);
        filterRef.current?.focus();
        break;
      case '?':
        e.preventDefault();
        toggleHelp();
        break;
      case 'q':
      case 'Escape':
        e.preventDefault();
        if (filter) setFilter('');
        else setTreeFocused(false);
        break;
    }
  }, [filterFocused, filter, navList, selectedIndex, setFilter, toggleExpanded, toggleHelp, setTreeFocused]);

  return (
    <div
      ref={treeRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex h-full flex-col overflow-hidden outline-none"
    >
      <div className="border-b border-line-soft px-3 pb-3 pt-3">
        <label className="flex items-center gap-2 rounded-lg border border-line bg-app px-2.5 py-[7px] transition focus-within:border-ember-edge focus-within:shadow-[0_0_0_3px_var(--color-ember-tint)]">
          <SearchIcon size={14} className="shrink-0 text-ink-faint" />
          <input
            ref={filterRef}
            type="text"
            value={filter}
            placeholder="Filter projects…"
            onChange={(e) => setFilter(e.target.value)}
            onFocus={() => setFilterFocused(true)}
            onBlur={() => setFilterFocused(false)}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-ghost"
          />
          <kbd className="rounded border border-line bg-side px-1.5 font-mono text-xs text-ink-faint">⌘K</kbd>
        </label>
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
