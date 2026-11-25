# 01. In-Flight Token Compression: Economics & Prompt Caching

This document summarizes one 16-day, 626M-token production benchmark of an in-flight token-compression tool used with Claude Code. The results illustrate potential performance and prompt-caching trade-offs for that tested configuration; they should not be generalized to all tools or workloads.

---

## 1. The Benchmark Data Breakdown

Across ~3,000 requests and 626M input tokens:
- **Total Compression Savings**: 9.6M tokens (1.53%) - net token savings were negligible ($19.23 list price).
- **Median Compression per Request**: **0.70%** (63.5% of requests saved under 1.0%).
- **Pre-Upstream Latency Tax**: **1.1s - 2.9s** average (p90 at 5.1s - 8.4s; stalls of 15s - 46s).
- **Cache-Read Rate**: > 96% (~600M tokens) carried the real discount.
- **Output Token Reduction**: **-3.4%** (statistically zero).

---

## 2. Considerations for In-Flight Compression in Coding Workflows

1. **Prompt Cache Constraints**: Mutating cached conversation prefixes may reduce cache reuse; systems that preserve prefixes can only transform eligible parts of a request.
2. **Context Distribution**: When much of a request consists of cached history, system prompts, and tool schemas, the portion eligible for transformation may be small.
3. **Latency and Savings Trade-Off**: Evaluate end-to-end latency and net cost savings on representative workloads before choosing an approach.
