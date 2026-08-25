/** Words that carry no meaning in a branch name — articles, pronouns, filler,
 *  and politeness. Verbs like "fix"/"add" are deliberately kept: they describe
 *  the work. */
const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'is', 'are', 'be', 'been',
  'and', 'or', 'so', 'that', 'this', 'these', 'those', 'it', 'its',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'us',
  'can', 'could', 'would', 'should', 'will', 'want', 'need', 'lets', 'let',
  'please', 'just', 'really', 'basically', 'actually', 'simply', 'some', 'any',
]);

const MAX_WORDS = 5;
const MAX_LENGTH = 40;

/**
 * Derive a short, human-friendly branch leaf from a free-text prompt —
 * "Fix the flaky login redirect on Safari" → `fix-flaky-login-redirect`.
 * Returns an empty string when the prompt has no letters or digits.
 */
export function branchNameFromPrompt(prompt: string): string {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return '';

  const meaningful = words.filter((word) => !FILLER_WORDS.has(word));
  const picked = (meaningful.length > 0 ? meaningful : words).slice(0, MAX_WORDS);
  return picked.join('-').slice(0, MAX_LENGTH).replace(/-+$/, '');
}
