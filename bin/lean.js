#!/usr/bin/env node

/**
 * LeanToken CLI Entrypoint
 * Sub-10ms CLI runner for zero-latency token optimization
 */

const { CommandPruner } = require('../src/core/pruner');
const { CognitiveShaper } = require('../src/core/rules');
const { SymbolIndexer } = require('../src/core/symbol_indexer');
const { SessionLearner } = require('../src/core/learner');
const { Telemetry } = require('../src/core/telemetry');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
⚡ LeanToken v0.2.0 - Zero-Latency AI Token Optimizer

Usage:
  lean init [--global] [--only=<hosts>] [--no-hooks] [--dry-run]
                             Configure agent instructions for every major AI host
                             (hosts: claude,agents,gemini,copilot,cursor,windsurf,cline,junie)
                             and the Claude Code auto-prune hook
  lean prune <command...>    Execute a command and prune output (saves full CCR log)
  lean symbols <file|dir>    Extract clean symbol signatures (<250 tokens per file)
  lean learn [transcript]    Mine session transcripts out-of-band for MEMORY.md
  lean stats                 Display lifetime token savings and latency telemetry
  lean statusline            Output formatted one-line status for terminal prompt/statusline
  lean help                  Show this help text
`);
}

switch (command) {
  case 'init': {
    const isGlobal = args.includes('--global') || args.includes('-g');
    const dryRun = args.includes('--dry-run');
    const onlyArg = args.find(a => a.startsWith('--only='));
    const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean) : null;
    const shaper = new CognitiveShaper();
    const result = shaper.init({ global: isGlobal, dryRun, only, hooks: !args.includes('--no-hooks') });
    if (!result.success) process.exitCode = 1;
    console.log(result.message);
    break;
  }

  case 'prune': {
    if (args.length < 2) {
      console.error('Error: specify a command to prune (e.g. lean prune git status)');
      process.exit(1);
    }
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
    Telemetry.recordPrune({
      command: cmdStr,
      rawTokens: pruneRes.rawTokens,
      prunedTokens: pruneRes.prunedTokens,
      savedTokens: pruneRes.savedTokens,
      latencyMs: pruneRes.pruneDurationMs
    });

    // Output to stdout
    process.stdout.write(pruneRes.pruned);

    // Append summary footer
    if (pruneRes.savedTokens > 0) {
      process.stdout.write(`\n[LeanToken: pruned ${pruneRes.linesSaved} lines (-${pruneRes.savedPct}% tokens in ${pruneRes.pruneDurationMs.toFixed(2)}ms) | Raw: ${pruneRes.spoolPath}]\n`);
    }

    process.exit(proc.status || 0);
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

  case 'symbols': {
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
    const learner = new SessionLearner();
    const res = learner.learn(transcriptPath);
    console.log(res.message);
    break;
  }

  case 'stats': {
    const stats = Telemetry.getStats();
    console.log(stats.formatted);
    break;
  }

  case 'statusline': {
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
