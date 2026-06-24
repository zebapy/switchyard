import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ProjectInfo, GitInfo, GitRemoteInfo, PrInfo, DiffStat, WorktreeArchiveStatus, WorktreeSort } from '../types/project';
import type { TmuxSessionInfo } from '../types/tmux';
import type { AgentConfig } from '../types/agent';
import type { ScriptSource } from '../types/scripts';
import { DEFAULT_AGENT } from '../types/agent';
import { randomWorktreeName } from '../lib/worktreeName';

/** Where new git worktrees are created. */
export type WorktreeLocation = 'project' | 'global';

/** A worktree whose creation is in flight. Shown as an optimistic placeholder
 *  row in the project tree until the real worktree lands in git info. */
export interface PendingWorktree {
  /** Transient id — the React key and the removal handle. */
  id: string;
  /** Project the worktree is being created under. */
  projectPath: string;
  /** Friendly name shown in the placeholder and used as the branch leaf. */
  label: string;
}

interface AppSettings {
  $schema: string;
  schema_version: number;
  scan_root: string;
  added_projects: string[];
  use_tmux: boolean;
  desktop_notifications: boolean;
  project_scripts: Record<string, string[]>;
  project_sort: Record<string, WorktreeSort>;
  agents: AgentConfig[];
  worktree_location: WorktreeLocation;
}

