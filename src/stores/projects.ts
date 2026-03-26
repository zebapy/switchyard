import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ProjectInfo, GitInfo, PrInfo } from '../types/project';

interface ProjectsState {
  projects: ProjectInfo[];
  pins: Set<string>;
  gitInfo: Map<string, GitInfo>;
  prInfo: Map<string, PrInfo | null>;
  scanRoot: string;
  filter: string;
  expandedProjects: Set<string>;

  // Actions
  loadProjects: (rootDir?: string) => Promise<void>;
  loadPins: () => Promise<void>;
  togglePin: (projectPath: string) => Promise<void>;
  refreshGitInfo: (projectPath: string) => Promise<void>;
  refreshPrInfo: (projectPath: string) => Promise<void>;
  createProject: (parentDir: string, name: string) => Promise<void>;
  setFilter: (filter: string) => void;
  toggleExpanded: (projectPath: string) => void;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  pins: new Set(),
  gitInfo: new Map(),
  prInfo: new Map(),
  scanRoot: '',
  filter: '',
  expandedProjects: new Set(),

  loadProjects: async (rootDir) => {
    const root = rootDir ?? get().scanRoot;
    if (!root) return;

    try {
      const projects = await invoke<ProjectInfo[]>('scan_projects', { rootDir: root });
      set({ projects, scanRoot: root });
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
      // Reload project list to include the new project
      await get().loadProjects();
    } catch (e) {
      console.error('Failed to create project:', e);
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
