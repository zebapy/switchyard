import { lazy, memo, Suspense } from 'react';
import { useWorkspaceStore } from '../../stores/workspace';
import { AiIcon, TermIcon, SplitSquareIcon, CloseIcon, CodeIcon } from '../icons';
import type { PaneInfo } from '../../types/pane';

// Each pane type carries a heavy dependency (xterm, diff2html, shiki/markdown).
// Splitting them means opening a workspace pulls only what the open panes need —
// a terminal-only tab never loads diff2html or the shiki highlighter.
const TerminalPane = lazy(() =>
  import('../Terminal/TerminalPane').then((m) => ({ default: m.TerminalPane })),
);
const DiffPane = lazy(() => import('./DiffPane').then((m) => ({ default: m.DiffPane })));
const FilePane = lazy(() => import('./FilePane').then((m) => ({ default: m.FilePane })));

interface PaneContainerProps {
  paneInfo: PaneInfo;
  isActive: boolean;
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

// Memoized: the per-pane selector in SplitPane keeps paneInfo reference-stable
// unless this pane actually changed, so unrelated panes' updates are skipped.
export const PaneContainer = memo(function PaneContainer({ paneInfo, isActive }: PaneContainerProps) {
  const closePane = useWorkspaceStore((s) => s.closePane);
  const splitPane = useWorkspaceStore((s) => s.splitPane);

  const isAi = paneInfo.kind === 'Agent' && !paneInfo.agentExited;
  const isDiff = paneInfo.kind === 'Diff';
  const isFile = paneInfo.kind === 'File';
  const title = isDiff
    ? basename(paneInfo.diffFile ?? paneInfo.cwd)
    : isFile
      ? basename(paneInfo.filePath ?? paneInfo.cwd)
      : paneInfo.title ?? basename(paneInfo.cwd) ?? 'Terminal';

  const actBtn = 'grid size-[26px] place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-ink';

  return (
    <div className={`flex h-full w-full flex-col overflow-hidden ${isActive ? 'z-[1] shadow-[inset_0_0_0_1.5px_var(--color-ember-edge)]' : ''}`}>
      <div className="flex flex-none items-center gap-2 border-b border-line bg-side px-3.5 py-[11px]">
        <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-ink-dim">
          <span className={`inline-flex ${isAi ? 'text-ai' : 'text-ink-faint'}`}>
            {isDiff || isFile ? <CodeIcon size={13} /> : isAi ? <AiIcon size={13} /> : <TermIcon size={13} />}
          </span>
          <span className="truncate font-semibold text-ink">{title}</span>
        </div>
        <div className="ml-auto flex flex-none gap-[3px]">
          <button className={actBtn} title="Split right" onClick={(e) => { e.stopPropagation(); splitPane(paneInfo.id, 'horizontal', 'Shell', paneInfo.cwd); }}>
            <SplitSquareIcon size={14} />
          </button>
          <button className={actBtn} title="Split down" onClick={(e) => { e.stopPropagation(); splitPane(paneInfo.id, 'vertical', 'Shell', paneInfo.cwd); }}>
            <span className="rotate-90"><SplitSquareIcon size={14} /></span>
          </button>
          <button className={actBtn} title="Close" onClick={(e) => { e.stopPropagation(); closePane(paneInfo.id); }}>
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
        <Suspense fallback={null}>
          {isDiff ? (
            <DiffPane paneInfo={paneInfo} />
          ) : isFile ? (
            <FilePane paneInfo={paneInfo} />
          ) : (
            <TerminalPane
              paneId={paneInfo.id}
              kind={paneInfo.kind}
              cwd={paneInfo.cwd}
              command={paneInfo.command}
              tmuxSession={paneInfo.tmuxSession}
              agent={paneInfo.agent}
              isActive={isActive}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
});
