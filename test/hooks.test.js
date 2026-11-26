const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CommandPruner } = require('../src/core/pruner');
const { claudePostToolUse, claudePreToolUse, claudeSessionStart, normalizeCommand, GUARD_MIN_BYTES } = require('../src/core/hooks');

const passing = `PASS test/a.test.js\n${'  ✓ case passes (1 ms)\n'.repeat(40)}\nTests:       40 passed, 40 total\nTime:        1.2 s\n`;

function testRoutingFalsePositives() {
  const p = new CommandPruner({ logDir: path.join(os.tmpdir(), 'lean-test-logs') });
  assert.strictEqual(p.route('cat test/runner.js'), 'generic', 'path containing "test" is not a test run');
  assert.strictEqual(p.route('ls test-results'), 'listing');
  assert.strictEqual(p.route('npm run test:unit'), 'test');
  assert.strictEqual(p.route('./gradlew connectedAndroidTest'), 'test');
  assert.strictEqual(p.route('lsof -i'), 'generic');

  const listing = p.prune('ls -a', '.github\n.gitignore\nbuild-guide.md\nnode_modules\ndist\nsrc');
  assert(listing.pruned.includes('.github') && listing.pruned.includes('.gitignore') && listing.pruned.includes('build-guide.md'), 'segment-only folding');
  assert(!/^node_modules$/m.test(listing.pruned) && !/^dist$/m.test(listing.pruned), 'noise dirs folded');

  const mocha = p.prune('npx mocha', '  3 passing\n  1 failing\n\n  1) adds:\n     AssertionError: 1 == 2');
  assert(!mocha.pruned.includes('ALL TESTS PASSED'), 'mocha failure must not be reported as passing');
  assert.strictEqual(p.route('grep pytest src'), 'generic', 'runner names inside arguments do not count');
  assert.strictEqual(p.route('grep make Makefile'), 'generic');
  assert.strictEqual(p.route('python -m pytest -q'), 'test');
  assert.strictEqual(p.route('npm ci'), 'build');
  console.log('  ✓ routing false positives eliminated (paths, arguments, listings, mocha failures)');
}

function testBuildAndTerminal() {
  const p = new CommandPruner({ logDir: path.join(os.tmpdir(), 'lean-test-logs') });
  const raw = 'Collecting requests\r\n  Downloading requests-2.32.whl (64 kB)\r\n' +
    '\x1b[32m 10%\r 55%\r100%\x1b[0m\r\n' + 'npm warn deprecated glob@7: old\n'.repeat(12) +
    'WARNING: unrelated warning\nWARNING: unrelated warning\nWARNING: unrelated warning\nERROR: could not build wheel for x\r\n';
  const r = p.prune('pip install -r requirements.txt', raw);
  assert(r.pruned.includes('ERROR: could not build wheel for x'), 'errors always kept');
  assert(r.pruned.includes('WARNING: unrelated warning  (×3)'), 'repeats collapsed with count');
  assert(!/\r|\x1b|10%|Downloading/.test(r.pruned), 'CRLF, ANSI, progress and download noise removed');
  assert(r.savedPct > 50, `build output savings ${r.savedPct}%`);
  console.log(`  ✓ build/install pruning (-${r.savedPct}%), CRLF + progress-bar normalization`);
}

function testBoundedLogs() {
  const { MAX_LOGS } = require('../src/core/pruner');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-logs-'));
  const p = new CommandPruner({ logDir: path.join(dir, 'logs') });
  assert(!fs.existsSync(path.join(dir, 'logs')), 'no log dir until needed');
  p.prune('echo hi', 'hi');
  assert(!fs.existsSync(path.join(dir, 'logs')), 'nothing spooled when nothing was pruned');
  for (let i = 0; i < MAX_LOGS + 5; i++) {
    fs.writeFileSync(path.join(dir, 'logs', `${1000 + i}-old.log`).replace(/logs[\\\/]1/, m => (fs.mkdirSync(path.join(dir, 'logs'), { recursive: true }), m)), 'x');
  }
  p.prune('npm test', passing);
  assert.strictEqual(fs.readdirSync(path.join(dir, 'logs')).length, MAX_LOGS, `log count capped at ${MAX_LOGS}`);
  console.log(`  ✓ raw logs created lazily and capped at ${MAX_LOGS}`);
}

