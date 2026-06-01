import { useMemo } from 'react';
import { openPath } from '@tauri-apps/plugin-opener';
import { useFileContent } from '../GitPanel/useGitData';
import { ExternalLinkIcon } from '../icons';
import type { PaneInfo } from '../../types/pane';

interface FilePaneProps {
  paneInfo: PaneInfo;
}

/** A read-only, line-numbered view of a single file. No PTY, no diff — just the
 *  current contents, with a button to open it in an external editor. */
export function FilePane({ paneInfo }: FilePaneProps) {
  const file = paneInfo.filePath ?? null;
  const { content, loading, error } = useFileContent(paneInfo.cwd, file);

  const lines = useMemo(() => content.split('\n'), [content]);

  const openInEditor = () => {
    if (file) openPath(`${paneInfo.cwd}/${file}`).catch(() => null);
  };

  return (
    <div className="flex h-full w-full flex-col bg-canvas">
      <div className="flex flex-none items-center gap-2 border-b border-line-soft px-3 py-1.5 text-[11px] text-ink-faint">
        <span className="min-w-0 flex-1 truncate font-mono text-ink-dim" title={file ?? undefined}>
          {file}
        </span>
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
        {!error && !loading && (
          <table className="w-full border-collapse font-mono text-[12.5px] leading-relaxed">
            <tbody>
              {lines.map((line, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index} className="align-top">
                  <td className="select-none whitespace-nowrap px-3 text-right text-ink-ghost">{index + 1}</td>
                  <td className="whitespace-pre-wrap break-words pr-4 text-ink-dim">{line || ' '}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
