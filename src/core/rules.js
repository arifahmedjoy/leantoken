const fs = require('fs');
const path = require('path');

/**
 * CognitiveShaper: Injects curated, non-conflicting prompt shaper
 * Combines Ponytail's minimal-diff discipline, Caveman's concise output,
 * and strict Anti-Hallucination rules into a single ~300 token system block.
 */
class CognitiveShaper {
  constructor() {
    this.ruleBlock = `
# LeanToken Unified Agent Directive (v0.1.0)
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

## 4. Shell & Command Discipline
- For long command output, LeanToken automatically prunes noise to preserve tokens.
- Full unpruned command logs are stored at \`.lean/logs/last-command.log\`.
`.trim();
  }

  getRules() {
    return this.ruleBlock;
  }

  init(options = {}) {
    const cwd = process.cwd();
    const isGlobal = !!options.global;
    const dryRun = !!options.dryRun;

    const targets = [];
    if (isGlobal) {
      const home = process.env.USERPROFILE || process.env.HOME || cwd;
      targets.push(path.join(home, '.claude', 'CLAUDE.md'));
    } else {
      targets.push(path.join(cwd, 'CLAUDE.md'));
      targets.push(path.join(cwd, '.cursorrules'));
      targets.push(path.join(cwd, 'AGENTS.md'));
    }

    if (dryRun) {
      return {
        success: true,
        message: `[Dry Run] Would inject LeanToken directive into:\n${targets.join('\n')}\n\nContent:\n${this.ruleBlock}`
      };
    }

    const modified = [];
    for (const target of targets) {
      try {
        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        let existing = '';
        if (fs.existsSync(target)) {
          existing = fs.readFileSync(target, 'utf8');
        }

        if (!existing.includes('LeanToken Unified Agent Directive')) {
          const updated = existing ? `${existing.trim()}\n\n${this.ruleBlock}\n` : `${this.ruleBlock}\n`;
          fs.writeFileSync(target, updated, 'utf8');
          modified.push(path.relative(cwd, target) || target);
        }
      } catch (err) {
        // Continue to other targets
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

    return {
      success: true,
      modified,
      message: `⚡ LeanToken initialized successfully!\n  ✓ Injected Unified Directive into: ${modified.join(', ') || 'already up to date'}\n  ✓ Spooled: .lean/logs/ & .lean/MEMORY.md`
    };
  }
}

module.exports = { CognitiveShaper };
