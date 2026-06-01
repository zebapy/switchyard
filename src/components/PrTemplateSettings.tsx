import { useState } from 'react';
import {
  DEFAULT_PR_TEMPLATE,
  loadPrTemplate,
  savePrTemplate,
} from './GitPanel/createPr';

const h3Class = 'mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-ghost';
const descClass = 'mb-2.5 text-xs text-ink-faint';
const btnClass =
  'rounded-lg border border-line bg-app px-[11px] py-1.5 text-xs text-ink-dim transition hover:border-ember-edge hover:bg-ember-tint hover:text-ember disabled:cursor-default disabled:opacity-50';
const codeClass = 'rounded border border-line-soft bg-side px-1 py-0.5 font-mono text-[11px] text-ember';

/** Editor for the prompt sent to a new agent chat when creating a pull request. */
export function PrTemplateSettings() {
  const [template, setTemplate] = useState(loadPrTemplate);
  const [saved, setSaved] = useState(false);

  const dirty = template !== loadPrTemplate();

  const handleSave = () => {
    savePrTemplate(template);
    setTemplate(loadPrTemplate());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleReset = () => {
    setTemplate(DEFAULT_PR_TEMPLATE);
  };

  return (
    <div>
      <h3 className={h3Class}>Pull request prompt</h3>
      <p className={descClass}>
        Sent to a new agent chat when you click “Create PR”. Placeholders: <code className={codeClass}>{'{branch}'}</code>{' '}
        <code className={codeClass}>{'{base}'}</code> <code className={codeClass}>{'{files}'}</code>.
      </p>
      <textarea
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
        spellCheck={false}
        rows={12}
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
          disabled={template === DEFAULT_PR_TEMPLATE}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
