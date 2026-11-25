# PRD: LeanToken (v0.1.0)
**Status**: Approved & Ready for Sprint 1  
**Author**: Alex (Lead Product Manager)  
**Last Updated**: 2026-11-25  
**Version**: 0.1.0  
**Target Delivery Horizon**: 2 Sprints (4 Weeks)  

---

## 1. Problem Statement

Developers using modern AI coding agents (Claude Code, Cursor, OpenCode, Codex) spend hundreds of dollars per month on API tokens and suffer from context degradation over long multi-turn sessions. 

Commercial in-flight token-compression proxies promise transparent token savings, but one production benchmark (16 days, 626M tokens across ~3,000 requests) highlighted potential trade-offs:
1. **The Latency Penalty Destroys Velocity**: In-flight proxies add **1.1s - 2.9s of local latency** per request (with p90 at 5.1s-8.4s and 45s stalls) due to synchronous ONNX/ML model inference and JSON re-serialization.
2. **Negligible In-Flight Compression ROI**: Modern LLMs rely heavily on prompt caching (90% discount). Because in-flight proxies must freeze cached prefixes to avoid cache-invalidation (which causes a 10x price spike), they can only compress the uncached turn delta. This delivered a median token savings of only **0.70%** (1.53% overall), saving only ~$19 on $150+ spend while wasting hours in human developer waiting time.
3. **Ignored Output Costs**: Output tokens cost **4x-5x more** than cached input tokens ($15/M vs. $0.30-$3.75/M). Current proxies focus on input strings while counterfactual telemetry shows **-3.4% output reduction** (no effect).
4. **Context Pollution**: Agents re-read entire 1,500-line files repeatedly (costing 4,500+ tokens per read) when they only need single method signatures or interface contracts.

### The Opportunity:
Build **LeanToken**: an open-source, zero-latency optimization suite that saves **30%-50% net token cost** and cuts response latency by eliminating token waste upstream (Serena AST navigation), pruning tool outputs deterministically in < 5ms (`lean-prune` / native RTK), and enforcing telegraphic output shaping (Caveman/Chisle) + minimal diffs (Ponytail).

---

## 2. Goals & Success Metrics

| Goal | Primary Metric | Baseline (In-Flight Proxy / Raw Agent) | Target (LeanToken v0.1) | Measurement Window |
| :--- | :--- | :--- | :--- | :--- |
| **Zero Perceptual Latency** | Pre-upstream turn latency overhead | 1,100ms - 2,900ms (proxy benchmark) | **< 5ms** (Deterministic Pruner) | Continuous / every request |
| **Output Token Reduction** | Average tokens per agent reply | ~420 tokens / turn | **<= 220 tokens / turn (-45%)** | 14-day evaluation |
| **Upstream File Dump Prevention** | Tokens spent on code exploration | ~45,000 tokens / 10-turn session | **<= 12,000 tokens (-70%)** | 10 standardized coding tasks |
| **Cache Prefix Integrity** | Cache-hit rate on Anthropic/OpenAI | 96.2% | **100% byte-for-byte match** | Lifetime |
| **Task Completion Quality** | First-try test pass rate on bugs | 74% baseline | **>= 74% (Zero quality degradation)** | Benchmark test suite |

---

## 3. Non-Goals (Scope Boundary)

- Run local ML/ONNX models in the critical API request path. Any processing > 10ms is banned from synchronous execution.
- Mutate conversation history prefixes. Prior turns are strictly immutable to maintain the 90% prompt cache discount.
- Build a custom GUI / electron dashboard in v0.1. All configuration and observability must be headless, CLI-native, or terminal statusline.
- Replace existing language servers. We leverage standard LSP/Tree-sitter and Serena patterns.
- Sacrifice code correctness for brevity. Compressing code signatures, indentation, or error stack traces is strictly forbidden.
