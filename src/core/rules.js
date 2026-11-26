const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const START = '<!-- leantoken:start -->';
const END = '<!-- leantoken:end -->';
const LEGACY_HEADER = '# LeanToken Unified Agent Directive (v0.1.0)';
const LEGACY_LAST_LINE = 'Full unpruned command logs are stored at';
const fwd = p => p.split(path.sep).join('/');
const LEAN_JS = fwd(path.resolve(__dirname, '..', '..', 'bin', 'lean.js'));
const HOOK_MARK = 'hook claude';
// Version of the directive text, not of the package: bump only when the text changes,
// so a package release does not rewrite instruction files in every repo.
const DIRECTIVE_VERSION = '0.3.0';

/**
 * Instruction files per AI host. One host may serve several editors:
 * e.g. Copilot instructions are read in VS Code, Visual Studio, JetBrains IDEs (incl. Android Studio).
 * `repoSignals`: paths whose presence (with non-LeanToken content) shows the repo uses the host.
 * `homeSignals`: paths under the user's home showing the host is installed on this machine.
 * `front` is written only when the file is created.
 */
const HOSTS = {
  claude: {
    repo: 'CLAUDE.md', global: '.claude/CLAUDE.md', label: 'Claude Code',
    repoSignals: ['CLAUDE.md', '.claude'], homeSignals: ['.claude']
  },
  agents: {
    repo: 'AGENTS.md', global: ['.codex/AGENTS.md', '.config/opencode/AGENTS.md'],
    label: 'AGENTS.md (Codex, OpenCode, Copilot agent, Cursor, Zed, Antigravity, Gemini in Android Studio)',
    repoSignals: ['AGENTS.md', '.codex', '.opencode', 'opencode.json'],
    homeSignals: ['.codex', '.config/opencode', '.cursor', '.gemini/antigravity', '.config/zed']
  },
  gemini: {
    repo: 'GEMINI.md', global: '.gemini/GEMINI.md', label: 'Gemini CLI / Code Assist / Antigravity',
    repoSignals: ['GEMINI.md', '.gemini'], homeSignals: ['.gemini']
  },
  copilot: {
    repo: '.github/copilot-instructions.md', global: '.copilot/copilot-instructions.md', label: 'GitHub Copilot (VS Code, Visual Studio, JetBrains, Android Studio)',
    repoSignals: ['.github/copilot-instructions.md', '.github/instructions', '.github/prompts'],
    homeSignals: ['.copilot', '.config/github-copilot', 'AppData/Local/github-copilot', '.vscode/extensions/github.copilot*']
  },
  cursor: {
    repo: '.cursorrules', label: 'Cursor',
    repoSignals: ['.cursorrules', '.cursor'], homeSignals: ['.cursor']
  },
  windsurf: {
    repo: '.windsurf/rules/leantoken.md', front: '---\ntrigger: always_on\n---\n\n', label: 'Windsurf',
    repoSignals: ['.windsurf', '.windsurfrules'], homeSignals: ['.codeium/windsurf']
  },
  cline: {
    repo: '.clinerules/leantoken.md', label: 'Cline',
    repoSignals: ['.clinerules'], homeSignals: ['.vscode/extensions/saoudrizwan.claude-dev*']
  },
  junie: {
    repo: '.junie/guidelines.md', label: 'JetBrains Junie',
    repoSignals: ['.junie'], homeSignals: []
  }
};

const GITIGNORE_MARK = '# LeanToken (removed by `lean remove`)';
const GITIGNORE_LINES = ['.lean/', '.claude/settings.local.json'];

// Tool names accepted by --only that map onto a shared host (and, for --global, one of its files)
const ALIASES = {
  opencode: { key: 'agents', global: '.config/opencode/AGENTS.md' },
  codex: { key: 'agents', global: '.codex/AGENTS.md' },
  antigravity: { key: 'gemini' },
  vscode: { key: 'copilot' }
};

