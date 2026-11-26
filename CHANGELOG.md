# Changelog

All notable changes to LeanToken are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `--only` accepts `vscode` as a name for GitHub Copilot. The CLI help lists the accepted aliases.

### Fixed
- `lean <command> --help` (for example `lean init --help`) ran the command instead of printing help. `lean prune` still passes `--help` to the command it runs.
- `lean audit` told you to run `lean init` to get the v0.3 directive even when it was already installed. It now says the directive is in place and to re-audit after new sessions.

## [0.3.0] - 2026-11-26

### Added
- `lean audit [--sessions=N] [--json]`: measures a project's real Claude Code sessions (read from `~/.claude/projects/<project>/`). It reports model tokens, shell output pruned and skipped (with the reason for each), file reads, identical re-reads, large whole-file reads and the most-read files. On the first project audited (8 sessions), pruning saved 0.3% of shell output, while whole-file reads of large docs cost ~39k tokens. That finding drives the rest of this release.
- `lean symbols` / `lean outline` on Markdown: a heading tree with each section's line range and size (e.g. `L40-128 ## 4. Architecture (~2.8k tok)`), so agents read one section instead of the file. On a 50 KB spec: 738 tokens instead of 13.6k.
- Directive v0.3.0, section "Reads": outline files over ~300 lines first and read only the needed range, use `.lean/MEMORY.md` maps, don't re-read unchanged files, and keep search output small. The directive stays under its 350-token budget.
- `.github/workflows/release.yml`: every `package.json` version on `main` that is not on npm yet is published (with provenance), tagged `vX.Y.Z` and given a GitHub Release with its changelog entry. Supports npm trusted publishing or an `NPM_TOKEN` secret.
- CI fails pull requests that change `src/` or `bin/` without a `CHANGELOG.md` entry.
- `lean doctor` warns when the hook is installed both user-wide and in the project, and when its command filters are from an older version.

### Changed
- `lean learn` now reads Claude Code's real session files. It records in `.lean/MEMORY.md` the 10 files read most (3+ times), with a section map or signatures for files of 150+ lines, and the commands that failed 2+ times with their first error line. On the first audited project this is 5.5 KB, mapping a spec that costs 13.6k tokens to read whole. Before, it looked for `.claude/history.jsonl` in the project, which Claude Code never writes, so it found nothing.
- The hook now also prunes commands preceded by steps that print nothing: `cd`, `pushd`, `export X=..`, `$env:X = ..`, `mkdir`, `source .venv/bin/activate` (e.g. `cd api && npm test`). Steps that use `$(...)` or backticks still disable pruning.
- Hook command filters target only commands the pruner can shrink: `git status` and `git diff` instead of all of `git`, `python -m` instead of `python`, `go test`/`go build` and `docker build`/`docker compose`. Test runners were added: vitest, jest, phpunit, rspec, deno and mix. Other commands no longer start Node.js. Run `lean init --global` (or `lean init`) to update an installed hook.
- `lean init` in a project no longer installs a second hook when a user-wide one exists (both copies would run on every call), and removes a project copy it finds. The project directive still says pruning is automatic.
- The CLI loads only the modules a command needs. Measured with `npm run benchmark`: a hook call adds ~25 ms on top of Node.js start-up.
- `lean stats` shows only measured numbers, with a per-output-type breakdown, and points to `lean audit` for the whole-session view.
- `npm run benchmark` reports the engine time against its 5 ms budget, plus the end-to-end hook time and Node.js start-up separately. It no longer prints "Sub-3ms … confirmed" regardless of the result.

### Fixed
- Hook statistics were written to the hook process's working directory instead of the project in the hook payload, so they could land in the wrong project's `.lean/stats.json`. Writes are now atomic (temp file + rename).
- `lean stats` showed two numbers that were never measured: "Prompt Cache Breaks: 0" and "Output Shaper Reduction: ~40%".
- `.lean/stats.json` kept the version that created it; it now records the current version.
- `lean symbols <directory>` reported a fixed "85%" saving; it is now computed.

## [0.2.1] - 2026-11-26

### Fixed
- `lean remove` and `lean uninstall` left the `.gitignore` lines that `init` added, and an empty `.claude/` folder. `init` now writes its `.gitignore` lines under a `# LeanToken` marker, and `remove` deletes exactly those lines (and `.gitignore` itself if LeanToken created it). Lines written by 0.2.0 have no marker, so remove them by hand once.

