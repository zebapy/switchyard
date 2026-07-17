# Zen Mode — look prototype

**Question:** what should Switchyard's single-focus "Zen Mode" interface look like?

Throwaway. Standalone HTML, real Switchyard tokens (graphite + ember), fake data.

## Run

```
open prototypes/zen-mode.html
```

Switch variants: bottom bar arrows · keys `1` `2` `3` · `[` `]`. Arrow keys
drive the variant itself (not the switcher). `⌘K` opens the jump palette in any
variant; in B, `/` does too.

## Variants (structurally different, not just colour)

- **A — Drill column.** The mockup's literal take. One tier fullscreen at a
  time: Projects → Workspaces → Panes. `↑↓` move a cursor, `→`/Enter drill in,
  `←` climb out, Enter on a pane = Focus (green-edge, `^←` escapes). Modal
  "who owns the arrows" footer.
- **B — Spotlight.** Near-zero chrome: screen is *only* the focused pane.
  No persistent tiers — all navigation through the `⌘K` flat palette across
  every pane everywhere. Most "zen", least spatial.
- **C — Rail + focus.** Thin persistent left rail = active workspace's panes
  (always visible, keeps spatial memory); main area = the one focused pane.
  `↑↓` pane, `⇧↑↓` workspace. Hybrid of Standard and Zen.

## Verdict

TBD — pending pick. The useful answer is usually a mix
(e.g. "A's drill-down with C's persistent rail"). Record the winner here, then
fold it into the real interface and delete this folder.
