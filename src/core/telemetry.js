const fs = require('fs');
const path = require('path');

const { version: VERSION } = require('../../package.json');

/**
 * Telemetry: measured pruning counters per project, in <project>/.lean/stats.json.
 * Every number shown is measured; nothing is estimated or hard-coded.
 */
class Telemetry {
  static getStatsPath(cwd = process.cwd()) {
    return path.join(cwd, '.lean', 'stats.json');
  }

  static empty() {
    return {
      version: VERSION,
      totalPrunes: 0,
      rawTokens: 0,
      prunedTokens: 0,
      savedTokens: 0,
      totalLatencyMs: 0,
      byRoute: {},
      readGuard: { guards: 0, fullTokens: 0, outlineTokens: 0 },
      lastUpdated: null
    };
  }

  static load(cwd) {
    try {
      const data = JSON.parse(fs.readFileSync(this.getStatsPath(cwd), 'utf8'));
      return { ...this.empty(), ...data, byRoute: data.byRoute || {}, readGuard: { ...this.empty().readGuard, ...data.readGuard } };
    } catch {
      return this.empty();
    }
  }

  /** `cwd` is the project the output belongs to (the hook's payload cwd), not the process cwd. */
  static recordPrune({ route = 'other', rawTokens, prunedTokens, savedTokens, latencyMs, cwd }) {
    const data = this.load(cwd);
    data.version = VERSION;
    data.totalPrunes += 1;
    data.rawTokens += rawTokens;
    data.prunedTokens += prunedTokens;
    data.savedTokens += savedTokens;
    data.totalLatencyMs += latencyMs;
    const r = data.byRoute[route] || { prunes: 0, rawTokens: 0, savedTokens: 0 };
    r.prunes += 1;
    r.rawTokens += rawTokens;
    r.savedTokens += savedTokens;
    data.byRoute[route] = r;
    this.save(cwd, data);
  }

  /** The read guard denied a whole-file Read and returned the outline instead. */
  static recordGuard({ fullTokens = 0, outlineTokens = 0, cwd }) {
    const data = this.load(cwd);
    data.version = VERSION;
    data.readGuard.guards += 1;
    data.readGuard.fullTokens += fullTokens;
    data.readGuard.outlineTokens += outlineTokens;
    this.save(cwd, data);
  }

