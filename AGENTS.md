# Ghibli Player agent guide

## Project map

- The shipped macOS player UI is `GhibliPlayer.app/Contents/Resources/index.html`. Treat it as the source of truth for app changes.
- Root `index.html` is a smaller standalone template. Do not overwrite or synchronize it unless the task explicitly includes the template.
- The downloader is a separate Chrome extension under `chrome-extension/`.
- Large images are embedded as base64 in the packaged HTML. Use narrow, context-based edits and do not re-encode unrelated assets.

## Codex and Claude collaboration

- Never run two writing agents in the same checkout. Give each agent its own Git worktree and branch.
- Use `agent/<task>` for Codex branches and `claude/<task>` for Claude Code branches.
- Declare file ownership before parallel implementation. One agent owns each file; the other requests changes or reviews the resulting commit.
- Handoff through a commit SHA or pull request. The reviewer should comment on the diff instead of editing the implementer's branch.
- Before editing, run `git status -sb`. Preserve unrelated user changes and never reset another agent's work.
- Prefer a two-role workflow: one agent implements, the other reviews behavior, accessibility, regressions, and test coverage.

## Verification

- Parse every inline script in the packaged HTML with Node `vm.Script` after JavaScript changes.
- Run `git diff --check` before committing.
- Run `plutil -lint GhibliPlayer.app/Contents/Info.plist` after app-bundle changes.
- Editing a sealed app resource invalidates the ad-hoc signature. Re-sign with `codesign --force --deep --sign - GhibliPlayer.app`, then verify with `codesign --verify --deep --strict --verbose=2 GhibliPlayer.app`.
- Preview the packaged HTML through localhost; direct `file://` browser access may be blocked. Check the normal desktop layout and a narrow viewport.
- For player changes, verify keyboard access, 44px minimum control targets, no horizontal clipping, and reduced-motion behavior.

## Publishing

- Stage only files owned by the current task.
- Use a focused commit message and publish through a pull request unless the user explicitly asks to push directly to the default branch.
