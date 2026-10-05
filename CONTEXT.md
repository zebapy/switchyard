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

A named slot inside a [[Workspace]] containing a recursive split layout of [[Pane]]s. A live Workspace always has at least one Tab — the moment its last Tab closes, the Workspace itself is destroyed. Default behaviour: each sidebar action (`+ agent`, `+ terminal`, `+ script`) creates a new Tab in the Workspace with one Pane. A Tab is either [[Stuck]] or a [[Preview tab]].

## Preview tab

A [[Tab]] the user landed on by glancing rather than choosing: it holds exactly one read-only viewer [[Pane]] — a file's contents or a single file's diff — opened by single-clicking a row in a file list. A [[Workspace]] has at most one; opening another file takes over the same slot instead of adding a Tab. It is not yet part of the Workspace's session inventory, so the [[Project tree]] leaves it out.

_Avoid_: temporary tab, ephemeral tab, scratch tab.

## Stuck

The state a [[Preview tab]] enters once the user commits to keeping it, by re-activating its tab, double-clicking the file row that opened it, or splitting it. Every other [[Tab]] is born Stuck. A Stuck Tab survives the next file open and appears in the [[Project tree]] like any other session.

_Avoid_: pinned, permanent, kept, promoted.

## Pane

A single thing occupying one slot inside a [[Tab]]. Most Panes are terminal-class — an agent, plain shell, lazygit, or user-defined script command — but a Pane may instead be a read-only viewer of a file or a diff, which owns no process. Panes can be arranged via splits within their Tab; they do not cross Tab or [[Workspace]] boundaries.

## Project tree

The always-visible left sidebar listing every known [[Project]]. Acts as the launcher for [[Workspace]]s and the home of per-branch actions (`+ agent`, `+ terminal`, etc.).

## Prewarmed agent

An agent process started for the [[Workspace]] the user has selected, before they ask for a chat in it, so the next agent [[Pane]] there attaches to a running agent instead of starting one. At most one exists at a time; the [[Pane]] that takes it *claims* it, after which it is an ordinary Pane session. Unclaimed ones are invisible to the user and die with the selection or the app.

_Avoid_: cached agent, pooled agent, background agent (that means an agent doing work, not one waiting to be adopted).
