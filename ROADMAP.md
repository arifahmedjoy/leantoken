# Product Roadmap: LeanToken

## North Star Metric
> **Total Turn Cost Ratio (TTCR)**: the net cost (dollars + developer latency at $100/hr) per completed coding task.
> **Target**: reduce TTCR by **40%** against an unoptimized agent, with added latency below what a person notices.

**Measured with `lean audit`** (from Claude Code's own session files), never estimated. First measurement (aricon, 8 sessions, Nov 2026):
- Hook pruning saved **0.3%** of shell output. Most shell output is file content (`cat`/`sed`/`grep` of docs), which is correctly never pruned.
- Whole-file reads of large docs cost **~39k tokens**, and one 50 KB spec was read 61 times. **Reads, not command noise, are the main lever.** Priorities below follow from this.
- A hook call costs Node.js start-up (~130–200 ms on the test machines) plus ~25 ms for LeanToken. Only commands the pruner can shrink start it.

---

## DONE

| Release | Shipped |
| :--- | :--- |
| 0.1.0 | Command pruner (`lean prune`), directive (minimal diffs, dense replies, grounding), symbol extraction, shell hooks |
| 0.2.0 | Auto-detected multi-tool `init`, Claude Code `PostToolUse` auto-prune hook, adaptive back-off, build/install pruning, `doctor`, `remove`, `uninstall`, changelog-gated releases |
| 0.2.1 | `.gitignore` cleanup on `remove` |
| Unreleased (0.3.0) | `lean audit` (measured savings), Markdown section maps, directive v0.3 "Reads" rules, `lean learn` on real Claude Code sessions, setup-prefixed commands pruned, narrower hook filters, no duplicate user + project hook, measured-only `stats`, project-scoped atomic telemetry, automated npm release workflow |

---

## NOW (next release after 0.3.0): prove the read savings

| Initiative | Problem | Success metric | Status |
| :--- | :--- | :--- | :--- |
| **Before/after audit on aricon** | v0.3 read rules are unproven | `lean audit`: whole-file reads over 8k chars down ≥70%, read tokens per session down ≥40% | Ready: needs v0.3 published and `lean init --global` |
| **Line numbers in code signatures** | Code outlines have no ranges, so agents read whole source files | `lean symbols x.js` shows `L12-40` per symbol, for all 11 languages | Not started |
| **`lean audit` in CI-friendly form** | Savings can regress silently | `--json` thresholds checked in a nightly job on a reference repo | Not started |

## NEXT

| Initiative | Hypothesis | Expected outcome | Confidence |
| :--- | :--- | :--- | :--- |
| **Read-size guard (PreToolUse)** | A whole-file `Read` of a large file can be steered to its outline before it happens | Large whole-file reads near zero without blocking needed reads | Medium: must not cost an extra round trip when the full file is really needed |
| **Persistent hook process** | Node.js start-up is ~85% of each hook call | Hook call <20 ms | Medium: adds a background process to manage |
| **`lean learn` on more hosts** | Codex / Gemini CLI / OpenCode transcripts show the same re-read patterns | MEMORY.md maps for non-Claude users | Medium |

## LATER

- VS Code extension (see [docs/12-vscode-extension-plan.md](docs/12-vscode-extension-plan.md)).
- Empirical benchmark suite: 10 standard coding tasks, with and without LeanToken, TTCR per task.

---

## What We Are NOT Building (and Why)
- **In-flight neural network / ONNX proxy**: adds 1.1–2.9 s latency for ~1% gain.
- **Pruning file content** (`cat`, `Read`, `grep` results): the agent asked for it; cutting it causes re-reads and wrong answers. Reduce reads instead.
- **Replacing duplicate outputs**: identical re-reads were ~3% of large outputs in measured sessions. Not worth the risk of hiding content after a compaction.
- **Electron desktop application**: large maintenance cost and no token savings.
- **History prefix rewriting**: breaks provider prompt caching, causing ~10x cost increases ($0.30 vs $3.00/M).
