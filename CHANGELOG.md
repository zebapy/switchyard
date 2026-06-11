# Changelog

All notable changes to Switchyard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
