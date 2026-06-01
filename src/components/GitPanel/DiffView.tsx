import { useMemo, useRef } from 'react';
import { html as renderDiffHtml } from 'diff2html';
import { ColorSchemeType } from 'diff2html/lib/types';
import 'diff2html/bundles/css/diff2html.min.css';
import './diff2html-theme.css';
import { DiffCommentOverlay } from './DiffCommentOverlay';
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const markup = useMemo(() => {
    if (!diff.trim()) return '';
    return renderDiffHtml(diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'line-by-line',
      colorScheme: ColorSchemeType.DARK,
    });
  }, [diff]);

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

  if (loading && !markup) {
    return <div className="flex-1 px-4 py-3 text-[12px] text-ink-faint">Loading diff…</div>;
  }

  if (!markup) {
    return (
      <div className="grid flex-1 place-items-center px-4 text-center text-[12px] text-ink-faint">
        No textual diff (binary file or no changes).
      </div>
    );
  }

  const canComment = Boolean(cwd && paneId);

  // diff2html escapes file content, so this generated markup is safe to inject.
  // pl-[22px] reserves a left gutter for the hover comment affordance.
  return (
    <div className="scroll-thin relative min-h-0 flex-1 overflow-auto text-[12px]" ref={scrollRef}>
      <div className="pl-[22px]" dangerouslySetInnerHTML={{ __html: markup }} />
      {canComment && (
        <DiffCommentOverlay
          scrollRef={scrollRef}
          markup={markup}
          file={file}
          cwd={cwd as string}
          source={source ?? 'unstaged'}
          paneId={paneId as string}
        />
      )}
    </div>
  );
}
