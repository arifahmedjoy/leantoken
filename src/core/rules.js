const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const START = '<!-- leantoken:start -->';
const END = '<!-- leantoken:end -->';
const LEGACY_HEADER = '# LeanToken Unified Agent Directive (v0.1.0)';
const LEGACY_LAST_LINE = 'Full unpruned command logs are stored at';
const LEAN_JS = path.resolve(__dirname, '..', '..', 'bin', 'lean.js').replace(/\\/g, '/');
const HOOK_MARK = 'hook claude';

/**
 * Instruction files per AI host. One host may serve several editors:
 * e.g. Copilot instructions are read in VS Code, Visual Studio, JetBrains IDEs (incl. Android Studio).
 * `front` is written only when the file is created.
 */
const HOSTS = {
  claude:   { repo: 'CLAUDE.md', global: '.claude/CLAUDE.md', label: 'Claude Code' },
  agents:   { repo: 'AGENTS.md', global: ['.codex/AGENTS.md', '.config/opencode/AGENTS.md'], label: 'AGENTS.md (Codex, OpenCode, Copilot agent, Cursor, Zed, Antigravity, Gemini in Android Studio)' },
  gemini:   { repo: 'GEMINI.md', global: '.gemini/GEMINI.md', label: 'Gemini CLI / Code Assist / Antigravity' },
  copilot:  { repo: '.github/copilot-instructions.md', label: 'GitHub Copilot (VS Code, Visual Studio, JetBrains, Android Studio)' },
  cursor:   { repo: '.cursorrules', label: 'Cursor' },
  windsurf: { repo: '.windsurf/rules/leantoken.md', front: '---\ntrigger: always_on\n---\n\n', label: 'Windsurf' },
  cline:    { repo: '.clinerules/leantoken.md', label: 'Cline' },
  junie:    { repo: '.junie/guidelines.md', label: 'JetBrains Junie' }
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
      ? `- A LeanToken hook already prunes noisy output (tests, \`git status\`/\`git diff\`, listings). Do not wrap commands in \`lean prune\` yourself.`
      : `- Run noisy commands through LeanToken: \`lean prune <command>\` (test runners, builds, \`git status\`, \`git diff\`, recursive listings). Run commands directly when you need their output verbatim.`;
    return `
${START}
# LeanToken Unified Agent Directive (v0.2.0)
## 1. Surgical Minimal Diffs (YAGNI)
- Make ONLY the minimum edits required to satisfy the request.
- Never add unsolicited dependencies, architectural rewrites, or speculative abstractions.
- Preserve existing coding conventions, variable names, and formatting.

## 2. High-Density Telegraphic Responses
- Reply in concise, high-signal language.
- Omit conversational preamble ("Sure!", "I have fixed...", "Here is the summary").
- Format answers as: (1) Root Cause, (2) Action Taken, (3) Exact Verification.

## 3. Evidence-Based Grounding
- Quote exact line numbers and identifiers from files read.
- Never assume a file exists or an API signature is valid without checking.
- If unsure, inspect the code or test first.

## 4. Shell Output Discipline
${shell}
- If pruned output is not enough, read the full raw output in \`.lean/logs/last-command.log\`.
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
    const ls = existing.indexOf(LEGACY_HEADER);
    if (ls !== -1) {
      const lastLine = existing.indexOf(LEGACY_LAST_LINE, ls);
      if (lastLine === -1) return null; // hand-edited legacy block: leave it
      const lineEnd = existing.indexOf('\n', lastLine);
      const le = lineEnd === -1 ? existing.length : lineEnd;
      return existing.slice(0, ls) + block + existing.slice(le);
    }
    return existing ? `${existing.trimEnd()}\n\n${block}\n` : null;
  }

  resolveTargets(isGlobal, only) {
    const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
    const base = isGlobal ? home : process.cwd();
    const keys = only && only.length ? only : Object.keys(HOSTS);
    const unknown = keys.filter(k => !HOSTS[k]);
    const targets = [];
    for (const key of keys.filter(k => HOSTS[k])) {
      const host = HOSTS[key];
      const rel = isGlobal ? host.global : host.repo;
      for (const r of [].concat(rel || [])) targets.push({ key, file: path.join(base, r), front: host.front || '' });
    }
    return { targets, unknown };
  }

  /** Merge the PostToolUse prune hook into a Claude Code settings file. Returns 'added' | 'updated' | 'unchanged' | 'error'. */
  installClaudeHook(settingsPath) {
    let settings = {};
    try {
      if (fs.existsSync(settingsPath)) settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
    } catch {
      return 'error'; // never overwrite a settings file we cannot parse
    }
    const command = `node "${LEAN_JS}" ${HOOK_MARK}`;
    const entry = { matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command, timeout: 10 }] };
    settings.hooks = settings.hooks || {};
    const list = Array.isArray(settings.hooks.PostToolUse) ? settings.hooks.PostToolUse : [];
    const isOurs = h => typeof h.command === 'string' && h.command.includes(HOOK_MARK) && /lean/.test(h.command);
    const ours = list.filter(g => (g.hooks || []).some(isOurs));
    if (ours.length === 1 && JSON.stringify(ours[0]) === JSON.stringify(entry)) return 'unchanged';
    settings.hooks.PostToolUse = list.filter(g => !(g.hooks || []).some(isOurs)).concat(entry);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    return ours.length ? 'updated' : 'added';
  }

  ensureGitignore(cwd, lines) {
    if (!fs.existsSync(path.join(cwd, '.git'))) return [];
    const p = path.join(cwd, '.gitignore');
    const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    const have = new Set(existing.split(/\r?\n/).map(l => l.trim()));
    const missing = lines.filter(l => !have.has(l));
    if (missing.length) fs.writeFileSync(p, `${existing.trimEnd()}${existing ? '\n' : ''}${missing.join('\n')}\n`, 'utf8');
    return missing;
  }

  init(options = {}) {
    const cwd = process.cwd();
    const isGlobal = !!options.global;
    const dryRun = !!options.dryRun;
    const { targets, unknown } = this.resolveTargets(isGlobal, options.only);
    if (unknown.length) {
      return { success: false, modified: [], message: `Error: unknown host(s): ${unknown.join(', ')}. Valid: ${Object.keys(HOSTS).join(', ')}` };
    }
    const home = process.env.USERPROFILE || process.env.HOME || cwd;
    const wantsHook = options.hooks !== false && targets.some(t => t.key === 'claude');
    const settingsPath = isGlobal ? path.join(home, '.claude', 'settings.json') : path.join(cwd, '.claude', 'settings.local.json');
    const rel = f => path.relative(cwd, f) || f;

    if (dryRun) {
      const lines = targets.map(t => `  ${rel(t.file)}  [${HOSTS[t.key].label}]`);
      if (wantsHook) lines.push(`  ${rel(settingsPath)}  [Claude Code PostToolUse auto-prune hook]`);
      return { success: true, modified: [], message: `[Dry Run] Would configure:\n${lines.join('\n')}\n\nContent:\n${this.buildRules(false)}` };
    }

    // Hook first: the Claude directive text depends on whether pruning is automatic
    let hookStatus = 'skipped';
    if (wantsHook) {
      try { hookStatus = this.installClaudeHook(settingsPath); } catch { hookStatus = 'error'; }
    }
    const hooked = hookStatus === 'added' || hookStatus === 'updated' || hookStatus === 'unchanged';

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

    // Also initialize .lean directory
    const leanDir = path.join(cwd, '.lean');
    const logsDir = path.join(leanDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const memoryPath = path.join(leanDir, 'MEMORY.md');
    if (!fs.existsSync(memoryPath)) {
      fs.writeFileSync(memoryPath, `# Project Memory & Footguns\n<!-- Auto-updated by lean learn -->\n\n## Known Quirks\n- None recorded yet.\n`, 'utf8');
    }
    const ignored = isGlobal ? [] : this.ensureGitignore(cwd, ['.lean/', '.claude/settings.local.json']);

    const onPath = spawnSync('lean --version', { shell: true, encoding: 'utf8' }).status === 0;
    const out = [
      '⚡ LeanToken initialized successfully!',
      `  ✓ Directive written/upgraded: ${modified.join(', ') || 'already up to date'}`,
      wantsHook ? `  ${hooked ? '✓' : '✗'} Claude Code auto-prune hook (${rel(settingsPath)}): ${hookStatus}` : '  - Claude Code hook: skipped',
      '  ✓ Spooled: .lean/logs/ & .lean/MEMORY.md'
    ];
    if (ignored.length) out.push(`  ✓ .gitignore += ${ignored.join(', ')}`);
    if (failed.length) out.push(`  ✗ Could not write: ${failed.join(', ')}`);
    if (!onPath) out.push('  ! `lean` is not on PATH: agents told to run `lean prune` will fail. Install globally (npm i -g) or run `npm link` in the LeanToken repo.');

    return { success: failed.length === 0 && hookStatus !== 'error', modified, message: out.join('\n') };
  }
}

module.exports = { CognitiveShaper, HOSTS };
