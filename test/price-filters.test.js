'use strict';
// The price check's search, after Awakened PoE Trade: totals, item numbers at 20% quality, starting ticks.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseItem } = require('../src/core/item-parser');
const T = require('../src/core/trade');
const PF = require('../src/core/price-filters');

const E = (id, text) => ({ id, text, type: id.split('.')[0] });
const STATS = { result: [
  { id: 'pseudo', entries: [
    E('pseudo.pseudo_total_elemental_resistance', '+#% total Elemental Resistance'), E('pseudo.pseudo_total_chaos_resistance', '+#% total to Chaos Resistance'),
    E('pseudo.pseudo_total_life', '+# total maximum Life'), E('pseudo.pseudo_total_strength', '+# total to Strength'),
    E('pseudo.pseudo_total_dexterity', '+# total to Dexterity'), E('pseudo.pseudo_total_intelligence', '+# total to Intelligence'),
    E('pseudo.pseudo_total_all_attributes', '+# total to all Attributes'), E('pseudo.pseudo_life_regen', '# Life Regenerated per Second'),
    E('pseudo.pseudo_number_of_empty_prefix_mods', '# Empty Prefix Modifiers'), E('pseudo.pseudo_number_of_empty_suffix_mods', '# Empty Suffix Modifiers'),
  ] },
  { id: 'explicit', entries: [
    E('explicit.life', '+# to maximum Life'), E('explicit.fire', '+#% to Fire Resistance'), E('explicit.cold', '+#% to Cold Resistance'),
    E('explicit.light', '+#% to Lightning Resistance'), E('explicit.chaos', '+#% to Chaos Resistance'), E('explicit.str', '+# to Strength'),
    E('explicit.dex', '+# to Dexterity'), E('explicit.phys_att', 'Adds # to # Physical Damage to Attacks'), E('explicit.regen', 'Regenerate # Life per second'),
    E('explicit.flasks', 'Leftmost # Magic Utility Flasks constantly apply their Flask Effects to you'), E('explicit.noflask', 'Magic Utility Flasks cannot be Used'),
    { id: 'explicit.ar_local', text: '#% increased Armour (Local)', type: 'explicit' }, { id: 'explicit.arflat_local', text: '+# to Armour (Local)', type: 'explicit' },
  ] },
  { id: 'implicit', entries: [E('implicit.firecold', '+#% to Fire and Cold Resistances'), E('implicit.allele', '+#% to all Elemental Resistances'), E('implicit.str', '+# to Strength')] },
] };

const RING = `Item Class: Rings
Rarity: Rare
Storm Loop
Two-Stone Ring
--------
Item Level: 84
--------
{ Implicit Modifier — Elemental, Fire, Cold, Resistance }
+14(12-16)% to Fire and Cold Resistances (implicit)
--------
{ Prefix Modifier "Rotund" (Tier: 2) — Life }
+72(70-79) to maximum Life
{ Prefix Modifier "Glinting" (Tier: 4) — Damage, Physical, Attack }
Adds 3(3-5) to 11(10-12) Physical Damage to Attacks
{ Suffix Modifier "of the Volcano" (Tier: 3) — Elemental, Fire, Resistance }
+38(36-41)% to Fire Resistance
{ Suffix Modifier "of the Lightning" (Tier: 5) — Elemental, Lightning, Resistance }
+25(24-29)% to Lightning Resistance
{ Suffix Modifier "of the Bear" (Tier: 5) — Attribute }
+28(23-27) to Strength`;

test('rare: resistances and life as totals (Strength counts half for life), the single mods leave the list', () => {
  const it = parseItem(RING);
  assert.equal(it.advanced, true);
  assert.equal(it.modMeta.explicit[0].tier, 2);
  assert.deepEqual(it.modMeta.explicit[1].rolls, [{ value: 3, min: 3, max: 5 }, { value: 11, min: 10, max: 12 }]);
  const { mods, props, presets } = T.prepareSearch(STATS, it);
  const by = (id) => mods.find((m) => m.id === id);
  assert.equal(by('pseudo.pseudo_total_elemental_resistance').value, 14 * 2 + 38 + 25);
  assert.equal(by('pseudo.pseudo_total_elemental_resistance').enabled, true);
  assert.equal(by('pseudo.pseudo_total_life').value, 72 + 14);
  assert.equal(by('pseudo.pseudo_total_life').enabled, true);
  assert.ok(!by('explicit.fire') && !by('explicit.life') && !by('implicit.firecold'), 'folded into the totals');
  assert.equal(by('explicit.phys_att').enabled, false, 'single mods start unticked on a rare');
  assert.equal(by('pseudo.pseudo_number_of_empty_prefix_mods').text, 'Has an open prefix');
  assert.equal(props.base.on, false, 'any ring, not only Two-Stone Rings');
  assert.ok(presets?.base, 'item level 84, not finished: a crafting-base search is offered');
  assert.equal(presets.base.props.base.on, true);
  assert.equal(presets.base.props.ilvl.on, true);
});

