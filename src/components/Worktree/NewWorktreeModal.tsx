import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { useUiStore } from '../../stores/ui';
import { goToWorkspace } from '../../router';
import type { GhItem } from '../../types/project';
import { loadIssuePrompt, renderIssuePrompt } from './issuePrompt';
import {
  LinearIcon, IssueIcon, GitBranchIcon, PrIcon, SearchIcon, CloseIcon,
} from '../icons';

type Source = 'linear' | 'issue' | 'branch' | 'pr';

const TABS: { src: Source; label: string; cmd?: string; Icon: typeof IssueIcon }[] = [
  { src: 'linear', label: 'Linear issue', Icon: LinearIcon },
  { src: 'issue', label: 'GitHub issue', cmd: 'gh_list_issues', Icon: IssueIcon },
  { src: 'branch', label: 'GitHub branch', cmd: 'gh_list_branches', Icon: GitBranchIcon },
  { src: 'pr', label: 'GitHub PR', cmd: 'gh_list_prs', Icon: PrIcon },
];

function lastSegment(branch: string): string {
  return branch.split('/').filter(Boolean).pop() ?? branch;
}

const tabBase = 'flex items-center gap-1.5 rounded-lg border px-[11px] py-1.5 text-[12.5px] font-medium transition-colors';

