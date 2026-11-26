const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { CognitiveShaper, HOSTS, DIRECTIVE_VERSION } = require('./rules');

const PKG = require('../../package.json');
const LEAN_JS = path.resolve(__dirname, '..', '..', 'bin', 'lean.js');

/** Where the list of initialized projects lives: one small file, in the OS-standard config location. */
function configDir() {
  if (process.env.LEANTOKEN_CONFIG_DIR) return process.env.LEANTOKEN_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'leantoken');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'leantoken');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'leantoken');
  return path.join(os.homedir(), '.config', 'leantoken');
}

const registryPath = () => path.join(configDir(), 'projects.json');

function loadProjects() {
  try { return JSON.parse(fs.readFileSync(registryPath(), 'utf8')).projects || []; } catch { return []; }
}

function saveProjects(projects) {
  try {
    if (!projects.length) {
      fs.rmSync(configDir(), { recursive: true, force: true }); // nothing to track: leave nothing behind
      return;
    }
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(registryPath(), JSON.stringify({ projects }, null, 2), 'utf8');
  } catch {
    // best-effort
  }
}

function trackProject(dir) {
  const p = path.resolve(dir);
  const list = loadProjects();
  if (!list.includes(p)) saveProjects(list.concat(p));
}

function untrackProject(dir) {
  const p = path.resolve(dir);
  saveProjects(loadProjects().filter(x => x !== p));
}

/** How LeanToken itself was installed, for exact uninstall advice. */
function installKind() {
  const real = fs.realpathSync(LEAN_JS);
  if (/[\\/]_npx[\\/]/.test(real)) return 'npx';
  if (/[\\/]node_modules[\\/]/.test(real)) return 'npm';
  return 'checkout'; // git checkout, usually `npm link`ed
}

/** Remove LeanToken from every tracked project and the user-level config. */
function uninstall(options = {}) {
  const shaper = new CognitiveShaper();
  const lines = [];
  for (const dir of loadProjects()) {
    if (!fs.existsSync(dir)) { lines.push(`  - ${dir} (no longer exists)`); continue; }
    const res = shaper.remove({ cwd: dir, purge: options.purge });
    lines.push(`  ✓ ${dir}`, ...res.message.split('\n').slice(1).map(l => `    ${l.trim()}`));
  }
  const global = shaper.remove({ global: true });
  lines.push('  ✓ user-level config', ...global.message.split('\n').slice(1).map(l => `    ${l.trim()}`));
  saveProjects([]);
  const kind = installKind();
  const last = kind === 'npm' ? `npm rm -g ${PKG.name}` : kind === 'checkout' ? 'npm unlink -g   (run in the LeanToken checkout)' : 'nothing (npx installs nothing permanently)';
  return { success: true, message: `⚡ LeanToken uninstalled from:\n${lines.join('\n')}\n\nLast step, remove the CLI itself: ${last}` };
}

const ago = ms => ms < 3600e3 ? `${Math.max(1, Math.round(ms / 60e3))} min ago` : ms < 86400e3 ? `${Math.round(ms / 3600e3)} h ago` : `${Math.round(ms / 86400e3)} d ago`;

/**
 * The lean.js an installed hook points to, if it is safe to run: a real LeanToken install
 * (package.json names this package) outside the project, so a cloned repository's settings
 * cannot make `lean doctor` execute a file the repository ships. Null otherwise.
 */
function trustedHookScript(command, cwd) {
  const script = [...command.matchAll(/"([^"]+)"/g)].map(m => m[1]).find(p => /[\\/]bin[\\/]lean\.js$/.test(p));
  if (!script) return null;
  try {
    const real = fs.realpathSync(script);
    if (real === fs.realpathSync(LEAN_JS)) return real;
    const rel = path.relative(fs.realpathSync(cwd), real);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return null; // inside the project
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(real), '..', 'package.json'), 'utf8'));
    return pkg.name === PKG.name ? real : null;
  } catch {
    return null;
  }
}

/**
 * Run the hook script once with a harmless payload (output below the pruning threshold, so nothing
 * is pruned or recorded), with this Node.js and no shell. Returns the measured round trip, including
 * Node.js start-up.
 */
