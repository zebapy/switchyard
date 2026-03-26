# wip — TODO

## Project navigation tree

- [x] Auto-scan subdirectories at startup
- [x] "Pinned" and "Projects" sections (alphabetical)
- [x] Collapsible sections and project entries
- [x] Git branch, PR number, and CI status shown per project
- [x] Clickable PR info (opens in browser)
- [x] `+ agent` / `+ terminal` / `+ lazygit` action buttons per project
- [x] Running agents/terminals shown with status indicators
- [x] Live filter search
- [x] Pin/unpin projects (persisted)
- [x] `+ new project` button (creates dir + git init)

## Git worktree support

- [x] Auto-detect and display git worktrees
- [x] Group worktrees under parent project
- [x] Create new worktrees with random slug names (editable before confirm)
- [x] Delete worktrees

## Tabbed workspace with split panes

- [x] One tab per project, auto-created
- [x] Recursive split pane layout (horizontal/vertical)
- [x] Adjustable split ratios via drag
- [x] Clickable tab bar
- [x] Tab navigation from command palette

## Terminal panes

- [x] Four pane types: Agent, Shell, Lazygit, Custom command
- [x] Full terminal emulation with mouse and keyboard support
- [x] Close pane, cycle between panes

## Agent status detection

- [x] Detect agent state: Working, Waiting for input, Idle
- [x] Show status icons in the project tree per agent
- [x] Detect accent color from agent output

## Terminal title capture

- [x] Capture window title set by Claude Code's `/rename`
- [x] Use as pane display name, fall back to folder name

## Drag and drop

- [x] Resize panes by dragging dividers
- [ ] Move panes between splits by dragging title bar
- [ ] Move panes between tabs by dropping on tab header
- [ ] Text selection and copy to clipboard

## Command palette

- [x] Modal overlay with fuzzy-filtered search
- [x] Built-in commands: close pane, close all, toggle pin, help, quit
- [x] Tab commands: next, previous, close, rename, move pane to tab
- [x] Split commands: split right, split down
- [ ] User-defined commands shown as "Run: name"

## Git info display

- [x] Background polling for branch + PR info (refreshes every ~10s)
- [x] Show branch name, PR number, CI check status
- [x] Show PR status (open/merged/closed)
- [x] Clickable PR row opens in browser

## Session persistence

- [ ] Save workspace layout and pane state on quit
- [ ] Restore layout and re-spawn panes on next launch
- [ ] Skip save if all panes are closed

## User-defined commands

- [ ] Load commands from config (global + per-project)
- [ ] Surface in command palette
- [ ] Spawn as custom command pane with optional working directory

## Help overlay

- [x] Keybinding reference overlay

## Keybindings

- [x] `Ctrl+Space` command palette
- [x] `Ctrl+E` focus tree
- [x] `Ctrl+Q` quit
- [x] `Ctrl+A` new agent, `Ctrl+T` new terminal
- [x] Tree: `j`/`k`/arrows navigate, `Enter`/`Space` toggle, `p` pin, `d` remove worktree
- [x] Tree: `/` filter, `?` help, `q`/`Esc` quit/clear
- [x] Pane: `Ctrl+N`/`Ctrl+P` cycle, `Ctrl+X` close
