const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function testTelemetryWritesToProject() {
  const { Telemetry } = require('../src/core/telemetry');
  const project = tmp('lean-tel-');
  const before = fs.existsSync(Telemetry.getStatsPath(process.cwd())) ? fs.readFileSync(Telemetry.getStatsPath(process.cwd()), 'utf8') : null;
  Telemetry.recordPrune({ route: 'git-status', rawTokens: 100, prunedTokens: 40, savedTokens: 60, latencyMs: 1, cwd: project });
  Telemetry.recordPrune({ route: 'test', rawTokens: 50, prunedTokens: 10, savedTokens: 40, latencyMs: 1, cwd: project });
  const data = JSON.parse(fs.readFileSync(path.join(project, '.lean', 'stats.json'), 'utf8'));
  assert.strictEqual(data.totalPrunes, 2);
  assert.strictEqual(data.byRoute['git-status'].savedTokens, 60, 'per-route counters');
  assert.strictEqual(data.version, require('../package.json').version, 'version follows the package');
  const after = fs.existsSync(Telemetry.getStatsPath(process.cwd())) ? fs.readFileSync(Telemetry.getStatsPath(process.cwd()), 'utf8') : null;
  assert.strictEqual(after, before, 'process cwd stats untouched');
  assert(!fs.readdirSync(path.join(project, '.lean')).some(f => f.endsWith('.tmp')), 'atomic write leaves no temp file');
  const shown = Telemetry.getStats(project).formatted;
  assert(!/40% fewer output|Cache Breaks/.test(shown), 'no unmeasured numbers shown');
  console.log('  ✓ telemetry: project folder from the hook payload, per-route, atomic, measured only');
}

function testSetupPrefixes() {
  const { normalizeCommand } = require('../src/core/hooks');
  assert.strictEqual(normalizeCommand('export CI=1 && npm test'), 'npm test');
  assert.strictEqual(normalizeCommand('cd api; mkdir -p out && source .venv/bin/activate && pytest -q 2>&1'), 'pytest -q');
  assert.strictEqual(normalizeCommand('$env:CI = "1"; npm test'), 'npm test');
  assert.strictEqual(normalizeCommand('cd x && cat a && git status'), null, 'output-producing step before the command');
  assert.strictEqual(normalizeCommand('export X=$(whoami) && npm test'), null, 'substitution rejected');
  assert.strictEqual(normalizeCommand('npm test | tail -5'), null, 'pipes rejected');
  console.log('  ✓ hook accepts silent setup steps (cd, export, $env:, mkdir, venv activate) before one command');
}

function testMarkdownOutline() {
  const { SymbolIndexer } = require('../src/core/symbol_indexer');
  const dir = tmp('lean-md-');
  const body = n => Array.from({ length: n }, (_, i) => `line ${i} with some words in it`).join('\n');
  const md = `# Spec\nintro\n## Orders\n${body(40)}\n\`\`\`sh\n# not a heading\n\`\`\`\n### States\n${body(10)}\n## Payments\n${body(20)}\n`;
  const file = path.join(dir, 'spec.md');
  fs.writeFileSync(file, md);
  const res = new SymbolIndexer().extract(file);
  const lines = res.output.split('\n');
  assert(lines.some(l => /^\s+L3-\d+ ## Orders \(~\d+ tok\)$/.test(l)), res.output);
  assert(!res.output.includes('not a heading'), 'headings inside code fences ignored');
  const pay = lines.find(l => l.includes('## Payments'));
  const end = Number(/L\d+-(\d+)/.exec(pay)[1]);
  assert.strictEqual(end, md.split('\n').length, 'last section runs to end of file');
  assert(res.savedPct > 80, `outline is small (-${res.savedPct}%)`);
  const d = new SymbolIndexer().extract(dir);
  assert(d.savedPct === Math.round(((d.fullTokens - d.tokens) / d.fullTokens) * 100), 'directory saving is measured, not fixed');
  console.log(`  ✓ Markdown outline with line ranges (-${res.savedPct}% vs full file)`);
}

/** Write a Claude Code-shaped session file under a fake config dir for project `cwd`. */
function fakeSession(configDir, cwd, entries) {
  const dir = path.join(configDir, 'projects', path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-').toUpperCase());
  fs.mkdirSync(dir, { recursive: true });
  const lines = [];
  let n = 0;
  for (const e of entries) {
    const id = `t${n++}`;
    lines.push(JSON.stringify({ type: 'assistant', timestamp: `2026-01-01T00:00:0${n % 10}Z`, message: { id: `m${n}`, usage: { input_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 }, content: [{ type: 'tool_use', id, name: e.name, input: e.input }] } }));
    lines.push(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: e.output, is_error: !!e.error }] } }));
  }
  fs.writeFileSync(path.join(dir, 's1.jsonl'), lines.join('\n'));
}

