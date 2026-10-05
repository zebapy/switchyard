import type { AnnotationSide, FileDiffMetadata, SelectedLineRange } from '@pierre/diffs';

export type DiffRowKind = 'context' | 'addition' | 'deletion';

/** One line of a unified diff, in the order @pierre/diffs renders it. */
export interface DiffRow {
  kind: DiffRowKind;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}

const PREFIX: Record<DiffRowKind, string> = {
  context: ' ',
  addition: '+',
  deletion: '-',
};

function stripNewline(line: string | undefined): string {
  return (line ?? '').replace(/\r?\n$/, '');
}

export function buildDiffRows(fileDiff: FileDiffMetadata): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const hunk of fileDiff.hunks) {
    let oldLineNumber = hunk.deletionStart;
    let newLineNumber = hunk.additionStart;
    for (const block of hunk.hunkContent) {
      if (block.type === 'context') {
        for (let offset = 0; offset < block.lines; offset++) {
          rows.push({
            kind: 'context',
            oldLineNumber: oldLineNumber++,
            newLineNumber: newLineNumber++,
            content: stripNewline(fileDiff.additionLines[block.additionLineIndex + offset]),
          });
        }
        continue;
      }
      for (let offset = 0; offset < block.deletions; offset++) {
        rows.push({
          kind: 'deletion',
          oldLineNumber: oldLineNumber++,
          newLineNumber: null,
          content: stripNewline(fileDiff.deletionLines[block.deletionLineIndex + offset]),
        });
      }
      for (let offset = 0; offset < block.additions; offset++) {
        rows.push({
          kind: 'addition',
          oldLineNumber: null,
          newLineNumber: newLineNumber++,
          content: stripNewline(fileDiff.additionLines[block.additionLineIndex + offset]),
        });
      }
    }
  }
  return rows;
}

function rowIndexAt(rows: DiffRow[], lineNumber: number, side: AnnotationSide): number {
  if (side === 'deletions') {
    return rows.findIndex((row) => row.kind !== 'addition' && row.oldLineNumber === lineNumber);
  }
  return rows.findIndex((row) => row.kind !== 'deletion' && row.newLineNumber === lineNumber);
}

/** The rows a selection covers, top to bottom — empty when it no longer matches the diff. */
export function rowsInRange(rows: DiffRow[], range: SelectedLineRange): DiffRow[] {
  const startSide = range.side ?? 'additions';
  const startIndex = rowIndexAt(rows, range.start, startSide);
  const endIndex = rowIndexAt(rows, range.end, range.endSide ?? startSide);
  if (startIndex === -1 || endIndex === -1) return [];
  return rows.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
}

function lineNumberOf(row: DiffRow): number | null {
  return row.kind === 'deletion' ? row.oldLineNumber : row.newLineNumber;
}

/** Where a line annotation must attach to sit directly under `row`. */
export function annotationAnchorOf(row: DiffRow): { side: AnnotationSide; lineNumber: number } {
  if (row.kind === 'deletion') return { side: 'deletions', lineNumber: row.oldLineNumber ?? 0 };
  return { side: 'additions', lineNumber: row.newLineNumber ?? 0 };
}

export function lineLabelOf(rows: DiffRow[]): string {
  const first = rows[0] ? lineNumberOf(rows[0]) : null;
  const last = rows.length > 0 ? lineNumberOf(rows[rows.length - 1]) : null;
  if (rows.length > 1) return `${first ?? '?'}-${last ?? '?'}`;
  return String(first ?? '?');
}

export function snippetOf(rows: DiffRow[]): string {
  return rows.map((row) => `${PREFIX[row.kind]} ${row.content}`).join('\n');
}
