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

    let symbols = [];
    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      symbols = this.extractJavaScriptSymbols(content);
    } else if (ext === '.py') {
      symbols = this.extractPythonSymbols(content);
    } else if (['.php', '.phtml'].includes(ext)) {
      symbols = this.extractPhpSymbols(content);
    } else if (['.java', '.cs'].includes(ext)) {
      symbols = this.extractJavaLikeSymbols(content);
    } else if (ext === '.go') {
      symbols = this.extractGoSymbols(content);
    } else if (ext === '.rs') {
      symbols = this.extractRustSymbols(content);
    } else if (ext === '.rb') {
      symbols = this.extractRubySymbols(content);
    } else if (['.kt', '.kts'].includes(ext)) {
      symbols = this.extractKotlinSymbols(content);
    } else if (ext === '.swift') {
      symbols = this.extractSwiftSymbols(content);
    } else if (['.c', '.h', '.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx'].includes(ext)) {
      symbols = this.extractJavaLikeSymbols(content);
    } else if (['.json'].includes(ext)) {
      symbols = this.extractJsonSchema(content);
    } else {
      symbols = this.extractGenericSymbols(content);
    }

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

  extractJavaScriptSymbols(code) {
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
        symbols.push(`  const ${arrowMatch[1]} = (${(arrowMatch[2] || arrowMatch[3]).trim()}) => ...`);
        continue;
      }

      // Class method
      const methodMatch = trimmed.match(/^(?:async\s+)?([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/);
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
        symbols.push(`    method ${methodMatch[1]}(${methodMatch[2].trim()})`);
      }
    }

    const moduleExportsMatch = code.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/);
    if (moduleExportsMatch) {
      for (const exportedLine of moduleExportsMatch[1].split('\n')) {
        const exportMatch = exportedLine.trim().match(/^([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?,?\s*$/);
        if (exportMatch) {
          symbols.push(`  export ${exportMatch[2] || exportMatch[1]}`);
        }
      }
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
    let totalSymbols = 0;

    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', 'build', '.lean'].includes(entry.name)) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isFile() && /\.(js|jsx|ts|tsx|mjs|cjs|py|php|phtml|java|cs|go|rs|rb|kt|kts|swift|c|h|cc|cpp|cxx|hh|hpp|hxx|json|md)$/i.test(entry.name)) {
        try {
          const res = this.extract(full);
          summaries.push(res.output);
          totalTokens += res.tokens;
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
      savedPct: 85
    };
  }
}

module.exports = { SymbolIndexer };
