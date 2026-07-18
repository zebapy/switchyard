import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectsStore } from '../../stores/projects';
import { useWorkspaceStore } from '../../stores/workspace';
import type { DiffAgentHooks, DiffSource } from '../../types/gitpanel';
import { openAgentChat } from '../../lib/openAgentChat';
import { AgentGlyph, PlusIcon, CloseIcon, SparkleIcon } from '../icons';

type LineType = 'ins' | 'del' | 'cntx';

interface LineMeta {
  /** Index into the commentable-rows array. */
  index: number;
  el: HTMLTableRowElement;
  lineNo: number | null;
  /** Diff prefix: '+', '-', or ' '. */
  prefix: string;
  content: string;
  type: LineType;
}

interface DiffCommentOverlayProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Re-scan rows whenever the rendered markup changes. */
  markup: string;
  file: string;
  cwd: string;
  source: DiffSource;
  /** The host Diff pane's id — locates the window to open the chat in.
   *  Optional: the sidebar inline diff has no owning pane, so we fall back
   *  to the active window. */
  paneId?: string;
  /** When set (Zen), comments queue and prompts launch through the host view
   *  instead of opening a workspace chat directly. */
  hooks?: DiffAgentHooks;
}

const SOURCE_LABEL: Record<DiffSource, string> = {
  unstaged: 'unstaged',
  staged: 'staged',
  base: 'vs base branch',
};

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

/** Row position within the scroll container's content (survives scroll + nested boxes). */
function rowBox(row: HTMLElement, root: HTMLElement): { top: number; height: number } {
  const rowRect = row.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return { top: rowRect.top - rootRect.top + root.scrollTop, height: rowRect.height };
}

function lineTypeOf(className: string): LineType | null {
  if (className.includes('d2h-info')) return null;
  if (className.includes('d2h-ins')) return 'ins';
  if (className.includes('d2h-del')) return 'del';
  return 'cntx';
}

