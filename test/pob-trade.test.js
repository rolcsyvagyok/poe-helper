'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/core/pob-trade');

const STATS = { result: [
  { id: 'pseudo', entries: [
    { id: 'pseudo.pseudo_total_life', text: '+# total maximum Life', type: 'pseudo' },
    { id: 'pseudo.pseudo_total_cold_resistance', text: '+#% total to Cold Resistance', type: 'pseudo' },
  ] },
  { id: 'explicit', entries: [
    { id: 'explicit.stat_life', text: '+# to maximum Life', type: 'explicit' },
    { id: 'explicit.stat_phys_local', text: '#% increased Physical Damage (Local)', type: 'explicit' },
    { id: 'explicit.stat_phys_global', text: '#% increased Global Physical Damage', type: 'explicit' },
    { id: 'explicit.stat_es_local', text: '+# to maximum Energy Shield (Local)', type: 'explicit' },
    { id: 'explicit.stat_es', text: '+# to maximum Energy Shield', type: 'explicit' },
  ] },
] };

test('PoB trade search: only mods the item kind can have, weights from what PoB says they are worth', () => {
  const ring = T.candidatesFor('Ring').map((c) => c.line);
  assert.ok(ring.includes('+100 to maximum Life'));
  assert.ok(!ring.includes('30% increased Movement Speed'));
  assert.ok(T.candidatesFor('Boots').some((c) => c.line === '30% increased Movement Speed'));
  assert.ok(T.candidatesFor('Thrusting One Handed Sword').some((c) => c.line === '150% increased Physical Damage'));
  assert.deepStrictEqual(T.candidatesFor('Flask'), []);

  const cands = T.candidatesFor('Helmet');
  const life = cands.findIndex((c) => c.line === '+100 to maximum Life');
  const cold = cands.findIndex((c) => c.line === '+40% to Cold Resistance');
  const es = cands.findIndex((c) => c.line === '+60 to maximum Energy Shield');
  const results = cands.map(() => ({ dpsPct: 0, ehpPct: 0 }));
  results[life] = { dpsPct: 0, ehpPct: 5 }; // 5% EHP for 100 life: 0.05 per point
  results[cold] = { dpsPct: 0, ehpPct: 16 }; // 16% for 40% res: 0.4 per point
  results[es] = { dpsPct: 0, ehpPct: 1.2 };
  const w = T.weightsFrom(results, cands, STATS, { focus: 'defence' });
  assert.deepStrictEqual(w.weights.map((x) => x.id), ['pseudo.pseudo_total_cold_resistance', 'pseudo.pseudo_total_life', 'explicit.stat_es_local']);
  assert.strictEqual(w.weights[0].tradeWeight, 100);
  assert.strictEqual(w.weights[1].tradeWeight, 12.5);
  assert.strictEqual(w.weights[2].tradeWeight, 5);
  // damage only: nothing here adds damage
  assert.strictEqual(T.weightsFrom(results, cands, STATS, { focus: 'damage' }).weights.length, 0);
  // weapon damage uses the weapon's own (local) stat
  const wc = T.candidatesFor('Two Handed Sword');
  const wr = wc.map((c) => ({ dpsPct: c.line === '150% increased Physical Damage' ? 40 : 0, ehpPct: 0 }));
  assert.strictEqual(T.weightsFrom(wr, wc, STATS, { focus: 'damage' }).weights[0].id, 'explicit.stat_phys_local');
});

test('PoB trade search: weighted sum query with level, price and category; sorted best first', () => {
  const q = T.buildWeightedQuery({ weights: [{ id: 'a', tradeWeight: 100 }, { id: 'b', tradeWeight: 12.5 }], category: 'armour.helmet', maxLevel: 80, maxPriceChaos: 150, minSum: 1234.567 });
  assert.deepStrictEqual(q.sort, { 'statgroup.0': 'desc' });
  assert.deepStrictEqual(q.query.stats[0], { type: 'weight', filters: [{ id: 'a', value: { weight: 100 } }, { id: 'b', value: { weight: 12.5 } }], value: { min: 1234.57 } });
  assert.deepStrictEqual(q.query.filters.req_filters, { filters: { lvl: { max: 80 } } });
  assert.deepStrictEqual(q.query.filters.trade_filters, { filters: { price: { max: 150 } } });
  assert.strictEqual(q.query.filters.type_filters.filters.category.option, 'armour.helmet');
  const open = T.buildWeightedQuery({ weights: [{ id: 'a', tradeWeight: 1 }] });
  assert.strictEqual(open.query.filters.req_filters, undefined);
  assert.strictEqual(open.query.stats[0].value, undefined);
});

test('PoB trade search: a trade listing becomes the text the game copies', () => {
  const t = T.itemTextFromTrade({ frameType: 2, name: 'Doom Loop', typeLine: 'Steel Ring', ilvl: 84, implicitMods: ['Adds 3 to 11 Physical Damage to Attacks'], explicitMods: ['+70 to maximum Life'], craftedMods: ['+30% to Fire Resistance'], corrupted: true });
  assert.strictEqual(t, ['Rarity: Rare', 'Doom Loop', 'Steel Ring', '--------', 'Item Level: 84', '--------', 'Adds 3 to 11 Physical Damage to Attacks (implicit)', '--------', '+70 to maximum Life', '+30% to Fire Resistance (crafted)', '--------', 'Corrupted'].join('\n'));
});

test('weapons only try mods their type can roll, and your item\'s own weighted sum', () => {
  const T = require('../src/core/pob-trade');
  assert.ok(!T.candidatesFor('Two Handed Mace').some((c) => /Minion|Spell|Cast Speed/.test(c.line)), 'no caster mods on a two-handed mace');
  assert.ok(T.candidatesFor('Wand').some((c) => /Minion Skill Gems/.test(c.line)));
  assert.ok(T.candidatesFor('Helmet').some((c) => /Minion Skill Gems/.test(c.line)), 'armour keeps its own list');
  const weights = [{ id: 'explicit.fire', tradeWeight: 94 }, { id: 'explicit.phys', tradeWeight: 21.5 }];
  const mods = [{ id: 'explicit.fire', display: 75 }, { id: 'explicit.phys', display: 150 }, { id: 'crafted.str', display: 40 }, { id: null, display: 5 }];
  assert.equal(T.itemSum(mods, weights), 94 * 75 + 21.5 * 150);
});
