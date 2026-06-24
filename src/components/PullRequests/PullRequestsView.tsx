import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Menu } from '@base-ui-components/react/menu';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { useUiStore } from '../../stores/ui';
import { goToWorkspace } from '../../router';
import type { GitInfo, ProjectInfo, PullRequestItem } from '../../types/project';
import {
  RepoIcon, ChevronIcon, GitBranchIcon, WorktreeIcon, PlusIcon, ArrowRightIcon,
  ExternalLinkIcon, RefreshIcon, CheckIcon, PrIcon,
} from '../icons';

const menuPopupClass =
  'z-[300] max-h-[320px] min-w-[220px] overflow-y-auto rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const menuItemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';

/** A short "2h ago" from an ISO-8601 timestamp; empty string when unparseable. */
function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Pick the project the PR view opens on: the active workspace project (or its
 *  parent repo if a worktree is active), else the first git project. */
function resolveActiveProject(args: {
  activeWindowId: string | null;
  topProjects: ProjectInfo[];
  gitInfo: Map<string, GitInfo>;
}): string | null {
  const { activeWindowId, topProjects, gitInfo } = args;
  if (topProjects.length === 0) return null;
  if (activeWindowId) {
    const direct = topProjects.find((p) => p.path === activeWindowId);
    if (direct) return direct.path;
    const owner = topProjects.find((p) =>
      gitInfo.get(p.path)?.worktrees.some((w) => w.path === activeWindowId),
    );
    if (owner) return owner.path;
  }
  return topProjects[0].path;
}

type LoadStatus = 'loading' | 'loaded' | 'error';

export function PullRequestsView() {
  const projects = useProjectsStore((s) => s.projects);
  const gitInfo = useProjectsStore((s) => s.gitInfo);
  const githubLogin = useProjectsStore((s) => s.githubLogin);
  const loadGithubLogin = useProjectsStore((s) => s.loadGithubLogin);
  const refreshGitInfo = useProjectsStore((s) => s.refreshGitInfo);
  const createWorktreeForPr = useProjectsStore((s) => s.createWorktreeForPr);
  const defaultAgent = useProjectsStore((s) => s.agents[0]?.command);

  const windows = useWorkspaceStore((s) => s.windows);
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const addTab = useWorkspaceStore((s) => s.addTab);
  const switchWindow = useWorkspaceStore((s) => s.switchWindow);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);

  const openGithubConnect = useUiStore((s) => s.openGithubConnect);

  const topProjects = useMemo(() => projects.filter((p) => p.is_git && !p.worktree_parent), [projects]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);
  const [prs, setPrs] = useState<PullRequestItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Settle on a project once the project list loads, and recover if the selected
  // one disappears (e.g. removed). Default to the active workspace project.
  useEffect(() => {
    const stillValid = selectedPath && topProjects.some((p) => p.path === selectedPath);
    if (stillValid) return;
    setSelectedPath(resolveActiveProject({ activeWindowId, topProjects, gitInfo }));
  }, [selectedPath, topProjects, activeWindowId, gitInfo]);

  useEffect(() => {
    loadGithubLogin();
  }, [loadGithubLogin]);

  // Fetch open PRs for the selected project. A nonce lets the refresh button
  // re-run this without changing the project.
  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    setStatus('loading');
    setError(null);
    // Keep worktree matching fresh so the Open-vs-Go button is correct.
    refreshGitInfo(selectedPath);
    invoke<PullRequestItem[]>('gh_list_pull_requests', { path: selectedPath })
      .then((list) => {
        if (cancelled) return;
        setPrs(list);
        setStatus('loaded');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath, refreshNonce, refreshGitInfo]);

  const selectedProject = topProjects.find((p) => p.path === selectedPath) ?? null;
  const worktrees = (selectedPath && gitInfo.get(selectedPath)?.worktrees) || [];

  const visible = useMemo(() => {
    const login = githubLogin?.toLowerCase();
    if (!onlyMine) return prs;
    if (!login) return [];
    return prs.filter((pr) => pr.author.toLowerCase() === login);
  }, [prs, onlyMine, githubLogin]);

  const openInWorktree = useCallback(
    async (pr: PullRequestItem) => {
      if (!selectedPath) return;
      const path = await createWorktreeForPr({
        repoPath: selectedPath,
        prNumber: pr.number,
        branchName: pr.branch,
      });
      addTab(path, pr.branch, { kind: 'Agent', cwd: path, agent: defaultAgent });
      goToWorkspace();
    },
    [selectedPath, createWorktreeForPr, addTab, defaultAgent],
  );

  const goToWorktree = useCallback(
    (existingPath: string, branch: string) => {
      const win = windows.get(existingPath);
      if (win && win.tabs.length > 0) {
        switchWindow(existingPath);
        setActiveTab(win.activeTabId ?? win.tabs[0].id);
      } else {
        addTab(existingPath, branch, { kind: 'Agent', cwd: existingPath, agent: defaultAgent });
      }
      goToWorkspace();
    },
    [windows, switchWindow, setActiveTab, addTab, defaultAgent],
  );

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: 'radial-gradient(900px 480px at 85% -10%, rgba(255,148,56,0.05), transparent 60%), var(--color-canvas)' }}
    >
      <div className="flex flex-none items-end justify-between gap-4 border-b border-line px-[26px] pb-[18px] pt-[22px]">
        <div className="min-w-0">
          <div className="text-[22px] font-bold tracking-[-0.4px] text-ink">Pull requests</div>
          <div className="mt-1 text-[13px] text-ink-faint">
            {selectedProject ? (
              <>Open PRs in <b className="font-semibold text-ink-dim">{selectedProject.name}</b></>
            ) : (
              'No git projects'
            )}
          </div>
        </div>

        <div className="flex flex-none items-center gap-2.5">
          <ProjectPicker projects={topProjects} selectedPath={selectedPath} onSelect={setSelectedPath} />
          <OnlyMineToggle value={onlyMine} onChange={setOnlyMine} />
          <button
            type="button"
            title="Refresh"
            aria-label="Refresh pull requests"
            onClick={() => setRefreshNonce((n) => n + 1)}
            className="grid size-[34px] place-items-center rounded-[9px] border border-line bg-side text-ink-dim transition hover:border-guide hover:bg-hover hover:text-ink"
          >
            <RefreshIcon size={15} className={status === 'loading' ? 'animate-spin' : undefined} />
          </button>
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-[26px] pb-[34px] pt-5">
        <PullRequestsBody
          status={status}
          error={error}
          visible={visible}
          totalCount={prs.length}
          onlyMine={onlyMine}
          hasLogin={!!githubLogin}
          worktrees={worktrees}
          onConnect={openGithubConnect}
          onShowAll={() => setOnlyMine(false)}
          onOpenInWorktree={openInWorktree}
          onGoToWorktree={goToWorktree}
        />
      </div>
    </div>
  );
}