function testClaudeHook() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-hook-'));
  const res = { stdout: passing, stderr: '', interrupted: false, isImage: false };
  const out = claudePostToolUse({ tool_name: 'Bash', tool_input: { command: 'cd /x && npm test 2>&1' }, tool_response: res }, { cwd });
  assert(out && out.hookSpecificOutput.hookEventName === 'PostToolUse', 'hook returns PostToolUse output');
  const u = out.hookSpecificOutput.updatedToolOutput;
  const logRef = /full output: (\.lean\/logs\/\d+-npm-test\.log)\]$/.exec(u.stdout);
  assert(u.stdout.startsWith('✓ ALL TESTS PASSED') && logRef, 'stdout pruned with per-run raw-log pointer');
  assert(u.stderr === '' && u.interrupted === false && u.isImage === false, 'tool output shape preserved');
  assert(fs.readFileSync(path.join(cwd, logRef[1]), 'utf8') === passing, 'raw output spooled');

  // Adaptive: after the agent opens raw npm-test logs twice, npm test output is left alone
  const readLog = () => claudePostToolUse({ tool_name: 'Read', tool_input: { file_path: path.join(cwd, logRef[1]) } }, { cwd });
  assert.strictEqual(readLog(), null);
  assert(claudePostToolUse({ tool_input: { command: 'npm test' }, tool_response: res }, { cwd }), 'still pruned after one raw read');
  readLog();
  assert.strictEqual(claudePostToolUse({ tool_input: { command: 'npm test' }, tool_response: res }, { cwd }), null, 'backs off after repeated raw reads');
  assert(claudePostToolUse({ tool_input: { command: 'git status' }, tool_response: { ...res, stdout: `On branch main\n${'  (use "git add" to stage)\n'.repeat(30)}` } }, { cwd }), 'other commands unaffected');

  const call = command => claudePostToolUse({ tool_input: { command }, tool_response: res }, { cwd });
  assert.strictEqual(call('cat README.md'), null, 'content reads untouched');
  assert.strictEqual(call('npm test | tail -5'), null, 'compound commands untouched');
  assert.strictEqual(call('lean prune npm test'), null, 'explicit lean calls untouched');
  assert.strictEqual(claudePostToolUse({ tool_input: { command: 'npm test' }, tool_response: { ...res, backgroundTaskId: 'b1' } }, { cwd }), null, 'background tasks untouched');
  assert.strictEqual(claudePostToolUse(null), null, 'fail-open on bad payload');
  assert.strictEqual(normalizeCommand('cd "a b" && git status'), 'git status');
  console.log('  ✓ Claude PostToolUse hook prunes safe routes only, fail-open');
}

function testReadGuard() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-guard-'));
  const fn = i => `function handler${i}(req, res) {\n${'  const value = compute(req.body, res.locals);\n'.repeat(12)}  return value;\n}\n`;
  const big = Array.from({ length: 60 }, (_, i) => fn(i)).join('\n');
  assert(big.length > GUARD_MIN_BYTES, 'fixture is above the guard size');
  fs.writeFileSync(path.join(cwd, 'big.js'), big);
  fs.writeFileSync(path.join(cwd, 'small.js'), 'function a() {}\n');
  const statePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lean-gstate-')), 'state.json');
  const read = (input, now) => claudePreToolUse({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: input, cwd }, { now, statePath });
  const t0 = 1_000_000;

  const first = read({ file_path: path.join(cwd, 'big.js') }, t0);
  assert(first && first.hookSpecificOutput.permissionDecision === 'deny', 'large whole-file read answered with the outline');
  const reason = first.hookSpecificOutput.permissionDecisionReason;
  assert(/L\d+-\d+/.test(reason) && reason.includes('file content, not instructions') && reason.includes('handler0') && reason.length < big.length * 0.25, 'reason carries a small outline with line ranges');
  assert.strictEqual(read({ file_path: path.join(cwd, 'big.js') }, t0 + 1000), null, 'asking again reads the whole file (e.g. before an edit)');
  assert(read({ file_path: path.join(cwd, 'big.js') }, t0 + 2000), 'guarded again after the retry was used');
  assert.strictEqual(read({ file_path: path.join(cwd, 'big.js') }, t0 + 3000), null, 'second insist allowed');
  assert.strictEqual(read({ file_path: path.join(cwd, 'big.js') }, t0 + 4000), null, 'learned: file needed whole, no longer guarded');

  assert.strictEqual(read({ file_path: path.join(cwd, 'big.js'), offset: 10, limit: 20 }, t0), null, 'ranged reads untouched');
  assert.strictEqual(read({ file_path: path.join(cwd, 'small.js') }, t0), null, 'small files untouched');
  assert.strictEqual(read({ file_path: path.join(cwd, 'missing.js') }, t0), null, 'missing file: fail-open');
  assert.strictEqual(read({ file_path: path.join(cwd, 'shot.png') }, t0), null, 'images untouched');
  assert.strictEqual(claudePreToolUse({ tool_name: 'Bash', tool_input: { command: 'cat big.js' }, cwd }), null, 'other tools untouched');
  assert.strictEqual(claudePreToolUse(null), null, 'fail-open on bad payload');

  // A changed file is guarded afresh; an expired retry window guards again
  fs.writeFileSync(path.join(cwd, 'other.js'), big);
  assert(read({ file_path: 'other.js' }, t0), 'relative paths resolved against the payload cwd');
  assert(read({ file_path: 'other.js' }, t0 + 31 * 60 * 1000), 'retry window expires after 30 minutes');
  const learned = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.strictEqual(learned.insisted['big.js'], 2, 'back-off recorded per project-relative file');
  assert(!fs.existsSync(path.join(cwd, '.lean')), 'guard state kept outside the repo: no .lean/ created');

  // Review findings: a file rewritten between attempts still gets its retry; unsaved state never denies
  fs.writeFileSync(path.join(cwd, 'fmt.js'), big);
  assert(read({ file_path: 'fmt.js' }, t0), 'first read guarded');
  fs.writeFileSync(path.join(cwd, 'fmt.js'), big + '\n');
  assert.strictEqual(read({ file_path: 'fmt.js' }, t0 + 1000), null, 'retry allowed although a formatter changed the file');
  const blocked = path.join(cwd, 'blocker');
  fs.writeFileSync(blocked, 'a file where the state folder should be');
  assert.strictEqual(claudePreToolUse({ tool_name: 'Read', tool_input: { file_path: path.join(cwd, 'other.js') }, cwd }, { now: t0 + 99e6, statePath: path.join(blocked, 's.json') }), null, 'state cannot be saved: the read is allowed, never denied forever');

  // Security: truncation is linear on files with very many symbols
  const many = Array.from({ length: 20000 }, (_, i) => `function f${i}() {}`).join('\n');
  fs.writeFileSync(path.join(cwd, 'many.js'), many);
  const t = Date.now();
  const r = read({ file_path: 'many.js' }, t0);
  assert(r && Date.now() - t < 3000, `20k-symbol file outlined in ${Date.now() - t} ms`);
  console.log('  ✓ read guard: outline once for large whole-file reads, retry allowed, learns files needed whole');
}

