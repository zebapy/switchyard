---
status: accepted
---

# Closing a Pane or Window kills its tmux session by default

The default `Close pane` gesture (`Ctrl+X`, palette entry, tab/window close affordances) terminates the underlying tmux session. Closing the last Tab in a [[Window]] therefore kills every tmux session that Window owned. A separate, explicit `Detach pane` command exists in the command palette for the case where the user wants the UI gone but the shell preserved.

## Why

Most terminal multiplexers default to detach (keep shell alive). We chose the opposite because Panes here are typically purpose-built agent/script sessions, not long-lived shells the user wants to come back to. Defaulting to detach accumulates orphan tmux sessions every time a user tidies up — exactly the cross-context noise the [[Window]] isolation model was introduced to eliminate. Detach remains available as a deliberate gesture for the rare "I want this to keep running" case.

## Consequence

`Ctrl+X` is destructive and irreversible. There is no scrollback recovery after close. Users coming from tmux/zellij must learn the inverted default. The orphan-session safety net (the sidebar's tmux session list) is therefore reserved for things like external `tmux new-session` invocations and recovery from app crashes — not for everyday close gestures.
