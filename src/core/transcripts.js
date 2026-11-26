const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Reader for Claude Code session transcripts.
 * Claude Code stores one JSON Lines file per session in
 * `<config>/projects/<slug>/<session-id>.jsonl`, where <config> is $CLAUDE_CONFIG_DIR or ~/.claude
 * and <slug> is the project path with every non-alphanumeric character replaced by "-"
 * (d:\Avalon\aricon -> d--Avalon-aricon). The drive letter's case can differ, so matching ignores case.
 */

function projectsRoot(home = os.homedir()) {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'projects');
}

function projectSlug(cwd) {
  return path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-');
}

/** The transcript folder for a project, or null when Claude Code has no sessions for it. */
function projectTranscriptDir(cwd = process.cwd(), home) {
  const root = projectsRoot(home);
  const want = projectSlug(cwd).toLowerCase();
  try {
    const hit = fs.readdirSync(root).find(n => n.toLowerCase() === want);
    return hit ? path.join(root, hit) : null;
  } catch {
    return null;
  }
}

/** Session files, newest first. */
function listTranscripts(cwd = process.cwd(), home) {
  const dir = projectTranscriptDir(cwd, home);
  if (!dir) return [];
  return fs.readdirSync(dir)
    .filter(n => n.endsWith('.jsonl'))
    .map(n => path.join(dir, n))
    .map(f => ({ f, t: fs.statSync(f).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .map(x => x.f);
}

function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(c => (c && typeof c.text === 'string' ? c.text : '')).join('');
  return '';
}

/**
 * Parse one session: tool calls paired with their results, token usage (each API message
 * counted once), compactions and time range. Unparseable lines are skipped.
 * Per API call (main thread only; subagent `isSidechain` lines are skipped for usage):
 * `contexts[i]` is its context size (input + cache write + cache read tokens) and `cacheReads[i]`
 * its cache-read tokens. `epochStarts[e]` is the index of the first API call of compaction epoch e.
 * Each tool call gets `apiIndex` (API calls before its result arrived) and `epoch`; see rereads().
 */
function readSession(file) {
  const calls = [];
  const byId = new Map();
  const usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  const seenMsg = new Set();
  const contexts = [];
  const cacheReads = [];
  const epochStarts = [0];
  let compactions = 0;
  let first = null;
  let last = null;

  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* unreadable: empty session */ }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.timestamp) { first = first || o.timestamp; last = o.timestamp; }
    if (o.type === 'system' && o.subtype === 'compact_boundary') { compactions++; epochStarts.push(contexts.length); }
    const m = o.message || {};
    if (o.type === 'assistant' && m.usage && !o.isSidechain && !seenMsg.has(m.id)) {
      seenMsg.add(m.id);
      const u = m.usage;
      usage.input += u.input_tokens || 0;
      usage.cacheWrite += u.cache_creation_input_tokens || 0;
      usage.cacheRead += u.cache_read_input_tokens || 0;
      usage.output += u.output_tokens || 0;
      contexts.push((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0));
      cacheReads.push(u.cache_read_input_tokens || 0);
    }
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_use') {
        const call = { id: b.id, name: b.name, input: b.input || {}, output: '', isError: false, compactionsBefore: compactions };
        byId.set(b.id, call);
        calls.push(call);
      } else if (b.type === 'tool_result' && byId.has(b.tool_use_id)) {
        const call = byId.get(b.tool_use_id);
        call.output = resultText(b.content);
        call.isError = !!b.is_error;
        call.apiIndex = contexts.length;
        call.epoch = compactions;
      }
    }
  }
  return { file, id: path.basename(file, '.jsonl'), calls, usage, compactions, first, last, contexts, cacheReads, epochStarts };
}

/**
 * How many times a tool call's output was re-sent to the model: the API calls after its result
 * arrived, in the same compaction epoch (a compaction replaces it with a summary). 0 without a result.
 */
function rereads(session, call) {
  if (call.apiIndex == null) return 0;
  const end = session.epochStarts[call.epoch + 1] ?? session.contexts.length;
  return Math.max(0, end - call.apiIndex);
}

const READ_CMD = /(?:^|[;&|]\s*|&&\s*)(cat|head|tail|sed\s+-n\s+\S+|less|more|Get-Content)\s+((?:"[^"]+"|'[^']+'|[^\s;&|<>]+)(?:\s+(?:"[^"]+"|'[^']+'|[^\s;&|<>-][^\s;&|<>]*))*)/g;

/**
 * Files a tool call read: Read's file_path, or files named by cat/head/tail/sed -n/Get-Content
 * in a shell command. Returns [{ file, whole }] where `whole` means the full file was read.
 */
function fileReads(call) {
  if (call.name === 'Read' && call.input.file_path) {
    return [{ file: call.input.file_path, whole: call.input.offset == null && call.input.limit == null }];
  }
  if (call.name !== 'Bash' && call.name !== 'PowerShell') return [];
  const out = [];
  const cmd = call.input.command || '';
  for (const m of cmd.matchAll(READ_CMD)) {
    const whole = /^(cat|Get-Content|less|more)$/.test(m[1]);
    for (const tok of m[2].match(/"[^"]+"|'[^']+'|\S+/g) || []) {
      const f = tok.replace(/^["']|["']$/g, '');
      if (/^-/.test(f) || /^\d+$/.test(f) || !/[./\\]/.test(f) || /[*?]/.test(f)) continue;
      out.push({ file: f, whole });
    }
  }
  return out;
}

/** Normalize a read path to project-relative form when it is inside cwd, for counting. */
function normalizeFile(file, cwd) {
  const f = file.replace(/\\/g, '/').replace(/^\/([a-zA-Z])\//, '$1:/');
  const base = path.resolve(cwd).replace(/\\/g, '/');
  if (f.toLowerCase().startsWith(base.toLowerCase() + '/')) return f.slice(base.length + 1);
  return f;
}

module.exports = { projectsRoot, projectSlug, projectTranscriptDir, listTranscripts, readSession, rereads, fileReads, normalizeFile };
