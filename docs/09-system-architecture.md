# LeanToken System Architecture Specification
**Author**: Backend Architect  
**Audience**: Engine Developers, System Integrators  
**Version**: 0.1.0

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
          |  - Latency: < 3 ms     |             |  - Anti-Hallucination    |
          +------------------------+             +--------------------------+
             /                  \                             |
     [Pruned Output]      [Raw Stream]                        v
            |                    |                   +------------------+
            v                    v                   | Provider Context |
     Agent Sees This     .lean/logs/last.log         | (Frozen Prefixes)|
     (Saves 60-90%)      (Local CCR Fallback)        +------------------+
```

---

## 2. Core Subsystems

### Subsystem 1: Stream Command Pruner (`src/core/pruner.js`)
- **Latency Budget**: $< 3$ ms total processing time.
- **Engine Rules**:
  1. `git status`: Strips untracked noise, branch up-to-date verbosity, hints ("(use \"git add ...\")"). Keeps modified/staged lists with count summaries.
  2. `git diff`: Truncates large binary or lockfile diffs (`package-lock.json`, `pnpm-lock.yaml`, `cargo.lock`). Keeps diff stat summary.
  3. `test runners (pytest, npm test, vitest, cargo test)`: Strips passing test logs when tests fail; isolates the exact failure stack traces and failure assertions.
  4. `json dumps`: Pretty-prints and folds arrays larger than 5 items, truncating deep nesting while retaining top-level keys and array length indicators.
  5. `directory listings (ls, dir, tree)`: Folds node_modules, .git, dist, target, build into single count badges.

### Subsystem 2: Local CCR (Compress-Cache-Retrieve) Spooler
- Whenever a command is pruned, the complete raw uncompressed stream is saved atomically to:
  `.lean/logs/last-command.log` (and indexed by timestamp in `.lean/logs/history.jsonl`).
- The pruned output ends with a one-line notice:
  `[LeanToken: pruned X lines (-Y%) | Full log: .lean/logs/last-command.log]`
- If an agent needs full stack details, it can simply execute `cat .lean/logs/last-command.log`.

### Subsystem 3: Unified Cognitive Shaper (`src/core/rules.js`)
- Injects a single, harmonized prompt into `CLAUDE.md` or `.cursorrules`.
- Enforces:
  1. *Telegraphic Response Protocol*: Answers in concise, high-density statements without conversational preamble or pleasantries.
  2. *Surgical Code Modifications*: No speculative refactoring, no unsolicited dependencies, no mass-reformatting of unaffected lines.
  3. *Evidence-Based Grounding*: Quote exact lines from inspected files; never invent APIs.

### Subsystem 4: Out-of-Band Session Learner (`src/core/learner.js`)
- Ingestion target: Agent transcript histories (`transcript.jsonl`, Claude Code session histories).
- Frequency: Post-session trigger (via shell exit hook or manual `lean learn`).
- Latency Impact: **0.00 ms in-flight**. Runs entirely asynchronously outside the agent turn loop.
- Outputs: Updates `.lean/MEMORY.md` with:
  - Repetitive file re-reads (candidates for pre-warming or symlinks).
  - Terminal command traps (e.g., commands that errored out and how they were fixed).

### Subsystem 5: Zero-MCP Symbol Indexer (`src/core/symbol_indexer.js`)
- Eliminates 4,000+ token MCP tool schema overhead.
- Uses lightweight, dependency-free signature extraction for JavaScript/TypeScript, Python, PHP, Java, C#, Go, Rust, Ruby, Kotlin, Swift, and C/C++; unrecognized files use a generic line summary.
- Emits signatures: `export function foo(a: string, b: number): Promise<void>`.

---

## 3. Performance & Resource Budgets

| Metric | LeanToken Target | Illustrative Proxy Baseline | Delta |
| :--- | :---: | :---: | :---: |
| **In-flight Latency Overhead** | **$< 3$ ms** | 1,100 – 2,900 ms | **-99.8%** |
| **P90 Latency Overhead** | **$< 5$ ms** | 5,100 – 8,400 ms | **-99.9%** |
| **Memory Footprint** | **$< 25$ MB** | 450 – 850 MB (Electron + ONNX) | **-96%** |
| **Prefix Cache Integrity** | **100% (No Mutate)**| 96% | **+4%** |
| **Output Token Reduction** | **35% – 50%** | -3.4% (slight increase in review) | **+40% savings** |
| **Setup Friction** | Single command (`lean init`)| Multi-GB installer + proxy config | **Zero-toggle** |
