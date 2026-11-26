/**
 * LeanToken latency benchmark.
 * 1. Engine: prune() on `git status` output, including the raw-log write. Fails if the average exceeds 5 ms.
 * 2. Hook end to end: what one Claude Code hook call costs (Node start-up + module load + prune), reported
 *    next to a bare `node -e 0` start so the share LeanToken adds is visible. Not a pass/fail gate: it depends on the machine.
 */
const { CommandPruner } = require('../src/core/pruner');
// Raw logs go to a temp dir: tests must not write into the repository
const LOG_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'lean-test-'));

const sampleGitStatus = `
On branch feature/auth
Your branch is up to date with 'origin/feature/auth'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tmodified:   src/auth/jwt.js
\tnew file:   src/auth/session.js

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
\tmodified:   package.json
\tmodified:   README.md

Untracked files:
  (use "git add <file>..." to include in what will be committed)
\ttemp1.log
\ttemp2.log
\ttemp3.log
\ttemp4.log
\ttemp5.log
\ttemp6.log

no changes added to commit (use "git add" to track)
`;

const ITERATIONS = 1000;
const pruner = new CommandPruner({ logDir: LOG_DIR });
const durations = [];

console.log('════════════════════════════════════════════════════════════');
console.log(`  LeanToken Latency Benchmark (${ITERATIONS} iterations)`);
console.log('════════════════════════════════════════════════════════════');

// Warmup
for (let i = 0; i < 50; i++) {
  pruner.prune('git status', sampleGitStatus);
}

// Measured loop
for (let i = 0; i < ITERATIONS; i++) {
  const start = process.hrtime.bigint();
  pruner.prune('git status', sampleGitStatus);
  const durMs = Number(process.hrtime.bigint() - start) / 1e6;
  durations.push(durMs);
}

durations.sort((a, b) => a - b);
const min = durations[0];
const max = durations[durations.length - 1];
const avg = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(3);
const p50 = durations[Math.floor(ITERATIONS * 0.50)].toFixed(3);
const p90 = durations[Math.floor(ITERATIONS * 0.90)].toFixed(3);
const p99 = durations[Math.floor(ITERATIONS * 0.99)].toFixed(3);

console.log(`  Iterations:     ${ITERATIONS}`);
console.log(`  Min Latency:    ${min.toFixed(3)} ms`);
console.log(`  Average:        ${avg} ms`);
console.log(`  Median (p50):   ${p50} ms`);
console.log(`  90th %ile:      ${p90} ms`);
console.log(`  99th %ile:      ${p99} ms`);
console.log('════════════════════════════════════════════════════════════');

if (parseFloat(avg) > 5.0) {
  console.error(`❌ LATENCY BUDGET BREACH: engine average ${avg}ms exceeds the 5.0ms budget`);
  process.exit(1);
}
console.log(`  ✓ Engine within budget: average ${avg}ms (budget 5.0ms)`);

// End-to-end hook cost, as Claude Code pays it per matching shell call
const { spawnSync } = require('child_process');
const path = require('path');
const lean = path.join(__dirname, '..', 'bin', 'lean.js');
const payload = JSON.stringify({ cwd: LOG_DIR, tool_name: 'Bash', tool_input: { command: 'git status' }, tool_response: { stdout: sampleGitStatus.repeat(4), stderr: '' } });
const median = run => { const t = []; for (let i = 0; i < 7; i++) { const s = process.hrtime.bigint(); run(); t.push(Number(process.hrtime.bigint() - s) / 1e6); } return t.sort((a, b) => a - b)[3]; };
const bare = median(() => spawnSync(process.execPath, ['-e', '0']));
const hook = median(() => spawnSync(process.execPath, [lean, 'hook', 'claude'], { input: payload }));
console.log(`  Hook call end to end (median of 7): ${hook.toFixed(0)}ms, of which Node.js start-up ${bare.toFixed(0)}ms`);
console.log(`  LeanToken's own share per hook call: ~${Math.max(0, hook - bare).toFixed(0)}ms`);
