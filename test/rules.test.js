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
  process.chdir(dir);
  try {
    const shaper = new CognitiveShaper();
    const res = shaper.init({});
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
    assert(settings.hooks.PostToolUse.length === 1 && settings.hooks.PostToolUse[0].hooks[0].command.includes('hook claude'), 'hook installed');
    assert(/^\.lean\/$/m.test(fs.readFileSync('.gitignore', 'utf8')), '.lean/ ignored');

    const again = shaper.init({});
    assert.deepStrictEqual(again.modified, [], 'second run is idempotent');
    assert.strictEqual(JSON.parse(fs.readFileSync('.claude/settings.local.json', 'utf8')).hooks.PostToolUse.length, 1, 'hook not duplicated');

    fs.writeFileSync('.claude/settings.local.json', '{ broken');
    assert.strictEqual(shaper.init({ only: ['claude'] }).success, false, 'unparseable settings reported');
    assert.strictEqual(fs.readFileSync('.claude/settings.local.json', 'utf8'), '{ broken', 'unparseable settings not overwritten');
    assert.strictEqual(shaper.init({ only: ['nope'] }).success, false, 'unknown host rejected');
  } finally {
    process.chdir(cwd);
  }
  console.log(`  ✓ Multi-host init: ${Object.keys(HOSTS).length} hosts, legacy upgrade, hook merge, idempotent`);
}

module.exports = {
  run() {
    console.log('Testing CognitiveShaper:');
    testRulesContent();
    testRulesInit();
    testMultiHostInit();
  }
};
