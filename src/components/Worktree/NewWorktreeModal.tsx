import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import { useUiStore } from '../../stores/ui';
import { goToWorkspace } from '../../router';
import type { GhItem } from '../../types/project';
import {
  LinearIcon, IssueIcon, GitBranchIcon, PrIcon, SearchIcon, CheckIcon, CloseIcon,
} from '../icons';

type Source = 'linear' | 'issue' | 'branch' | 'pr';

const TABS: { src: Source; label: string; cmd?: string; disabled?: boolean; Icon: typeof IssueIcon }[] = [
  { src: 'linear', label: 'Linear issue', disabled: true, Icon: LinearIcon },
  { src: 'issue', label: 'GitHub issue', cmd: 'gh_list_issues', Icon: IssueIcon },
  { src: 'branch', label: 'GitHub branch', cmd: 'gh_list_branches', Icon: GitBranchIcon },
  { src: 'pr', label: 'GitHub PR', cmd: 'gh_list_prs', Icon: PrIcon },
];

function lastSegment(branch: string): string {
  return branch.split('/').filter(Boolean).pop() ?? branch;
}
function sanitize(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

const tabBase = 'rounded-lg border px-[11px] py-1.5 text-[12.5px] font-medium transition-colors';
const fieldInput =
  'rounded-[9px] border border-line bg-app px-[11px] py-[9px] font-mono text-[13px] text-ink outline-none transition focus:border-ember-edge focus:shadow-[0_0_0_3px_var(--color-ember-tint)]';

export function NewWorktreeModal() {
  const { open, projectPath, baseBranch } = useUiStore((s) => s.worktreeModal);
  const closeModal = useUiStore((s) => s.closeWorktreeModal);
  const createWorktree = useProjectsStore((s) => s.createWorktree);
  const agents = useProjectsStore((s) => s.agents);
  const addTab = useWorkspaceStore((s) => s.addTab);

  const [src, setSrc] = useState<Source>('issue');
  const [items, setItems] = useState<GhItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agent, setAgent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setSrc('issue');
    setQuery('');
    setSelectedId(null);
    setName('');
    setBranch('');
    setPrompt('');
    setAgent(agents[0]?.command ?? '');
    setError('');
  }, [open, agents]);

  const agentName = agents.find((a) => a.command === agent)?.name ?? agents[0]?.name ?? 'agent';

  // Fetch the source list when open + tab changes.
  useEffect(() => {
    if (!open || !projectPath) return;
    const tab = TABS.find((t) => t.src === src);
    if (!tab?.cmd) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    invoke<GhItem[]>(tab.cmd, { path: projectPath })
      .then((res) => { if (!cancelled) setItems(res); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, src, projectPath]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => `${it.id} ${it.title} ${it.branch}`.toLowerCase().includes(q));
  }, [items, query]);

  const selectItem = (it: GhItem) => {
    setSelectedId(it.id);
    setBranch(it.branch);
    setName(sanitize(lastSegment(it.branch)));
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!projectPath) return;
      const wtName = sanitize(name || lastSegment(branch));
      if (!wtName) { setError('Enter a worktree name.'); return; }
      setBusy(true);
      setError('');
      const newPath = await createWorktree(projectPath, wtName).catch((err: unknown) => {
        setError(String(err));
        return null;
      });
      setBusy(false);
      if (!newPath) return;
      addTab(newPath, wtName, { kind: 'Agent', cwd: newPath, command: prompt.trim() || undefined, agent });
      goToWorkspace();
      closeModal();
    },
    [projectPath, name, branch, prompt, agent, createWorktree, addTab, closeModal],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeModal]);

  if (!open || !projectPath) return null;
  const projectName = projectPath.split('/').filter(Boolean).pop() ?? projectPath;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center">
      <div className="absolute inset-0 bg-[rgba(6,7,9,0.62)] backdrop-blur-[3px] animate-fade" onClick={closeModal} />
      <form
        onSubmit={handleSubmit}
        className="animate-pop relative z-[1] flex max-h-[calc(100vh-64px)] w-[min(540px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-line bg-side shadow-[0_30px_80px_-22px_rgba(0,0,0,0.85)]"
      >
        <div className="flex items-start gap-3 border-b border-line px-[18px] pb-[14px] pt-[18px]">
          <div>
            <div className="text-base font-bold text-ink">New worktree</div>
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
              disabled={t.disabled}
              onClick={() => !t.disabled && setSrc(t.src)}
              className={
                `${tabBase} ` +
                (t.disabled
                  ? 'cursor-not-allowed border-line bg-app text-ink-dim opacity-45'
                  : src === t.src
                    ? 'border-ember-edge bg-ember-tint text-ember'
                    : 'border-line bg-app text-ink-dim hover:border-[#30343c] hover:text-ink')
              }
            >
              {t.label}
              {t.disabled && <span className="ml-1.5 text-[10px] uppercase tracking-[0.08em] text-ink-ghost">soon</span>}
            </button>
          ))}
        </div>

        <div className="px-[18px] pb-2 pt-[13px]">
          <label className="flex items-center gap-2 rounded-[9px] border border-line bg-app px-[11px] py-2 transition focus-within:border-ember-edge focus-within:shadow-[0_0_0_3px_var(--color-ember-tint)]">
            <SearchIcon size={14} className="shrink-0 text-ink-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-ghost"
            />
          </label>
        </div>

        <div className="scroll-thin flex max-h-[196px] min-h-[54px] flex-col gap-[5px] overflow-y-auto px-[18px]">
          {loading && <div className="py-4 text-center text-[13px] text-ink-ghost">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="py-4 text-center text-[13px] text-ink-ghost">
              {src === 'linear' ? 'Linear integration coming soon.' : 'No matches (is `gh` set up?).'}
            </div>
          )}
          {!loading && filtered.map((it) => {
            const selected = selectedId === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => selectItem(it)}
                className={
                  'flex w-full items-center gap-2.5 rounded-[9px] border bg-app px-[11px] py-[9px] text-left transition ' +
                  (selected ? 'border-ember-edge bg-ember-tint' : 'border-transparent hover:border-line hover:bg-hover')
                }
              >
                <span className={`grid shrink-0 place-items-center ${selected ? 'text-ember' : 'text-ink-faint'}`}>
                  {src === 'pr' ? <PrIcon size={13} /> : src === 'branch' ? <GitBranchIcon size={13} /> : <IssueIcon size={13} />}
                </span>
                <span className={`shrink-0 font-mono text-xs ${selected ? 'text-ember' : 'text-ink-dim'}`}>{it.id}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{it.title}</span>
                {it.sub && <span className="shrink-0 font-mono text-[11.5px] text-ink-ghost">{it.sub}</span>}
                {selected && <span className="grid shrink-0 place-items-center text-ember"><CheckIcon size={13} /></span>}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-[18px] pt-[15px]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-dim">Worktree name</span>
            <input className={fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="my-worktree" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-dim">Branch</span>
            <input className={fieldInput} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="feature/branch" autoComplete="off" />
          </label>
        </div>
        <div className="min-h-[16px] px-[18px] pt-[9px] text-xs text-ink-faint">
          {name && (
            <>Creates worktree <code className="rounded border border-line-soft bg-app px-1 font-mono text-ink-dim">{sanitize(name)}</code>{baseBranch ? <> from <code className="rounded border border-line-soft bg-app px-1 font-mono text-ink-dim">{baseBranch}</code></> : null}</>
          )}
        </div>

        <div className="px-[18px] pb-1 pt-[14px]">
          {agents.length > 1 && (
            <label className="mb-2.5 flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-dim">Agent</span>
              <select
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                className={`${fieldInput} cursor-pointer`}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.command}>{a.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-dim">
              Prompt <span className="font-normal text-ink-ghost">— optional, starts a {agentName} session</span>
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Implement the fix described in the issue and add a regression test."
              className={`${fieldInput} min-h-[58px] resize-y font-ui leading-normal`}
            />
          </label>
        </div>

        {error && <div className="px-[18px] pt-1.5 text-xs text-del">{error}</div>}

        <div className="flex justify-end gap-[9px] px-[18px] pb-[18px] pt-4">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-[9px] border border-line bg-app px-4 py-[9px] text-[13px] font-semibold text-ink-dim transition hover:border-[#30343c] hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-[9px] border border-ember bg-ember px-4 py-[9px] text-[13px] font-semibold text-[#1a1206] transition hover:border-ember-strong hover:bg-ember-strong disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create worktree'}
          </button>
        </div>
      </form>
    </div>
  );
}