test('armour at 20% quality with its local mods counted in', () => {
  const it = parseItem(`Item Class: Body Armours
Rarity: Rare
Grim Shell
Astral Plate
--------
Armour: 1062 (augmented)
--------
Item Level: 85
--------
{ Prefix Modifier "Girded" (Tier: 5) — Defences }
+120(101-200) to Armour
{ Prefix Modifier "Reinforced" (Tier: 3) — Defences }
56(43-55)% increased Armour`);
  const { mods, props } = T.prepareSearch(STATS, it);
  assert.deepEqual(props.defence, [{ key: 'ar', label: 'Armour', value: Math.round(1062 * 176 / 156), on: true, min: Math.floor(Math.round(1062 * 176 / 156) * 0.9) }]);
  assert.ok(!mods.some((m) => /Armour/.test(m.text)), 'the armour mods are in the number');
  const q = T.buildQuery(it, mods, { props });
  assert.deepEqual(q.query.filters.armour_filters, { filters: { ar: { min: props.defence[0].min } } });
});

test('unique: only rolls that vary, a min from the roll range, all ticked when 3 or fewer', () => {
  const it = parseItem(`Item Class: Belts
Rarity: Unique
Mageblood
Heavy Belt
--------
Item Level: 86
--------
{ Implicit Modifier — Attribute }
+30(25-35) to Strength (implicit)
--------
{ Unique Modifier — Attribute }
+42(30-50) to Dexterity
{ Unique Modifier }
Leftmost 4(2-4) Magic Utility Flasks constantly apply their Flask Effects to you
{ Unique Modifier }
Magic Utility Flasks cannot be Used`);
  const { mods } = T.prepareSearch(STATS, it);
  const dex = mods.find((m) => m.id === 'explicit.dex');
  assert.equal(dex.min, 40, '42 minus a tenth of the 30-50 range');
  assert.equal(dex.enabled, true);
  const fl = mods.find((m) => m.id === 'explicit.flasks');
  assert.equal(fl.min, 4, 'a perfect roll is searched at its value');
  assert.equal(mods.find((m) => m.id === 'explicit.noflask').hidden, true, 'a roll that never changes is hidden');
  assert.equal(mods.find((m) => m.id === 'implicit.str').hidden, true, 'the base implicit of a not corrupted unique is hidden');
});

test('listings: the same seller at the same price is one row with a count; online, AFK, merchant', () => {
  const L = (seller, amount, extra = {}) => ({ listing: { price: { amount, currency: 'chaos' }, account: { name: seller, ...(extra.online ? { online: extra.online } : {}) }, indexed: '2026-11-14T08:00:00Z', ...(extra.fee != null ? { fee: extra.fee } : {}) } });
  const s = T.summarizeListings({ result: [L('a', 5, { online: {} }), L('a', 5, { online: {} }), L('b', 6, { online: { status: 'afk' } }), L('a', 7), L('c', 8, { fee: 1 })] }, 200, { me: 'c' });
  assert.deepEqual(s.prices.map((x) => [x.seller, x.amount, x.times, x.status, x.mine]), [['a', 5, 3, 'online', false], ['b', 6, 1, 'afk', false], ['c', 8, 1, 'merchant', true]], 'a seller listing again right after (within 2 rows) is counted in their row, as Awakened does');
  assert.equal(s.min, 5);
  assert.equal(s.count, 5);
});

test('totals: attributes all the same -> all attributes; chaos res alone from a craft is not ticked', () => {
  const rows = [{ text: '+20 to Strength', group: 'explicit' }, { text: '+20 to Dexterity', group: 'explicit' }, { text: '+15% to Chaos Resistance', group: 'crafted' }].map((r) => ({ ...r, tpl: PF.tplOf(r.text) }));
  const idx = { '+# total to strength': [{ id: 's' }], '+# total to dexterity': [{ id: 'd' }], '+#% total to chaos resistance': [{ id: 'c' }] };
  const { pseudo } = PF.pseudoTotals(rows, { rarity: 'Rare', flags: {} }, idx, (t) => t.toLowerCase());
  assert.deepEqual(pseudo.map((p) => [p.id, p.value, p.enabled]), [['c', 15, false], ['s', 20, false], ['d', 20, false]]);
});

test('cluster jewels: passive count in its useful brackets, the small passives\' bonus by option, sockets hidden', () => {
  const S2 = { result: [...STATS.result, { id: 'enchant', entries: [
    { id: 'enchant.stat_count', text: 'Adds # Passive Skills', type: 'enchant' }, { id: 'enchant.stat_sockets', text: '# Added Passive Skills are Jewel Sockets', type: 'enchant' },
    { id: 'enchant.stat_grant|13', text: 'Added Small Passive Skills grant: 12% increased Fire Damage', type: 'enchant' },
  ] }] };
  const it = parseItem('Item Class: Jewels\nRarity: Rare\nDusk Spark\nLarge Cluster Jewel\n--------\nItem Level: 84\n--------\nAdds 8 Passive Skills (enchant)\n2 Added Passive Skills are Jewel Sockets (enchant)\nAdded Small Passive Skills grant: 12% increased Fire Damage (enchant)');
  const { mods, props } = T.prepareSearch(S2, it);
  const count = mods.find((m) => m.id === 'enchant.stat_count');
  assert.deepEqual([count.enabled, count.min, count.max], [true, null, 8], '8 passives: at most 8');
  assert.equal(mods.find((m) => m.id === 'enchant.stat_sockets').hidden, true);
  assert.deepEqual([props.ilvl.min, props.ilvl.max], [84, 100]);
  const q = T.buildQuery(it, mods, { props });
  assert.deepEqual(q.query.stats[0].filters.find((f) => f.id === 'enchant.stat_grant'), { id: 'enchant.stat_grant', disabled: false, value: { option: 13 } });
});

