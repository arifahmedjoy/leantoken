# Changelog

All notable changes to LeanToken are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/arifahmedjoy/leantoken/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/arifahmedjoy/leantoken/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/arifahmedjoy/leantoken/releases/tag/v0.1.0
