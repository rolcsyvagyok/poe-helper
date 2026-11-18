'use strict';
const test = require('node:test');
const assert = require('node:assert');
const c = require('../src/core/crafting');

test('crafting: chances on each side add up to 100%, tiers best first, tags shown', () => {
  const v = c.craftView({ base: 'Vaal Regalia', ilvl: 86 });
  for (const s of [v.prefix, v.suffix]) assert.ok(Math.abs(s.families.reduce((n, f) => n + f.chance, 0) - 1) < 1e-9);
  const life = v.prefix.families.find((f) => f.text === '+# to maximum Life');
  assert.strictEqual(life.tiers[0].name, 'Prime');
  assert.deepStrictEqual(life.tags, ['Life']);
});

test('crafting: item level locks the top tiers; influence adds its mods', () => {
  const low = c.craftView({ base: 'Vaal Regalia', ilvl: 70 });
  const life = low.prefix.families.find((f) => f.text === '+# to maximum Life');
  assert.strictEqual(life.tiers[0].chance, 0);
  const plain = c.craftView({ base: 'Imbued Wand', ilvl: 86 });
  const shaper = c.craftView({ base: 'Imbued Wand', ilvl: 86, influences: ['shaper'] });
  assert.ok(shaper.prefix.families.some((f) => f.influence === 'Shaper'));
  assert.ok(!plain.prefix.families.some((f) => f.influence));
});

test('crafting: your item, its mods and tiers, open slots, groups that can\'t roll again', () => {
  const text = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'craft-talisman.txt'), 'utf8');
  const v = c.craftView({ item: text });
  assert.strictEqual(v.base.name, 'Flame Hellion Talisman');
  assert.strictEqual(v.ilvl, 85);
  assert.deepStrictEqual(v.item.mods.map((m) => `${m.name} T${m.tier}`), ['Glinting T9', 'of Penetrating T2', 'of the Student T8', 'of the Kaleidoscope T4']);
  assert.deepStrictEqual(v.item.slots, { max: 3, prefix: 1, suffix: 3 });
  const crit = v.suffix.families.find((f) => f.yours?.name === 'of Penetrating');
  assert.strictEqual(crit.chance, 0);
  assert.ok(Math.abs(v.prefix.families.reduce((n, f) => n + f.chance, 0) - 1) < 1e-9);
  // a plain copy (no mod names) finds the same mods by their text
  const plain = text.split('\n').filter((l) => !/^\{/.test(l)).join('\n').replace(/(\d)\(-?[\d.]+-[\d.]+\)/g, '$1');
  assert.deepStrictEqual(c.craftView({ item: plain }).item.mods.map((m) => m.tier), [9, 2, 8, 4]);
});

test('crafting: a Shaper suffix with a socketed support is found at its own tier', () => {
  const text = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'craft-shaper-helmet.txt'), 'utf8');
  const v = c.craftView({ item: text });
  const hypo = v.item.mods.find((m) => m.name === 'of Shaping');
  assert.strictEqual(hypo.tier, 1);
  const f = v.suffix.families.find((x) => x.key === hypo.key);
  assert.match(f.range, /Hypothermia Support/);
  assert.deepStrictEqual(v.item.slots, { max: 3, prefix: 2, suffix: 2 });
});

test('captured beasts are priced from poe.ninja\'s beasts by name', async () => {
  const { parseItem } = require('../src/core/item-parser');
  const { Pricer, categoriesFor } = require('../src/core/pricer');
  const it = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'captured-beast.txt'), 'utf8'));
  assert.deepStrictEqual(categoriesFor(it), ['Beast']);
  const p = new Pricer({ ninja: { divinePrice: async () => 200, cachedAge: () => 1, category: async () => [{ name: 'Wild Bristle Matron', chaos: 45, listingCount: 30 }] }, getLeague: async () => 'X' });
  const r = await p.price(it);
  assert.strictEqual(r.chaos, 45);
});

test('crafting: veiled mods (what unveiling can give) and each influence\'s own mods', () => {
  const v = c.craftView({ base: 'Vaal Regalia', ilvl: 86 });
  assert.ok(v.veiled.prefix.families.length > 0 && v.veiled.suffix.families.length > 0);
  for (const s of [v.veiled.prefix, v.veiled.suffix]) assert.ok(Math.abs(s.families.reduce((n, f) => n + f.chance, 0) - 1) < 1e-9);
  assert.ok(v.veiled.suffix.families.every((f) => f.offered >= f.chance && f.offered <= 1));
  assert.ok(!v.veiled.prefix.families.some((f) => f.tags.includes('Unveiled Mod')));
  for (const [id] of c.INFLUENCES) assert.ok(v.influenceMods[id].prefix.families.length + v.influenceMods[id].suffix.families.length > 0, id);
  assert.ok(v.influenceMods.elder.suffix.families.every((f) => f.influence === 'Elder'));
});

test('crafting: the best blocker for the mods you want (a metacraft blocks a whole tag on both sides)', () => {
  let v = c.craftView({ base: 'Imbued Wand', ilvl: 86 });
  const want = v.prefix.families.filter((f) => f.group === 'WeaponSpellDamage' || /^p\|WeaponSpellDamage/.test(f.key)).map((f) => f.key);
  v = c.craftView({ base: 'Imbued Wand', ilvl: 86, targets: want });
  const best = v.blockers.rows[0];
  assert.strictEqual(best.meta, 'attack');
  assert.ok(best.after.prefix > v.blockers.before.prefix);
  // a blocker that would block what you want isn't offered
  assert.ok(!v.blockers.rows.some((r) => r.meta === 'caster'));
});
