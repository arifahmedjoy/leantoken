const path = require('path');
const { listTranscripts, readSession, rereads, fileReads, normalizeFile } = require('./transcripts');
const { normalizeCommand, AUTO_ROUTES } = require('./hooks');
const { CommandPruner } = require('./pruner');

const tok = s => Math.ceil((s || '').length / 3.8); // same estimate as the pruner
// Only the hook's own footer at the very end of an output (not footer text quoted in source or logs)
const FOOTER = /\[LeanToken: -(\d+)% tokens \| full output: [^\]\n]+\]\s*$/;
const BIG = 400; // the hook's MIN_RAW_CHARS
const LARGE_READ = 8000; // a whole-file read above this many characters should have been a section read
const CTX_THRESHOLDS = [150000, 200000, 400000];
const CTX_CAPS = [150000, 200000];

/** What a tool call acted on, for the report: file, command or pattern (80 chars). */
function callTarget(c) {
  const i = c.input || {};
  const v = i.file_path || i.command || i.pattern || i.url || i.query || i.path || i.description || '';
  const one = String(v).replace(/\s+/g, ' ').trim();
  return one.length > 80 ? `${one.slice(0, 77)}...` : one;
}

/** True when this project or the user-wide Claude Code file already carries the current directive. */
function directiveCurrent(cwd) {
  const fs = require('fs');
  const os = require('os');
  const { DIRECTIVE_VERSION } = require('./rules');
  const mark = `Unified Agent Directive (v${DIRECTIVE_VERSION})`;
  return [path.join(cwd, 'CLAUDE.md'), path.join(cwd, 'AGENTS.md'), path.join(os.homedir(), '.claude', 'CLAUDE.md')]
    .some(f => { try { return fs.readFileSync(f, 'utf8').includes(mark); } catch { return false; } });
}

/**
 * Audit Claude Code sessions for one project, from the transcripts Claude Code keeps.
 * Everything is measured from the transcripts; token counts use the pruner's ~3.8 chars/token estimate.
 */
