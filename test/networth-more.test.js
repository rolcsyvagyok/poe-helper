'use strict';
const test = require('node:test');
const assert = require('node:assert');
const NW = require('../src/core/networth');

test('WealthyExile prices invitations, shards, 3.30 maps, normal cluster jewels and Wickerman parts', () => {
  const idx = NW.buildIndex({
    Invitation: [{ name: 'Polaric Invitation', chaos: 12 }],
    Currency: [{ name: 'Orb of Alteration', chaos: 0.2 }],
    BlightedMap: [{ name: 'Blighted Map (Tier 1)', chaos: 4 }],
    ClusterJewel: [{ name: 'Staff Attacks deal 12% increased Damage with Hits and Ailments, Mace or Sceptre Attacks deal 12% increased Damage with Hits and Ailments', baseType: 'Large Cluster Jewel', variant: '8 passives', levelRequired: 75, chaos: 250 },
      { name: 'Staff Attacks deal 12% increased Damage with Hits and Ailments, Mace or Sceptre Attacks deal 12% increased Damage with Hits and Ailments', baseType: 'Large Cluster Jewel', variant: '8 passives', levelRequired: 84, chaos: 300 }],
    Viscera: [{ name: 'Defaced Bust', variant: '#% increased Stun and Block Recovery', chaos: 1 }, { name: 'Defaced Bust', variant: 'Gain an Endurance Charge when you Stun an Enemy with a Melee Hit', chaos: 17 }],
  });
  const v = (it) => NW.valueItem(it, idx)?.each ?? null;
  assert.strictEqual(v({ frameType: 0, typeLine: 'Polaric Invitation', ilvl: 83 }), 12);
  assert.strictEqual(v({ frameType: 5, typeLine: 'Transmutation Shard', stackSize: 18 }), null); // no Transmutation price here
  assert.strictEqual(v({ frameType: 0, typeLine: 'Alteration Shard', stackSize: 18 }), 0.01);
  assert.strictEqual(v({ frameType: 0, typeLine: 'Blighted Map (Tier 1)', ilvl: 70 }), 4);
  assert.strictEqual(v({ frameType: 0, typeLine: 'Large Cluster Jewel', ilvl: 83, enchantMods: ['Adds 8 Passive Skills', '2 Added Passive Skills are Jewel Sockets', 'Added Small Passive Skills grant: Staff Attacks deal 12% increased Damage with Hits and Ailments\nAdded Small Passive Skills grant: Mace or Sceptre Attacks deal 12% increased Damage with Hits and Ailments'] }), 250);
  assert.strictEqual(v({ frameType: 15, typeLine: 'Defaced Bust', ilvl: 83, implicitMods: [{ description: '27% increased Stun and Block Recovery' }] }), 1);
});

test('price check: a normal cluster jewel by its grants, passives and item level bracket', () => {
  const { parseItem } = require('../src/core/item-parser');
  const { pickCluster } = require('../src/core/pricer');
  const it = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'cluster-normal-two-grants.txt'), 'utf8'));
  const name = 'Staff Attacks deal 12% increased Damage with Hits and Ailments, Mace or Sceptre Attacks deal 12% increased Damage with Hits and Ailments';
  const L = (lvl, chaos, v = '8 passives') => ({ name, baseType: 'Large Cluster Jewel', variant: v, levelRequired: lvl, chaos });
  assert.strictEqual(pickCluster([L(84, 300), L(75, 250), L(68, 220), L(75, 10, '9 passives')], it).best.chaos, 250);
});
