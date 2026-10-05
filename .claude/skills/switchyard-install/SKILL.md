---
name: switchyard-install
description: Download the newest Switchyard release build from GitHub and install it into /Applications on this Mac — resolves the latest tag (drafts included), fetches the universal .dmg, compares it against what is already installed, then quits, replaces, and relaunches the app. Use when the user says "install the new release", "download the latest build", "update my Switchyard", "install the release", or "/switchyard-install". For *producing* a release, use switchyard-release instead.
---

# Install the latest Switchyard build

The companion to `switchyard-release`. That skill *cuts* a release; this one puts the
resulting build on this machine. Releases are created as **drafts**, so the app's own
auto-updater never sees them — a draft build can only get here by hand, which is what
this skill automates.

## Guardrails

- **Ask before quitting the app.** Replacing `/Applications/Switchyard.app` requires the
  running app to exit, which closes the user's open workspaces. Quitting does *not* kill
  their tmux sessions (`kill_tmux_session` only fires on explicit pane/tab close), and the
  session file restores the tabs on relaunch — say that when asking, so the answer is
  informed.
- **Never publish, edit, or delete a release** to make the install work. This skill only
  reads and downloads. A missing asset is something to report, not to fix by republishing.
- **Never install over a running app.** macOS will let you, and the result is a half-
  replaced bundle that crashes on next launch.
- **Stop if the versions already match.** Re-installing an identical build costs the user
  their session for nothing. Compare first (step 3), and say so instead.
- Use `trash`, never `rm -rf`, to remove the old bundle.

## Steps

### 1. Resolve the newest release
```
gh release list --limit 5
```
Drafts are listed here (they are hidden from `gh release view --json ... latest`), so take
the top row's tag — typically `app-vX.Y.Z`. Confirm the tag with the user if the top row is
older than a release they expected.

### 2. Download the universal .dmg
Download into a scratch directory, not the repo:
```
gh release download <tag> --pattern '*.dmg' --dir "$TMPDIR" --clobber
```
If no `.dmg` asset exists, the build failed or is still running — check
`gh run list --workflow=release.yml --limit 1` and report, don't improvise.

### 3. Compare against what is installed
Mount the image and read both versions:
```
hdiutil attach -nobrowse -quiet "$TMPDIR/Switchyard_X.Y.Z_universal.dmg"
defaults read "/Volumes/Switchyard/Switchyard.app/Contents/Info.plist" CFBundleShortVersionString
defaults read "/Applications/Switchyard.app/Contents/Info.plist" CFBundleShortVersionString
```
Equal version strings are not proof the same build is installed — a rebuilt tag keeps its
version. Compare the binaries to be sure:
```
shasum -a 256 "/Volumes/Switchyard/Switchyard.app/Contents/MacOS/switchyard" \
              "/Applications/Switchyard.app/Contents/MacOS/switchyard"
```
**Identical hashes → stop.** Detach (step 6) and tell the user the latest release is
already installed, naming the version. Do not quit their app.

### 4. Quit the running app
Check first, and ask before doing it:
```
pgrep -lf "Switchyard.app/Contents/MacOS/switchyard"
osascript -e 'tell application "Switchyard" to quit'
```
Wait for the process to disappear before copying. If it refuses to quit, report it —
do not `kill -9` an app that may be mid-write to its session file.

### 5. Replace the bundle
```
trash /Applications/Switchyard.app
ditto "/Volumes/Switchyard/Switchyard.app" "/Applications/Switchyard.app"
xattr -dr com.apple.quarantine /Applications/Switchyard.app
```
Remove the old bundle rather than copying over it — `ditto` merges into an existing
directory and would leave files from the previous build behind.

The app is unsigned, so clearing the quarantine attribute is what keeps Gatekeeper from
refusing to open it. If the user prefers, they can instead right-click → Open once.

### 6. Detach and verify
```
hdiutil detach "/Volumes/Switchyard" -quiet
defaults read /Applications/Switchyard.app/Contents/Info.plist CFBundleShortVersionString
open -a Switchyard
```
Report the installed version and confirm the app relaunched.

## Notes
- `gh release download` sets only `com.apple.provenance`, not `com.apple.quarantine` — the
  quarantine flag arrives when a *browser* does the download. Clearing it in step 5 is
  harmless either way.
- The volume mounts at `/Volumes/Switchyard`. If that path is taken, macOS appends a
  suffix (`Switchyard 1`) — read the actual mount point from `hdiutil attach`'s output
  rather than assuming.
- The `.app.tar.gz` + `.sig` + `latest.json` assets belong to the auto-updater. Installing
  by hand from the `.dmg` does not touch them, and does not need them.
- Publishing a release (`gh release edit <tag> --draft=false --latest`) is what makes the
  in-app updater offer it to everyone. That is the user's call — see `switchyard-release`.
