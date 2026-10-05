import { PatchDiffView } from './PatchDiffView';
import type { DiffSource } from '../../types/gitpanel';

interface DiffViewProps {
  file: string | null;
  diff: string;
  loading: boolean;
  error: string;
  /** Repo root — required to open a comment chat. */
  cwd?: string;
  /** Which diff is shown — labels the comment prompt. */
  source?: DiffSource;
  /** The Diff pane's id — locates the window to open the chat in. */
  paneId?: string;
}

export function DiffView({ file, diff, loading, error, cwd, source, paneId }: DiffViewProps) {
  if (!file) {
    return (
      <div className="grid flex-1 place-items-center px-4 text-center text-[12px] text-ink-faint">
        Select a file to view its diff.
      </div>
    );
  }

  if (error) {
    return <div className="flex-1 px-4 py-3 text-[12px] text-del">{error}</div>;
  }

  if (loading && !diff.trim()) {
    return <div className="flex-1 px-4 py-3 text-[12px] text-ink-faint">Loading diff…</div>;
  }

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto">
      <PatchDiffView diff={diff} file={file} cwd={cwd} source={source ?? 'unstaged'} paneId={paneId} />
    </div>
  );
}
