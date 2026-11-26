---
title: "Usage"
description: "Install and use LeanToken commands, hooks, audits, and local data."
---

# Using LeanToken

LeanToken is a Node.js CLI with no external package dependencies. It requires
Node.js 18 or later.

## Run from a checkout

Clone the repository, then run the CLI directly:

```sh
git clone https://github.com/arifahmedjoy/leantoken.git
cd leantoken
node bin/lean.js help
```

For a globally available `lean` command from the checkout, run `npm link` in
the repository. To remove the link, run `npm unlink -g`.

## Commands

```sh
lean init --dry-run
lean init
lean doctor
lean prune git status
lean symbols src/core/pruner.js
lean symbols docs/spec.md
lean audit
lean learn
lean stats
lean remove
lean uninstall
```

- `init` configures only the AI tools this project or machine uses. A tool
  counts as used when the repository contains its files with your own content
  (for example `CLAUDE.md`, `.cursor/`, `.github/copilot-instructions.md`), or
  when the tool is installed for your user (for example `~/.claude`,
  `~/.gemini`, Copilot's config folder). If nothing is detected, only
  `AGENTS.md` is written. The output lists each tool and the reason it was
  chosen. Files per tool: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
  `.github/copilot-instructions.md`, `.cursorrules`,
  `.windsurf/rules/leantoken.md`, `.clinerules/leantoken.md`,
  `.junie/guidelines.md`. For Claude Code, `init` also installs the auto-prune
  hook in `.claude/settings.local.json`, and adds that file and `.lean/` to
  `.gitignore`. If the hook is already installed user-wide
  (`~/.claude/settings.json`), no project copy is installed, and an existing
  project copy is removed: two copies would prune every output twice.
  - Re-running upgrades the directive in place (between `leantoken:start/end`
    markers) and keeps the content around it. It also deletes files LeanToken
    created earlier for tools that are no longer used, but only when they hold
    nothing else.
  - `--only=claude,copilot,...` picks tools explicitly and `--all` writes every
    tool. `--no-hooks` skips the hook and `--dry-run` previews.
  - `--global` writes user-level files instead: `~/.claude/CLAUDE.md`, the hook
    in `~/.claude/settings.json`, and `~/.gemini/GEMINI.md` (Gemini CLI,
    Antigravity), `~/.codex/AGENTS.md`, `~/.config/opencode/AGENTS.md` and
    `~/.copilot/copilot-instructions.md` when those tools are installed.
    `--only` also accepts `opencode`, `codex`, `antigravity` and `vscode` (GitHub Copilot).
  - `--global --context-cap=<tokens>` (opt-in) sets
    `CLAUDE_CODE_AUTO_COMPACT_WINDOW` in `~/.claude/settings.json`, so Claude
    Code compacts once the context reaches that many tokens (at least 100000,
    e.g. `200000` or `200k`). Every API call re-reads the whole context, so a
    smaller window means fewer cache-read tokens per call, and more compactions.
    `lean audit` shows the upper bound for your sessions.
    `--context-cap=off` removes the setting.

  See `docs/11-integration-plan.md` for which file each tool and editor reads.
- `doctor` checks Node.js, PATH, detected tools, directive versions, the hook's
  file paths, `.gitignore` and raw-log disk use. It exits 1 on any error.
- `remove [--only=<hosts>] [--purge]` undoes `init` in this project. Files go
  back to their content before `init`, files LeanToken created are deleted, and
  the hook is removed while your other Claude settings are kept. `--purge`
  also deletes `.lean/`.
- `uninstall [--purge]` runs `remove` in every project `init` was run in (the
  list is kept in your OS config folder) and for user-level config, then prints
  the command that removes the CLI itself.
- `hook claude` is called by Claude Code's hooks, not by people. One command
  serves three events:
  - **Read guard** (`PreToolUse` on `Read`): a whole-file read of a code or
    Markdown file of 20 KB–4 MB gets the file's outline (each section's line
    range) instead, once. The agent then reads the range it needs. Reading the
    same file whole again within 30 minutes is allowed, for example before an
    edit. A file read whole again twice after being guarded is never guarded
    again in that project. Small files, ranged reads, images, PDFs and
    notebooks are never touched. State is kept in LeanToken's config folder,
    not in your repository.
  - **Automatic learning** (`SessionStart`): in projects with `.lean/`,
    `.lean/MEMORY.md` is refreshed in the background when newer sessions exist
    and it is over an hour old. Nothing is added to the agent's context.
  - **Pruning** (`PostToolUse`), below.

  The pruning hook prunes test
  runs, builds and installs, `git status`, `git diff` and directory listings,
  and leaves all other output untouched. The command may be preceded by steps
  that print nothing: `cd`, `pushd`, `export X=..`, `$env:X = ..`, `mkdir`, and
  `source <venv>/bin/activate`. For example, `cd api && npm test` is pruned.
  Pipes, `;`/`&&` chains with other commands, and `$(...)` leave the output
  untouched. Claude Code starts the hook only for commands the pruner can
  shrink, such as `npm`, `pytest`, `git status`, `git diff`, `python -m` and
  `docker build`. It does not start it for `cat`, `grep` or `python script.py`,
  so those cost no extra time. If the agent
  opens the raw log of the same kind of command twice, that command is no
  longer pruned in the project (recorded in `.lean/learned.json`).
