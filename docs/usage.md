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
node bin/lean.js init --dry-run
node bin/lean.js init
node bin/lean.js prune git status
node bin/lean.js symbols src/core/pruner.js
node bin/lean.js learn
node bin/lean.js stats
node bin/lean.js statusline
```

- `init` adds the shared directive to `CLAUDE.md`, `.cursorrules`, and
  `AGENTS.md` in the current directory and initializes `.lean/` runtime files.
  `--dry-run` previews the directive; `--global` targets the user's Claude
  configuration instead.
- `prune <command...>` runs a command and condenses its output. The original
  output is best-effort stored at `.lean/logs/last-command.log`; accumulated
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
