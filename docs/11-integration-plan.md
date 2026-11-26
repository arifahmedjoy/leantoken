---
title: "Integration Plan"
description: "How LeanToken integrates with Claude Code, Codex, Gemini, Cursor, and other tools."
---

# LeanToken Integration Plan (v0.2)

**Status date:** 2026-11-26
**Applies to:** `lean init` in v0.2.0 and later

## 1. Why this plan changed

v0.1 assumed that writing a directive into `CLAUDE.md` was enough. A replay of 4 real Claude Code sessions (`test-results/aricon-real-performance-2026-11-26.md`) showed otherwise:

- Claude ran `lean` in 2 of 104 shell commands, and both were during setup.
- The directive said LeanToken "automatically prunes", which was false without a hook.
- Pruning that keys off the command name damaged output. For example, `cat test/x.js` was routed as a test run.

v0.2 rests on three rules:

1. **Instructions are not integration.** A directive only helps if the agent can run `lean`. Pruning is automatic only where a host hook exists.
2. **Never prune content the agent asked for.** Automatic pruning covers only output that is mostly noise: test runs, builds and installs, `git status`, `git diff` and directory listings, run as one simple command. File reads, `grep`, JSON and `git log` pass through untouched.
3. **Fail open.** Any hook error returns the original output. A hook never blocks a tool call and never changes permissions.

## 2. Two integration layers

| Layer | What it does | Mechanism | Hosts |
|---|---|---|---|
| **A. Directive** | Tells the agent to keep diffs minimal, answer concisely, ground claims in evidence, and run noisy commands through `lean prune` | Instruction file written by `lean init` | Every host in §3 |
| **B. Auto-prune hook** | Prunes noisy shell output before the agent reads it, with no agent cooperation needed | Host hook calls `lean hook <host>` | Claude Code now; others in §5 |

Where layer B is installed, that host's directive says pruning is automatic and the agent should not wrap commands itself. Everywhere else it says to run `lean prune <command>`. Layer A also needs `lean` on PATH; `init` warns when it is not.

## 3. Coverage: AI hosts

`lean init` writes only the hosts it detects: repo files with non-LeanToken content, or the tool's folder in your home directory. `AGENTS.md` is the fallback when nothing is detected. `--only=<keys>` picks hosts explicitly; `--all` writes every row.

| Key | File written | AI hosts that read it | Status |
|---|---|---|---|
| `claude` | `CLAUDE.md` + hook in `.claude/settings.local.json` | Claude Code (CLI, VS Code, JetBrains) | **Live-verified**: hook applied in a headless session (−59% on `git status`) |
| `agents` | `AGENTS.md` | OpenAI Codex, OpenCode, GitHub Copilot agent (VS Code), Cursor, Zed, Antigravity, Gemini in Android Studio | File written; not live-tested per host |
| `gemini` | `GEMINI.md` | Gemini CLI, Gemini Code Assist, Antigravity | File written; not live-tested |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot in VS Code, Visual Studio, JetBrains IDEs (incl. Android Studio), Xcode, github.com | File written; not live-tested |
| `cursor` | `.cursorrules` | Cursor (legacy format, still read) | File written; not live-tested |
| `windsurf` | `.windsurf/rules/leantoken.md` (`trigger: always_on`) | Windsurf | File written; not live-tested |
| `cline` | `.clinerules/leantoken.md` | Cline (VS Code) | File written; not live-tested |
| `junie` | `.junie/guidelines.md` | JetBrains Junie | File written; not live-tested |

`--global` writes user-level files instead: `~/.claude/CLAUDE.md` plus the hook in `~/.claude/settings.json`. It also writes `~/.gemini/GEMINI.md`, `~/.codex/AGENTS.md` and `~/.config/opencode/AGENTS.md`, but only for tools whose config folder already exists.

## 4. Coverage: editors

An editor is covered through the AI host running inside it, not by itself.