interface ProjectPickerProps {
  projects: ProjectInfo[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function ProjectPicker({ projects, selectedPath, onSelect }: ProjectPickerProps) {
  const selected = projects.find((p) => p.path === selectedPath);
  return (
    <Menu.Root>
      <Menu.Trigger className="flex items-center gap-2 rounded-[9px] border border-line bg-side px-3 py-[7px] text-[13px] text-ink transition hover:border-guide hover:bg-hover data-[popup-open]:border-ember-edge data-[popup-open]:bg-ember-tint">
        <span className="grid place-items-center text-ink-dim"><RepoIcon size={14} /></span>
        <span className="max-w-[180px] truncate">{selected?.name ?? 'Select project'}</span>
        <ChevronIcon size={10} className="rotate-90 text-ink-faint" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[300]" sideOffset={6} align="end">
          <Menu.Popup className={menuPopupClass}>
            {projects.map((p) => (
              <Menu.Item key={p.path} className={menuItemClass} onClick={() => onSelect(p.path)}>
                <span className="grid w-4 place-items-center text-ink-faint"><RepoIcon size={14} /></span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.path === selectedPath && <CheckIcon size={13} className="text-ember" />}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface OnlyMineToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

function OnlyMineToggle({ value, onChange }: OnlyMineToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 rounded-[9px] border border-line bg-side px-3 py-[7px] text-[13px] text-ink-dim transition hover:border-guide hover:text-ink"
    >
      <span
        className={
          'relative h-[18px] w-[31px] flex-none rounded-full transition-colors ' +
          (value ? 'bg-ember' : 'bg-active')
        }
      >
        <span
          className={
            'absolute top-[2px] size-[14px] rounded-full transition-[left] ' +
            (value ? 'left-[15px] bg-app' : 'left-[2px] bg-ink-faint')
          }
        />
      </span>
      <span className={value ? 'font-semibold text-ink' : undefined}>Only mine</span>
    </button>
  );
}

interface PullRequestsBodyProps {
  status: LoadStatus;
  error: string | null;
  visible: PullRequestItem[];
  totalCount: number;
  onlyMine: boolean;
  hasLogin: boolean;
  worktrees: { path: string; branch: string | null }[];
  onConnect: () => void;
  onShowAll: () => void;
  onOpenInWorktree: (pr: PullRequestItem) => Promise<void>;
  onGoToWorktree: (existingPath: string, branch: string) => void;
}

function PullRequestsBody(props: PullRequestsBodyProps) {
  const {
    status, error, visible, totalCount, onlyMine, hasLogin,
    worktrees, onConnect, onShowAll, onOpenInWorktree, onGoToWorktree,
  } = props;

  if (status === 'loading') {
    return <div className="p-10 text-center text-sm text-ink-faint">Loading pull requests…</div>;
  }

  if (status === 'error') {
    const needsAuth = !!error && /sign(ed)? in/i.test(error);
    return (
      <div className="mx-auto max-w-md rounded-[13px] border border-line bg-side p-7 text-center">
        <div className="mb-1 text-sm font-semibold text-ink">Couldn’t load pull requests</div>
        <div className="text-[13px] text-ink-dim">{error}</div>
        {needsAuth && (
          <button
            type="button"
            onClick={onConnect}
            className="mt-4 inline-flex items-center gap-2 rounded-[9px] border border-ember-edge bg-ember-tint px-[14px] py-[9px] text-[13px] font-semibold text-ember transition hover:bg-[rgba(255,148,56,0.2)]"
          >
            <PrIcon size={14} /> Connect GitHub
          </button>
        )}
      </div>
    );
  }

  if (visible.length === 0) {
    const filteredOut = onlyMine && totalCount > 0;
    return (
      <div className="p-10 text-center text-sm text-ink-ghost">
        {filteredOut ? (
          <>
            {hasLogin
              ? 'None of the open pull requests are yours.'
              : 'Sign in to GitHub to identify your pull requests.'}
            {' '}
            <button type="button" onClick={onShowAll} className="text-ember underline-offset-2 hover:underline">
              Show all {totalCount}
            </button>
          </>
        ) : (
          'No open pull requests.'
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-2">
      {visible.map((pr) => {
        const match = worktrees.find((w) => w.branch === pr.branch) ?? null;
        return (
          <PullRequestRow
            key={pr.number}
            pr={pr}
            existingPath={match?.path ?? null}
            onOpenInWorktree={onOpenInWorktree}
            onGoToWorktree={onGoToWorktree}
          />
        );
      })}
    </div>
  );
}

interface PullRequestRowProps {
  pr: PullRequestItem;
  existingPath: string | null;
  onOpenInWorktree: (pr: PullRequestItem) => Promise<void>;
  onGoToWorktree: (existingPath: string, branch: string) => void;
}

function PullRequestRow({ pr, existingPath, onOpenInWorktree, onGoToWorktree }: PullRequestRowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updated = relativeTime(pr.updated_at);

  const handleOpen = async () => {
    setError(null);
    setBusy(true);
    const failure = await onOpenInWorktree(pr).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );
    setBusy(false);
    if (failure) setError(failure);
  };

  return (
    <div className="flex items-center gap-3.5 rounded-[11px] border border-line bg-side2 px-3.5 py-3 transition hover:border-guide">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="font-mono text-xs text-ink-faint">#{pr.number}</span>
          <span className="min-w-0 truncate text-sm font-semibold text-ink">{pr.title}</span>
          {pr.draft && (
            <span className="flex-none rounded-md border border-line bg-active px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
              Draft
            </span>
          )}
        </div>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-faint">
          <span className="flex max-w-[260px] items-center gap-1.5 truncate font-mono text-[11.5px] text-ink-dim">
            <GitBranchIcon size={12} /> {pr.branch}
          </span>
          {pr.author && <span>{pr.author}</span>}
          {updated && <span>updated {updated}</span>}
          <button
            type="button"
            onClick={() => openUrl(pr.url).catch(() => null)}
            className="inline-flex items-center gap-1 text-ink-faint transition hover:text-url"
          >
            <ExternalLinkIcon size={12} /> GitHub
          </button>
        </div>
        {error && <div className="mt-1.5 text-[11.5px] text-del">{error}</div>}
      </div>

      <div className="flex-none">
        {existingPath ? (
          <button
            type="button"
            onClick={() => onGoToWorktree(existingPath, pr.branch)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(87,201,138,0.4)] bg-[rgba(87,201,138,0.1)] px-3 py-[7px] text-[12.5px] font-semibold text-green transition hover:bg-[rgba(87,201,138,0.18)]"
          >
            <WorktreeIcon size={13} /> Go to worktree <ArrowRightIcon size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleOpen}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ember-edge bg-ember-tint px-3 py-[7px] text-[12.5px] font-semibold text-ember transition hover:bg-[rgba(255,148,56,0.2)] disabled:cursor-default disabled:opacity-70"
          >
            {busy ? (
              <><span className="size-3 animate-spin rounded-full border-2 border-ink-ghost border-t-ember" /> Creating…</>
            ) : (
              <><PlusIcon size={13} /> Open in worktree</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
