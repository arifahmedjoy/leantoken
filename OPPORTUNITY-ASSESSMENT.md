# Opportunity Assessment: LeanToken

**Author**: Alex (Lead Product Manager)  
**Date**: 2026-11-25  
**Decision**: **BUILD (High Priority / Immediate Kickoff)**

---

## 1. Why Now?
1. **Agent Adoption is Exploding**: Claude Code, Cursor, and OpenCode consume 10M-50M tokens per developer weekly.
2. **The Prompt Caching Revolution**: 90% discounts on prefix caches completely changed context economics. Products built on pre-caching mutation are obsolete.
3. **In-Flight Proxy Benchmark Findings**: One 16-day, 626M-token benchmark reported 1.1s-2.9s latency and ~1.5% net token savings for the tested configuration.

---

## 2. Evidence Base & RICE Score

| Factor | Value | Justification |
| :--- | :--- | :--- |
| **Reach (R)** | 1,000 users / month | Engineering teams using Claude Code, Cursor, and OpenCode |
| **Impact (I)** | 3 (Massive) | Eliminates latency tax, halves output costs, prevents context degradation |
| **Confidence (C)** | 95% (0.95) | Grounded in 626M token production empirical data and pricing mathematics |
| **Effort (E)** | 1.0 Person-Month | Fast deterministic tools (Go/Node/Rust) + structured prompt rules |
| **RICE Score** | **(1000 x 3 x 0.95) / 1.0 = 2,850** | **Top-tier strategic urgency** |
