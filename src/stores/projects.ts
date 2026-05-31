import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ProjectInfo, GitInfo, PrInfo } from '../types/project';
import type { TmuxSessionInfo } from '../types/tmux';
import type { AgentConfig } from '../types/agent';
import { DEFAULT_AGENT } from '../types/agent';

interface AppSettings {
  $schema: string;
  schema_version: number;
  scan_root: string;
  added_projects: string[];
  use_tmux: boolean;
  desktop_notifications: boolean;
  project_scripts: Record<string, string[]>;
  agents: AgentConfig[];
}

interface ProjectsState {
  projects: ProjectInfo[];
  pins: Set<string>;
  gitInfo: Map<string, GitInfo>;
  prInfo: Map<string, PrInfo | null>;
  scanRoot: string;
  addedProjects: string[];
  useTmux: boolean;
  desktopNotifications: boolean;
  /** Configured AI agents, ordered by preference. First entry is the default. */
  agents: AgentConfig[];
  filter: string;
  expandedProjects: Set<string>;
  tmuxSessions: TmuxSessionInfo[];
  /** Per-project: list of package.json absolute paths pinned for the Scripts section. */
  projectScripts: Map<string, string[]>;
  /** Cache: package.json absolute path → { scriptName: command }. */
  scriptData: Map<string, Record<string, string>>;

  // Actions
  loadSettings: () => Promise<void>;
  loadAddedProjects: () => void;
  loadPins: () => Promise<void>;
  togglePin: (projectPath: string) => Promise<void>;
  refreshGitInfo: (projectPath: string) => Promise<void>;
  refreshPrInfo: (projectPath: string) => Promise<void>;
  createProject: (parentDir: string, name: string) => Promise<void>;
  cloneRepo: (url: string, parentDir: string) => Promise<string>;
  setScanRoot: (root: string) => Promise<void>;
  addProjectPath: (path: string) => Promise<void>;
  removeProjectPath: (path: string) => Promise<void>;
  setUseTmux: (value: boolean) => Promise<void>;
  setDesktopNotifications: (value: boolean) => Promise<void>;
  setAgents: (agents: AgentConfig[]) => Promise<void>;
  setFilter: (filter: string) => void;
  toggleExpanded: (projectPath: string) => void;
  /** Expand a project (idempotent — never collapses). */
  expandProject: (projectPath: string) => void;
  loadTmuxSessions: () => Promise<void>;
  killTmuxSession: (name: string) => Promise<void>;
  // Scripts
  addProjectScript: (projectPath: string, packageJsonPath: string) => Promise<void>;
  removeProjectScript: (projectPath: string, packageJsonPath: string) => Promise<void>;
  loadScriptData: (packageJsonPath: string) => Promise<void>;
  findPackageJsons: (projectPath: string) => Promise<string[]>;
  // Worktrees
  createWorktree: (repoPath: string, branchName: string) => Promise<string>;
  deleteWorktree: (repoPath: string, name: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  pins: new Set(),
  gitInfo: new Map(),
  prInfo: new Map(),
  scanRoot: '',
  addedProjects: [],
  useTmux: true,
  desktopNotifications: true,
  agents: [DEFAULT_AGENT],
  filter: '',
  expandedProjects: new Set(),
  tmuxSessions: [],
  projectScripts: new Map(),
  scriptData: new Map(),

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>('get_app_settings');
      const projectScripts = new Map<string, string[]>(
        Object.entries(settings.project_scripts ?? {}),
      );
      const agents = settings.agents?.length ? settings.agents : [DEFAULT_AGENT];
      set({
        scanRoot: settings.scan_root,
        addedProjects: settings.added_projects,
        useTmux: settings.use_tmux,
        desktopNotifications: settings.desktop_notifications,
        agents,
        projectScripts,
      });
      return;
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  },

  loadAddedProjects: () => {
    const { addedProjects } = get();
    const projects: ProjectInfo[] = addedProjects.map((path) => ({
      name: path.split('/').pop() || path,
      path,
      is_git: true,
      worktree_parent: null,
    }));
    set({ projects });
  },

  loadPins: async () => {
    try {
      const pins = await invoke<string[]>('get_pinned_projects');
      set({ pins: new Set(pins) });
    } catch (e) {
      console.error('Failed to load pins:', e);
    }
  },

  togglePin: async (projectPath) => {
    try {
      const pins = await invoke<string[]>('toggle_pin', { projectPath });
      set({ pins: new Set(pins) });
    } catch (e) {
      console.error('Failed to toggle pin:', e);
    }
  },

  refreshGitInfo: async (projectPath) => {
    try {
      const info = await invoke<GitInfo>('get_git_info', { path: projectPath });
      set((state) => {
        const newMap = new Map(state.gitInfo);
        newMap.set(projectPath, info);
        return { gitInfo: newMap };
      });
    } catch {
      // Not a git repo or other error - ignore
    }
  },

  refreshPrInfo: async (projectPath) => {
    try {
      const info = await invoke<PrInfo | null>('get_pr_info', { path: projectPath });
      set((state) => {
        const newMap = new Map(state.prInfo);
        newMap.set(projectPath, info);
        return { prInfo: newMap };
      });
    } catch {
      // gh not available or other error
    }
  },

