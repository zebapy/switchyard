import { useState } from 'react';
import {
  DEFAULT_ISSUE_PROMPT,
  loadIssuePrompt,
  saveIssuePrompt,
} from './Worktree/issuePrompt';

const h3Class = 'mb-2.5 text-xs font-semibold text-ink';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const btnClass =
  'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-guide hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';
const codeClass = 'rounded border border-line-soft bg-side px-1 py-0.5 font-mono text-[11px] text-ember';

/** Editor for the prompt seeded into the agent chat when creating a worktree
 *  from a Linear/GitHub issue, branch, or PR. */
export function IssuePromptSettings() {
  const [template, setTemplate] = useState(loadIssuePrompt);
  const [saved, setSaved] = useState(false);

  const dirty = template !== loadIssuePrompt();

  const handleSave = () => {
    saveIssuePrompt(template);
    setTemplate(loadIssuePrompt());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleReset = () => {
    setTemplate(DEFAULT_ISSUE_PROMPT);
  };

  return (
    <div>
      <h3 className={h3Class}>Worktree prompt</h3>
      <p className={descClass}>
        Seeded into the agent chat when you create a worktree from an issue, branch, or PR. Placeholders:{' '}
        <code className={codeClass}>{'{id}'}</code> <code className={codeClass}>{'{title}'}</code>{' '}
        <code className={codeClass}>{'{branch}'}</code>.
      </p>
      <textarea
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        spellCheck={false}
        rows={8}
        className="scroll-thin mb-2.5 w-full resize-y rounded-[9px] border border-line bg-app px-3 py-2 font-mono text-xs leading-relaxed text-ink-dim outline-none focus:border-ember-edge"
      />
      <div className="flex items-center gap-2">
        <button type="button" className={btnClass} onClick={handleSave} disabled={!dirty}>
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={handleReset}
          disabled={template === DEFAULT_ISSUE_PROMPT}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