function audit(cwd = process.cwd(), options = {}) {
  const files = options.files || listTranscripts(cwd, options.home).slice(0, options.sessions || 20);
  const route = new CommandPruner({ logDir: path.join(cwd, '.lean', 'logs') });
  const r = {
    sessions: 0, first: null, last: null, compactions: 0,
    usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
    toolCalls: 0, shellCalls: 0, shellTokens: 0,
    pruned: { count: 0, sentTokens: 0, savedTokens: 0, byRoute: {} },
    skipped: {}, // reason -> { count, tokens }
    reads: { total: 0, tokens: 0, repeated: 0, repeatedTokens: 0, wholeLarge: 0, wholeLargeTokens: 0, files: {} },
    errors: 0,
    // Every API call re-reads the whole context: sizes and cache reads are measured API usage
    context: {
      calls: 0, avg: 0, max: 0, cacheRead: 0,
      shareAbove: Object.fromEntries(CTX_THRESHOLDS.map(t => [t, 0])),
      capSavings: Object.fromEntries(CTX_CAPS.map(t => [t, 0])),
      topSessions: []
    },
    // Tool output weighted by re-reads: tokens × later API calls in the same compaction epoch
    toolCost: { byTool: {}, top: [] }
  };
  const ctxSum = { total: 0, above: Object.fromEntries(CTX_THRESHOLDS.map(t => [t, 0])), capped: Object.fromEntries(CTX_CAPS.map(t => [t, 0])) };
  const sessionsCtx = [];
  const skip = (reason, t) => { const s = r.skipped[reason] || (r.skipped[reason] = { count: 0, tokens: 0 }); s.count++; s.tokens += t; };

  for (const file of files) {
    const s = readSession(file);
    if (!s.calls.length && !s.first) continue;
    r.sessions++;
    r.compactions += s.compactions;
    if (s.first && (!r.first || s.first < r.first)) r.first = s.first;
    if (s.last && (!r.last || s.last > r.last)) r.last = s.last;
    for (const k of Object.keys(r.usage)) r.usage[k] += s.usage[k];
    r.toolCalls += s.calls.length;
    let sRead = 0;
    let sMax = 0;
    s.contexts.forEach((ctx, i) => {
      const cr = s.cacheReads[i];
      r.context.calls++;
      ctxSum.total += ctx;
      r.context.cacheRead += cr;
      sRead += cr;
      sMax = Math.max(sMax, ctx);
      for (const t of CTX_THRESHOLDS) if (ctx > t) ctxSum.above[t] += cr;
      for (const cap of CTX_CAPS) ctxSum.capped[cap] += Math.min(cr, Math.max(0, ctx - cap));
    });
    r.context.max = Math.max(r.context.max, sMax);
    sessionsCtx.push({ id: s.id, calls: s.contexts.length, cacheRead: sRead, maxContext: sMax });
    const seen = new Map(); // file -> compaction count at last read

    for (const c of s.calls) {
      if (c.isError) r.errors++;
      const t = tok(c.output);
      const rr = rereads(s, c);
      const bt = r.toolCost.byTool[c.name] || (r.toolCost.byTool[c.name] = { calls: 0, tokens: 0, weighted: 0 });
      bt.calls++;
      bt.tokens += t;
      bt.weighted += t * rr;
      if (t * rr > 0) {
        r.toolCost.top.push({ tool: c.name, what: callTarget(c), tokens: t, rereads: rr, weighted: t * rr });
        r.toolCost.top.sort((a, b) => b.weighted - a.weighted);
        r.toolCost.top.length = Math.min(r.toolCost.top.length, 5);
      }

      // File reads (Read tool or cat/sed/head in a shell)
      for (const fr of fileReads(c)) {
        const f = normalizeFile(fr.file, cwd);
        const e = r.reads.files[f] || (r.reads.files[f] = { reads: 0, maxPerSession: 0, tokens: 0, _s: {} });
        e.reads++;
        e._s[s.id] = (e._s[s.id] || 0) + 1;
        e.maxPerSession = Math.max(e.maxPerSession, e._s[s.id]);
        r.reads.total++;
      }
      const reads = fileReads(c);
      if (reads.length) {
        r.reads.tokens += t;
        for (const fr of reads) r.reads.files[normalizeFile(fr.file, cwd)].tokens += Math.round(t / reads.length);
        const key = `${c.name}:${JSON.stringify(c.input)}`; // identical read; a different line range is not a repeat
        if (seen.has(key) && seen.get(key) === c.compactionsBefore) { r.reads.repeated++; r.reads.repeatedTokens += t; }
        seen.set(key, c.compactionsBefore);
        if (reads.some(x => x.whole) && c.output.length > LARGE_READ) { r.reads.wholeLarge++; r.reads.wholeLargeTokens += t; }
      }

      if (c.name !== 'Bash' && c.name !== 'PowerShell') continue;
      r.shellCalls++;
      r.shellTokens += t;
      const footer = FOOTER.exec(c.output);
      if (footer) {
        const pct = Number(footer[1]) / 100;
        const raw = pct < 1 ? Math.round(t / (1 - pct)) : t;
        r.pruned.count++;
        r.pruned.sentTokens += t;
        r.pruned.savedTokens += raw - t;
        const k = route.route(normalizeCommand(c.input.command) || '', '');
        r.pruned.byRoute[k] = (r.pruned.byRoute[k] || 0) + (raw - t);
        continue;
      }
      if (c.output.length < BIG) { skip('small output (<400 chars)', t); continue; }
      const cmd = normalizeCommand(c.input.command);
      if (!cmd) { skip('compound command (pipes, ;, &&)', t); continue; }
      const k = route.route(cmd, c.output);
      if (!AUTO_ROUTES.has(k)) { skip(`content output (${k}): left verbatim on purpose`, t); continue; }
      skip(`prunable (${k}) but not pruned: hook filter, back-off or <20 tokens to save`, t);
    }
  }

  for (const e of Object.values(r.reads.files)) delete e._s;
  const cr = r.context.cacheRead;
  r.context.avg = r.context.calls ? Math.round(ctxSum.total / r.context.calls) : 0;
  for (const t of CTX_THRESHOLDS) r.context.shareAbove[t] = cr ? ctxSum.above[t] / cr : 0;
  for (const cap of CTX_CAPS) r.context.capSavings[cap] = cr ? ctxSum.capped[cap] / cr : 0;
  r.context.topSessions = sessionsCtx.filter(x => x.calls).sort((a, b) => b.cacheRead - a.cacheRead).slice(0, 3);
  return r;
}

const fmt = n => n.toLocaleString();
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '0%');

