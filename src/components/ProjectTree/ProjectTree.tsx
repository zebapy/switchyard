import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { ProjectItem } from './ProjectItem';
import type { TmuxSessionInfo } from '../../types/tmux';

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
  const loadAddedProjects = useProjectsStore((s) => s.loadAddedProjects);
  const loadPins = useProjectsStore((s) => s.loadPins);
  const loadSettings = useProjectsStore((s) => s.loadSettings);
  const loadTmuxSessions = useProjectsStore((s) => s.loadTmuxSessions);
  const tmuxSessions = useProjectsStore((s) => s.tmuxSessions);
  const scanRoot = useProjectsStore((s) => s.scanRoot);
  const setScanRoot = useProjectsStore((s) => s.setScanRoot);
  const addProjectPath = useProjectsStore((s) => s.addProjectPath);
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
    const init = async () => {
      await loadSettings();
      loadAddedProjects();
      loadPins();
      loadTmuxSessions();
    };
    init();
  }, [loadSettings, loadAddedProjects, loadPins, loadTmuxSessions]);

  // Refresh git info + tmux sessions periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const { projects, expandedProjects, refreshGitInfo, refreshPrInfo, loadTmuxSessions } = useProjectsStore.getState();
      for (const project of projects) {
        if (project.is_git && expandedProjects.has(project.path)) {
          refreshGitInfo(project.path);
          refreshPrInfo(project.path);
        }
      }
      loadTmuxSessions();
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

  // Group tmux sessions by project (longest matching path wins).
  // Sessions whose path matches no project end up in "Other sessions".
  const { sessionsByProject, orphanSessions } = useMemo(() => {
    const sortedPaths = projects.map((p) => p.path).sort((a, b) => b.length - a.length);
    const map = new Map<string, typeof tmuxSessions>();
    const orphans: typeof tmuxSessions = [];
    for (const session of tmuxSessions) {
      const match = sortedPaths.find(
        (path) => session.path === path || session.path.startsWith(path + '/'),
      );
      if (match) {
        const list = map.get(match) ?? [];
        list.push(session);
        map.set(match, list);
      } else {
        orphans.push(session);
      }
    }
    return { sessionsByProject: map, orphanSessions: orphans };
  }, [projects, tmuxSessions]);

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
      let parentDir = scanRoot;
      if (!parentDir) {
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Choose parent folder for new project',
        });
        if (!selected) return;
        parentDir = selected as string;
      }
      await createProject(parentDir, name);
      setShowNewProject(false);
      setNewProjectName('');
    } catch (e: unknown) {
      setNewProjectError(String(e));
    }
  }, [newProjectName, createProject, scanRoot]);

  const handleAddExisting = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select project folder',
      });
      if (selected) {
        await addProjectPath(selected as string);
      }
    } catch (e) {
      console.error('Failed to add project:', e);
    }
  }, [addProjectPath]);

  const handleChangeScanRoot = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Default folder for new projects',
      });
      if (selected) {
        await setScanRoot(selected as string);
      }
    } catch (e) {
      console.error('Failed to set default folder:', e);
    }
  }, [setScanRoot]);

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
    if (len === 0 && e.key !== '/' && e.key !== '?' && e.key !== 'q' && e.key !== 'Escape' && e.key !== 'a' && e.key !== 'n' && e.key !== 'r') return;

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
        if (project) {
          toggleExpanded(project.path);
          if (useWorkspaceStore.getState().windows.has(project.path)) {
            useWorkspaceStore.getState().switchWindow(project.path);
          }
        }
        break;
      }

      case 'p':
        e.preventDefault();
        if (navList[selectedIndex]) {
          togglePin(navList[selectedIndex].path);
        }
        break;

      case 'd': {
        e.preventDefault();
        break;
      }

      case 'n':
        e.preventDefault();
        setShowNewProject(true);
        setNewProjectName('');
        setNewProjectError('');
        break;

      case 'a':
        e.preventDefault();
        handleAddExisting();
        break;

      case 'r':
        e.preventDefault();
        handleChangeScanRoot();
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
  }, [filterFocused, showNewProject, filter, navList, selectedIndex, toggleExpanded, togglePin, setFilter, onFocusLost, onToggleHelp, handleAddExisting, handleChangeScanRoot]);

  return (
    <div
      className={`project-tree ${isFocused ? 'project-tree--focused' : ''}`}
      ref={treeRef}
      tabIndex={-1}
      onKeyDown={handleTreeKeyDown}
    >
      <div className="project-tree-header">
        <span className="project-tree-title">Projects</span>
        <button
          className="tree-header-action"
          onClick={() => {
            setShowNewProject(true);
            setNewProjectName('');
            setNewProjectError('');
          }}
          title="Create a new project in the default folder"
        >
          + new project
        </button>
      </div>

      {showNewProject && (
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
      )}

      <div className={`tree-filter ${filter || filterFocused ? 'tree-filter--active' : ''}`}>
        <input
          ref={filterRef}
          type="text"
          placeholder="Filter (press /)"
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

      <div className="tree-scroll" ref={scrollRef}>
        {pinned.length > 0 &&
          pinned.map((project) => (
            <ProjectItem
              key={project.path}
              project={project}
              isPinned={true}
              isSelected={isFocused && navList[selectedIndex]?.path === project.path}
              worktreeChildren={worktreeChildren.get(project.path)}
              tmuxSessions={sessionsByProject.get(project.path)}
            />
          ))}

        {unpinned.length === 0 && pinned.length === 0 && (
          <div className="tree-empty">
            No projects yet.
            <br />
            <span className="tree-empty-hint">
              Click "+ add existing" to pick a folder.
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
            tmuxSessions={sessionsByProject.get(project.path)}
          />
        ))}

        {orphanSessions.length > 0 && (
          <div className="tree-section">
            <div className="tree-section-header">Other sessions</div>
            <OrphanSessions sessions={orphanSessions} />
          </div>
        )}
      </div>

      <div className="tree-footer">
        <button
          className="tree-footer-btn"
          onClick={handleAddExisting}
          title="Pick an existing folder to add as a project"
        >
          + add existing
        </button>
        <button
          className="scan-root-btn"
          onClick={handleChangeScanRoot}
          title={`Default folder for new projects: ${scanRoot || '(not set)'}`}
        >
          {scanRoot ? scanRoot.split('/').pop() : 'set default folder'}
        </button>
      </div>
    </div>
  );
}

function OrphanSessions({ sessions }: { sessions: TmuxSessionInfo[] }) {
  const addTab = useWorkspaceStore((s) => s.addTab);
  const killTmuxSession = useProjectsStore((s) => s.killTmuxSession);

  const handleAttach = (session: TmuxSessionInfo) => {
    const label = session.path.split('/').pop() || session.name;
    addTab(session.path, label, {
      kind: 'Shell',
      tmuxSession: session.name,
      cwd: session.path,
    });
  };

  return (
    <div className="orphan-sessions">
      {sessions.map((session) => (
        <div key={session.name} className="orphan-session-row">
          <button
            className="orphan-session-attach"
            onClick={() => handleAttach(session)}
            title={`Attach to ${session.name}`}
          >
            <span className="orphan-session-icon">⌗</span>
            <span className="orphan-session-name">{session.path.split('/').pop() || session.name}</span>
            {session.attached && <span className="orphan-session-badge">attached</span>}
          </button>
          <button
            className="orphan-session-kill"
            onClick={() => killTmuxSession(session.name)}
            title={`Kill session ${session.name}`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
