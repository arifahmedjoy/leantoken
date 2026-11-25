# LeanToken (Zero-Latency Token Optimization Engine)

[![CI](https://github.com/arifahmedjoy/lean-token/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/arifahmedjoy/lean-token/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-339933)](https://nodejs.org/)

> **Mission**: Maximize AI coding agent efficiency and slash token costs without degrading reasoning quality, code correctness, or responsiveness.

---

## The Core Philosophy: Prevention > In-Flight Compression

Traditional token compressors (like **Headroom AI** or **vexp**) act as in-flight HTTP proxies. They intercept every LLM turn, run local machine-learning models (e.g. ONNX) or complex lexical algorithms, and attempt to compress tokens in-flight.

### Why the Traditional In-Flight Proxy Approach Fails in Real Coding:
1. **The Latency Tax**: Local ONNX models and JSON serialization add **1.1s - 2.9s of latency** (with multi-second spikes up to 45s) on every interaction.
2. **The Prompt Cache Paradox**: Modern providers (Anthropic, OpenAI, DeepSeek) offer **90% discounts on cached prefixes**. If a proxy mutates previous conversation history to compress it, it breaks the exact byte-for-byte cache prefix and **increases costs tenfold**.
3. **Diminishing Returns on Input**: In coding workflows (Claude Code, Cursor, OpenCode), requests consist mostly of cached history, file reads, and system prompts. Across 626M tokens in real-world testing, in-flight compression saved only **~1.5% net tokens** ($19 saved on $150+ spend) while costing dozens of hours in waiting time.
4. **Output Tokens are 4x-5x More Expensive**: Output tokens cost significantly more than cached inputs ($15/M vs $0.30-$3.75/M) and can never be cached. Naive proxy steering prompts fail to shorten model outputs.

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
    ├── 01-headroom-review-and-economics.md # Deep-dive into real-world Headroom metrics
    ├── 02-zero-latency-architecture.md    # The 4-layer technical design
    ├── 03-tooling-ecosystem.md            # Serena, Caveman, Ponytail, vexp, and MCPs
    ├── 04-quality-guardrails.md           # How to prune tokens without losing intelligence
    ├── 05-roadmap-and-experiments.md      # Actionable milestones and proof-of-concept plans
    └── 06-ecosystem-enhancements.md       # Deconstruction of Headroom add-ons & enhanced stack
```

---

## Quick Comparison

| Feature | Headroom / Traditional Proxy | LeanToken Approach |
| :--- | :--- | :--- |
| **Turn Latency** | +1,100ms - 2,900ms | **< 5ms** (Zero perceptual latency) |
| **Prefix Cache Integrity** | High risk or frozen (only ~1.5% saved) | **100% Guaranteed** (Zero prefix mutation) |
| **Output Token Reduction** | Measured at -3.4% (ineffective) | **30% - 50% Reduction** (Caveman/Chisle) |
| **File Dump Waste** | Compresses bloated files after the read | **Prevents read** via symbol indexing (Serena) |
| **Cost** | Commercial / Subscription | **100% Free & Open Source** |
| **Code Quality Impact** | Risk of hallucination on compressed code | **Zero degradation** (AST-sound, exact diffs) |

## Getting started

LeanToken requires Node.js 18 or later and has no external package dependencies.
Run it from a checkout:

```sh
git clone https://github.com/arifahmedjoy/lean-token.git
cd lean-token
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