function format(r, cwd = process.cwd()) {
  if (!r.sessions) {
    return `⚡ LeanToken audit: no Claude Code sessions found for ${cwd}.\n  Sessions are read from ~/.claude/projects/<project>/ (or $CLAUDE_CONFIG_DIR).`;
  }
  const lines = [];
  const L = s => lines.push(s);
  L('════════════════════════════════════════════════════════════');
  L(`  LeanToken audit: ${r.sessions} Claude Code session(s)`);
  L(`  ${(r.first || '').slice(0, 16).replace('T', ' ')} → ${(r.last || '').slice(0, 16).replace('T', ' ')} UTC`);
  L('════════════════════════════════════════════════════════════');
  L(`  Model tokens: input ${fmt(r.usage.input)} | cache write ${fmt(r.usage.cacheWrite)} | cache read ${fmt(r.usage.cacheRead)} | output ${fmt(r.usage.output)}`);
  L(`  Tool calls: ${fmt(r.toolCalls)} (shell ${fmt(r.shellCalls)}, errors ${fmt(r.errors)}), compactions: ${r.compactions}`);
  L('');
  const cx = r.context;
  const k = n => `${Math.round(n / 1000)}k`;
  const p = x => `${(x * 100).toFixed(1)}%`;
  if (cx.calls) {
    L('  Context (the largest cost: every call re-reads it)');
    L(`    API calls: ${fmt(cx.calls)}, context avg ${k(cx.avg)}, max ${k(cx.max)} tokens; cache read ${fmt(cx.cacheRead)} tokens`);
    L(`    share of cache reads from calls with context over ${CTX_THRESHOLDS.map(t => `${k(t)}: ${p(cx.shareAbove[t])}`).join(' | ')}`);
    L(`    upper bound if context were capped (cache read above the cap): ${CTX_CAPS.map(c => `${k(c)}: ${p(cx.capSavings[c])}`).join(' | ')}`);
    if (cx.topSessions.length) {
      L('    sessions with the most cache read:');
      for (const t of cx.topSessions) L(`      ${t.id.slice(0, 8)}  ${fmt(t.calls)} calls, max context ${k(t.maxContext)}, cache read ${fmt(t.cacheRead)}`);
    }
    const tools = Object.entries(r.toolCost.byTool).filter(([, v]) => v.weighted > 0).sort((a, b) => b[1].weighted - a[1].weighted).slice(0, 6);
    if (tools.length) {
      L('    tool output, raw vs weighted by re-reads (~tokens × later calls before the next compaction):');
      for (const [n, v] of tools) L(`      ${n.padEnd(12)} raw ~${fmt(v.tokens).padStart(9)}  weighted ~${fmt(v.weighted).padStart(12)}  (avg ${(v.weighted / Math.max(1, v.tokens)).toFixed(0)}×)`);
    }
    if (r.toolCost.top.length) {
      L('    costliest single outputs (weighted):');
      for (const t of r.toolCost.top) L(`      ~${fmt(t.weighted).padStart(11)} = ~${fmt(t.tokens)} tok × ${t.rereads} re-reads  ${t.tool}  ${t.what}`);
    }
    L('');
  }
  L('  Shell output');
  L(`    total:   ~${fmt(r.shellTokens)} tokens`);
  L(`    pruned:  ${fmt(r.pruned.count)} outputs, ~${fmt(r.pruned.savedTokens)} tokens saved (${pct(r.pruned.savedTokens, r.shellTokens + r.pruned.savedTokens)} of shell output)`);
  for (const [k, v] of Object.entries(r.pruned.byRoute).sort((a, b) => b[1] - a[1])) L(`      ${k}: ~${fmt(v)}`);
  L('    not pruned:');
  for (const [k, v] of Object.entries(r.skipped).sort((a, b) => b[1].tokens - a[1].tokens)) L(`      ${String(v.count).padStart(4)} × ~${fmt(v.tokens).padStart(7)} tok  ${k}`);
  L('');
  L('  File reads (the largest lever: content is never pruned, only read less)');
  L(`    reads: ${fmt(r.reads.total)}, ~${fmt(r.reads.tokens)} tokens`);
  L(`    identical re-reads before any compaction: ${fmt(r.reads.repeated)} (~${fmt(r.reads.repeatedTokens)} tokens)`);
  L(`    whole-file reads over ${LARGE_READ / 1000}k chars: ${fmt(r.reads.wholeLarge)} (~${fmt(r.reads.wholeLargeTokens)} tokens): use \`lean symbols <file>\`, then read one range`);
  const hot = Object.entries(r.reads.files).filter(([, e]) => e.reads >= 3).sort((a, b) => b[1].tokens - a[1].tokens).slice(0, 10);
  if (hot.length) {
    L('    most-read files:');
    for (const [f, e] of hot) L(`      ${String(e.reads).padStart(4)} reads (max ${e.maxPerSession}/session) ~${fmt(e.tokens)} tok  ${f}`);
  }
  L('');
  L('  Next steps');
  const tips = [];
  if (cx.calls && cx.shareAbove[200000] > 0.3) {
    tips.push(`${p(cx.shareAbove[200000])} of cache reads came from calls with context over 200k. Use \`/clear\` between unrelated tasks, or opt in to \`lean init --global --context-cap=200000\` (sets CLAUDE_CODE_AUTO_COMPACT_WINDOW): measured upper bound ${p(cx.capSavings[200000])} fewer cache-read tokens.`);
  }
  if (r.reads.wholeLarge) {
    tips.push(directiveCurrent(cwd)
      ? 'Large whole-file reads: the current directive (outline first, read one range) is installed; sessions before it still count. Re-run `lean audit` after a few new sessions.'
      : 'Large whole-file reads: the directive (v0.3+) tells agents to outline first; run `lean init` to upgrade it.');
  }
  if (hot.length) tips.push('Run `lean learn` to record hot files and their section maps in .lean/MEMORY.md.');
  const compound = r.skipped['compound command (pipes, ;, &&)'];
  if (compound && compound.tokens > r.shellTokens * 0.2) tips.push('Most shell output came from chained commands, which the hook never touches; most are file reads (see above).');
  const missed = Object.entries(r.skipped).find(([k, v]) => k.startsWith('prunable') && v.tokens > 1000);
  if (missed) tips.push('Some prunable outputs were not pruned: check `lean doctor` (hook filters) and .lean/learned.json (back-off).');
  if (!tips.length) tips.push('No waste pattern above the thresholds.');
  for (const t of tips) L(`    - ${t}`);
  return lines.join('\n');
}

module.exports = { audit, format };
