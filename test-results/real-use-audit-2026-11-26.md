# LeanToken Real-Use Audit Report

**Audit date:** 2026-11-26  
**Runtime:** Node.js v24.21.0 on Windows  
**Git:** 2.56.1.windows.1  
**Repository:** `arifahmedjoy/leantoken`  
**Product version:** 0.1.0

## Executive Verdict

**Verdict: PASS WITH DOCUMENTED LIMITATIONS**

LeanToken's dependency-free core passed the complete automated suite and benchmark, and direct CLI executions behaved correctly on Windows. Real commands were executed rather than simulated: `git status`, `npm test`, symbol extraction, initialization preview, learner fallback, telemetry, and error paths.

The core is suitable for local MVP/dogfooding use. The evidence does not support blanket claims beyond the measured scope: proxy timing is an illustrative baseline, the P99 benchmark is above the nominal sub-3 ms target despite the average and median being below it, and symbol directory counts can be misleading.

## Test Summary

| Check | Result | Evidence |
|---|---|---|
| Complete test suite | PASS | 4 component groups; all assertions passed |
| 1,000-iteration benchmark | PASS | Average 0.753 ms; P50 0.247 ms |
| Real `git status` prune | PASS | 41% estimated token reduction; 1.20 ms pruning |
| Real `npm test` prune | PASS | 27 lines collapsed; 93% estimated token reduction; 0.83 ms pruning |
| Symbol extraction | PASS | 13 signatures; 114 vs 1,979 estimated tokens; 94% saved |
| Directory symbol scan | PARTIAL | Found `src/index.js` exports but reported file count as signature count |
| Init preview | PASS | Listed all three project agent targets without modifying files |
| Learner fallback | PASS | Scanned the single spooled log without an explicit transcript |
| Telemetry/statusline | PASS | Counters, savings percentage, and average overhead were displayed |
| Missing arguments | PASS | Non-zero exit with direct error message |
| Missing symbol file | PASS | Non-zero exit with `Error: File not found: ...` |
| Missing executable | PASS | Raw shell error and exit code 1 were preserved |

## Performance Measurements

### Automated benchmark

The 1,000-iteration benchmark reported:

- Minimum: 0.179 ms
- Average: 0.753 ms
- Median/P50: 0.247 ms
- P90: 0.644 ms
- P99: 13.932 ms
- Illustrative proxy baseline: 1,840 ms
- Reported ratio: 2,443.6x lower pruning overhead

**Reality interpretation:**

- The measured average and median remain well below 3 ms.
- The P99 of 13.932 ms does not satisfy a strict 3 ms P99 SLA.
- The benchmark is a microbenchmark of pruning logic; it does not measure shell startup or target-command execution as end-to-end latency.
- The proxy baseline is labeled illustrative and was not independently remeasured in this audit.

### Unit and regression suite

The suite passed all assertions:

- Git status pruning: 54% estimated savings
- Lockfile diff pruning: 32% estimated savings
- Passing test pruning: 63% estimated savings
- Fail-open behavior: passed
- Cognitive shaper: 253 estimated tokens, below the 350-token budget
- Symbol extraction: 13 signatures, 114 vs 1,979 estimated tokens, 94% saved
- Multi-language fixtures: 11 languages passed
- Session learner: hot-file and command-trap checks passed

One fixture run measured a 107.537 ms `git status` pruner result and a 67.692 ms passing-test pruner result. These measurements are not representative of the standalone benchmark: they include fixture setup and process timing variability.

### Real command measurements

#### `lean prune git status`

- Exit status: 0
- Git reported the branch, upstream state, and clean worktree.
- LeanToken compacted the output to 3 lines.
- Reported estimated savings: 41%
- Reported pruning latency: 1.20 ms
- Raw output was spooled to `.lean/logs/last-command.log`.

#### `lean prune npm test`

- Exit status: 0
- LeanToken detected the passing test result.
- It collapsed 27 output lines to a passing summary.
- Reported estimated savings: 93%
- Reported pruning latency: 0.83 ms

#### Telemetry

After real pruning executions, telemetry reported:

- 3 recorded prunes in the immediately visible telemetry sample
- 322 raw estimated tokens
- 68 pruned estimated tokens
- 254 estimated tokens saved
- 79% estimated savings
- 0.89 ms average pruning overhead

The final local telemetry file accumulated 6 prune executions and 508 saved estimated tokens. Statusline output reported 83% savings and 0.94 ms average overhead.

## Reality and Reliability Audit

### What is real

