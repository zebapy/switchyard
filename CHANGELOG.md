# Changelog

All notable changes to Switchyard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-07-15

### Added

- Settings → General → **Zen Mode** now has a toggle for entering/leaving Zen Mode, alongside the existing ⌘K command.

## [0.3.0] - 2026-07-14

### Fixed

- Arrow-key navigation in the ⌘K command palette and the "New script…" palette no longer yanks the selection to whatever row happens to sit under a stationary mouse cursor. Scrolling the selected row into view was shifting rows under the cursor and firing a `mousemove`/`pointermove` the palettes mistook for a real hover.

### Added

- Open a worktree's branch on its git host in the browser. Right-click any worktree row for **Open branch on GitHub** (labelled per provider — GitLab/Bitbucket too), and the ⌘K command palette gains **Open Branch on GitHub** for the currently focused workspace. The backend resolves the `origin` remote to the provider's branch tree URL (GitHub `/tree`, GitLab `/-/tree`, Bitbucket `/src`); repos without an `origin` quietly do nothing.
- Worktree sort now defaults to **Created** (newest working directory first) and gains two options alongside Name/Created/Updated: **Changes** (worktrees with the most uncommitted +/- lines first) and **Pull request** (worktrees whose branch has an open GitHub PR first, then most-recently-committed). The root/main worktree always stays pinned to the top regardless of sort. Sort is also a **view action in the ⌘K command palette** — "Sort worktrees by …" (current option checked) acts on the active workspace's project — and in **Zen mode's ⌘K** on the Workspaces tier, which now honours the chosen order too.
- Right-click a worktree row for **Open Linear issue FDY-123** when its branch or path contains a configured team identifier. Configure the prefixes (e.g. `fdy`) under Settings → Linear → "Issue identifier prefixes"; the row resolves the identifier to its canonical Linear URL via the API and opens it.
- Zen Mode: a single-focus alternative layout, toggled with "Enter Zen Mode" in the ⌘K command palette (and "Exit Zen Mode" from Zen's own ⌘K). It drills one tier at a time — Projects → Workspaces (a repo's root + worktrees) → Panes — in a Navigate mode where the arrow keys move a cursor (→/Enter drills in, ← climbs out); entering a pane switches to Focus mode where the terminal/agent owns the keyboard and `^←` escapes. Inside Zen, `⌘P` opens a global jump palette (any pane/worktree, plus "Exit Zen Mode") and `⌘K` opens contextual actions for whatever's selected — archive on a worktree; rename / detach / close / new terminal / new chat on a pane. The two interfaces are lazy-loaded and only one is ever mounted (flipping the toggle swaps the whole tree), so the standard chrome adds nothing when Zen is on and vice-versa; both share the same stores and tmux back end, so terminals reattach across the switch. The toggle persists across restarts.
- Pull requests view: a "Pull requests" entry in the sidebar under Dashboard opens a per-project list of open PRs fetched from GitHub, defaulting to the active project (switch repos with the project picker). An "Only mine" toggle (on by default) filters to PRs you authored. Each row links out to GitHub and has a single action: "Open in worktree" checks the PR's head branch out into a new worktree (via `pull/<n>/head`, so fork PRs work too) and opens a workspace tab; when a worktree for that branch already exists locally the action becomes "Go to worktree" and jumps straight to it.

## [0.2.0] - 2026-06-17

### Changed

- The stacked "all changed files" diff (vs base branch, plus the inline and full-width tab views) now lazy-mounts each file: only sections near the viewport render their diff2html table and comment overlay, while offscreen files collapse to a measured-height placeholder. A large "vs base" diff no longer keeps every file's rendered diff in the DOM at once, fixing the scroll/render lag on big changes.

### Added

- Right-click a diff line (or a shift-selected range) for an "Explain this line/lines" menu, and right-click a file's diff header for "Explain this file". Either opens a fresh agent chat prefilled with the relevant snippet (or file + diff source) and sends it automatically.
- Worktree sort is now a button on each sidebar project row's hover actions (leftmost, before the two new-worktree buttons), so you can reorder without right-clicking. Clicking opens a small radio menu (Name/Created/Updated); the right-click context menu still has the same option. All three hover action buttons now have instant, styled tooltips (Base UI), replacing the native `title` delay.
- Line comments now work in the stacked "all changed files" diff (both the full-width tab and the sidebar inline view), not just the single-file diff pane. Hover any diff line for the comment affordance, optionally shift-click to span a range, then send the file + selected lines + your note to a new agent chat. The composer can extend past a file section's last line without being clipped.
- Project rows in the sidebar now show the repo owner's avatar (GitHub org/user) instead of a generic host mark. Parsed from the `origin` remote's owner; falls back to the git host icon (then a generic repo icon) when there's no avatar or the image fails to load.
- Claude usage meters in the sidebar above Settings: small side-by-side progress bars for the 5-hour session and 7-day week subscription windows. Bars are muted by default and turn orange only when hovering the region; hovering also shows a tooltip with the per-window breakdown (percent used and reset time). Read from Claude Code's `~/.claude/statusline-last-input.json`, refreshed every 30s.
- ⌥1…9 jumps to the Nth top-level project in the sidebar — reveals its window if one is open, otherwise starts the default agent there. Holding Option shows the matching ⌥N hint on each numbered row. (Option, not Control: macOS reserves ⌃1…9 for Mission Control space switching.)
- Holding Command now shows the matching ⌘N hint on each tab — both in the top tab strip and on the active window's session rows in the left sidebar (⌘1…8 by position, ⌘9 for the last), mirroring the project-switch hints. The ⌘1…9 tab-switch shortcuts themselves already existed.
- Inline diffs view in the Git panel's Changes tab: a third view toggle (alongside tree/list) that stacks every changed file's diff inline, PR-style, with collapsible per-file sections and expand/collapse-all — no clicking each file to see its diff.
- "Open all changes in a tab" button in the Changes header opens the full stacked diff as a full-width workspace tab. Each stacked file also has a hover affordance to open that single file's diff in its own tab.
- Show the git hosting provider's icon (GitHub, GitLab, Bitbucket) on each project in the sidebar, based on its `origin` remote. Projects with no recognized remote keep the generic repo icon.

### Changed

- Toned back ember accent usage so it reads as a deliberate signal rather than ambient color. Hover states no longer flip to orange (icon buttons, menu items, cards, chips now elevate with neutral `hover` background/text); selected rows and cards collapse to a single ember left-rail over a neutral background instead of stacking tint + border + colored text; and the persistent "main/base branch" icon markers in the tree, tab bar, and dashboard are demoted to neutral ink. Ember is now reserved for primary actions, focus rings, toggle "on" states, and the single selected/active item.

### Fixed

- Delete/close icon buttons no longer show an orange tint behind their red hover text (the wash now uses the neutral `hover` background).
- Killed the recurring macOS "Switchyard wants to use your confidential information in your keychain" password prompt. The app is ad-hoc signed, so every build (and every auto-update) has a new code signature and the keychain ACL never matched — "Always Allow" couldn't stick. GitHub/Linear tokens now live in an owner-only (0600) `tokens.json` in the config dir (the same model as git-credential-store, gh, and npm) instead of the keychain. You'll need to reconnect GitHub and Linear once after updating.

## [0.1.0]

- Initial release.

[Unreleased]: https://github.com/zebapy/switchyard/compare/app-v0.1.0...HEAD
[0.1.0]: https://github.com/zebapy/switchyard/releases/tag/app-v0.1.0
