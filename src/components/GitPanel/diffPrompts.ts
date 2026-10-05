import type { DiffSource } from '../../types/gitpanel';
import { lineLabelOf, snippetOf, type DiffRow } from './diffRows';

export const SOURCE_LABEL: Record<DiffSource, string> = {
  unstaged: 'unstaged',
  staged: 'staged',
  base: 'vs base branch',
};

export function buildCommentPrompt(args: {
  file: string;
  source: DiffSource;
  rows: DiffRow[];
  comment: string;
}): string {
  const { file, source, rows, comment } = args;
  return [
    `File: ${file}:${lineLabelOf(rows)} (${SOURCE_LABEL[source]} diff)`,
    rows.length > 1 ? 'Selected lines:' : 'Selected line:',
    snippetOf(rows),
    '',
    comment,
  ].join('\n');
}

export function buildExplainPrompt(args: { file: string; source: DiffSource; rows: DiffRow[] }): string {
  const { file, source, rows } = args;
  return [
    `Explain this code from the ${SOURCE_LABEL[source]} diff of ${file}:${lineLabelOf(rows)}.`,
    '',
    snippetOf(rows),
    '',
    'What does it do, and what is this change doing? Be concise.',
  ].join('\n');
}
