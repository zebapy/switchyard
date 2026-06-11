import { useMemo } from 'react';
import { html as renderDiffHtml } from 'diff2html';
import { ColorSchemeType } from 'diff2html/lib/types';
import 'diff2html/bundles/css/diff2html.min.css';
import './diff2html-theme.css';
import type { DiffSource, FileStatus } from '../../types/gitpanel';
import { useFileDiff } from './useGitData';
import { ChevronIcon, ExternalLinkIcon } from '../icons';
import { STATUS_COLOR, STATUS_SHORT, basename, dirname } from './fileStatus';

interface FileDiffSectionProps {
  /** Repo root. */
  path: string;
  /** Repo-relative file whose diff is shown. */
  file: FileStatus;
  source: DiffSource;
  expanded: boolean;
  onToggle: () => void;
  /** Open this single file's diff as its own full workspace tab. */
  onOpenInTab: () => void;
}

/** The diff body for one file — fetched lazily (only mounted while expanded). */
function DiffBody({ path, file, source }: { path: string; file: string; source: DiffSource }) {
  const { diff, loading, error } = useFileDiff(path, file, source);

  const markup = useMemo(() => {
    if (!diff.trim()) return '';
    return renderDiffHtml(diff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'line-by-line',
      colorScheme: ColorSchemeType.DARK,
    });
  }, [diff]);

  if (error) return <p className="px-3 py-2 text-[12px] text-del">{error}</p>;
  if (loading && !markup) return <p className="px-3 py-2 text-[12px] text-ink-faint">Loading diff…</p>;
  if (!markup) {
    return (
      <p className="px-3 py-2 text-[12px] text-ink-faint">No textual diff (binary file or no changes).</p>
    );
  }

  // diff2html escapes file content, so this generated markup is safe to inject.
  // `sy-stacked-diff` hides diff2html's own per-file header (we render our own)
  // and strips its borders so sections sit flush in the stack.
  return <div className="sy-stacked-diff text-[12px]" dangerouslySetInnerHTML={{ __html: markup }} />;
}

export function FileDiffSection({ path, file, source, expanded, onToggle, onOpenInTab }: FileDiffSectionProps) {
  const dir = dirname(file.path);
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="group flex items-center gap-2 bg-side px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          title={file.path}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px] text-ink-dim hover:text-ink"
        >
          <span className="grid w-3 flex-none place-items-center text-ink-faint">
            <ChevronIcon size={10} className={expanded ? 'rotate-90' : ''} />
          </span>
          <span className={`w-3 flex-none text-center font-mono text-[11px] ${STATUS_COLOR[file.status] ?? 'text-ink-faint'}`}>
            {STATUS_SHORT[file.status] ?? '?'}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono">
            {basename(file.path)}
            {dir && <span className="ml-1.5 text-[11px] text-ink-ghost">{dir}</span>}
          </span>
        </button>
        {file.added > 0 && <span className="flex-none font-mono text-[11px] text-green">+{file.added}</span>}
        {file.deleted > 0 && <span className="flex-none font-mono text-[11px] text-del">−{file.deleted}</span>}
        <button
          type="button"
          onClick={onOpenInTab}
          title="Open this file's diff in a tab"
          aria-label="Open this file's diff in a tab"
          className="grid size-[22px] flex-none place-items-center rounded text-ink-faint opacity-0 transition hover:bg-hover hover:text-ink focus:opacity-100 group-hover:opacity-100"
        >
          <ExternalLinkIcon size={13} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-line">
          <DiffBody path={path} file={file.path} source={source} />
        </div>
      )}
    </div>
  );
}
