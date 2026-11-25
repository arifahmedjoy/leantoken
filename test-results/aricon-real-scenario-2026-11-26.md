# Aricon Real-Scenario Integration Report

**Date:** 2026-11-26  
**Target repository:** `D:\Avalon\aricon`  
**LeanToken source:** `D:\lean-token`  
**Runtime:** Windows, Node.js v24.21.0, Git 2.56.1.windows.1

## Executive Result

**LeanToken was initialized and live-tested in `aricon`.**

- Repository-local directives were added for Claude, generic agents, and Cursor.
- Copilot received repository instructions in `.github/copilot-instructions.md`.
- Gemini-style repository instructions were added in `GEMINI.md`.
- Antigravity and Gemini are supported only through repository/discovery conventions available to those tools; LeanToken was not live-started inside their desktop sessions.
- Claude's Headroom proxy route and Headroom hooks were removed.
- Headroom registry autostart was removed.
- Running Headroom desktop and runtime processes were stopped and verified absent.

## Per-AI Reality

| AI surface | Integration added or verified | Live-tested? | Reality |
|---|---|---|---|
| Claude Code | `CLAUDE.md`, LeanToken statusline, Headroom hooks removed | Config and CLI verified | Claude can read repository guidance and LeanToken statusline. Headroom routing is disabled. |
| GitHub Copilot | `.github/copilot-instructions.md` | Instructions configured | Repository instructions are recognized in VS Code/GitHub when Copilot loads repo instructions; exact session behavior depends on the Copilot host. |
| Gemini | `GEMINI.md` | Instructions configured | Compatible only if the Gemini/CLI host honors `GEMINI.md`; no live Gemini desktop session was started. |
| Antigravity | `AGENTS.md` and project instructions | Instructions configured | Generic discovery may be supported if the product reads `AGENTS.md`; no live Antigravity session was started. |
| Cursor/.cursorrules | `.cursorrules` | Instructions configured | Repository file is present; host behavior was not live-tested. |

**Bottom line:** LeanToken is not an HTTP proxy or universal runtime plugin. It works in all AI tools that can execute shell commands or read repository instruction files. Tools that cannot execute `lean` or cannot discover the repository instructions receive no automatic integration.

## Headroom Conflict Resolution

The Claude settings originally contained:

- `ANTHROPIC_BASE_URL=http://127.0.0.1:6767`
- Headroom `PreToolUse` Read and Bash hooks
- Headroom `SessionStart` guard
- Headroom status-route processes

The following actions were taken:

1. Backed up Claude settings to `settings.json.leantoken-disabled-20261126-035059`.
2. Removed `ANTHROPIC_BASE_URL` from Claude settings.
3. Removed Claude's `hooks` configuration.
4. Stopped the first discovered Headroom processes.
5. Removed the `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Headroom` autostart value.
6. Stopped restarted Headroom desktop/runtime PIDs.
7. Confirmed no Headroom process remained.
8. Removed Headroom-generated learned patterns from `CLAUDE.local.md`.

The Claude statusline remains LeanToken:

```text
node "D:/lean-token/bin/lean.js" statusline
```

No Headroom process or Claude route should return unless Headroom is reinstalled or manually re-enabled.

## `aricon` Setup

Initialization was run with the current repository working directory.

LeanToken:

- Added the shared directive to `CLAUDE.md`.
- Created `AGENTS.md`.
- Created `.cursorrules`.
- Initialized `.lean/logs/` and `.lean/MEMORY.md`.
- Appended `.lean/` to `.gitignore`.
- Added `.github/copilot-instructions.md`.
- Added `GEMINI.md`.

Existing target-repository edits were preserved. LeanToken did not alter or revert:

- `README.md`
- `brand/README.md`
- `docs/00-start-here.md`
- `docs/01-project/aricon-fashion.md`
- `docs/02-website/spec.md`
- Existing `CLAUDE.md` project content

## Live Real-Repository Measurements

### Git status pruning

Command:

```text
lean prune git status
```

Result:

- Exit status: 0
- 9 output lines were returned in compact form.
- 53% estimated token reduction on the first live run.
- 50% estimated token reduction on the sequential verification run.
- 1.03-1.24 ms pruning overhead.
- Full raw output was written to `D:\Avalon\aricon\.lean\logs\last-command.log`.

The compact output retained:

- Branch state
- Upstream state
- Modified files
- Untracked files

### Symbol extraction

Commands:

```text
lean symbols CLAUDE.md
lean symbols docs
```

Results:

- `CLAUDE.md`: 10 signatures, 179 estimated tokens, 90% savings.
- `docs` directory: one Markdown file entry summarized, 189 estimated tokens, 85% savings.

The directory result is limited to files in that directory and no nested directories.

### Telemetry

Sequential live verification recorded:

- 2 prunes
- 359 raw estimated tokens
- 174 pruned estimated tokens
- 185 estimated tokens saved
- 52% estimated savings
- 1.13 ms average pruning overhead

The raw `.lean/stats.json` showed one earlier recorded prune, 169 raw estimated tokens, 79 pruned tokens, and 90 saved tokens. Cross-run numbers vary because each repository maintains independent local telemetry.

### Learner

`lean learn` ran successfully and created/found `.lean/MEMORY.md`. Before a second pruned command completed, it initially reported no spooled logs; afterward, `.lean/logs/last-command.log` contained real Git output.

The learner's JSONL transcript analysis is separate from log presence. It does not synthesize command footguns from arbitrary raw logs.

## Repository State

The live `git status` showed existing target-repository modifications plus new LeanToken/Copilot/Gemini integration files.

New or setup-created paths:

- `.cursorrules`
- `.github/copilot-instructions.md`
- `AGENTS.md`
- `GEMINI.md`
- `.lean/` runtime files (ignored by `.gitignore`)

The target repository was not committed or pushed. Existing dirty changes were not modified by LeanToken initialization.

## Limitations

1. **No universal auto-integration:** LeanToken cannot guarantee automatic pruning for every AI tool.
2. **Claude live proof:** Claude global settings and hooks are locally verified.
3. **Copilot live proof:** Repository instruction file was created, but a new Copilot session was not started for live interaction verification.
4. **Gemini live proof:** `GEMINI.md` was created; no Gemini CLI/API session was live-tested.
5. **Antigravity live proof:** `AGENTS.md` was created; no Antigravity session was live-tested.
6. **Shell hooks:** Hooks remain opt-in shell wrappers. Direct `lean prune` works everywhere with Node and LeanToken available.
7. **PowerShell command aliases:** Some IDE tool calls may bypass shell hooks; direct CLI invocation remains reliable.
8. **Headroom disable:** Registry and Claude route are disabled, but reinstalling Headroom or restoring backup settings may re-enable it.

## Final Assessment

**Target scenario verdict: PASS**

- Real repository setup: passed
- Real Git pruning: passed
- Real symbol extraction: passed
- Telemetry: passed
- Claude/Headroom conflict: resolved
- Headroom autostart: removed
- No Claude proxy/base URL route remains
- Copilot, Gemini, and Antigravity instruction surfaces: configured, not yet live-session-certified
