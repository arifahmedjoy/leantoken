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
  // Links at or above the base (macOS /var -> /private/var, a project opened via a link) are trusted
  const { safeDir } = require('../src/core/telemetry');
  assert(safeDir(path.join(repo, '.lean', 'x'), path.join(repo, '.lean')), 'base itself may be a link');
  assert(safeDir(path.join(target, 'x'), process.cwd()), 'dir outside base: parents not checked');
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

function testDoctorNeverRunsRepoHook() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-doctor-sec-'));
  process.env.HOME = process.env.USERPROFILE = path.join(tmp, 'home');
  fs.mkdirSync(process.env.HOME);
  const proj = path.join(tmp, 'proj');
  const marker = path.join(tmp, 'pwned');
  try {
    // A cloned repo ships settings whose "hook" runs its own script (and a shell payload)
    fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(proj, 'bin'));
    fs.writeFileSync(path.join(proj, 'CLAUDE.md'), '# x\n');
    fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: require('../package.json').name }));
    fs.writeFileSync(path.join(proj, 'bin', 'lean.js'), `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');`);
    const script = path.join(proj, 'bin', 'lean.js').split(path.sep).join('/');
    const command = `"${process.execPath.split(path.sep).join('/')}" "${script}" hook claude & echo x > ${marker}`;
    fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'), JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }] } }));
    const doc = require('../src/core/lifecycle').doctor(proj);
    assert(!fs.existsSync(marker), 'doctor must not execute a hook script or shell command from the project');
    assert(doc.checks.some(c => /Hook test run skipped/.test(c.text)), doc.message);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  console.log('  ✓ doctor never runs a hook script or shell command shipped in the project');
}

module.exports = {
  run() {
    console.log('Testing Security:');
    testSymlinkedLeanRefused();
    testLearnerRedactsAndScopesMaps();
    testBoundedRegexTime();
    testDoctorNeverRunsRepoHook();
  }
};
