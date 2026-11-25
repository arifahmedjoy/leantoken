const assert = require('assert');
const { CognitiveShaper } = require('../src/core/rules');
const fs = require('fs');
const path = require('path');

function testRulesContent() {
  const shaper = new CognitiveShaper();
  const rules = shaper.getRules();
  
  assert(rules.includes('Surgical Minimal Diffs (YAGNI)'), 'Must include minimal diff rule');
  assert(rules.includes('High-Density Telegraphic Responses'), 'Must include concise speak rule');
  assert(rules.includes('Evidence-Based Grounding'), 'Must include anti-hallucination rule');
  
  const tokenEst = Math.ceil(rules.length / 3.8);
  assert(tokenEst < 350, `Rules must stay under 350 tokens, got ${tokenEst}`);
  console.log(`  ✓ Cognitive shaper generated: ${tokenEst} tokens (<350 budget)`);
}

function testRulesInit() {
  const shaper = new CognitiveShaper();
  const res = shaper.init({ dryRun: true });
  assert(res.success === true, 'Dry run should succeed');
  assert(res.message.includes('[Dry Run]'), 'Dry run should describe actions');
  console.log(`  ✓ Cognitive shaper dry-run initialization passed`);
}

function testMultiHostInit() {
  const os = require('os');
  const { HOSTS } = require('../src/core/rules');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-init-'));
  fs.mkdirSync(path.join(dir, '.git'));
  // Legacy v0.1.0 block inside user content must be upgraded in place
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), `# Project\nKeep me.\n\n# LeanToken Unified Agent Directive (v0.1.0)\n- old\n- Full unpruned command logs are stored at \`.lean/logs/last-command.log\`.\n\n## Footer\nKeep me too.\n`);
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] } }));

  const cwd = process.cwd();
  const env = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-home-'));
  process.env.HOME = process.env.USERPROFILE = fakeHome; // hermetic: no host is "installed"
  process.chdir(dir);
  try {
    const shaper = new CognitiveShaper();
    const res = shaper.init({ all: true });
    assert(res.success, res.message);
    for (const host of Object.values(HOSTS)) {
      const text = fs.readFileSync(path.join(dir, host.repo), 'utf8');
      assert(text.includes('Unified Agent Directive (v0.2.0)'), `${host.repo} has directive`);
    }
    const claude = fs.readFileSync('CLAUDE.md', 'utf8');
    assert(claude.includes('Keep me.') && claude.includes('Keep me too.') && !claude.includes('v0.1.0'), 'legacy block upgraded, user content kept');
    assert(claude.includes('hook already prunes'), 'Claude directive reflects installed hook');
    assert(fs.readFileSync('AGENTS.md', 'utf8').includes('lean prune <command>'), 'non-hooked hosts told to use lean prune');
    assert(fs.readFileSync('.windsurf/rules/leantoken.md', 'utf8').startsWith('---\ntrigger: always_on'), 'windsurf frontmatter');
    const settings = JSON.parse(fs.readFileSync('.claude/settings.local.json', 'utf8'));
    assert.deepStrictEqual(settings.permissions, { allow: ['Bash(ls:*)'] }, 'existing settings preserved');
    const ourGroups = settings.hooks.PostToolUse;
    assert(ourGroups.every(g => g.hooks.every(h => h.command.includes('hook claude') && h.if)), 'filtered hooks installed');
    assert(ourGroups.some(g => g.hooks.some(h => h.if === 'Bash(npm *)')) && !ourGroups.some(g => g.hooks.some(h => /cat|grep|sed/.test(h.if))), 'hook skips content-read commands');
    assert(ourGroups[0].hooks[0].command.startsWith(`"${process.execPath.split(path.sep).join('/')}"`), 'hook uses absolute node path');
    assert(/^\.lean\/$/m.test(fs.readFileSync('.gitignore', 'utf8')), '.lean/ ignored');
    assert(!fs.existsSync('.lean'), 'init creates no .lean/ up front');

    const again = shaper.init({ all: true });
    assert.deepStrictEqual(again.modified, [], 'second run is idempotent');
    assert.strictEqual(JSON.parse(fs.readFileSync('.claude/settings.local.json', 'utf8')).hooks.PostToolUse.length, ourGroups.length, 'hook not duplicated');

    // Auto-detect: only CLAUDE.md has user content -> LeanToken-only files of other hosts are deleted
    fs.writeFileSync('.github-keep.txt', 'x'); // unrelated file must survive
    const auto = shaper.init({});
    assert(auto.success, auto.message);
    for (const gone of ['.windsurf', '.clinerules', '.junie', '.cursorrules', 'GEMINI.md', '.github', 'AGENTS.md']) {
      assert(!fs.existsSync(gone), `${gone} removed when its tool is not used`);
    }
    assert(fs.existsSync('CLAUDE.md') && fs.existsSync('.github-keep.txt'), 'used host and unrelated files kept');

    // remove: strips the block, keeps user content, removes the hook but keeps user settings
    const rm = shaper.remove({ purge: true });
    assert(rm.success, rm.message);
    const after = fs.readFileSync('CLAUDE.md', 'utf8');
    assert(after.includes('Keep me.') && !after.includes('leantoken:start'), 'directive stripped, content kept');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync('.claude/settings.local.json', 'utf8')), { permissions: { allow: ['Bash(ls:*)'] } }, 'hook removed, settings kept');
    shaper.init({ only: ['claude'] });

    fs.writeFileSync('.claude/settings.local.json', '{ broken');
    assert.strictEqual(shaper.init({ only: ['claude'] }).success, false, 'unparseable settings reported');
    assert.strictEqual(fs.readFileSync('.claude/settings.local.json', 'utf8'), '{ broken', 'unparseable settings not overwritten');
    assert.strictEqual(shaper.init({ only: ['nope'] }).success, false, 'unknown host rejected');
  } finally {
    process.chdir(cwd);
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  console.log(`  ✓ Multi-host init: ${Object.keys(HOSTS).length} hosts, auto-detect + cleanup, remove, legacy upgrade, idempotent`);
}

function testDetection() {
  const os = require('os');
  const shaper = new CognitiveShaper();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-det-repo-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-det-home-'));
  assert.deepStrictEqual(Object.keys(shaper.detectHosts(repo, home)), ['agents'], 'nothing detected -> AGENTS.md fallback');
  fs.mkdirSync(path.join(home, '.gemini'));
  fs.mkdirSync(path.join(repo, '.cursor'));
  fs.writeFileSync(path.join(repo, '.cursor', 'mcp.json'), '{}');
  const found = shaper.detectHosts(repo, home);
  assert(found.gemini && found.cursor && !found.windsurf && !found.junie, `detected ${JSON.stringify(found)}`);
  console.log('  ✓ Host detection from repo and machine signals');
}

module.exports = {
  run() {
    console.log('Testing CognitiveShaper:');
    testRulesContent();
    testRulesInit();
    testMultiHostInit();
    testDetection();
  }
};
