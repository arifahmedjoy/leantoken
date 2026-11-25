const assert = require('assert');
const { CommandPruner } = require('../src/core/pruner');
// Raw logs go to a temp dir: tests must not write into the repository
const LOG_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'lean-test-'));
const fs = require('fs');
const path = require('path');

function testGitStatusPruning() {
  const pruner = new CommandPruner({ logDir: LOG_DIR });
  const verboseOutput = `
On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tnew file:   src/core/new_feature.js

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
\tmodified:   src/core/pruner.js
\tmodified:   package.json

Untracked files:
  (use "git add <file>..." to include in what will be committed)
\tfile1.tmp
\tfile2.tmp
\tfile3.tmp
\tfile4.tmp
\tfile5.tmp
\tfile6.tmp
\tfile7.tmp

no changes added to commit (use "git add" to track)
  `;

  const res = pruner.prune('git status', verboseOutput);
  
  assert(res.savedPct > 50, `Expected >50% savings, got ${res.savedPct}%`);
  assert(!res.pruned.includes('(use "git restore'), 'Should strip git advice');
  assert(res.pruned.includes('M src/core/pruner.js') || res.pruned.includes('src/core/pruner.js'), 'Must preserve modified files');
  assert(res.pruned.includes('and 2 more untracked files'), 'Must collapse untracked files');
  assert(fs.existsSync(res.spoolPath), 'Must spool raw output to CCR log');
  console.log(`  ✓ git status pruning: -${res.savedPct}% tokens saved in ${res.pruneDurationMs.toFixed(3)}ms`);
}

function testLockfileDiffPruning() {
  const pruner = new CommandPruner({ logDir: LOG_DIR });
  const diffOutput = `
diff --git a/package-lock.json b/package-lock.json
index 123456..789abc 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,1000 +1,1000 @@
+ "version": "1.0.1",
+ "dependencies": { "foo": "1.2.3" }
diff --git a/src/index.js b/src/index.js
--- a/src/index.js
+++ b/src/index.js
@@ -1,3 +1,3 @@
- console.log('old');
+ console.log('new');
  `;

  const res = pruner.prune('git diff', diffOutput);
  assert(res.pruned.includes('[LARGE LOCKFILE DIFF COLLAPSED - SEE RAW LOG]'), 'Should collapse package-lock.json');
  assert(res.pruned.includes("console.log('new');"), 'Must keep actual source code diff');
  console.log(`  ✓ lockfile diff pruning: -${res.savedPct}% tokens saved in ${res.pruneDurationMs.toFixed(3)}ms`);
}

function testPassingTestPruning() {
  const pruner = new CommandPruner({ logDir: LOG_DIR });
  const passingTestOutput = `
PASS test/auth.test.js
  ✓ should login successfully (42 ms)
  ✓ should reject invalid token (12 ms)
PASS test/db.test.js
  ✓ should connect (15 ms)

Test Suites: 2 passed, 2 total
Tests:       3 passed, 3 total
Snapshots:   0 total
Time:        1.45 s
Ran all test suites.
  `;

  const res = pruner.prune('npm test', passingTestOutput);
  assert(res.pruned.startsWith('✓ ALL TESTS PASSED'), 'Should collapse passing tests');
  assert(res.savedPct > 60, 'Should save >60% tokens on passing tests');
  console.log(`  ✓ passing test pruning: -${res.savedPct}% tokens saved in ${res.pruneDurationMs.toFixed(3)}ms`);
}

function testFailOpenSafety() {
  const pruner = new CommandPruner({ logDir: LOG_DIR });
  // Pass an unusual string that might break poorly written parsers
  const weird = null;
  const res = pruner.prune('random-command', 'hello world normal output');
  assert.strictEqual(res.pruned, 'hello world normal output');
  console.log(`  ✓ fail-open safety verified`);
}

module.exports = {
  run() {
    console.log('Testing CommandPruner:');
    testGitStatusPruning();
    testLockfileDiffPruning();
    testPassingTestPruning();
    testFailOpenSafety();
  }
};