/** Expand --only names: returns host keys plus, per key, the global files to limit to (absent = all). */
function expandOnly(names) {
  const keys = [];
  const pick = {};
  const unknown = [];
  for (const n of names) {
    const a = ALIASES[n];
    const key = HOSTS[n] ? n : a && a.key;
    if (!key) { unknown.push(n); continue; }
    if (!keys.includes(key)) keys.push(key);
    if (HOSTS[n] || !a.global) pick[key] = null;
    else if (pick[key] !== null) (pick[key] = pick[key] || []).push(a.global);
  }
  return { keys, pick, unknown };
}

// Claude Code runs the hook only for commands whose output the pruner can shrink (no Node start-up for
// cat/grep/sed, `git log`, `python script.py`, ...). Claude Code checks each subcommand of a chained
// command, and `x *` also matches bare `x`. Keep in sync with the pruner's routes (pruner.js).
const HOOK_PREFIXES = {
  Bash: ['git status', 'git diff', 'ls', 'tree', 'npm', 'pnpm', 'yarn', 'bun', 'npx', 'bunx', 'pytest', 'vitest', 'jest', 'phpunit', 'rspec',
    'python -m', 'python3 -m', 'go test', 'go build', 'cargo', 'dotnet', 'gradle', 'gradlew', './gradlew', 'mvn', './mvnw', 'make', 'cmake',
    'tsc', 'pip', 'pip3', 'uv', 'docker build', 'docker compose', 'composer', 'bundle', 'deno test', 'mix test', 'swift build'],
  PowerShell: ['git status', 'git diff', 'ls', 'dir', 'tree', 'npm', 'pnpm', 'yarn', 'npx', 'pytest', 'python -m', 'py -m', 'go test', 'go build',
    'cargo', 'dotnet', 'gradle', './gradlew', '.\\gradlew', 'mvn', 'pip', 'uv', 'docker build', 'docker compose']
};

/**
 * CognitiveShaper: Injects curated, non-conflicting prompt shaper
 * Combines Ponytail's minimal-diff discipline, Caveman's concise output,
 * and strict Anti-Hallucination rules into a single ~300 token system block.
 */
class CognitiveShaper {
  constructor() {
    this.ruleBlock = this.buildRules(false);
  }

  buildRules(hooked) {
    const shell = hooked
      ? `- A LeanToken hook already prunes noisy output (tests, builds, \`git status\`/\`git diff\`, listings); do not add \`lean prune\`.`
      : `- Run noisy commands through LeanToken: \`lean prune <command>\` (test runners, builds, installs, \`git status\`, \`git diff\`, recursive listings). Run commands directly when you need their output verbatim.`;
    return `
${START}
# LeanToken Unified Agent Directive (v${DIRECTIVE_VERSION})
## 1. Minimal Diffs (YAGNI)
- Make only the edits the request needs: no unrequested dependencies, rewrites or abstractions.
- Keep existing conventions, names and formatting.

## 2. Dense Replies
- Concise, high-signal language; no preamble or recap.
- Answer as: (1) Root Cause, (2) Action Taken, (3) Verification.

## 3. Grounding
- Cite the exact files, lines and identifiers you read.
- Never assume a file or API exists; check the code or tests first.

## 4. Reads (the largest token cost)
- File over ~300 lines: run \`lean symbols <file>\` first (Markdown: headings with line ranges; code: signatures), then read only the range you need.
- Use the file maps in \`.lean/MEMORY.md\` when it exists. Do not re-read unchanged files already in context.
- Keep search output small: specific patterns, \`grep -l\`, \`head\`.

## 5. Shell Output
${shell}
- If pruned output is not enough, read the raw log named in its \`[LeanToken: ...]\` footer.
${END}
`.trim();
  }

  getRules() {
    return this.ruleBlock;
  }

  /** Insert, upgrade (legacy v0.1.0 or marked block) or leave the directive in one file's text. */
  applyBlock(existing, block) {
    const s = existing.indexOf(START);
    const e = existing.indexOf(END);
    if (s !== -1 && e > s) {
      const updated = existing.slice(0, s) + block + existing.slice(e + END.length);
      return updated === existing ? null : updated;
    }
    const legacy = this.findLegacy(existing);
    if (legacy) return existing.slice(0, legacy[0]) + block + existing.slice(legacy[1]);
    if (existing.includes(LEGACY_HEADER)) return null; // hand-edited legacy block: leave it
    return existing ? `${existing.trimEnd()}\n\n${block}\n` : null;
  }

