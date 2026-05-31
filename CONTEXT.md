# Context

Glossary of domain terms used in this codebase. No implementation details.

## Project

A repo or folder known to the app and listed in the [[Project tree]]. A Project owns many [[Workspace]]s: one for its base branch, plus one for each git worktree. The Project tree is global — shared across everything — and acts as the launcher for Workspaces.

## Workspace

A base branch or git worktree of a [[Project]], keyed by its working-directory path. Each Workspace owns its own set of tabs, panes, terminals, and agents — all scoped so they never appear in or interact with another Workspace. A worktree has its own path and is therefore its own Workspace, never sharing state with the parent repo's Workspace, even though the [[Project tree]] groups them visually under the Project.

The whole app lives in a single OS window; a Workspace is a virtual surface inside it, not an OS-level window.

**Lifecycle:** Workspaces are created lazily — none exist until the user selects that branch. Selecting a branch with no live Workspace opens one and immediately starts a Claude agent [[Tab]]; selecting a branch that already has a Workspace just reveals it (and its active [[Tab]]). Closing the last [[Tab]] destroys the Workspace and *kills* every tmux session it owned; state is not retained. Re-selecting that branch starts fresh.

Creating a git worktree follows the same rule: the new worktree is auto-selected, so its Workspace opens with a Claude agent [[Tab]] ready to work in.

## Tab

A named slot inside a [[Workspace]] containing a recursive split layout of [[Pane]]s. A live Workspace always has at least one Tab — the moment its last Tab closes, the Workspace itself is destroyed. Default behaviour: each sidebar action (`+ agent`, `+ terminal`, `+ script`) creates a new Tab in the Workspace with one Pane.

## Pane

A single running terminal-class thing inside a [[Tab]]: an agent, plain shell, lazygit, or user-defined script command. Panes can be arranged via splits within their Tab; they do not cross Tab or [[Workspace]] boundaries.

## Project tree

The always-visible left sidebar listing every known [[Project]]. Acts as the launcher for [[Workspace]]s and the home of per-branch actions (`+ agent`, `+ terminal`, etc.).
