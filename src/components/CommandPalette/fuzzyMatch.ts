export interface FuzzyResult {
  score: number;
  matches: number[];
}

export function fuzzyMatch(query: string, candidate: string): FuzzyResult | null {
  const queryLower = query.toLowerCase();
  const candidateLower = candidate.toLowerCase();

  let queryIdx = 0;
  let score = 0;
  const matches: number[] = [];
  let prevMatchIdx = -1;

  for (let i = 0; i < candidateLower.length && queryIdx < queryLower.length; i++) {
    if (candidateLower[i] === queryLower[queryIdx]) {
      matches.push(i);

      // Consecutive match bonus
      if (prevMatchIdx === i - 1) {
        score += 10;
      }

      // Word boundary bonus
      if (i === 0 || candidate[i - 1] === ' ' || candidate[i - 1] === '-' || candidate[i - 1] === ':') {
        score += 5;
      }

      // Exact case bonus
      if (candidate[i] === query[queryIdx]) {
        score += 1;
      }

      prevMatchIdx = i;
      queryIdx++;
    }
  }

  // All query chars must match
  if (queryIdx !== queryLower.length) return null;

  // Base score for matching
  score += 1;

  // Penalize long candidates
  score -= candidate.length * 0.1;

  return { score, matches };
}
