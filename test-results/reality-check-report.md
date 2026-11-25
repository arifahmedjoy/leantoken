# Reality-Based Integration Certification Report
**Integration Agent**: TestingRealityChecker  
**Assessment Date**: 2026-11-25  
**Evidence Source**: `test-results/qa-evidence-report.md` + direct CLI executions
**Certification Verdict**: **PROVISIONAL CERTIFICATION FOR MVP v0.1.0 (STAGING / EARLY ADOPTER READY)**

---

## 1. Challenge Against Fantasy Claims

| Claim Checked                               | Reality Check Audit                                                                                                     |         Verdict          |
| :------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------- | :----------------------: |
| *"Sub-5ms command pruning latency"*         | Benchmark ran 1,000 iterations. Real average was 0.231 ms, P99 was 1.253 ms. Real-world `git status` hook took 0.84 ms. |      **CONFIRMED**       |
| *"Zero in-flight token overhead"*           | Engine uses regex / stream filters on local process output; zero ML model calls, zero in-flight API requests.           |      **CONFIRMED**       |
| *"100% prompt cache prefix preservation"*   | Zero modification of prior agent message history or API payloads. System prompt rules are static.                       |      **CONFIRMED**       |
| *"Zero-MCP symbol extraction saves tokens"* | Extracted 12 signatures from `src/core/pruner.js` in 108 tokens. Replaces 4,000-token MCP server schemas.               |      **CONFIRMED**       |
| *"Commercial proxy replacement readiness"*  | A desktop GUI and auto-updater are not part of LeanToken v0.1.0, which is currently a terminal CLI engine.              | **VALIDATED LIMITATION** |

---

## 2. Real-World Limitations & Edge Cases Identified

1. **Windows Command Alias Coverage**:
   - `src/shell/hooks.ps1` functions override `git` and `pytest` in current PowerShell sessions. If an agent executes raw `cmd /c git status`, the PowerShell function is bypassed unless `lean` is invoked directly or npm-linked as a binary wrapper.
   - *Mitigation for v0.2*: Provide a PATH-precedence shim directory (`.lean/bin`) containing `git.cmd` and `pytest.cmd`.

2. **Session Learner Transcript Discovery**:
   - `lean learn` correctly parses standard JSONL transcripts. If a user runs an unsupported fork of Claude Code storing transcripts in an custom SQLite database, manual transcript export is required.

---

## 3. Deployment Readiness Assessment
- **Overall Rating**: **B+** (Honest engineering: rock-solid core CLI, lightning-fast execution, zero bloat, awaiting wider shell shim coverage).
- **Production Status**: **READY FOR LOCAL DEVELOPERS & DOGFOODING**.

---

# 2026-11-26 Real-Use Audit Addendum

## Audit Execution
- `npm test`: passed the complete 4-group suite.
- `npm run benchmark`: 1,000 iterations passed; average 0.767 ms, P50 0.244 ms, P99 4.572 ms.
- Direct CLI checks passed for `help`, `init --dry-run`, `init`, `prune git status`, `prune npm test`, `learn`, `stats`, `statusline`, `symbols src/core/pruner.js`, `symbols src/index.js`, and `--version`.
- Missing prune arguments and missing symbol paths returned non-zero exit codes with direct error messages.
- An unknown executable passed through `lean prune` preserved its raw output and exit status.

## Real-Use Findings
- Repository status pruning retained useful status and reported 41% estimated token savings at 0.77 ms.
- Real test-suite pruning collapsed 27 output lines to a compact passing summary.
- Telemetry correctly persisted total prune counts and savings under `.lean/stats.json`.
- `lean init` was idempotent: a second run reported "already up to date".

## Fixes Applied
- CommonJS `module.exports` entries are now visible in JavaScript symbol outlines.
- `lean symbols <missing-path>` now reports a concise error and exits 1 instead of printing an uncaught stack trace.
- Added regression assertions for `src/index.js` CommonJS exports.