  createProject: async (parentDir, name) => {
    try {
      const project = await invoke<ProjectInfo>('create_project', { parentDir, name });
      await get().addProjectPath(project.path);
    } catch (e) {
      console.error('Failed to create project:', e);
      throw e;
    }
  },

  cloneRepo: async (url, parentDir) => {
    const project = await invoke<ProjectInfo>('clone_repo', { url, parentDir });
    await get().addProjectPath(project.path);
    return project.path;
  },

  setScanRoot: async (root) => {
    try {
      const settings = await invoke<AppSettings>('set_scan_root', { root });
      set({ scanRoot: settings.scan_root });
    } catch (e) {
      console.error('Failed to set scan root:', e);
      throw e;
    }
  },

  addProjectPath: async (path) => {
    try {
      const settings = await invoke<AppSettings>('add_project_path', { path });
      set({ addedProjects: settings.added_projects });
      get().loadAddedProjects();
    } catch (e) {
      console.error('Failed to add project:', e);
      throw e;
    }
  },

  removeProjectPath: async (path) => {
    try {
      const settings = await invoke<AppSettings>('remove_project_path', { path });
      set({ addedProjects: settings.added_projects });
      get().loadAddedProjects();
    } catch (e) {
      console.error('Failed to remove project:', e);
      throw e;
    }
  },

  setUseTmux: async (value) => {
    try {
      const settings = await invoke<AppSettings>('set_use_tmux', { value });
      set({ useTmux: settings.use_tmux });
    } catch (e) {
      console.error('Failed to set use_tmux:', e);
      throw e;
    }
  },

  setDesktopNotifications: async (value) => {
    try {
      const settings = await invoke<AppSettings>('set_desktop_notifications', { value });
      set({ desktopNotifications: settings.desktop_notifications });
    } catch (e) {
      console.error('Failed to set desktop_notifications:', e);
      throw e;
    }
  },

  setAgents: async (agents) => {
    const settings = await invoke<AppSettings>('set_agents', { agents });
    set({ agents: settings.agents?.length ? settings.agents : [DEFAULT_AGENT] });
  },

  setFilter: (filter) => set({ filter }),

  toggleExpanded: (projectPath) => {
    set((state) => {
      const newSet = new Set(state.expandedProjects);
      if (newSet.has(projectPath)) {
        newSet.delete(projectPath);
      } else {
        newSet.add(projectPath);
      }
      return { expandedProjects: newSet };
    });
  },

  expandProject: (projectPath) => {
    set((state) => {
      if (state.expandedProjects.has(projectPath)) return state;
      const newSet = new Set(state.expandedProjects);
      newSet.add(projectPath);
      return { expandedProjects: newSet };
    });
  },

  loadTmuxSessions: async () => {
    try {
      const sessions = await invoke<TmuxSessionInfo[]>('list_tmux_sessions');
      set({ tmuxSessions: sessions });
    } catch (e) {
      console.error('Failed to list tmux sessions:', e);
    }
  },

  killTmuxSession: async (name) => {
    try {
      await invoke('kill_tmux_session', { name });
      await get().loadTmuxSessions();
    } catch (e) {
      console.error('Failed to kill tmux session:', e);
    }
  },

  addProjectScript: async (projectPath, packageJsonPath) => {
    const current = get().projectScripts.get(projectPath) ?? [];
    if (current.includes(packageJsonPath)) return;
    const next = [...current, packageJsonPath];
    const settings = await invoke<AppSettings>('set_project_scripts', {
      projectPath,
      paths: next,
    });
    const projectScripts = new Map<string, string[]>(
      Object.entries(settings.project_scripts ?? {}),
    );
    set({ projectScripts });
    await get().loadScriptData(packageJsonPath);
  },

  removeProjectScript: async (projectPath, packageJsonPath) => {
    const current = get().projectScripts.get(projectPath) ?? [];
    const next = current.filter((p) => p !== packageJsonPath);
    const settings = await invoke<AppSettings>('set_project_scripts', {
      projectPath,
      paths: next,
    });
    const projectScripts = new Map<string, string[]>(
      Object.entries(settings.project_scripts ?? {}),
    );
    set({ projectScripts });
  },

  loadScriptData: async (packageJsonPath) => {
    const scripts = await invoke<Record<string, string>>('read_package_json_scripts', {
      path: packageJsonPath,
    });
    set((state) => {
      const newMap = new Map(state.scriptData);
      newMap.set(packageJsonPath, scripts);
      return { scriptData: newMap };
    });
  },

  findPackageJsons: async (projectPath) => {
    return await invoke<string[]>('find_package_jsons', { projectPath });
  },

  createWorktree: async (repoPath, branchName) => {
    const path = await invoke<string>('create_worktree', { repoPath, branchName });
    await get().refreshGitInfo(repoPath);
    return path;
  },

  deleteWorktree: async (repoPath, name) => {
    await invoke('delete_worktree', { repoPath, name });
    await get().refreshGitInfo(repoPath);
  },
}));
