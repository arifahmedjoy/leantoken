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

/** Health check for this machine and the current project. */
function doctor(cwd = process.cwd()) {
  const ok = [], warn = [], bad = [];
  const major = Number(process.versions.node.split('.')[0]);
  (major >= 18 ? ok : bad).push(`Node.js ${process.versions.node} (needs 18+)`);
  ok.push(`LeanToken ${PKG.version} (${installKind()}: ${path.dirname(path.dirname(LEAN_JS))})`);
  if (installKind() === 'npx') warn.push(`Running via npx: install globally for a lasting hook: npm i -g ${PKG.name}`);

  const which = spawnSync(process.platform === 'win32' ? 'where lean' : 'command -v lean', { shell: true, encoding: 'utf8' });
  if (which.status === 0) ok.push(`\`lean\` on PATH: ${which.stdout.trim().split(/\r?\n/)[0]}`);
  else warn.push('`lean` is not on PATH: tools told to run `lean prune` will fail');

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
    const readHooks = file => {
      try { return (JSON.parse(fs.readFileSync(file, 'utf8')).hooks?.PostToolUse || []).flatMap(g => g.hooks || []).filter(h => shaper.isOurHook(h)); } catch { return []; }
    };
    let scope = 'project';
    let hooks = readHooks(path.join(cwd, '.claude', 'settings.local.json'));
    if (!hooks.length) { hooks = readHooks(path.join(home, '.claude', 'settings.json')); scope = 'user-level'; }
    if (!hooks.length) warn.push('Claude Code auto-prune hook not installed (run: lean init)');
    else {
      const paths = [...hooks[0].command.matchAll(/"([^"]+)"/g)].map(m => m[1]);
      const missing = paths.filter(p => !fs.existsSync(p));
      if (missing.length) bad.push(`Claude hook points to missing files: ${missing.join(', ')} (run: lean init${scope === 'user-level' ? ' --global' : ''})`);
      else ok.push(`Claude Code auto-prune hook (${scope}): ${hooks.length} command filters, paths valid`);
    }
  }

  if (fs.existsSync(path.join(cwd, '.git'))) {
    const gi = fs.existsSync(path.join(cwd, '.gitignore')) ? fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8') : '';
    (/^\.lean\/?\s*$/m.test(gi) ? ok : warn).push(`.gitignore ${/^\.lean\/?\s*$/m.test(gi) ? 'ignores' : 'does not ignore'} .lean/`);
  }
  const logs = path.join(cwd, '.lean', 'logs');
  if (fs.existsSync(logs)) {
    const files = fs.readdirSync(logs);
    const bytes = files.reduce((n, f) => n + fs.statSync(path.join(logs, f)).size, 0);
    ok.push(`.lean/logs: ${files.length} raw logs, ${(bytes / 1024).toFixed(1)} KB`);
  }

  const lines = [
    ...ok.map(l => `  ✓ ${l}`),
    ...warn.map(l => `  ! ${l}`),
    ...bad.map(l => `  ✗ ${l}`)
  ];
  return { success: bad.length === 0, message: `⚡ LeanToken doctor (${process.platform}/${process.arch})\n${lines.join('\n')}` };
}

module.exports = { configDir, loadProjects, trackProject, untrackProject, uninstall, doctor, installKind };
