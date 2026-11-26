const fs = require('fs');
const path = require('path');
const { listTranscripts, readSession, fileReads, normalizeFile } = require('./transcripts');

const HOT_READS = 3;      // a file read this often across the scanned sessions is "hot"
const MAX_SESSIONS = 10;  // newest sessions scanned when no transcript is given
const MAP_LINES = 25;     // outline lines kept per hot file in MEMORY.md
const MAP_MIN_LINES = 150; // smaller files are cheap to read whole: no map
const MAX_HOT = 10;
const MIN_FAILS = 2;      // a command must fail this often to be worth remembering

/**
 * SessionLearner: out-of-band transcript miner. Reads Claude Code's own session files
 * (~/.claude/projects/<project>/*.jsonl), finds files agents keep re-reading and commands
 * that keep failing, and writes them, with a section map per hot file, to .lean/MEMORY.md.
 * Agents read that map instead of re-reading whole files. Runs outside any agent turn.
 */
class SessionLearner {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.memoryPath = options.memoryPath || path.join(this.cwd, '.lean', 'MEMORY.md');
    this.home = options.home;
  }

  learn(transcriptPath) {
    const files = transcriptPath ? [transcriptPath] : listTranscripts(this.cwd, this.home).slice(0, MAX_SESSIONS);
    if (transcriptPath && !fs.existsSync(transcriptPath)) {
      return { success: false, message: `⚡ LeanToken Learn: transcript not found: ${transcriptPath}` };
    }
    if (!files.length) {
      return {
        success: true,
        hotFilesCount: 0,
        errorsCount: 0,
        message: '⚡ LeanToken Learn: no Claude Code sessions found for this project yet (~/.claude/projects/<project>/). Run a session, then `lean learn`.'
      };
    }

    const reads = {};
    const errors = {};
    for (const f of files) {
      const s = readSession(f);
      const calls = s.calls.length ? s.calls : this.legacyCalls(f);
      for (const c of calls) {
        for (const r of fileReads(c)) {
          const key = normalizeFile(r.file, this.cwd);
          reads[key] = (reads[key] || 0) + 1;
        }
        if (c.isError && (c.name === 'Bash' || c.name === 'PowerShell')) {
          const cmd = (c.input.command || '').split('\n')[0].slice(0, 100);
          const e = errors[cmd] || (errors[cmd] = { cmd, count: 0, error: '' });
          e.count++;
          e.error = (c.output || '').split('\n').find(l => l.trim() && !/^Exit code \d+$/.test(l.trim())) || '';
        }
      }
    }
    const commandErrors = Object.values(errors)
      .filter(e => e.count >= MIN_FAILS)
      .sort((a, b) => b.count - a.count)
      .map(e => ({ cmd: e.cmd, code: `${e.count}×`, error: e.error.slice(0, 150) }));
    return this.updateMemory(reads, commandErrors, files.length);
  }

  /** Older generic format: one JSON object per line with tool/name and args. */
  legacyCalls(file) {
    const calls = [];
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { return calls; }
    for (const line of text.split('\n')) {
      try {
        const e = JSON.parse(line);
        if (e.tool === 'read_file' || e.name === 'read_file') {
          const p = (e.args && e.args.Path) || (e.parameters && e.parameters.Path);
          if (p) calls.push({ name: 'Read', input: { file_path: p }, output: '', isError: false });
        }
        if (e.tool === 'run_command' && e.exitCode) {
          calls.push({ name: 'Bash', input: { command: (e.args && e.args.CommandLine) || '' }, output: (e.output || '').slice(0, 150), isError: true });
        }
      } catch {
        // skip unparseable lines
      }
    }
    return calls;
  }

  /** Section map / signatures for a hot file, or '' when it cannot be read. */
  mapFor(file) {
    try {
      const full = path.isAbsolute(file) ? file : path.join(this.cwd, file);
      if (!fs.statSync(full).isFile()) return '';
      if (fs.readFileSync(full, 'utf8').split('\n').length < MAP_MIN_LINES) return '';
      const { SymbolIndexer } = require('./symbol_indexer');
      const out = new SymbolIndexer().extract(full).output.split('\n').slice(1); // drop FILE: header
      const kept = out.slice(0, MAP_LINES);
      if (out.length > kept.length) kept.push(`  ... ${out.length - kept.length} more (lean symbols ${file})`);
      return kept.join('\n');
    } catch {
      return '';
    }
  }

  updateMemory(fileReads, commandErrors, sessions = 1) {
    const hotFiles = Object.entries(fileReads)
      .filter(([_, count]) => count >= HOT_READS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_HOT);

    let md = `# Project Memory (LeanToken)\n<!-- Written by \`lean learn\` from the last ${sessions} session(s). Re-run to refresh; edits here are overwritten. -->\n\n`;
    md += `## 1. Hot files: read a section, not the whole file\n`;
    if (hotFiles.length) {
      for (const [file, count] of hotFiles) {
        md += `- \`${file}\`: read ${count} times.\n`;
        const map = this.mapFor(file);
        if (map) md += '```\n' + map + '\n```\n';
      }
    } else {
      md += `- No file was read ${HOT_READS}+ times.\n`;
    }

    md += `\n## 2. Commands that failed\n`;
    if (commandErrors.length) {
      for (const err of commandErrors.slice(0, 8)) {
        md += `- \`${err.cmd}\` failed (${err.code})${err.error ? `: ${err.error}` : ''}\n`;
      }
    } else {
      md += `- No shell command failed ${MIN_FAILS}+ times.\n`;
    }

    try {
      fs.mkdirSync(path.dirname(this.memoryPath), { recursive: true });
      fs.writeFileSync(this.memoryPath, md, 'utf8');
    } catch {
      return { success: false, hotFilesCount: hotFiles.length, errorsCount: commandErrors.length, message: `⚡ LeanToken Learn: could not write ${this.memoryPath}` };
    }

    return {
      success: true,
      hotFilesCount: hotFiles.length,
      errorsCount: commandErrors.length,
      message: `⚡ LeanToken Learn: scanned ${sessions} session(s)\n  ✓ Hot files recorded: ${hotFiles.length}\n  ✓ Failed commands recorded: ${commandErrors.length}\n  ✓ Saved to: ${path.relative(this.cwd, this.memoryPath) || this.memoryPath}`
    };
  }
}

module.exports = { SessionLearner };
