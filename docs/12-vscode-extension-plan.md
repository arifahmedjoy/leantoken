---
title: "VS Code Extension Plan"
description: "Planned LeanToken status and command integration for Visual Studio Code."
---

# LeanToken Status: VS Code extension plan

**Status:** planned, not started (2026-11-26)
**Goal:** show LeanToken's savings and health in the editor status bar, in the same place as Headroom's item, and give one-click access to the common commands.

## 1. What the user sees

| State | Status bar text | When |
|---|---|---|
| Active | `⚡ LeanToken −57% · 69 tok` | Hook installed and paths valid; numbers from this workspace |
| Idle | `⚡ LeanToken` | Set up, nothing pruned yet in this workspace |
| Needs attention | `⚠ LeanToken` (warning colour) | `lean doctor` reports a warning or error, e.g. hook missing or pointing at deleted files |
| Not set up | `⚡ LeanToken: set up` | No directive or hook for this workspace or user |
| CLI missing | hidden, one notification | `lean` not found: offer `npm i -g @arifahmedjoy/leantoken` |

**Tooltip** (Markdown): prunes, raw → pruned tokens, average latency, last pruned (relative time), newest raw log, commands backed off by adaptive pruning (from `.lean/learned.json`), and the scope of the hook (project or user-level).

**Click** opens a quick pick:
- Show details (`lean doctor` output in an output channel)
- Open newest raw log
- Set up this project (`lean init`) / Upgrade directives
- Turn off for this project (`lean remove`), with confirmation
- Reset statistics for this workspace

Settings: `leantoken.statusBar.enabled`, `leantoken.statusBar.format` (`percent`, `tokens`, `both`), `leantoken.lean.path` (override CLI location).

## 2. Design

- **No dependencies, plain JavaScript**, like the CLI and like Headroom's 267-line extension. Single `extension.js`, activation `onStartupFinished`, `extensionKind: ["workspace"]` so it reads the files where the project actually lives (Remote SSH, WSL, containers).
- **Data source: files, not polling.** Read `<workspace>/.lean/stats.json` and `.lean/learned.json`; update on a `FileSystemWatcher` for `.lean/*.json`. No timers, no network.
- **Health check: the CLI.** Run `lean doctor --json` on activation, on window focus (debounced to once per minute), and after a quick-pick action. The extension never re-implements detection logic, so it cannot drift from the CLI.
- **Multi-root workspaces:** show the folder of the active editor; tooltip lists totals for every folder.
- **Untrusted workspaces:** read-only mode (show stats, never run `lean`).

## 3. CLI changes needed first (ship in 0.3.0)

| Change | Why |
|---|---|
| `lean doctor --json` → `{ ok, warn, bad, hosts, hook: { scope, filters, valid } }` | The extension needs structured health, not parsed text |
| `lean stats --json` and `lean stats --reset` | Reset action; stable output contract |
| `stats.json` adds `perCommand` (`{ "git status": { prunes, savedTokens } }`) and `lastCommand` | Tooltip detail; optional, older files still read |
| Hook writes stats atomically (temp file + rename) | The watcher must never read a half-written file |

Contract: the extension reads `stats.json` fields defensively and requires CLI ≥ 0.3.0 only for `--json`; with an older CLI it falls back to the file-only view.

## 4. Repository and release

- Location: `vscode/` in this repo (`package.json`, `extension.js`, `README.md`, `CHANGELOG.md`, icon). Excluded from the npm package by the existing `files` allowlist.
- Versioned separately (`leantoken-status` 0.1.0), with its own changelog section.
- CI: lint + `@vscode/test-electron` smoke test on Ubuntu/Windows/macOS; package with `vsce package` → `.vsix` artifact on each tag `vscode-v*`.
- Publish to the **VS Code Marketplace** (Microsoft publisher account + Azure DevOps token) and **Open VSX** (for Cursor, Windsurf, Antigravity, VSCodium). Until then, install the `.vsix` from GitHub Releases.

## 5. Milestones

1. **CLI 0.3.0:** `doctor --json`, `stats --json/--reset`, atomic stats writes, tests.
2. **Extension MVP:** status bar item, tooltip, watcher, click menu (details, open log). Manual test in VS Code and Cursor on Windows; `.vsix` only.
3. **Actions:** init / remove / reset with confirmations; settings; untrusted-workspace mode; multi-root.
4. **Release:** CI smoke tests on 3 OSes, Marketplace + Open VSX listing, README screenshots, link from the main README.

## 6. Out of scope

- Claude plan usage (5-hour / weekly limits). Headroom shows these; LeanToken has no reliable source for them and will not guess.
- Per-conversation savings. Stats are per project; Claude Code does not expose a session id to the hook output in a way worth depending on yet.
- Any network calls or telemetry upload.

## 7. Decisions needed

1. Publisher id for the Marketplace (e.g. `arifahmedjoy`).
2. Extension name: `LeanToken Status` (`leantoken-status`) or `LeanToken`.
3. Whether the status bar shows savings for the workspace only (proposed) or a machine-wide total as well, which needs a user-level stats file.