function testAuditAndLearn() {
  const { audit, format } = require('../src/core/audit');
  const { SessionLearner } = require('../src/core/learner');
  const project = tmp('lean-aud-');
  const config = tmp('lean-cfg-');
  fs.writeFileSync(path.join(project, 'spec.md'), `# Spec\n## A\n${'text line\n'.repeat(200)}## B\nmore\n`); // 150+ lines: gets a map
  const big = 'x'.repeat(9000);
  fakeSession(config, project, [
    { name: 'Read', input: { file_path: path.join(project, 'spec.md') }, output: big },
    { name: 'Bash', input: { command: `cd ${project} && cat spec.md` }, output: big },
    { name: 'Bash', input: { command: 'sed -n 1,20p spec.md' }, output: 'short' },
    { name: 'Bash', input: { command: 'git status' }, output: `M a.js\n[LeanToken: -60% tokens | full output: .lean/logs/1-git-status.log]` },
    { name: 'Bash', input: { command: 'cat a && git log' }, output: 'y'.repeat(2000) },
    { name: 'Bash', input: { command: 'npm run lint' }, output: 'boom', error: true },
    { name: 'Bash', input: { command: 'npm run lint' }, output: 'boom', error: true }
  ]);
  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = config;
  try {
    const r = audit(project);
    assert.strictEqual(r.sessions, 1, 'session found despite drive-letter case');
    assert.strictEqual(r.pruned.count, 1, 'hook footer counted');
    assert(r.pruned.savedTokens > 0);
    assert(r.skipped['compound command (pipes, ;, &&)'], 'compound output classified');
    assert.strictEqual(r.reads.files['spec.md'].reads, 3, 'Read, cat and sed reads of one file are counted together');
    assert.strictEqual(r.reads.wholeLarge, 2, 'large whole-file reads flagged');
    assert.strictEqual(r.usage.cacheRead, 700, 'usage summed once per message');
    assert(format(r, project).includes('lean symbols'), 'report points at the fix');

    const memory = path.join(project, '.lean', 'MEMORY.md');
    const res = new SessionLearner({ cwd: project }).learn();
    assert(res.success && res.hotFilesCount === 1, res.message);
    const text = fs.readFileSync(memory, 'utf8');
    assert(/`spec\.md`: read 3 times/.test(text) && /L2-\d+ ## A/.test(text), 'hot file recorded with its section map');
    assert(text.includes('npm run lint') && text.includes('2×'), 'repeated failure recorded');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
  }
  console.log('  ✓ audit and learn read real Claude Code session files');
}

function testUserWideHookNotDuplicated() {
  const { CognitiveShaper } = require('../src/core/rules');
  const repo = tmp('lean-uw-');
  const home = tmp('lean-uwh-');
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), '# Project\n');
  const env = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const cwd = process.cwd();
  process.env.HOME = process.env.USERPROFILE = home;
  try {
    const shaper = new CognitiveShaper();
    process.chdir(home);
    assert(shaper.init({ global: true, only: ['claude'] }).success);
    process.chdir(repo);
    fs.mkdirSync('.claude');
    fs.writeFileSync('.claude/settings.local.json', JSON.stringify({ hooks: { PostToolUse: shaper.hookGroups() } }));
    const res = shaper.init({ only: ['claude'] });
    assert(res.success && res.message.includes('installed user-wide'), res.message);
    assert(!fs.existsSync('.claude/settings.local.json'), 'project copy of the hook removed');
    assert(fs.readFileSync('CLAUDE.md', 'utf8').includes('hook already prunes'), 'directive knows pruning is automatic');
  } finally {
    process.chdir(cwd);
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  console.log('  ✓ project init reuses a user-wide hook instead of installing a second one');
}

function testHelpNeverRunsCommand() {
  const { execFileSync } = require('child_process');
  const dir = tmp('lean-help-');
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'lean.js'), 'init', '--help'], { cwd: dir, encoding: 'utf8' });
  assert(out.includes('Quick start') && !out.includes('initialized'), out);
  assert.deepStrictEqual(fs.readdirSync(dir), [], '`init --help` wrote nothing');
  const { CognitiveShaper } = require('../src/core/rules');
  const res = new CognitiveShaper().init({ dryRun: true, only: ['vscode'], hooks: false });
  assert(res.success && /copilot/.test(res.message), res.message);
  console.log('  ✓ `<command> --help` prints help without running; vscode is an alias of copilot');
}

