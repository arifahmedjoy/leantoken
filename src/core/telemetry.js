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
      lastUpdated: null
    };
  }

  static load(cwd) {
    try {
      const data = JSON.parse(fs.readFileSync(this.getStatsPath(cwd), 'utf8'));
      return { ...this.empty(), ...data, byRoute: data.byRoute || {} };
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
    data.lastUpdated = new Date().toISOString();

    const file = this.getStatsPath(cwd);
    try {
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
      '════════════════════════════════════════════════════════════',
      '  Whole-session picture (reads, skipped outputs, tokens): lean audit'
    ].join('\n');

    const statusline = `⚡ LeanToken: ${data.savedTokens.toLocaleString()} tokens saved (-${savedPct}%) in ${data.totalPrunes} prunes`;

    return { data, formatted, statusline };
  }
}

module.exports = { Telemetry };