  findLegacy(text) {
    const ls = text.indexOf(LEGACY_HEADER);
    if (ls === -1) return null;
    const lastLine = text.indexOf(LEGACY_LAST_LINE, ls);
    if (lastLine === -1) return null;
    const lineEnd = text.indexOf('\n', lastLine);
    return [ls, lineEnd === -1 ? text.length : lineEnd];
  }

  /** Text with any LeanToken block (marked or legacy) and LeanToken front matter removed. */
  stripBlock(text, front = '') {
    let out = text;
    const s = out.indexOf(START);
    const e = out.indexOf(END);
    if (s !== -1 && e > s) out = out.slice(0, s) + out.slice(e + END.length);
    const legacy = this.findLegacy(out);
    if (legacy) out = out.slice(0, legacy[0]) + out.slice(legacy[1]);
    if (front && out.startsWith(front.trim())) out = out.slice(front.trim().length);
    return out;
  }

  /** True when a path exists and holds something other than LeanToken's own output. */
  hasForeignContent(p, depth = 0) {
    try {
      const st = fs.statSync(p);
      if (st.isFile()) {
        const text = fs.readFileSync(p, 'utf8');
        const front = Object.values(HOSTS).find(h => p.endsWith(path.normalize(h.repo)))?.front || '';
        return this.stripBlock(text, front).trim().length > 0;
      }
      if (depth > 3) return true;
      return fs.readdirSync(p).some(name => this.hasForeignContent(path.join(p, name), depth + 1));
    } catch {
      return false;
    }
  }

  homeHas(home, signal) {
    if (!signal.endsWith('*')) return fs.existsSync(path.join(home, signal));
    const dir = path.join(home, path.dirname(signal));
    const prefix = path.basename(signal).slice(0, -1);
    try { return fs.readdirSync(dir).some(n => n.startsWith(prefix)); } catch { return false; }
  }

  /** Which hosts this repo/machine actually uses, with the reason. AGENTS.md is the fallback. */
  detectHosts(cwd, home) {
    const found = {};
    for (const [key, h] of Object.entries(HOSTS)) {
      const repo = h.repoSignals.find(s => this.hasForeignContent(path.join(cwd, s)));
      if (repo) { found[key] = `repo has ${repo}`; continue; }
      const machine = h.homeSignals.find(s => this.homeHas(home, s));
      if (machine) found[key] = `installed (~/${machine.replace(/\*$/, '')})`;
    }
    if (!Object.keys(found).length) found.agents = 'universal fallback';
    return found;
  }

  resolveTargets(isGlobal, keys, cwd = process.cwd(), pick = {}) {
    const base = isGlobal ? os.homedir() : cwd;
    const targets = [];
    for (const key of keys) {
      const host = HOSTS[key];
      const rel = isGlobal ? host.global : host.repo;
      for (const r of [].concat(rel || [])) if (!isGlobal || !pick[key] || pick[key].includes(r)) targets.push({ key, file: path.join(base, r), front: host.front || '' });
    }
    return targets;
  }

  hookGroups() {
    // Absolute Node path: editors launched from a desktop (macOS Dock, Windows Start) often lack nvm/Homebrew PATH
    const command = `"${fwd(process.execPath)}" "${LEAN_JS}" ${HOOK_MARK}`;
    const handler = rule => ({ type: 'command', if: rule, command, timeout: 10 });
    return [
      ...Object.entries(HOOK_PREFIXES).map(([tool, prefixes]) => ({
        matcher: tool, hooks: prefixes.map(p => handler(`${tool}(${p} *)`))
      })),
      // Feedback signal: the agent opened a raw log, so pruning was too aggressive for that command
      { matcher: 'Read', hooks: [handler('Read(**/.lean/logs/**)')] }
    ];
  }

  isOurHook(h) {
    return h && typeof h.command === 'string' && h.command.includes(HOOK_MARK) && /lean/.test(h.command);
  }

