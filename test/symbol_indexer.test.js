const assert = require('assert');
const { SymbolIndexer } = require('../src/core/symbol_indexer');
const fs = require('fs');
const os = require('os');
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

  const srcIndex = indexer.extract(path.join(__dirname, '../src/index.js'));
  assert(srcIndex.output.includes('export CommandPruner'), 'Should identify CommonJS exports');
  assert(srcIndex.output.includes('export Telemetry'), 'Should identify CommonJS exports');
}

function testMultiLanguageExtraction() {
  const indexer = new SymbolIndexer();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leantoken-symbols-'));
  const fixtures = {
    'utils.js': {
      code: 'const greet = name => name;',
      expected: 'const greet = (name) => ...'
    },
    'service.py': {
      code: 'class Service:\n  async def greet(self, name: str) -> str:\n    return name',
      expected: 'def greet(self, name: str) -> str'
    },
    'Greeter.java': {
      code: 'public class Greeter {\n  public String greet(String name) { return name; }\n}',
      expected: 'method greet(String name)'
    },
    'Greeter.php': {
      code: '<?php\nfinal class Greeter {\n  public function greet(string $name): string { return $name; }\n}',
      expected: 'function greet(string $name)'
    },
    'main.go': {
      code: 'type Greeter struct {}\nfunc (g *Greeter) Greet(name string) string { return name }',
      expected: 'method Greet(name string)'
    },
    'lib.rs': {
      code: 'pub struct Greeter;\npub fn greet(name: &str) -> String { name.to_owned() }',
      expected: 'function greet(name: &str)'
    },
    'greeter.rb': {
      code: 'class Greeter\n  def greet(name)\n  end\nend',
      expected: 'method greet(name)'
    },
    'Greeter.kt': {
      code: 'class Greeter {\n  fun greet(name: String): String = name\n}',
      expected: 'function greet(name: String)'
    },
    'Greeter.swift': {
      code: 'struct Greeter {\n  func greet(name: String) -> String { name }\n}',
      expected: 'function greet(name: String)'
    },
    'Greeter.cs': {
      code: 'public class Greeter {\n  public string Greet(string name) { return name; }\n}',
      expected: 'method Greet(string name)'
    },
    'Greeter.cpp': {
      code: 'class Greeter {\npublic:\n  void greet(std::string name) {}\n};',
      expected: 'method greet(std::string name)'
    }
  };

  try {
    for (const [fileName, fixture] of Object.entries(fixtures)) {
      const filePath = path.join(tempDir, fileName);
      fs.writeFileSync(filePath, fixture.code, 'utf8');
      const result = indexer.extract(filePath);
      assert(result.output.includes(fixture.expected), `${fileName} should include ${fixture.expected}`);
    }

    const directoryResult = indexer.extract(tempDir);
    assert.strictEqual(directoryResult.symbolCount, Object.keys(fixtures).length);
    for (const fixture of Object.values(fixtures)) {
      assert(directoryResult.output.includes(fixture.expected), `Directory scan should include ${fixture.expected}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`  ✓ Multi-language extraction: ${Object.keys(fixtures).length} language fixtures`);
}

module.exports = {
  run() {
    console.log('Testing SymbolIndexer:');
    testJavaScriptExtraction();
    testMultiLanguageExtraction();
  }
};
