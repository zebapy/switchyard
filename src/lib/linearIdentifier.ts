// Detect a Linear issue identifier (e.g. `FDY-123`) inside a worktree's branch
// name or path, given the team prefixes the user configured (e.g. `["fdy"]`).
// Linear's suggested branch names look like `zebapy/fdy-123-title-slug`, so the
// identifier is embedded rather than being the whole string.

/** Escape a user-supplied prefix for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Return the first Linear identifier found in `text` whose team key matches one
 * of `prefixes`, uppercased to Linear's canonical form (e.g. `FDY-123`), or
 * null when none match. Prefixes are matched case-insensitively.
 */
export function findLinearIdentifier(text: string, prefixes: string[]): string | null {
  for (const prefix of prefixes) {
    const trimmed = prefix.trim();
    if (!trimmed) continue;
    // Require a non-word boundary before the prefix so `xfdy-1` doesn't match
    // the `fdy` prefix; the number must directly follow the hyphen.
    const pattern = new RegExp(`(?:^|[^a-z0-9])(${escapeRegExp(trimmed)})-(\\d+)`, 'i');
    const match = text.match(pattern);
    if (match) return `${match[1].toUpperCase()}-${match[2]}`;
  }
  return null;
}
