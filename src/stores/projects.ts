import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ProjectInfo, GitInfo, PrInfo } from '../types/project';

interface AppSettings {
  scan_root: string;
  added_projects: string[];
}

interface ProjectsState {
  projects: ProjectInfo[];
  pins: Set<string>;
  gitInfo: Map<string, GitInfo>;
  prInfo: Map<string, PrInfo | null>;
  scanRoot: string;
  addedProjects: string[];
  filter: string;
  expandedProjects: Set<string>;

  // Actions
  loadSettings: () => Promise<void>;
  loadProjects: (rootDir?: string) => Promise<void>;
  loadPins: () => Promise<void>;
  togglePin: (projectPath: string) => Promise<void>;
  refreshGitInfo: (projectPath: string) => Promise<void>;
  refreshPrInfo: (projectPath: string) => Promise<void>;
  createProject: (parentDir: string, name: string) => Promise<void>;
  setScanRoot: (root: string) => Promise<void>;
  addProjectPath: (path: string) => Promise<void>;
  removeProjectPath: (path: string) => Promise<void>;
  setFilter: (filter: string) => void;
  toggleExpanded: (projectPath: string) => void;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  pins: new Set(),
  gitInfo: new Map(),
  prInfo: new Map(),
  scanRoot: '',
  addedProjects: [],
  filter: '',
  expandedProjects: new Set(),

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>('get_app_settings');
      set({
        scanRoot: settings.scan_root,
        addedProjects: settings.added_projects,
      });
      return;
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  },

  loadProjects: async (rootDir) => {
    const root = rootDir ?? get().scanRoot;
    if (!root) return;

    try {
      const scanned = await invoke<ProjectInfo[]>('scan_projects', { rootDir: root });

      // Merge in manually added projects
      const addedProjects = get().addedProjects;
      const scannedPaths = new Set(scanned.map((p) => p.path));
      const addedInfos: ProjectInfo[] = [];

      for (const addedPath of addedProjects) {
        if (!scannedPaths.has(addedPath)) {
          const name = addedPath.split('/').pop() || addedPath;
          addedInfos.push({
            name,
            path: addedPath,
            is_git: true, // assume git for manually added
            worktree_parent: null,
          });
        }
      }

      set({ projects: [...scanned, ...addedInfos], scanRoot: root });
    } catch (e) {
      console.error('Failed to scan projects:', e);
    }
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
      await invoke<ProjectInfo>('create_project', { parentDir, name });
      await get().loadProjects();
    } catch (e) {
      console.error('Failed to create project:', e);
      throw e;
    }
  },

  setScanRoot: async (root) => {
    try {
      const settings = await invoke<AppSettings>('set_scan_root', { root });
      set({ scanRoot: settings.scan_root });
      await get().loadProjects(settings.scan_root);
    } catch (e) {
      console.error('Failed to set scan root:', e);
      throw e;
    }
  },

  addProjectPath: async (path) => {
    try {
      const settings = await invoke<AppSettings>('add_project_path', { path });
      set({ addedProjects: settings.added_projects });
      await get().loadProjects();
    } catch (e) {
      console.error('Failed to add project:', e);
      throw e;
    }
  },

  removeProjectPath: async (path) => {
    try {
      const settings = await invoke<AppSettings>('remove_project_path', { path });
      set({ addedProjects: settings.added_projects });
      await get().loadProjects();
    } catch (e) {
      console.error('Failed to remove project:', e);
      throw e;
    }
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
}));
