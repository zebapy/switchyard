import { lazy, Suspense } from 'react';
import type { PaneInfo } from '../types/pane';

// The same heavy pane components the standard layout uses — lazy so Zen only
// pulls xterm / diff2html / shiki for the kind actually focused. We render the
// body without PaneContainer's toolbar (no split/close) to keep Focus quiet.
const TerminalPane = lazy(() =>
  import('../components/Terminal/TerminalPane').then((m) => ({ default: m.TerminalPane })),
);
const DiffPane = lazy(() => import('../components/Workspace/DiffPane').then((m) => ({ default: m.DiffPane })));
const AllDiffsPane = lazy(() => import('../components/Workspace/AllDiffsPane').then((m) => ({ default: m.AllDiffsPane })));
const FilePane = lazy(() => import('../components/Workspace/FilePane').then((m) => ({ default: m.FilePane })));

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

/** The focused pane's body, sharing the same toolbar/footer chrome as the tier
 *  list (Focus is just a different middle region, not a separate layout). */
export function ZenFocus({ info }: { info: PaneInfo }) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
      <Suspense fallback={null}>
        <PaneBody info={info} />
      </Suspense>
    </div>
  );
}
