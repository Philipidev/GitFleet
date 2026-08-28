# Git Fleet

Bulk and per-repository Git actions for VS Code windows that hold many repositories at once.

## What it adds

**On every repository header** — each repository row of the Source Control view, and the view title
bar itself when a single repository is open. A vertical divider marks where the built-in Git buttons
end and these begin:

| Icon | Action |
| --- | --- |
| `│` | Divider, does nothing |
| `$(terminal)` | Open a terminal with `cwd` at that repository |
| `$(cloud-download)` | Fetch that repository |
| `$(arrow-circle-down)` | Pull that repository |
| `$(arrow-circle-up)` | Push that repository |

**Source Control view title bar, with more than one repository open**

| Icon | Action |
| --- | --- |
| `$(cloud-download)` | Fetch every open repository |
| `$(sync)` | Pull every open repository |

These two are deliberately bound to `!scmProvider`, so they show up once in the view title instead
of being repeated on every repository row. With a single repository open the per-repository buttons
already cover the same ground, so they stay hidden.

**A `Repositories` list inside the Source Control view** — one row per open repository, showing
`branch  ↓behind  ↑ahead  ●localChanges`, carrying the same four per-repository buttons. It is the
only place that surfaces the ahead/behind counters; hide it with
`"gitFleet.showRepositoriesView": false` if the plain rows are enough.

Repository headers render the `scm/title` menu scoped to that repository — that is how the built-in
`git.commit` and `git.refresh` buttons get there, and why per-repository actions belong in
`scm/title` with `when: scmProvider == git` rather than in `scm/sourceControl`, whose toolbar is
`navigation` and whose `inline` group is never drawn.

Everything is also available in the Command Palette under **Git Fleet**.

## Behaviour worth knowing

- **Fetch all is read-only.** Nothing in your working tree is touched. It is the safe default and
  the fastest way to see which repositories drifted.
- **Pull all asks first** (`gitFleet.pullAll.confirm`) and by default **skips repositories with
  uncommitted changes** (`gitFleet.pullAll.skipDirty`) and repositories whose branch has no upstream.
- One failing repository never aborts the run. Every result lands in the **Git Fleet** output
  channel, aligned, with the branch and the ahead/behind counters after the operation.
- Bulk runs are parallel, bounded by `gitFleet.concurrency` (default 6), and cancellable from the
  progress notification.
- **Push** on a branch with no upstream asks before publishing, then pushes with `--set-upstream`.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `gitFleet.showRepositoriesView` | `true` | Show the `Repositories` list in the Source Control view |
| `gitFleet.concurrency` | `6` | Repositories processed in parallel during bulk actions |
| `gitFleet.pullAll.confirm` | `true` | Confirm before pulling everything |
| `gitFleet.pullAll.skipDirty` | `true` | Skip repositories with local changes during bulk pull |
| `gitFleet.ignoreRepositories` | `[]` | Folder names to hide from the list and bulk actions |
| `gitFleet.terminal.reuse` | `true` | Reuse the existing terminal for a repository |

## Install

Git Fleet is not on the Marketplace. It installs from this repository, in one command:

```bash
git clone https://github.com/Philipidev/GitFleet.git
cd GitFleet
node scripts/install.js
```

That packages the extension into a `.vsix` and installs it with `code --install-extension`, so the
result is a normal VS Code install that no longer depends on where the clone lives. Then run
**Developer: Reload Window**.

Uninstall with:

```bash
code --uninstall-extension philipidev.git-fleet
```

To update later: `git pull`, then `node scripts/install.js` again.

Requirements: Node.js, the `code` CLI on PATH (VS Code command **Shell Command: Install 'code'
command in PATH**), and network access the first time, for `npx @vscode/vsce`.

Prebuilt `.vsix` files are attached to each [GitHub release](https://github.com/Philipidev/GitFleet/releases)
if you would rather skip the build:

```bash
code --install-extension git-fleet-<version>.vsix
```

### Windows: every profile at once

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-local.ps1
```

Same build, but it installs into the Default profile plus every profile that does not already share
the Default profile's extensions.

### Working on the extension itself

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-link.ps1
```

This junctions the clone into `~/.vscode/extensions`, so the extension loads straight from source and
a window reload is the whole edit cycle — no packaging step. Add `-Remove` to undo. The junction and
a normal install share the same extension id and must not coexist: uninstall one before setting up
the other.

## Syncing across machines

There is none, and that is a VS Code limitation rather than a choice here. Settings Sync replicates
*extension identifiers* and reinstalls them from the Marketplace; it has no way to fetch a `.vsix` or
a source folder. A folder-scanned or `.vsix`-installed extension therefore stays on the machine that
installed it.

What does carry over is the repository: clone it on the other machine and run the same one-liner.
Profiles on the same machine are easier — a profile created with "Extensions" left as a
default-profile flag shares the Default profile's extension set and needs no separate install.

## Releasing

Push to `main` and the release workflow packages the extension, uploads the `.vsix` as a build
artifact, and — when the version in `package.json` changed in that push — creates the `v<version>`
tag and a GitHub release carrying the `.vsix`. Ordinary commits that leave the version alone just
produce the artifact.

Bumping, committing and pushing is one command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\bump.ps1          # patch; also minor / major
```

The icon is generated, not hand-drawn — edit `scripts/make-icon.ps1` and rerun it to change it.

## Requirements

- VS Code 1.90 or newer
- The built-in Git extension enabled (`git.enabled`)

Repositories are discovered through the built-in Git extension's API, so anything that appears in
the Source Control view appears here — including subfolders found by `git.repositoryScanMaxDepth`.
