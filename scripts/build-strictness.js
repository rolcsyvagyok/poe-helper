'use strict';
/**
 * Builds src/core/filter/strictness.json from FilterBlade's seven strictness downloads of one filter
 * (Soft ... Uber Plus Strict). Strictness only switches tiers on, off or hidden; this keeps, for every
 * tier that changes between levels, its state at each level. Tiers that are the same at every level
 * (your own FilterBlade choices among them) aren't listed, so they are never touched.
 *
 *   node scripts/build-strictness.js <soft> <regular> <semi> <strict> <very> <uber> <uber+>
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('../src/core/filter/parser');

const files = process.argv.slice(2);
if (files.length !== 7) { console.error('Give the 7 filters, Soft first.'); process.exit(1); }
const CODE = { Show: 'S', Hide: 'H', Off: 'O' };
const perLevel = files.map((f) => {
  const doc = parse(fs.readFileSync(f, 'utf8'));
  const states = new Map();
  for (const b of doc.segments) {
    if (b.kind !== 'block') continue;
    const m = /\$type->(\S+).*?\$tier->(\S+)/.exec(b.headerRaw || '');
    if (!m) continue;
    const key = `${m[1]}|${m[2]}`;
    const st = b.disabled ? 'O' : CODE[b.action] || 'S';
    // one tier can have several blocks: the tier's state is the first block's unless they differ
    const prev = states.get(key);
    states.set(key, prev && prev !== st ? '*' : st);
  }
  return states;
});
const version = /^# VERSION:\s*(\S+)/m.exec(fs.readFileSync(files[0], 'utf8'))?.[1] || null;
const tiers = {};
for (const key of perLevel[0].keys()) {
  const s = perLevel.map((m) => m.get(key) || '?').join('');
  if (/[*?]/.test(s) || new Set(s).size === 1) continue;
  tiers[key] = s;
}
const out = { version, levels: ['Soft', 'Regular', 'Semi-Strict', 'Strict', 'Very Strict', 'Uber Strict', 'Uber Plus Strict'], tiers };
const target = path.join(__dirname, '..', 'src', 'core', 'filter', 'strictness.json');
fs.writeFileSync(target, JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + '\n');
console.log(`${Object.keys(tiers).length} tiers change with strictness (${version}) -> ${target}`);
