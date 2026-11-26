# Product Roadmap: LeanToken

## North Star Metric
> **Total Turn Cost Ratio (TTCR)**: the net cost (dollars + developer latency at $100/hr) per completed coding task.
> **Target**: reduce TTCR by **40%** against an unoptimized agent, with added latency below what a person notices.

**Measured with `lean audit`** (from Claude Code's own session files), never estimated. First measurement (aricon, 8 sessions, Nov 2026):
- Hook pruning saved **0.3%** of shell output. Most shell output is file content (`cat`/`sed`/`grep` of docs), which is correctly never pruned.
- Whole-file reads of large docs cost **~39k tokens**, and one 50 KB spec was read 61 times. **Reads, not command noise, are the main lever.** Priorities below follow from this.
- A hook call costs Node.js start-up (~130–200 ms on the test machines) plus ~25 ms for LeanToken. Only commands the pruner can shrink start it.

Second measurement (all 323 Claude Code sessions on one machine, 19,639 API calls, Nov 2026):
- Cache reads are **~70%** of cost (at cache read 0.1×, cache write 1.25×, output 5× input price). Every call re-reads the whole context.
- Calls with context over 200k produced **90%** of cache-read tokens; the context above 200k was **40%** of them (an upper bound for a 200k cap).
- Tool output was **~14%** of cache reads once weighted by how many later calls re-read it. Shell **6.8%**, Read **4.6%**, MCP **1.1%**. Shell pruning alone can reach only a small part of the cost.

---

## DONE

| Release | Shipped |
| :--- | :--- |
| 0.1.0 | Command pruner (`lean prune`), directive (minimal diffs, dense replies, grounding), symbol extraction, shell hooks |
| 0.2.0 | Auto-detected multi-tool `init`, Claude Code `PostToolUse` auto-prune hook, adaptive back-off, build/install pruning, `doctor`, `remove`, `uninstall`, changelog-gated releases |
| 0.2.1 | `.gitignore` cleanup on `remove` |
| Unreleased (0.4.0) | Read guard (`PreToolUse`: outline once for large whole-file reads, learns files needed whole), automatic `lean learn` at session start, line ranges in code outlines, context-cost section in `lean audit`, context size in `lean statusline`, opt-in `--context-cap`, security hardening |
| 0.3.0–0.3.1 | `lean audit` (measured savings), Markdown section maps, directive v0.3 "Reads" rules, `lean learn` on real Claude Code sessions, setup-prefixed commands pruned, narrower hook filters, no duplicate user + project hook, measured-only `stats`, project-scoped atomic telemetry, automated npm release workflow |

---

## NOW (after 0.4.0): prove the savings on real sessions

| Initiative | Problem | Success metric | Status |
| :--- | :--- | :--- | :--- |
| **Before/after audit on aricon** | Read rules and the read guard are unproven on live sessions | `lean audit`: whole-file reads over 8k chars down ≥70%, read tokens per session down ≥40%, guard retries (files needed whole) under 45% | Ready: needs 0.4.0 published and `lean init --global` |
| **Context-size effect** | Context above 200k produced 40% of cache-read tokens across 323 sessions (upper bound for a cap) | `lean audit` context section before/after `--context-cap=200000` on one project: cache read per session down, task success unchanged | Ready: opt-in flag shipped |
| **`lean audit` in CI-friendly form** | Savings can regress silently | `--json` thresholds checked in a nightly job on a reference repo | Not started |

## NEXT

| Initiative | Hypothesis | Expected outcome | Confidence |
| :--- | :--- | :--- | :--- |
| **Persistent hook process** | Node.js start-up is ~80–95% of each hook call, now also paid on every Read (read guard: ~100–126 ms, ~96 ms of it start-up) | Hook call <20 ms | Medium: adds a background process to manage |
| **`lean learn` on more hosts** | Codex / Gemini CLI / OpenCode transcripts show the same re-read patterns | MEMORY.md maps for non-Claude users | Medium |

## LATER

- VS Code extension (see [docs/12-vscode-extension-plan.md](docs/12-vscode-extension-plan.md)).
- Empirical benchmark suite: 10 standard coding tasks, with and without LeanToken, TTCR per task.

---

## What We Are NOT Building (and Why)
- **In-flight neural network / ONNX proxy**: adds 1.1–2.9 s latency for ~1% gain.
- **Pruning file content** (`cat`, `Read`, `grep` results): the agent asked for it; cutting it causes re-reads and wrong answers. Reduce reads instead.
- **Compacting MCP JSON output**: minifying 1,213 real JSON outputs saved 0.6% of their characters (0.4% of all MCP output). Not worth a hook call per MCP result.
- **Replacing duplicate outputs**: identical re-reads were ~3% of large outputs in measured sessions. Not worth the risk of hiding content after a compaction.
- **Electron desktop application**: large maintenance cost and no token savings.
- **History prefix rewriting**: breaks provider prompt caching, causing ~10x cost increases ($0.30 vs $3.00/M).
