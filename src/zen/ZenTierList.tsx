import { AiIcon, TermIcon, CodeIcon } from '../components/icons';
import type { PaneInfo } from '../types/pane';
import type { ProjectRow, WorktreeRow, PaneRow } from './zenData';
import { paneLabel } from './zenData';

interface ZenTierListProps {
  tier: 'projects' | 'worktrees' | 'panes';
  projectRows: ProjectRow[];
  worktreeRows: WorktreeRow[];
  paneRows: PaneRow[];
  cursor: number;
  onHover: (index: number) => void;
  onActivate: (index: number) => void;
}

const rowBase =
  'group relative flex cursor-pointer items-center gap-3.5 rounded-[10px] border border-transparent px-[18px] py-[13px]';
const rowSelected = 'border-ember-edge bg-ember-tint shadow-[inset_3px_0_0_var(--color-ember)]';

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
  onHover,
  onActivate,
}: ZenTierListProps) {
  const rowClass = (index: number) => `${rowBase} ${index === cursor ? rowSelected : 'hover:bg-hover'}`;

  if (tier === 'projects') {
    return (
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3.5">
        {projectRows.map((row, i) => (
          <div key={row.path} className={rowClass(i)} onMouseEnter={() => onHover(i)} onClick={() => onActivate(i)}>
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className={i === cursor ? 'text-ember' : 'text-ink-ghost'}>▸</span>
              <span className="font-mono text-[15px] font-semibold text-ink">{row.name}</span>
            </span>
            <span className="font-mono text-[12px] text-ink-faint">
              {row.worktrees} workspace{row.worktrees === 1 ? '' : 's'} · {row.panes} pane{row.panes === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (tier === 'worktrees') {
    return (
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3.5">
        {worktreeRows.map((row, i) => (
          <div key={row.path} className={rowClass(i)} onMouseEnter={() => onHover(i)} onClick={() => onActivate(i)}>
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className={i === cursor ? 'text-ember' : 'text-ink-ghost'}>▸</span>
              <span className="truncate font-mono text-[15px] font-semibold text-ink">{row.name}</span>
              <span
                className={`rounded border px-1.5 py-px font-mono text-[9px] tracking-[0.08em] ${
                  row.isMain ? 'border-ember-edge text-ember' : 'border-line text-ink-faint'
                }`}
              >
                {row.isMain ? 'ROOT' : 'WORKTREE'}
              </span>
            </span>
            <span className="font-mono text-[12px] text-ink-faint">
              {row.panes} pane{row.panes === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (paneRows.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <div className="px-[18px] py-[13px] font-mono text-[14px] text-ink-faint">
          no panes — press <span className="text-ember">→</span> to start an agent here
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3.5">
      {paneRows.map((row, i) => (
        <div key={row.paneId} className={rowClass(i)} onMouseEnter={() => onHover(i)} onClick={() => onActivate(i)}>
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <PaneIcon info={row.info} />
            <span className="truncate text-[15px] text-ink">{paneLabel(row.info)}</span>
          </span>
          <span className={`font-mono text-[12px] ${i === cursor ? 'text-ember' : 'text-ink-ghost'}`}>→ focus</span>
        </div>
      ))}
    </div>
  );
}
