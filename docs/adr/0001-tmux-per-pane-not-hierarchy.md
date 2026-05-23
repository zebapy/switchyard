---
status: accepted
---

# tmux is per-Pane, not the source of truth for Window/Tab/Pane structure

The app's Window→Tab→Pane hierarchy is owned entirely by the frontend store. tmux is used only as a per-Pane shell-persistence wrapper: each Pane has one tmux session named by its Pane UUID. tmux's own session/window/pane hierarchy is *not* mapped to the app's hierarchy.

## Why

The cleaner-looking alternative — map app Window → tmux session, app Tab → tmux window, app Pane → tmux pane — would give native `tmux attach -t <project>` ergonomics and free persistence of splits/layout. We rejected it because every app Pane would then need an output bridge from a *tmux pane* (not a session) into xterm.js, every resize/focus round-trips through `tmux` commands, and drag-to-resize translates into `tmux resize-pane`. The plumbing cost is weeks; the wins are mostly ergonomic.

## Consequence

External `tmux attach` works at Pane granularity only, never at Window granularity. Splits and layout are not preserved by tmux — they are persisted by the app via `session.json`. If we later want whole-project attach from an external client, this ADR must be revisited.