## [0.2.0] - 2026-11-26

### Added
- `lean init` now auto-detects the AI tools a project and machine use, and configures only those. Supported: Claude Code, AGENTS.md readers (Codex, OpenCode, Copilot agent, Cursor, Zed, Antigravity, Gemini in Android Studio), Gemini CLI / Code Assist, GitHub Copilot (VS Code, Visual Studio, JetBrains IDEs including Android Studio), Cursor, Windsurf, Cline and JetBrains Junie. `--only=<hosts>` and `--all` override detection.
- Claude Code auto-prune hook. It uses `PostToolUse` to prune noisy shell output (test runs, builds and installs, `git status`, `git diff`, directory listings) before the agent reads it. It does not change commands or permissions, and it runs only for commands that can produce noise.
- Adaptive pruning: if an agent opens the raw log for the same kind of command twice, LeanToken stops pruning that command in that project.
- Build and install output pruning: progress, download and deprecation chatter is folded, repeated lines are collapsed with a count, and errors are always kept.
- `lean doctor`: checks Node.js, PATH, detected tools, directive versions, hook paths and log usage.
- `lean remove [--only=<hosts>] [--purge]`: undoes `init` in one project and restores files to their previous content.
- `lean uninstall [--purge]`: undoes `init` in every project it was set up in, then prints the command that removes the CLI itself.
- `--dry-run`, `--no-hooks` and `--global` options for `init`.
- `--global` also writes GitHub Copilot's user-level instructions (`~/.copilot/copilot-instructions.md`). `--only` accepts `opencode`, `codex` and `antigravity`, so `lean init --global --only=opencode` writes only OpenCode's file.
- `CHANGELOG.md` and release scripts. `npm version` stamps the changelog and tags the release, and `npm publish` is refused if the version has no changelog entry.

### Changed
- `init` upgrades existing directives in place, between `<!-- leantoken:start -->` / `<!-- leantoken:end -->` markers. Text around the block is kept, and repeat runs change nothing.
- Running `init` again deletes files that LeanToken created earlier for tools the project no longer uses. It never deletes files that contain anything else.
- `init` no longer creates `.lean/` up front. Raw logs are created only when output was actually pruned.
- Raw output is saved per run (`.lean/logs/<time>-<command>.log`) and capped at the 20 newest files, instead of one `last-command.log` overwritten on every run. The pruned output's footer names its log.
- Terminal output is normalized the same way on every OS: CRLF, ANSI colours and progress-bar redraws.
- The Claude Code hook calls Node.js by absolute path, so editors launched from the macOS Dock or the Windows Start menu work without a shell PATH.
- The directive now says what LeanToken actually does in each tool. It no longer claims pruning is automatic where no hook is installed.
- The npm package contains only the CLI, the source, the usage guide, the README, the licence and the changelog.

### Fixed
- Commands that merely mentioned "test" (such as `cat test/app.js` or `grep pytest src`) were treated as test runs, and their output was replaced with "ALL TESTS PASSED".
- Directory listings hid any entry whose name contained `build`, `dist` or `.git` (for example `.github` or `build-guide.md`).
- Mocha-style "N failing" results were not recognized as failures.
- `lean symbols <dir>` reported the number of files instead of the number of signatures.
- `lean prune` exited with code 0 when the command was killed by a signal.
- The Bash/Zsh shell hook did not work in zsh or in paths with spaces. The PowerShell hook did not work with PowerShell on macOS and Linux.

## [0.1.0] - 2026-11-25

### Added
- `lean prune`: deterministic pruning of command output (git status/diff/log, test runs, listings, JSON), with the raw output saved locally.
- `lean init`: writes the LeanToken agent directive to `CLAUDE.md`, `.cursorrules` and `AGENTS.md`.
- `lean symbols`: lightweight symbol outlines for 11 languages.
- `lean learn`: mines session transcripts for frequently read files and failing commands.
- `lean stats` and `lean statusline`: local token-savings telemetry.
- Opt-in Bash and PowerShell shell hooks.

[Unreleased]: https://github.com/arifahmedjoy/leantoken/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/arifahmedjoy/leantoken/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/arifahmedjoy/leantoken/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/arifahmedjoy/leantoken/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/arifahmedjoy/leantoken/releases/tag/v0.1.0
