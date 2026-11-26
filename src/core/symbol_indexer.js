const fs = require('fs');
const path = require('path');

/**
 * SymbolIndexer: Zero-MCP lightweight symbol/signature extractor
 * Provides instant structural awareness (<250 tokens per file)
 * without loading heavy LSP servers or multi-thousand token tool definitions.
 */
class SymbolIndexer {
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
  }

  extract(filePath) {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      return this.extractDirectory(fullPath);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const fullTokens = this.estimateTokens(content);
    const ext = path.extname(fullPath).toLowerCase();

    const symbols = this.symbolsFor(content, ext);

    const header = `FILE: ${path.basename(fullPath)} (${ext || 'text'})`;
    const symbolBody = symbols.length > 0 ? symbols.join('\n') : '  (No top-level exports or functions detected)';
    const output = `${header}\n${symbolBody}`;
    const tokens = this.estimateTokens(output);
    const savedPct = fullTokens > 0 ? Math.round(((fullTokens - tokens) / fullTokens) * 100) : 0;

    return {
      filePath,
      symbolCount: symbols.length,
      output,
      tokens,
      fullTokens,
      savedPct: Math.max(0, savedPct)
    };
  }

  /** Name of the line-based extractor for a code extension, or null. */
  codeExtractorFor(ext) {
    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) return 'extractJavaScriptSymbols';
    if (ext === '.py') return 'extractPythonSymbols';
    if (['.php', '.phtml'].includes(ext)) return 'extractPhpSymbols';
    if (['.java', '.cs', '.c', '.h', '.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx'].includes(ext)) return 'extractJavaLikeSymbols';
    if (ext === '.go') return 'extractGoSymbols';
    if (ext === '.rs') return 'extractRustSymbols';
    if (ext === '.rb') return 'extractRubySymbols';
    if (['.kt', '.kts'].includes(ext)) return 'extractKotlinSymbols';
    if (ext === '.swift') return 'extractSwiftSymbols';
    return null;
  }

  symbolsFor(content, ext) {
    const extractor = this.codeExtractorFor(ext);
    if (extractor) return this.withLineRanges(content, extractor);
    if (ext === '.json') return this.extractJsonSchema(content);
    if (['.md', '.mdx', '.markdown'].includes(ext)) return this.extractMarkdownOutline(content);
    return this.extractGenericSymbols(content);
  }

  /**
   * Runs a line-based extractor one line at a time (every extractor is stateless per
   * line and emits at most one symbol per line), so each symbol keeps its source line.
   * Each entry gets `L<start>-<end>`: end is the line before the next symbol at the same
   * or shallower indent (EOF for the last). Top-level entries also get their size.
   */
  withLineRanges(content, extractor) {
    const lines = content.split('\n');
    const lineCount = lines.length > 1 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
    const entries = [];
    for (let i = 0; i < lineCount; i++) {
      if (!lines[i].trim()) continue;
      let found = [];
      try { found = this[extractor](lines[i], true); } catch { /* one odd line must not drop the whole outline */ }
      for (const text of found) entries.push({ text, start: i + 1 });
    }
    if (extractor === 'extractJavaScriptSymbols') {
      entries.push(...this.extractCommonJsExports(content));
      entries.sort((a, b) => a.start - b.start);
    }
    if (!entries.length) return [];

    // Nesting comes from source indentation (extractors mostly ignore it): an entry is
    // a child of the closest preceding entry whose source line is indented less, so a
    // const arrow inside a method or a fn inside a Rust impl does not end its parent.
    const stack = [];
    for (const e of entries) {
      const indent = lines[e.start - 1].search(/\S/);
      while (stack.length && stack[stack.length - 1] >= indent) stack.pop();
      e.depth = stack.length;
      stack.push(indent);
    }
    const topIndent = 0;
    const offsets = [0];
    for (let i = 0; i < lineCount; i++) offsets.push(offsets[i] + lines[i].length + 1);

    return entries.map((e, k) => {
      const d = e.depth;
      let end = lineCount;
      for (let j = k + 1; j < entries.length; j++) {
        if (entries[j].start > e.start && entries[j].depth <= d) { end = entries[j].start - 1; break; }
      }
      let size = '';
      if (d === topIndent) {
        const tok = Math.ceil((offsets[end] - offsets[e.start - 1]) / 3.8);
        size = ` (~${tok >= 1000 ? `${(tok / 1000).toFixed(1)}k` : tok} tok)`;
      }
      return `${'  '.repeat(d + 1)}L${e.start}-${end} ${e.text.trim()}${size}`;
    });
  }

  /** CommonJS `module.exports = { a, b }` entries, each tagged with the statement's line. */
  extractCommonJsExports(code) {
    const out = [];
    const match = /^module\.exports\s*=\s*\{([\s\S]*?)\};/m.exec(code);
    if (!match) return out;
    const start = code.slice(0, match.index).split('\n').length;
    for (const exportedLine of match[1].split(/[\n,]/)) {
      const exportMatch = exportedLine.trim().match(/^([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/);
      if (exportMatch) out.push({ text: `  export ${exportMatch[2] || exportMatch[1]}`, start });
    }
    return out;
  }

  /**
   * Compact outline of one file for a read guard: single read, no directory scan.
   * Over maxTokens it drops the deepest levels first, then cuts with "… N more".
   * Returns null (never throws) for missing, unreadable, binary or non-code/Markdown files.
   */
  outlineForGuard(filePath, maxTokens = 600) {
    try {
      const fullPath = path.resolve(filePath);
      const ext = path.extname(fullPath).toLowerCase();
      if (!this.codeExtractorFor(ext) && !['.md', '.mdx', '.markdown'].includes(ext)) return null;
      const buf = fs.readFileSync(fullPath);
      if (buf.subarray(0, 8000).includes(0)) return null;
      const content = buf.toString('utf8');
      const lines = content.split('\n');
      const lineCount = lines.length > 1 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
      const header = `FILE: ${path.basename(fullPath)} (${ext}, ${lineCount} lines)`;
      let symbols = this.symbolsFor(content, ext);
      if (!symbols.length) symbols = ['  (No top-level exports or functions detected)'];

      // Linear in the number of symbols (a running character count, never re-joined strings):
      // a hook runs this, and untrusted repos can hold files with tens of thousands of symbols
      const indentOf = t => Math.max(0, t.search(/\S/));
      const maxChars = Math.floor(maxTokens * 3.8);
      const size = arr => arr.reduce((n, x) => n + x.length + 1, header.length);
      while (size(symbols) > maxChars) {
        const depths = symbols.map(indentOf);
        let deepest = 0;
        let shallowest = Infinity;
        for (const d of depths) { if (d > deepest) deepest = d; if (d < shallowest) shallowest = d; }
        if (deepest === shallowest) break;
        symbols = symbols.filter((x, i) => depths[i] < deepest);
      }
      if (size(symbols) > maxChars) {
        const more = n => `  … ${n} more`.length + 1;
        let used = header.length;
        let keep = 0;
        while (keep < symbols.length && used + symbols[keep].length + 1 + more(symbols.length - keep - 1) <= maxChars) used += symbols[keep++].length + 1;
        symbols = [...symbols.slice(0, keep), `  … ${symbols.length - keep} more`];
      }
      const output = `${header}\n${symbols.join('\n')}`;
      return { output, tokens: this.estimateTokens(output), fullTokens: this.estimateTokens(content), lines: lineCount };
    } catch {
      return null;
    }
  }

  extractJavaScriptSymbols(code, skipExports = false) {
    const symbols = [];
    const lines = code.split('\n');

    for (let line of lines) {
      const trimmed = line.trim();

      // Class declaration
      const classMatch = trimmed.match(/^export\s+(?:default\s+)?class\s+([A-Za-z0-9_$]+)/) || trimmed.match(/^class\s+([A-Za-z0-9_$]+)/);
      if (classMatch) {
        symbols.push(`  class ${classMatch[1]}`);
        continue;
      }

      // Function declaration
      const fnMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*([A-Za-z0-9_$]*)\s*\(([^)]*)\)/);
      if (fnMatch) {
        symbols.push(`  function ${fnMatch[1] || 'anonymous'}(${fnMatch[2].trim()})`);
        continue;
      }

      // Const arrow function or method export
      const arrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/);
      if (arrowMatch) {
        symbols.push(`  const ${arrowMatch[1]} = (${(arrowMatch[2] ?? arrowMatch[3] ?? '').trim()}) => ...`);
        continue;
      }

      // Class method
      const methodMatch = trimmed.match(/^(?:async\s+)?([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/);
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
        symbols.push(`    method ${methodMatch[1]}(${methodMatch[2].trim()})`);
      }
    }

    if (!skipExports) {
      for (const e of this.extractCommonJsExports(code)) symbols.push(e.text);
    }

    return symbols;
  }

  extractPythonSymbols(code) {
    const symbols = [];
    const lines = code.split('\n');

    for (let line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('class ')) {
        const classMatch = trimmed.match(/^class\s+([A-Za-z0-9_]+)(?:\(([^)]*)\))?:/);
        if (classMatch) {
          symbols.push(`  class ${classMatch[1]}${classMatch[2] ? `(${classMatch[2]})` : ''}`);
        }
      } else {
        const fnMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
        if (fnMatch) {
          const indent = line.search(/\S/) > 0 ? '    def ' : '  def ';
          symbols.push(`${indent}${fnMatch[1]}(${fnMatch[2].trim()})${fnMatch[3] ? ` -> ${fnMatch[3].trim()}` : ''}`);
        }
      }
    }

    return symbols;
  }

  extractPhpSymbols(code) {
    const symbols = [];
    const lines = code.split('\n');

    for (let line of lines) {
      const trimmed = line.trim();

      // Class or Interface or Trait
      const classMatch = trimmed.match(/^(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z0-9_]+)/);
      if (classMatch) {
        symbols.push(`  ${classMatch[1]} ${classMatch[2]}`);
        continue;
      }

      // Standalone function or method
      const fnMatch = trimmed.match(/^(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/);
      if (fnMatch) {
        const indent = line.search(/\S/) > 0 ? '    function ' : '  function ';
        symbols.push(`${indent}${fnMatch[1]}(${fnMatch[2].trim()})`);
      }
    }

    return symbols;
  }

  extractJavaLikeSymbols(code) {
    const symbols = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const typeMatch = trimmed.match(/^(?:(?:public|protected|private|abstract|final|static|sealed|non-sealed|partial|typedef)\s+)*(class|interface|enum|record|struct|union|namespace)\s+([A-Za-z_$][\w$]*)/);
      if (typeMatch) {
        symbols.push(`  ${typeMatch[1]} ${typeMatch[2]}`);
        continue;
      }

      const methodMatch = trimmed.match(/^(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|override|virtual|sealed|async|extern|inline|constexpr|friend|partial|unsafe)\s+)*(?:<[^>]+>\s+)?(?:[\w$.:<>,?*&\[\]]+\s+)+([\w$]+(?:::\w+)*)\s*\(([^)]*)\)/);
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'return', 'throw'].includes(methodMatch[1])) {
        symbols.push(`    method ${methodMatch[1]}(${methodMatch[2].trim()})`);
      }
    }

    return symbols;
  }

  extractGoSymbols(code) {
    const symbols = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const typeMatch = trimmed.match(/^type\s+([A-Za-z_]\w*)\s+(struct|interface)\b/);
      if (typeMatch) {
        symbols.push(`  ${typeMatch[2]} ${typeMatch[1]}`);
        continue;
      }

      const functionMatch = trimmed.match(/^func\s+(?:\(\s*[^)]*\)\s*)?([A-Za-z_]\w*)\s*\(([^)]*)\)/);
      if (functionMatch) {
        const isMethod = /^func\s+\(/.test(trimmed);
        symbols.push(`  ${isMethod ? 'method' : 'function'} ${functionMatch[1]}(${functionMatch[2].trim()})`);
      }
    }

    return symbols;
  }

  extractRustSymbols(code) {
    const symbols = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const typeMatch = trimmed.match(/^(?:(?:pub(?:\([^)]*\))?|unsafe)\s+)*(struct|enum|trait|union)\s+([A-Za-z_]\w*)/);
      if (typeMatch) {
        symbols.push(`  ${typeMatch[1]} ${typeMatch[2]}`);
        continue;
      }

      const functionMatch = trimmed.match(/^(?:(?:pub(?:\([^)]*\))?|async|unsafe|const|extern(?:\s+"[^"]+")?)\s+)*fn\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/);
      if (functionMatch) {
        symbols.push(`  function ${functionMatch[1]}(${functionMatch[2].trim()})`);
      }
    }

    return symbols;
  }

  extractRubySymbols(code) {
    const symbols = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const typeMatch = trimmed.match(/^(class|module)\s+([A-Z]\w*(?:::\w+)*)/);
      if (typeMatch) {
        symbols.push(`  ${typeMatch[1]} ${typeMatch[2]}`);
        continue;
      }

      const functionMatch = trimmed.match(/^def\s+(?:self\.)?([A-Za-z_]\w*[!?=]?)\s*(?:\(([^)]*)\))?/);
      if (functionMatch) {
        symbols.push(`  method ${functionMatch[1]}(${(functionMatch[2] || '').trim()})`);
      }
    }

    return symbols;
  }

  extractKotlinSymbols(code) {
    const symbols = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const typeMatch = trimmed.match(/^(?:(?:public|internal|private|protected|open|abstract|data|sealed|enum|annotation|value|inner)\s+)*(class|interface|object)\s+([A-Za-z_]\w*)/);
      if (typeMatch) {
        symbols.push(`  ${typeMatch[1]} ${typeMatch[2]}`);
        continue;
      }

      const functionMatch = trimmed.match(/^(?:(?:public|internal|private|protected|open|override|suspend|inline|tailrec|operator|infix|external)\s+)*fun\s+(?:<[^>]+>\s+)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(([^)]*)\)/);
      if (functionMatch) {
        symbols.push(`  function ${functionMatch[1]}(${functionMatch[2].trim()})`);
      }
    }

    return symbols;
  }

  extractSwiftSymbols(code) {
    const symbols = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      const typeMatch = trimmed.match(/^(?:(?:public|private|fileprivate|internal|open|final|indirect)\s+)*(class|struct|enum|protocol|actor)\s+([A-Za-z_]\w*)/);
      if (typeMatch) {
        symbols.push(`  ${typeMatch[1]} ${typeMatch[2]}`);
        continue;
      }

      const functionMatch = trimmed.match(/^(?:(?:public|private|fileprivate|internal|open|static|class|mutating|override|final|async|nonisolated)\s+)*func\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
      if (functionMatch) {
        symbols.push(`  function ${functionMatch[1]}(${functionMatch[2].trim()})`);
      }
    }

    return symbols;
  }

  extractJsonSchema(code) {
    try {
      const obj = JSON.parse(code);
      if (Array.isArray(obj)) {
        return [`  Array with ${obj.length} items (type: ${typeof obj[0]})`];
      }
      return Object.keys(obj).slice(0, 15).map(k => `  key: "${k}" (${typeof obj[k]})`);
    } catch {
      return ['  Invalid JSON'];
    }
  }

  /**
   * Heading tree with the line range and size of each section, so an agent can read
   * one section (e.g. `sed -n 120,180p` or Read offset/limit) instead of the whole file.
   * Long documents keep levels 1-3 only.
   */
  extractMarkdownOutline(text) {
    const lines = text.split('\n');
    const heads = [];
    let fence = null;
    lines.forEach((line, i) => {
      const f = /^\s*(```|~~~)/.exec(line);
      if (f) { fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1]; return; }
      if (fence) return;
      const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) heads.push({ level: m[1].length, title: m[2], start: i + 1 });
    });
    if (!heads.length) return [`  L1-${lines.length} (no headings, ~${this.estimateTokens(text)} tok)`];
    const maxLevel = heads.length > 60 ? 3 : 6;
    const out = [];
    heads.forEach((h, idx) => {
      if (h.level > maxLevel) return;
      const next = heads.slice(idx + 1).find(n => n.level <= h.level);
      const end = next ? next.start - 1 : lines.length;
      const tok = this.estimateTokens(lines.slice(h.start - 1, end).join('\n'));
      const size = tok >= 1000 ? `${(tok / 1000).toFixed(1)}k` : String(tok);
      out.push(`${'  '.repeat(h.level)}L${h.start}-${end} ${'#'.repeat(h.level)} ${h.title} (~${size} tok)`);
    });
    return out;
  }

  extractGenericSymbols(code) {
    return code
      .split('\n')
      .filter(l => l.trim().length > 0)
      .slice(0, 10)
      .map(l => `  ${l.slice(0, 80)}`);
  }

  extractDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const summaries = [];
    let totalTokens = 0;
    let totalFull = 0;
    let totalSymbols = 0;

    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', 'build', '.lean'].includes(entry.name)) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isFile() && /\.(js|jsx|ts|tsx|mjs|cjs|py|php|phtml|java|cs|go|rs|rb|kt|kts|swift|c|h|cc|cpp|cxx|hh|hpp|hxx|json|md)$/i.test(entry.name)) {
        try {
          const res = this.extract(full);
          summaries.push(res.output);
          totalTokens += res.tokens;
          totalFull += res.fullTokens;
          totalSymbols += res.symbolCount;
        } catch {
          // ignore individual read errors
        }
      }
    }

    return {
      filePath: dirPath,
      symbolCount: totalSymbols,
      output: summaries.join('\n\n'),
      tokens: totalTokens,
      fullTokens: totalFull,
      savedPct: totalFull > 0 ? Math.max(0, Math.round(((totalFull - totalTokens) / totalFull) * 100)) : 0
    };
  }
}

module.exports = { SymbolIndexer };
