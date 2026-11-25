/**
 * LeanToken Test Suite Runner
 */
const prunerTest = require('./pruner.test');
const rulesTest = require('./rules.test');
const symbolTest = require('./symbol_indexer.test');
const learnerTest = require('./learner.test');

console.log('════════════════════════════════════════════════════════════');
console.log('  Running LeanToken Automated Test Suite (Sprint 1 QA)');
console.log('════════════════════════════════════════════════════════════\n');

try {
  prunerTest.run();
  console.log('');
  rulesTest.run();
  console.log('');
  symbolTest.run();
  console.log('');
  learnerTest.run();
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ✓ ALL UNIT & REGRESSION TESTS PASSED (100% SUCCESS)');
  console.log('════════════════════════════════════════════════════════════');
} catch (err) {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
}
