# Copilot instructions for LeanToken

## Commands

- Run the complete test suite with `npm test` (`node test/runner.js`).
- Run a component's test group directly, for example:
  `node -e "require('./test/pruner.test').run()"`.
  The test files export `run()` for the whole component group; individual cases are not separately exposed.
- Run the latency benchmark with `npm run benchmark` (`node test/benchmark.js`).
- CI runs the test suite and benchmark on Node.js 18, 20, and 22 across Linux, macOS, and Windows.
- There is no build or lint script configured in `package.json`.

## Architecture

- `bin/lean.js` is the `lean` CLI entry point; `src/index.js` exports the core classes for consumers.
- The CLI composes independent classes under `src/core/`: `CommandPruner` condenses command output and spools the original to `.lean/logs/last-command.log`; `CognitiveShaper` installs the shared agent directive; `SymbolIndexer` extracts lightweight source outlines; `SessionLearner` mines transcript patterns into `.lean/MEMORY.md`; and `Telemetry` records local pruning statistics in `.lean/stats.json`.
- `lean prune` runs the requested command, passes its output through `CommandPruner`, and records telemetry. The shell integrations in `src/shell/` are optional wrappers around that CLI.
- Runtime files live under `.lean/`; `.gitignore` excludes command logs and stats, while the learner's memory file can be maintained as project context.
- The implementation and supported CLI behavior are defined by the source, not aspirational examples in design documents. Check `bin/lean.js` and the relevant core class before changing command behavior.

## Repository conventions

- This is a dependency-free CommonJS project targeting Node.js 18 or later. Export core classes as named properties with `module.exports`, matching `src/index.js`.
- The tests use Node's built-in `assert`; each `test/*.test.js` module exports a `run()` function, and `test/runner.js` invokes the component groups in sequence.
- Core components use synchronous Node filesystem and process APIs. Several constructors accept path options so tests can isolate local files; preserve that pattern when adding file-backed behavior.
- Keep pruning deterministic and fail-open: unexpected parsing trouble should preserve the original command output. The pruner best-effort spools full command output to `.lean/logs/last-command.log`.
- `AGENTS.md`, `CLAUDE.md`, and `.cursorrules` contain the same LeanToken directive. `lean init` adds that directive to project agent files; avoid maintaining conflicting variants.
- Refer to `docs/09-system-architecture.md` for the intended subsystem boundaries, and verify any documented feature against the implementation before relying on it.

## Project rules (LeanToken repository)

Every change that alters behavior, output, options or plans must update, in the same change:

1. `CHANGELOG.md`: an entry under `## [Unreleased]` (Added / Changed / Fixed / Removed). CI fails pull requests that change `src/` or `bin/` without it.
2. `ROADMAP.md`: move items between Now / Next / Later / Done and mark their status when work starts, ships or is dropped.
3. User docs: `README.md`, `docs/usage.md` and the CLI help in `bin/lean.js` for any command or option change; `docs/09-system-architecture.md` for structural changes.
4. Claims: every savings or latency number in docs or CLI output must be measured (`lean audit`, `npm run benchmark`) and say what it measures. No estimated or hard-coded figures.

Release: `npm version patch|minor|major`, then `git push --follow-tags`. The `Release to npm` workflow publishes the version, tags it and creates the GitHub Release. Do not run `npm publish` by hand.

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
