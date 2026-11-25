# Product Roadmap: LeanToken

## North Star Metric
> **Total Turn Cost Ratio (TTCR)**: The net cost (dollars + developer latency converted at $100/hr) per completed coding task.  
> **Target**: Reduce TTCR by **40%** compared to unoptimized agents, with **0ms added latency**.

---

## NOW (Sprint 1: Weeks 1-2) - Committed Core
*Focus: Fast tool output compaction & output token slashing.*

| Initiative | User Problem Solved | Success Metric | DRI | Status | Target Delivery |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`lean-prune` / RTK Native Hook** | Terminal and test outputs bloat context with 500+ lines of noise | Pruning runtime < 5ms; >60% token cut on test runs | Eng Lead | In Scoping | Sprint 1 Day 5 |
| **Caveman / Chisle Rule Pack** | LLMs burn expensive output tokens on polite filler and chat | Output token count reduced by >= 35% | PM / Prompt Eng | Ready | Sprint 1 Day 3 |
| **Ponytail Diff Engine** | Agents produce bloated diffs and speculative refactors | Diff line count reduced by >= 40% | Eng | Ready | Sprint 1 Day 4 |
| **CCR Log Spillover** | Fear of missing vital debug data when outputs are truncated | 100% of pruned logs recoverable via local handle | Eng Lead | In Scoping | Sprint 1 Day 7 |

---

## NEXT (Sprint 2: Weeks 3-4) - Navigation & Memory
*Focus: Upstream symbol navigation and background session learning.*

| Initiative | Hypothesis | Expected Outcome | Confidence | Blocker |
| :--- | :--- | :--- | :--- | :--- |
| **Serena AST Code Navigator** | Querying symbol signatures instead of reading full files saves 70%+ input tokens | 70% input token reduction on code exploration | High | Requires MCP / CLI interface definition |
| **`lean-learn` Background Miner** | Mining past session transcripts out-of-band prevents repeated file re-reads | Redundant file reads drop from 20x to 1x per repo | High | Needs transcript JSON schema parser |
| **Empirical Benchmark Suite** | Need objective, counterfactual data across 10 standard coding tasks | Defensible report showing cost vs latency trade-off | High | Needs Sprint 1 components completed |

---

## What We Are NOT Building (and Why)
- **In-Flight Neural Network / ONNX Proxy**: Causes 1.1s-2.9s latency tax for ~1% gain. Violates zero-latency North Star.
- **Electron Desktop Application**: Massive bloat and maintenance overhead for zero token savings.
- **History Prefix Mutator / Re-writer**: Destroys provider prompt caching, causing 10x cost increases ($0.30 vs $3.00/M).
