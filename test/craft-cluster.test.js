'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/core/crafting');
const S = require('../src/core/craft-sim');

test('cluster jewels: the enchantment decides the notables', () => {
  const fire = C.craftView({ base: 'Large Cluster Jewel', ilvl: 84, enchant: 'affliction_fire_damage' });
  const notables = (v) => [...v.prefix.families, ...v.suffix.families].filter((f) => /^1 Added Passive Skill is /.test(f.tiers[0].text)).map((f) => f.tiers[0].text.replace('1 Added Passive Skill is ', ''));
  assert.ok(notables(fire).includes('Prismatic Heart'));
  assert.ok(!notables(fire).includes('Fettle'));
  const life = C.craftView({ base: 'Small Cluster Jewel', ilvl: 84, enchant: 'affliction_maximum_life' });
  assert.ok(notables(life).includes('Fettle'));
  assert.equal(life.cluster.enchant, 'affliction_maximum_life');
});

test('cluster jewels: the enchantment is read from your item', () => {
  const t = 'Item Class: Jewels\nRarity: Normal\nLarge Cluster Jewel\n--------\nItem Level: 84\n--------\nAdds 12 Passive Skills (enchant)\n2 Added Passive Skills are Jewel Sockets (enchant)\nAdded Small Passive Skills grant: 10% increased Spell Damage (enchant)\n--------\nPlace into an allocated Large Jewel Socket.';
  const it = C.readItem(t);
  assert.equal(it.enchant, 'affliction_spell_damage');
  assert.equal(it.passives, 12);
  assert.equal(S.startItem({ text: t }).state.enchant, 'affliction_spell_damage');
});

test('cluster jewels: a Small one never gets a second notable', () => {
  const t = 'Item Class: Jewels\nRarity: Rare\nGrim Spark\nSmall Cluster Jewel\n--------\nItem Level: 84\n--------\nAdds 2 Passive Skills (enchant)\nAdded Small Passive Skills grant: 4% increased maximum Life (enchant)\n--------\n1 Added Passive Skill is Fettle\nAdded Small Passive Skills also grant: +5% to Fire Resistance\n--------\nPlace into an allocated Jewel Socket.';
  let seen = 0;
  for (let i = 0; i < 200; i++) {
    let s = S.startItem({ text: t }).state;
    s = S.act(s, 'exalt', {}, S.seeded(i + 1)).state || s;
    s = S.act(s, 'exalt', {}, S.seeded(i + 1000)).state || s;
    seen += s.mods.filter((m) => /^1 Added Passive Skill is /.test(m.text)).length > 1 ? 1 : 0;
  }
  assert.equal(seen, 0);
  // a Large one can
  const l = 'Item Class: Jewels\nRarity: Rare\nX\nLarge Cluster Jewel\n--------\nItem Level: 84\n--------\nAdds 8 Passive Skills (enchant)\nAdded Small Passive Skills grant: 12% increased Fire Damage (enchant)\n--------\n1 Added Passive Skill is Prismatic Heart\n--------\nPlace.';
  let two = 0;
  for (let i = 0; i < 200 && !two; i++) {
    let s = S.startItem({ text: l }).state;
    for (let k = 0; k < 3; k++) s = S.act(s, 'exalt', {}, S.seeded(i * 7 + k + 1)).state || s;
    two += s.mods.filter((m) => /^1 Added Passive Skill is /.test(m.text)).length > 1 ? 1 : 0;
  }
  assert.ok(two > 0);
});
