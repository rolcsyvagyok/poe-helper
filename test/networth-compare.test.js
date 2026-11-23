'use strict';
// WealthyExile's Changes tab: what changed between two snapshots, split into loot, spent, price moves.
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSnaps, NetWorthTracker } = require('../src/core/networth');

const snap = (ts, items, extra = 0) => ({ ts, league: 'L', totalChaos: items.reduce((a, [, q, e]) => a + q * e, 0) + extra, divine: 200, byTab: { Main: 1 },
  items: items.map(([n, q, e, c = 'Currency']) => ({ n, q, e, c })) });

test('the parts add up: loot at the new price, spent, and price moves on what you held', () => {
  const a = snap(0, [['Chaos Orb', 100, 1], ['Divine Orb', 5, 200], ['Fertile Catalyst', 10, 5]], 20);
  const b = snap(2 * 3600000, [['Chaos Orb', 160, 1], ['Divine Orb', 4, 210], ['Essence of Zeal', 3, 8, 'Essence']], 25);
  const r = compareSnaps(a, b);
  assert.equal(r.loot, 60 + 24); // 60 chaos, 3 essences at 8
  assert.equal(r.spent, -210 - 50); // a divine at the new price, the catalysts
  assert.equal(r.prices, 50); // 5 divines held, +10 each
  assert.equal(r.other, 5); // items under 1c
  assert.equal(r.total, r.loot + r.spent + r.prices + r.other);
  assert.equal(r.perHour, Math.round(r.total / 2));
  assert.equal(r.gained[0].n, 'Chaos Orb');
  assert.equal(r.lost[0].n, 'Divine Orb');
  assert.deepEqual(r.byCat.map((g) => g.c), ['Essence', 'Currency']);
});

test('"the snapshot before" skips snapshots taken seconds apart that are the same', () => {
  const store = new Map();
  const t = new NetWorthTracker({ store: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) } });
  const a = snap(1000, [['Chaos Orb', 10, 1]]);
  const b = snap(2000, [['Chaos Orb', 50, 1]]);
  const b2 = { ...b, ts: 2005 };
  const c = { ...b, ts: 2010 };
  store.set('snapshots', [a, b, b2, c]);
  const r = t.compare('L');
  assert.equal(r.result.from.ts, 1000);
  assert.equal(r.result.total, 40);
  assert.equal(t.compare('L', { from: 2000 }).result.total, 0);
});

test('3.30 maps: a plain T16, a conqueror one by its citadel, a Nightmare map, a Vaal Temple map', () => {
  const N = require('../src/core/networth');
  const L = (name, baseType, chaos) => ({ name, baseType, chaos });
  const idx = N.buildIndex({ Map: [L('Baran Map (Tier 16)', 'Map (Tier 16)', 35), L('The Purifier Map (Tier 16)', 'Map (Tier 16)', 10), L('Map (Tier 16)', null, 2), L('Nightmare Map', null, 74), L('Al-Hezmin Vaal Temple Map', 'Vaal Temple Map', 56), L('Vaal Temple Map', null, 30)] });
  const v = (t, imp = []) => N.valueItem({ typeLine: t, baseType: t, frameType: 0, implicitMods: imp, properties: [{ name: 'Map Area', values: [['Tower', 0]] }] }, idx);
  assert.equal(v('Map (Tier 16)').each, 2);
  assert.equal(v('Map (Tier 16)', ["Map contains Baran's Citadel"]).each, 35);
  assert.equal(v('Map (Tier 16)', ["Map contains Baran's Citadel"]).name, 'Baran Map (Tier 16)');
  assert.equal(v('Nightmare Map').each, 74);
  assert.equal(v('Vaal Temple Map').each, 30);
});
