/**
 * Terminal colour for human-facing output. Zero dependencies.
 * Colour is on only when stdout is a TTY (agents read piped output, which stays plain and costs no
 * extra tokens), and follows the conventions: NO_COLOR or --no-color turn it off, FORCE_COLOR on.
 */

function enabled(stream = process.stdout, argv = process.argv, env = process.env) {
  if (argv.includes('--no-color') || 'NO_COLOR' in env) return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
  return Boolean(stream && stream.isTTY) && env.TERM !== 'dumb';
}

const truecolor = (env = process.env) => /truecolor|24bit/i.test(env.COLORTERM || '') || Boolean(env.WT_SESSION);

function make(on = enabled(), tc = truecolor()) {
  const wrap = (open, close) => s => (on ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
  const c = {
    on,
    bold: wrap(1, 22), dim: wrap(2, 22), italic: wrap(3, 23), underline: wrap(4, 24),
    red: wrap(31, 39), green: wrap(32, 39), yellow: wrap(33, 39), blue: wrap(34, 39),
    magenta: wrap(35, 39), cyan: wrap(36, 39), gray: wrap(90, 39)
  };

  /** Left-to-right colour sweep (cyan → violet → pink); a bold cyan fallback without truecolor. */
  c.gradient = (s, stops = [[0, 210, 255], [140, 90, 255], [255, 80, 180]]) => {
    if (!on) return String(s);
    if (!tc) return c.bold(c.cyan(s));
    const chars = [...String(s)];
    const n = Math.max(1, chars.length - 1);
    return chars.map((ch, i) => {
      const t = (i / n) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(t));
      const f = t - k;
      const [r, g, b] = stops[k].map((v, j) => Math.round(v + (stops[k + 1][j] - v) * f));
      return ch === ' ' ? ch : `\x1b[1;38;2;${r};${g};${b}m${ch}`;
    }).join('') + '\x1b[0m';
  };

  /** Highlight commands to run, numbers and percentages inside a line of plain text. */
  c.accents = line => line
    .replace(/(run: )([^)]+)/g, (_, a, cmd) => a + c.cyan(cmd))
    .replace(/`[^`]+`/g, x => c.cyan(x))
    .replace(/(-\d+(?:\.\d+)?%)/g, x => c.bold(c.green(x)))
    .replace(/(?<![\w.~/;[-])(~?\d[\d,]*(?:\.\d+)?(?:k| ?ms| ?KB| tokens)?)(?!\.?[\w/-])/g, x => c.bold(x));

  /**
   * Colour a block of LeanToken output, line by line, keeping the text identical:
   * ✓ / ! / ✗ marks, ⚡ title lines, ═ rules, section headings ending with ':'.
   */
  c.paint = text => {
    if (!on) return text;
    return String(text).split('\n').map(line => {
      let m;
      if (/^═+$/.test(line.trim())) return c.dim(c.cyan(line));
      if ((m = /^(\s*)⚡ (LeanToken)(.*)$/.exec(line))) return `${m[1]}⚡ ${c.gradient(m[2])}${c.bold(m[3])}`;
      if ((m = /^(\s*)✓ (.*)$/.exec(line))) return `${m[1]}${c.green('✓')} ${c.accents(m[2])}`;
      if ((m = /^(\s*)! (.*)$/.exec(line))) return `${m[1]}${c.bold(c.yellow('!'))} ${c.accents(m[2])}`;
      if ((m = /^(\s*)✗ (.*)$/.exec(line))) return `${m[1]}${c.bold(c.red('✗'))} ${c.red(m[2])}`;
      if ((m = /^(\s*)- (.*)$/.exec(line))) return `${m[1]}${c.dim(`- ${m[2]}`)}`;
      if ((m = /^(\s*)(lean \S.*?)(\s{2,}.*)?$/.exec(line))) return `${m[1]}${c.cyan(m[2])}${m[3] || ''}`;
      if (/^\s{0,2}[A-Z][\w ()/&.,'-]*:$/.test(line)) return c.bold(c.magenta(line));
      if (/^ {2}[A-Z][^:]*$/.test(line) && line.length < 60) return c.bold(line); // audit section titles
      return c.accents(line);
    }).join('\n');
  };

  return c;
}

module.exports = { enabled, truecolor, make };
