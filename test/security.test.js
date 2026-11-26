const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** A repo can commit `.lean` as a symlink/junction: LeanToken must not write (or delete logs) through it. */
function testSymlinkedLeanRefused() {
  const { CommandPruner } = require('../src/core/pruner');
  const { Telemetry } = require('../src/core/telemetry');
  const repo = tmp('lean-sec-repo-');
  const target = tmp('lean-sec-target-');
  try {
    fs.symlinkSync(target, path.join(repo, '.lean'), 'junction');
  } catch {
    console.log('  - symlinked .lean: skipped (cannot create links here)');
    return;
  }
  const r = new CommandPruner({ logDir: path.join(repo, '.lean', 'logs') }).prune('npm test', 'PASS a.test.js\n'.repeat(80) + 'Tests: 80 passed, 80 total\n');
  assert.strictEqual(r.spoolPath, null, 'no raw log written through the link');
  Telemetry.recordPrune({ route: 'test', rawTokens: 10, prunedTokens: 1, savedTokens: 9, latencyMs: 1, cwd: repo });
  assert.deepStrictEqual(fs.readdirSync(target), [], 'nothing written in the link target');
  console.log('  ✓ symlinked .lean: no logs, stats or deletions through the link');
}

function testLearnerRedactsAndScopesMaps() {
  const { redact } = require('../src/core/learner');
  const cases = {
    'curl -H "Authorization: Bearer abcdefghijklmnop123" x': 'abcdefghijklmnop123',
    'PGPASSWORD=hunter2 psql -U a': 'hunter2',
    'mysql -u root -psecret db': 'secret',
    'git clone https://user:pa55word@host/r': 'pa55word',
    'export OPENAI_API_KEY=sk-abcdefghijklmnopqrstuv': 'sk-abcdefghijklmnopqrstuv',
    'aws --token=abc123xyz s3 ls': 'abc123xyz'
  };
  for (const [input, secret] of Object.entries(cases)) assert(!redact(input).includes(secret), `redacted: ${redact(input)}`);
  assert.strictEqual(redact('npm test -- --grep auth'), 'npm test -- --grep auth', 'ordinary commands unchanged');

  const { SessionLearner } = require('../src/core/learner');
  const project = tmp('lean-sec-learn-');
  const outside = tmp('lean-sec-out-');
  fs.writeFileSync(path.join(outside, 'secrets.md'), `# Keys\n${'AWS_SECRET_ACCESS_KEY=abc\n'.repeat(200)}`);
  fs.writeFileSync(path.join(project, '.env'), 'X=1\n'.repeat(200));
  const learner = new SessionLearner({ cwd: project });
  assert.strictEqual(learner.mapFor(path.join(outside, 'secrets.md')), '', 'files outside the project are not mapped');
  assert.strictEqual(learner.mapFor('.env'), '', 'non-code files are not mapped');
  console.log('  ✓ learn: secrets redacted, maps only for code/Markdown inside the project');
}

function testBoundedRegexTime() {
  const { normalizeCommand } = require('../src/core/hooks');
  const t = Date.now();
  normalizeCommand('source ' + 'activate'.repeat(20000));
  normalizeCommand('source ' + 'a'.repeat(3000) + 'activate'.repeat(100) + ' && npm test');
  assert(Date.now() - t < 500, `setup-prefix regex bounded (${Date.now() - t} ms)`);
  assert.strictEqual(normalizeCommand('source .venv/bin/activate && pytest -q'), 'pytest -q', 'venv activation still accepted');
  console.log('  ✓ hook command parsing time is bounded on adversarial input');
}

module.exports = {
  run() {
    console.log('Testing Security:');
    testSymlinkedLeanRefused();
    testLearnerRedactsAndScopesMaps();
    testBoundedRegexTime();
  }
};
