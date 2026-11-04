'use strict';
// Writes this version's section of CHANGELOG.md to build/release-notes.md, which electron-builder
// uses as the GitHub release text (and installed apps show it when the update is ready).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));
const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const part = text.split(/^## /m).slice(1).find((p) => p.split(/\s/)[0] === version);
if (!part) {
  console.error(`CHANGELOG.md has no "## ${version} - YYYY-MM-DD" section. Add your patch notes for ${version} first.`);
  process.exit(1);
}
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'release-notes.md'), part.split('\n').slice(1).join('\n').trim() + '\n');
console.log(`Release notes for ${version} written.`);
