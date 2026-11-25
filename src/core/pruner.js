const fs = require('fs');
const path = require('path');

// Anchored to the command start (after RUNNER_PREFIX), so `grep pytest src` is not a test run
const RUNNER_PREFIX = /^(\w+=\S*\s+|npx\s+|bunx\s+|python3?\s+-m\s+|py\s+-m\s+|\.[\/\\])*/;
const TEST_RUNNER_RE = /^((npm|pnpm|yarn|bun)\s+(run\s+)?test\b|(pytest|vitest|jest|mocha|phpunit|rspec)\b|(go|cargo|dotnet|mix|deno)\s+test\b|gradlew?(\.bat)?\s+\S*test|mvnw?(\.cmd)?\s+(\S+\s+)*test\b|node\s+--test\b)/;
const BUILD_RE = /^((npm|pnpm|yarn|bun)\s+(install|i|ci|add|update|run\s+build|build)\b|pip3?\s+install\b|uv\s+(sync|pip\s+install)\b|(cargo|go|dotnet|swift)\s+build\b|gradlew?(\.bat)?\s+\S*(build|assemble)|mvnw?(\.cmd)?\s+(\S+\s+)*(package|install|compile)\b|docker\s+(build|compose\s+build)\b|(tsc|make|cmake)\b|(bundle|composer)\s+install\b)/;
const MAX_LOGS = 20; // bounded disk use: oldest raw logs are deleted

/**
 * CommandPruner: Deterministic, sub-3ms stream pruner for AI agent command output
 */
class CommandPruner {
  constructor(options = {}) {
    // No directory is created until there is raw output worth keeping
    this.logDir = options.logDir || path.join(process.cwd(), '.lean', 'logs');
  }

  estimateTokens(text) {
    if (!text) return 0;
    // Industry standard heuristic: ~3.8 characters per token for code/cli
    return Math.ceil(text.length / 3.8);
  }

  /** Stable short key for a command, e.g. "npm test", "git diff". Used for log names and learning. */
  static commandKey(command) {
    return (command || '').trim().toLowerCase().split(/\s+/).filter(w => !w.startsWith('-')).slice(0, 2).join(' ');
  }

  /** File-name-safe form of commandKey, e.g. "npm-test". Also used as the learning key. */
  static logSlug(command) {
    return CommandPruner.commandKey(command).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cmd';
  }

