# wip — product requirements document

Terminal multiplexer purpose-built for managing multiple Claude Code agent sessions across projects.

## Problem

Developers using Claude Code across multiple projects need to constantly switch between terminal tabs/windows, lose context on agent status, and have no unified view of what's running where. Standard terminal multiplexers (tmux, zellij) are general-purpose and don't understand Claude Code's workflow.

## Solution

A single app that provides a project-aware workspace with split panes, tabs, and a navigation tree — all designed around the Claude Code agent lifecycle. Launch agents, terminals, and lazygit per-project, see agent status at a glance, and manage everything from one screen.

## Features

### Project navigation tree

Left panel showing all projects in the working directory.

- Auto-scans subdirectories at startup
- Two sections: "Pinned" (sorted first) and "Projects" (alphabetical)
- Collapsible sections and project entries
- Each expanded project shows:
  - Git branch + PR number + CI check status (inline)
  - Clickable PR info row (opens in browser)
  - `+ agent` / `+ terminal` / `+ lazygit` action buttons
  - Running agents with status indicator and accent color
  - Running terminals and lazygit instances
- Live filter search (`/` to activate, `Esc` to clear)
- Pin/unpin projects, persisted across sessions
- `+ new project` button: creates directory + `git init`

### Git worktree support

- Auto-detects git worktrees
- Groups worktrees under parent project in tree view
- Expandable worktree sections per project
- Create new worktrees with random slug names (adj-verb-noun), editable before confirm
- Delete worktrees from the tree

### Tabbed workspace with split panes

- Tabs auto-created per project (one tab per project path)
- Recursive split pane layout for horizontal/vertical splits
- Split ratios adjustable via mouse drag on dividers (clamped 10%-90%)
- Clickable tab bar
- Tab navigation via command palette

### Terminal pane management

Four pane kinds:

| Kind | Behavior |
|---|---|
| Agent | Opens terminal, starts Claude Code |
| Shell | Plain terminal |
| Lazygit | Opens terminal, starts lazygit |
| Custom command | Opens terminal, runs a user-defined command |

- Full terminal emulation with mouse and keyboard support
- Close pane, cycle between panes via keyboard

### Agent status detection

Scans the terminal buffer to determine Claude Code agent state:

| Status | Indicator |
|---|---|
| Working | `●` (filled circle) |
| Waiting for input | `◉` (ring) |
| Idle | `○` (empty circle) |

Also detects accent color from agent output for tree display.

### Terminal title capture

- Captures window title set by Claude Code's `/rename` command
- Used as pane display name
- Falls back to folder name if no title set

### Drag and drop

- **Pane resize**: drag split dividers to adjust ratio
- **Pane move**: drag pane title bar, drop on another pane's edge to create a split, drop on tab header to move to that tab
- **Text selection**: drag in pane content to select text, copies to clipboard

### Command palette

Modal overlay with type-to-filter fuzzy matching.

Built-in commands:
- Close pane, Close all panes
- Toggle pin, Help, Quit
- Split right, Split down
- Next tab, Previous tab, Close tab
- Rename tab, Move pane to tab

User-defined commands appear as "Run: name".

### Git info display

- Background polling for branch + PR info (refreshes every ~10s for expanded projects)
- Shows: branch name, PR number, CI check status (passing / failing / pending)
- PR status: Open / Merged / Closed
- Clickable PR row opens in browser

### Session persistence

- On quit: saves workspace layout and pane metadata
- On next launch: restores layout, re-spawns all panes
- Sessions not saved if all panes are closed

### User-defined commands

Config file schema (global + per-project):
```json
{
  "global": [{ "name": "...", "command": "...", "dir": "/optional/path" }],
  "projects": {
    "/path/to/project": [{ "name": "...", "command": "..." }]
  }
}
```

Commands appear in the command palette and spawn as custom command panes.

### Help overlay

Keybinding reference, toggled from the tree view.

## Keybindings

### Global
| Key | Action |
|---|---|
| `Ctrl+Space` | Command palette |
| `Ctrl+E` | Focus tree |
| `Ctrl+Q` | Quit |
| `Ctrl+A` | New agent pane (current project) |
| `Ctrl+T` | New terminal pane (current project) |

### Tree-focused
| Key | Action |
|---|---|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Enter` / `Space` | Expand/open/toggle |
| `p` | Toggle pin |
| `d` | Remove worktree |
| `/` | Filter |
| `?` | Help overlay |
| `q` / `Esc` | Quit / clear filter |

### Pane-focused
| Key | Action |
|---|---|
| `Ctrl+N` | Next pane |
| `Ctrl+P` | Previous pane |
| `Ctrl+X` | Close pane |
| All other | Forwarded to terminal |

## Configuration

All config stored in `~/.config/cc-tui/`:

| File | Purpose |
|---|---|
| `pins.json` | Pinned project paths |
| `scan_dirs.json` | Additional scan directories |
| `commands.json` | User-defined commands |
| `session.json` | Workspace state (written on quit, deleted on restore) |
