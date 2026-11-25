# LeanToken Real-Performance Measurement — aricon

**Date:** 2026-11-26
**Target:** `D:\Avalon\aricon` (Claude Code sessions)
**Method:** Offline replay. The Bash/PowerShell tool outputs from all 4 real Claude Code transcripts in `~/.claude/projects/d--Avalon-aricon/` were replayed through `CommandPruner.prune()`, using the exact command string Claude issued. Token counts are LeanToken's chars/3.8 estimate, except API usage figures, which come from the transcripts' `usage` fields.

## Init
`lean init` in aricon: `already up to date` (idempotent). The directives were already committed in aricon.

## Session baseline (API-reported)

| Session | Turns | Cache read | Cache create | Output | Bash calls | `lean` calls |
|---|---:|---:|---:|---:|---:|---:|
| 905584fd | 26 | 4,968,607 | 391,749 | 37,712 | 36 | 0 |
| 916c464e | 24 | 4,763,998 | 398,368 | 42,996 | 30 | 0 |
| 17818ebc | 24 | 4,027,815 | 769,845 | 16,821 | 34 | 2 |
| d15dbbe5 | 9 | 1,573,804 | 176,304 | 6,485 | 4 | 0 |
| **Total** | 83 | 15,334,224 | 1,736,266 | 104,014 | 104 | 2 |

## Pruner replay (real outputs)

| Route | Outputs | Raw est. tokens | Pruned | Saved |
|---|---:|---:|---:|---:|
| generic/json | 42 | 43,363 | 43,363 | 0% |
| test | 7 | 1,355 | 73 | 95% |
| listing | 2 | 2,566 | 2,293 | 11% |
| git diff | 1 | 330 | 330 | 0% |
| git status | 2 | 204 | 204 | 0% |
| **All Bash** | 54 | 47,818 | 46,263 | **3.3%** |

Real-output prune latency (n=54): avg 0.48 ms, P50 0.35 ms, P90 0.75 ms, **P99 1.62 ms**, max 1.73 ms.

## Findings

1. **Claude did not use LeanToken by itself.** Claude called `lean` 2 times out of 104 shell calls, and both calls were the integration session itself. Nothing in Claude Code routes Bash output through `lean prune`, because no hook is configured.
2. **The injected directive overclaims.** Section 4 says "LeanToken automatically prunes noise". In Claude Code this is false without a hook, and the agent is told something untrue about its own environment.
3. **The aricon workload has little to prune.** About 90% of Bash output tokens come from deliberate document reads (`cat`/`sed -n`/`grep -n` over `docs/`), which go to the generic route with 0% savings. That content is signal, and cutting it would be wrong. The large savings (95%) appear only on test runs, which are rare here.
4. **Claude Code's own `git status` is already compact.** It uses `git status --short`, so pruning saves 0%.
5. **The largest single tool output is not covered.** One `mcp__..._Coolify__get_server_metrics` result was about 10.8k tokens. LeanToken does not touch MCP output.
6. **Latency meets the claim on real data.** P99 was 1.62 ms here, against 13.9 ms in the synthetic benchmark.
7. **No causal output-token claim can be made.** Output per turn was 1,450 and 1,792 in the sessions before the directive, and 721 in the one session after it (9 turns, a different task). n=1, so this does not support a causal claim.

## Verdict
**The pruning engine works and is fast. Its real effect on aricon is about 3% of Bash output and close to 0% of total session tokens.** It also does not engage in Claude Code without a PreToolUse hook or an explicit `lean prune` instruction.