  static save(cwd, data) {
    data.lastUpdated = new Date().toISOString();
    const file = this.getStatsPath(cwd);
    try {
      if (!safeDir(path.dirname(file), cwd || process.cwd())) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Write then rename: a crash or a concurrent hook never leaves a half-written file
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, file);
    } catch {
      // telemetry is best-effort
    }
  }

  static getStats(cwd) {
    const data = this.load(cwd);
    const avgLatency = data.totalPrunes > 0 ? (data.totalLatencyMs / data.totalPrunes).toFixed(2) : '0.00';
    const savedPct = data.rawTokens > 0 ? Math.round((data.savedTokens / data.rawTokens) * 100) : 0;
    const routes = Object.entries(data.byRoute)
      .sort((a, b) => b[1].savedTokens - a[1].savedTokens)
      .map(([k, v]) => `    ${k.padEnd(12)} ${String(v.prunes).padStart(5)} prunes  ${v.savedTokens.toLocaleString().padStart(9)} tokens saved`);

    const formatted = [
      '════════════════════════════════════════════════════════════',
      '  LeanToken pruning stats (this project, measured)',
      '════════════════════════════════════════════════════════════',
      `  Outputs pruned:          ${data.totalPrunes.toLocaleString()}`,
      `  Tokens before pruning:   ${data.rawTokens.toLocaleString()}`,
      `  Tokens sent to agent:    ${data.prunedTokens.toLocaleString()}`,
      `  Tokens saved:            ${data.savedTokens.toLocaleString()} (-${savedPct}%)`,
      `  Pruning time (avg):      ${avgLatency} ms (excludes Node.js start-up per hook call)`,
      ...(routes.length ? ['  By output type:', ...routes] : []),
      ...(data.readGuard.guards ? [
        `  Read guard (whole-file reads answered with the outline): ${data.readGuard.guards.toLocaleString()}`,
        `    file tokens ${data.readGuard.fullTokens.toLocaleString()} → outline tokens ${data.readGuard.outlineTokens.toLocaleString()} (the agent may still read a range afterwards)`
      ] : []),
      '════════════════════════════════════════════════════════════',
      '  Whole-session picture (reads, skipped outputs, tokens): lean audit'
    ].join('\n');

    const statusline = `⚡ LeanToken: ${data.savedTokens.toLocaleString()} tokens saved (-${savedPct}%) in ${data.totalPrunes} prunes`;

    return { data, formatted, statusline };
  }

  /**
   * One status line for Claude Code's statusLine command. `payload` is the JSON Claude Code pipes
   * on stdin (object or string). Context tokens come from context_window.current_usage
   * (input + cache write + cache read), else used_percentage × context_window_size. Never throws:
   * without a usable payload it returns the plain pruning counters.
   */
  static statusline(payload) {
    let p = payload;
    try {
      if (typeof p === 'string') p = p.trim() ? JSON.parse(p) : null;
    } catch { p = null; }
    if (!p || typeof p !== 'object') p = null;
    let base;
    try {
      const dir = (p && ((p.workspace && p.workspace.project_dir) || p.cwd)) || process.cwd();
      base = this.getStats(dir).statusline;
    } catch {
      base = this.getStats(process.cwd()).statusline;
    }
    try {
      const cw = p && p.context_window;
      if (!cw) return base;
      const u = cw.current_usage;
      let ctx = null;
      if (u && typeof u === 'object') {
        ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      } else if (Number.isFinite(cw.used_percentage) && Number.isFinite(cw.context_window_size)) {
        ctx = Math.round((cw.used_percentage / 100) * cw.context_window_size);
      }
      if (ctx == null) return base;
      const over = ctx > 200000 || p.exceeds_200k_tokens === true;
      return `ctx ${Math.round(ctx / 1000)}k${over ? ' ⚠ /compact or /clear' : ''} | ${base}`;
    } catch {
      return base;
    }
  }

  /** Read piped stdin; resolves '' when stdin is a TTY or nothing arrives within `ms`. Never hangs. */
  static readStdin(ms = 200) {
    return new Promise(resolve => {
      const stdin = process.stdin;
      if (stdin.isTTY) return resolve('');
      let buf = '';
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { stdin.pause(); stdin.destroy(); } catch { /* ignore */ }
        resolve(buf);
      };
      // No data within `ms`: give up. Data arriving: allow up to 1s for the rest.
      let timer = setTimeout(finish, ms);
      try {
        stdin.setEncoding('utf8');
        // Hard limits: Claude Code's statusline must never wait on us, and the payload is small JSON
        setTimeout(finish, ms + 1000).unref();
        stdin.on('data', d => { buf += d; if (buf.length > 256 * 1024) { buf = ''; finish(); return; } clearTimeout(timer); timer = setTimeout(finish, 1000); });
        stdin.on('end', finish);
        stdin.on('error', finish);
      } catch { finish(); }
    });
  }
}

/**
 * True when every existing folder from `base` down to `dir` is a real directory, not a symlink or junction.
 * A cloned repo could commit `.lean` as a link to redirect LeanToken's writes (and log deletions) elsewhere.
 */
function safeDir(dir, base = path.dirname(dir)) {
  // Checks dir and its parents below base (base itself and system links such as macOS /var are trusted)
  let d = path.resolve(dir);
  const stop = path.resolve(base);
  const rel = path.relative(stop, d);
  const inside = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  for (;;) {
    try { if (!fs.lstatSync(d).isDirectory()) return false; } catch { /* missing: mkdir makes a real one */ }
    const up = path.dirname(d);
    if (!inside || up === stop || up === d) return true;
    d = up;
  }
}

module.exports = { Telemetry, safeDir };
