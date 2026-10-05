import { useEffect, useRef, useState } from 'react';
import { ContextMenu } from '@base-ui-components/react/context-menu';
import type { DiffAgentHooks, DiffSource, FileStatus } from '../../types/gitpanel';
import { useWorkspaceStore } from '../../stores/workspace';
import { openAgentChat } from '../../lib/openAgentChat';
import { useFileDiff } from './useGitData';
import { PatchDiffView } from './PatchDiffView';
import { SOURCE_LABEL } from './diffPrompts';
import { ChevronIcon, ExternalLinkIcon, SparkleIcon } from '../icons';
import { STATUS_COLOR, STATUS_SHORT, basename, dirname } from './fileStatus';

const menuPopupClass =
  'z-[300] min-w-[180px] rounded-[10px] border border-line bg-side p-[5px] font-ui ' +
  'text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)] outline-none';
const menuItemClass =
  'flex items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] cursor-pointer select-none ' +
  'text-ink-dim outline-none data-[highlighted]:bg-hover data-[highlighted]:text-ink';

interface FileDiffSectionProps {
  /** Repo root. */
  path: string;
  /** Repo-relative file whose diff is shown. */
  file: FileStatus;
  source: DiffSource;
  /** Branch a `base` diff compares against; `null` = repo default. */
  base?: string | null;
  expanded: boolean;
  onToggle: () => void;
  /** Open this single file's diff as its own full workspace tab. */
  onOpenInTab: () => void;
  /** Host pane id — lets a line comment open a chat in the right window.
   *  Absent for the sidebar inline view, which falls back to the active window. */
  paneId?: string;
  /** Host-view hooks (Zen): queue comments / launch prompts in a focused pane. */
  hooks?: DiffAgentHooks;
}

/** The diff body for one file — fetched lazily (only mounted while expanded). */
function DiffBody({
  path,
  file,
  source,
  base,
  paneId,
  hooks,
}: {
  path: string;
  file: string;
  source: DiffSource;
  base: string | null;
  paneId?: string;
  hooks?: DiffAgentHooks;
}) {
  const { diff, loading, error } = useFileDiff(path, file, source, base);

  if (error) return <p className="px-3 py-2 text-[12px] text-del">{error}</p>;
  if (loading && !diff.trim()) return <p className="px-3 py-2 text-[12px] text-ink-faint">Loading diff…</p>;

  return (
    <div className="overflow-hidden rounded-b-[5px]">
      <PatchDiffView diff={diff} file={file} cwd={path} source={source} paneId={paneId} hooks={hooks} />
    </div>
  );
}

/** Rough rendered height of a file's diff, for the offscreen placeholder.
 *  Approximate is fine — once the body has mounted we swap in the measured
 *  height, so this only governs the very first scroll-past. */
const DIFF_LINE_HEIGHT = 19;
function estimateBodyHeight(file: FileStatus): number {
  const lines = file.added + file.deleted + 2; // +2 ≈ hunk header rows
  return Math.min(Math.max(lines, 3), 400) * DIFF_LINE_HEIGHT;
}

export function FileDiffSection({ path, file, source, base = null, expanded, onToggle, onOpenInTab, paneId, hooks }: FileDiffSectionProps) {
  const dir = dirname(file.path);
  const findWindowForPane = useWorkspaceStore((s) => s.findWindowForPane);

  const explainFile = () => {
    const prompt = [
      `Explain the changes to ${file.path} in the ${SOURCE_LABEL[source]} diff.`,
      'Review the diff and summarize what changed and why. Be concise.',
    ].join('\n');
    if (hooks) {
      hooks.launch(prompt, `${basename(file.path)} diff`);
      return;
    }
    const projectPath = (paneId ? findWindowForPane(paneId)?.projectPath : null) ?? path;
    openAgentChat({ projectPath, cwd: path, label: `${basename(file.path)} diff`, prompt });
  };

  // Lazy-mount: only render the (expensive) diff body while the section is near
  // the viewport. Offscreen sections collapse to a placeholder of the last
  // measured height, so a large "vs base" diff keeps only the on-screen files'
  // rendered diffs in the DOM.
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!expanded) {
      setInView(false);
      return;
    }
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  // Remember the body's real height while it's mounted, so the placeholder that
  // replaces it on scroll-away doesn't jump the scrollbar.
  useEffect(() => {
    if (!inView) return;
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const height = el.offsetHeight;
      if (height > 0) setMeasuredHeight(height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  return (
    <div ref={sectionRef} className="rounded-md border border-line">
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <div
              className={`group flex items-center gap-2 rounded-t-[5px] bg-side px-2 py-1.5 ${
                expanded ? '' : 'rounded-b-[5px]'
              }`}
            />
          }
        >
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
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Positioner className="z-[300]">
            <ContextMenu.Popup className={menuPopupClass}>
              <ContextMenu.Item className={menuItemClass} onClick={explainFile}>
                <span className="grid w-4 place-items-center"><SparkleIcon size={14} /></span>
                Explain this file
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {expanded && (
        <div ref={bodyRef} className="border-t border-line">
          {inView ? (
            <DiffBody path={path} file={file.path} source={source} base={base} paneId={paneId} hooks={hooks} />
          ) : (
            <div style={{ height: measuredHeight ?? estimateBodyHeight(file) }} aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}