  withoutOurHooks(list) {
    return (Array.isArray(list) ? list : [])
      .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !this.isOurHook(h)) }))
      .filter(g => g.hooks.length > 0);
  }

  readSettings(settingsPath) {
    if (!fs.existsSync(settingsPath)) return {};
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}'); // throws on invalid JSON: never overwrite it
  }

  hasClaudeHook(settingsPath) {
    try {
      const list = (this.readSettings(settingsPath).hooks || {}).PostToolUse || [];
      return list.some(g => (g.hooks || []).some(h => this.isOurHook(h)));
    } catch {
      return false;
    }
  }

  /** True when the installed hook has this version's command filters (paths are checked separately). */
  claudeHookCurrent(settingsPath) {
    const filters = groups => groups.map(g => `${g.matcher}:${(g.hooks || []).filter(h => this.isOurHook(h)).map(h => h.if).join(',')}`).join('|');
    try {
      const list = (this.readSettings(settingsPath).hooks || {}).PostToolUse || [];
      const ours = list.filter(g => (g.hooks || []).some(h => this.isOurHook(h)));
      return filters(ours) === filters(this.hookGroups());
    } catch {
      return false;
    }
  }

  /** Merge the PostToolUse prune hook into a Claude Code settings file. Returns 'added' | 'updated' | 'unchanged' | 'error'. */
  installClaudeHook(settingsPath) {
    let settings;
    try { settings = this.readSettings(settingsPath); } catch { return 'error'; }
    settings.hooks = settings.hooks || {};
    const current = settings.hooks.PostToolUse || [];
    const ours = current.filter(g => (g.hooks || []).some(h => this.isOurHook(h)));
    const wanted = this.hookGroups();
    if (JSON.stringify(ours) === JSON.stringify(wanted)) return 'unchanged';
    settings.hooks.PostToolUse = this.withoutOurHooks(current).concat(wanted);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    return ours.length ? 'updated' : 'added';
  }

  removeClaudeHook(settingsPath) {
    let settings;
    try { settings = this.readSettings(settingsPath); } catch { return false; }
    const list = settings.hooks && settings.hooks.PostToolUse;
    if (!list || !list.some(g => (g.hooks || []).some(h => this.isOurHook(h)))) return false;
    settings.hooks.PostToolUse = this.withoutOurHooks(list);
    if (!settings.hooks.PostToolUse.length) delete settings.hooks.PostToolUse;
    if (!Object.keys(settings.hooks).length) delete settings.hooks;
    if (!Object.keys(settings).length && path.basename(settingsPath) === 'settings.local.json') {
      fs.unlinkSync(settingsPath);
      try { fs.rmdirSync(path.dirname(settingsPath)); } catch { /* .claude/ still holds other files */ }
    }
    else fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    return true;
  }

  /** Remove the directive from a file; delete the file (and empty parent dirs up to base) if nothing else is left. */
  removeFromFile(file, front, base) {
    if (!fs.existsSync(file)) return null;
    const text = fs.readFileSync(file, 'utf8');
    const stripped = this.stripBlock(text, front);
    if (stripped === text) return null;
    if (stripped.trim()) {
      fs.writeFileSync(file, `${stripped.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`, 'utf8');
      return 'cleaned';
    }
    fs.unlinkSync(file);
    for (let dir = path.dirname(file); dir.startsWith(base) && dir !== base; dir = path.dirname(dir)) {
      try { fs.rmdirSync(dir); } catch { break; } // stops at the first non-empty directory
    }
    return 'deleted';
  }

  ensureGitignore(cwd, lines) {
    if (!fs.existsSync(path.join(cwd, '.git'))) return [];
    const p = path.join(cwd, '.gitignore');
    const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    const rows = existing.split(/\r?\n/);
    const have = new Set(rows.map(l => l.trim()));
    const missing = lines.filter(l => !have.has(l));
    if (!missing.length) return [];
    // Lines go under a marker so `lean remove` deletes only what LeanToken added
    const at = rows.findIndex(l => l.trim() === GITIGNORE_MARK);
    const updated = at >= 0
      ? [...rows.slice(0, at + 1), ...missing, ...rows.slice(at + 1)].join('\n')
      : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${GITIGNORE_MARK}\n${missing.join('\n')}\n`;
    fs.writeFileSync(p, updated, 'utf8');
    return missing;
  }

  /** Delete the lines ensureGitignore added (those under its marker); delete .gitignore if nothing else is left. */
  removeGitignore(base) {
    const p = path.join(base, '.gitignore');
    if (!fs.existsSync(p)) return null;
    const rows = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    const at = rows.findIndex(l => l.trim() === GITIGNORE_MARK);
    if (at < 0) return null;
    let end = at + 1;
    while (end < rows.length && GITIGNORE_LINES.includes(rows[end].trim())) end++;
    const rest = [...rows.slice(0, at), ...rows.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (rest) { fs.writeFileSync(p, `${rest}\n`, 'utf8'); return 'cleaned'; }
    fs.unlinkSync(p);
    return 'deleted';
  }

  init(options = {}) {
    const cwd = process.cwd();
    const home = os.homedir();
    const isGlobal = !!options.global;
    const dryRun = !!options.dryRun;
    const rel = f => fwd(path.relative(cwd, f) || f);

    let chosen;
    let pick = {};
    if (options.only && options.only.length) {
      const ex = expandOnly(options.only);
      if (ex.unknown.length) {
        return { success: false, modified: [], message: `Error: unknown host(s): ${ex.unknown.join(', ')}. Valid: ${[...Object.keys(HOSTS), ...Object.keys(ALIASES)].join(', ')}` };
      }
      chosen = Object.fromEntries(ex.keys.map(k => [k, 'requested']));
      pick = ex.pick;
    } else if (options.all) {
      chosen = Object.fromEntries(Object.keys(HOSTS).map(k => [k, 'all']));
    } else {
      chosen = this.detectHosts(cwd, home);
    }
    const auto = !(options.only && options.only.length) && !options.all;
    const targets = this.resolveTargets(isGlobal, Object.keys(chosen), cwd, pick);
    // npx runs from a temporary cache: a hook pointing there would break once the cache is cleared
    const ephemeral = /[\\/]_npx[\\/]/.test(LEAN_JS);
    const wantsHook = options.hooks !== false && !!chosen.claude && !ephemeral;
    const settingsPath = isGlobal ? path.join(home, '.claude', 'settings.json') : path.join(cwd, '.claude', 'settings.local.json');

    if (dryRun) {
      const lines = targets.map(t => `  ${rel(t.file)}  [${HOSTS[t.key].label}; ${chosen[t.key]}]`);
      if (wantsHook) lines.push(`  ${rel(settingsPath)}  [Claude Code auto-prune hook]`);
      return { success: true, modified: [], message: `[Dry Run] Would configure:\n${lines.join('\n')}\n\nContent:\n${this.buildRules(false)}` };
    }

    // Hook first: the Claude directive text depends on whether pruning is automatic.
    // A user-wide hook already covers this project: a second, project-level copy would run every prune twice.
    let hookStatus = 'skipped';
    const globalSettings = path.join(home, '.claude', 'settings.json');
    if (wantsHook && !isGlobal && this.hasClaudeHook(globalSettings)) {
      hookStatus = 'user-wide';
      try { this.removeClaudeHook(settingsPath); } catch { /* leave an unreadable local file alone */ }
    } else if (wantsHook) {
      try { hookStatus = this.installClaudeHook(settingsPath); } catch { hookStatus = 'error'; }
    }
    const hooked = ['added', 'updated', 'unchanged', 'user-wide'].includes(hookStatus);

    const modified = [];
    const failed = [];
    for (const t of targets) {
      // Global: only configure tools that are installed (their config dir exists)
      if (isGlobal && t.key !== 'claude' && !fs.existsSync(path.dirname(t.file))) continue;
      try {
        const block = this.buildRules(t.key === 'claude' && hooked);
        const existing = fs.existsSync(t.file) ? fs.readFileSync(t.file, 'utf8') : '';
        const updated = existing ? this.applyBlock(existing, block) : `${t.front}${block}\n`;
        if (updated === null) continue;
        fs.mkdirSync(path.dirname(t.file), { recursive: true });
        fs.writeFileSync(t.file, updated, 'utf8');
        modified.push(rel(t.file));
      } catch {
        failed.push(rel(t.file));
      }
    }

    // Auto mode: delete files LeanToken created earlier for hosts this repo/machine does not use
    const removed = [];
    if (auto && !isGlobal) {
      for (const key of Object.keys(HOSTS).filter(k => !chosen[k])) {
        for (const t of this.resolveTargets(false, [key])) {
          if (!this.hasForeignContent(t.file) && this.removeFromFile(t.file, t.front, cwd)) removed.push(rel(t.file));
        }
      }
    }

    const ignored = isGlobal ? [] : this.ensureGitignore(cwd, ['.lean/', ...(wantsHook ? ['.claude/settings.local.json'] : [])]);
    const onPath = spawnSync('lean --version', { shell: true, encoding: 'utf8' }).status === 0;
    const out = [
      '⚡ LeanToken initialized successfully!',
      `  ✓ Hosts: ${Object.entries(chosen).map(([k, why]) => `${k} (${why})`).join(', ')}`,
      `  ✓ Directive written/upgraded: ${modified.join(', ') || 'already up to date'}`,
      !wantsHook ? '  - Claude Code hook: skipped'
        : hookStatus === 'user-wide' ? `  ✓ Claude Code auto-prune hook: installed user-wide (~/.claude/settings.json)${this.claudeHookCurrent(globalSettings) ? '' : '; outdated, run: lean init --global'}`
          : `  ${hooked ? '✓' : '✗'} Claude Code auto-prune hook (${rel(settingsPath)}): ${hookStatus}`
    ];
    if (ephemeral && chosen.claude && options.hooks !== false) {
      out.push('  ! Run via npx, so no auto-prune hook was installed. For the hook: npm i -g @arifahmedjoy/leantoken && lean init');
    }
    if (removed.length) out.push(`  ✓ Removed unused LeanToken files: ${removed.join(', ')}`);
    if (ignored.length) out.push(`  ✓ .gitignore += ${ignored.join(', ')}`);
    if (failed.length) out.push(`  ✗ Could not write: ${failed.join(', ')}`);
    if (auto) out.push('  i Other tools: lean init --only=<hosts> or --all');
    if (!onPath && Object.keys(chosen).some(k => k !== 'claude' || !hooked)) {
      out.push('  ! `lean` is not on PATH: agents told to run `lean prune` will fail. Install globally (npm i -g) or run `npm link` in the LeanToken repo.');
    }

    return { success: failed.length === 0 && hookStatus !== 'error', modified, removed, message: out.join('\n') };
  }

  /** Undo init: strip directives, delete files that only held them, remove the hook; --purge also deletes .lean/. */
  remove(options = {}) {
    const isGlobal = !!options.global;
    const base = isGlobal ? os.homedir() : (options.cwd || process.cwd());
    const ex = expandOnly(options.only && options.only.length ? options.only : Object.keys(HOSTS));
    if (ex.unknown.length) return { success: false, message: `Error: unknown host(s): ${ex.unknown.join(', ')}` };
    const keys = ex.keys;
    const rel = f => fwd(path.relative(base, f) || f);
    const changes = [];
    for (const t of this.resolveTargets(isGlobal, keys, base, ex.pick)) {
      const r = this.removeFromFile(t.file, t.front, base);
      if (r) changes.push(`${rel(t.file)} (${r})`);
    }
    if (keys.includes('claude')) {
      const settingsPath = isGlobal ? path.join(base, '.claude', 'settings.json') : path.join(base, '.claude', 'settings.local.json');
      if (this.removeClaudeHook(settingsPath)) changes.push(`${rel(settingsPath)} (hook removed)`);
    }
    if (!isGlobal && !(options.only && options.only.length)) {
      const gi = this.removeGitignore(base);
      if (gi) changes.push(`.gitignore (${gi})`);
    }
    if (options.purge && !isGlobal && fs.existsSync(path.join(base, '.lean'))) {
      fs.rmSync(path.join(base, '.lean'), { recursive: true, force: true });
      changes.push('.lean/ (deleted)');
    }
    return { success: true, message: `⚡ LeanToken removed:\n${changes.map(c => `  ✓ ${c}`).join('\n') || '  nothing to remove'}` };
  }
}

module.exports = { CognitiveShaper, HOSTS, HOOK_PREFIXES, DIRECTIVE_VERSION };
