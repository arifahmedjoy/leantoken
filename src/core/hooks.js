const path = require('path');
const { CommandPruner } = require('./pruner');
const { Telemetry } = require('./telemetry');

// Routes that only drop noise. generic/json/git-log are excluded: in automatic mode the
// agent often asked for that output verbatim (file reads, JSON data, `git log -p`).
const AUTO_ROUTES = new Set(['git-status', 'git-diff', 'test', 'listing']);
const MIN_SAVED_TOKENS = 20;

/**
 * Reduce a shell command to one simple command, or return null when it is compound.
 * Leading `cd <dir> &&` and a trailing `2>&1` are allowed; pipes, `;`, `&&`, `||`,
 * newlines and substitutions are not, because the output then mixes several commands.
 */
function normalizeCommand(command) {
  let cmd = (command || '').trim();
  const cdPrefix = /^cd\s+("[^"]*"|'[^']*'|\S+)\s*&&\s*/;
  while (cdPrefix.test(cmd)) cmd = cmd.replace(cdPrefix, '');
  cmd = cmd.replace(/\s*2>&1\s*$/, '');
  if (!cmd || /&&|\|\||[;|\n`]|\$\(/.test(cmd)) return null;
  if (/(^|[\s\/\\])lean(\.js)?(\s|"|$)/.test(cmd)) return null; // already pruned explicitly
  return cmd;
}

/**
 * Claude Code PostToolUse hook: replaces Bash/PowerShell stdout with pruned output.
 * Returns the hook JSON object, or null to leave the output untouched. Never throws.
 */
function claudePostToolUse(payload, options = {}) {
  try {
    const res = payload && payload.tool_response;
    if (!res || typeof res.stdout !== 'string') return null;
    if (res.isImage || res.interrupted || res.backgroundTaskId) return null;

    const cmd = normalizeCommand(payload.tool_input && payload.tool_input.command);
    if (!cmd) return null;

    const cwd = options.cwd || payload.cwd || process.cwd();
    const pruner = new CommandPruner({ logDir: path.join(cwd, '.lean', 'logs') });
    if (!AUTO_ROUTES.has(pruner.route(cmd, res.stdout))) return null;

    const r = pruner.prune(cmd, res.stdout);
    if (r.savedTokens < MIN_SAVED_TOKENS) return null;

    try {
      Telemetry.recordPrune({ command: cmd, rawTokens: r.rawTokens, prunedTokens: r.prunedTokens, savedTokens: r.savedTokens, latencyMs: r.pruneDurationMs });
    } catch {
      // telemetry is best-effort
    }

    const footer = `\n[LeanToken: -${r.savedPct}% tokens | full output: .lean/logs/last-command.log]`;
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: { ...res, stdout: r.pruned + footer }
      }
    };
  } catch {
    return null; // fail-open: the agent sees the original output
  }
}

module.exports = { claudePostToolUse, normalizeCommand, AUTO_ROUTES };
