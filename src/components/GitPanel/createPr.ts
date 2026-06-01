import { useWorkspaceStore } from '../../stores/workspace';
import { useProjectsStore } from '../../stores/projects';
import { useUiStore } from '../../stores/ui';
import type { FileStatus } from '../../types/gitpanel';

const TEMPLATE_KEY = 'gitPanel.prTemplate';

/**
 * Default prompt sent to a new agent chat when creating a PR. Supports three
 * placeholders, filled in at send time:
 *   {branch} — the current branch name
 *   {base}   — the base/default branch (e.g. main)
 *   {files}  — a bulleted summary of files changed vs the base branch
 */
export const DEFAULT_PR_TEMPLATE = `Create a pull request for the current branch.
Branch: {branch}
Base: {base}

Please:
- Review the diff yourself to understand what changed.
- Write a clear, conventional PR title and a description that summarizes what changed and why.
- Open the PR (use the \`gh\` CLI if available, otherwise the GitHub web flow) and reply with the PR URL.`;

/** The saved PR prompt template, or the default when unset/blank. */
export function loadPrTemplate(): string {
  const stored = localStorage.getItem(TEMPLATE_KEY);
  return stored && stored.trim() ? stored : DEFAULT_PR_TEMPLATE;
}

/** Persist the PR prompt template. Saving blank restores the default. */
export function savePrTemplate(template: string): void {
  if (template.trim()) localStorage.setItem(TEMPLATE_KEY, template);
  else localStorage.removeItem(TEMPLATE_KEY);
}

function basename(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path;
}

/** Render the `{files}` block from the files changed vs the base branch. */
function renderFiles(files: FileStatus[], base: string | null): string {
  if (files.length === 0) return '';
  const lines = [`Changed files vs ${base ?? 'main'} (${files.length}):`];
  for (const file of files.slice(0, 40)) {
    lines.push(`- ${file.status}: ${file.path} (+${file.added}/-${file.deleted})`);
  }
  if (files.length > 40) lines.push(`- …and ${files.length - 40} more`);
  return lines.join('\n');
}

interface RenderArgs {
  branch: string | null;
  base: string | null;
  files: FileStatus[];
}

/** Fill the template's placeholders. Exposed for the settings preview. */
export function renderPrPrompt(template: string, { branch, base, files }: RenderArgs): string {
  return template
    .replace(/\{branch\}/g, branch ?? 'the current branch')
    .replace(/\{base\}/g, base ?? 'main')
    .replace(/\{files\}/g, renderFiles(files, base))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface CreatePrArgs {
  path: string;
  branch: string | null;
  defaultBranch: string | null;
  /** Files changed vs the base branch — summarised into the prompt. */
  baseFiles: FileStatus[];
}

/** Open a new agent chat tab seeded with the (user-editable) PR prompt. */
export function openCreatePrChat({ path, branch, defaultBranch, baseFiles }: CreatePrArgs): void {
  const agent = useProjectsStore.getState().agents[0]?.command;
  const prompt = renderPrPrompt(loadPrTemplate(), { branch, base: defaultBranch, files: baseFiles });
  useWorkspaceStore.getState().addTab(path, basename(path), {
    kind: 'Agent',
    cwd: path,
    agent,
    command: prompt,
    label: 'Create PR',
  });
  useUiStore.getState().showPane();
}
