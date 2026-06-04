---
name: switchyard-release
description: Cut a Switchyard desktop release end-to-end — bump the version, commit, tag `app-vX.Y.Z`, push to trigger the universal macOS build, watch CI, verify the draft release assets, then hand off to the user to smoke-test and publish. Use when the user says "cut a release", "make a release", "ship a new version", "release", or "/switchyard-release".
---

# Release Switchyard

Drives the release checklist for this Tauri 2 app. A push of a `app-v*` tag triggers
`.github/workflows/release.yml`, which builds **one universal macOS binary** (Apple
Silicon + Intel in a single `.dmg`) and creates a **draft** GitHub Release with the
`.dmg`, the updater `.app.tar.gz` + `.sig`, and `latest.json`.

## Guardrails (do not violate)

- **Never push without explicit user confirmation.** Before any `git push`, ask which
  bump to cut and confirm the push. (Matches the repo/global CLAUDE.md rule.)
- **Never force push.** The tag is created fresh each release; no `-f` needed. If a tag
  already exists remotely, delete it via `gh release delete <tag> --cleanup-tag` and
  re-push plainly — do not force.
- **Never publish the release yourself.** Stop at the draft. The user smoke-tests the
  `.dmg` and runs the publish command. Publishing is what ships the auto-update to every
  existing install — it's the user's call.
- **Version must equal the tag.** App version `0.2.0` ⇄ tag `app-v0.2.0`. The updater
  diffs the config version; a mismatch means nobody updates.

## Steps

### 1. Preflight
- Confirm on `main`, clean tree, up to date: `git switch main && git pull && git status`.
- If there are uncommitted changes, stop and surface them — don't cut a release over a
  dirty tree.
- Read the current version from `package.json`.

### 2. Decide the bump
Ask the user: **patch / minor / major?** (SemVer.)
- patch — bug fixes only (`0.1.0 → 0.1.1`)
- minor — new features, backward compatible (`0.1.0 → 0.2.0`)
- major — breaking changes (`0.x → 1.0.0`); pre-1.0, treat minor as the breaking lever.

Compute the new version `X.Y.Z`.

### 3. Bump the version (keep all sources in sync)
The app/updater version comes from `src-tauri/tauri.conf.json`. Set the new version in
**every** place that still hardcodes it:
- `package.json` — `"version"`
- `src-tauri/tauri.conf.json` — `"version"` (skip if it is the path `"../package.json"`,
  in which case package.json is the only source)
- `src-tauri/Cargo.toml` — `version` (crate version; keep it aligned for tidiness)

Use `pnpm version <type> --no-git-tag-version` for package.json, then edit the others to
match. Verify all agree before continuing.

### 4. Commit + push main
- Commit: `chore(release): vX.Y.Z` (end with the Co-Authored-By trailer).
- **Ask the user to confirm the push.** On confirmation: `git push origin main`.
  Push `main` **before** the tag so the tagged commit exists on the remote branch.

### 5. Tag + push tag (triggers the build)
- `git tag app-vX.Y.Z`
- `git push origin app-vX.Y.Z`  ← this fires `release.yml`.
- If the tag already exists remotely from a failed attempt: `gh release delete app-vX.Y.Z
  --yes --cleanup-tag`, then `git tag -f app-vX.Y.Z <commit>` locally and `git push origin
  app-vX.Y.Z` (plain push — the remote tag is gone, so no force).

### 6. Watch CI
- Find the run: `gh run list --workflow=release.yml --limit 1 --json databaseId,status`.
- Watch it (single universal job, ~15–20 min). Run the watch in the background:
  `gh run watch <id> --exit-status`. Report when it finishes.
- If it fails, read the failed job logs, fix, and re-cut (step 5's re-cut path).

### 7. Verify the draft
On success, confirm the draft has the expected assets:
```
gh release view app-vX.Y.Z --json isDraft,assets --jq '{isDraft,assets:[.assets[].name]}'
```
Expect `isDraft: true` and:
- `Switchyard_X.Y.Z_universal.dmg`
- `Switchyard_universal.app.tar.gz` and `.sig`
- `latest.json`

If `latest.json` or `.sig` is missing, the updater is broken — investigate the
`TAURI_SIGNING_*` secrets before telling the user it's ready.

### 8. Hand off (do not publish)
Tell the user:
1. Download `Switchyard_X.Y.Z_universal.dmg` and **launch it** to smoke-test (a Gatekeeper
   warning is expected — the app is unsigned).
2. When happy, publish: `gh release edit app-vX.Y.Z --draft=false --latest`.
   Publishing flips `releases/latest` and the auto-updater ships it to all existing
   installs.

## Notes
- Drafts and pre-releases are invisible to the updater's `releases/latest` endpoint — safe
  until published.
- The minisign key (`TAURI_SIGNING_PRIVATE_KEY`) signs every update and is irreplaceable;
  if signing fails in CI, do not work around it — surface it.
- To undo a bad published release, you can't downgrade users: cut a higher patch version
  with the fix.
