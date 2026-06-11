# Switchyard

## Development

When the user asks to "boot", "run", "run dev", or "start the app", run `pnpm tauri dev` (the full desktop app), not `pnpm dev` (vite frontend only).

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
