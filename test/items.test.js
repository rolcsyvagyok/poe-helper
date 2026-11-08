'use strict';
const test = require('node:test');
const assert = require('node:assert');
const it = require('../src/core/regex/items');

// a tier's text with its lowest or highest roll, as the game shows it on an item
const roll = (text, hi) => text.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, (_, a, b) => (hi ? b : a)).toLowerCase();

test('number regex: at least n', () => {
  for (let n = 2; n < 1200; n += 1) {
    const re = new RegExp(`${it.atLeast(n)} x`);
    for (let v = 0; v < 2500; v += 7) assert.strictEqual(re.test(`+${v} x`), v >= n, `${n} vs ${v}`);
  }
});

test('item terms find their mod (at the tier asked) and no other mod the base can roll', () => {
  for (const base of ['Astral Plate', 'Two-Stone Ring', 'Imbued Wand', 'Hubris Circlet', 'Cobalt Jewel', 'Divine Life Flask', 'Stygian Vise']) {
    const v = it.modsView({ base });
    for (const f of v.families) {
      for (const tierPick of [0, Math.min(2, f.tiers.length)]) {
        const r = it.buildItemRegex({ base, picks: { [f.key]: tierPick } });
        const re = new RegExp(r.parts[0].text, 'i');
        for (const g of v.families) {
          for (const t of g.tiers) {
            const line = roll(t.text.split(' / ')[0], false);
            if (g === f) {
              if (!tierPick || t.tier <= tierPick) assert.ok(re.test(line), `${base}: ${r.parts[0].text} should find "${line}" (T${t.tier})`);
            } else if (g.tiers[0].text.split(' / ').every((l) => l.replace(/\([^)]*\)|[\d.]+/g, '#').toLowerCase() !== f.text[0].toLowerCase())) {
              assert.ok(!t.text.toLowerCase().split(' / ').map((l) => roll(l, true)).some((l) => re.test(l)), `${base}: ${r.parts[0].text} (${f.text[0]}) also finds "${t.text}"`);
            }
          }
        }
      }
    }
  }
});