function smokeTestHook(script, cwd) {
  const payload = JSON.stringify({ hook_event_name: 'PostToolUse', cwd, tool_name: 'Bash', tool_input: { command: 'echo ok' }, tool_response: { stdout: 'ok' } });
  const start = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [script, 'hook', 'claude'], { input: payload, encoding: 'utf8', timeout: 10000, cwd });
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  if (r.error || r.status !== 0) return { ok: false, ms, why: r.error ? r.error.code || r.error.message : `exit ${r.status}${r.stderr ? `: ${r.stderr.trim().split(/\r?\n/)[0]}` : ''}` };
  const out = (r.stdout || '').trim();
  if (out) { try { JSON.parse(out); } catch { return { ok: false, ms, why: 'printed non-JSON output' }; } }
  return { ok: true, ms };
}

/** Health check for this machine and the current project. */
function doctor(cwd = process.cwd()) {
  const checks = [];
  let section = '';
  const add = level => text => checks.push({ section, level, text, fix: (/\(run: ([^),]+)/.exec(text) || [])[1] || null });
  const ok = { push: add('ok') }, warn = { push: add('warn') }, bad = { push: add('bad') };

  section = 'Environment';
  const major = Number(process.versions.node.split('.')[0]);
  (major >= 18 ? ok : bad).push(`Node.js ${process.versions.node} (needs 18+)`);
  ok.push(`LeanToken ${PKG.version} (${installKind()}: ${path.dirname(path.dirname(LEAN_JS))})`);
  if (installKind() === 'npx') warn.push(`Running via npx: install globally for a lasting hook (run: npm i -g ${PKG.name})`);

  const which = spawnSync(process.platform === 'win32' ? 'where lean' : 'command -v lean', { shell: true, encoding: 'utf8' });
  if (which.status === 0) ok.push(`\`lean\` on PATH: ${which.stdout.trim().split(/\r?\n/)[0]}`);
  else warn.push('`lean` is not on PATH: tools told to run `lean prune` will fail');

  section = 'AI tools and directives';
  const shaper = new CognitiveShaper();
  const detected = shaper.detectHosts(cwd, os.homedir());
  ok.push(`Detected AI tools: ${Object.entries(detected).map(([k, why]) => `${k} (${why})`).join(', ')}`);
  const home = os.homedir();
  const directiveState = file => {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return text.includes(`Unified Agent Directive (v${DIRECTIVE_VERSION})`) ? 'current' : text.includes('Unified Agent Directive') ? 'outdated' : null;
  };
  for (const key of Object.keys(detected)) {
    const repoState = directiveState(path.join(cwd, HOSTS[key].repo));
    // A user-level directive (lean init --global) covers every project for that tool
    const globalFile = [].concat(HOSTS[key].global || []).find(r => directiveState(path.join(home, r)) === 'current');
    if (repoState === 'current') ok.push(`${HOSTS[key].repo}: directive current`);
    else if (repoState === 'outdated') warn.push(`${HOSTS[key].repo}: outdated directive (run: lean init)`);
    else if (globalFile) ok.push(`${HOSTS[key].label}: user-level directive current (~/${globalFile})`);
    else warn.push(`${HOSTS[key].repo}: no directive (run: lean init, or lean init --global)`);
  }

  if (detected.claude) {
    section = 'Claude Code hook';
    const readHooks = (file, event = 'PostToolUse') => {
      try { return (JSON.parse(fs.readFileSync(file, 'utf8')).hooks?.[event] || []).flatMap(g => g.hooks || []).filter(h => shaper.isOurHook(h)); } catch { return []; }
    };
    const localFile = path.join(cwd, '.claude', 'settings.local.json');
    const globalFile = path.join(home, '.claude', 'settings.json');
    const local = readHooks(localFile);
    const user = readHooks(globalFile);
    if (local.length && user.length) warn.push('Claude Code hook is installed both user-wide and in this project, so outputs are pruned twice (run: lean init, which removes the project copy)');
    const scope = local.length ? 'project' : 'user-level';
    const hooks = local.length ? local : user;
    if (!hooks.length) warn.push('Claude Code auto-prune hook not installed (run: lean init)');
    else {
      const fix = `lean init${scope === 'user-level' ? ' --global' : ''}`;
      const paths = [...hooks[0].command.matchAll(/"([^"]+)"/g)].map(m => m[1]);
      const missing = paths.filter(p => !fs.existsSync(p));
      if (missing.length) bad.push(`Claude hook points to missing files: ${missing.join(', ')} (run: ${fix})`);
      else if (!shaper.claudeHookCurrent(local.length ? localFile : globalFile)) warn.push(`Claude Code auto-prune hook (${scope}): command filters are from an older version (run: ${fix})`);
      else ok.push(`Claude Code auto-prune hook (${scope}): ${hooks.length} command filters, paths valid`);

      const file = local.length ? localFile : globalFile;
      const events = { PreToolUse: 'read guard', SessionStart: 'auto-learn at session start' };
      for (const [event, what] of Object.entries(events)) {
        if (readHooks(file, event).length) ok.push(`${event} hook (${what}): installed`);
        else warn.push(`${event} hook (${what}) not installed (run: ${fix})`);
      }
      if (!missing.length) {
        const script = trustedHookScript(hooks[0].command, cwd);
        const smoke = script ? smokeTestHook(script, cwd) : null;
        if (!smoke) warn.push(`Hook test run skipped: the hook does not point to a LeanToken install outside this project (run: ${fix})`);
        else if (smoke.ok) ok.push(`Hook test run: responded in ${Math.round(smoke.ms)} ms (measured now, includes Node.js start-up)`);
        else bad.push(`Hook test run failed after ${Math.round(smoke.ms)} ms: ${smoke.why} (run: ${fix})`);
      }
    }
  }

  section = 'This project';
  if (fs.existsSync(path.join(cwd, '.git'))) {
    const gi = fs.existsSync(path.join(cwd, '.gitignore')) ? fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8') : '';
    if (/^\.lean\/?\s*$/m.test(gi)) ok.push('.gitignore ignores .lean/');
    else warn.push('.gitignore does not ignore .lean/ (run: lean init)');
  }
  const logs = path.join(cwd, '.lean', 'logs');
  if (fs.existsSync(logs)) {
    const files = fs.readdirSync(logs);
    const bytes = files.reduce((n, f) => n + fs.statSync(path.join(logs, f)).size, 0);
    ok.push(`.lean/logs: ${files.length} raw logs, ${(bytes / 1024).toFixed(1)} KB`);
  }

  const memory = path.join(cwd, '.lean', 'MEMORY.md');
  if (fs.existsSync(memory)) ok.push(`.lean/MEMORY.md: updated ${ago(Date.now() - fs.statSync(memory).mtimeMs)}`);
  else if (detected.claude && fs.existsSync(path.join(cwd, '.lean'))) warn.push('.lean/MEMORY.md missing: no file map for the agent yet (run: lean learn)');

  const { Telemetry } = require('./telemetry');
  const t = Telemetry.load(cwd);
  if (t.totalPrunes) ok.push(`Measured so far: ${t.savedTokens.toLocaleString()} tokens saved in ${t.totalPrunes.toLocaleString()} prunes (-${Math.round((t.savedTokens / t.rawTokens) * 100)}%)${t.readGuard.guards ? `, ${t.readGuard.guards} read guards` : ''}`);

  const initialized = Object.keys(detected).some(key => directiveState(path.join(cwd, HOSTS[key].repo)) !== null);
  if (initialized && !loadProjects().includes(path.resolve(cwd))) warn.push('Not in the uninstall registry, so `lean uninstall` would skip it (run: lean init)');

  const order = { ok: 0, warn: 1, bad: 2 };
  const mark = { ok: '✓', warn: '!', bad: '✗' };
  const count = level => checks.filter(c => c.level === level).length;
  const sections = [...new Set(checks.map(c => c.section))];
  const lines = sections.flatMap(s => ['', `${s}:`, ...checks.filter(c => c.section === s)
    .sort((a, b) => order[a.level] - order[b.level])
    .map(c => `  ${mark[c.level]} ${c.text}`)]);
  const fixes = [...new Set(checks.filter(c => c.level !== 'ok' && c.fix).map(c => c.fix))];
  const summary = `${count('ok')} passed, ${count('warn')} warning${count('warn') === 1 ? '' : 's'}, ${count('bad')} failed`;
  const footer = ['', count('bad') ? `  ✗ ${summary}` : count('warn') ? `  ! ${summary}` : `  ✓ ${summary}: all good`,
    ...(fixes.length ? ['', 'To fix, run:', ...fixes.map(f => `  ${f}`)] : [])];
  return {
    success: count('bad') === 0,
    checks,
    summary: { ok: count('ok'), warn: count('warn'), bad: count('bad') },
    message: `⚡ LeanToken doctor v${PKG.version} (${process.platform}/${process.arch})\n${lines.concat(footer).join('\n')}`
  };
}

module.exports = { configDir, loadProjects, trackProject, untrackProject, uninstall, doctor, installKind };
