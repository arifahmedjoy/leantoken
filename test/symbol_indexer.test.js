const assert = require('assert');
const { SymbolIndexer } = require('../src/core/symbol_indexer');
const path = require('path');

function testJavaScriptExtraction() {
  const indexer = new SymbolIndexer();
  const testFile = path.join(__dirname, '../src/core/pruner.js');
  const res = indexer.extract(testFile);

  assert(res.symbolCount >= 4, `Expected at least 4 symbols, found ${res.symbolCount}`);
  assert(res.output.includes('class CommandPruner'), 'Should identify CommandPruner class');
  assert(res.output.includes('method prune('), 'Should identify prune method');
  assert(res.savedPct >= 60, `Expected >=60% token savings, got ${res.savedPct}%`);
  console.log(`  ✓ Symbol extraction: ${res.symbolCount} signatures (${res.tokens} tokens vs ${res.fullTokens} full | -${res.savedPct}% saved)`);
}

module.exports = {
  run() {
    console.log('Testing SymbolIndexer:');
    testJavaScriptExtraction();
  }
};
