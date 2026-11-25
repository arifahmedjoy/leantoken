/**
 * LeanToken Test Suite Runner
 */
const prunerTest = require('./pruner.test');
const rulesTest = require('./rules.test');
const symbolTest = require('./symbol_indexer.test');
const learnerTest = require('./learner.test');
const hooksTest = require('./hooks.test');
const lifecycleTest = require('./lifecycle.test');

console.log('════════════════════════════════════════════════════════════');
console.log('  Running LeanToken Automated Test Suite (v0.2)');
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
  hooksTest.run();
  console.log('');
  lifecycleTest.run();
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ✓ ALL UNIT & REGRESSION TESTS PASSED (100% SUCCESS)');
  console.log('════════════════════════════════════════════════════════════');
} catch (err) {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
}
