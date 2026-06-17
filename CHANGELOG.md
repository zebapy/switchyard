# Changelog

All notable changes to Switchyard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
