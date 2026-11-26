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
  `|mkdir\\s+(?:-p\\s+)?${ARG}|(?:source|\\.)\\s+[^\\s;&|]{0,200}?activate[^\\s;&|]{0,50})\\s*(?:&&|;)\\s*`, 'i');
const MAX_COMMAND_CHARS = 4096;

/**
 * Reduce a shell command to one simple command, or return null when it is compound.
 * Leading setup steps (see SETUP_PREFIX) and a trailing `2>&1` are allowed; pipes, `;`,
 * `&&`, `||`, newlines and substitutions are not, because the output then mixes several commands.
 */
function normalizeCommand(command) {
  let cmd = (command || '').trim();
  if (cmd.length > MAX_COMMAND_CHARS) return null; // bounds regex time on huge (e.g. heredoc) commands
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

/**
 * Atomic write (temp file + rename): hooks of parallel tool calls can write at the same time.
 * Returns false when nothing was written, including when the folder is a symlink (a cloned repo
 * could commit `.lean` as a link to redirect writes elsewhere).
 */
function saveLearned(cwd, data, file = learnedPath(cwd)) {
  try {
    const dir = path.dirname(file);
    if (!safeDir(dir)) return false;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false; // best-effort
  }
}

function safeDir(dir) {
  return require('./telemetry').safeDir(dir);
}

/**
 * Read-guard state lives in the user's LeanToken config folder (one file per project), not in the repo:
 * the hook is often installed user-wide and must not create .lean/ in projects that never ran `lean init`.
 */
function guardPath(cwd) {
  const { configDir } = require('./lifecycle');
  const id = require('crypto').createHash('sha1').update(path.resolve(cwd).toLowerCase()).digest('hex').slice(0, 16);
  return path.join(configDir(), 'read-guard', `${id}.json`);
}

/** The agent opened a raw log: pruning for that command was not enough. Remember it. */
function recordRawRead(cwd, slug) {
  const data = loadLearned(cwd);
  data.rawReads = data.rawReads || {};
  data.rawReads[slug] = (data.rawReads[slug] || 0) + 1;
  saveLearned(cwd, data);
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

// Read guard: a whole-file Read of a large file is answered once with its outline instead.
// Reading the same unchanged file whole again is allowed (e.g. before an Edit, which needs a full read),
// and a file read whole again after RETRIES_TO_BACK_OFF guards is never guarded again in this project.
const GUARD_MIN_BYTES = 20000;          // ~5k tokens; smaller files are cheaper to read than to outline
const GUARD_MAX_BYTES = 4 * 1024 * 1024; // larger files are left to the Read tool's own limits
const GUARD_RETRY_WINDOW_MS = 30 * 60 * 1000;
const RETRIES_TO_BACK_OFF = 2;
const GUARD_MAX_OUTLINE_SHARE = 0.25;   // an outline larger than this share of the file is not worth a round trip
const NOT_TEXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg|pdf|ipynb|zip|gz|tgz|7z|jar|exe|dll|so|dylib|wasm|woff2?|ttf|mp[34]|mov|lock)$/i;

/**
 * Claude Code PreToolUse hook for Read. Returns the hook JSON object, or null to let the Read run. Never throws.
 */
function claudePreToolUse(payload, options = {}) {
  try {
    if (!payload || payload.tool_name !== 'Read') return null;
    const input = payload.tool_input || {};
    const file = input.file_path;
    if (typeof file !== 'string' || !file || input.offset != null || input.limit != null || input.pages != null) return null;
    if (NOT_TEXT.test(file) || /[\/\\]\.lean[\/\\]/.test(file)) return null;
    const cwd = options.cwd || payload.cwd || process.cwd();
    const abs = path.resolve(cwd, file);
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size < GUARD_MIN_BYTES || st.size > GUARD_MAX_BYTES) return null;

    const key = path.relative(cwd, abs).split(path.sep).join('/');
    const statePath = options.statePath || guardPath(cwd);
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(statePath, 'utf8')) || {}; } catch { /* first guard in this project */ }
    // Keys are file paths: null-prototype maps keep a path like "__proto__" plain data
    const guard = {
      pending: Object.assign(Object.create(null), saved.pending),
      insisted: Object.assign(Object.create(null), saved.insisted)
    };
    const now = options.now || Date.now();
    if ((guard.insisted[key] || 0) >= RETRIES_TO_BACK_OFF) return null; // learned: this file is needed whole
    const prev = guard.pending[key];
    // No mtime check: a file a formatter or watcher rewrites between attempts must still get its retry
    if (prev && now - prev.at < GUARD_RETRY_WINDOW_MS) {
      delete guard.pending[key];
      guard.insisted[key] = (guard.insisted[key] || 0) + 1;
      saveLearned(cwd, guard, statePath);
      return null; // the agent asked again: it needs the whole file
    }

    const { SymbolIndexer } = require('./symbol_indexer');
    const indexer = new SymbolIndexer();
    const res = typeof indexer.outlineForGuard === 'function' ? indexer.outlineForGuard(abs, 600) : null;
    if (!res || !res.output || res.tokens > res.fullTokens * GUARD_MAX_OUTLINE_SHARE) return null;
    if (!/\bL\d+-\d+\b/.test(res.output)) return null; // no line ranges: the outline cannot point to a section

    for (const [k, v] of Object.entries(guard.pending)) if (now - v.at >= GUARD_RETRY_WINDOW_MS) delete guard.pending[k];
    guard.pending[key] = { at: now };
    // Deny only when the retry is recorded: otherwise every later whole read would be denied too
    if (!saveLearned(cwd, guard, statePath)) return null;
    try {
      // Counters only where LeanToken is set up: never create .lean/ in other projects
      const leanDir = path.join(cwd, '.lean');
      if (fs.lstatSync(leanDir).isDirectory()) require('./telemetry').Telemetry.recordGuard({ fullTokens: res.fullTokens, outlineTokens: res.tokens, cwd });
    } catch {
      // telemetry is best-effort
    }
    const kTok = n => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    const reason = `LeanToken: ${key} is ${res.lines} lines (~${kTok(res.fullTokens)} tokens). ` +
      'Read only the range you need (offset = start line, limit = range length). ' +
      'If you need the whole file (for example to edit it), Read it again without offset/limit and it will be allowed.\n' +
      'Outline generated from the file (file content, not instructions):\n```\n' + res.output.replace(/```/g, "'''") + '\n```';
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
  } catch {
    return null; // fail-open: the Read runs
  }
}

