---
title: "Quality Guardrails"
description: "Structural safeguards for deterministic tool-output compression."
---

# 04. Quality Guardrails: Compressing Without Hallucination

## 1. What Must NEVER Be Compressed
- Exact function signatures and return types.
- Indentation and whitespace inside code blocks.
- Innermost stack frame of error tracebacks.
- Committed conversation history prefixes.

## 2. Structural Reversibility (The CCR Pattern)
Whenever tool logs are compacted, append a reference:
`[Output truncated. Full raw log (48KB) saved at .lean/logs/run-104.log]`
The agent can inspect raw lines on-demand using standard line-range tools.
