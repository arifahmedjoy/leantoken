---
title: "Zero-Latency Architecture"
description: "The technical design behind LeanToken's low-latency token optimization."
---

# 02. The Zero-Latency Token Architecture

This document specifies the technical design of the **LeanToken Zero-Latency Architecture**.

---

## 1. High-Level Architecture Overview

1. **UPSTREAM NAVIGATION LAYER (Serena / AST / LSP)**: Supplies function signatures, AST trees, symbols. Saves 70%-90% tokens vs full file reads. Latency: 0ms.
2. **DETERMINISTIC TOOL PRUNER (Fast Hook / RTK / lean-prune)**: Tool outputs (Bash, Test, Diffs, JSON). Fast regex/heuristic compaction (no ONNX). Saves 40%-80% on bloated outputs. Latency: < 3ms.
3. **OUTPUT SHAPING & DIFF DISCIPLINE (Caveman + Ponytail / Chisle)**: System Prompt & Agent Instruction Loop. Enforces telegraphic style & YAGNI diff rules. Saves 30%-50% on expensive output tokens. Latency: Negative (shorter outputs finish faster).
4. **ASYNC SESSION LEARNER (Background Worker lean-learn)**: Scrapes session transcripts on shutdown. Extracts repo footguns into project memory (MEMORY.md). Prevents 20x re-reads on future sessions. Latency: 0ms (out-of-band).