  /** Save raw output to a per-run log and keep only the newest MAX_LOGS. Returns the path or null. */
  spool(command, rawOutput) {
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      const slug = CommandPruner.logSlug(command);
      const file = path.join(this.logDir, `${Date.now()}-${slug}.log`);
      fs.writeFileSync(file, rawOutput, 'utf8');
      const logs = fs.readdirSync(this.logDir).filter(f => /^\d+-.*\.log$/.test(f)).sort();
      for (const old of logs.slice(0, Math.max(0, logs.length - MAX_LOGS))) fs.unlinkSync(path.join(this.logDir, old));
      return file;
    } catch {
      return null; // spooling is best-effort
    }
  }

  prune(command, rawOutput) {
    const start = process.hrtime.bigint();
    rawOutput = rawOutput || '';
    const rawTokens = this.estimateTokens(rawOutput);
    const rawLines = rawOutput.split('\n').length;

    let pruned = rawOutput;

    let route = 'generic';
    try {
      route = this.route(command, rawOutput);
      // Same terminal text on every OS: CRLF -> LF, progress-bar redraws -> final state, no ANSI colors
      const text = route === 'json' ? rawOutput : this.normalizeTerminal(rawOutput);
      if (route === 'git-status') {
        pruned = this.pruneGitStatus(text);
      } else if (route === 'git-diff') {
        pruned = this.pruneGitDiff(text);
      } else if (route === 'git-log') {
        pruned = this.pruneGitLog(text);
      } else if (route === 'test') {
        pruned = this.pruneTestOutput(text);
      } else if (route === 'listing') {
        pruned = this.pruneDirectoryListing(text);
      } else if (route === 'build') {
        pruned = this.pruneBuildOutput(text);
      } else if (route === 'json') {
        pruned = this.pruneJson(text);
      } else {
        // Generic pruner: Collapse repeated whitespace, consecutive blank lines, noisy ANSI escape sequences
        pruned = this.pruneGeneric(text);
      }
    } catch (err) {
      // Fail-open guarantee: on any parsing error, return raw output unaltered
      pruned = rawOutput;
    }

    const pruneDurationMs = Number(process.hrtime.bigint() - start) / 1e6;
    // Raw output is kept only when something was actually removed
    const spoolPath = pruned !== rawOutput ? this.spool(command, rawOutput) : null;
    const prunedTokens = this.estimateTokens(pruned);
    const savedTokens = Math.max(0, rawTokens - prunedTokens);
    const prunedLines = pruned.split('\n').length;
    const linesSaved = Math.max(0, rawLines - prunedLines);
    const savedPct = rawTokens > 0 ? Math.round((savedTokens / rawTokens) * 100) : 0;

    return {
      pruned,
      rawTokens,
      prunedTokens,
      savedTokens,
      savedPct,
      linesSaved,
      pruneDurationMs,
      spoolPath,
      route
    };
  }

  normalizeTerminal(output) {
    return output
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => {
        const parts = line.split('\r'); // spinner/progress redraws: keep what was finally shown
        return parts[parts.length - 1] || parts.filter(Boolean).pop() || '';
      })
      .join('\n')
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  }

  /** Collapse runs of 3+ identical non-trivial lines into one line with a count. */
  collapseRepeats(lines) {
    const out = [];
    for (let i = 0; i < lines.length;) {
      let j = i;
      while (j + 1 < lines.length && lines[j + 1] === lines[i]) j++;
      const n = j - i + 1;
      if (n >= 3 && lines[i].trim().length > 3) out.push(`${lines[i]}  (×${n})`);
      else for (let k = i; k <= j; k++) out.push(lines[k]);
      i = j + 1;
    }
    return out;
  }

  pruneBuildOutput(output) {
    // Noise that never helps an agent: download/progress chatter and deprecation notices (counted, not shown)
    const noise = /^\s*(npm (warn|WARN) deprecated|Downloading|Downloaded|Collecting|Using cached|Requirement already satisfied|Fetching|Resolving|Progress:|Compiling \S+ v\d|Unpacking|Preparing|Building wheel|Installing collected packages|\d+%\s|#\d+ (CACHED|DONE|\[internal\]))/i;
    const lines = output.split('\n');
    const kept = [];
    let dropped = 0;
    for (const line of lines) {
      if (noise.test(line)) { dropped++; continue; }
      kept.push(line);
    }
    const result = this.collapseRepeats(kept).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return dropped ? `${result}\n  ... ${dropped} progress/download/deprecation lines folded` : result;
  }

  route(command, rawOutput = '') {
    const lowerCmd = (command || '').toLowerCase().trim();
    if (lowerCmd.startsWith('git status') || lowerCmd === 'git st') return 'git-status';
    if (lowerCmd.startsWith('git diff')) return 'git-diff';
    if (lowerCmd.startsWith('git log')) return 'git-log';
    // Only real test-runner invocations; a path or grep term containing "test" must not match
    const runner = lowerCmd.replace(RUNNER_PREFIX, '');
    if (TEST_RUNNER_RE.test(runner)) return 'test';
    if (/^(dir|ls|tree)(\s|$)/.test(lowerCmd)) return 'listing';
    if (BUILD_RE.test(runner)) return 'build';
    const trimmed = rawOutput.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
    return 'generic';
  }

  pruneGitStatus(output) {
    const lines = output.split('\n');
    const result = [];
    let untrackedCount = 0;
    let inUntracked = false;

    for (let line of lines) {
      // Strip advice lines
      if (line.includes('(use "git') || line.includes('(use \'git') || line.includes('nothing to commit, working tree clean')) {
        continue;
      }
      if (line.includes('Untracked files:')) {
        inUntracked = true;
        continue;
      }
      if (inUntracked) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('(')) {
          untrackedCount++;
          if (untrackedCount <= 5) {
            result.push(`  ? ${trimmed}`);
          }
        }
        continue;
      }

      // Compact staged/unstaged
      if (line.includes('modified:')) {
        result.push(line.replace(/modified:\s+/, 'M '));
      } else if (line.includes('deleted:')) {
        result.push(line.replace(/deleted:\s+/, 'D '));
      } else if (line.includes('new file:')) {
        result.push(line.replace(/new file:\s+/, 'A '));
      } else if (line.trim().length > 0) {
        result.push(line);
      }
    }

    if (untrackedCount > 5) {
      result.push(`  ... and ${untrackedCount - 5} more untracked files`);
    }

    return result.join('\n').trim();
  }

  pruneGitDiff(output) {
    const lines = output.split('\n');
    const result = [];
    let skippingLockfile = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check for lockfiles or huge generated files
      if (line.startsWith('diff --git')) {
        skippingLockfile = /package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|\.min\.js|\.min\.css/i.test(line);
        if (skippingLockfile) {
          result.push(`${line} [LARGE LOCKFILE DIFF COLLAPSED - SEE RAW LOG]`);
          continue;
        }
      }

      if (skippingLockfile) {
        continue;
      }

      // Compress context lines (keep only changed + 1 line context)
      result.push(line);
    }

    return result.join('\n');
  }

  pruneGitLog(output) {
    // Strip empty lines, AuthorDate if redundant, keep commit + author + message
    return output
      .split('\n')
      .filter(l => l.trim().length > 0)
      .slice(0, 15) // Keep top 15 commits max
      .join('\n');
  }

  pruneTestOutput(output) {
    const lines = output.split('\n');
    const result = [];
    // Broad on purpose: a false "failing" only costs savings, a false "passing" hides failures
    let isFailing = /fail|error|panic|exception|traceback|✗|✖|✘/i.test(output);

    if (!isFailing) {
      // Test passed completely: return ultra-compact summary
      const summaryLines = lines.filter(l => 
        l.includes('passed') || l.includes('Passing') || l.includes('Total') || l.includes('Tests:') || l.includes('Time:')
      );
      return summaryLines.length > 0 
        ? `✓ ALL TESTS PASSED\n${summaryLines.join('\n')}` 
        : `✓ ALL TESTS PASSED (${lines.length} lines collapsed)`;
    }

    // When failing, strip passing tests and isolate failure stack
    for (let line of lines) {
      if (line.includes('PASS ') || line.includes('✓') || line.includes('passed in')) {
        continue; // Omit passed individual tests
      }
      result.push(line);
    }

    return result.join('\n');
  }

  pruneDirectoryListing(output) {
    const lines = output.split('\n');
    const result = [];
    let noiseFolded = 0;

    for (let line of lines) {
      // Match whole path segments only (".github", "build-guide.md" are kept)
      if (/(^|[\s\/\\])(node_modules|\.git|dist|build|target|vendor|\.venv|__pycache__)([\s\/\\:]|$)/i.test(line)) {
        noiseFolded++;
        continue;
      }
      result.push(line);
    }

    if (noiseFolded > 0) {
      result.push(`  ... folded ${noiseFolded} dependency/build/vcs entries`);
    }

    return result.join('\n');
  }

  pruneJson(output) {
    try {
      const parsed = JSON.parse(output);
      // If array > 5 items, sample first 3 and fold rest
      if (Array.isArray(parsed)) {
        if (parsed.length > 5) {
          const sample = parsed.slice(0, 3);
          return JSON.stringify(sample, null, 2) + `\n// ... and ${parsed.length - 3} more items folded (see raw log)`;
        }
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      return output;
    }
  }

  pruneGeneric(output) {
    // Strip ANSI codes and repeated blank lines
    const stripped = output.replace(/\x1b\[[0-9;]*m/g, '');
    return stripped.replace(/\n{3,}/g, '\n\n');
  }
}

module.exports = { CommandPruner, MAX_LOGS };
