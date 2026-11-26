#!/usr/bin/env node
/**
 * Release helper for CHANGELOG.md (Keep a Changelog format).
 *
 *   node scripts/changelog.js          Stamp [Unreleased] as the current package.json version.
 *                                      Runs automatically from `npm version <patch|minor|major>`.
 *   node scripts/changelog.js --check  Fail unless the current version has a changelog entry.
 *                                      Runs from `prepublishOnly` and CI.
 *   node scripts/changelog.js --notes  Print the current version's entry (GitHub Release notes).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'CHANGELOG.md');
const { version, repository } = require(path.join(root, 'package.json'));
const repo = ((repository && repository.url) || '').replace(/^git\+/, '').replace(/\.git$/, '');

const fail = msg => { console.error(`changelog: ${msg}`); process.exit(1); };
const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const has = v => new RegExp(`^## \\[${v.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm').test(text);

if (process.argv.includes('--notes')) {
  // Body of the current version's entry, for the GitHub Release (used by .github/workflows/release.yml)
  const m = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - .*\\n([\\s\\S]*?)(?=^## \\[|^\\[Unreleased\\]:)`, 'm').exec(text);
  if (!m) fail(`no entry for ${version}`);
  process.stdout.write(`${m[1].trim()}\n`);
  process.exit(0);
}

if (process.argv.includes('--check')) {
  if (!has(version)) fail(`no "## [${version}] - YYYY-MM-DD" entry. Run \`npm version <patch|minor|major>\` to release.`);
  console.log(`changelog: ${version} documented`);
  process.exit(0);
}

if (has(version)) fail(`${version} is already in CHANGELOG.md`);
const m = /^## \[Unreleased\]\n([\s\S]*?)(?=^## \[|^\[Unreleased\]:)/m.exec(text);
if (!m) fail('missing "## [Unreleased]" section');
if (!/^- /m.test(m[1])) fail('[Unreleased] has no entries: describe the changes before releasing');

const previous = (/^## \[(\d+\.\d+\.\d+[^\]]*)\]/m.exec(text.slice(m.index + m[0].length)) || [])[1];
const d = new Date(); // release date in the releaser's local time zone
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let out = text.replace(m[0], `## [Unreleased]\n\n## [${version}] - ${today}\n${m[1].replace(/^\n+/, '\n')}`);

const links = [`[Unreleased]: ${repo}/compare/v${version}...HEAD`,
  previous ? `[${version}]: ${repo}/compare/v${previous}...v${version}` : `[${version}]: ${repo}/releases/tag/v${version}`];
out = out.replace(/^\[Unreleased\]:.*$/m, links.join('\n'));
fs.writeFileSync(file, out, 'utf8');
console.log(`changelog: released ${version} (${today})`);
