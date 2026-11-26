---
title: "System Architecture"
description: "LeanToken modules, data flow, and implementation boundaries."
---

# LeanToken System Architecture Specification
**Author**: Backend Architect  
**Audience**: Engine Developers, System Integrators  
**Version**: 0.3.0 (Unreleased)

---

## 1. Architectural Blueprint

```
                      +---------------------------------------+
                      |           AI Coding Agent             |
                      |   (Claude Code / Cursor / OpenCode)   |
                      +---------------------------------------+
                                          |
                      +-------------------+-------------------+
                      |                                       |
           [1. Native Shell Interceptor]           [2. System Prompt Injection]
                      |                                       |
                      v                                       v
          +------------------------+             +--------------------------+
          |      lean-prune        |             |  Unified Cognitive Shaper|
          |  - Regex / Stream Rules|             |  - Ponytail Minimal Diff |
          |  - Fail-Open Safety    |             |  - Caveman Conciseness   |
          |  - Engine: ~2 ms avg   |             |  - Anti-Hallucination    |
          +------------------------+             +--------------------------+
             /                  \                             |
     [Pruned Output]      [Raw Stream]                        v
            |                    |                   +------------------+
            v                    v                   | Provider Context |
     Agent Sees This     .lean/logs/<t>-<cmd>.log    | (Frozen Prefixes)|
     (54-79% on noisy    (Local CCR Fallback)        +------------------+
      outputs, tests)
```

---

## 2. Core Subsystems

### Subsystem 1: Stream Command Pruner (`src/core/pruner.js`)
- **Latency Budget**: 5 ms average engine time (`npm run benchmark` fails above it). Through the Claude Code hook, each call also pays Node.js start-up (~130-200 ms measured) plus ~25 ms of module load and pruning. Claude Code starts the hook only for commands in `HOOK_PREFIXES` (`rules.js`), so `cat`/`grep`/`python script.py` cost nothing.
- **Claude Code hook** (`src/core/hooks.js`): a `PostToolUse` hook replaces the Bash/PowerShell output through `updatedToolOutput`. It accepts one command, optionally preceded by silent setup steps (`cd`, `export`, `$env:`, `mkdir`, venv `activate`). It prunes only the test, build, git-status, git-diff and listing routes, and only outputs of 400+ characters that save 20+ tokens. It backs off per command after 2 raw-log reads (`.lean/learned.json`). Statistics go to `<payload cwd>/.lean/stats.json`.
- **Read guard** (`claudePreToolUse` in `src/core/hooks.js`): a `PreToolUse` hook on `Read`. A whole-file Read (no `offset`/`limit`/`pages`) of a code or Markdown file of 20 KB–4 MB is denied once. The deny reason carries the file's outline from `SymbolIndexer.outlineForGuard` (line ranges, ≤600 tokens, fenced as file content). It is used only when the outline has line ranges and is at most 25% of the file. A second whole Read of the same file within 30 minutes is allowed, because Claude Code's Edit needs a full read. After 2 such retries the file is never guarded again in that project. State is one JSON file per project in LeanToken's config folder (`<config>/leantoken/read-guard/`), written atomically. If it cannot be written, the Read is allowed. Fail-open on every error.
- **Session start** (`claudeSessionStart`): a `SessionStart` hook. In projects with a real `.lean/` folder, when `.lean/MEMORY.md` is over an hour old and a newer transcript exists, it spawns `lean learn` detached (argument array, no shell). It prints nothing, so it adds no context.
- One hook command serves all three events; `bin/lean.js hook claude` dispatches on the payload's `hook_event_name`.
- **Engine Rules**:
  1. `git status`: Strips untracked noise, branch up-to-date verbosity, hints ("(use \"git add ...\")"). Keeps modified/staged lists with count summaries.
  2. `git diff`: Truncates large binary or lockfile diffs (`package-lock.json`, `pnpm-lock.yaml`, `cargo.lock`). Keeps diff stat summary.
  3. `test runners (pytest, npm test, vitest, cargo test)`: Strips passing test logs when tests fail; isolates the exact failure stack traces and failure assertions.
  4. `json dumps`: Pretty-prints and folds arrays larger than 5 items, truncating deep nesting while retaining top-level keys and array length indicators.
  5. `directory listings (ls, dir, tree)`: Folds node_modules, .git, dist, target, build into single count badges.

### Subsystem 2: Local CCR (Compress-Cache-Retrieve) Spooler
- Whenever output is pruned, the raw stream is saved to `.lean/logs/<time>-<command>.log`. The 20 newest logs are kept.
- The pruned output ends with a one-line notice:
  `[LeanToken: -Y% tokens | full output: .lean/logs/<time>-<command>.log]`