function readLineNumber(numCell: Element, type: LineType): number | null {
  const oldText = numCell.querySelector('.line-num1')?.textContent?.trim() ?? '';
  const newText = numCell.querySelector('.line-num2')?.textContent?.trim() ?? '';
  // Deletions only carry an old-side number; everything else prefers the new side.
  const picked = type === 'del' ? oldText || newText : newText || oldText;
  if (!picked) return null;
  const parsed = Number.parseInt(picked, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Collect one entry per commentable diff line (skips hunk headers). */
function collectLines(root: HTMLElement): LineMeta[] {
  const out: LineMeta[] = [];
  const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>('tr'));
  for (const tr of rows) {
    const numCell = tr.querySelector('.d2h-code-linenumber');
    const ctn = tr.querySelector('.d2h-code-line-ctn');
    if (!numCell || !ctn) continue;
    const contentTd = ctn.closest('td');
    const type = lineTypeOf(contentTd?.className ?? '');
    if (!type) continue;
    const prefix = tr.querySelector('.d2h-code-line-prefix')?.textContent ?? ' ';
    out.push({
      index: out.length,
      el: tr,
      lineNo: readLineNumber(numCell, type),
      prefix: prefix.trim() || ' ',
      content: ctn.textContent ?? '',
      type,
    });
    tr.dataset.commentIndex = String(out.length - 1);
  }
  return out;
}

function lineLabelOf(lines: LineMeta[]): string {
  const first = lines[0]?.lineNo ?? '?';
  const last = lines[lines.length - 1]?.lineNo ?? first;
  return lines.length > 1 ? `${first}-${last}` : String(first);
}

function snippetOf(lines: LineMeta[]): string {
  return lines.map((line) => `${line.prefix} ${line.content}`).join('\n');
}

function buildPrompt(args: {
  file: string;
  source: DiffSource;
  lines: LineMeta[];
  comment: string;
}): string {
  const { file, source, lines, comment } = args;
  return [
    `File: ${file}:${lineLabelOf(lines)} (${SOURCE_LABEL[source]} diff)`,
    lines.length > 1 ? 'Selected lines:' : 'Selected line:',
    snippetOf(lines),
    '',
    comment,
  ].join('\n');
}

function buildExplainPrompt(args: { file: string; source: DiffSource; lines: LineMeta[] }): string {
  const { file, source, lines } = args;
  return [
    `Explain this code from the ${SOURCE_LABEL[source]} diff of ${file}:${lineLabelOf(lines)}.`,
    '',
    snippetOf(lines),
    '',
    'What does it do, and what is this change doing? Be concise.',
  ].join('\n');
}

export function DiffCommentOverlay({
  scrollRef,
  markup,
  file,
  cwd,
  source,
  paneId,
  hooks,
}: DiffCommentOverlayProps) {
  const agents = useProjectsStore((s) => s.agents);
  const findWindowForPane = useWorkspaceStore((s) => s.findWindowForPane);

  const [lines, setLines] = useState<LineMeta[]>([]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [agentCommand, setAgentCommand] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; lines: LineMeta[] } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const composerOpen = anchor !== null && focus !== null;
  const rangeMin = composerOpen ? Math.min(anchor, focus) : -1;
  const rangeMax = composerOpen ? Math.max(anchor, focus) : -1;

  // Re-scan the rendered diff for commentable lines whenever the markup changes.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) {
      setLines([]);
      return;
    }
    setLines(collectLines(root));
    setHoverIndex(null);
    setAnchor(null);
    setFocus(null);
  }, [markup, scrollRef]);

  // Default the agent picker to the first configured agent.
  useEffect(() => {
    if (!agentCommand && agents.length > 0) setAgentCommand(agents[0].command);
  }, [agents, agentCommand]);

  // Highlight the selected rows directly (rows live in injected, non-React DOM).
  useEffect(() => {
    for (const line of lines) {
      const selected = composerOpen && line.index >= rangeMin && line.index <= rangeMax;
      line.el.classList.toggle('d2h-comment-selected', selected);
    }
    return () => {
      for (const line of lines) line.el.classList.remove('d2h-comment-selected');
    };
  }, [lines, composerOpen, rangeMin, rangeMax]);

  // Track the hovered row + shift-click range extension via event delegation.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const onMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLElement>('tr[data-comment-index]');
      if (row) {
        setHoverIndex(Number.parseInt(row.dataset.commentIndex ?? '', 10));
        return;
      }
      // Keep the affordance while the pointer is over our own UI.
      if (!target.closest('[data-comment-ui]')) setHoverIndex(null);
    };

    const onClick = (event: MouseEvent) => {
      if (!event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('[data-comment-ui]')) return;
      const row = target.closest<HTMLElement>('tr[data-comment-index]');
      if (!row) return;
      const idx = Number.parseInt(row.dataset.commentIndex ?? '', 10);
      if (Number.isNaN(idx)) return;
      event.preventDefault();
      setFocus(idx);
      if (anchor === null) setAnchor(idx);
    };

    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('click', onClick);
    return () => {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('click', onClick);
    };
  }, [scrollRef, anchor]);

  // Right-click a line (or the current selected range) to offer "Explain this".
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-comment-ui]')) return;
      const row = target.closest<HTMLElement>('tr[data-comment-index]');
      if (!row) return;
      const idx = Number.parseInt(row.dataset.commentIndex ?? '', 10);
      if (Number.isNaN(idx) || !lines[idx]) return;
      event.preventDefault();
      const withinRange = composerOpen && idx >= rangeMin && idx <= rangeMax;
      const selected = withinRange
        ? lines.filter((line) => line.index >= rangeMin && line.index <= rangeMax)
        : [lines[idx]];
      setMenu({ x: event.clientX, y: event.clientY, lines: selected });
    };

    root.addEventListener('contextmenu', onContextMenu);
    return () => root.removeEventListener('contextmenu', onContextMenu);
  }, [scrollRef, lines, composerOpen, rangeMin, rangeMax]);

  // Dismiss the right-click menu on any click, scroll, or Escape.
  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('click', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const close = useCallback(() => {
    setAnchor(null);
    setFocus(null);
    setComment('');
    setHoverIndex(null);
  }, []);

  const launch = (prompt: string, label: string) => {
    if (hooks) {
      hooks.launch(prompt, `${basename(file)}:${label}`, agentCommand || undefined);
      return;
    }
    const projectPath = (paneId ? findWindowForPane(paneId)?.projectPath : null) ?? cwd;
    openAgentChat({
      projectPath,
      cwd,
      label: `${basename(file)}:${label}`,
      prompt,
      agentCommand: agentCommand || undefined,
    });
  };

  const explain = (selected: LineMeta[]) => {
    if (selected.length === 0) return;
    launch(buildExplainPrompt({ file, source, lines: selected }), lineLabelOf(selected));
    setMenu(null);
    close();
  };

  // Map a viewport Y to the diff line under it. Backs the persistent gutter rail
  // (Zen), which drives the affordance with a reliable React handler instead of
  // the delegated `mouseover` used by the standard hover path.
  const lineIndexAtClientY = (clientY: number): number | null => {
    for (const line of lines) {
      const rect = line.el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return line.index;
    }
    return null;
  };

  const startComment = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();
    if (event.shiftKey && anchor !== null) {
      setFocus(index);
      return;
    }
    setAnchor(index);
    setFocus(index);
    setComment('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const submit = () => {
    if (!composerOpen) return;
    const trimmed = comment.trim();
    if (!trimmed) return;
    const selected = lines.filter((line) => line.index >= rangeMin && line.index <= rangeMax);
    if (selected.length === 0) return;

    if (hooks) {
      hooks.queueComment({
        file,
        lineLabel: lineLabelOf(selected),
        snippet: snippetOf(selected),
        comment: trimmed,
        source,
      });
      close();
      return;
    }

    launch(buildPrompt({ file, source, lines: selected, comment: trimmed }), lineLabelOf(selected));
    close();
  };

  const onTextareaKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const root = scrollRef.current;
  const hovered = hoverIndex !== null ? lines[hoverIndex] : null;
  const composerAnchor = composerOpen ? lines[rangeMax] : null;
  const hoveredBox = hovered && root ? rowBox(hovered.el, root) : null;
  const composerBox = composerAnchor && root ? rowBox(composerAnchor.el, root) : null;

  return (
    <>
      {menu && (
        <div
          data-comment-ui
          onClick={(event) => event.stopPropagation()}
          style={{ top: menu.y, left: menu.x }}
          className="fixed z-[300] min-w-[160px] rounded-[10px] border border-line bg-side p-[5px] font-ui text-[13px] text-ink shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        >
          <button
            type="button"
            onClick={() => explain(menu.lines)}
            className="flex w-full items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] text-left text-ink-dim outline-none hover:bg-hover hover:text-ink"
          >
            <span className="grid w-4 place-items-center"><SparkleIcon size={14} /></span>
            Explain {menu.lines.length > 1 ? `these ${menu.lines.length} lines` : 'this line'}
          </button>
        </div>
      )}

      {/* Zen: a persistent clickable comment column in the reserved left gutter.
          It sits over the empty pl-[22px] strip (never the code) and drives the
          +/composer with reliable React handlers. */}
      {hooks && root && (
        <div
          data-comment-ui
          title="Click to comment on a line (shift-click to extend a range)"
          onMouseMove={(event) => setHoverIndex(lineIndexAtClientY(event.clientY))}
          onMouseLeave={() => setHoverIndex(null)}
          onClick={(event) => {
            const idx = lineIndexAtClientY(event.clientY);
            if (idx !== null) startComment(event, idx);
          }}
          className="absolute inset-y-0 left-0 z-[5] w-[22px] cursor-pointer border-r border-transparent hover:border-ember-edge hover:bg-ember-tint"
        />
      )}

      {hovered && hoveredBox && (
        <button
          type="button"
          data-comment-ui
          title="Comment on this line (shift-click to extend a range)"
          aria-label="Comment on this line"
          onClick={(event) => startComment(event, hovered.index)}
          style={{ top: hoveredBox.top, height: hoveredBox.height }}
          className="absolute left-0 z-10 grid w-[22px] place-items-center bg-ember text-[#1a1206] shadow-sm transition hover:bg-ember-strong"
        >
          <PlusIcon size={12} />
        </button>
      )}

      {composerOpen && composerAnchor && composerBox && (
        <div
          data-comment-ui
          style={{ top: composerBox.top + composerBox.height + 2 }}
          className="absolute left-2 z-20 w-[380px] max-w-[calc(100%-1rem)] rounded-[10px] border border-ember-edge bg-side p-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] text-ink-faint">
            <span className="truncate font-mono text-ink-dim">
              {basename(file)}:
              {rangeMin === rangeMax
                ? lines[rangeMin]?.lineNo
                : `${lines[rangeMin]?.lineNo}-${lines[rangeMax]?.lineNo}`}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Cancel comment"
              className="ml-auto grid size-5 place-items-center rounded text-ink-faint hover:bg-hover hover:text-ink"
            >
              <CloseIcon size={12} />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={onTextareaKeyDown}
            rows={3}
            placeholder={
              hooks
                ? 'Comment — added to a queue you send to one agent chat (⏎ to add, ⇧⏎ for newline)'
                : 'Comment — sent to a new agent chat with the file & line (⏎ to send, ⇧⏎ for newline)'
            }
            className="w-full resize-y rounded-lg border border-line bg-app px-2.5 py-1.5 text-[12.5px] text-ink outline-none transition focus:border-ember-edge focus:shadow-[0_0_0_3px_var(--color-ember-tint)]"
          />

          <div className="mt-2 flex items-center gap-2">
            <div className={`flex flex-1 flex-wrap items-center gap-1 ${hooks ? 'hidden' : ''}`}>
              {agents.map((agent) => {
                const active = agent.command === agentCommand;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    title={`Send to ${agent.name}`}
                    aria-pressed={active}
                    onClick={() => setAgentCommand(agent.command)}
                    className={
                      'flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors ' +
                      (active
                        ? 'bg-active text-ink'
                        : 'text-ink-faint hover:bg-hover hover:text-ink-dim')
                    }
                  >
                    <AgentGlyph name={agent.name} command={agent.command} size={13} />
                    {agent.name}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!comment.trim()}
              className="flex-none rounded-md border border-ember bg-ember px-3 py-1 text-[12px] font-semibold text-[#1a1206] transition hover:border-ember-strong hover:bg-ember-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {hooks ? 'Add ↵' : 'Send ↵'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
