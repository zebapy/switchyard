import type { GhItem } from '../../types/project';

const TEMPLATE_KEY = 'worktree.issuePrompt';

/**
 * Default prompt seeded into the agent chat when a worktree is created from an
 * issue, branch, or PR. Placeholders, filled at send time:
 *   {id}     — item identifier (e.g. ENG-241 or #318; empty for plain branches)
 *   {title}  — item title (or branch name)
 *   {branch} — the worktree's branch
 */
export const DEFAULT_ISSUE_PROMPT = `{id} {title}

Start working on this on branch \`{branch}\`. Review the relevant code first, then implement the change. Ask me before doing anything large or destructive.`;

/** The saved issue prompt template, or the default when unset/blank. */
export function loadIssuePrompt(): string {
  const stored = localStorage.getItem(TEMPLATE_KEY);
  return stored && stored.trim() ? stored : DEFAULT_ISSUE_PROMPT;
}

/** Persist the issue prompt template. Saving blank restores the default. */
export function saveIssuePrompt(template: string): void {
  if (template.trim()) localStorage.setItem(TEMPLATE_KEY, template);
  else localStorage.removeItem(TEMPLATE_KEY);
}

type RenderItem = Pick<GhItem, 'id' | 'title' | 'branch'>;

/** Fill the template's placeholders for one source item. Exposed for previews. */
export function renderIssuePrompt(template: string, { id, title, branch }: RenderItem): string {
  return template
    .replace(/\{id\}/g, id ?? '')
    .replace(/\{title\}/g, title ?? '')
    .replace(/\{branch\}/g, branch ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}
