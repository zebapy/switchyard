import { useMemo, useState, type CSSProperties } from 'react';
import {
  parsePatchFiles,
  type DiffLineAnnotation,
  type FileDiffOptions,
  type SelectedLineRange,
} from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs/react';
import type { DiffAgentHooks, DiffSource } from '../../types/gitpanel';
import { useWorkspaceStore } from '../../stores/workspace';
import { openAgentChat } from '../../lib/openAgentChat';
import { basename } from './fileStatus';
import { annotationAnchorOf, buildDiffRows, lineLabelOf, rowsInRange, snippetOf } from './diffRows';
import { buildCommentPrompt, buildExplainPrompt } from './diffPrompts';
import { DiffCommentComposer } from './DiffCommentComposer';

// The theme sets its background in a lower cascade layer; unsafeCSS wins and
// ties the diff surface to the app's panel color.
const DIFF_OPTIONS_BASE: FileDiffOptions<undefined, undefined> = {
  theme: 'pierre-dark',
  themeType: 'dark',
  diffStyle: 'unified',
  disableFileHeader: true,
  hunkSeparators: 'metadata',
  lineHoverHighlight: 'number',
  enableGutterUtility: true,
  enableLineSelection: true,
  unsafeCSS: ':host { --diffs-dark-bg: #131519; }',
};

const DIFF_STYLE = {
  '--diffs-font-family': "'IBM Plex Mono', ui-monospace, monospace",
  '--diffs-font-size': '12px',
  '--diffs-header-font-family': "'Hanken Grotesk Variable', system-ui, sans-serif",
  '--diffs-addition-color-override': '#57c98a',
  '--diffs-deletion-color-override': '#f0758a',
  '--diffs-selection-color-override': '#ffae5c',
  '--diffs-bg-selection-override': 'rgba(255, 148, 56, 0.12)',
  '--diffs-bg-selection-number-override': 'rgba(255, 148, 56, 0.3)',
} as CSSProperties;

interface PatchDiffViewProps {
  /** Unified git diff for a single file. */
  diff: string;
  /** Repo-relative path of the diffed file. */
  file: string;
  /** Repo root. Line comments are disabled without it. */
  cwd?: string;
  source: DiffSource;
  /** Host pane id — locates the window a comment chat opens in. Falls back to
   *  the active window when absent. */
  paneId?: string;
  /** Host-view hooks (Zen): queue comments / launch prompts in a focused pane. */
  hooks?: DiffAgentHooks;
}

/** Renders one file's patch with @pierre/diffs, plus the line-comment composer. */
export function PatchDiffView({ diff, file, cwd, source, paneId, hooks }: PatchDiffViewProps) {
  const findWindowForPane = useWorkspaceStore((s) => s.findWindowForPane);
  const [range, setRange] = useState<SelectedLineRange | null>(null);

  const fileDiff = useMemo(() => parsePatchFiles(diff)[0]?.files[0] ?? null, [diff]);
  const rows = useMemo(() => (fileDiff ? buildDiffRows(fileDiff) : []), [fileDiff]);
  const selectedRows = useMemo(() => (range ? rowsInRange(rows, range) : []), [rows, range]);
  const canComment = Boolean(cwd);

  const options = useMemo<FileDiffOptions<undefined, undefined>>(() => {
    if (!canComment) return { ...DIFF_OPTIONS_BASE, enableGutterUtility: false, enableLineSelection: false };
    return {
      ...DIFF_OPTIONS_BASE,
      onGutterUtilityClick: setRange,
      onLineSelected: setRange,
    };
  }, [canComment]);

  const lineAnnotations = useMemo<DiffLineAnnotation<undefined>[]>(() => {
    const lastRow = selectedRows[selectedRows.length - 1];
    if (!lastRow) return [];
    return [annotationAnchorOf(lastRow)];
  }, [selectedRows]);

  if (!fileDiff || fileDiff.hunks.length === 0) {
    return (
      <p className="px-3 py-2 text-[12px] text-ink-faint">No textual diff (binary file or no changes).</p>
    );
  }

  const close = () => setRange(null);
  const label = `${basename(file)}:${lineLabelOf(selectedRows)}`;

  const launch = (prompt: string, agentCommand: string | undefined) => {
    if (hooks) {
      hooks.launch(prompt, label, agentCommand);
      return;
    }
    const repoRoot = cwd as string;
    const projectPath = (paneId ? findWindowForPane(paneId)?.projectPath : null) ?? repoRoot;
    openAgentChat({ projectPath, cwd: repoRoot, label, prompt, agentCommand });
  };

  const submitComment = (comment: string, agentCommand: string | undefined) => {
    if (hooks) {
      hooks.queueComment({
        file,
        lineLabel: lineLabelOf(selectedRows),
        snippet: snippetOf(selectedRows),
        comment,
        source,
      });
    } else {
      launch(buildCommentPrompt({ file, source, rows: selectedRows, comment }), agentCommand);
    }
    close();
  };

  const explain = (agentCommand: string | undefined) => {
    launch(buildExplainPrompt({ file, source, rows: selectedRows }), agentCommand);
    close();
  };

  return (
    <FileDiff
      fileDiff={fileDiff}
      options={options}
      style={DIFF_STYLE}
      selectedLines={selectedRows.length > 0 ? range : null}
      lineAnnotations={lineAnnotations}
      renderAnnotation={() => (
        <DiffCommentComposer
          key={label}
          locationLabel={label}
          queuesComments={Boolean(hooks)}
          onSubmit={submitComment}
          onExplain={explain}
          onClose={close}
        />
      )}
    />
  );
}
