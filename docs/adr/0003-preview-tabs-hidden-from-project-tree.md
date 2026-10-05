---
status: accepted
---

# Preview tabs are hidden from the Project tree but keep their slot in the tab strip

Single-clicking a file row opens it as a [[Preview tab]] — one per [[Workspace]], reused in place by the next file click, italic in the tab strip, [[Stuck]] only once the user re-activates its tab, double-clicks the file row, or splits it. That Tab appears in the tab strip and in Zen's pane tier, but the [[Project tree]] omits it.

## Why

Clicking through a changed-file list is browsing, not session-building. Every click used to mint a permanent [[Tab]] that then had to be closed one by one, and each one landed in the [[Project tree]] alongside real agent and terminal sessions — the sidebar stopped being a map of work in progress and became a pile of files you glanced at. Hiding preview tabs there restores the tree's meaning: it lists what you committed to, not what you looked at. The tab strip keeps showing the preview because it is the surface you are actively reading from.

## Considered options

**Hide preview tabs everywhere** (Project tree, Zen's pane tier, and the worktree pane-count badges) was rejected: Zen's pane tier is a flat inventory of what is running in a Workspace, and a file you are currently reading is genuinely there. Silently subtracting it from the counts makes the badge disagree with what the screen shows.

**Show preview tabs dimmed instead of hidden** was rejected because the point is to keep the tree short, and a dimmed row still costs a line.

## Consequences

⌘N numbering follows the tab strip, so a preview tab consumes a number. The [[Project tree]], which hides that tab, therefore shows a gap in its hints (⌘1, ⌘2, ⌘4) — deliberate, so the same key always reaches the same tab from either surface.

A preview tab counts for Workspace liveness like any other [[Tab]]. Closing the last stuck tab while a preview is open leaves the Workspace alive with a branch row that has no session rows under it.

Because a preview tab is replaced without asking, it must never hold a live process. Splitting one promotes it first, which keeps the invariant: at replacement time a preview tab is always a single read-only viewer [[Pane]] with nothing to kill.

Preview state is persisted and restored — a preview tab comes back from a restart still a preview.
