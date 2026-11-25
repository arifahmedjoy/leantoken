# 01. Headroom Review, Real Economics & The Prompt Cache Trap

This document analyzes the real-world performance data from a 16-day, 626M-token production benchmark of **Headroom AI** with Claude Code, exposing the core mathematical and architectural bottlenecks of in-flight token compression proxies.

---

## 1. The Benchmark Data Breakdown

Across ~3,000 requests and 626M input tokens:
- **Total Compression Savings**: 9.6M tokens (1.53%) - net token savings were negligible ($19.23 list price).
- **Median Compression per Request**: **0.70%** (63.5% of requests saved under 1.0%).
- **Pre-Upstream Latency Tax**: **1.1s - 2.9s** average (p90 at 5.1s - 8.4s; stalls of 15s - 46s).
- **Cache-Read Rate**: > 96% (~600M tokens) carried the real discount.
- **Output Token Reduction**: **-3.4%** (statistically zero).

---

## 2. Why In-Flight Proxies Fail on Coding Agents

1. **The Prompt Cache Constraint**: Cached tokens cost $0.375/M; uncached cost $3.75/M. Any mutation to historical turns breaks byte-for-byte prefix caching and increases costs tenfold.
2. **Context Distribution**: In coding agents, 95%+ of context is static history, system prompts, and tool schemas. Only current turn outputs can be touched, yielding ~0.70% savings.
3. **The Human Latency Tax**: Trading 2 hours of developer waiting time over a month to save $19 of API credits is an extremely negative return on investment.
