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
  `.gitignore`.
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
    `--only` also accepts `opencode`, `codex` and `antigravity`.

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
- `hook claude` is called by Claude Code's hook, not by people. It prunes test
  runs, builds and installs, `git status`, `git diff` and directory listings
  run as a single command, and leaves all other output untouched. If the agent
  opens the raw log of the same kind of command twice, that command is no
  longer pruned in the project (recorded in `.lean/learned.json`).
- `prune <command...>` runs a command and condenses its output. When something
  was removed, the original is saved to `.lean/logs/<time>-<command>.log` and
  named in the output's footer. Only the 20 newest logs are kept. Accumulated
  statistics are stored in `.lean/stats.json`.
- `symbols <file|directory>` extracts lightweight outlines for JavaScript and
  TypeScript, Python, PHP, Java, C#, Go, Rust, Ruby, Kotlin, Swift, and C/C++.
  Other individual files use a generic line-based summary. A directory scan
  includes supported files in that directory, not nested directories. These
  lightweight outlines are best-effort and may miss complex or multiline
  declarations; they are not compiler-grade parsers.
- `learn [transcript]` analyzes a JSON Lines transcript and writes learned
  patterns to `.lean/MEMORY.md`. Without a path, it checks the supported
  transcript locations in the current working directory.
- `stats` and `statusline` display the local pruning counters.

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
