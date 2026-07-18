import { Fragment, useEffect, useRef } from 'react';
import { AiIcon, TermIcon, CodeIcon, PrIcon, RepoIcon, BaseBranchIcon, WorktreeIcon } from '../components/icons';
import type { PaneInfo } from '../types/pane';
import type { ProjectRow, WorktreeRow, PaneRow, PaneStatusCounts } from './zenData';
import { paneLabel, paneGroup } from './zenData';

interface ZenTierListProps {
  tier: 'projects' | 'worktrees' | 'panes';
  projectRows: ProjectRow[];
  worktreeRows: WorktreeRow[];
  paneRows: PaneRow[];
  cursor: number;
  /** Active toolbar search — drives the "no matches" empty state. */
  query: string;
  onHover: (index: number) => void;
  onActivate: (index: number) => void;
}

function NoMatches({ query }: { query: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3.5">
      <div className="px-[18px] py-[13px] font-mono text-[14px] text-ink-faint">
        No matches for “{query}”
      </div>
    </div>
  );
}

const rowBase =
  'group relative flex cursor-pointer items-center gap-3.5 rounded-[9px] px-[18px] py-[13px]';
const rowSelected = 'bg-signal-dim';

/** A group divider between the pinned rows and the rest of a tier's list. */
function SectionHeading({ label }: { label: string }) {
  return (
    <div className="px-[18px] pb-1 pt-3.5 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-dim first:pt-1">
      {label}
    </div>
  );
}

function zenPrClass(state: string, draft: boolean): string {
  const s = state.toLowerCase();
  if (s === 'merged') return 'text-ai';
  if (s === 'closed') return 'text-del';
  if (draft) return 'text-ink-dim';
  return 'text-green';
}

function ciGlyph(status: string): { glyph: string; className: string } {
  if (status === 'passing') return { glyph: '✓', className: 'text-add' };
  if (status === 'failing') return { glyph: '✗', className: 'text-del' };
  return { glyph: '◌', className: 'text-[#f9e2af]' };
}

/** Colored count pips summarizing a workspace's live-agent statuses.
 *  Ordered by urgency: needs-input → working → idle; zero-count pips are hidden. */
function StatusPips({ status }: { status: PaneStatusCounts }) {
  const pips = [
    { count: status.waiting, dot: 'bg-ember', text: 'text-ember', label: 'needs input', pulse: false },
    { count: status.working, dot: 'bg-green', text: 'text-green', label: 'working', pulse: true },
    { count: status.idle, dot: 'bg-ink-faint', text: 'text-ink-faint', label: 'idle', pulse: false },
  ].filter((p) => p.count > 0);
  if (pips.length === 0) return null;
  return (
    <span className="flex items-center gap-2">
      {pips.map((p) => (
        <span key={p.label} className={`flex items-center gap-1 font-mono text-[11px] ${p.text}`} title={`${p.count} ${p.label}`}>
          <span className={`size-1.5 shrink-0 rounded-full ${p.dot} ${p.pulse ? 'animate-pulse-dot' : ''}`} />
          {p.count}
        </span>
      ))}
    </span>
  );
}

/** A single live-agent pane's status: colored dot + label. Nothing for
 *  non-agent panes or exited agents. */
function PaneStatusPip({ info }: { info: PaneInfo }) {
  if (info.kind !== 'Agent' || info.agentExited) return null;
  const map = {
    waiting: { dot: 'bg-ember', text: 'text-ember', label: 'needs input', pulse: false },
    working: { dot: 'bg-green', text: 'text-green', label: 'working', pulse: true },
    idle: { dot: 'bg-ink-faint', text: 'text-ink-faint', label: 'idle', pulse: false },
  } as const;
  const pip = map[info.agentStatus ?? 'idle'];
  return (
    <span className={`flex items-center gap-1.5 font-mono text-[11px] ${pip.text}`} title={pip.label}>
      <span className={`size-1.5 shrink-0 rounded-full ${pip.dot} ${pip.pulse ? 'animate-pulse-dot' : ''}`} />
      {pip.label}
    </span>
  );
}

function PaneIcon({ info }: { info: PaneInfo }) {
  const isAgent = info.kind === 'Agent' && !info.agentExited;
  if (info.kind === 'Diff' || info.kind === 'DiffAll' || info.kind === 'File') {
    return <CodeIcon size={14} />;
  }
  return (
    <span className={isAgent ? 'text-ai' : 'text-ink-faint'}>
      {isAgent ? <AiIcon size={14} /> : <TermIcon size={14} />}
    </span>
  );
}

