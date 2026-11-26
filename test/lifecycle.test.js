const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Every file and folder (relative path -> content) except .git internals
function snapshot(dir, rel = '') {
  const out = {};
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (r === '.git') continue;
    if (e.isDirectory()) { out[r + '/'] = ''; Object.assign(out, snapshot(dir, r)); } else out[r] = fs.readFileSync(path.join(dir, r), 'utf8');
  }
  return out;
}

function testInstallUninstallRoundTrip() {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, LEANTOKEN_CONFIG_DIR: process.env.LEANTOKEN_CONFIG_DIR };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-life-'));
  process.env.HOME = process.env.USERPROFILE = path.join(tmp, 'home');
  process.env.LEANTOKEN_CONFIG_DIR = path.join(tmp, 'config');
  fs.mkdirSync(process.env.HOME);
  const { CognitiveShaper } = require('../src/core/rules');
  const life = require('../src/core/lifecycle');
  const cwd = process.cwd();
  const before = {};
  try {
    const projects = ['a', 'b'].map(n => {
      const dir = path.join(tmp, n);
      fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Mine\n');
      if (n === 'a') fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
      before[dir] = snapshot(dir);
      process.chdir(dir);
      assert(new CognitiveShaper().init({}).success);
      life.trackProject(dir);
      return dir;
    });
    assert.deepStrictEqual(life.loadProjects(), projects.map(p => path.resolve(p)), 'both projects tracked');

    process.chdir(projects[0]);
    const doc = life.doctor(projects[0]);
    assert(doc.message.includes('auto-prune hook') && doc.message.includes('directive current'), doc.message);
    assert(doc.success && doc.summary.bad === 0, doc.message);
    assert(doc.checks.some(c => c.section === 'Claude Code hook' && /Hook test run: responded/.test(c.text)), 'installed hook is run once and answers');
    assert(doc.checks.some(c => /PreToolUse hook/.test(c.text) && c.level === 'ok') && doc.checks.some(c => /SessionStart hook/.test(c.text) && c.level === 'ok'), 'every hook event checked');
    assert(doc.checks.filter(c => c.level !== 'ok').every(c => !c.fix || /^(lean|npm) /.test(c.fix)), 'fixes are runnable commands');

    const style = require('../src/core/style');
    const plain = style.make(false);
    assert.strictEqual(plain.paint(doc.message), doc.message, 'no colour: text unchanged');
    const color = style.make(true, false);
    const painted = color.paint(doc.message);
    assert(painted.includes('[') && painted.replace(/\[[\d;]*m/g, '') === doc.message, 'colour adds escapes only, text identical');
    assert(!style.enabled({ isTTY: false }, [], {}), 'piped output (agents) stays plain');
    assert(!style.enabled({ isTTY: true }, [], { NO_COLOR: '' }) && !style.enabled({ isTTY: true }, ['--no-color'], {}), 'NO_COLOR and --no-color respected');
    assert(style.enabled({ isTTY: false }, [], { FORCE_COLOR: '1' }), 'FORCE_COLOR respected');

    const res = life.uninstall({ purge: true });
    assert(res.success && /npm (rm|unlink) -g/.test(res.message), res.message);
    for (const dir of projects) {
      assert.deepStrictEqual(snapshot(dir), before[dir], `${path.basename(dir)}: every file and folder restored exactly`);
    }
    assert(!fs.existsSync(process.env.LEANTOKEN_CONFIG_DIR), 'no config left behind');
  } finally {
    process.chdir(cwd);
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  console.log('  ✓ init -> doctor (hook test run, all events) -> uninstall round trip leaves projects exactly as they were');
  console.log('  ✓ colour only on a TTY, text identical with and without colour');
}

module.exports = {
  run() {
    console.log('Testing Install Lifecycle:');
    testInstallUninstallRoundTrip();
  }
};
