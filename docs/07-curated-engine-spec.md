---
title: "Curated Engine Specification"
description: "LeanToken's curated golden-path architecture and product decisions."
---

# 07. The Curated Engine Specification: Eliminating Marketplace Chaos

**Status**: Approved Architecture Decision  
**Decision DRI**: Alex (Lead Product Manager)  
**Date**: 2026-11-25  

---

## 1. The Strategic Pivot: Curated Golden Path vs. Uncurated Marketplace

Marketplace-style products may present agent extensions (such as Ponytail, Chisle, Caveman, Serena, Codebase Memory, Context7, and RTK) as individually configurable add-ons.

### Marketplace Integration Challenges:
1. **User Misconfiguration**: Users enabled **Chisle**, **Caveman**, and **Ponytail** simultaneously. Chisle was explicitly designed to replace Caveman and Ponytail. Running all three injected competing, contradictory prompt instructions, degrading response quality and wasting prompt tokens.
2. **The MCP Schema Bomb**: Users toggled every available MCP server on. Each server injected full JSON schemas on every turn, adding **5,000+ tokens of dead schema overhead** per request.
3. **Plumbing Failures**: Users were expected to manage terminal PATHs, Node.js versions, and shell hooks manually. When hooks failed silently (like RTK on Windows), users received zero feedback.

### The LeanToken Rule:
> **In v0.1, we take away the toggles.** 
> LeanToken ships as an **opinionated, pre-harmonized, zero-configuration engine**. The user runs a single command (`lean init`), and LeanToken activates a mathematically tuned, conflict-free golden stack.

---

## 2. The Locked-In Golden Stack (v0.1)

Instead of 8 independent plugins fighting for context, LeanToken bakes in 4 tightly orchestrated, non-overlapping subsystems:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   LeanToken v0.1 Curated Engine                        │
│                   (Single Install: `lean init`)                        │
└────────────────────────────────────────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┼───────────────────────────────┐
    ▼                               ▼                               ▼
[Subsystem 1]                 [Subsystem 2]                   [Subsystem 3]
Unified Output & Diff Engine   Deterministic Tool Pruner       Lean Symbol Navigator
- Merged Caveman + Ponytail   - Embedded RTK / lean-prune     - AST / Tree-sitter
- Single static instruction   - Intercepts test/diff/git      - Sub-150 token schema
- Zero prompt collision       - Sub-3ms runtime (<5ms gate)   - Replaces heavy graphs
                                    │
                                    ▼
                              [Subsystem 4]
                        Out-of-Band Session Learner
                        - Standalone `lean-learn` hook
                        - Analyzes transcript on close
                        - Updates CLAUDE.md / MEMORY.md
```

---

## 3. Subsystem Detailed Specifications

### Subsystem 1: Unified Output & Diff Engine (Prompt Level)
* **What it replaces**: The mess of choosing between Caveman, Ponytail, and Chisle.
* **Implementation**: A single, mathematically optimized 350-word instruction block injected permanently at the static cache root of `CLAUDE.md` / system prompt.
* **Behavior**:
  - **Telegraphic Responses**: Strictly eliminates introductions, pleasantries, transitions, and conversational conclusions.
  - **The YAGNI Ladder**: Standard library $\rightarrow$ native syntax $\rightarrow$ inline $\rightarrow$ single-file edits. Explicitly bans unrequested refactoring.
  - **Diff Formatting**: Strictly requires compact patch blocks or line-specific edits.

### Subsystem 2: Deterministic Tool Pruner (Execution Level)
* **What it replaces**: Unreliable, manually managed shell hooks.
* **Implementation**: Native cross-platform hook bundled directly in the LeanToken CLI.
* **Behavior**:
  - Automatically wraps command executions for `git status`, `git log`, `npm test`, `pytest`, `cargo test`.
  - Passing tests $\rightarrow$ 1-line summary (`[TESTS PASSED]: 48 passed in 1.1s`).
  - Failing tests $\rightarrow$ Only failure name, assertion mismatch, and innermost 5 stack frames.
  - Large JSON / Directory dumps $\rightarrow$ Truncated with summary count.
  - **Safety Net (CCR)**: Full raw unpruned stdout always spools to `.lean/logs/last-command.log`.

### Subsystem 3: Lean Symbol Navigator (Retrieval Level)
* **What it replaces**: Heavy knowledge-graph MCP servers (`codebase-memory-mcp`) and bloated multi-tool schema servers that inject 5,000 tokens on every turn.
* **Implementation**:
  - Exposes **only 2 lightweight tools** to the agent:
    1. `lean_symbol_find(symbol_name)`: Returns file path, line range, and definition signature (< 100 tokens).
    2. `lean_file_outline(file_path)`: Returns classes and method signatures without function bodies (< 150 tokens).
  - Total schema overhead: **< 250 tokens** (vs. 5,000+ tokens for 4 external MCPs).

### Subsystem 4: Autonomous Session Learner (Memory Level)
* **What it replaces**: Session-learning functionality that may otherwise be bundled with a particular proxy product.
* **Implementation**:
  - Registers as an asynchronous exit hook when the agent session closes.
  - Scans session transcript:
    - Counts file read frequency $\rightarrow$ if file read $\ge 3$ times, extracts its path and exports its role to `MEMORY.md`.
    - Detects failed shell commands $\rightarrow$ records the working syntax fix.
  - Zero turn latency. Fully automated.

---

## 4. User Experience: The "Zero-Toggle" Promise

A developer interacts with LeanToken in exactly two steps:

```bash
# 1. Global Setup (Done once)
lean init -g

# 2. Run coding agent normally (Claude Code, Cursor, OpenCode)
claude
```

### What the user sees:
- No addon checkboxes to guess or misconfigure.
- No competing prompt instructions.
- Instant response times (no 1.5s ONNX delay).
- A lean terminal status indicator:
  `[LeanToken]: Output: -42% | Tools: -68% | Cache: 100% | Latency: +0ms`