export function ZenTierList({
  tier,
  projectRows,
  worktreeRows,
  paneRows,
  cursor,
  query,
  onHover,
  onActivate,
}: ZenTierListProps) {
  const rowClass = (index: number) => `${rowBase} ${index === cursor ? rowSelected : 'hover:bg-hover'}`;
  const searching = query.trim().length > 0;

  // Keyboard nav moves the cursor but the scroll container won't follow on its
  // own — pull the selected row into view whenever the cursor or tier changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.querySelector('[data-cursor]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, tier]);

  if (tier === 'projects') {
    if (searching && projectRows.length === 0) return <NoMatches query={query} />;
    // Two sections — "Pinned" then "Projects" — but only once both groups exist.
    const projectSection = (row: ProjectRow) => (row.pinned ? 'Pinned' : 'Projects');
    // Search re-ranks by match score, breaking the pinned-first grouping, so
    // only section a static (unsearched) list.
    const sectioned = !searching && projectRows.some((r) => r.pinned) && projectRows.some((r) => !r.pinned);
    return (
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto p-3.5">
        {projectRows.map((row, i) => (
          <Fragment key={row.path}>
            {sectioned && (i === 0 || projectSection(projectRows[i - 1]) !== projectSection(row)) && (
              <SectionHeading label={projectSection(row)} />
            )}
            <div className={rowClass(i)} data-cursor={i === cursor ? '' : undefined} onMouseEnter={() => onHover(i)} onClick={() => onActivate(i)}>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className={i === cursor ? 'text-signal' : 'text-ink-dim'}><RepoIcon size={15} /></span>
                <span className={`font-mono text-[15px] font-semibold ${i === cursor ? 'text-signal' : 'text-ink'}`}>{row.name}</span>
              </span>
              <span className="font-mono text-[12px] text-ink-faint">
                {row.worktrees} workspace{row.worktrees === 1 ? '' : 's'} · {row.panes} pane{row.panes === 1 ? '' : 's'}
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    );
  }

  if (tier === 'worktrees') {
    if (searching && worktreeRows.length === 0) return <NoMatches query={query} />;
    // "Pinned" (root + pinned worktrees) then "Worktrees". The leading icon
    // (base-branch vs worktree) now distinguishes root from a regular worktree.
    const worktreeSection = (row: WorktreeRow) => (row.isMain || row.pinned ? 'Pinned' : 'Worktrees');
    const sectioned =
      !searching &&
      worktreeRows.some((r) => r.isMain || r.pinned) &&
      worktreeRows.some((r) => !(r.isMain || r.pinned));
    return (
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto p-3.5">
        {worktreeRows.map((row, i) => (
          <Fragment key={row.path}>
            {sectioned && (i === 0 || worktreeSection(worktreeRows[i - 1]) !== worktreeSection(row)) && (
              <SectionHeading label={worktreeSection(row)} />
            )}
            <div className={rowClass(i)} data-cursor={i === cursor ? '' : undefined} onMouseEnter={() => onHover(i)} onClick={() => onActivate(i)}>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className={i === cursor ? 'text-signal' : 'text-ink-dim'}
                  title={row.isMain ? 'Root worktree' : 'Worktree'}
                >
                  {row.isMain ? <BaseBranchIcon size={14} /> : <WorktreeIcon size={14} />}
                </span>
                <span className={`truncate font-mono text-[15px] font-semibold ${i === cursor ? 'text-signal' : 'text-ink'}`}>{row.name}</span>
              </span>
              <span className="flex items-center gap-3">
                <StatusPips status={row.status} />
                {row.pr && (
                  <span
                    className={`flex items-center gap-1 font-mono text-[10px] ${zenPrClass(row.pr.state, row.pr.draft)}`}
                    title={`${row.pr.draft ? 'Draft pull request' : 'Pull request'} #${row.pr.number} (${row.pr.state.toLowerCase()}): ${row.pr.title}`}
                  >
                    <PrIcon size={11} />
                    #{row.pr.number}{row.pr.draft ? ' draft' : row.pr.state.toLowerCase() === 'open' ? '' : ` ${row.pr.state.toLowerCase()}`}
                    {row.pr.ci_status && (
                      <span className={ciGlyph(row.pr.ci_status).className}>{ciGlyph(row.pr.ci_status).glyph}</span>
                    )}
                  </span>
                )}
                <span className="font-mono text-[12px] text-ink-faint">
                  {row.panes} pane{row.panes === 1 ? '' : 's'}
                </span>
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    );
  }

  if (paneRows.length === 0) {
    if (searching) return <NoMatches query={query} />;
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <div className="px-[18px] py-[13px] font-mono text-[14px] text-ink-faint">
          no panes — press <span className="text-signal">→</span> to start an agent here
        </div>
      </div>
    );
  }

  // "Agents" (top) then "Terminals" — headings show even for a lone group.
  // Rows arrive agents-first from the sort, so headings stay contiguous.
  const paneSectioned = !searching;
  return (
    <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto p-3.5">
      {paneRows.map((row, i) => (
        <Fragment key={row.paneId}>
          {paneSectioned && (i === 0 || paneGroup(paneRows[i - 1].info) !== paneGroup(row.info)) && (
            <SectionHeading label={paneGroup(row.info)} />
          )}
          <div className={rowClass(i)} data-cursor={i === cursor ? '' : undefined} onMouseEnter={() => onHover(i)} onClick={() => onActivate(i)}>
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <PaneIcon info={row.info} />
              <span className={`truncate text-[15px] ${i === cursor ? 'text-signal' : 'text-ink'}`}>{paneLabel(row.info)}</span>
            </span>
            <PaneStatusPip info={row.info} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
