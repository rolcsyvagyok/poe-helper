'use strict';
// The craft emulator: currency, the bench, Harvest and fossils on an item, and fossil chances.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../src/core/craft-sim');

const fresh = () => S.startItem({ base: 'Vaal Regalia', ilvl: 86 }).state;
const run = (state, steps, seed = 1) => {
  const rng = S.seeded(seed);
  for (const [a, args] of steps) { const r = S.act(state, a, args, rng); assert.ok(r.state, `${a}: ${r.error}`); state = r.state; }
  return state;
};
const n = (s, sd) => s.mods.filter((m) => m.aff === sd).length;

test('currency follows the item rarity', () => {
  let s = fresh();
  assert.equal(S.act(s, 'chaos').error, 'Needs a rare item');
  s = run(s, [['transmute']]);
  assert.equal(s.rarity, 'Magic');
  assert.ok(s.mods.length >= 1 && s.mods.length <= 2 && n(s, 'prefix') <= 1 && n(s, 'suffix') <= 1);
  s = run(s, [['regal']]);
  assert.equal(s.rarity, 'Rare');
  s = run(s, [['scour']]);
  assert.equal(s.rarity, 'Normal');
  assert.equal(s.mods.length, 0);
});

test('a reforge gives 4 to 6 mods, never more than 3 a side, never two of one group', () => {
  const rng = S.seeded(5);
  const counts = new Map();
  let s = run(fresh(), [['alchemy']]);
  for (let i = 0; i < 600; i++) {
    s = S.act(s, 'chaos', {}, rng).state;
    counts.set(s.mods.length, (counts.get(s.mods.length) || 0) + 1);
    assert.ok(n(s, 'prefix') <= 3 && n(s, 'suffix') <= 3);
    const g = s.mods.flatMap((m) => m.groups);
    assert.equal(new Set(g).size, g.length);
  }
  assert.deepEqual([...counts.keys()].sort(), [4, 5, 6]);
  assert.ok(counts.get(4) > counts.get(5) && counts.get(5) > counts.get(6));
});

test('the bench adds one crafted mod, removed again; the metacraft keeps prefixes through a scour', () => {
  let s = run(fresh(), [['alchemy']], 2);
  while (n(s, 'suffix') >= 3 || n(s, 'prefix') < 1) s = S.act(s, 'chaos', {}, S.seeded(s.mods.length + 9)).state;
  const v = S.simView(s);
  const keep = v.bench.find((b) => b.meta === 'keepPrefixes');
  assert.ok(keep && !keep.why);
  const prefixes = s.mods.filter((m) => m.aff === 'prefix').map((m) => m.text);
  s = run(s, [['bench', { id: keep.id }]]);
  assert.match(S.act(s, 'bench', { id: v.bench.find((b) => !b.meta && b.aff === 'prefix').id }).error || '', /crafted mod|open prefix/);
  s = run(s, [['scour']]);
  assert.deepEqual(s.mods.map((m) => m.text), prefixes);
  assert.equal(s.rarity, 'Rare');
});

test('Harvest: a reforge with a tag always has a mod with that tag; resistances change element', () => {
  let s = run(fresh(), [['alchemy']]);
  for (let i = 0; i < 50; i++) {
    s = run(s, [['harvestReforge', { tag: 'life' }]], i);
    assert.ok(s.mods.some((m) => m.tags.includes('life')));
  }
  const rng = S.seeded(3);
  while (!s.mods.some((m) => /to Fire Resistance$/.test(m.text) && !/and/.test(m.text))) s = S.act(s, 'chaos', {}, rng).state;
  const fire = s.mods.find((m) => /to Fire Resistance$/.test(m.text) && !/and/.test(m.text));
  const r = S.act(s, 'harvestResist', { from: 'Fire', to: 'Cold' }, rng);
  if (r.state) {
    assert.ok(!r.state.mods.some((m) => m.id === fire.id));
    assert.ok(r.state.mods.some((m) => /to Cold Resistance$/.test(m.text)));
  } else assert.match(r.error, /already has Cold/);
});

test('fossils change the odds: Pristine (more life, no defences) on a body armour', () => {
  const base = { ...fresh(), rarity: 'Rare' };
  const life = S.candidates(base).find((c) => c.key === 'p|IncreasedLife');
  const lifeP = S.candidates(base, { fossils: [{ name: 'Pristine Fossil', more: [['life', 1000]], less: [['defences', 0]], added: [], text: '' }] }).find((c) => c.key === 'p|IncreasedLife');
  assert.equal(lifeP.w, life.w * 10);
  const o = S.fossilOdds(base, ['Pristine Fossil'], ['p|IncreasedLife'], 2000);
  assert.ok(o.each['p|IncreasedLife'] > 0.95, `life with Pristine: ${o.each['p|IncreasedLife']}`);
  assert.ok(o.chaos.each['p|IncreasedLife'] < 0.6);
  // no defence mods with Pristine
  let s = run(fresh(), [['alchemy']]);
  for (let i = 0; i < 40; i++) {
    s = run(s, [['fossil', { fossils: ['Pristine Fossil'] }]], i);
    assert.ok(!s.mods.some((m) => m.tags.includes('defences')));
  }
  assert.match(S.act(s, 'fossil', { fossils: ['Hollow Fossil'] }).error || 'ok', /ok|can't be used/);
  assert.match(S.act(S.startItem({ base: 'Ruby Ring' }).state, 'fossil', { fossils: ['Hollow Fossil'] }).error, /can't be used on this item/);
});

test('your own item: its mods, tiers, influence and fractured flags come in', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'craft-shaper-helmet.txt'), 'utf8');
  const r = S.startItem({ text });
  assert.ok(r.state, r.error);
  assert.equal(r.state.rarity, 'Rare');
  assert.deepEqual(r.state.influences, ['shaper']);
  assert.equal(r.state.mods.length, 4);
  const v = S.simView(r.state);
  assert.equal(v.prefixes.length, 2);
  assert.ok(v.prefixes.every((m) => m.tier));
  // an annul keeps the item rare and takes one mod off
  const a = S.act(r.state, 'annul', {}, S.seeded(1));
  assert.equal(a.state.mods.length, 3);
});

test('the best fossils for life + fire resistance beat a Chaos Orb, never stop a wanted mod, and fewer fossils win a tie', () => {
  const s = fresh();
  const b = S.bestFossils(s, ['p|IncreasedLife', 's|FireResistance'], { tries: 800, shortlist: 15, check: 4 });
  assert.ok(b.best.length);
  const top = b.best[0];
  assert.ok(top.all > b.chaos.all * 3, `${top.all} vs ${b.chaos.all}`);
  assert.ok(top.fossils.includes('Pristine Fossil'));
  // fossils that block life or fire (Dense: no life; Frigid: no fire) are never suggested
  for (const r of b.best) assert.ok(!r.fossils.includes('Dense Fossil') && !r.fossils.includes('Frigid Fossil'), r.fossils.join());
  // a bigger set is only listed when it does better than the smaller sets inside it
  for (const r of b.best) for (const q of b.best) if (q !== r && q.fossils.every((x) => r.fossils.includes(x))) assert.ok(r.all > q.all - 0.005);
});
