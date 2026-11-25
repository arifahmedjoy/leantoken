const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CommandPruner } = require('../src/core/pruner');
const { claudePostToolUse, normalizeCommand } = require('../src/core/hooks');

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

module.exports = {
  run() {
    console.log('Testing Hooks & Routing:');
    testRoutingFalsePositives();
    testBuildAndTerminal();
    testBoundedLogs();
    testClaudeHook();
  }
};
