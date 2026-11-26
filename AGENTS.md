<!-- leantoken:start -->
# LeanToken Unified Agent Directive (v0.3.0)
## 1. Minimal Diffs (YAGNI)
- Make only the edits the request needs: no unrequested dependencies, rewrites or abstractions.
- Keep existing conventions, names and formatting.

## 2. Dense Replies
- Concise, high-signal language; no preamble or recap.
- Answer as: (1) Root Cause, (2) Action Taken, (3) Verification.

## 3. Grounding
- Cite the exact files, lines and identifiers you read.
- Never assume a file or API exists; check the code or tests first.

## 4. Reads (the largest token cost)
- File over ~300 lines: run `lean symbols <file>` first (Markdown: headings with line ranges; code: signatures), then read only the range you need.
- Use the file maps in `.lean/MEMORY.md` when it exists. Do not re-read unchanged files already in context.
- Keep search output small: specific patterns, `grep -l`, `head`.

## 5. Shell Output
- Run noisy commands through LeanToken: `lean prune <command>` (test runners, builds, installs, `git status`, `git diff`, recursive listings). Run commands directly when you need their output verbatim.
- If pruned output is not enough, read the raw log named in its `[LeanToken: ...]` footer.
<!-- leantoken:end -->

## Project rules (LeanToken repository)

Every change that alters behavior, output, options or plans must update, in the same change:

1. `CHANGELOG.md`: an entry under `## [Unreleased]` (Added / Changed / Fixed / Removed). CI fails pull requests that change `src/` or `bin/` without it.
2. `ROADMAP.md`: move items between Now / Next / Later / Done and mark their status when work starts, ships or is dropped.
3. User docs: `README.md`, `docs/usage.md` and the CLI help in `bin/lean.js` for any command or option change; `docs/09-system-architecture.md` for structural changes.
4. Claims: every savings or latency number in docs or CLI output must be measured (`lean audit`, `npm run benchmark`) and say what it measures. No estimated or hard-coded figures.

Release: `npm version patch|minor|major`, then `git push --follow-tags`. The `Release to npm` workflow publishes the version, tags it and creates the GitHub Release. Do not run `npm publish` by hand.
