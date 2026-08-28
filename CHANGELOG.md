# Changelog

## 0.2.0

- Per-repository buttons now actually render. They moved from `scm/sourceControl` group `inline`,
  which VS Code never draws, to `scm/title` with `when: scmProvider == git`, which is the menu a
  repository header renders — the same route the built-in `git.commit` and `git.refresh` take.
- Fetch all / pull all no longer repeat themselves on every repository row: they are bound to
  `!scmProvider`, so they appear once in the Source Control view title.
- Added a vertical divider between the built-in Git buttons and this extension's buttons.
- Pull and push use `arrow-circle-down` / `arrow-circle-up`, which do not read as the Git sync icon.

## 0.1.0

- Fetch all / pull all from the Source Control view title bar.
- Per-repository terminal, fetch, pull and push buttons.
- Repositories list showing branch, ahead/behind and local change counts.
