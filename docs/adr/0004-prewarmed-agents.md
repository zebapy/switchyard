---
status: accepted
---

# One agent is booted ahead of the user asking for it

While the user has a workspace selected — a row under the cursor in Zen, or the active window in the Standard layout — Switchyard boots the default agent for that workspace in a detached tmux session named `wip-warm-<n>`. Starting a chat there claims that session: the backend renames it to the pane's own `wip-<pane id>` and attaches, so the pane opens on an agent that is already running.

At most one prewarmed session exists at a time, and a claimed one is not immediately replaced: the next agent is warmed when the selection moves, so the app never holds a permanent spare process. Moving the selection kills the previous one after a 450ms dwell, so a spare agent is only started for a workspace the user actually rested on. Unclaimed sessions are hidden from the tmux session list, killed on quit, and reaped at startup (the crash case). The behaviour is off when tmux is unavailable — a detached session is what makes the handover possible — and can be turned off in Settings → Agents.

## Why

Nothing Switchyard does around a new chat is slow: tmux creates a session in ~30ms and the PTY plumbing is a few IPC calls. The wait is the agent's own startup — loading config, plugins, and MCP servers — which the app can't shorten, only move earlier. Prewarming spends idle time (the user reading a list) instead of foreground time (the user waiting on a chat they just asked for).

Claiming renames rather than tracking a second session name so that a claimed session is indistinguishable from one the pane started itself: the same kill path, detach behaviour, and orphan-recovery rules apply with no `warm` special case downstream.

## Consequence

A prewarmed agent is a real agent process. Its session-start hooks run, its MCP servers connect, and its transcript exists even if the user never opens that chat — which is why it is one process, not a pool, and why the setting exists. Anything with side effects on startup will see sessions nobody opened.

A starting prompt can't be a launch argument for an agent that is already running, so an adopted pane's prompt is typed into the agent instead (the existing `pendingPaneInput` path), landing as a submitted message rather than an `argv` entry.
