'use strict';
// Blighted and Blight-ravaged maps: poe.ninja prices them by tier, the trade site finds them by their implicits.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseItem } = require('../src/core/item-parser');
const T = require('../src/core/trade');
const P = require('../src/core/pricer');

const STATS = { result: [
  { id: 'implicit', entries: [
    { id: 'implicit.stat_299373046', text: 'Area is infested with Fungal Growths\nCan be Anointed up to 3 times', type: 'implicit' },
    { id: 'implicit.stat_2656027173', text: 'Natural inhabitants of this area have been removed', type: 'implicit' },
  ] },
  { id: 'explicit', entries: [{ id: 'explicit.cold', text: 'Monsters deal #% extra Physical Damage as Cold', type: 'explicit' }] },
] };
const map = (rarity, name, extra = '') => parseItem(`Item Class: Maps
Rarity: ${rarity}
${name}
--------
Map Tier: 16
--------
Item Level: 83
--------
Area is infested with Fungal Growths
Map's Item Quantity Modifiers also affect Blight Chest count at 25% value
Can be Anointed up to ${/ravaged/.test(name) ? 9 : 3} times
Natural inhabitants of this area have been removed${extra}
--------
Travel to this Map by using it in a personal Map Device. Maps can only be used once.`);
const NINJA = [14, 15, 16].map((t) => ({ name: `Blighted Map (Tier ${t})`, chaosValue: t, listingCount: 100 }));

test('a blighted map is priced from its tier on poe.ninja, a magic one too', () => {
  for (const it of [map('Normal', 'Blighted Map (Tier 16)'), map('Magic', 'Fecund Blighted Map (Tier 16)'), map('Normal', 'Blighted Strand Map')]) {
    assert.deepEqual(P.categoriesFor(it), ['BlightedMap']);
    assert.equal(P.pickMap(NINJA, it).best.name, 'Blighted Map (Tier 16)');
  }
  assert.deepEqual(P.categoriesFor(map('Rare', 'Dread Cage\nBlight-ravaged Map (Tier 16)')), ['BlightRavagedMap']);
});

test('the trade search finds a blighted map by its implicit (anointed up to 3 times) and tier', () => {
  const it = map('Normal', 'Blighted Map (Tier 16)');
  const s = T.prepareSearch(STATS, it);
  const q = T.buildQuery(it, s.mods, { props: s.props }).query;
  assert.equal(q.type, undefined);
  assert.equal(q.filters.type_filters.filters.category.option, 'map');
  assert.equal(q.filters.map_filters.filters.map_tier.min, 16);
  assert.deepEqual(q.stats, [{ type: 'and', filters: [{ id: 'implicit.stat_299373046', disabled: false, value: { max: 3 } }] }]);
});

test('a Blight-ravaged map is searched as anointed up to 9 times', () => {
  const it = map('Rare', 'Dread Cage\nBlight-ravaged Map (Tier 16)');
  const s = T.prepareSearch(STATS, it);
  const q = T.buildQuery(it, s.mods, { props: s.props }).query;
  assert.deepEqual(q.stats, [{ type: 'and', filters: [{ id: 'implicit.stat_299373046', disabled: false, value: { min: 9 } }] }]);
});
