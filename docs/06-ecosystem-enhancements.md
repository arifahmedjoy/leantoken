# 06. Ecosystem Enhancements & Headroom Add-on Deconstruction

This document analyzes the 8 add-ons bundled in Headroom AI's marketplace, reveals why their bundled implementation failed in real-world benchmarks, and defines the enhanced architectural stack for **LeanToken**.

---

## 1. Deconstructing the Headroom Add-on Marketplace

The screenshots reveal a critical truth about Headroom AI: **almost all of its actual token savings come from open-source community tools, not its proprietary proxy engine.**

| Add-on in Headroom | Creator / Repository | Mechanism | Headroom's Role |
| :--- | :--- | :--- | :--- |
| **Ponytail** (`v4.9.0`) | `DietrichGebert/ponytail` | Enforces YAGNI ladder; prevents over-engineered code and bloat | Third-party plugin wrapper |
| **Caveman** (`v4.2.0`) | `JuliusBrussee/caveman` | Enforces telegraphic caveman-speak; cuts 35%–65% output tokens | Third-party plugin wrapper |
| **Chisle** | `JayPokale/Chisle` | Combines Caveman + Ponytail + basic output trimming | Third-party plugin wrapper |
| **RTK** (`v1.2.0`) | `rtk-ai/rtk` | Rust Token Killer: rewrites bash commands (`git status`, `pytest`) | Third-party CLI hook |
| **Serena** (`v2.1.0`) | `oraios/serena` | MCP server for symbol-level code retrieval (single functions) | Third-party MCP launcher |
| **Codebase Memory** (`v0.12.1`)| `DeusData/codebase-memory-mcp` | Knowledge-graph MCP server for structural repository queries | Third-party MCP launcher |
| **Context7** (`v4.7.1`) | `upstash/context7` | MCP server fetching version-specific library documentation | Third-party MCP launcher |
| **MarkItDown** (`v0.1.9`) | `microsoft/markitdown` | Converts PDF / Office documents to Markdown | Third-party MCP/CLI wrapper |

---

## 2. Why Headroom's Add-on Bundle Failed in the 626M-Token Benchmark

In the 16-day production review, despite having these add-ons enabled:
- **RTK recorded 0 commands in its database.**
- **CCR (Compress-Cache-Retrieve) stored only 1 item.**
- **OpenCode/MCP saw zero usage.**
- **Net compression remained at a dismal 1.53%.**

### Root Causes of Failure:

### 1. The MCP "Schema Tax" (Hidden Context Bloat)
Notice the fine print on Serena: *"adds its tool definitions to every request."*
When an agent loads 4 MCP servers (Serena, Codebase Memory, Context7, MarkItDown), the agent must append the JSON schemas for **15 to 25 tools** to the system prompt on **every single turn**.
- Tool schema overhead: **3,000 to 7,000 tokens per turn**.
- If the agent only calls Serena once in a 20-turn session, the developer paid **60,000 to 140,000 tokens** in tool schema overhead just to save a few thousand tokens on a file read.

### 2. Broken Hook Plumbing on Windows / Cross-Platform
RTK relies on a pre-tool execution hook (e.g. rewriting bash calls before the LLM runs them).
Headroom attempted to wrap RTK inside its Electron GUI app. On Windows (where shells alternate between PowerShell, Git Bash, WSL, and CMD), Headroom failed to wire the execution hook into Claude Code's environment. The result: RTK was completely bypassed, and 0 commands were rewritten.

### 3. Marketplace Conflict & Redundancy
Chisle's own description warns: *"Covers what Ponytail and Caveman do, so use it instead of them, not alongside."*
Yet Headroom displays all three in the same UI, allowing developers to enable Ponytail, Caveman, and Chisle simultaneously.
- When multiple formatting plugins run at once, they inject competing instructions into the prompt cache.
- The model suffers prompt confusion, output formatting fluctuates, and tokens are wasted on redundant instructions.

### 4. The Proprietary Walled Garden on `--learn`
The single feature that actually provided lasting value in Headroom was its `--learn` session analyzer. Yet Headroom locked `--learn` inside its closed-source proxy, leaving open-source developers without a free, standalone tool for mining repo footguns.

---

## 3. How LeanToken Enhances and Fixes the Stack

LeanToken replaces Headroom's bloated wrapper with an orchestrated, zero-latency open-source engine:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        LeanToken Enhanced Engine                       │
└────────────────────────────────────────────────────────────────────────┘
   │
   ├── 1. Reliable Native Hook (Native RTK + `lean-prune`)
   │      - Robust cross-platform hook (pwsh, bash, zsh)
   │      - Rewrites `git status`, `git log`, `pytest`, `npm test`
   │      - Execution time < 3ms in Rust/Go; full logs spooled to `.lean/logs/`
   │
   ├── 2. Mutually-Exclusive Rule Presets
   │      - Curated Profiles: "Lean Sprint" (Chisle) OR "Modular Max" (Caveman + Ponytail)
   │      - Strict prevention of competing prompt instructions
   │
   ├── 3. Lazy / On-Demand Tool Definitions (Eliminating the MCP Schema Tax)
   │      - Do NOT inject 25 MCP tools into every request
   │      - Use a single meta-tool or dynamic activation: only inject Serena/Context7
   │        when the agent is explicitly in code-exploration or library-doc mode
   │
   ├── 4. Local LSP / Tree-Sitter Bridge (Replacing Heavy Knowledge Graphs)
   │      - Codebase Memory builds heavy graphs; LeanToken leverages local Tree-sitter
   │        and existing IDE language servers (LSP) for instant, token-free symbol resolution
   │
   ├── 5. Standalone Open-Source `lean-learn` CLI
   │      - Runs out-of-band when session ends
   │      - Scrapes session transcripts for files re-read ≥ 3x and failed bash attempts
   │      - Automatically writes memory to `CLAUDE.md` / `MEMORY.md` at 0ms turn latency
```

---

## 4. Evaluation of Additional Free Open-Source Tools to Integrate

To further outclass Headroom, LeanToken integrates:

1. **Tree-sitter / AST-Grep (`ast-grep`)**:
   - Instead of dumb text search, allows the agent to search for syntactic code patterns (`find all calls to function X matching signature Y`). Cuts search output tokens by 80%.
2. **Repomix / Gitingest**:
   - Generates compact, token-budgeted directory trees and file packings for initial project indexing.
3. **Microsoft MarkItDown**:
   - Retain MarkItDown as an optional converter for documentation and specification tasks (PDF/DOCX $\rightarrow$ Clean Markdown).
4. **Context7 (Upstash)**:
   - Keep as an on-demand documentation fetcher to stop agents from hallucinating outdated API parameters.
