# LeanToken (Token Optimization for AI Coding Agents)

[![CI](https://github.com/arifahmedjoy/leantoken/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/arifahmedjoy/leantoken/actions/workflows/ci.yml)
[![Release](https://github.com/arifahmedjoy/leantoken/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/arifahmedjoy/leantoken/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/@arifahmedjoy/leantoken)](https://www.npmjs.com/package/@arifahmedjoy/leantoken)
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

1. **Read less (section maps, symbols, read guard)**: `lean symbols <file>` gives every symbol (code) or section (Markdown) with its line range and size, so agents read one range instead of the whole file. In Claude Code, the read guard enforces it: a whole-file read of a large file gets the outline once; asking again reads the whole file.
2. **Deterministic tool-output pruning (Claude Code hook / `lean prune`)**: folds noise from test runs, builds and installs, `git status`, `git diff` and listings. The raw output is always kept in `.lean/logs/`.
3. **Dense replies**: the directive asks for telegraphic answers without preamble (output-token effect not yet measured).
4. **Code churn discipline**: minimum viable diffs prevent context bloat over turns.
5. **Out-of-band learning and measurement**: the session-start hook keeps `.lean/MEMORY.md` (maps of the files agents keep re-reading) up to date in the background, and `lean audit` measures what happened in real sessions, including context size, the largest cost.

### Measured results

From `lean audit` on a real project (8 Claude Code sessions, Nov 2026, LeanToken 0.2.1):

- **Shell output: ~100k tokens. Hook pruning saved ~300 (0.3%).** 92% of it came from chained `cd … && cat … && grep …` reads of documentation: content, not noise. Pruning it would make agents re-read.
- **Whole-file reads of large docs: ~39k tokens.** One 50 KB spec was read 61 times (up to 24 times in one session). Its `lean symbols` map is 738 tokens instead of ~13.6k.
- **Hook cost**: ~25 ms per call on top of Node.js start-up (~130–200 ms on the test machines), and only for commands the pruner can shrink (`npm run benchmark`).

So 0.3 targets reads first. Run `lean audit` in your own project to see where your tokens go.

From all 323 Claude Code sessions on one machine (Nov 2026):

- **Cache reads are ~70% of cost**: every API call re-reads the whole context. Context above 200k tokens was 40% of all cache-read tokens. That is the upper bound for the opt-in `lean init --global --context-cap=200000`, and `lean statusline` warns when you pass 200k.
- **Read guard, replayed on those sessions**: 59 whole-file reads of large code/Markdown files would have received outlines of 13.4k tokens instead of 530.6k. In 25 of the 59, the file was edited later, so the agent needed the whole file anyway; there the guard costs one extra call.
- **Each Read gains ~100–126 ms** (mostly Node.js start-up) for the read guard.

---

## Repository Structure

```
leantoken/
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
    ├── 06-ecosystem-enhancements.md       # Marketplace tooling and enhanced stack
    ├── 09-system-architecture.md          # Modules and data flow
    └── usage.md                           # Every command and option
```

---

## Quick Comparison

| Feature                    | Traditional In-Flight Proxy              | LeanToken Approach                             |
| :------------------------- | :--------------------------------------- | :--------------------------------------------- |
| **Turn Latency**           | +1,100ms - 2,900ms                       | None per turn; Node.js start-up plus ~5–30 ms per prunable shell call and per Read (read guard) |
| **Prefix Cache Integrity** | May constrain prefix mutation            | Never rewrites history; the directive is static |
| **Output Token Reduction** | Varies by tool and workflow              | Directive asks for dense replies (not yet measured) |
| **File Dump Waste**        | Compresses bloated files after the read  | **Avoids the read**: section maps and signatures |
| **Cost**                   | Commercial / Subscription                | **Free & open source (MIT)**                     |
| **Code Quality Impact**    | Risk of hallucination on compressed code | File content is never pruned; every pruned output keeps its raw log |

## Getting started

LeanToken requires Node.js 18 or later and has no dependencies. It runs on
Windows, macOS and Linux.

**Install, then set up a project** (detects the AI tools you use):

```sh
npm install -g @arifahmedjoy/leantoken
cd your-project
lean init          # add --dry-run to preview first
lean doctor        # confirms everything works (lean doctor --fix repairs what it finds)
```

**Daily use:**

```sh
lean symbols docs/spec.md   # section map with line ranges; read only what you need
lean audit                  # where this project's tokens went in real sessions
lean learn                  # refresh .lean/MEMORY.md now (Claude Code's hook also does it at session start)
lean stats                  # what the hook has pruned so far
```

Without installing: `npx @arifahmedjoy/leantoken init`. This writes the
instruction files, but skips the Claude Code auto-prune hook, because npx's
temporary cache does not last.

**Upgrade:** `npm install -g @arifahmedjoy/leantoken@latest`, then run
`lean init` in your projects. Directives are upgraded in place.
See [CHANGELOG.md](CHANGELOG.md) for what changed.

**Uninstall:**

```sh
lean remove                 # this project only (--purge also deletes .lean/)
lean uninstall              # every project LeanToken was set up in, plus user-level config
npm rm -g @arifahmedjoy/leantoken
```

Every file is restored to its content before `init`, and files LeanToken
created are deleted.

See the [usage guide](docs/usage.md) for all commands, shell hooks, and local
runtime data, and the [integration plan](docs/11-integration-plan.md) for
which file each AI tool and editor reads.

## Development

```sh
git clone https://github.com/arifahmedjoy/leantoken.git
cd leantoken
npm link           # puts `lean` on PATH from this checkout (undo: npm unlink -g)
npm test
npm run benchmark
```

**Releasing** ([Semantic Versioning](https://semver.org)):

1. Add entries under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) as you work.
2. Run `npm version patch|minor|major`. This runs the tests, bumps
   `package.json`, moves the Unreleased entries under the new version with
   today's date, commits, and tags `vX.Y.Z`.
3. Run `git push --follow-tags`. The **Release to npm** workflow
   ([release.yml](.github/workflows/release.yml)) publishes every version on
   `main` that is not on npm yet, with provenance. It tags `vX.Y.Z` if needed
   and creates the GitHub Release from the changelog entry. It refuses a
   version without a changelog entry. Do not run `npm publish` by hand.

   One-time setup: on npmjs.com, add this repository and `release.yml` as a
   trusted publisher for the package, or save an npm automation token as the
   repository secret `NPM_TOKEN`.

Every pull request that changes `src/` or `bin/` must add a `CHANGELOG.md`
entry (CI checks this) and update `ROADMAP.md` and the docs when status or
behavior changes.

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
