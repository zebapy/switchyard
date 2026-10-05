import { useEffect, useRef, useState } from 'react';
import { useProjectsStore } from '../../stores/projects';
import { AgentGlyph, CloseIcon, SparkleIcon } from '../icons';

interface DiffCommentComposerProps {
  /** e.g. `App.tsx:12-14` */
  locationLabel: string;
  /** Zen queues comments for a later combined send instead of launching a chat. */
  queuesComments: boolean;
  onSubmit: (comment: string, agentCommand: string | undefined) => void;
  onExplain: (agentCommand: string | undefined) => void;
  onClose: () => void;
}

export function DiffCommentComposer({
  locationLabel,
  queuesComments,
  onSubmit,
  onExplain,
  onClose,
}: DiffCommentComposerProps) {
  const agents = useProjectsStore((s) => s.agents);
  const [comment, setComment] = useState('');
  const [agentCommand, setAgentCommand] = useState(agents[0]?.command ?? '');
  const formRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) {
      textareaRef.current?.setCustomValidity('Write a comment before sending.');
      textareaRef.current?.reportValidity();
      return;
    }
    onSubmit(trimmed, agentCommand || undefined);
  };

  const onTextareaKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="my-1.5 ml-2 w-[380px] max-w-[calc(100%-1rem)] rounded-[10px] border border-ember-edge bg-side p-2.5 font-ui shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] text-ink-faint">
        <span className="truncate font-mono text-ink-dim">{locationLabel}</span>
        <button
          type="button"
          onClick={() => onExplain(agentCommand || undefined)}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-dim hover:bg-hover hover:text-ink"
        >
          <SparkleIcon size={12} />
          Explain
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel comment"
          className="grid size-5 place-items-center rounded text-ink-faint hover:bg-hover hover:text-ink"
        >
          <CloseIcon size={12} />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={comment}
        onChange={(event) => {
          event.target.setCustomValidity('');
          setComment(event.target.value);
        }}
        onKeyDown={onTextareaKeyDown}
        rows={3}
        required
        aria-label="Comment"
        placeholder={
          queuesComments
            ? 'Comment — added to a queue you send to one agent chat (⏎ to add, ⇧⏎ for newline)'
            : 'Comment — sent to a new agent chat with the file & line (⏎ to send, ⇧⏎ for newline)'
        }
        className="w-full resize-y rounded-lg border border-line bg-app px-2.5 py-1.5 text-[12.5px] text-ink outline-none transition focus:border-ember-edge focus:shadow-[0_0_0_3px_var(--color-ember-tint)]"
      />

      <div className="mt-2 flex items-center gap-2">
        <div className={`flex flex-1 flex-wrap items-center gap-1 ${queuesComments ? 'invisible' : ''}`}>
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
          type="submit"
          className="flex-none rounded-md border border-ember bg-ember px-3 py-1 text-[12px] font-semibold text-[#1a1206] transition hover:border-ember-strong hover:bg-ember-strong"
        >
          {queuesComments ? 'Add ↵' : 'Send ↵'}
        </button>
      </div>
    </form>
  );
}