- If an agent needs the full output, it reads that file.

### Subsystem 3: Unified Cognitive Shaper (`src/core/rules.js`)
- Injects a single, harmonized prompt into `CLAUDE.md` or `.cursorrules`.
- Enforces:
  1. *Telegraphic Response Protocol*: Answers in concise, high-density statements without conversational preamble or pleasantries.
  2. *Surgical Code Modifications*: No speculative refactoring, no unsolicited dependencies, no mass-reformatting of unaffected lines.
  3. *Evidence-Based Grounding*: Quote exact lines from inspected files; never invent APIs.

### Subsystem 4: Out-of-Band Session Learner (`src/core/learner.js`)
- Ingestion: Claude Code session files, `~/.claude/projects/<slug>/*.jsonl`, where the slug is the project path with non-alphanumerics replaced by `-`, matched case-insensitively. Parsing lives in `src/core/transcripts.js`. A single `.jsonl` path can also be given.
- Frequency: automatic at Claude Code session start (background, at most hourly, see the session-start hook) or manual `lean learn`; never inside an agent turn.
- Outputs: `.lean/MEMORY.md` with files read 3+ times (each with its section map or signatures) and repeatedly failing commands. Directive v0.3 points agents at it.
- Safety: only code and Markdown files inside the project get maps. Commands and error lines are passed through `redact()` (tokens, passwords, URL credentials, known key formats) and quoted as code.

### Subsystem 5: Zero-MCP Symbol Indexer (`src/core/symbol_indexer.js`)
- Eliminates 4,000+ token MCP tool schema overhead.
- Uses lightweight, dependency-free signature extraction for JavaScript/TypeScript, Python, PHP, Java, C#, Go, Rust, Ruby, Kotlin, Swift, and C/C++; unrecognized files use a generic line summary.
- Emits signatures: `export function foo(a: string, b: number): Promise<void>`.
- Markdown: heading tree with line range and token size per section (`L40-128 ## Architecture (~2.8k tok)`), so agents read a range instead of the file.
- Code: every symbol gets `L<start>-<end>`, from one shared pass (`withLineRanges`) that runs each language's extractor per line. A range ends before the next symbol at the same or shallower source indentation. Top-level symbols also show their size.
- `outlineForGuard(file, maxTokens)`: a single read, then truncated by dropping the deepest level first, then the tail (`… N more`). Linear in the number of symbols, so a hook can call it on untrusted files.

### Writes to disk (security)
- `.lean/` writes (logs, stats, learned state, MEMORY.md) are refused when `.lean` or `.lean/logs` is a symlink or junction (`safeDir` in `telemetry.js`), so a cloned repository cannot redirect writes or log deletions. Claude settings files are written through a temp file and rename.

### Subsystem 6: Session Audit (`src/core/audit.js`)
- `lean audit` reads the same session files as the learner. It reports model token usage, shell output pruned and not pruned (by reason, using the hook's own `normalizeCommand` and routes), file reads, identical re-reads, large whole-file reads and the most-read files.
- Context: per-API-call context size (input + cache write + cache read), the share of cache reads from calls above 150k/200k/400k, an upper bound for capping the context, and tool output weighted by re-reads. A tool result is re-read by every later API call until the next compaction. `transcripts.readSession` records `contexts`, `cacheReads`, `epochStarts` and each call's `apiIndex`/`epoch`.
- It is the source of every savings figure in the README and roadmap.

---

## 3. Performance & Resource Budgets

Targets are design goals. Measured values (Nov 2026, `npm run benchmark` / `lean audit`): engine avg ~2.4 ms, hook call ~25 ms on top of Node.js start-up, and hook pruning 0.3% of shell output on a docs-heavy project. Output-token reduction has not been measured yet. Read guard per Read: ~100–126 ms end to end, of which ~96 ms is Node.js start-up.

| Metric | LeanToken Target | Illustrative Proxy Baseline | Delta |
| :--- | :---: | :---: | :---: |
| **In-flight Latency Overhead** | **$< 3$ ms** | 1,100 – 2,900 ms | **-99.8%** |
| **P90 Latency Overhead** | **$< 5$ ms** | 5,100 – 8,400 ms | **-99.9%** |
| **Memory Footprint** | **$< 25$ MB** | 450 – 850 MB (Electron + ONNX) | **-96%** |
| **Prefix Cache Integrity** | **100% (No Mutate)**| 96% | **+4%** |
| **Output Token Reduction** | **35% – 50%** | -3.4% (slight increase in review) | **+40% savings** |
| **Setup Friction** | Single command (`lean init`)| Multi-GB installer + proxy config | **Zero-toggle** |
