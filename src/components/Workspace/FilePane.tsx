import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';
import type { ThemedToken } from 'shiki';
import { useFileContent } from '../GitPanel/useGitData';
import { useHighlightedLines } from './highlight';
import { MarkdownView } from './MarkdownView';
import { ExternalLinkIcon } from '../icons';
import type { PaneInfo } from '../../types/pane';

interface FilePaneProps {
  paneInfo: PaneInfo;
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mdx']);

function isMarkdownFile(file: string | null): boolean {
  if (!file) return false;
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return MARKDOWN_EXTENSIONS.has(ext);
}

// shiki FontStyle bit flags (from @shikijs/vscode-textmate).
const ITALIC = 1;
const BOLD = 2;
const UNDERLINE = 4;

function tokenStyle(token: ThemedToken): CSSProperties {
  const style: CSSProperties = {};
  if (token.color) style.color = token.color;
  const fontStyle = token.fontStyle ?? 0;
  if (fontStyle & ITALIC) style.fontStyle = 'italic';
  if (fontStyle & BOLD) style.fontWeight = 'bold';
  if (fontStyle & UNDERLINE) style.textDecoration = 'underline';
  return style;
}

function HighlightedLine({ tokens }: { tokens: ThemedToken[] }) {
  if (tokens.length === 0) return <>{' '}</>;
  return (
    <>
      {tokens.map((token, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={index} style={tokenStyle(token)}>
          {token.content}
        </span>
      ))}
    </>
  );
}

/** A read-only, line-numbered view of a single file. No PTY, no diff — just the
 *  current contents with syntax highlighting, plus a button to open it in an
 *  external editor. */
export function FilePane({ paneInfo }: FilePaneProps) {
  const file = paneInfo.filePath ?? null;
  const { content, loading, error } = useFileContent(paneInfo.cwd, file);

  const isMarkdown = isMarkdownFile(file);
  // Markdown files default to the rendered view; everything else is always raw.
  const [showRendered, setShowRendered] = useState(true);
  const rendered = isMarkdown && showRendered;

  const lines = useMemo(() => content.split('\n'), [content]);
  const highlighted = useHighlightedLines(content, file);
  // Only highlight when token lines align with plain lines, else fall back.
  const tokenLines = highlighted && highlighted.length === lines.length ? highlighted : null;

  const openInEditor = () => {
    if (file) openPath(`${paneInfo.cwd}/${file}`).catch(() => null);
  };

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <div className="flex flex-none items-center gap-2 border-b border-line-soft px-3 py-1.5 text-[11px] text-ink-faint">
        <span className="min-w-0 flex-1 truncate font-mono text-ink-dim" title={file ?? undefined}>
          {file}
        </span>
        {isMarkdown && (
          <div className="flex flex-none items-center rounded-md border border-line p-0.5">
            <button
              type="button"
              onClick={() => setShowRendered(true)}
              className={
                'rounded px-2 py-0.5 text-[11px] transition ' +
                (rendered ? 'bg-active text-ember' : 'text-ink-faint hover:text-ink')
              }
            >
              Rendered
            </button>
            <button
              type="button"
              onClick={() => setShowRendered(false)}
              className={
                'rounded px-2 py-0.5 text-[11px] transition ' +
                (rendered ? 'text-ink-faint hover:text-ink' : 'bg-active text-ember')
              }
            >
              Raw
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={openInEditor}
          disabled={!file}
          className="inline-flex flex-none items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] text-ink-dim transition hover:border-ember-edge hover:text-ember disabled:opacity-40"
        >
          <ExternalLinkIcon size={12} /> Open in editor
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        {error && <p className="px-3 py-2 text-[12px] text-del">{error}</p>}
        {!error && loading && <p className="px-3 py-2 text-[12px] text-ink-faint">Loading…</p>}
        {!error && !loading && rendered && <MarkdownView content={content} />}
        {!error && !loading && !rendered && (
          <table className="w-full border-collapse font-mono text-[12.5px] leading-relaxed">
            <tbody>
              {lines.map((line, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index} className="align-top">
                  <td className="select-none whitespace-nowrap px-3 text-right text-ink-ghost">{index + 1}</td>
                  <td className="whitespace-pre-wrap break-words pr-4 text-ink-dim">
                    {tokenLines ? <HighlightedLine tokens={tokenLines[index]} /> : line || ' '}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