function testContextAndRereads() {
  const { audit, format } = require('../src/core/audit');
  const { readSession, rereads } = require('../src/core/transcripts');
  const project = tmp('lean-ctx-');
  const config = tmp('lean-ctxc-');
  const dir = path.join(config, 'projects', path.resolve(project).replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  const asst = (id, cr, content = [], extra = {}) => JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', ...extra, message: { id, usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: cr, output_tokens: 1 }, content } });
  const result = (id, text) => JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] } });
  const lines = [
    asst('m1', 100000, [{ type: 'tool_use', id: 't0', name: 'Read', input: { file_path: 'big.js' } }]),
    asst('m1', 100000, []), // same message on a second line: counted once
    result('t0', 'a'.repeat(3800)), // ~1000 tokens, 2 later calls in its epoch
    asst('m2', 250000, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }]),
    asst('sub', 900000, [], { isSidechain: true }), // subagent usage: ignored
    result('t1', 'b'.repeat(3800)), // ~1000 tokens, 1 later call
    asst('m3', 300000),
    JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
    asst('m4', 50000),
    asst('m5', 60000)
  ];
  const file = path.join(dir, 's1.jsonl');
  fs.writeFileSync(file, lines.join('\n'));

  const s = readSession(file);
  assert.deepStrictEqual(s.contexts, [100000, 250000, 300000, 50000, 60000], 'one context per API call, sidechain skipped');
  assert.deepStrictEqual(s.epochStarts, [0, 3]);
  assert.strictEqual(rereads(s, s.calls[0]), 2, 'output before more calls is re-read more');
  assert.strictEqual(rereads(s, s.calls[1]), 1);
  assert.strictEqual(s.usage.cacheRead, 760000, 'existing usage field still summed');

  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = config;
  try {
    const r = audit(project);
    const c = r.context;
    assert.strictEqual(c.calls, 5);
    assert.strictEqual(c.max, 300000);
    assert.strictEqual(c.avg, 152000);
    const near = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
    near(c.shareAbove[200000], 550000 / 760000);
    near(c.shareAbove[400000], 0);
    near(c.capSavings[200000], 150000 / 760000); // (250k-200k) + (300k-200k)
    near(c.capSavings[150000], 250000 / 760000); // (250k-150k) + (300k-150k)
    assert.strictEqual(c.topSessions[0].id, 's1');
    assert.strictEqual(c.topSessions[0].maxContext, 300000);
    assert(r.toolCost.byTool.Read.weighted > r.toolCost.byTool.Bash.weighted, 'earlier output weighs more');
    assert.strictEqual(r.toolCost.top[0].tool, 'Read');
    assert.strictEqual(r.toolCost.top[0].rereads, 2);
    const out = format(r, project);
    assert(out.indexOf('Context (the largest cost') < out.indexOf('Shell output'), 'context section before shell output');
    assert(/upper bound/.test(out) && out.includes('--context-cap=200000') && out.includes('/clear'), 'tip over 30% above 200k');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
  }
  console.log('  ✓ audit: context sizes, cache-read share above thresholds, cap upper bound, re-read weighting');
}

function testStatuslineAndGuard() {
  const { Telemetry } = require('../src/core/telemetry');
  const project = tmp('lean-sl-');
  Telemetry.recordPrune({ route: 'test', rawTokens: 100, prunedTokens: 20, savedTokens: 80, latencyMs: 1, cwd: project });
  Telemetry.recordGuard({ fullTokens: 5000, outlineTokens: 300, cwd: project });
  Telemetry.recordGuard({ fullTokens: 1000, outlineTokens: 100, cwd: project });
  const data = JSON.parse(fs.readFileSync(path.join(project, '.lean', 'stats.json'), 'utf8'));
  assert.deepStrictEqual(data.readGuard, { guards: 2, fullTokens: 6000, outlineTokens: 400 });
  assert.strictEqual(data.totalPrunes, 1, 'guard does not count as a prune');
  assert(/Read guard[^\n]*2/.test(Telemetry.getStats(project).formatted) && Telemetry.getStats(project).formatted.includes('6,000'));

  const big = Telemetry.statusline({ cwd: project, context_window: { current_usage: { input_tokens: 4000, cache_creation_input_tokens: 10000, cache_read_input_tokens: 200000, output_tokens: 50 } } });
  assert(big.startsWith('ctx 214k ⚠ /compact or /clear') && big.includes('80 tokens saved'), big);
  const small = Telemetry.statusline(JSON.stringify({ workspace: { project_dir: project }, context_window: { used_percentage: 10, context_window_size: 200000 } }));
  assert(small.startsWith('ctx 20k |') && !small.includes('⚠'), small);
  const plain = Telemetry.getStats(process.cwd()).statusline;
  assert.strictEqual(Telemetry.statusline(''), plain, 'empty payload falls back');
  assert.strictEqual(Telemetry.statusline('{not json'), plain, 'bad JSON falls back');
  assert.strictEqual(Telemetry.statusline({ cwd: project }), Telemetry.getStats(project).statusline, 'no context_window: counters only');
  console.log('  ✓ statusline: context tokens with a >200k warning; read guard counters measured');
}

module.exports = {
  run() {
    console.log('Testing Telemetry, Outline, Audit & Learn:');
    testTelemetryWritesToProject();
    testSetupPrefixes();
    testMarkdownOutline();
    testAuditAndLearn();
    testContextAndRereads();
    testStatuslineAndGuard();
    testUserWideHookNotDuplicated();
    testHelpNeverRunsCommand();
  }
};
