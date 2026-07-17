# Switchyard

## Development

When the user asks to "boot", "run", "run dev", or "start the app", run `pnpm tauri dev` (the full desktop app), not `pnpm dev` (vite frontend only).

## Design

Text and UI colors must meet WCAG AA contrast against their actual background:

- **4.5:1** for normal text.
- **3:1** for large text (≥18px, or ≥14px bold) and for meaningful non-text UI (icons, focus rings, the selected-row rail/fill, status indicators).

Check the ratio against the surface the element really sits on (e.g. `--color-app` for the Zen lists, `--color-side` for panels), not against pure black. When a muted token like `--color-ink-ghost` or `--color-ink-faint` fails on a given surface, step up the ink ramp (`ink-faint` → `ink-dim` → `ink`) until it passes rather than inventing a one-off color. Accent colors (`--color-signal`, status colors) carry meaning, so they must clear 3:1 too.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). Every commit subject is prefixed with a type so changes can be grouped and versioned:

- `feat:` — a new feature (minor version bump)
- `fix:` — a bug fix (patch version bump)
- `chore:` — tooling, deps, config, or other non-user-facing changes
- `docs:` — documentation only
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `perf:` — performance improvement
- `test:` — adding or fixing tests
- `ci:` — CI/build pipeline changes

Breaking changes: append `!` after the type (`feat!:`) and/or add a `BREAKING CHANGE:` footer. These trigger a major version bump.

Format: `type(optional scope): short summary`, e.g. `feat(sidebar): add worktree search`.

Keep `CHANGELOG.md` updated alongside notable changes.
