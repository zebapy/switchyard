import { useState } from 'react';
import { useProjectsStore } from '../stores/projects';
import type { AgentConfig } from '../types/agent';
import { AgentGlyph, PlusIcon, CloseIcon, ChevronIcon } from './icons';

const h3Class = 'mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-ghost';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const rowClass = 'flex items-center gap-2.5 rounded-[9px] border border-line bg-app px-2.5 py-2';
const iconBtn =
  'grid size-7 place-items-center rounded-md text-ink-faint transition hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30';
const fieldInput =
  'min-w-0 flex-1 rounded-lg border border-line bg-app px-[11px] py-1.5 text-[13px] text-ink outline-none transition focus:border-ember-edge focus:shadow-[0_0_0_3px_var(--color-ember-tint)]';
const fieldError = 'border-del focus:border-del focus:shadow-[0_0_0_3px_rgba(240,117,138,0.12)]';

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function makeId(name: string, command: string, taken: Set<string>): string {
  const base = slugify(name) || slugify(command) || 'agent';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function AgentSettings() {
  const agents = useProjectsStore((s) => s.agents);
  const setAgents = useProjectsStore((s) => s.setAgents);

  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [errors, setErrors] = useState<{ name?: string; command?: string }>({});

  const persist = (next: AgentConfig[]) => setAgents(next).catch(console.error);

  const moveAgent = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= agents.length) return;
    const next = [...agents];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  };

  const makeDefault = (index: number) => {
    if (index === 0) return;
    const next = [...agents];
    const [agent] = next.splice(index, 1);
    next.unshift(agent);
    persist(next);
  };

  const removeAgent = (index: number) => {
    if (agents.length <= 1) return;
    persist(agents.filter((_, i) => i !== index));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedCommand = command.trim();
    const nextErrors: { name?: string; command?: string } = {};
    if (!trimmedName) nextErrors.name = 'Enter a name.';
    if (!trimmedCommand) nextErrors.command = 'Enter a command.';
    if (trimmedCommand && agents.some((a) => a.command === trimmedCommand)) {
      nextErrors.command = 'An agent with this command already exists.';
    }
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.command) return;

    const taken = new Set(agents.map((a) => a.id));
    const agent: AgentConfig = { id: makeId(trimmedName, trimmedCommand, taken), name: trimmedName, command: trimmedCommand };
    persist([...agents, agent]);
    setName('');
    setCommand('');
    setErrors({});
  };

  return (
    <div>
      <h3 className={h3Class}>Agents</h3>
      <p className={descClass}>
        Commands offered when starting a new chat. The first agent is the default. Drag order with the arrows.
      </p>

      <ul className="mb-3 flex flex-col gap-1.5">
        {agents.map((agent, index) => (
          <li key={agent.id} className={rowClass}>
            <span className="grid size-5 place-items-center text-ai">
              <AgentGlyph name={agent.name} command={agent.command} size={15} />
            </span>
            <span className="text-[13px] text-ink">{agent.name}</span>
            {index === 0 && (
              <span className="rounded border border-ember-edge bg-ember-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ember">
                Default
              </span>
            )}
            <code className="ml-auto truncate font-mono text-xs text-ink-faint" title={agent.command}>
              {agent.command}
            </code>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                className={iconBtn}
                onClick={() => moveAgent(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${agent.name} up`}
                title="Move up"
              >
                <ChevronIcon size={12} className="-rotate-90" />
              </button>
              <button
                type="button"
                className={iconBtn}
                onClick={() => moveAgent(index, 1)}
                disabled={index === agents.length - 1}
                aria-label={`Move ${agent.name} down`}
                title="Move down"
              >
                <ChevronIcon size={12} className="rotate-90" />
              </button>
              {index !== 0 && (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-ink-faint transition hover:bg-hover hover:text-ink"
                  onClick={() => makeDefault(index)}
                  title="Make default"
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                className={iconBtn}
                onClick={() => removeAgent(index)}
                disabled={agents.length <= 1}
                aria-label={`Remove ${agent.name}`}
                title={agents.length <= 1 ? 'Keep at least one agent' : 'Remove'}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <input
              className={`${fieldInput} ${errors.name ? fieldError : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Codex)"
              aria-label="Agent name"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <span className="text-[11px] text-del">{errors.name}</span>}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <input
              className={`${fieldInput} font-mono ${errors.command ? fieldError : ''}`}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Command (e.g. codex)"
              aria-label="Agent command"
              aria-invalid={Boolean(errors.command)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {errors.command && <span className="text-[11px] text-del">{errors.command}</span>}
          </div>
          <button
            type="submit"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-ember-edge hover:bg-ember-tint hover:text-ember"
          >
            <PlusIcon size={12} /> Add agent
          </button>
        </div>
      </form>
    </div>
  );
}
