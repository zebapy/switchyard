import { lazy, Suspense } from 'react';
import type { PaneInfo } from '../types/pane';
import { paneLabel } from './zenData';

// The same heavy pane components the standard layout uses — lazy so Zen only
// pulls xterm / diff2html / shiki for the kind actually focused. We render the
// body without PaneContainer's toolbar (no split/close) to keep Focus quiet.
const TerminalPane = lazy(() =>
  import('../components/Terminal/TerminalPane').then((m) => ({ default: m.TerminalPane })),
);
const DiffPane = lazy(() => import('../components/Workspace/DiffPane').then((m) => ({ default: m.DiffPane })));
const AllDiffsPane = lazy(() => import('../components/Workspace/AllDiffsPane').then((m) => ({ default: m.AllDiffsPane })));
const FilePane = lazy(() => import('../components/Workspace/FilePane').then((m) => ({ default: m.FilePane })));

interface ZenFocusProps {
  info: PaneInfo;
  projectName: string;
  worktreeName: string;
}

function PaneBody({ info }: { info: PaneInfo }) {
  if (info.kind === 'Diff') return <DiffPane paneInfo={info} />;
  if (info.kind === 'DiffAll') return <AllDiffsPane paneInfo={info} />;
  if (info.kind === 'File') return <FilePane paneInfo={info} />;
  return (
    <TerminalPane
      paneId={info.id}
      kind={info.kind}
      cwd={info.cwd}
      command={info.command}
      tmuxSession={info.tmuxSession}
      agent={info.agent}
      isActive
    />
  );
}

export function ZenFocus({ info, projectName, worktreeName }: ZenFocusProps) {
  return (
    <div className="m-3.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-canvas shadow-[0_0_0_1px_rgba(87,201,138,0.25),0_0_34px_rgba(87,201,138,0.10)]">
      <div className="flex flex-none items-center justify-between border-b border-line-soft px-[18px] py-3">
        <div className="flex items-center gap-2 font-mono text-[12px] text-ink-faint">
          <span>~/{projectName}</span>
          <span className="text-ink-ghost">›</span>
          <span>{worktreeName}</span>
          <span className="text-ink-ghost">›</span>
          <span className="font-semibold text-ink">{paneLabel(info)}</span>
        </div>
        <span className="rounded-md bg-[rgba(87,201,138,0.14)] px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.1em] text-green">
          ● FOCUS
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
        <Suspense fallback={null}>
          <PaneBody info={info} />
        </Suspense>
      </div>
      <div className="flex flex-none items-center gap-3.5 border-t border-line-soft px-[18px] py-2.5 font-mono text-[11px] text-ink-faint">
        <span className="rounded-md bg-[rgba(87,201,138,0.14)] px-2 py-[3px] text-[10px] font-semibold tracking-[0.1em] text-green">
          FOCUS
        </span>
        <span className="text-ink-dim">^← escape pane</span>
        <span className="text-ink-dim">⌘K actions</span>
        <span className="text-ink-dim">⌘P jump</span>
        <span className="text-ink-ghost">every other key → pane</span>
      </div>
    </div>
  );
}