export function NewWorktreeModal() {
  const { open, projectPath } = useUiStore((s) => s.worktreeModal);
  const closeModal = useUiStore((s) => s.closeWorktreeModal);
  const openGithubConnect = useUiStore((s) => s.openGithubConnect);
  const createWorktree = useProjectsStore((s) => s.createWorktree);
  const expandProject = useProjectsStore((s) => s.expandProject);
  const agents = useProjectsStore((s) => s.agents);
  const addTab = useWorkspaceStore((s) => s.addTab);

  const [src, setSrc] = useState<Source>('linear');
  const [items, setItems] = useState<GhItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [linearConnected, setLinearConnected] = useState(true);
  const [githubConnected, setGithubConnected] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isLinear = src === 'linear';
  const connected = isLinear ? linearConnected : githubConnected;
  const providerName = isLinear ? 'Linear' : 'GitHub';

  // Reset and refresh connection status whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setSrc('linear');
    setQuery('');
    setShowAll(false);
    setError('');
    setItems([]);
    invoke<boolean>('linear_is_connected').then(setLinearConnected).catch(() => setLinearConnected(false));
    invoke<boolean>('github_is_connected').then(setGithubConnected).catch(() => setGithubConnected(false));
  }, [open]);

  // Load the source list when the tab, scope, or connection changes.
  useEffect(() => {
    if (!open || !projectPath || !connected) { setItems([]); return; }
    const tab = TABS.find((t) => t.src === src);
    let cancelled = false;
    setLoading(true);
    const request = isLinear
      ? invoke<GhItem[]>('linear_list_issues', { all: showAll })
      : invoke<GhItem[]>(tab!.cmd!, { path: projectPath });
    request
      .then((res) => { if (!cancelled) setItems(res); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, src, showAll, projectPath, connected, isLinear]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeModal]);

  // The shared GitHub connect modal reports success here.
  useEffect(() => {
    const unlisten = listen('github:connected', () => setGithubConnected(true));
    return () => { unlisten.then((off) => off()); };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => `${it.id} ${it.title} ${it.branch}`.toLowerCase().includes(q));
  }, [items, query]);

  function connect() {
    if (!isLinear) {
      openGithubConnect();
      return;
    }
    void connectLinear();
  }

  async function connectLinear() {
    setConnecting(true);
    setError('');
    await invoke('linear_login').catch((e: unknown) => setError(String(e)));
    const ok = await invoke<boolean>('linear_is_connected').catch(() => false);
    setLinearConnected(ok);
    setConnecting(false);
  }

  async function createFrom(item: GhItem) {
    if (!projectPath || busy || !item.branch) return;
    setBusy(true);
    setError('');
    const newPath = await createWorktree(projectPath, item.branch).catch((e: unknown) => {
      setError(String(e));
      return null;
    });
    setBusy(false);
    if (!newPath) return;
    const command = renderIssuePrompt(loadIssuePrompt(), item) || undefined;
    expandProject(projectPath);
    addTab(newPath, lastSegment(item.branch), { kind: 'Agent', cwd: newPath, agent: agents[0]?.command, command });
    goToWorkspace();
    closeModal();
  }

  if (!open || !projectPath) return null;
  const projectName = lastSegment(projectPath);

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center">
      <div className="absolute inset-0 bg-[rgba(6,7,9,0.62)] backdrop-blur-[3px] animate-fade" onClick={closeModal} />
      <div className="animate-pop relative z-[1] flex max-h-[calc(100vh-64px)] w-[min(540px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]">
        <div className="flex items-start gap-3 border-b border-line px-[18px] pb-[14px] pt-[18px]">
          <div>
            <div className="text-base font-bold text-ink">Create worktree</div>
            <div className="mt-0.5 text-[13px] text-ink-faint">in <b className="font-semibold text-ink-dim">{projectName}</b></div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-[5px] px-[18px] pt-[13px]">
          {TABS.map((t) => (
            <button
              key={t.src}
              type="button"
              onClick={() => setSrc(t.src)}
              className={
                `${tabBase} ` +
                (src === t.src
                  ? 'border-ember-edge bg-ember-tint text-ember'
                  : 'border-line bg-app text-ink-dim hover:border-[#30343c] hover:text-ink')
              }
            >
              <span className="grid place-items-center"><t.Icon size={13} /></span>
              {t.label}
            </button>
          ))}
        </div>

        {connected ? (
          <>
            <div className="flex items-center gap-2 px-[18px] pb-2 pt-[13px]">
              <label className="flex flex-1 items-center gap-2 rounded-[9px] border border-line bg-app px-[11px] py-2 transition focus-within:border-ember-edge focus-within:shadow-[0_0_0_3px_var(--color-ember-tint)]">
                <SearchIcon size={14} className="shrink-0 text-ink-faint" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-ghost"
                />
              </label>
              {isLinear && (
                <div
                  role="radiogroup"
                  aria-label="Issue scope"
                  className="flex shrink-0 items-center gap-0.5 rounded-[9px] border border-line bg-app p-0.5 text-[12px] font-medium"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!showAll}
                    onClick={() => setShowAll(false)}
                    className={
                      'rounded-[7px] px-2.5 py-1 transition-colors ' +
                      (!showAll ? 'bg-ember-tint text-ember' : 'text-ink-dim hover:text-ink')
                    }
                  >
                    Mine
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={showAll}
                    onClick={() => setShowAll(true)}
                    className={
                      'rounded-[7px] px-2.5 py-1 transition-colors ' +
                      (showAll ? 'bg-ember-tint text-ember' : 'text-ink-dim hover:text-ink')
                    }
                  >
                    All
                  </button>
                </div>
              )}
            </div>

            <div className="scroll-thin flex max-h-[248px] min-h-[120px] flex-col gap-[5px] overflow-y-auto px-[18px] pb-1">
              {loading && <div className="py-6 text-center text-[13px] text-ink-ghost">Loading…</div>}
              {!loading && filtered.length === 0 && (
                <div className="py-6 text-center text-[13px] text-ink-ghost">No matches.</div>
              )}
              {!loading && filtered.map((it) => (
                <button
                  key={`${it.id}-${it.branch}`}
                  type="button"
                  disabled={busy}
                  onClick={() => void createFrom(it)}
                  className="group flex w-full items-center gap-2.5 rounded-[9px] border border-transparent bg-app px-[11px] py-[9px] text-left transition hover:border-guide hover:bg-hover disabled:opacity-50"
                >
                  <span className="grid shrink-0 place-items-center text-ink-faint group-hover:text-ink">
                    {src === 'pr' ? <PrIcon size={13} /> : src === 'branch' ? <GitBranchIcon size={13} /> : isLinear ? <LinearIcon size={13} /> : <IssueIcon size={13} />}
                  </span>
                  {it.id && <span className="shrink-0 font-mono text-xs text-ink-dim group-hover:text-ink">{it.id}</span>}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{it.title}</span>
                  {it.sub && <span className="shrink-0 font-mono text-[11.5px] text-ink-ghost">{it.sub}</span>}
                  <span className="shrink-0 text-ink-dim opacity-0 transition group-hover:opacity-100">→</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-[18px] py-10 text-center">
            <p className="text-[13px] text-ink-faint">{providerName} not connected.</p>
            <button
              type="button"
              disabled={connecting}
              onClick={() => void connect()}
              className="inline-flex items-center gap-2 rounded-[9px] border border-ember bg-ember-tint px-4 py-[9px] text-[13px] font-semibold text-ember transition hover:bg-ember hover:text-[#1a1206] disabled:opacity-50"
            >
              {connecting ? 'Connecting…' : `Connect ${providerName}`}
            </button>
          </div>
        )}

        {error && <div className="px-[18px] pt-1.5 text-xs text-del">{error}</div>}

        <div className="flex items-center gap-2 border-t border-line-soft px-[18px] py-[11px] text-[11.5px] text-ink-ghost">
          <kbd className="rounded border border-line px-1 font-mono text-ink-dim">esc</kbd> to close
          {connected && <span>· click a row to create a worktree from it</span>}
        </div>
      </div>
    </div>
  );
}
