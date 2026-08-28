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

### Develop from source (this machine only)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-link.ps1
```

Then **Developer: Reload Window**. Junction install, no admin rights, no build step — the extension
is plain JavaScript against the VS Code API.

### Package and install into every local profile

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-local.ps1
```

Builds a `.vsix` and installs it into the Default profile plus every profile that does not already
share the Default profile's extensions.

## Syncing across profiles and machines

This is the part where VS Code has real limits, so it is worth being precise:

| Install method | Available in other profiles | Carried by Settings Sync to another machine |
| --- | --- | --- |
| Folder / junction in `~/.vscode/extensions` | yes, it is machine-scanned | **no** |
| `.vsix` (`code --install-extension`) | only the profiles you install it into | **no** |
| Marketplace | yes, one click per profile | **yes** |

Settings Sync replicates *extension identifiers* and re-installs them from the Marketplace on the
other machine. It has no way to fetch a `.vsix` or a source folder, so pushing this repository to
GitHub does not by itself make the extension sync — GitHub is where the source lives, the
Marketplace is what makes sync work.

A profile that was created with "Extensions" left as a default-profile flag shares the Default
profile's extension set, so it needs no separate install at all.

### Publishing to the Marketplace

`package.json` is already set to publisher id **`philipidev`**, so the extension id will be
`philipidev.git-fleet`. One-time setup:

1. Sign in to <https://marketplace.visualstudio.com/manage> with a Microsoft account. It creates an
   Azure DevOps organisation on first use.
2. Create a publisher whose **id is exactly `philipidev`** (the display name can be anything). A
   mismatch here is the most common `vsce publish` failure.
3. In Azure DevOps, create a Personal Access Token: organisation **All accessible organizations**,
   scope **Marketplace → Manage**, no expiry shorter than you want to babysit.

Then publish, either from the machine:

```bash
npx @vscode/vsce login philipidev
npx @vscode/vsce publish
```

…or from CI, which is what `.github/workflows/release.yml` does. Store the token once:

```bash
gh secret set VSCE_PAT --repo Philipidev/GitFleet
git tag v0.1.0 && git push origin v0.1.0
```

The workflow packages the `.vsix`, attaches it to the GitHub release, and publishes to the
Marketplace when `VSCE_PAT` is present. Bump `version` in `package.json` before every tag — the
Marketplace rejects a re-publish of an existing version.

Marketplace listings are public and there is no unlisted mode. If the extension should stay
private, stay on the `.vsix` route and accept the per-machine install.

The icon is generated, not hand-drawn — edit `scripts/make-icon.ps1` and rerun it to change it.

## Requirements

- VS Code 1.90 or newer
- The built-in Git extension enabled (`git.enabled`)

Repositories are discovered through the built-in Git extension's API, so anything that appears in
the Source Control view appears here — including subfolders found by `git.repositoryScanMaxDepth`.
