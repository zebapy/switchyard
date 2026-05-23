# Context

Glossary of domain terms used in this codebase. No implementation details.

## Window

A per-project virtual workspace inside the single Tauri OS window. Each Window owns its own set of tabs, panes, terminals, and agents — all scoped so they never appear in or interact with another Window. The user switches Windows by selecting a project in the [[Project tree]]; only the active Window's tabs and panes are visible at a time. The [[Project tree]] itself is global (shared across Windows).

> Not to be confused with an OS-level window. There is exactly one Tauri OS window for the whole app.

A Window is keyed by working-directory path. A git worktree has its own path and is therefore its own Window — never shares state with the parent repo's Window, even though the [[Project tree]] groups them visually.

**Lifecycle:** Windows are created lazily — none exist until the user takes a first action on that project (open agent/terminal/script). Closing the last [[Tab]] destroys the Window and *kills* every tmux session it owned; state is not retained. Re-opening that project starts fresh.

Special case: creating a new git worktree auto-opens its Window and spawns an agent [[Tab]] immediately, because the user creates a worktree to start working in it.

## Tab

A named slot inside a [[Window]] containing a recursive split layout of [[Pane]]s. A live Window always has at least one Tab — the moment its last Tab closes, the Window itself is destroyed. Default behaviour: each sidebar action (`+ agent`, `+ terminal`, `+ script`) creates a new Tab in the current Window with one Pane.

## Pane

A single running terminal-class thing inside a [[Tab]]: an agent, plain shell, lazygit, or user-defined script command. Panes can be arranged via splits within their Tab; they do not cross Tab or [[Window]] boundaries.

## Project tree

The always-visible left sidebar listing every known project. Acts as the launcher for [[Window]]s and the home of per-project actions (`+ agent`, `+ terminal`, etc.).
