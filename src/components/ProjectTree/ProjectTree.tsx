import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useProjectsStore } from '../../stores/projects';
import { ProjectItem } from './ProjectItem';

interface ProjectTreeProps {
  isFocused: boolean;
  onFocusLost: () => void;
  onToggleHelp: () => void;
}

export function ProjectTree({ isFocused, onFocusLost, onToggleHelp }: ProjectTreeProps) {
  const projects = useProjectsStore((s) => s.projects);
  const pins = useProjectsStore((s) => s.pins);
  const filter = useProjectsStore((s) => s.filter);
  const setFilter = useProjectsStore((s) => s.setFilter);
  const loadProjects = useProjectsStore((s) => s.loadProjects);
  const loadPins = useProjectsStore((s) => s.loadPins);
  const scanRoot = useProjectsStore((s) => s.scanRoot);
  const togglePin = useProjectsStore((s) => s.togglePin);
  const toggleExpanded = useProjectsStore((s) => s.toggleExpanded);
  const createProject = useProjectsStore((s) => s.createProject);

  const filterRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const newProjectRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterFocused, setFilterFocused] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectError, setNewProjectError] = useState('');

  useEffect(() => {
    const home = '/home';
    loadProjects(home);
    loadPins();
  }, [loadProjects, loadPins]);

  // Refresh git info periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const { projects, expandedProjects, refreshGitInfo, refreshPrInfo } = useProjectsStore.getState();
      for (const project of projects) {
        if (project.is_git && expandedProjects.has(project.path)) {
          refreshGitInfo(project.path);
          refreshPrInfo(project.path);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Build a map of worktrees grouped by parent project path
  const worktreeChildren = useMemo(() => {
    const map = new Map<string, typeof projects>();
    for (const p of projects) {
      if (p.worktree_parent) {
        const children = map.get(p.worktree_parent) ?? [];
        children.push(p);
        map.set(p.worktree_parent, children);
      }
    }
    return map;
  }, [projects]);

  // Build the flat navigable list: pinned first, then unpinned (excluding worktree children)
  const { pinned, unpinned, navList } = useMemo(() => {
    const filtered = projects.filter((p) => {
      // Exclude worktree children from top-level list
      if (p.worktree_parent) return false;
      if (!filter) return true;
      // When filtering, also match if any child worktree matches
      const children = worktreeChildren.get(p.path) ?? [];
      const childMatch = children.some((c) => c.name.toLowerCase().includes(filter.toLowerCase()));
      return p.name.toLowerCase().includes(filter.toLowerCase()) || childMatch;
    });
    const pinned = filtered.filter((p) => pins.has(p.path));
    const unpinned = filtered.filter((p) => !pins.has(p.path));
    const navList = [...pinned, ...unpinned];
    return { pinned, unpinned, navList };
  }, [projects, pins, filter, worktreeChildren]);

  // Clamp selectedIndex when list changes
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (navList.length === 0) return 0;
      return Math.min(prev, navList.length - 1);
    });
  }, [navList.length]);

  // Focus tree container when tree becomes focused (not filter)
  useEffect(() => {
    if (isFocused && !filterFocused && treeRef.current) {
      treeRef.current.focus();
    }
  }, [isFocused, filterFocused]);

  // Scroll selected item into view
  useEffect(() => {
    if (!isFocused || navList.length === 0) return;
    const selectedPath = navList[selectedIndex]?.path;
    if (!selectedPath || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-project-path="${CSS.escape(selectedPath)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, isFocused, navList]);

  useEffect(() => {
    if (showNewProject && newProjectRef.current) {
      newProjectRef.current.focus();
    }
  }, [showNewProject]);

  const handleNewProjectSubmit = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) {
      setShowNewProject(false);
      setNewProjectName('');
      setNewProjectError('');
      return;
    }
    try {
      setNewProjectError('');
      await createProject(scanRoot || '/home', name);
      setShowNewProject(false);
      setNewProjectName('');
    } catch (e: unknown) {
      setNewProjectError(String(e));
    }
  }, [newProjectName, createProject, scanRoot]);

  const handleTreeKeyDown = useCallback((e: React.KeyboardEvent) => {
    // If new project input or filter input is focused, only handle Escape
    if (showNewProject) {
      return;
    }
    if (filterFocused) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (filter) {
          setFilter('');
        } else {
          setFilterFocused(false);
          treeRef.current?.focus();
        }
      }
      return;
    }

    const len = navList.length;
    if (len === 0 && e.key !== '/' && e.key !== '?' && e.key !== 'q' && e.key !== 'Escape') return;

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
      case ' ':
        e.preventDefault();
        if (navList[selectedIndex]) {
          toggleExpanded(navList[selectedIndex].path);
        }
        break;

      case 'p':
        e.preventDefault();
        if (navList[selectedIndex]) {
          togglePin(navList[selectedIndex].path);
        }
        break;

      case 'd': {
        e.preventDefault();
        // Delete worktree - handled by ProjectItem via callback
        // For now just a placeholder; the `d` key on a worktree item
        // could be extended later when worktrees are separate nav items
        break;
      }

      case 'n':
        e.preventDefault();
        setShowNewProject(true);
        setNewProjectName('');
        setNewProjectError('');
        break;

      case '/':
        e.preventDefault();
        setFilterFocused(true);
        filterRef.current?.focus();
        break;

      case '?':
        e.preventDefault();
        onToggleHelp();
        break;

      case 'q':
        e.preventDefault();
        onFocusLost();
        break;

      case 'Escape':
        e.preventDefault();
        if (filter) {
          setFilter('');
        } else {
          onFocusLost();
        }
        break;
    }
  }, [filterFocused, showNewProject, filter, navList, selectedIndex, toggleExpanded, togglePin, setFilter, onFocusLost, onToggleHelp]);

  return (
    <div
      className={`project-tree ${isFocused ? 'project-tree--focused' : ''}`}
      ref={treeRef}
      tabIndex={-1}
      onKeyDown={handleTreeKeyDown}
    >
      <div className="project-tree-header">
        <span className="project-tree-title">Projects</span>
      </div>

      <div className="tree-filter">
        <input
          ref={filterRef}
          type="text"
          placeholder="Filter... (press /)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="tree-filter-input"
          onFocus={() => setFilterFocused(true)}
          onBlur={() => setFilterFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (filter) {
                setFilter('');
              } else {
                setFilterFocused(false);
                treeRef.current?.focus();
              }
            }
          }}
        />
      </div>

      <div className="tree-new-project">
        {showNewProject ? (
          <div className="new-project-input-row">
            <input
              ref={newProjectRef}
              type="text"
              placeholder="project name"
              value={newProjectName}
              onChange={(e) => {
                setNewProjectName(e.target.value);
                setNewProjectError('');
              }}
              className="new-project-input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleNewProjectSubmit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowNewProject(false);
                  setNewProjectName('');
                  setNewProjectError('');
                  treeRef.current?.focus();
                }
              }}
              onBlur={() => {
                // Small delay to allow click events to fire first
                setTimeout(() => {
                  setShowNewProject(false);
                  setNewProjectName('');
                  setNewProjectError('');
                }, 150);
              }}
            />
            {newProjectError && (
              <div className="new-project-error">{newProjectError}</div>
            )}
          </div>
        ) : (
          <button
            className="new-project-btn"
            onClick={() => {
              setShowNewProject(true);
              setNewProjectName('');
              setNewProjectError('');
            }}
          >
            + new project
          </button>
        )}
      </div>

      <div className="tree-scroll" ref={scrollRef}>
        {pinned.length > 0 && (
          <div className="tree-section">
            <div className="tree-section-header">Pinned</div>
            {pinned.map((project) => (
              <ProjectItem
                key={project.path}
                project={project}
                isPinned={true}
                isSelected={isFocused && navList[selectedIndex]?.path === project.path}
                worktreeChildren={worktreeChildren.get(project.path)}
              />
            ))}
          </div>
        )}

        <div className="tree-section">
          <div className="tree-section-header">
            {pinned.length > 0 ? 'All Projects' : 'Projects'}
          </div>
          {unpinned.length === 0 && pinned.length === 0 && (
            <div className="tree-empty">
              No projects found.
              <br />
              <span className="tree-empty-hint">
                Scanning: {scanRoot || '(none)'}
              </span>
            </div>
          )}
          {unpinned.map((project) => (
            <ProjectItem
              key={project.path}
              project={project}
              isPinned={false}
              isSelected={isFocused && navList[selectedIndex]?.path === project.path}
              worktreeChildren={worktreeChildren.get(project.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
