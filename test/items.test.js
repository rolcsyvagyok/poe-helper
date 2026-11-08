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

test('magic items: every T1/T2 name piece finds its own mod on the item name and no other mod there', () => {
  let checked = 0;
  for (const t of it.itemTypes()) for (const v of (t.variants || [{ id: null }])) {
    const view = it.magicView({ type: t.id, variant: v.id });
    const all = it.families({ base: view.base }).families;
    const nameLine = (g, x) => (g.aff === 'prefix' ? `${x.name} ${view.base}` : `${view.base} ${x.name}`);
    for (const f of view.families) {
      const r = it.buildMagicRegex({ type: t.id, variant: v.id, picks: { [f.key]: f.tiers.map((x) => x.tier) } });
      const re = new RegExp(r.parts[0].text, 'im');
      checked += 1;
      for (const g of all) for (const x of g.tiers) {
        if (!x.name) continue;
        const own = g.key === f.key && f.tiers.some((y) => y.tier === x.tier);
        const sameName = g.aff === f.aff && f.tiers.some((y) => y.name === x.name);
        if (!sameName) assert.strictEqual(re.test(nameLine(g, x)), own, `${t.id} ${v.id || ''}: ${r.parts[0].text} vs "${nameLine(g, x)}"`);
      }
    }
  }
  assert.ok(checked > 2000);
});

test('magic items: ticked mods must all be there, ticked tiers of one mod are either-or', () => {
  const v = it.magicView({ type: 'Wand' });
  const fire = v.families.find((f) => f.text[0] === '#% increased Fire Damage');
  const cast = v.families.find((f) => f.text[0] === '#% increased Cast Speed');
  const r = it.buildMagicRegex({ type: 'Wand', picks: { [fire.key]: [1, 2], [cast.key]: [1] } });
  assert.strictEqual(r.parts.length, 2);
  assert.match(r.regex, /^"[^"]+\|[^"]+" "[^"|]+"$/);
});
