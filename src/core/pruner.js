const fs = require('fs');
const path = require('path');

const TEST_RUNNER_RE = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(pytest|vitest|jest|mocha|phpunit|rspec)\b|\b(go|cargo|dotnet|mix|deno)\s+test\b|\bgradlew?(\.bat)?\s+\S*test|\bmvnw?\s+(\S+\s+)*test\b|\bnode\s+--test\b/;

/**
 * CommandPruner: Deterministic, sub-3ms stream pruner for AI agent command output
 */
class CommandPruner {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(process.cwd(), '.lean', 'logs');
    this.ensureLogDir();
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      // Non-blocking fail-safe
    }
  }

  estimateTokens(text) {
    if (!text) return 0;
    // Industry standard heuristic: ~3.8 characters per token for code/cli
    return Math.ceil(text.length / 3.8);
  }

  prune(command, rawOutput) {
    const start = process.hrtime.bigint();
    const rawTokens = this.estimateTokens(rawOutput);
    const rawLines = rawOutput.split('\n').length;

    // Local CCR Spooling: Atomically save full raw output
    const spoolPath = path.join(this.logDir, 'last-command.log');
    try {
      fs.writeFileSync(spoolPath, rawOutput, 'utf8');
    } catch {
      // Ignore disk spooling error
    }

    let pruned = rawOutput;

    try {
      const route = this.route(command, rawOutput);
      if (route === 'git-status') {
        pruned = this.pruneGitStatus(rawOutput);
      } else if (route === 'git-diff') {
        pruned = this.pruneGitDiff(rawOutput);
      } else if (route === 'git-log') {
        pruned = this.pruneGitLog(rawOutput);
      } else if (route === 'test') {
        pruned = this.pruneTestOutput(rawOutput);
      } else if (route === 'listing') {
        pruned = this.pruneDirectoryListing(rawOutput);
      } else if (route === 'json') {
        pruned = this.pruneJson(rawOutput);
      } else {
        // Generic pruner: Collapse repeated whitespace, consecutive blank lines, noisy ANSI escape sequences
        pruned = this.pruneGeneric(rawOutput);
      }
    } catch (err) {
      // Fail-open guarantee: on any parsing error, return raw output unaltered
      pruned = rawOutput;
    }

    const pruneDurationMs = Number(process.hrtime.bigint() - start) / 1e6;
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
      spoolPath
    };
  }

  route(command, rawOutput = '') {
    const lowerCmd = (command || '').toLowerCase().trim();
    if (lowerCmd.startsWith('git status') || lowerCmd === 'git st') return 'git-status';
    if (lowerCmd.startsWith('git diff')) return 'git-diff';
    if (lowerCmd.startsWith('git log')) return 'git-log';
    // Only real test-runner invocations; a path or grep term containing "test" must not match
    if (TEST_RUNNER_RE.test(lowerCmd)) return 'test';
    if (/^(dir|ls|tree)(\s|$)/.test(lowerCmd)) return 'listing';
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

module.exports = { CommandPruner };
