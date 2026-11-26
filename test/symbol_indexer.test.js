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
    let expectedSymbols = 0;
    for (const [fileName, fixture] of Object.entries(fixtures)) {
      const filePath = path.join(tempDir, fileName);
      fs.writeFileSync(filePath, fixture.code, 'utf8');
      const result = indexer.extract(filePath);
      assert(result.output.includes(fixture.expected), `${fileName} should include ${fixture.expected}`);
      expectedSymbols += result.symbolCount;
    }

    const directoryResult = indexer.extract(tempDir);
    assert.strictEqual(directoryResult.symbolCount, expectedSymbols);
    for (const fixture of Object.values(fixtures)) {
      assert(directoryResult.output.includes(fixture.expected), `Directory scan should include ${fixture.expected}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`  ✓ Multi-language extraction: ${Object.keys(fixtures).length} language fixtures`);
}

function parseRanges(output) {
  return output.split('\n').slice(1).map(line => {
    const m = /^(\s*)L(\d+)-(\d+) (.*)$/.exec(line);
    assert(m, `Missing L<start>-<end> prefix: ${line}`);
    return { indent: m[1].length, start: +m[2], end: +m[3], text: m[4] };
  });
}

function assertRangesValid(ranges, lineCount, label) {
  let prev = 0;
  for (const r of ranges) {
    assert(r.start >= prev, `${label}: starts not monotonic at ${r.text}`);
    assert(r.start >= 1 && r.end <= lineCount && r.start <= r.end, `${label}: bad range L${r.start}-${r.end} (lines ${lineCount})`);
    prev = r.start;
  }
  const top = Math.min(...ranges.map(r => r.indent));
  const tops = ranges.filter(r => r.indent === top);
  assert.strictEqual(tops[tops.length - 1].end, lineCount, `${label}: last top-level range must end at EOF`);
}

function testCodeLineRanges() {
  const indexer = new SymbolIndexer();
  // Regression: `const x = () =>` (empty parameters) crashed the JS extractor and dropped the whole outline
  const empty = indexer.symbolsFor('const start = () => {\n  run();\n};\nfunction stop() {}\n', '.js');
  assert(empty.some(s => s.includes('const start = () => ...')) && empty.some(s => s.includes('function stop')), empty.join('\n'));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leantoken-ranges-'));
  const fixtures = {
    'app.js': {
      code: [
        "const fs = require('fs');", // 1
        '',
        'function load(p) {', // 3
        '  return fs.readFileSync(p);',
        '}',
        '',
        'class Store {', // 7
        '  get(key) {', // 8
        '    return key;',
        '  }',
        '  set(key, value) {', // 11
        '    return value;',
        '  }',
        '}',
        '',
        'const save = (data) => data;', // 16
        '',
        'module.exports = { load, Store, save };' // 18
      ].join('\n') + '\n',
      lines: 18,
      expect: [
        [3, 6, 'function load(p)'],
        [7, 15, 'class Store'],
        [8, 10, 'method get(key)'],
        [11, 15, 'method set(key, value)'],
        [16, 17, 'const save = (data) => ...'],
        [18, 18, 'export load']
      ]
    },
    'svc.py': {
      code: 'import os\n\ndef helper(x):\n    return x\n\nclass Service:\n    def run(self):\n        pass\n\n    def stop(self):\n        pass\n',
      lines: 11,
      expect: [[3, 5, 'def helper(x)'], [6, 11, 'class Service'], [7, 9, 'def run(self)'], [10, 11, 'def stop(self)']]
    },
    'main.go': {
      code: 'package main\n\ntype Greeter struct {}\n\nfunc (g *Greeter) Greet(n string) string {\n  return n\n}\n\nfunc main() {\n}',
      lines: 10,
      expect: [[3, 4, 'struct Greeter'], [5, 8, 'method Greet(n string)'], [9, 10, 'function main()']]
    },
    'lib.rs': {
      code: 'use std::fmt;\npub struct Greeter;\n\npub fn greet(name: &str) -> String {\n    name.to_owned()\n}\n',
      lines: 6,
      expect: [[2, 3, 'struct Greeter'], [4, 6, 'function greet(name: &str)']]
    }
  };

  try {
    for (const [fileName, fx] of Object.entries(fixtures)) {
      const filePath = path.join(tempDir, fileName);
      fs.writeFileSync(filePath, fx.code, 'utf8');
      const ranges = parseRanges(indexer.extract(filePath).output);
      assertRangesValid(ranges, fx.lines, fileName);
      for (const [start, end, text] of fx.expect) {
        const hit = ranges.find(r => r.text.startsWith(text));
        assert(hit, `${fileName}: missing ${text}`);
        assert.deepStrictEqual([hit.start, hit.end], [start, end], `${fileName}: ${text} range`);
      }
    }
    const top = parseRanges(indexer.extract(path.join(tempDir, 'app.js')).output).find(r => r.text.startsWith('class Store'));
    assert(/\(~\d+(\.\d)?k? tok\)$/.test(top.text), 'Top-level symbol should carry a size');

    const pruner = path.join(__dirname, '../src/core/pruner.js');
    const prunerLines = fs.readFileSync(pruner, 'utf8').replace(/\n$/, '').split('\n').length;
    assertRangesValid(parseRanges(indexer.extract(pruner).output), prunerLines, 'pruner.js');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(`  ✓ Code line ranges: ${Object.keys(fixtures).length} fixtures + pruner.js (monotonic, in bounds, EOF)`);
}

function testOutlineForGuard() {
  const indexer = new SymbolIndexer();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leantoken-guard-'));
  try {
    const big = [];
    for (let c = 0; c < 40; c++) {
      big.push(`class Widget${c} {`);
      for (let m = 0; m < 10; m++) big.push(`  method${m}(arg) {`, '    return arg;', '  }');
      big.push('}');
    }
    const bigFile = path.join(tempDir, 'big.js');
    fs.writeFileSync(bigFile, big.join('\n'), 'utf8');

    const full = indexer.outlineForGuard(bigFile, 100000);
    assert(full.output.includes('method method9(arg)'), 'Large budget keeps nested members');
    assert.strictEqual(full.lines, big.length);
    assert(full.fullTokens > full.tokens);

    const mid = indexer.outlineForGuard(bigFile, 600);
    assert(mid.tokens <= 600, `Expected <=600 tokens, got ${mid.tokens}`);
    assert(!mid.output.includes('method method0'), 'Deepest level dropped first');
    assert(mid.output.includes('class Widget39'), 'Top level kept when it fits');
    assert(/L\d+-\d+ class Widget0/.test(mid.output), 'Ranges kept in guard output');

    const tiny = indexer.outlineForGuard(bigFile, 120);
    assert(tiny.tokens <= 120, `Expected <=120 tokens, got ${tiny.tokens}`);
    assert(/… \d+ more$/.test(tiny.output), 'Cut with "… N more"');

    const md = path.join(tempDir, 'doc.md');
    fs.writeFileSync(md, '# Title\n\n## Part\ntext\n', 'utf8');
    assert(indexer.outlineForGuard(md).output.match(/L3-\d+ ## Part/), 'Markdown outline supported');

    const bin = path.join(tempDir, 'blob.js');
    fs.writeFileSync(bin, Buffer.from([0x63, 0x00, 0x01, 0x02]));
    assert.strictEqual(indexer.outlineForGuard(bin), null, 'Binary file returns null');
    assert.strictEqual(indexer.outlineForGuard(tempDir), null, 'Directory returns null');
    assert.strictEqual(indexer.outlineForGuard(path.join(tempDir, 'missing.js')), null, 'Missing file returns null');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('  ✓ outlineForGuard: budget truncation (depth, then "… N more"), null on binary/dir/missing');
}

module.exports = {
  run() {
    console.log('Testing SymbolIndexer:');
    testJavaScriptExtraction();
    testMultiLanguageExtraction();
    testCodeLineRanges();
    testOutlineForGuard();
  }
};