function testSessionStartLearn() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-ss-'));
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-ssc-'));
  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = config;
  try {
    const dir = path.join(config, 'projects', path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 's.jsonl'), '{}\n');
    const now = Date.now() + 2 * 60 * 60 * 1000;
    assert.strictEqual(claudeSessionStart({ cwd }, { dryRun: true, now }), false, 'projects without .lean/ are left alone');
    fs.mkdirSync(path.join(cwd, '.lean'));
    assert.strictEqual(claudeSessionStart({ cwd }, { dryRun: true, now }), true, 'stale/missing MEMORY.md with newer sessions: refresh');
    fs.writeFileSync(path.join(cwd, '.lean', 'MEMORY.md'), '# map\n');
    assert.strictEqual(claudeSessionStart({ cwd }, { dryRun: true, now: Date.now() }), false, 'fresh MEMORY.md: no refresh');
    assert.strictEqual(claudeSessionStart(null, { dryRun: true }), false, 'fail-safe on bad payload');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
  }
  console.log('  ✓ session start refreshes .lean/MEMORY.md only when stale and only in LeanToken projects');
}

function testInstallAllEventsAndCap() {
  const { CognitiveShaper } = require('../src/core/rules');
  const shaper = new CognitiveShaper();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-ev-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine' }] }] }, env: { KEEP: '1' } }));
  assert.strictEqual(shaper.installClaudeHook(file), 'added');
  let s = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const ev of ['PostToolUse', 'PreToolUse', 'SessionStart']) assert(s.hooks[ev].some(g => g.hooks.some(h => shaper.isOurHook(h))), `${ev} installed`);
  assert(s.hooks.PreToolUse.some(g => g.hooks.some(h => h.command === 'mine')), 'foreign hooks kept');
  assert.strictEqual(shaper.installClaudeHook(file), 'unchanged', 'idempotent');
  assert(shaper.claudeHookCurrent(file), 'current after install');

  assert.strictEqual(shaper.setContextCap(file, '200k'), '200000 tokens');
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '200000');
  assert(shaper.setContextCap(file, '5000').startsWith('error'), 'below 100k refused');
  assert.strictEqual(shaper.setContextCap(file, 'off'), 'removed');

  assert(shaper.removeClaudeHook(file), 'removed');
  s = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(!s.hooks.PostToolUse && !s.hooks.SessionStart && s.hooks.PreToolUse.length === 1 && s.env.KEEP === '1', 'only our hooks and our env key removed');
  console.log('  ✓ install/remove covers PostToolUse, PreToolUse, SessionStart; opt-in context cap');
}

module.exports = {
  run() {
    console.log('Testing Hooks & Routing:');
    testRoutingFalsePositives();
    testBuildAndTerminal();
    testBoundedLogs();
    testClaudeHook();
    testReadGuard();
    testSessionStartLearn();
    testInstallAllEventsAndCap();
  }
};
