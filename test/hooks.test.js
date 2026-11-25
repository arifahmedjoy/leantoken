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
  console.log('  ✓ routing false positives eliminated (paths, listings, mocha failures)');
}

function testClaudeHook() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-hook-'));
  const res = { stdout: passing, stderr: '', interrupted: false, isImage: false };
  const out = claudePostToolUse({ tool_name: 'Bash', tool_input: { command: 'cd /x && npm test 2>&1' }, tool_response: res }, { cwd });
  assert(out && out.hookSpecificOutput.hookEventName === 'PostToolUse', 'hook returns PostToolUse output');
  const u = out.hookSpecificOutput.updatedToolOutput;
  assert(u.stdout.startsWith('✓ ALL TESTS PASSED') && u.stdout.includes('.lean/logs/last-command.log'), 'stdout pruned with raw-log pointer');
  assert(u.stderr === '' && u.interrupted === false && u.isImage === false, 'tool output shape preserved');
  assert(fs.readFileSync(path.join(cwd, '.lean', 'logs', 'last-command.log'), 'utf8') === passing, 'raw output spooled');

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
    testClaudeHook();
  }
};