- Deterministic Node.js command pruning is implemented.
- Raw command output is spooled before pruning.
- Telemetry is persisted locally and displayed by `stats` and `statusline`.
- The CLI preserves command exit status for executed commands.
- Missing executables produce a shell error and exit 1.
- Missing symbol paths now produce a concise CLI error and exit 1.
- `init --dry-run` does not modify agent files.
- Re-running `init` is idempotent.
- CommonJS exports are included in JavaScript symbol outlines.

### What is not real

- "0ms in-flight latency" is not literally exercised as an HTTP-interception or model-processing claim.
- "Prompt Cache Breaks: 0" is a source-level behavior claim, not provider-side cache instrumentation.
- "40% fewer output tokens" is a product estimate, not a live provider measurement.
- The 1,840 ms proxy baseline is illustrative, not a benchmark against a running proxy.
- Symbol extraction is regex-based and explicitly best-effort for complex and multiline declarations.
- The directory scan does not recurse and is not a compiler-grade index.
- Session learning does not maintain live transcript discovery for every Claude-compatible client; it uses supported local paths and fallback logs.

## Findings and Limitations

### 1. P99 benchmark should not be hidden

The benchmark passes its average-latency criterion but reported a P99 of 13.932 ms in this run. A strict P99 sub-3 ms claim would fail.

**Resolution:** State average/P50/P90 in marketing and SLA claims, and re-run P99 at final certification under representative hardware.

### 2. Symbol directory count is semantically inaccurate

`lean symbols src` reported `1 signatures` while `src/index.js` contains five exported symbols.

**Root cause:** directory extraction sets `symbolCount` to the number of included files, not the number of extracted declarations.

**Impact:** Low to moderate: the outline content is correct, but the summary can mislead users.

**Recommended follow-up:** Change directory results to count extracted signatures across files.

### 3. Missing transcript learning is fallback-based

With no supported transcript, `lean learn` reports that it scanned spooled logs but does not currently analyze command output for all recurring patterns.

**Impact:** Low for MVP, but the feature is weaker than its full "mine session transcripts" description.

### 4. Windows shell integration coverage is incomplete

PowerShell and Bash hooks only intercept commands when sourced. Raw shells or tools bypassing those wrappers do not gain automatic pruning.

**Impact:** Users must invoke `lean prune` directly or activate a hook.

### 5. Runtime evidence is Node 24, while CI includes 18, 20, and 22

The app is declared for Node 18+, and the existing CI matrix covers Node 18/20/22. This audit ran on Node 24.21.0.

**Impact:** Node 24 behavior is additional coverage, not replacement for matrix validation.

## Security and Data Reality

- Raw command output is stored in `.lean/logs/last-command.log`.
- The log is not a secret redaction system.
- Spool content can include source code, paths, environment values, or command arguments.
- Local stats do not contain command text or raw output.
- `init --global` targets `%USERPROFILE%/.claude/CLAUDE.md`; it was not executed in this audit.

## External Claims Audit

| Claim | Evidence | Verdict |
|---|---|---|
| Sub-3 ms engine average | 0.753 ms benchmark average | Confirmed for this run |
| Sub-3 ms P99 | 13.932 ms P99 | Not confirmed |
| 100% prefix preservation | No prefix mutation code in prune path | Source-confirmed; provider cache effects not measured |
| Symbol extraction saves tokens | 94% in representative file and suite fixture | Confirmed within fixtures |
| Full suite passes | Fresh `npm test` passed | Confirmed |
| Real command pruning | Direct Git and test runs passed | Confirmed |
| Missing paths fail safely | Concise error and exit 1 | Confirmed |
| Learner is asynchronous/zero in-flight | Implementation runs only via explicit `lean learn` | Confirmed for this code path |

## Final Assessment

**Production/deployment scope:**

- Suitable for local developer testing and MVP dogfooding.
- Suitable for deterministic command-output pruning where loss tolerance is understood.
- Suitable for lightweight symbol preview, but not a replacement for an AST/LSP.
- Not certified for strict P99 latency guarantees.
- Not certified for provider cache economics.
- Not certified for shell-wide transparent interception across every Windows execution path.

**Highest-confidence claims:**

1. The complete test suite passes.
2. Benchmark average and median are sub-millisecond to sub-3 ms in this run.
3. Real Git/test output can be compacted substantially.
4. Raw output spooling and fail-open parsing are implemented.
5. Missing symbol paths now fail cleanly instead of leaking stack traces.

**Overall rating:** **B+ / MVP-ready, with P99 and directory-count follow-ups.**
