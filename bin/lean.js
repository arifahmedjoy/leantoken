#!/usr/bin/env node

/**
 * LeanToken CLI entrypoint.
 * Modules are required inside each command: the Claude Code hook runs this file on every
 * matching shell call, so it must load only what the hook needs.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
// `lean <cmd> --help` shows help instead of running <cmd>; prune and hook pass their arguments on untouched
const command = !['prune', 'hook'].includes(args[0]) && (args.includes('--help') || args.includes('-h')) ? 'help' : args[0];

function printHelp() {
  const { version } = require('../package.json');
  console.log(`
⚡ LeanToken v${version} - token optimizer for AI coding agents

Quick start (in your project):
  lean init                  Set up the AI tools you use (auto-detected)
  lean doctor                Check that everything works
  lean uninstall             Remove LeanToken from every project it was set up in

Setup:
  lean init [--only=<hosts>|--all] [--no-hooks] [--dry-run] [--global]
                             hosts: claude,agents,gemini,copilot,cursor,windsurf,cline,junie
                             aliases: codex,opencode (agents), antigravity (gemini), vscode (copilot)
  lean remove [--only=<hosts>] [--purge] [--global]
                             Undo init in this project; --purge also deletes .lean/
  lean uninstall [--purge]   Undo init everywhere, then prints the command to remove the CLI
  lean doctor                Diagnose Node, PATH, directives, hook and logs

Daily use:
  lean prune <command...>    Run a command and prune its output (raw log kept in .lean/logs/)
  lean symbols <file|dir>    Signatures for code; headings with line ranges for Markdown
  lean outline <file|dir>    Same as symbols
  lean learn [transcript]    Map hot files and failing commands from Claude Code sessions into .lean/MEMORY.md
  lean audit [--sessions=N]  Measure real sessions: what was pruned, what was skipped and why, repeated reads
  lean stats | statusline    Measured pruning counters for this project
  lean --version | help
`);
}

function parseOnly() {
  const onlyArg = args.find(a => a.startsWith('--only='));
  return onlyArg ? onlyArg.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : null;
}

switch (command) {
  case 'init': {
    const isGlobal = args.includes('--global') || args.includes('-g');
    const dryRun = args.includes('--dry-run');
    const { CognitiveShaper } = require('../src/core/rules');
    const shaper = new CognitiveShaper();
    const result = shaper.init({ global: isGlobal, dryRun, only: parseOnly(), all: args.includes('--all'), hooks: !args.includes('--no-hooks') });
    if (!result.success) process.exitCode = 1;
    else if (!isGlobal && !dryRun) require('../src/core/lifecycle').trackProject(process.cwd()); // so `lean uninstall` can find it
    console.log(result.message);
    break;
  }

  case 'remove': {
    const isGlobal = args.includes('--global') || args.includes('-g');
    const only = parseOnly();
    const { CognitiveShaper } = require('../src/core/rules');
    const result = new CognitiveShaper().remove({ global: isGlobal, only, purge: args.includes('--purge') });
    if (!result.success) process.exitCode = 1;
    else if (!isGlobal && !only) require('../src/core/lifecycle').untrackProject(process.cwd());
    console.log(result.message);
    break;
  }

  case 'uninstall': {
    console.log(require('../src/core/lifecycle').uninstall({ purge: args.includes('--purge') }).message);
    break;
  }

  case 'doctor': {
    const result = require('../src/core/lifecycle').doctor();
    if (!result.success) process.exitCode = 1;
    console.log(result.message);
    break;
  }

  case 'prune': {
    if (args.length < 2) {
      console.error('Error: specify a command to prune (e.g. lean prune git status)');
      process.exit(1);
    }
    const { CommandPruner } = require('../src/core/pruner');
    const { Telemetry } = require('../src/core/telemetry');
    const { spawnSync } = require('child_process');
    const targetCmd = args.slice(1);
    const pruner = new CommandPruner();
    
    // Execute target command synchronously with high precision
    const start = process.hrtime.bigint();
    const proc = spawnSync(targetCmd[0], targetCmd.slice(1), {
      encoding: 'utf-8',
      shell: true,
      maxBuffer: 50 * 1024 * 1024
    });
    const execDurationMs = Number(process.hrtime.bigint() - start) / 1e6;

    const rawOutput = (proc.stdout || '') + (proc.stderr || '');
    const cmdStr = targetCmd.join(' ');
    
    // Prune output
    const pruneRes = pruner.prune(cmdStr, rawOutput);

    // Save telemetry
    if (pruneRes.savedTokens > 0) Telemetry.recordPrune({
      route: pruneRes.route,
      cwd: process.cwd(),
      rawTokens: pruneRes.rawTokens,
      prunedTokens: pruneRes.prunedTokens,
      savedTokens: pruneRes.savedTokens,
      latencyMs: pruneRes.pruneDurationMs
    });

    // Output to stdout
    process.stdout.write(pruneRes.pruned);

    // Append summary footer
    if (pruneRes.savedTokens > 0) {
      process.stdout.write(`\n[LeanToken: pruned ${pruneRes.linesSaved} lines (-${pruneRes.savedPct}% tokens in ${pruneRes.pruneDurationMs.toFixed(2)}ms) | Raw: ${pruneRes.spoolPath || "not saved"}]\n`);
    }

    process.exit(proc.status ?? 1); // killed by a signal or failed to start: report failure
    break;
  }

  case 'hook': {
    // Called by agent hosts (e.g. Claude Code PostToolUse). Always exits 0: a hook must never block the agent.
    if (args[1] === 'claude') {
      try {
        const { claudePostToolUse } = require('../src/core/hooks');
        const out = claudePostToolUse(JSON.parse(fs.readFileSync(0, 'utf8')));
        if (out) process.stdout.write(JSON.stringify(out));
      } catch {
        // fail-open
      }
    }
    process.exit(0);
    break;
  }

  case 'symbols':
  case 'outline': {
    const { SymbolIndexer } = require('../src/core/symbol_indexer');
    const targetPath = args[1];
    if (!targetPath) {
      console.error('Error: specify file or directory (e.g. lean symbols src/index.js)');
      process.exit(1);
    }
    try {
      const indexer = new SymbolIndexer();
      const res = indexer.extract(targetPath);
      console.log(res.output);
      console.log(`\n[LeanToken Symbols: ${res.symbolCount} signatures | ${res.tokens} tokens (saved ${res.savedPct}% vs full source)]`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    break;
  }

  case 'learn': {
    const transcriptPath = args[1];
    const { SessionLearner } = require('../src/core/learner');
    const res = new SessionLearner().learn(transcriptPath);
    if (!res.success) process.exitCode = 1;
    console.log(res.message);
    break;
  }

  case 'audit': {
    const { audit, format } = require('../src/core/audit');
    const n = Number((args.find(a => a.startsWith('--sessions=')) || '').split('=')[1]) || 20;
    const report = audit(process.cwd(), { sessions: n });
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.log(format(report));
    break;
  }

  case 'stats': {
    const { Telemetry } = require('../src/core/telemetry');
    const stats = Telemetry.getStats();
    console.log(stats.formatted);
    break;
  }

  case 'statusline': {
    const { Telemetry } = require('../src/core/telemetry');
    const stats = Telemetry.getStats();
    console.log(stats.statusline);
    break;
  }

  case '--version':
  case '-v': {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    console.log(`LeanToken v${pkg.version}`);
    break;
  }

  case 'help':
  case '--help':
  case '-h':
  default: {
    printHelp();
    break;
  }
}