interface ProjectsState {
  projects: ProjectInfo[];
  pins: Set<string>;
  gitInfo: Map<string, GitInfo>;
  prInfo: Map<string, PrInfo | null>;
  /** Hosting provider + owner per project path, drives the project icon (owner avatar, else host mark). */
  gitHosts: Map<string, GitRemoteInfo | null>;
  scanRoot: string;
  addedProjects: string[];
  useTmux: boolean;
  desktopNotifications: boolean;
  /** Configured AI agents, ordered by preference. First entry is the default. */
  agents: AgentConfig[];
  /** Where new git worktrees are created. */
  worktreeLocation: WorktreeLocation;
  /** Per-project worktree-list sort order, keyed by project path. */
  projectSort: Record<string, WorktreeSort>;
  /** Worktrees whose creation is in flight, shown as placeholder rows. */
  pendingWorktrees: PendingWorktree[];
  filter: string;
  expandedProjects: Set<string>;
  tmuxSessions: TmuxSessionInfo[];
  /** Signed-in GitHub login, used to filter the Pull requests view to "only mine". Null until loaded / when signed out. */
  githubLogin: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  /** Fetch the signed-in GitHub login (for the "only mine" PR filter). */
  loadGithubLogin: () => Promise<void>;
  loadAddedProjects: () => void;
  /** Fetch the git host for any added project not yet known, to pick its repo icon. */
  loadGitHosts: () => Promise<void>;
  loadPins: () => Promise<void>;
  togglePin: (projectPath: string) => Promise<void>;
  refreshGitInfo: (projectPath: string) => Promise<void>;
  /** Fetch one worktree's deferred +/- line counts and patch them into cached git info. */
  refreshWorktreeDiffStats: (projectPath: string, worktreePath: string) => Promise<void>;
  /** Refresh cached git info for a worktree path and any project whose worktree list contains it, so a branch switch is reflected wherever the branch name is read. */
  refreshGitInfoForPath: (worktreePath: string) => Promise<void>;
  refreshPrInfo: (projectPath: string) => Promise<void>;
  createProject: (parentDir: string, name: string) => Promise<void>;
  cloneRepo: (url: string, parentDir: string) => Promise<string>;
  setScanRoot: (root: string) => Promise<void>;
  addProjectPath: (path: string) => Promise<void>;
  removeProjectPath: (path: string) => Promise<void>;
  /** Persist a new top-level project order. `orderedPaths` is the full list of added project paths in their desired order. */
  reorderProjects: (orderedPaths: string[]) => Promise<void>;
  setUseTmux: (value: boolean) => Promise<void>;
  setDesktopNotifications: (value: boolean) => Promise<void>;
  setAgents: (agents: AgentConfig[]) => Promise<void>;
  setWorktreeLocation: (location: WorktreeLocation) => Promise<void>;
  /** Persist a project's worktree-list sort order. */
  setProjectSort: (projectPath: string, sort: WorktreeSort) => Promise<void>;
  setFilter: (filter: string) => void;
  toggleExpanded: (projectPath: string) => void;
  /** Expand a project (idempotent — never collapses). */
  expandProject: (projectPath: string) => void;
  loadTmuxSessions: () => Promise<void>;
  killTmuxSession: (name: string) => Promise<void>;
  // Scripts
  /** Walk a project for package.json / pyproject.toml manifests and their runnable scripts. */
  discoverScripts: (projectPath: string) => Promise<ScriptSource[]>;
  // Worktrees
  createWorktree: (repoPath: string, branchName: string) => Promise<string>;
  /** Check a GitHub PR's head branch out into a new worktree, then refresh git info. Returns the worktree path. */
  createWorktreeForPr: (params: { repoPath: string; prNumber: number; branchName: string }) => Promise<string>;
  /** Create a worktree with a random `adjective-noun` name, branch-prefixed with
   *  the git user (e.g. `zebapy/brave-otter`). Returns its path and short label. */
  quickWorktree: (repoPath: string) => Promise<{ path: string; label: string }>;
  deleteWorktree: (repoPath: string, name: string) => Promise<void>;
  /** Whether a worktree can be archived, plus uncommitted-change warnings. */
  getWorktreeArchiveStatus: (repoPath: string, name: string) => Promise<WorktreeArchiveStatus>;
  /** Archive a worktree: remove its working directory, keep the branch. */
  archiveWorktree: (repoPath: string, name: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  pins: new Set(),
  gitInfo: new Map(),
  prInfo: new Map(),
  gitHosts: new Map(),
  scanRoot: '',
  addedProjects: [],
  useTmux: true,
  desktopNotifications: true,
  agents: [DEFAULT_AGENT],
  worktreeLocation: 'project',
  projectSort: {},
  pendingWorktrees: [],
  filter: '',
  expandedProjects: new Set(),
  tmuxSessions: [],
  githubLogin: null,

  loadGithubLogin: async () => {
    const login = await invoke<string | null>('github_account').catch(() => null);
    set({ githubLogin: login });
  },

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>('get_app_settings');
      const agents = settings.agents?.length ? settings.agents : [DEFAULT_AGENT];
      set({
        scanRoot: settings.scan_root,
        addedProjects: settings.added_projects,
        useTmux: settings.use_tmux,
        desktopNotifications: settings.desktop_notifications,
        agents,
        worktreeLocation: settings.worktree_location ?? 'project',
        projectSort: settings.project_sort ?? {},
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
    void get().loadGitHosts();
  },

  loadGitHosts: async () => {
    const { addedProjects, gitHosts } = get();
    const missing = addedProjects.filter((path) => !gitHosts.has(path));
    if (missing.length === 0) return;
    const entries = await Promise.all(
      missing.map(
        async (path) =>
          [path, await invoke<GitRemoteInfo | null>('get_git_remote_info', { path }).catch(() => null)] as const,
      ),
    );
    set((state) => {
      const next = new Map(state.gitHosts);
      for (const [path, host] of entries) next.set(path, host);
      return { gitHosts: next };
    });
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
      // Diff stats are deferred so the tree paints immediately. Fetch every
      // worktree's +/- counts concurrently, then patch them all in with a single
      // store update — one re-render per project instead of one per worktree.
      const stats = await Promise.all(
        info.worktrees.map((wt) =>
          invoke<DiffStat>('get_worktree_diff_stats', { path: wt.path })
            .then((stat) => ({ path: wt.path, added: stat.added, deleted: stat.deleted }))
            .catch(() => null),
        ),
      );
      const byPath = new Map(stats.flatMap((s) => (s ? [[s.path, s] as const] : [])));
      if (byPath.size === 0) return;
      set((state) => {
        const current = state.gitInfo.get(projectPath);
        if (!current) return state;
        const worktrees = current.worktrees.map((wt) => {
          const stat = byPath.get(wt.path);
          return stat ? { ...wt, added: stat.added, deleted: stat.deleted } : wt;
        });
        const newMap = new Map(state.gitInfo);
        newMap.set(projectPath, { ...current, worktrees });
        return { gitInfo: newMap };
      });
    } catch {
      // Not a git repo or other error - ignore
    }
  },

  refreshWorktreeDiffStats: async (projectPath, worktreePath) => {
    try {
      const stat = await invoke<DiffStat>('get_worktree_diff_stats', { path: worktreePath });
      set((state) => {
        const info = state.gitInfo.get(projectPath);
        if (!info) return state;
        const worktrees = info.worktrees.map((wt) =>
          wt.path === worktreePath ? { ...wt, added: stat.added, deleted: stat.deleted } : wt
        );
        const newMap = new Map(state.gitInfo);
        newMap.set(projectPath, { ...info, worktrees });
        return { gitInfo: newMap };
      });
    } catch {
      // Worktree removed or not a repo - leave counts at 0
    }
  },

  refreshGitInfoForPath: async (worktreePath) => {
    const keys = new Set<string>([worktreePath]);
    for (const [key, info] of get().gitInfo) {
      if (info.worktrees.some((w) => w.path === worktreePath)) keys.add(key);
    }
    await Promise.all([...keys].map((key) => get().refreshGitInfo(key)));
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

  reorderProjects: async (orderedPaths) => {
    // Optimistic: reflect the new order immediately, then persist.
    const previous = get().addedProjects;
    set({ addedProjects: orderedPaths });
    get().loadAddedProjects();
    try {
      const settings = await invoke<AppSettings>('reorder_projects', { paths: orderedPaths });
      set({ addedProjects: settings.added_projects });
      get().loadAddedProjects();
    } catch (e) {
      console.error('Failed to reorder projects:', e);
      set({ addedProjects: previous });
      get().loadAddedProjects();
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

  setWorktreeLocation: async (location) => {
    try {
      const settings = await invoke<AppSettings>('set_worktree_location', { location });
      set({ worktreeLocation: settings.worktree_location });
    } catch (e) {
      console.error('Failed to set worktree_location:', e);
      throw e;
    }
  },

  setProjectSort: async (projectPath, sort) => {
    // Optimistic: reflect the new order immediately, then persist.
    const previous = get().projectSort;
    set({ projectSort: { ...previous, [projectPath]: sort } });
    try {
      const settings = await invoke<AppSettings>('set_project_sort', { projectPath, sort });
      set({ projectSort: settings.project_sort ?? {} });
    } catch (e) {
      console.error('Failed to set project sort:', e);
      set({ projectSort: previous });
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

  discoverScripts: async (projectPath) => {
    return await invoke<ScriptSource[]>('discover_scripts', { projectPath });
  },

  createWorktree: async (repoPath, branchName) => {
    const path = await invoke<string>('create_worktree', { repoPath, branchName });
    await get().refreshGitInfo(repoPath);
    return path;
  },

  createWorktreeForPr: async ({ repoPath, prNumber, branchName }) => {
    const path = await invoke<string>('create_worktree_for_pr', { repoPath, prNumber, branchName });
    await get().refreshGitInfo(repoPath);
    return path;
  },

  quickWorktree: async (repoPath) => {
    const existingNames = (get().gitInfo.get(repoPath)?.worktrees ?? []).map(
      (wt) => wt.path.split('/').filter(Boolean).pop() ?? '',
    );
    const pendingNames = get().pendingWorktrees
      .filter((p) => p.projectPath === repoPath)
      .map((p) => p.label);
    const label = randomWorktreeName([...existingNames, ...pendingNames]);
    const id = crypto.randomUUID();

    // Optimistic: show a placeholder row immediately, before any backend round-trip,
    // so the click registers instead of looking like nothing happened.
    set((state) => ({
      pendingWorktrees: [...state.pendingWorktrees, { id, projectPath: repoPath, label }],
    }));
    const dropPlaceholder = () =>
      set((state) => ({ pendingWorktrees: state.pendingWorktrees.filter((p) => p.id !== id) }));

    const slug = await invoke<string>('git_user_slug', { repoPath }).catch(() => '');
    const branchName = slug ? `${slug}/${label}` : label;
    const path = await invoke<string>('create_worktree', { repoPath, branchName }).catch(
      (e: unknown) => {
        dropPlaceholder();
        throw e;
      },
    );

    // The worktree exists on disk now, so the caller can open its Workspace tab
    // immediately. Reconcile the real row into the tree in the background, then
    // drop the placeholder once the real row is present (avoids a flash).
    void get().refreshGitInfo(repoPath).finally(dropPlaceholder);

    return { path, label };
  },

  deleteWorktree: async (repoPath, name) => {
    await invoke('delete_worktree', { repoPath, name });
    await get().refreshGitInfo(repoPath);
  },

  getWorktreeArchiveStatus: async (repoPath, name) => {
    return await invoke<WorktreeArchiveStatus>('get_worktree_archive_status', { repoPath, name });
  },

  archiveWorktree: async (repoPath, name) => {
    await invoke('archive_worktree', { repoPath, name });
    await get().refreshGitInfo(repoPath);
  },
}));
