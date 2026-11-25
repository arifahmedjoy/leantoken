# LeanToken (Zero-Latency Token Optimization Engine)

[![CI](https://github.com/arifahmedjoy/leantoken/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/arifahmedjoy/leantoken/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933)](https://nodejs.org/)

> **Mission**: Maximize AI coding agent efficiency and slash token costs without degrading reasoning quality, code correctness, or responsiveness.

---

## The Core Philosophy: Prevention > In-Flight Compression

Traditional token-compression tools may act as in-flight HTTP proxies. They intercept LLM turns and use local machine-learning models (e.g. ONNX) or lexical algorithms to compress tokens in-flight.

### Trade-offs to Evaluate with In-Flight Compression:
1. **Added Latency**: The reviewed setup reported **1.1s - 2.9s of latency** (with multi-second spikes up to 45s); latency varies by implementation and environment.
2. **Prompt Cache Considerations**: Modern providers can discount cached prefixes. Whether a proxy preserves or changes those prefixes affects cache reuse and should be measured.
3. **Workload-Dependent Savings**: In one 626M-token benchmark, the tested configuration saved **~1.5% net tokens**. Results can vary with workload and configuration.
4. **Output Token Effects**: Input compression does not necessarily reduce generated output. Measure output-token effects separately for each approach.

### The LeanToken Strategy
Instead of paying a 2-second latency penalty to squeeze 1% out of uncached inputs, **LeanToken** attacks token waste at the source across four pillars:

1. **Upstream Navigation (Serena / AST / Symbol Maps)**: Prevent 70%-90% of file dumps by retrieving symbols, not files.
2. **Sub-Millisecond Tool Pruning (Deterministic MCP / Shell Hooks / RTK)**: Strip JSON noise, test stack traces, and verbose build logs in <5ms.
3. **Output Token Slashing (Caveman / Chisle Mode)**: Enforce dense, telegraphic outputs; cuts 30%-50% expensive output tokens.
4. **Code Churn Discipline (Ponytail / YAGNI Ladder)**: Minimum viable diffs prevent conversational context bloat over turns.
5. **Out-of-Band Session Learner (lean-learn)**: Asynchronous transcript scraper that catches repo footguns with 0ms in-flight latency.

---

## Repository Structure

```
D:\lean-token\
├── README.md                              # Project manifesto and architectural overview
├── PRD.md                                 # Product Requirements Document (Goals, Personas, Stories)
├── ROADMAP.md                             # Now / Next / Later roadmap & anti-roadmap
├── OPPORTUNITY-ASSESSMENT.md              # RICE scoring and economic justification
└── docs\
    ├── 01-token-compression-review-and-economics.md # Review of in-flight token-compression economics
    ├── 02-zero-latency-architecture.md    # The 4-layer technical design
    ├── 03-tooling-ecosystem.md            # Serena, Caveman, Ponytail, and MCPs
    ├── 04-quality-guardrails.md           # How to prune tokens without losing intelligence
    ├── 05-roadmap-and-experiments.md      # Actionable milestones and proof-of-concept plans
    └── 06-ecosystem-enhancements.md       # Marketplace tooling and enhanced stack
```

---

## Quick Comparison

| Feature                    | Traditional In-Flight Proxy              | LeanToken Approach                             |
| :------------------------- | :--------------------------------------- | :--------------------------------------------- |
| **Turn Latency**           | +1,100ms - 2,900ms                       | **< 5ms** (Zero perceptual latency)            |
| **Prefix Cache Integrity** | May constrain prefix mutation            | **100% Guaranteed** (Zero prefix mutation)     |
| **Output Token Reduction** | Varies by tool and workflow              | **30% - 50% Reduction** (Caveman/Chisle)       |
| **File Dump Waste**        | Compresses bloated files after the read  | **Prevents read** via symbol indexing (Serena) |
| **Cost**                   | Commercial / Subscription                | **100% Free & Open Source**                    |
| **Code Quality Impact**    | Risk of hallucination on compressed code | **Zero degradation** (AST-sound, exact diffs)  |

## Getting started

LeanToken requires Node.js 18 or later and has no external package dependencies.
Run it from a checkout:

```sh
git clone https://github.com/arifahmedjoy/leantoken.git
cd leantoken
node bin/lean.js help
node bin/lean.js prune git status
```

See the [usage guide](docs/usage.md) for all current CLI commands, shell hooks,
and notes about local runtime data.

## Development

```sh
npm test
npm run benchmark
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and verification
guidance. The project is distributed under the [MIT License](LICENSE); security
issues should be reported according to [SECURITY.md](SECURITY.md).

## Acknowledgments & Inspiration

LeanToken builds upon insights and experiments pioneered by the open-source community around developer token efficiency:
- **Minimal Diff & YAGNI Patterns**: Inspired by Dietrich Gebert's exploration of minimal modification nudges.
- **Telegraphic Output Protocols**: Inspired by Julius Brussee and Jay Pokale's research into concise LLM response formatting.
- **Terminal Command Filtering**: Inspired by community shell rewriting and command interception experiments (such as RTK).
- **Symbol & Structural Retrieval**: Inspired by language server AST navigation paradigms (such as Serena).

All product names, logos, and brands referenced are property of their respective owners.
