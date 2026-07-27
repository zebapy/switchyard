import { useEffect, useMemo, useRef, useState } from 'react';
import { useZenStore } from './zenStore';
import { basename } from './zenData';
import { AllDiffsView } from '../components/GitPanel/AllDiffsView';
import { useChangedFiles } from '../components/GitPanel/useGitData';
import { useProjectsStore } from '../stores/projects';
import { useWorkspaceStore } from '../stores/workspace';
import { AgentGlyph, CloseIcon } from '../components/icons';
import type { DiffAgentHooks, DiffSource, QueuedFeedback } from '../types/gitpanel';

const SOURCE_LABEL: Record<DiffSource, string> = {
  unstaged: 'unstaged',
  staged: 'staged',
  base: 'vs base branch',
};

/** Combine queued comments into one prompt for a single agent chat. */
function buildQueuedPrompt(worktree: string, items: QueuedFeedback[]): string {
  const header = `Here is my review feedback on the ${basename(worktree)} diff. Please address each item:`;
  const blocks = items.map((item, i) => {
    return [
      `${i + 1}. ${item.file}:${item.lineLabel} (${SOURCE_LABEL[item.source]})`,
      '```',
      item.snippet,
      '```',
      item.comment,
    ].join('\n');
  });
  return [header, '', ...blocks].join('\n\n');
}

/** Open an agent chat in the worktree and focus it in Zen (never leaves Zen). */
function openAgentInZen(args: { worktreePath: string; prompt: string; label: string; agentCommand?: string }) {
  const { worktreePath, prompt, label, agentCommand } = args;
  const command = agentCommand || useProjectsStore.getState().agents[0]?.command;
  const ws = useWorkspaceStore.getState();
  ws.addTab(worktreePath, basename(worktreePath), {
    kind: 'Agent',
    cwd: worktreePath,
    agent: command || undefined,
    command: prompt,
    label,
  });
  const newId = ws.windows.get(worktreePath)?.activePaneId;
  const zen = useZenStore.getState();
  if (newId) zen.focus(newId);
  zen.closeDiff();
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

/**
 * The ephemeral "View diff" surface. Opened from a worktree's ⌘K actions, it
 * overtakes Zen's main area (like Focus, but with no persistent pane) to show
 * every changed file stacked PR-style. ⌘P swaps *what the diff is against*
 * (unstaged / staged / vs base branch). Line comments queue up (⇧-click to
 * select a range, hover the gutter to comment) and send together to one new
 * agent chat. Esc or ← returns to the tier list.
 */
export function ZenDiffView({ path }: { path: string }) {
  const closeDiff = useZenStore((s) => s.closeDiff);
  const source = useZenStore((s) => s.diffSource);
  const pickerOpen = useZenStore((s) => s.diffPickerOpen);
  const openDiffPicker = useZenStore((s) => s.openDiffPicker);
  const agents = useProjectsStore((s) => s.agents);

  const [queue, setQueue] = useState<QueuedFeedback[]>([]);
  const [agentCommand, setAgentCommand] = useState('');
  const idRef = useRef(0);

  useEffect(() => {
    if (!agentCommand && agents.length > 0) setAgentCommand(agents[0].command);
  }, [agents, agentCommand]);

  const { files, loading, error } = useChangedFiles(path, source);

  const hooks: DiffAgentHooks = useMemo(
    () => ({
      queueComment: (feedback) => {
        idRef.current += 1;
        setQueue((prev) => [...prev, { ...feedback, id: `fb-${idRef.current}` }]);
      },
      launch: (prompt, label, agent) => {
        openAgentInZen({ worktreePath: path, prompt, label, agentCommand: agent });
      },
    }),
    [path],
  );

  const removeFromQueue = (id: string) => setQueue((prev) => prev.filter((item) => item.id !== id));

  const sendQueue = () => {
    if (queue.length === 0) return;
    openAgentInZen({
      worktreePath: path,
      prompt: buildQueuedPrompt(path, queue),
      label: `Review · ${queue.length} note${queue.length === 1 ? '' : 's'}`,
      agentCommand,
    });
  };

  // Own the keyboard while open: ⌘P swaps the diff source, Esc/← returns. Yield
  // to the source picker (its own overlay) and to any editable field so typing a
  // comment isn't hijacked (its ← and Esc must reach the textarea).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (pickerOpen || isEditableTarget(e.target)) return;
      if (e.metaKey && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        openDiffPicker();
        return;
      }
      if (e.key === 'Escape' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        closeDiff();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [pickerOpen, openDiffPicker, closeDiff]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-canvas">
      <AllDiffsView
        path={path}
        source={source}
        files={files}
        loading={loading}
        error={error}
        onOpenFileInTab={() => {}}
        hooks={hooks}
      />

      {queue.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
          <div className="pointer-events-auto flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-ember-edge bg-side shadow-[0_24px_64px_-20px_rgba(0,0,0,0.85)]">
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-2 text-[11px] uppercase tracking-[0.06em] text-ink-ghost">
              <span>{queue.length} queued note{queue.length === 1 ? '' : 's'}</span>
              <button
                type="button"
                onClick={() => setQueue([])}
                className="ml-auto rounded px-1.5 py-0.5 text-ink-faint hover:bg-hover hover:text-ink"
              >
                Clear all
              </button>
            </div>

            <div className="scroll-thin max-h-[34vh] overflow-y-auto p-1.5">
              {queue.map((item) => (
                <div key={item.id} className="flex items-start gap-2 rounded-[9px] px-2 py-1.5 hover:bg-hover">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] text-ink-dim">
                      {basename(item.file)}:{item.lineLabel}
                    </div>
                    <div className="truncate text-[12.5px] text-ink">{item.comment}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromQueue(item.id)}
                    aria-label="Remove note"
                    className="mt-0.5 grid size-5 flex-none place-items-center rounded text-ink-faint hover:bg-active hover:text-ink"
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 border-t border-line px-3 py-2">
              <div className="flex flex-1 flex-wrap items-center gap-1">
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
                        (active ? 'bg-active text-ink' : 'text-ink-faint hover:bg-hover hover:text-ink-dim')
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
                onClick={sendQueue}
                className="flex-none rounded-md border border-ember bg-ember px-3 py-1.5 text-[12px] font-semibold text-[#1a1206] transition hover:border-ember-strong hover:bg-ember-strong"
              >
                Send {queue.length} to new chat →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
