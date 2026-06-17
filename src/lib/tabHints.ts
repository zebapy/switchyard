/** ⌘N hint for the tab at `index` within a window of `total` tabs: ⌘1…8 map to
 *  the first eight tabs and ⌘9 always jumps to the last — matching the
 *  tab-switch keybindings in useKeybindings. Returns null for unbound tabs. */
export function tabSwitchHint(index: number, total: number): string | null {
  if (index < 8) return `⌘${index + 1}`;
  if (index === total - 1) return '⌘9';
  return null;
}