- `prune <command...>` runs a command and condenses its output. When something
  was removed, the original is saved to `.lean/logs/<time>-<command>.log` and
  named in the output's footer. Only the 20 newest logs are kept. Accumulated
  statistics are stored in the project's `.lean/stats.json`.
- `symbols <file|directory>` (alias `outline`) extracts lightweight outlines
  for JavaScript and TypeScript, Python, PHP, Java, C#, Go, Rust, Ruby, Kotlin,
  Swift, and C/C++. Every symbol has its line range, and top-level symbols
  their size, for example `L13-314 class CommandPruner (~2.9k tok)`. For Markdown it prints the heading tree with each
  section's line range and size, for example
  `L40-128 ## 4. Architecture (~2.8k tok)`. Headings inside code fences are
  ignored, and documents with more than 60 headings show levels 1-3. Read one
  section with `sed -n 40,128p file` or the Read tool's offset/limit.
  Other individual files use a generic line-based summary. A directory scan
  includes supported files in that directory, not nested directories. These
  lightweight outlines are best-effort and may miss complex or multiline
  declarations; they are not compiler-grade parsers.
- `learn [transcript]` reads the project's 10 newest Claude Code sessions from
  `~/.claude/projects/<project>/` (or `$CLAUDE_CONFIG_DIR/projects/`), or one
  given `.jsonl` file. It writes `.lean/MEMORY.md` with:
  - the files read 3+ times, each with its section map or signatures;
  - the shell commands that failed, with how often and the first error line.

  The directive tells agents to use these maps instead of re-reading files.
  The Claude Code hook refreshes it at session start; `lean learn` refreshes it
  now. The file is overwritten. Only code and Markdown files inside the
  project get maps, and likely secrets in recorded commands and errors are
  masked.
- `audit [--sessions=N] [--json]` measures the newest N (default 20) Claude
  Code sessions of this project. It reports:
  - model tokens;
  - shell output, how much the hook pruned, and why each other output was not
    pruned;
  - file reads, identical re-reads, and whole-file reads over 8k characters;
  - the most-read files;
  - context: average and largest context per API call, the share of
    cache-read tokens from calls above 150k/200k/400k context, an upper bound
    for what a context cap would remove, and tool output weighted by how many
    later calls re-read it.

  Token counts use the pruner's ~3.8 characters-per-token estimate. Model
  tokens come from the sessions' own usage records.
- `stats` and `statusline` display this project's measured pruning counters,
  split by output type, and read-guard counters. Used as Claude Code's status
  line, `statusline` also shows the current context size from the JSON Claude
  Code passes on stdin, with a warning above 200k tokens.

The CLI's current command list and option handling are authoritative; check
`node bin/lean.js help` if documentation and the implementation differ.

## Optional shell hooks

From the repository root, activate the Bash or Zsh hook in the current shell:

```sh
source ./src/shell/hooks.sh
```

For PowerShell, dot-source the hook from the repository root:

```powershell
. .\src\shell\hooks.ps1
```

For persistent profile integration, source the hook using the location of your
checkout; both hooks resolve the CLI relative to their own files.

Hooks redirect selected commands through `lean prune`; use the CLI directly if
you do not want that shell behavior.

## Local data

LeanToken stores runtime data in `.lean/` under the current working directory.
The raw command spool can contain source code, paths, or other command output;
review it before sharing. The repository ignores `.lean/logs/*.log` and
`.lean/stats.json`, but other `.lean/` files may be project-specific.
