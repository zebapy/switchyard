import { useState } from 'react';
import type { DiffAgentHooks, DiffSource, FileStatus } from '../../types/gitpanel';
import { FileDiffSection } from './FileDiffSection';

interface AllDiffsViewProps {
  /** Repo root. */
  path: string;
  source: DiffSource;
  /** Branch a `base` diff compares against; `null` = repo default. */
  base?: string | null;
  files: FileStatus[];
  loading: boolean;
  error: string;
  /** Open one file's diff as its own full workspace tab. */
  onOpenFileInTab: (file: string) => void;
  /** Host pane id — lets a line comment open a chat in the right window.
   *  Absent in the sidebar inline view. */
  paneId?: string;
  /** Host-view hooks (Zen): queue comments / launch prompts in a focused pane. */
  hooks?: DiffAgentHooks;
}

/** PR-style stacked diffs: every changed file's diff shown inline and
 *  collapsible, so the whole change reads top-to-bottom without clicking each
 *  file. Used both in the Git panel (inline view) and the full-width tab. */
export function AllDiffsView({ path, source, base = null, files, loading, error, onOpenFileInTab, paneId, hooks }: AllDiffsViewProps) {
  // Track which files the user explicitly collapsed; everything else is open.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (file: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const collapseAll = () => setCollapsed(new Set(files.map((f) => f.path)));
  const expandAll = () => setCollapsed(new Set());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2 px-3 py-1.5 text-[11.5px] text-ink-faint">
        <span>
          {files.length} {files.length === 1 ? 'file' : 'files'} changed
        </span>
        {files.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={expandAll} className="rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink">
              Expand all
            </button>
            <span className="text-ink-ghost">·</span>
            <button type="button" onClick={collapseAll} className="rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink">
              Collapse all
            </button>
          </div>
        )}
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        {error && <p className="px-1 py-2 text-[12px] text-del">{error}</p>}
        {!error && loading && files.length === 0 && (
          <p className="px-1 py-2 text-[12px] text-ink-faint">Loading…</p>
        )}
        {!error && !loading && files.length === 0 && (
          <p className="px-1 py-2 text-[12px] text-ink-faint">No changes.</p>
        )}

        {files.map((file) => (
          <FileDiffSection
            key={file.path}
            path={path}
            file={file}
            source={source}
            base={base}
            expanded={!collapsed.has(file.path)}
            onToggle={() => toggle(file.path)}
            onOpenInTab={() => onOpenFileInTab(file.path)}
            paneId={paneId}
            hooks={hooks}
          />
        ))}
      </div>
    </div>
  );
}