test('maps: quantity, pack size and more scarabs; heist: the job level and a priceless target', () => {
  const map = parseItem('Item Class: Maps\nRarity: Rare\nGrim Vault\nStrand Map (Tier 16)\n--------\nMap Tier: 16\nItem Quantity: +87% (augmented)\nItem Rarity: +45% (augmented)\nMonster Pack Size: +30% (augmented)\nMore Scarabs: +20% (augmented)\n--------\nItem Level: 83\n--------\nArea has patches of Burning Ground');
  const m = T.prepareSearch(STATS, map);
  const q = T.buildQuery(map, m.mods, { props: m.props });
  assert.deepEqual(q.query.filters.map_filters.filters, { map_iiq: { min: 78 }, map_packsize: { min: 27 }, map_tier: { min: 16 } }, 'rarity left out when the map drops more scarabs');
  assert.ok(m.mods.find((x) => x.id === 'pseudo.pseudo_map_more_scarab_drops').enabled);
  const c = parseItem('Item Class: Heist Contracts\nRarity: Normal\nContract: Death to Darnaw\n--------\nClient: Tullina, the Catburglar\nHeist Target: Box of Jewelled Rings (Priceless)\nArea Level: 83\nRequires Lockpicking (Level 5)\n--------\nItem Level: 83');
  const h = T.prepareSearch(STATS, c);
  assert.deepEqual(T.buildQuery(c, h.mods, { props: h.props }).query.filters.heist_filters.filters, { heist_lockpicking: { min: 5 }, heist_objective_value: { option: 'priceless' } });
});

test('bulk exchange listings and the poeprices.info guess', () => {
  assert.equal(PF.exchangeTag({ result: [{ entries: [{ id: 'chaos', text: 'Chaos Orb' }, { id: 'exalted', text: 'Exalted Orb' }] }] }, 'Exalted Orb'), 'exalted');
  const res = { result: {
    a: { listing: { indexed: 'x', account: { name: 'A', online: {} }, offers: [{ exchange: { currency: 'chaos', amount: 30 }, item: { amount: 2, stock: 10 } }] } },
    b: { listing: { indexed: 'x', account: { name: 'B' }, offers: [{ exchange: { currency: 'chaos', amount: 14 }, item: { amount: 1, stock: 3 } }] } },
    c: { listing: { indexed: 'x', account: { name: 'C', online: { status: 'afk' } }, offers: [{ exchange: { currency: 'divine', amount: 1, }, item: { amount: 15, stock: 40 } }] } },
  } };
  const x = PF.exchangeListings(res);
  assert.deepEqual(x.chaos.map((r) => [r.seller, r.each, r.status]), [['B', 14, 'offline'], ['A', 15, 'online']]);
  assert.equal(x.divine[0].each, 0.0667);
  const g = PF.poepricesResult({ error: 0, min: 40, max: 60, currency: 'chaos', pred_confidence_score: 71.6, pred_explanation: [['(pseudo) +# total maximum Life', 0.42]] });
  assert.deepEqual(g, { min: 40, max: 60, currency: 'chaos', confidence: 72, why: [{ name: '(pseudo) +# total maximum Life', pct: 42 }] });
  assert.throws(() => PF.poepricesResult({ error: 1, error_msg: 'Unable to price' }), /Unable to price/);
  assert.match(PF.poepricesQuery('Rarity: Rare', 'Covens of Umbra'), /^i=UmFyaXR5OiBSYXJl&l=Covens%20of%20Umbra&s=poe-helper$/);
});

test('transfigured gems: searched as the base gem with its discriminator', () => {
  const items = { result: [{ id: 'gem', label: 'Gems', entries: [{ type: 'Ethereal Knives', text: 'Ethereal Knives' }, { type: 'Ethereal Knives', text: 'Ethereal Knives of the Massacre', disc: 'alt_x' }] }] };
  assert.deepEqual(T.gemTradeType(items, 'Ethereal Knives of the Massacre'), { option: 'Ethereal Knives', discriminator: 'alt_x' });
  assert.equal(T.gemTradeType(items, 'Ethereal Knives'), 'Ethereal Knives');
  const gem = parseItem('Item Class: Skill Gems\nRarity: Gem\nEthereal Knives of the Massacre\n--------\nLevel: 1\nQuality: +11% (augmented)\n--------\nRequirements:\nLevel: 1');
  assert.deepEqual(T.buildQuery(gem, [], { gemType: { option: 'Ethereal Knives', discriminator: 'alt_x' } }).query.type, { option: 'Ethereal Knives', discriminator: 'alt_x' });
});
