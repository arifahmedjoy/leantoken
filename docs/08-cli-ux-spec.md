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
Real output (aricon, 8 sessions). Out-of-band analyzer of the project's Claude Code sessions. Writes `.lean/MEMORY.md` (hot files with section maps, failing commands).
```bash
$ lean learn
⚡ LeanToken Learn: scanned 8 session(s)
  ✓ Hot files recorded: 10
  ✓ Failed commands recorded: 0
  ✓ Saved to: .lean/MEMORY.md
```

### 2.4b `lean audit`
Measures real sessions: model tokens, shell output pruned and skipped (with reasons), file reads, re-reads, large whole-file reads, most-read files. Options: `--sessions=N`, `--json`.
```bash
$ lean audit
  Shell output
    total:   ~100,117 tokens
    pruned:  3 outputs, ~311 tokens saved (0.3% of shell output)
    not pruned:
        83 × ~ 92,184 tok  compound command (pipes, ;, &&)
  File reads (the largest lever: content is never pruned, only read less)
    whole-file reads over 8k chars: 7 (~39,176 tokens): use `lean symbols <file>`, then read one range
```

### 2.5 `lean stats`
Displays this project's measured pruning counters (no estimated figures). Real output from the first audited project; counters recorded from 0.3 on also show a per-output-type breakdown.
```bash
$ lean stats
════════════════════════════════════════════════════════════
  LeanToken pruning stats (this project, measured)
════════════════════════════════════════════════════════════
  Outputs pruned:          1
  Tokens before pruning:   121
  Tokens sent to agent:    52
  Tokens saved:            69 (-57%)
  Pruning time (avg):      10.73 ms (excludes Node.js start-up per hook call)
════════════════════════════════════════════════════════════
  Whole-session picture (reads, skipped outputs, tokens): lean audit
```

---

## 3. Fallback & Safety UX Contracts
- **Fail-Open Policy**: If `lean prune` encounters an unexpected error or parsing failure, it **must immediately emit the original raw output without blocking or crashing**, followed by a single silent debug warning to stderr.
- **Exit Code Fidelity**: `lean prune <cmd>` must exit with the exact same exit code as the wrapped command. If the child process exited with code `1`, `lean prune` exits with code `1`.