| Editor | AI hosts commonly used | LeanToken files that apply |
|---|---|---|
| VS Code | Copilot, Claude Code, Cline, Gemini Code Assist, Codex | copilot-instructions, `CLAUDE.md` + hook, `.clinerules`, `GEMINI.md`, `AGENTS.md` |
| Cursor | Cursor agent, Claude Code | `.cursorrules`, `AGENTS.md`, `CLAUDE.md` + hook |
| Windsurf | Cascade | `.windsurf/rules` |
| Android Studio / IntelliJ | Gemini in Android Studio, Copilot, Junie, Claude Code | `AGENTS.md`, copilot-instructions, `.junie/guidelines.md`, `CLAUDE.md` + hook |
| Visual Studio | Copilot | copilot-instructions |
| Zed | Zed agent, Claude Code | `AGENTS.md`, `CLAUDE.md` + hook |
| Antigravity | Antigravity agent | `GEMINI.md`, `AGENTS.md` |
| Terminal | Claude Code, Codex, OpenCode, Gemini CLI | the host's file; `lean prune` |

## 5. Roadmap

### Phase 1 — shipped in v0.2.0 (done)
- Multi-host `init` with in-place upgrades: the directive sits between `leantoken:start`/`end` markers, legacy v0.1.0 blocks are migrated, and repeat runs change nothing.
- Truthful directive: one variant for hosts with the hook, one for hosts without.
- Claude Code `PostToolUse` hook using `updatedToolOutput`. The tool runs unchanged, so permissions are untouched; only the output Claude sees is pruned.
- Routing fixes: test detection needs an actual test-runner command; listing folds match whole path segments only; failure detection is broader.
- `.gitignore` gets `.lean/` and `.claude/settings.local.json`.
- Host detection: only tools the project or machine uses get files. Re-running `init` deletes LeanToken-only files for tools no longer detected.
- No up-front `.lean/`. Raw logs are written only when output was pruned, one per run, capped at 20.
- Adaptive back-off: two raw-log reads of the same command stop pruning it in that project.
- Build/install route; terminal output (CRLF, ANSI, progress redraws) normalized the same on every OS.
- Lifecycle: `lean doctor`, `lean remove`, `lean uninstall`; hook calls Node by absolute path, and is skipped when run from npx.
- Versioning: `CHANGELOG.md` (Keep a Changelog), `npm version` stamps it, `prepublishOnly` and CI refuse a version without an entry.
- CI on Ubuntu, Windows and macOS, Node 18/20/22.

### Phase 2 — more hosts get automatic pruning
For each host, confirm the hook API against current docs before building. Each needs its own `lean hook <host>` adapter and a live session test.

| Host | Candidate mechanism | Unknown to verify first |
|---|---|---|
| OpenCode | Plugin with a tool execute-after handler | Can the handler replace tool output? |
| Gemini CLI | Hooks | Event names; output-replacement support |
| Copilot (VS Code agent) | Agent hooks (preview) | Is the format compatible with Claude's; can it replace output? |
| Cursor | `.cursor/hooks.json` | Is there an after-shell event that can rewrite output? |
| Codex / Windsurf / Cline / Junie | — | No known output hook; stay on layer A |

### Phase 3 — bigger savings (based on the aricon data)
1. **MCP tool output.** The largest single output in aricon was about 10.8k tokens from one MCP tool. Claude's `updatedToolOutput` also works for MCP tools, so add a size-capped JSON summarizer with the raw output spooled.
2. ~~**One spool file per run.**~~ Done: raw output is saved to `.lean/logs/<time>-<command>.log`, capped at 20 files.
3. **Fewer duplicate directives.** Some hosts read two files (for example, Copilot in VS Code reads both `AGENTS.md` and copilot-instructions), which costs about 300 tokens twice per session. Make secondary files short pointers where the host supports imports.
4. **Cursor rule format.** Move from `.cursorrules` to `.cursor/rules/leantoken.mdc` (`alwaysApply: true`) and migrate existing blocks.

### Phase 4 — certification per host
Each host moves from "file written" to "live-verified" only with evidence of a real session in that host showing the directive loaded and, where a hook exists, a pruned tool result. Every claim needs that evidence, the same way the Claude Code result in §3 was earned.

## 6. Known limitations
- The hook command is an absolute path to `bin/lean.js`. Re-run `lean init` after moving or reinstalling LeanToken.
- The output shape of Claude Code's PowerShell tool is assumed to match Bash (`stdout` string). The hook skips any output without one, so this fails safe.
- Realistic savings depend on workload. Projects that mostly read documents (like aricon) save little. Projects that run tests and builds often save the most.
