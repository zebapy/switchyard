// Friendly adjective-noun names for quick worktrees (e.g. `brave-otter`). Memorable
// in the project tree and always valid as a git branch segment.

const ADJECTIVES = [
  'brave', 'quiet', 'crimson', 'lucky', 'silent', 'golden', 'rapid', 'frosty',
  'amber', 'noble', 'swift', 'clever', 'mellow', 'cobalt', 'sunny', 'dusty',
  'bold', 'witty', 'keen', 'vivid', 'jade', 'rustic', 'lunar', 'breezy',
];

const NOUNS = [
  'otter', 'harbor', 'finch', 'spruce', 'comet', 'willow', 'falcon', 'meadow',
  'ember', 'pebble', 'canyon', 'badger', 'quartz', 'cypress', 'marlin', 'thistle',
  'heron', 'cobble', 'tundra', 'vireo', 'maple', 'cedar', 'cove', 'ridge',
];

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

/** Random `adjective-noun` name not already in `taken`. Falls back to a numbered
 *  name after enough collisions so it always returns something usable. */
export function randomWorktreeName(taken: string[] = []): string {
  const used = new Set(taken);
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
    if (!used.has(name)) return name;
  }
  return `worktree-${Math.floor(1000 + Math.random() * 9000)}`;
}
