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
