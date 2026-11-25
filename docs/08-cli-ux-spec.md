# LeanToken CLI Ergonomics & UX Specification
**Author**: UX Architect  
**Audience**: CLI Developers, End-Users, AI Coding Agents  
**Target**: `lean` CLI v0.1.0

---

## 1. Ergonomic Principles

1. **Sub-10ms Human & Machine Perception**:
   - For an agent or developer running `lean`, command overhead must be imperceptible.
   - Any CLI execution taking $> 15$ ms violates UX budget.

2. **Zero-Configuration Golden Path**:
   - Running `lean init` automatically detects the environment (Claude Code, Cursor, Windsurf, OpenCode) and applies the curated settings without prompt quizzes or marketplace decision fatigue.

3. **Telegraphic, High-Signal Terminal Output**:
   - Don't pollute developer terminals with giant ASCII banners or verbose status messages.
   - Use subtle ANSI indicators (`✓`, `⚡`, `ℹ`, `⚠`), concise delta numbers, and instant output.

---

## 2. Command Surface & Design

### 2.1 `lean init`
Sets up LeanToken in current directory or globally.
```bash
$ lean init
⚡ LeanToken v0.1.0 initialized
  ✓ Detected: Claude Code + Git repository
  ✓ Injected: CLAUDE.md (Unified Cognitive Shaper, 312 tokens)
  ✓ Spooled: .lean/logs/ & .lean/MEMORY.md
  ✓ Shell: Added alias hooks to your active shell profile
```

Flags:
- `--global`, `-g`: Apply to global `~/.claude/CLAUDE.md` and user shell profile.
- `--dry-run`: Output generated rules without writing to disk.
- `--force`, `-f`: Overwrite existing configuration safely after backup.

### 2.2 `lean prune <command...>`
Runs a command, intercepts stdout/stderr, and returns the pruned, agent-optimized payload while saving the full raw stream to local CCR.
```bash
$ lean prune git status
On branch main
Changes not staged for commit:
  modified:   src/core/pruner.js (5 lines)
  modified:   test/pruner.test.js (2 lines)
[LeanToken: pruned 84 verbose lines (-82% tokens) | Raw: .lean/logs/last-command.log]
```

### 2.3 `lean symbols <path>`
Zero-MCP symbol extractor. Emits minimal file signature outline for rapid context consumption.
```bash
$ lean symbols src/core/pruner.js
FILE: src/core/pruner.js (Language: JavaScript)
  class CommandPruner
    method prune(command, rawOutput): { pruned: string, rawTokens: number, prunedTokens: number, savedPct: number }
    method pruneGitStatus(output): string
    method pruneTestOutput(output): string
    method pruneJson(output, maxDepth=2): string
[Tokens: 68 | Full File: 840 tokens | -91.9% saved]
```

### 2.4 `lean learn`
Out-of-band session transcript analyzer. Runs after coding sessions to update `MEMORY.md`.
```bash
$ lean learn
⚡ Analyzing last session transcripts...
  ✓ Analyzed: 42 agent turns
  ✓ Pattern detected: "src/config/schema.json" read 6x -> Added to hot-context cache
  ✓ Quirk captured: "pwsh heredocs failed on quotes" -> Appended to .lean/MEMORY.md
  ✓ Zero tokens burned during coding session
```

### 2.5 `lean stats`
Displays token savings and latency telemetry.
```bash
$ lean stats
══════════════════════════════════════════════════════
  LeanToken Telemetry (Lifetime)
══════════════════════════════════════════════════════
  Command Prunes:       418 executions
  Raw Input Tokens:     842,120
  Pruned Input Tokens:  168,424 (Saved: 673,696 | -80.0%)
  Output Shaper Bonus:  ~42% fewer agent output tokens
  Average Latency:      1.82 ms (illustrative proxy benchmark: 1,840 ms)
  Prompt Cache Breaks:  0 (100% prefix preservation)
══════════════════════════════════════════════════════
```

---

## 3. Fallback & Safety UX Contracts
- **Fail-Open Policy**: If `lean prune` encounters an unexpected error or parsing failure, it **must immediately emit the original raw output without blocking or crashing**, followed by a single silent debug warning to stderr.
- **Exit Code Fidelity**: `lean prune <cmd>` must exit with the exact same exit code as the wrapped command. If the child process exited with code `1`, `lean prune` exits with code `1`.