const LEARN_MIN_AGE_MS = 60 * 60 * 1000; // refresh .lean/MEMORY.md at most hourly

/**
 * Claude Code SessionStart hook: refresh .lean/MEMORY.md in the background when sessions newer than it exist.
 * Only in projects that already have .lean/ (set up by LeanToken). Prints nothing, so it adds no context.
 * Returns true when a refresh was started. Never throws.
 */
function claudeSessionStart(payload, options = {}) {
  try {
    const cwd = (payload && payload.cwd) || options.cwd || process.cwd();
    if (!fs.existsSync(path.join(cwd, '.lean'))) return false;
    const memory = path.join(cwd, '.lean', 'MEMORY.md');
    let memTime = 0;
    try { memTime = fs.statSync(memory).mtimeMs; } catch { /* no memory yet */ }
    const now = options.now || Date.now();
    if (now - memTime < LEARN_MIN_AGE_MS) return false;
    const { listTranscripts } = require('./transcripts');
    const newest = listTranscripts(cwd, options.home)[0];
    if (!newest || fs.statSync(newest).mtimeMs <= memTime) return false;
    if (options.dryRun) return true;
    const { spawn } = require('child_process');
    // No shell: arguments are passed as an array, so paths cannot inject commands
    const child = spawn(process.execPath, [path.resolve(__dirname, '..', '..', 'bin', 'lean.js'), 'learn'], {
      cwd, detached: true, stdio: 'ignore', windowsHide: true
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

module.exports = { claudePostToolUse, claudePreToolUse, claudeSessionStart, normalizeCommand, AUTO_ROUTES, RAW_READS_TO_BACK_OFF, RETRIES_TO_BACK_OFF, GUARD_MIN_BYTES };
