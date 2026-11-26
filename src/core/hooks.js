const fs = require('fs');
const path = require('path');
// pruner and telemetry are loaded only when an output is big enough to prune (hook start-up time)

// Routes that only drop noise. generic/json/git-log are excluded: in automatic mode the
// agent often asked for that output verbatim (file reads, JSON data, `git log -p`).
const AUTO_ROUTES = new Set(['git-status', 'git-diff', 'test', 'listing', 'build']);
const MIN_RAW_CHARS = 400;     // small outputs are not worth touching
const MIN_SAVED_TOKENS = 20;
const RAW_READS_TO_BACK_OFF = 2; // agent opened the raw log this often -> stop pruning that command
const LOG_RE = /\.lean[\/\\]logs[\/\\]\d+-([a-z0-9-]+)\.log/;

// Leading steps that print nothing, so the output still belongs to the one command after them:
// cd/pushd/Set-Location, `export X=..`, `$env:X = ..`, `mkdir [-p] dir`, `source <venv>/activate`.
// An argument with no command substitution ($(...) or backticks): those would print output of their own
const ARG = `(?:"[^"$\`]*"|'[^']*'|(?:[^\\s;&|$\`"']|\\$(?!\\())+)`;
const SETUP_PREFIX = new RegExp(
  `^(?:(?:cd|pushd|Set-Location|sl)\\s+${ARG}|export\\s+\\w+=${ARG}?|\\$env:\\w+\\s*=\\s*${ARG}` +
  `|mkdir\\s+(?:-p\\s+)?${ARG}|(?:source|\\.)\\s+[^\\s;&|]*activate[^\\s;&|]*)\\s*(?:&&|;)\\s*`, 'i');

/**
 * Reduce a shell command to one simple command, or return null when it is compound.
 * Leading setup steps (see SETUP_PREFIX) and a trailing `2>&1` are allowed; pipes, `;`,
 * `&&`, `||`, newlines and substitutions are not, because the output then mixes several commands.
 */
function normalizeCommand(command) {
  let cmd = (command || '').trim();
  while (SETUP_PREFIX.test(cmd)) cmd = cmd.replace(SETUP_PREFIX, '');
  cmd = cmd.replace(/\s*2>&1\s*$/, '');
  if (!cmd || /&&|\|\||[;|\n`]|\$\(/.test(cmd)) return null;
  if (/(^|[\s\/\\])lean(\.js)?(\s|"|$)/.test(cmd)) return null; // already pruned explicitly
  return cmd;
}

function learnedPath(cwd) {
  return path.join(cwd, '.lean', 'learned.json');
}

function loadLearned(cwd) {
  try {
    return JSON.parse(fs.readFileSync(learnedPath(cwd), 'utf8'));
  } catch {
    return { rawReads: {} };
  }
}

/** The agent opened a raw log: pruning for that command was not enough. Remember it. */
function recordRawRead(cwd, slug) {
  const data = loadLearned(cwd);
  data.rawReads = data.rawReads || {};
  data.rawReads[slug] = (data.rawReads[slug] || 0) + 1;
  try {
    fs.mkdirSync(path.dirname(learnedPath(cwd)), { recursive: true });
    fs.writeFileSync(learnedPath(cwd), JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // best-effort
  }
}

/**
 * Claude Code PostToolUse hook: replaces Bash/PowerShell stdout with pruned output.
 * Returns the hook JSON object, or null to leave the output untouched. Never throws.
 */
function claudePostToolUse(payload, options = {}) {
  try {
    if (!payload) return null;
    const cwd = options.cwd || payload.cwd || process.cwd();
    const input = payload.tool_input || {};

    // Feedback: a Read (or shell read) of a raw log means the pruned view was insufficient
    const target = input.file_path || input.path || input.command || '';
    const read = LOG_RE.exec(target);
    if (read) {
      recordRawRead(cwd, read[1]);
      return null;
    }

    const res = payload.tool_response;
    if (!res || typeof res.stdout !== 'string' || res.stdout.length < MIN_RAW_CHARS) return null;
    if (res.isImage || res.interrupted || res.backgroundTaskId) return null;

    const cmd = normalizeCommand(input.command);
    if (!cmd) return null;

    const { CommandPruner } = require('./pruner');
    const { Telemetry } = require('./telemetry');
    const pruner = new CommandPruner({ logDir: path.join(cwd, '.lean', 'logs') });
    if (!AUTO_ROUTES.has(pruner.route(cmd, res.stdout))) return null;
    const learned = loadLearned(cwd).rawReads || {};
    if ((learned[CommandPruner.logSlug(cmd)] || 0) >= RAW_READS_TO_BACK_OFF) return null;

    const r = pruner.prune(cmd, res.stdout);
    if (r.savedTokens < MIN_SAVED_TOKENS || !r.spoolPath) return null;

    try {
      Telemetry.recordPrune({ route: r.route, rawTokens: r.rawTokens, prunedTokens: r.prunedTokens, savedTokens: r.savedTokens, latencyMs: r.pruneDurationMs, cwd });
    } catch {
      // telemetry is best-effort
    }

    const rel = path.relative(cwd, r.spoolPath).split(path.sep).join('/');
    const footer = `\n[LeanToken: -${r.savedPct}% tokens | full output: ${rel}]`;
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

module.exports = { claudePostToolUse, normalizeCommand, AUTO_ROUTES, RAW_READS_TO_BACK_OFF };
