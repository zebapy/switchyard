# Changelog

All notable changes to Switchyard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The **Create worktree** modal is now prompt-first: it opens with a "What do you want to work on?" box, names the branch after the prompt (`Fix the flaky login redirect` → `fix-flaky-login-redirect`, deduped with a `-2` suffix when taken), and hands the prompt to the agent in the new workspace. Enter creates, ⇧Enter adds a line. Seeding from a Linear issue, GitHub issue, branch, or PR now lives behind an **Or start from** row — the list appears only once a source is picked, and anything typed in the prompt box is appended to the issue prompt. Picking a PR now checks the PR head out via `create_worktree_for_pr` instead of creating a plain branch worktree.

## [0.4.0] - 2026-07-27

### Added

- Zen Mode's top-right cluster gains a **pull-request control** whenever you're inside a workspace: `PR #123` opens the branch's open pull request on GitHub, and `Create PR` starts an agent chat seeded with "Create a pull request." when the branch has none. The GitHub connect prompt is now mounted in Zen too, so connecting an account works without leaving Zen.
- **Right-click any row** in a Zen tier list to select it and open its contextual ⌘K action menu — the same menu and the same target the keyboard flow uses.
- **⇥ now works with an empty search field**: on the Terminals & chats tier it opens a blank chat, and on the Workspaces tier it creates a randomly-named worktree. The `⇥ New chat` / `⇥ New worktree` hint is always visible instead of only appearing once you've typed.
- Zen Mode can now open **Settings with ⌘,** (matching the Standard layout and the native menu item). Settings open as a full-screen overlay hosted inside Zen — reusing the standard settings nav and section pages — so you stay in Zen instead of dropping back to the Standard chrome. Close it with the Back/close buttons or `Esc`.
- Zen Mode gains a **Back button** in the top-left toolbar, just right of the macOS traffic lights, with a hotkey keycap. Its label names where it lands — the parent worktree, the project, or `Projects` at the root — and it mirrors the escape keys: in a focused chat/terminal it leaves the pane (`^←`), otherwise it climbs one tier (`←`). Hidden at the Projects root, where there's nowhere left to go back to. It replaces the focus-only `^← escape pane` button.
- New context-aware **New… menu** anchored to the bottom-left and toggled with **⌘⇧K**. In the Standard layout it sits in the sidebar footer: the Workspace view offers new-session actions for the active window (New _agent_, New terminal, New worktree…), every other view offers project actions (Clone repo…, Add project…). In **Zen Mode** it sits in the bottom-left status bar: the Projects tier offers _Add folder as project…_, and the Workspaces/Panes tiers offer _New chat_ / _New terminal_ in the selected workspace.
- Zen Mode toolbar gains a centered, always-focused **search input**. Start typing anywhere in the tier view to fuzzy-narrow the current list — projects on the Projects tier, worktrees on the Workspaces tier, and terminals/agents/cloud sessions on the Panes tier — with the best match ordered first and the cursor snapped to it. Arrow keys still navigate the filtered list, → / Enter drills in, and Escape clears the query before climbing a tier. The search resets whenever you change tiers.
- Zen Mode chrome is simplified: the breadcrumb moves from the top toolbar to the **bottom-left status bar**, and the verbose navigation-hint strip (the `NAVIGATE` badge and `↑↓ move` / `→ enter` / `← up` / `⌘T` legends) is removed. The bottom-right action button now shows `→` (matching the forward-arrow/Enter that opens the selection).
- Zen Mode **Focus** (a pane opened full-screen) now shares the same toolbar and footer as the tier list instead of a separate green-outlined card: the breadcrumb stays in the bottom-left (extended with the focused pane's name), the **^← escape pane** control moves into the top toolbar, and the green focus outline and `FOCUS` badges are gone.
- Zen Mode toolbar gains a **⌘O open** button (left of ⌘P jump) that opens the current directory — the selected project, worktree, focused terminal/agent/cloud session, or empty worktree — in Finder, VS Code, Cursor, Terminal, iTerm, Warp, or Ghostty. The `Open in…` app list is now a shared API (`src/lib/openIn`) reused by the workspace header menu.
- Zen Mode Workspaces tier now shows a **pull-request badge** in each worktree row's right-hand detail when its branch has an open GitHub PR (`#123`, marked `draft` for drafts). The row's ⌘K actions gain **Open pull request #123 on GitHub** when a PR exists, or **Create pull request…** (seeds a Create-PR agent chat in that worktree) when it doesn't.

### Changed

- The Zen **diff view now reuses the shared top toolbar** rather than stacking a second bar beneath it, which had left a visible gap. Back, the file breadcrumb, and the ⌘P source picker (working tree / staged / vs base branch) all live in the one band, and the chosen diff source moved into the Zen store so it survives menu round-trips and resets to `vs base branch` each time a diff opens.
- Zen overlay menus (⌘K actions, ⇅ sort, ⌘O open-in, ⌘⇧K new, diff source) **drop the dimming scrim and backdrop blur** — the list underneath stays legible while a menu is open.
- Zen Mode tier lists (Projects / Workspaces / Terminals & chats) are restyled around a new **Signal aqua** accent (`#40e0c0`) — the railway signal-lamp glow, distinct from every status color. Selected rows drop the border ring and ember tint for a borderless **soft aqua fill** with rounded corners and aqua-tinted label. The `ROOT` badge and the PR indicator lose their boxed borders (now bare colored text), and the Zen overlay menus (actions, sort, open-in) pick up the same aqua selection highlight.
- Zen Mode replaces the global **⌘P jump** palette (jump to any pane/worktree across every project) with a context-aware **sort** button in the same top-right slot. It sorts whichever tier is on screen and persists the choice: **Projects** by Manual (drag order, default) / Recent activity / Name / Workspaces / Panes; **Workspaces** by the existing Created / Updated / Name / Changes / Pull request; **Terminals & chats** by **Status** (agents awaiting input first, then working, then idle, then terminals — the new default), Name, or Kind. The button (labelled `⌘P ⇅ Sort: <type>`) opens a small menu with the active option checked; `⌘P` still toggles it. Worktree sort is no longer buried in the Workspaces-tier ⌘K actions, and **Exit Zen Mode** (previously only in the jump palette) moves to the ⌘K action menu, where it's always available.
- Zen Mode Projects and Workspaces tiers now group into **`Pinned` and `Projects`/`Worktrees` sections** with headings. **Pin project** / **Pin workspace** (and their unpin counterparts) are in each row's ⌘K actions; pinned items float to the top regardless of sort. On the Workspaces tier the repo **root always leads the `Pinned` section** (it can't be pinned or unpinned), and the redundant per-row `WORKTREE` badge is gone — the section heading conveys it — while the `ROOT` badge stays. Sections collapse to a flat list while a search is active.

### Fixed

- The Zen **Settings overlay collided with the macOS traffic lights** — Zen floats them over its toolbar band, and the overlay covered that band, so the settings Back button sat underneath the buttons. The overlay now reserves a draggable strip of the same height.
- Zen Mode's **sort** and **New…** menus were missing a search box, which also left cmdk without a focused input — so opening them, then pressing ↑/↓ did nothing and there was no field to type into. All Zen overlay menus (⌘K actions, ⇅ sort, ⌘O open-in, ⌘⇧K new) now share one combobox component with an **autofocused search** that fuzzy-narrows the list and full up/down/Enter keyboard nav.
- Zen Mode now vertically centers the macOS traffic-light buttons in its taller top toolbar (they no longer look crammed against the top of the window) and gives them a left inset matching the toolbar's right padding. The buttons are repositioned natively while Zen owns the window and restored to their default macOS layout on exit, so the Standard layout is unaffected.

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
