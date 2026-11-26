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
  assert.ok(['explicit.fire', 'explicit.life', 'implicit.firecold'].every((id) => by(id).hidden && !by(id).enabled), 'counted in the totals: hidden and unticked, shown on request');
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
{ Prefix Modifier "Reinforced" (Tier: 2) — Defences }
56(43-55)% increased Armour`);
  const { mods, props } = T.prepareSearch(STATS, it);
  assert.deepEqual(props.defence, [{ key: 'ar', label: 'Armour', value: Math.round(1062 * 176 / 156), on: true, min: Math.floor(Math.round(1062 * 176 / 156) * 0.9) }]);
  assert.ok(mods.filter((m) => /Armour/.test(m.text)).every((m) => m.hidden && !m.enabled), 'the armour mods are in the number: hidden, unticked');
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
  assert.deepEqual([props.ilvl.on, props.ilvl.min, props.ilvl.max], [true, 84, null], 'from its own item level up');
  const q = T.buildQuery(it, mods, { props });
  assert.deepEqual(q.query.stats[0].filters.find((f) => f.id === 'enchant.stat_grant'), { id: 'enchant.stat_grant', disabled: false, value: { option: 13 } });
});

test('maps: quantity, pack size and more scarabs; heist: the job level and a priceless target', () => {
  const map = parseItem('Item Class: Maps\nRarity: Rare\nGrim Vault\nStrand Map (Tier 16)\n--------\nMap Tier: 16\nItem Quantity: +87% (augmented)\nItem Rarity: +45% (augmented)\nMonster Pack Size: +30% (augmented)\nMore Scarabs: +20% (augmented)\n--------\nItem Level: 83\n--------\nArea has patches of Burning Ground');
  const m = T.prepareSearch(STATS, map);
  const q = T.buildQuery(map, m.mods, { props: m.props });
  assert.deepEqual(q.query.filters.map_filters.filters, { map_tier: { min: 16 } }, 'a map is searched by its tier (and influence); the rest starts unticked');
  assert.equal(m.mods.find((x) => x.id === 'pseudo.pseudo_map_more_scarab_drops').enabled, false);
  assert.ok(!m.mods.some((x) => /empty_(prefix|suffix)/.test(x.id)), 'no open prefix/suffix rows on maps');
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

test('open prefixes and suffixes are offered whenever the item has room', () => {
  const boots = parseItem(`Item Class: Boots
Rarity: Rare
Torment Dash
Assassin's Boots
--------
Item Level: 77
--------
{ Suffix Modifier "of the Volcano" (Tier: 3) — Elemental, Fire, Resistance }
+38(36-41)% to Fire Resistance
{ Suffix Modifier "of Ephij" (Tier: 4) — Chaos, Resistance }
+23(21-25)% to Chaos Resistance
{ Prefix Modifier "Runner's" (Tier: 5) — Speed }
15% increased Movement Speed`);
  const { mods } = T.prepareSearch(STATS, boots);
  const by = (id) => mods.find((m) => m.id === id);
  assert.equal(by('pseudo.pseudo_number_of_empty_prefix_mods').min, 2);
  assert.equal(by('pseudo.pseudo_number_of_empty_prefix_mods').text, '2 open prefixes');
  assert.equal(by('pseudo.pseudo_number_of_empty_suffix_mods').text, 'Has an open suffix');
  assert.equal(by('pseudo.pseudo_number_of_empty_suffix_mods').enabled, false);
});

test('Wickerman parts (no rarity line) are read and searched by name and buff', () => {
  const { isPoeItemText } = require('../src/core/item-parser');
  const text = 'Item Class: Viscera\nTemplar Skull\n--------\nHead\n--------\nItem Level: 77\n--------\n{ Implicit Modifier }\n15(15-20)% increased Light Radius\n--------\nTake this to the Wickerman in a town or hideout to attach it.';
  assert.ok(isPoeItemText(text));
  const item = parseItem(text);
  assert.equal(item.name, 'Templar Skull');
  assert.equal(item.visceraSlot, 'Head');
  assert.deepEqual(item.mods.explicit, []);
  const stats = { result: [{ label: 'Implicit', entries: [{ id: 'implicit.stat_1263695895', text: '#% increased Light Radius', type: 'implicit' }] }] };
  const { mods, props } = T.prepareSearch(stats, item);
  assert.deepEqual(mods.map((m) => [m.id, m.enabled]), [['implicit.stat_1263695895', true]]);
  const q = T.buildQuery(item, mods, { props });
  assert.equal(q.query.type, 'Templar Skull');
  assert.equal(q.query.filters.misc_filters, undefined, 'item level left out');
  assert.ok(!isPoeItemText('Item Class: Viscera\nsome note'), 'needs the separator');
});

test('"Chain 2 additional times" finds the trade site\'s "Chain an additional time" stat', () => {
  const stats = { result: [{ label: 'Explicit', entries: [{ id: 'explicit.stat_2999750998', text: 'Skills used by your Traps and Mines Chain an additional time', type: 'explicit' }] }] };
  const idx = T.indexStats(stats);
  const m = T.matchMod(idx, 'Skills used by your Traps and Mines Chain 2 additional times', 'explicit', 'Rings');
  assert.equal(m.id, 'explicit.stat_2999750998');
  assert.equal(m.value, 2);
});

test('"+30% to Item Rarity" (Le Heup of All) matches the trade site\'s "increased Rarity of Items found"', () => {
  const idx = T.indexStats({ result: [{ id: 'explicit', entries: [E('explicit.stat_3917489142', '#% increased Rarity of Items found')] }] });
  const m = T.matchMod(idx, '+30% to Item Rarity', 'explicit', 'Rings', { unique: true });
  assert.equal(m.id, 'explicit.stat_3917489142');
  assert.equal(m.value, 30);
});

test('rares: tier 1-2 mods and tier 3 key mods (movement speed on boots) start ticked; low tiers do not', () => {
  const stats = { result: [
    { id: 'explicit', entries: [E('explicit.ms', '#% increased Movement Speed'), E('explicit.dex', '+# to Dexterity'), E('explicit.sup', '+#% chance to Suppress Spell Damage')] },
    { id: 'pseudo', entries: [E('pseudo.pseudo_increased_movement_speed', '#% increased Movement Speed'), E('pseudo.pseudo_total_dexterity', '+# total to Dexterity')] },
  ] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem('Item Class: Boots\nRarity: Rare\nGale Spark\nTwo-Toned Boots\n--------\nItem Level: 85\n--------\n{ Prefix Modifier "Hellion\'s" (Tier: 3) — Speed }\n30(30-34)% increased Movement Speed\n{ Suffix Modifier "of the Lynx" (Tier: 6) — Attribute }\n+22(18-22) to Dexterity\n{ Suffix Modifier "of Dampening" (Tier: 1) }\n+16(16-18)% chance to Suppress Spell Damage\n');
  const r = T.prepareSearch(stats, it);
  const on = (re) => r.mods.find((m) => !m.hidden && re.test(m.text))?.enabled;
  assert.equal(on(/Movement Speed/), true);
  assert.equal(on(/Suppress/), true);
  assert.equal(on(/Dexterity/), false);
});

test('special mods (mercenary…) always start ticked; an eldritch implicit does not', () => {
  const stats = { result: [
    { id: 'implicit', entries: [E('implicit.fire', '+#% to Fire Resistance')] },
    { id: 'mercenary', entries: [E('mercenary.storm', 'Greater Stormcall')] },
    { id: 'pseudo', entries: [E('pseudo.pseudo_total_elemental_resistance', '+#% total Elemental Resistance')] },
  ] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem('Item Class: Gloves\nRarity: Rare\nGale Grip\nSorcerer Gloves\n--------\nItem Level: 85\n--------\n{ Searing Exarch Implicit Modifier (Greater) }\n+12% to Fire Resistance\n--------\nGreater Stormcall (mercenary)\n');
  const r = T.prepareSearch(stats, it);
  assert.equal(r.mods.find((m) => m.group === 'mercenary')?.enabled, true);
  assert.equal(r.mods.find((m) => /Fire/.test(m.text) && m.enabled), undefined, 'an Exarch / Eater implicit rarely makes the item');
});

test('a fractured rare is searched by its fractured mod on the exact base, nothing else ticked', () => {
  const stats = { result: [
    { id: 'explicit', entries: [E('explicit.ms', '#% increased Movement Speed'), E('explicit.life', '+# to maximum Life')] },
    { id: 'fractured', entries: [E('fractured.ms', '#% increased Movement Speed')] },
    { id: 'pseudo', entries: [E('pseudo.pseudo_total_life', '+# total maximum Life'), E('pseudo.pseudo_increased_movement_speed', '#% increased Movement Speed')] },
  ] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem('Item Class: Boots\nRarity: Rare\nGale Spark\nTwo-Toned Boots\n--------\nItem Level: 85\n--------\n35% increased Movement Speed (fractured)\n+62 to maximum Life\n--------\nFractured Item\n');
  const r = T.prepareSearch(stats, it);
  assert.equal(r.props.base.on, true);
  assert.deepEqual(r.mods.filter((m) => m.enabled).map((m) => m.id), ['fractured.ms']);
});

test('rare jewels: the exact base and at most 3 useful mods (life, crit multi…), not resistances or plain damage', () => {
  const stats = { result: [
    { id: 'explicit', entries: [E('explicit.life', '#% increased maximum Life'), E('explicit.cm', '+#% to Global Critical Strike Multiplier'), E('explicit.sd', '#% increased Spell Damage'), E('explicit.fr', '+#% to Fire Resistance')] },
    { id: 'pseudo', entries: [E('pseudo.pseudo_total_elemental_resistance', '+#% total Elemental Resistance')] },
  ] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem('Item Class: Jewels\nRarity: Rare\nGlyph Eye\nCobalt Jewel\n--------\nItem Level: 84\n--------\n{ Prefix Modifier "Healthy" (Tier: 1) — Life }\n7(5-7)% increased maximum Life\n{ Suffix Modifier "x" (Tier: 2) }\n+15(15-18)% to Global Critical Strike Multiplier\n{ Prefix Modifier "Brutal" (Tier: 1) }\n16(14-16)% increased Spell Damage\n{ Suffix Modifier "of Fire" (Tier: 1) }\n+15(14-15)% to Fire Resistance\n');
  const r = T.prepareSearch(stats, it);
  assert.equal(r.props.base.on, true);
  assert.deepEqual(r.mods.filter((m) => m.enabled).map((m) => m.id).sort(), ['explicit.cm', 'explicit.life']);
});

test('overquality (over 20%): searched by the exact base and the quality only', () => {
  const stats = { result: [{ id: 'explicit', entries: [E('explicit.life', '+# to maximum Life')] }, { id: 'pseudo', entries: [E('pseudo.pseudo_total_life', '+# total maximum Life')] }] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem('Item Class: Body Armours\nRarity: Rare\nGale Shell\nVaal Regalia\n--------\nQuality: +28% (augmented)\nEnergy Shield: 400 (augmented)\n--------\nItem Level: 86\n--------\n+120 to maximum Life\n');
  const r = T.prepareSearch(stats, it);
  assert.equal(r.props.base.on, true);
  assert.deepEqual([r.props.quality.on, r.props.quality.min], [true, 28]);
  assert.equal(r.mods.some((m) => m.enabled), false);
  const q = T.buildQuery(it, r.mods, { props: r.props });
  assert.equal(q.query.filters.misc_filters.filters.quality.min, 28);
});

test('jewels: a single or maximum fire / cold / lightning resistance is searched as any of the three (Harvest swap)', () => {
  const stats = { result: [{ id: 'explicit', entries: [E('explicit.mf', '+#% to maximum Fire Resistance'), E('explicit.mc', '+#% to maximum Cold Resistance'), E('explicit.ml', '+#% to maximum Lightning Resistance')] }] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem('Item Class: Jewels\nRarity: Rare\nGlyph Eye\nCrimson Jewel\n--------\nItem Level: 84\n--------\n+1% to maximum Cold Resistance\n');
  const r = T.prepareSearch(stats, it);
  const m = r.mods.find((x) => x.anyOf);
  assert.ok(m && m.enabled);
  const q = T.buildQuery(it, r.mods, { props: r.props });
  const g = q.query.stats.find((x) => x.type === 'count');
  assert.deepEqual(g.filters.map((f) => f.id).sort(), ['explicit.mc', 'explicit.mf', 'explicit.ml']);
  assert.equal(g.filters[0].value.min, 1);
});

test("Watcher's Eye: the aura mods are ticked, not the life / mana / ES ones; an unidentified unique searches uniques only", () => {
  const stats = { result: [{ id: 'explicit', entries: [E('explicit.es', '#% increased maximum Energy Shield'), E('explicit.wrath', '#% increased Critical Strike Chance while affected by Wrath')] }] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem("Item Class: Jewels\nRarity: Unique\nWatcher's Eye\nPrismatic Jewel\n--------\nItem Level: 86\n--------\n5% increased maximum Energy Shield\n55% increased Critical Strike Chance while affected by Wrath\n");
  const r = T.prepareSearch(stats, it);
  assert.deepEqual(r.mods.filter((m) => m.enabled).map((m) => m.id), ['explicit.wrath']);
  const un = parseItem('Item Class: Jewels\nRarity: Unique\nPrismatic Jewel\n--------\nItem Level: 86\n--------\nUnidentified\n');
  const ru = T.prepareSearch(stats, un);
  const q = T.buildQuery(un, ru.mods, { props: ru.props });
  assert.equal(q.query.filters.type_filters.filters.rarity.option, 'unique');
  assert.equal(q.query.filters.misc_filters.filters.identified.option, 'false');
});

test('an unidentified unique jewel is searched from its item level up', () => {
  const { parseItem } = require('../src/core/item-parser');
  const un = parseItem('Item Class: Jewels\nRarity: Unique\nPrismatic Jewel\n--------\nItem Level: 86\n--------\nUnidentified\n');
  const r = T.prepareSearch({ result: [] }, un);
  const q = T.buildQuery(un, r.mods, { props: r.props });
  assert.equal(q.query.filters.misc_filters.filters.ilvl.min, 86);
});

test('special mods are known by their name too ("Subterranean", "of Farrul"): ticked', () => {
  const stats = { result: [{ id: 'explicit', entries: [E('explicit.gems', '+# to Level of Socketed Gems')] }] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem('Item Class: Helmets\nRarity: Rare\nGale Crown\nHubris Circlet\n--------\nItem Level: 85\n--------\n{ Prefix Modifier "Subterranean" (Tier: 4) }\n+1 to Level of Socketed Gems\n');
  assert.equal(T.prepareSearch(stats, it).mods.find((m) => m.id === 'explicit.gems').enabled, true);
});

test('a corrupted item: the corruption implicit starts ticked and only corrupted items are searched', () => {
  const stats = { result: [{ id: 'implicit', entries: [E('implicit.gems', '+# to Level of Socketed Gems')] }] };
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem('Item Class: Helmets\nRarity: Rare\nGale Crown\nHubris Circlet\n--------\nItem Level: 85\n--------\n{ Corruption Implicit Modifier }\n+1 to Level of Socketed Gems (implicit)\n--------\nCorrupted\n');
  const r = T.prepareSearch(stats, it);
  assert.equal(r.mods.find((m) => m.id === 'implicit.gems').enabled, true);
  assert.equal(r.props.corrupted, 'yes');
});
test('a veiled mod is searched as the trade site\'s Veiled mod and starts ticked', () => {
  const { parseItem } = require('../src/core/item-parser');
  const { prepareSearch } = require('../src/core/trade');
  const stats = { result: [{ id: 'veiled', entries: [{ id: 'veiled.mod_65000', text: 'Veiled', type: 'veiled' }, { id: 'veiled.mod_63099', text: 'of the Veil', type: 'veiled' }] }] };
  const it = parseItem('Item Class: Jewels\nRarity: Rare\nKraken Star\nCobalt Jewel\n--------\nItem Level: 85\n--------\nVeiled Suffix\n');
  const m = prepareSearch(stats, it, {}).mods.find((x) => /Veiled/.test(x.text));
  assert.equal(m.id, 'veiled.mod_63099');
  assert.equal(m.enabled, true);
});

test('a conqueror map is searched by its citadel (one trade stat for both lines), ticked', () => {
  const stats = { result: [{ id: 'implicit', entries: [{ id: 'implicit.stat_2563183002|3', text: "Map contains Al-Hezmin's Citadel\nItem Quantity increases amount of Rewards Al-Hezmin drops by 20% of its value", type: 'implicit' }] }] };
  const it = parseItem("Item Class: Maps\nRarity: Rare\nDesolate Inscription\nCrimson Temple Map\n--------\nMap Tier: 16\n--------\nItem Level: 83\n--------\nMap contains Al-Hezmin's Citadel (implicit)\nItem Quantity increases amount of Rewards Al-Hezmin drops by 20% of its value (implicit)\n");
  const p = T.prepareSearch(stats, it, {});
  const rows = p.mods.filter((m) => m.group === 'implicit');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].enabled, true);
  assert.deepEqual(T.buildQuery(it, p.mods, { props: p.props }).query.stats[0].filters, [{ id: 'implicit.stat_2563183002', disabled: false, value: { option: 3 } }]);
});

test('a magic jewel: its base, magic only, its mod at its roll', () => {
  const stats = { result: [{ id: 'explicit', entries: [{ id: 'explicit.stat_983749596', text: '#% increased maximum Life', type: 'explicit' }] }] };
  const it = parseItem('Item Class: Jewels\nRarity: Magic\nVivid Crimson Jewel\n--------\nItem Level: 83\n--------\n{ Prefix Modifier "Vivid" (Tier: 1) — Life }\n7(5-7)% increased maximum Life\n');
  assert.equal(it.baseType, 'Crimson Jewel');
  const p = T.prepareSearch(stats, it, {});
  const q = T.buildQuery(it, p.mods, { props: p.props }).query;
  assert.equal(q.type, 'Crimson Jewel');
  assert.equal(q.filters.type_filters.filters.rarity.option, 'magic');
  assert.deepEqual(q.stats[0].filters, [{ id: 'explicit.stat_983749596', disabled: false, value: { min: 7 } }]);
});

test('Ritual boots: only the base and its implicit are searched', () => {
  const stats = { result: [{ id: 'implicit', entries: [{ id: 'implicit.stat_170394517', text: '#% less Accuracy Rating', type: 'implicit' }] }, { id: 'explicit', entries: [{ id: 'explicit.stat_3299347043', text: '+# to maximum Life', type: 'explicit' }] }] };
  const it = parseItem('Item Class: Boots\nRarity: Rare\nGhoul Pace\nStormrider Boots\n--------\nItem Level: 83\n--------\n{ Implicit Modifier — Attack }\n25% less Accuracy Rating\n--------\n{ Prefix Modifier "Fawn\'s" (Tier: 1) — Life }\n+27(24-28) to maximum Life\n');
  const p = T.prepareSearch(stats, it, {});
  assert.deepEqual(p.mods.filter((m) => m.enabled).map((m) => m.group), ['implicit']);
  assert.equal(T.buildQuery(it, p.mods, { props: p.props }).query.type, 'Stormrider Boots');
});

test('defences stay unticked without a tier 2 or better defence mod; no links on helmets', () => {
  const it = parseItem('Item Class: Helmets\nRarity: Rare\nFate Corona\nHaunted Bascinet\n--------\nArmour: 300 (augmented)\nEvasion Rating: 280 (augmented)\n--------\nSockets: B-R \n--------\nItem Level: 85\n--------\n{ Prefix Modifier "Girded" (Tier: 4) — Defences }\n65(56-67)% increased Armour and Evasion\n');
  const { props } = T.prepareSearch(STATS, it);
  assert.ok(props.defence.every((d) => !d.on));
  assert.equal(props.links.show, false);
});

test('a skill-choice mod shortened to "(...)" is read and searched', () => {
  const p = parseItem(['Item Class: Amulets', 'Rarity: Unique', "Replica Dragonfang's Flight", 'Onyx Amulet', '--------', 'Item Level: 85', '--------',
    '{ Unique Modifier }', '+3 to Level of all Purity of Elements(...) Gems', '{ Unique Modifier — Elemental, Resistance }', '+7(5-10)% to all Elemental Resistances'].join('\n'));
  assert.ok(p.mods.explicit.includes('+3 to Level of all Purity of Elements Gems'));
  const S = { result: [{ label: 'Explicit', entries: [{ id: 'explicit.indexable_skill_63', text: '+# to Level of all Purity of Elements Gems', type: 'explicit' }, { id: 'explicit.stat_2901986750', text: '+#% to all Elemental Resistances', type: 'explicit' }] }] };
  const { mods } = T.prepareSearch(S, p);
  const skill = mods.find((m) => m.id === 'explicit.indexable_skill_63');
  assert.ok(skill && skill.enabled && !skill.hidden);
});

test('a Wickerman part: a buff wrapped onto two lines is one mod; its trade name comes from the item list', () => {
  const p = parseItem("Item Class: Viscera\nGreater Golemic Stone\n--------\nTorso\n--------\nItem Level: 83\n--------\n{ Implicit Modifier }\nYou cannot be Stunned if you've been Stunned or Blocked\na Stunning Hit in the past 2 seconds\n--------\nTake this to the Wickerman in a town or hideout to attach it.");
  assert.deepEqual(p.mods.implicit, ["You cannot be Stunned if you've been Stunned or Blocked a Stunning Hit in the past 2 seconds"]);
  const list = (n) => ({ result: [{ id: 'viscera', entries: [{ type: n, text: n }] }] });
  assert.equal(T.partTradeType(list('Greater Golemic Stone'), 'Greater Golemic Stone'), 'Greater Golemic Stone');
  assert.equal(T.partTradeType(list("Hag's Stomach"), "Greater Hag's Stomach"), "Hag's Stomach");
  assert.equal(T.partTradeType(list('Other'), 'Greater Golemic Stone'), null);
});

test('a Wickerman part buff is searched as an implicit', () => {
  const p = parseItem("Item Class: Viscera\nHydra's Head\n--------\nHead\n--------\nItem Level: 83\n--------\n{ Implicit Modifier }\nArrows Pierce all Targets after Forking — Unscalable Value\n--------\nTake this to the Wickerman in a town or hideout to attach it.");
  const S = { result: [{ label: 'Explicit', entries: [{ id: 'explicit.stat_2138799639', text: 'Arrows Pierce all Targets after Forking', type: 'explicit' }] }] };
  const { mods, props } = T.prepareSearch(S, p);
  const q = T.buildQuery(p, mods, { props });
  assert.deepEqual(q.query.stats[0].filters.map((f) => f.id), ['implicit.stat_2138799639']);
});

test('the filter look of a cluster jewel reads its passive count and kind', () => {
  const { evalCondition } = require('../src/core/filter/matcher');
  const item = { itemClass: 'Jewels', mods: { enchant: ['Adds 8 Passive Skills', 'Added Small Passive Skills grant: 12% increased Attack Damage while Dual Wielding'] } };
  assert.equal(evalCondition({ keyword: 'EnchantmentPassiveNum', values: ['8'] }, item, []), true);
  assert.equal(evalCondition({ keyword: 'EnchantmentPassiveNum', op: '>=', values: ['10'] }, item, []), false);
  assert.equal(evalCondition({ keyword: 'EnchantmentPassiveNode', values: ['Attack Damage while Dual Wielding', 'Bow Damage'] }, item, []), true);
  assert.equal(evalCondition({ keyword: 'EnchantmentPassiveNode', values: ['Physical Damage'] }, item, []), false);
});

test('a stat whose number is fixed text ("in the past 2 seconds") is searched without a number', () => {
  const idx = T.indexStats({ result: [{ label: 'Implicit', entries: [{ id: 'implicit.stat_2755326667', text: "You cannot be Stunned if you've been Stunned or Blocked\na Stunning Hit in the past 2 seconds", type: 'implicit' }] }] });
  const m = T.matchMod(idx, "You cannot be Stunned if you've been Stunned or Blocked a Stunning Hit in the past 2 seconds", 'implicit', 'Viscera');
  assert.equal(m.id, 'implicit.stat_2755326667');
  assert.equal(m.value, null);
});

test('a "{ Fractured Suffix Modifier }" line is a fractured mod and is searched as one', () => {
  const p = parseItem(['Item Class: Body Armours', 'Rarity: Magic', "Legend's Full Wyvernscale of the Protector", '--------', 'Item Level: 85', '--------',
    '{ Prefix Modifier "Legend\'s" (Tier: 2) — Defences, Armour, Evasion }', '99(92-100)% increased Armour and Evasion',
    '{ Fractured Suffix Modifier "of the Protector" (Tier: 2) — Physical }', '7% additional Physical Damage Reduction', '--------', 'Fractured Item'].join('\n'));
  assert.deepEqual(p.mods.fractured, ['7% additional Physical Damage Reduction']);
  assert.deepEqual(p.mods.explicit, ['99% increased Armour and Evasion']);
});

test('a negative "damage taken" roll is searched as a maximum', () => {
  const S = { result: [{ label: 'Implicit', entries: [{ id: 'implicit.stat_3277537093', text: '+# Physical Damage taken from Hits by Animals', type: 'implicit' }] }] };
  const p = parseItem("Item Class: Viscera\nLesser Poacher's Leg\n--------\nLeg\n--------\nItem Level: 83\n--------\n{ Implicit Modifier }\n-25 Physical Damage taken from Hits by Animals\n--------\nTake this to the Wickerman in a town or hideout to attach it.");
  const { mods, props } = T.prepareSearch(S, p);
  assert.deepEqual(T.buildQuery(p, mods, { props }).query.stats[0].filters[0].value, { max: -22 });
});

test('Untiered also hides unidentified rares that have no item tier', () => {
  const M = require('../src/core/filter/manager');
  const out = M.rankRules({ 'Majestic Pelt': 'S' }, { rares: 'none' }, ['Majestic Pelt'], { unidTiers: true });
  const r = out.find((x) => x.id === 'rank-rares-untiered-hide');
  assert.ok(r && r.action === 'Hide');
  assert.ok(r.afterItemTiers && !r.conditions.some((c) => c.keyword === 'UnidentifiedItemTier'));
  // it goes right after the last item tier block, so tiered drops are taken first
  const text = 'Show # a\n\tUnidentifiedItemTier >= 3\n\tRarity Rare\n\n#Show # off\n#\tUnidentifiedItemTier >= 2\n\nShow # rest\n\tRarity Rare\n';
  const outText = M.insertAfterItemTiers(text, [r]);
  assert.ok(outText.indexOf('without an item tier') > outText.indexOf('>= 3') && outText.indexOf('without an item tier') < outText.indexOf('Show # rest'));
  assert.ok(!M.rankRules({ 'Majestic Pelt': 'S' }, { rares: 'none' }, ['Majestic Pelt'], { unidTiers: false }).some((x) => x.id === 'rank-rares-untiered-hide'));
});

test('a map\'s yellow "Rare-only" mods are always ticked', () => {
  const p = parseItem(['Item Class: Maps', 'Rarity: Rare', 'Cruel Abyss', 'Map (Tier 16)', '--------', 'Item Level: 83', '--------',
    '{ Prefix Modifier "Thorny" (Tier: 1) }', 'Rare Monsters have Physical Thorns reflecting 800 Physical Damage',
    '{ Rare-only (Tier: 1) }', 'Area contains a buried Apex Sentinel'].join('\n'));
  const S = { result: [{ label: 'Explicit', entries: [{ id: 'explicit.stat_2788592463', text: 'Area contains a buried Apex Sentinel', type: 'explicit' }, { id: 'explicit.stat_x', text: 'Rare Monsters have Physical Thorns reflecting # Physical Damage', type: 'explicit' }] }] };
  const { mods } = T.prepareSearch(S, p);
  assert.equal(mods.find((m) => /Apex Sentinel/.test(m.text)).enabled, true);
  assert.equal(mods.find((m) => /Thorns/.test(m.text)).enabled, false);
});

test('an imbued gem is searched and priced by its built-in support', () => {
  const p = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'imbued-gem.txt'), 'utf8'));
  assert.deepEqual(p.mods.imbued, ['Supported by Level 1 Spell Echo']);
  const S = { result: [{ label: 'Imbued', entries: [{ id: 'imbued.pseudo_built_in_support|3076322868', text: 'Supported by Level 1 Spell Echo', type: 'imbued' }] }] };
  const { mods, props } = T.prepareSearch(S, p);
  assert.equal(mods[0].enabled, true);
  assert.deepEqual(T.buildQuery(p, mods, { props }).query.stats[0].filters[0], { id: 'imbued.pseudo_built_in_support|3076322868', disabled: false });
  const P = require('../src/core/pricer');
  const lines = [{ name: 'Temporal Chains', variant: 'Blasphemy', chaosValue: 177 }, { name: 'Temporal Chains', variant: 'Spell Echo', chaosValue: 50 }];
  assert.equal(P.pickGem(lines, p).best.chaosValue, 50);
});

test('an imbued support with odd spaces or link marks still matches', () => {
  const S = { result: [{ label: 'Imbued', entries: [{ id: 'imbued.pseudo_built_in_support|3076322868', text: 'Supported by Level 1 Spell Echo', type: 'imbued' }] }] };
  const base = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'imbued-gem.txt'), 'utf8');
  for (const v of ['Supported by Level 1 Spell Echo', 'Supported by Level 1 Spell Echo Support', 'Supported by Level 1 <<link>>{Spell Echo}']) {
    const { mods } = T.prepareSearch(S, parseItem(base.replace('Supported by Level 1 Spell Echo', v)));
    assert.equal(mods[0].id, 'imbued.pseudo_built_in_support|3076322868', v);
  }
});

test('a twice corrupted unique is searched as twice corrupted, by its corruption implicits', () => {
  const p = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'twice-corrupted.txt'), 'utf8'));
  assert.equal(p.flags.corrupted, true);
  assert.equal(p.flags.twiceCorrupted, true);
  assert.ok(!p.mods.explicit.some((m) => /Blazing body/.test(m)));
  const S = { result: [{ label: 'Implicit', entries: [{ id: 'implicit.stat_2843100721', text: '+# to Level of Socketed Gems', type: 'implicit' }] }] };
  const { mods, props } = T.prepareSearch(S, p);
  assert.equal(mods.find((m) => /Socketed Gems/.test(m.text)).enabled, true);
  const q = T.buildQuery(p, mods, { props }).query;
  assert.deepEqual(q.filters.misc_filters.filters.twice_corrupted, { option: 'true' });
  assert.equal(q.filters.misc_filters.filters.ilvl, undefined);
});

test('a long trade link ("H4sI…") can be saved, and its search is read from the link', () => {
  const TW = require('../src/core/trade-watch');
  const q = { query: { status: { option: 'securable' }, name: 'Nebulis', type: 'Void Sceptre' }, sort: { price: 'asc' } };
  const id = require('zlib').gzipSync(Buffer.from(JSON.stringify(q.query))).toString('base64url');
  const p = TW.parseTradeUrl(`https://www.pathofexile.com/trade/search/Covens/${id}`);
  assert.equal(p.league, 'Covens');
  assert.equal(p.id, id);
  assert.deepEqual(TW.queryFromId(id), q);
  assert.equal(TW.queryFromId('AbC123'), null);
});

test('a Facetor\'s Lens is searched by its stored experience', () => {
  const p = parseItem("Item Class: Stackable Currency\nRarity: Currency\nFacetor's Lens\n--------\nStored Experience: 150 000 000\n--------\nAdds stored experience to a gem, up to its maximum level\n--------\nRight click this item then left click a gem to apply it.");
  const { mods, props } = T.prepareSearch({ result: [] }, p);
  assert.equal(mods.length, 0);
  assert.equal(props.storedExp.min, 135);
  const q = T.buildQuery(p, mods, { props }).query;
  assert.equal(q.type, "Facetor's Lens");
  assert.deepEqual(q.filters.misc_filters.filters.stored_experience, { min: 135000000 });
});

test('net worth prices fragments that are normal items (An Audience With The King)', () => {
  const N = require('../src/core/networth');
  const idx = N.buildIndex({ Fragment: [{ name: 'An Audience With The King', chaos: 250 }] });
  assert.deepEqual(N.valueItem({ frameType: 0, typeLine: 'An Audience With The King', stackSize: 8 }, idx), { name: 'An Audience With The King', qty: 8, each: 250, category: 'Fragment' });
  assert.equal(N.valueItem({ frameType: 0, typeLine: 'Vaal Regalia', ilvl: 84 }, idx), null);
  assert.ok(N.neededCategories([{ frameType: 0, typeLine: 'An Audience With The King' }]).includes('Fragment'));
});

test('an unidentified unique, once picked, is searched by its name, unidentified only', () => {
  const p = parseItem('Item Class: Jewels\nRarity: Unique\nLarge Cluster Jewel\n--------\nItem Level: 79\n--------\nUnidentified\n--------\nCorrupted');
  const { mods, props } = T.prepareSearch({ result: [] }, p);
  props.uniqueName = 'Voices';
  const q = T.buildQuery(p, mods, { props }).query;
  assert.equal(q.name, 'Voices');
  assert.equal(q.type, 'Large Cluster Jewel');
  assert.deepEqual(q.filters.misc_filters.filters.identified, { option: 'false' });
});

test('a Foulborn unique is priced as its Foulborn version and searched as "mutated"', () => {
  const p = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'foulborn.txt'), 'utf8'));
  assert.equal(p.name, 'The Infinite Pursuit');
  assert.equal(p.flags.foulborn, true);
  const P = require('../src/core/pricer');
  const lines = [{ name: 'The Infinite Pursuit', chaos: 1, listingCount: 28 }, { name: 'Foulborn The Infinite Pursuit', variant: 'Bleed Immune', chaos: 1, listingCount: 530 }, { name: 'Foulborn The Infinite Pursuit', variant: 'Bleed Armour', chaos: 2, listingCount: 646 }, { name: 'Foulborn The Infinite Pursuit', variant: 'Bleed Armour, Bleed Immune', chaos: 9, listingCount: 14 }];
  assert.equal(P.pickUnique(lines, p).best.variant, 'Bleed Armour');
  const S = { result: [{ label: 'Explicit', entries: [{ id: 'explicit.stat_2466912132', text: '#% increased Armour while Bleeding', type: 'explicit' }] }] };
  const { mods, props } = T.prepareSearch(S, p);
  assert.equal(mods.find((m) => /Armour while Bleeding/.test(m.text)).enabled, true);
  const q = T.buildQuery(p, mods, { props }).query;
  assert.equal(q.name, 'The Infinite Pursuit');
  assert.deepEqual(q.filters.misc_filters.filters.mutated, { option: 'true' });
});

test('a vestigial base is searched as the base, vestigial, with its implicit ticked', () => {
  const p = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'vestigial.txt'), 'utf8'));
  assert.equal(p.baseType, 'Tricorne');
  assert.equal(p.flags.vestigial, true);
  const S = { result: [{ label: 'Implicit', entries: [{ id: 'implicit.stat_4047895119', text: '#% increased Minion Attack Speed per 50 Dexterity', type: 'implicit' }] }] };
  const { mods, props } = T.prepareSearch(S, p);
  assert.equal(mods.find((m) => /Minion Attack Speed/.test(m.text)).enabled, true);
  const q = T.buildQuery(p, mods, { props }).query;
  assert.equal(q.type, 'Tricorne');
  assert.deepEqual(q.filters.misc_filters.filters.vestigial, { option: 'true' });
});

test('cluster jewel kinds use the game\'s node names ("Critical Chance", "Dagger and Claw Damage")', () => {
  const { evalCondition } = require('../src/core/filter/matcher');
  const crit = { itemClass: 'Jewels', mods: { enchant: ['Adds 4 Passive Skills', 'Added Small Passive Skills grant: 15% increased Critical Strike Chance'] } };
  assert.equal(evalCondition({ keyword: 'EnchantmentPassiveNode', values: ['Critical Chance'] }, crit, []), true);
  const claw = { itemClass: 'Jewels', mods: { enchant: ['Added Small Passive Skills grant: Claw Attacks deal 12% increased Damage with Hits and Ailments', 'Added Small Passive Skills grant: Dagger Attacks deal 12% increased Damage with Hits and Ailments'] } };
  assert.equal(evalCondition({ keyword: 'EnchantmentPassiveNode', values: ['Dagger and Claw Damage'] }, claw, []), true);
  assert.equal(evalCondition({ keyword: 'EnchantmentPassiveNode', values: ['Critical Chance'] }, claw, []), false);
});

test('unique flask: flask lines and flavour aren\'t mods; a mod wrapped onto two lines is one stat', () => {
  const { parseItem } = require('../src/core/item-parser');
  const it = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'unique-flask-wrapped.txt'), 'utf8'));
  assert.deepStrictEqual(it.mods.explicit, ['Gain 5 Charges when you are Hit by an Enemy', 'Removes 17% of Life when Used', '5% chance for a damaging Retaliation skill to become usable for every 100 life removed this way']);
});

test('Mercenary Warrant: searched by its build and skills; supports listed under them, unticked', () => {
  const { parseItem } = require('../src/core/item-parser');
  const T = require('../src/core/trade');
  const it = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'mercenary-warrant.txt'), 'utf8'));
  assert.strictEqual(it.warrant.build, 'Combatant');
  assert.strictEqual(it.warrant.name, 'Krastin, the Skinner');
  assert.deepStrictEqual(it.warrant.skills.map((s) => s.skill), ['Inspiring Cry', 'Herald of Ice', 'Static Strike', 'Spectral Helix', 'Wrath', 'Purity of Ice']);
  assert.ok(it.mods.mercenary.includes('Chain (Tier 2)'));
  const items = { result: [{ id: 'map', entries: [{ type: 'MeleeAOEStrikeDuelistRangeStrikes', text: 'Mercenary Warrant (Combatant)', disc: 'mercenary_warrant' }] }] };
  assert.deepStrictEqual(T.warrantTradeType(items, 'Combatant'), { option: 'MeleeAOEStrikeDuelistRangeStrikes', discriminator: 'mercenary_warrant' });
});

test('Mercenary Warrant search, as Awakened PoE Trade: primary skills, supports on their skill, bricks left out', () => {
  const { parseItem } = require('../src/core/item-parser');
  const M = require('../src/core/merc');
  const it = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'mercenary-warrant.txt'), 'utf8'));
  const m = M.model(it.warrant, {});
  const by = Object.fromEntries(m.skills.map((s) => [s.name, s]));
  assert.strictEqual(by['Inspiring Cry'].type, 'primary');
  assert.strictEqual(by['Inspiring Cry'].on, true);
  assert.strictEqual(by['Static Strike'].on, false);
  assert.strictEqual(by['Spectral Helix'].type, 'brick');
  assert.ok(m.missing.find((x) => x.name === 'Wild Strike').on);
  // "More Duration" (Tier 2) also finds "Greater More Duration"
  assert.strictEqual(by['Static Strike'].supports.find((x) => x.name === 'More Duration').ids.length, 2);
  const q0 = M.warrantQuery(m, null);
  assert.deepStrictEqual(q0.query.stats[0].filters.map((f) => f.id).sort(), [by['Herald of Ice'].id, by['Inspiring Cry'].id].sort());
  assert.ok(q0.query.stats.some((g) => g.type === 'not'));
  // tick Chain on Static Strike: one "mercenary" group, the skill and its support
  const m2 = M.model(it.warrant, { skills: { [by['Static Strike'].id]: { on: true, sup: { [by['Static Strike'].supports.find((x) => x.name === 'Chain').id]: true } } } });
  const g = M.warrantQuery(m2, null).query.stats.find((x) => x.type === 'mercenary');
  assert.deepStrictEqual(g.value, { min: 2 });
  // what ticking a support does: only listings with it on that skill count
  const L = (chaos, skills) => ({ chaos, skills: new Map(skills) });
  const ss = m2.skills.find((s) => s.name === 'Static Strike');
  const dur = ss.supports.find((x) => x.name === 'More Duration');
  const n = (id) => Number(id.split('_').pop());
  M.analyze(m2, [L(5, [[n(ss.id), new Set()]]), L(12, [[n(ss.id), new Set([n(dur.ids[1])])]]), L(9, [[n(by['Inspiring Cry'].id), new Set([n(dur.ids[0])])]])]);
  assert.deepStrictEqual([dur.delta, dur.count], [7, 1]);
});

test('Corpse Rose: "+3 to maximum Blooms" finds "+# maximum Bloom", and less life spent is better', () => {
  const stats = { result: [{ id: 'explicit', entries: [
    E('explicit.stat_4034618287', 'Trigger Level 20 Goreblossom after spending #% of your Maximum Life on Spells'),
    E('explicit.stat_2891184298', '#% increased Cast Speed'),
    E('explicit.stat_1597503116', 'Goreblossom has +# maximum Bloom'),
  ] }] };
  const it = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'corpse-rose.txt'), 'utf8'));
  const s = T.prepareSearch(stats, it);
  const row = (re) => s.mods.find((m) => re.test(m.text));
  assert.equal(row(/Blooms/).id, 'explicit.stat_1597503116');
  assert.equal(row(/Blooms/).min, 3);
  const life = row(/after spending/);
  assert.equal(life.min, null);
  assert.equal(life.max, 18); // 17%, a tenth of the 10-20 range up
});

test('an invitation is searched by name with instant buyout, no item level', () => {
  const it = parseItem('Item Class: Map Fragments\nRarity: Normal\nScreaming Invitation\n--------\nItem Level: 84\n--------\nArea contains The Eater of Worlds\n--------\nCan be used in a personal Map Device.');
  const s = T.prepareSearch({ result: [] }, it);
  const q = T.buildQuery(it, s.mods, { props: s.props }).query;
  assert.equal(q.type, 'Screaming Invitation');
  assert.equal(q.status.option, 'securable');
  assert.equal(q.filters.misc_filters?.filters?.ilvl, undefined);
});

test('a Large Cluster Jewel\'s two-line enchant (Claw + Dagger) is one ticked row: option 3', () => {
  const stats = { result: [{ id: 'enchant', entries: [
    E('enchant.stat_3086156145', 'Adds # Passive Skills'),
    E('enchant.stat_3948993189|3', 'Added Small Passive Skills grant: Claw Attacks deal 12% increased Damage with Hits and Ailments\nAdded Small Passive Skills grant: Dagger Attacks deal 12% increased Damage with Hits and Ailments'),
    E('enchant.stat_3948993189|5', 'Added Small Passive Skills grant: Wand Attacks deal 12% increased Damage with Hits and Ailments'),
  ] }] };
  const it = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'cluster-claw-dagger.txt'), 'utf8'));
  const s = T.prepareSearch(stats, it);
  const rows = s.mods.filter((m) => /Claw|Dagger/.test(m.text));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'enchant.stat_3948993189|3');
  assert.ok(rows[0].enabled);
  const q = T.buildQuery(it, s.mods, { props: s.props }).query;
  assert.ok(q.stats[0].filters.some((f) => f.id === 'enchant.stat_3948993189' && f.value.option === 3));
});

test('lines the trade site words differently: slower/faster, (Shields) block, one jewel socket', () => {
  const idx = T.indexStats({ result: [
    { id: 'explicit', entries: [E('explicit.stat_391460978', 'Bleeding on you expires #% faster while Moving'), E('explicit.stat_4253454700', '+#% Chance to Block (Shields)')] },
    { id: 'enchant', entries: [E('enchant.stat_4079888060', '# Added Passive Skills are Jewel Sockets')] },
    { id: 'explicit2', entries: [E('explicit.stat_3044826007', 'Monsters have #% chance to inflict Withered for 2 seconds on Hit')] },
  ] });
  const wither = T.matchMod(idx, 'Monsters Inflict Withered for 2 seconds on Hit', 'explicit', { itemClass: 'Maps' });
  assert.equal(wither.id, 'explicit.stat_3044826007');
  assert.equal(wither.value, 100);
  const slow = T.matchMod(idx, 'Bleeding on you expires 75% slower while Moving', 'explicit', { unique: true });
  assert.equal(slow.id, 'explicit.stat_391460978');
  assert.equal(slow.value, -75);
  assert.equal(T.matchMod(idx, '+5% Chance to Block', 'explicit', { itemClass: 'Shields' }).id, 'explicit.stat_4253454700');
  const sock = T.matchMod(idx, '1 Added Passive Skill is a Jewel Socket', 'enchant', {});
  assert.equal(sock.id, 'enchant.stat_4079888060');
  assert.equal(sock.value, 1);
});

test('a Chronicle of Atzoatl is searched by its rooms; the best open rooms are ticked', () => {
  const { prepareSearch, buildQuery } = require('../src/core/trade');
  const { parseItem } = require('../src/core/item-parser');
  const room = (id, text) => ({ id: `pseudo.pseudo_temple_${id}`, text: `Has Room: ${text}`, type: 'pseudo', option: { options: [{ id: 1, text: 'Open Room' }, { id: 2, text: 'Closed Room' }] } });
  const stats = { result: [{ id: 'pseudo', entries: [room('apex', 'Apex of Atzoatl'), room('corruption_room_3', 'Locus of Corruption (Tier 3)'), room('gem_room_3', "Doryani's Institute (Tier 3)"), room('currency_vault_1', 'Vault (Tier 1)'), room('tunnels', 'Tunnels')] }] };
  const text = 'Item Class: Misc Map Items\nRarity: Currency\nChronicle of Atzoatl\n--------\nArea Level: 83\n--------\nOpen Rooms:\nVault (Tier 1)\nLocus of Corruption (Tier 3)\nTunnels\nDoryani\'s Institute (Tier 3)\nObstructed Rooms:\nApex of Atzoatl\n--------\n"Much could be learned." - Icius Perandus, Antiquities Collection, Vaal Mural\n--------\nRight click this item to view the Temple of Atzoatl.\n';
  const item = parseItem(text);
  const { mods } = prepareSearch(stats, item);
  assert.deepEqual(mods.filter((m) => m.enabled).map((m) => m.text), ['Locus of Corruption (Tier 3)', "Doryani's Institute (Tier 3)"]);
  assert.deepEqual(mods.map((m) => m.text), ['Locus of Corruption (Tier 3)', "Doryani's Institute (Tier 3)", 'Vault (Tier 1)', 'Tunnels', 'Apex of Atzoatl (obstructed)']);
  const q = buildQuery(item, mods, {});
  assert.equal(q.query.type, 'Chronicle of Atzoatl');
  // the area level counts: at least the temple's own, from the panel's settings
  const r = prepareSearch(stats, item);
  assert.deepEqual(r.props.areaLevel, { on: true, min: 83, max: null, show: true });
  assert.deepEqual(buildQuery(item, r.mods, { props: r.props }).query.filters.map_filters, { filters: { area_level: { min: 83 } } });
  assert.deepEqual(q.query.stats[0].filters, [
    { id: 'pseudo.pseudo_temple_corruption_room_3', disabled: false, value: { option: 1 } },
    { id: 'pseudo.pseudo_temple_gem_room_3', disabled: false, value: { option: 1 } },
  ]);
  // an open Apex is ticked too
  const open = prepareSearch(stats, parseItem(text.replace('Obstructed Rooms:\nApex', 'Apex'))).mods;
  assert.ok(open.find((m) => m.text === 'Apex of Atzoatl').enabled);
});

test('weapons: physical, elemental and total DPS, each ticked only for a good damage mod', () => {
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.physpct', text: '#% increased Physical Damage', type: 'explicit' },
    { id: 'explicit.fire', text: 'Adds # to # Fire Damage', type: 'explicit' },
    { id: 'explicit.light', text: 'Adds # to # Lightning Damage', type: 'explicit' },
    { id: 'explicit.aspd', text: '#% increased Attack Speed', type: 'explicit' },
  ] }] };
  const axe = (phys, ele) => `Item Class: Two Hand Axes\nRarity: Rare\nEntropy Song\nJasper Chopper\n--------\nTwo Hand Axe\nPhysical Damage: 60-100 (augmented)\nElemental Damage: 10-20 (augmented)\nCritical Strike Chance: 5.00%\nAttacks per Second: 1.25 (augmented)\n--------\nItem Level: 84\n--------\n{ Prefix Modifier "Tyrannical" (Tier: ${phys}) — Damage, Physical, Attack }\n80(70-90)% increased Physical Damage\n{ Prefix Modifier "Smoldering" (Tier: ${ele}) — Damage, Elemental, Fire, Attack }\nAdds 10(8-12) to 20(18-22) Fire Damage\n`;
  const kinds = (t) => T.prepareSearch(stats, parseItem(t)).props.dps.kinds;
  // a tier 2 physical mod, a low fire mod: physical DPS only
  let k = kinds(axe(2, 7));
  assert.deepEqual(Object.fromEntries(Object.entries(k).map(([n, d]) => [n, d.on])), { phys: true, ele: false, total: false });
  // a low physical mod and a tier 1 fire mod: elemental DPS only
  k = kinds(axe(6, 1));
  assert.deepEqual(Object.fromEntries(Object.entries(k).map(([n, d]) => [n, d.on])), { phys: false, ele: true, total: false });
  // both good: all three, each at 90% of its value
  const r = T.prepareSearch(stats, parseItem(axe(1, 2)));
  assert.ok(Object.values(r.props.dps.kinds).every((d) => d.on));
  const q = T.buildQuery(parseItem(axe(1, 2)), r.mods, { props: r.props });
  assert.deepEqual(Object.keys(q.query.filters.weapon_filters.filters).sort(), ['dps', 'edps', 'pdps']);
  assert.equal(q.query.filters.weapon_filters.filters.edps.min, r.props.dps.kinds.ele.min);
  // nothing good: no DPS ticked, no DPS filter
  const none = T.prepareSearch(stats, parseItem(axe(7, 8)));
  assert.equal(none.props.dps.on, false);
  assert.equal(T.buildQuery(parseItem(axe(7, 8)), none.mods, { props: none.props }).query.filters.weapon_filters, undefined);
});

test('a Foulborn unique: its Foulborn mod is marked and ticked; "Foulborn only" can be unticked', () => {
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.stat_1509134228', text: '#% increased Physical Damage', type: 'explicit' },
    { id: 'explicit.effect_2714845045', text: 'Socketed Gems are Supported by Level # Returning Projectiles Support', type: 'explicit' },
  ] }] };
  const text = "Item Class: Bows\nRarity: Unique\nFoulborn Xoph's Inception\nCitadel Bow\n--------\nBow\nPhysical Damage: 99-396 (augmented)\nAttacks per Second: 1.25\n--------\nItem Level: 85\n--------\n{ Unique Modifier — Damage, Physical, Attack }\n175(160-190)% increased Physical Damage\n{ Foulborn Unique Modifier }\nSocketed Gems are Supported by Level 20 Returning Projectiles Support — Unscalable Value\n--------\nUpon the red pyre we are born.\n";
  const item = parseItem(text);
  const r = T.prepareSearch(stats, item);
  const foul = r.mods.find((m) => /Returning/.test(m.text));
  assert.ok(foul.foulborn && foul.enabled && !foul.hidden);
  assert.deepEqual(r.props.foulborn, { show: true, on: true });
  assert.deepEqual(T.buildQuery(item, r.mods, { props: r.props }).query.filters.misc_filters.filters.mutated, { option: 'true' });
  r.props.foulborn.on = false;
  assert.equal(T.buildQuery(item, r.mods, { props: r.props }).query.filters.misc_filters?.filters?.mutated, undefined);
});

test('maps: not corrupted ones search not corrupted; other special map implicits are left out', () => {
  const stats = { result: [{ id: 'implicit', entries: [
    { id: 'implicit.stat_2696470877', text: "Area is Influenced by the Originator's Memories", type: 'implicit' },
    { id: 'implicit.stat_2563183002|1', text: "Map contains Baran's Citadel", type: 'implicit' },
  ] }] };
  const map = (imp) => parseItem(`Item Class: Maps\nRarity: Normal\nMap (Tier 16)\n--------\nItem Level: 85\n--------\nMonster Level: 83\n--------\n${imp ? `{ Implicit Modifier }\n${imp}\n--------\n` : ''}Travel to a Map of this tier or lower by using this in a personal Map Device.\n`);
  const q = (it) => { const r = T.prepareSearch(stats, it); return T.buildQuery(it, r.mods, { props: r.props }).query; };
  const o = q(map("Area is Influenced by the Originator's Memories — Unscalable Value"));
  assert.deepEqual(o.filters.misc_filters.filters.corrupted, { option: 'false' });
  const opt = (id, n) => Array.from({ length: n }, (_, i) => ({ id, value: { option: i + 1 } }));
  assert.deepEqual(o.stats[1], { type: 'not', filters: [...opt('implicit.stat_2563183002', 4), ...opt('implicit.stat_3624393862', 4), ...opt('implicit.stat_1792283443', 2)] });
  // a plain T16: none of them (Originator too)
  assert.equal(q(map(null)).stats[1].filters.length, 11);
  // a conqueror map keeps its citadel and leaves out the others
  const c = q(map("Map contains Baran's Citadel"));
  assert.ok(!c.stats[1].filters.some((f) => f.id === 'implicit.stat_2563183002'));
});

test('an Inscribed Ultimatum is searched by its reward and sacrifice; a unique reward by the unique', () => {
  const stats = { result: [{ id: 'ultimatum', entries: [{ id: 'ultimatum.umod_7052', text: 'Razor Dance', type: 'ultimatum' }] }] };
  const ulti = (reward, sac) => parseItem(`Item Class: Misc Map Items\nRarity: Currency\nInscribed Ultimatum\n--------\nChallenge: Survive\nArea Level: 83\nRequires Sacrifice: ${sac}\nReward: ${reward}\n--------\nRazor Dance\n(Blades will periodically appear and fly at you, applying Corrupted Blood on Hit)\n--------\nCan be used in a personal map device to open portals to the Trialmaster's Domain.\n`);
  const q = (it) => { const r = T.prepareSearch(stats, it); return { r, q: T.buildQuery(it, r.mods, { props: r.props }).query }; };
  const a = q(ulti('Doubles sacrificed Divination Cards', 'The Rite of Elements x3'));
  assert.deepEqual(a.q.filters.ultimatum_filters.filters, { ultimatum_reward: { option: 'DoubleDivCards' }, ultimatum_input: { option: 'The Rite of Elements' } });
  assert.deepEqual(a.r.mods.map((m) => [m.id, m.enabled]), [['ultimatum.umod_7052', false]]);
  a.r.props.ultimatum.challengeOn = true;
  assert.equal(T.buildQuery(ulti('Doubles sacrificed Divination Cards', 'The Rite of Elements x3'), a.r.mods, { props: a.r.props }).query.filters.ultimatum_filters.filters.ultimatum_challenge.option, 'Survival');
  const u = q(ulti('Mageblood', 'Headhunter'));
  assert.deepEqual(u.q.filters.ultimatum_filters.filters, { ultimatum_output: { option: 'Mageblood' } }, 'a unique swap: only the unique it gives');
});

test('an Inscribed Ultimatum with "more Monster Life": searched at its number, first and marked', () => {
  const stats = { result: [{ id: 'explicit', entries: [{ id: 'explicit.stat_95249895', text: '#% more Monster Life', type: 'explicit' }, { id: 'explicit.stat_1890519597', text: '#% increased Monster Damage', type: 'explicit' }] }, { id: 'ultimatum', entries: [{ id: 'ultimatum.umod_38838', text: 'Deadly Monsters', type: 'ultimatum' }] }] };
  const it = parseItem("Item Class: Misc Map Items\nRarity: Currency\nInscribed Ultimatum\n--------\nChallenge: Stand in the Stone Circles\nArea Level: 83\nRequires Sacrifice: Chaos Orb x20\nReward: Doubles sacrificed Currency\n--------\nDeadly Monsters\n(Monster Hits are always Critical Strikes)\n10% increased Monster Damage\n30% more Monster Life\n--------\nCan be used in a personal map device.\n");
  const r = T.prepareSearch(stats, it);
  assert.equal(r.mods[0].text, '30% more Monster Life');
  assert.ok(r.mods[0].key && r.mods[0].enabled);
  assert.ok(!r.mods.find((m) => /increased Monster Damage/.test(m.text)).enabled);
  assert.deepEqual(r.mods[0].choices, [30, 70, 120, 200]);
  assert.deepEqual(T.buildQuery(it, r.mods, { props: r.props }).query.stats[0].filters, [{ id: 'explicit.stat_95249895', disabled: false, value: { min: 30, max: 30 } }]);
});

test('an Inscribed Ultimatum listing shows what it asks you to sacrifice', () => {
  const L = (n, amount) => ({ listing: { price: { amount, currency: 'chaos' }, account: { name: 'a', online: {} }, indexed: '2026-11-23T10:00:00Z' }, item: { properties: [{ name: 'Requires Sacrifice: {0} {1}', values: [['Chaos Orb', 18], [`x${n}`, 0]] }] } });
  const s = T.summarizeListings({ result: [L(10, 1), L(20, 1), { listing: { price: { amount: 3, currency: 'chaos' }, account: { name: 'b' } }, item: {} }] }, 200);
  assert.deepEqual(s.prices.map((x) => [x.note, x.times]), [['Chaos Orb ×10', 1], ['Chaos Orb ×20', 1], [null, 1]]);
});

test('a jewel that is not corrupted or fractured only compares with ones that are neither', () => {
  const it = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'cluster-large-spell.txt'), 'utf8'));
  const { mods, props } = T.prepareSearch(STATS, it);
  assert.equal(props.corrupted, 'no');
  assert.equal(props.fracturedState, 'no');
  const q = T.buildQuery(it, mods, { props });
  assert.deepEqual(q.query.filters.misc_filters.filters.corrupted, { option: 'false' });
  assert.deepEqual(q.query.filters.misc_filters.filters.fractured_item, { option: 'false' });
  // a fractured, corrupted jewel: only those
  const f = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'cluster-large-spell.txt'), 'utf8').replace('Item Level: 84\n--------', 'Item Level: 84\n--------').replace(/Right click to remove from the Socket\.\n?$/, 'Right click to remove from the Socket.\n--------\nCorrupted\n--------\nFractured Item\n'));
  const pf = T.prepareSearch(STATS, f).props;
  assert.equal(pf.corrupted, 'yes');
  assert.equal(pf.fracturedState, 'yes');
});

test('a Foulborn unique with a rolled Foulborn mod: that mod starts ticked', () => {
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.stat_2250533757', text: '#% increased Movement Speed', type: 'explicit' },
    { id: 'explicit.stat_2723294374', text: '#% increased Armour while Bleeding', type: 'explicit' },
  ] }] };
  const item = parseItem(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'foulborn.txt'), 'utf8'));
  const r = T.prepareSearch(stats, item);
  const foul = r.mods.find((m) => /Armour while Bleeding/.test(m.text));
  assert.ok(foul.foulborn && foul.enabled && !foul.hidden);
  assert.ok(foul.min != null && foul.min <= 69);
});

test('a timeless jewel: its exact seed; a magic jewel: magic ones only (a tick to switch off)', () => {
  const fs = require('fs'); const path = require('path');
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.pseudo_timeless_jewel_caspiro', text: 'Commissioned # coins to commemorate Caspiro', type: 'explicit' },
    { id: 'explicit.stat_983749596', text: '#% increased maximum Life', type: 'explicit' },
    { id: 'explicit.stat_2915988346', text: '+#% to Fire and Cold Resistances', type: 'explicit' },
  ] }] };
  const hub = parseItem(fs.readFileSync(path.join(__dirname, 'fixtures', 'elegant-hubris.txt'), 'utf8'));
  const seed = T.prepareSearch(stats, hub).mods.find((m) => /Commissioned/.test(m.text));
  assert.deepEqual([seed.enabled, seed.min, seed.max], [true, 28120, 28120]);
  const mj = parseItem(fs.readFileSync(path.join(__dirname, 'fixtures', 'magic-crimson-jewel.txt'), 'utf8'));
  const r = T.prepareSearch(stats, mj);
  assert.deepEqual(r.props.magicOnly, { show: true, on: true });
  assert.equal(T.buildQuery(mj, r.mods, { props: r.props }).query.filters.type_filters.filters.rarity.option, 'magic');
  r.props.magicOnly.on = false;
  assert.equal(T.buildQuery(mj, r.mods, { props: r.props }).query.filters.type_filters.filters.rarity.option, 'nonunique');
});

test('uniques with versions: the version line is ticked (Sublime Vision, Thread of Hope)', () => {
  const fs = require('fs'); const path = require('path');
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.stat_sv_eff', text: 'Auras from your Skills have #% increased Effect on you', type: 'explicit' },
    { id: 'explicit.stat_sv_scorch', text: 'Always Scorch while affected by Anger', type: 'explicit' },
    { id: 'explicit.stat_sv_anger', text: 'Aura Skills other than Anger are Disabled', type: 'explicit' },
  ] }] };
  const sv = parseItem(fs.readFileSync(path.join(__dirname, 'fixtures', 'sublime-vision.txt'), 'utf8'));
  const m = T.prepareSearch(stats, sv).mods.find((x) => /other than Anger/.test(x.text));
  assert.ok(m && m.enabled && !m.hidden);
  const st2 = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.stat_toh_ring', text: 'Only affects Passives in Very Large Ring', type: 'explicit' },
    { id: 'explicit.stat_toh_conn', text: 'Passives in Radius can be Allocated without being connected to your tree', type: 'explicit' },
    { id: 'explicit.stat_toh_res', text: '#% to all Elemental Resistances', type: 'explicit' },
  ] }] };
  const toh = parseItem(fs.readFileSync(path.join(__dirname, 'fixtures', 'thread-of-hope.txt'), 'utf8'));
  const ring = T.prepareSearch(st2, toh).mods.find((x) => /Very Large Ring/.test(x.text));
  assert.ok(ring && ring.enabled && !ring.hidden);
  // a real copy: three lines under one header, flavour text, Foil and Shaper sections after it
  const st3 = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.stat_sv_eff', text: 'Auras from your Skills have #% increased Effect on you', type: 'explicit' },
    { id: 'explicit.stat_sv_curse', text: 'You can apply an additional Curse while affected by Malevolence', type: 'explicit' },
    { id: 'explicit.stat_sv_mal', text: 'Aura Skills other than Malevolence are Disabled', type: 'explicit' },
  ] }] };
  const svm = parseItem(fs.readFileSync(path.join(__dirname, 'fixtures', 'sublime-vision-malevolence.txt'), 'utf8'));
  assert.equal(svm.mods.explicit.length, 3, 'flavour text is not a mod');
  const mm = T.prepareSearch(st3, svm).mods;
  assert.deepEqual(mm.map((x) => !!x.enabled), [true, true, true]);
});

test('a socketed support mod is found even when the list drops the last "Support"', () => {
  const fs = require('fs'); const path = require('path');
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.indexable_support_74', text: 'Socketed Gems are Supported by Level # Hypothermia', type: 'explicit' },
  ] }] };
  const it = parseItem(fs.readFileSync(path.join(__dirname, 'fixtures', 'hypothermia-helm.txt'), 'utf8'));
  const m = T.prepareSearch(stats, it).mods.find((x) => /Hypothermia/.test(x.text));
  assert.equal(m.id, 'explicit.indexable_support_74');
  assert.ok(!m.unmatched);
});

test('Entropic Devastation: "Grants Call of Steel" (a zero-width space in it) and "Spells inflict Impale" are found', () => {
  const fs = require('fs'); const path = require('path');
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.effect_3467858890', text: 'Grants Call of Steel', type: 'explicit' },
    { id: 'explicit.stat_4084476257', text: 'Critical Strikes with Spells have #% chance to inflict Impale', type: 'explicit' },
    { id: 'explicit.stat_3678739763', text: 'Linked Targets always count as in range of Non-Curse Auras from your Skills\nNon-Curse Auras from your Skills only apply to you and Linked Targets', type: 'explicit' },
  ] }] };
  const it = parseItem(fs.readFileSync(path.join(__dirname, 'fixtures', 'entropic-devastation.txt'), 'utf8'));
  const mods = T.prepareSearch(stats, it).mods;
  assert.equal(mods.find((m) => /Call of Steel/.test(m.text)).id, 'explicit.effect_3467858890');
  const imp = mods.find((m) => /inflict Impale/.test(m.text));
  assert.equal(imp.id, 'explicit.stat_4084476257');
  assert.equal(imp.display, 100);
  // two lines that are one stat, from a plain copy; and quoted flavour text isn't a mod
  const arn = parseItem('Item Class: Body Armours\nRarity: Unique\nArn\'s Anguish\nVaal Regalia\n--------\nItem Level: 80\n--------\nLinked Targets always count as in range of Non-Curse Auras from your Skills\nNon-Curse Auras from your Skills only apply to you and Linked Targets\n--------\n"The clans came together.\nAnd more."\n');
  const am = T.prepareSearch(stats, arn).mods;
  assert.equal(am.length, 1);
  assert.equal(am[0].id, 'explicit.stat_3678739763');
});

test('The Tides of Time: "gain 0 Charges" is 0 (the trade site says "Charge"), not 1.5; a 0 roll isn\'t searched', () => {
  const fs = require('fs'); const path = require('path');
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.stat_2592686757', text: 'Life Flasks gain # Charge every 3 seconds', type: 'explicit' },
    { id: 'explicit.stat_1193925814', text: 'Mana Flasks gain # Charge every 3 seconds', type: 'explicit' },
    { id: 'explicit.stat_2567919918', text: 'Utility Flasks gain # Charge every 3 seconds', type: 'explicit' },
  ] }] };
  const mods = T.prepareSearch(stats, parseItem(fs.readFileSync(path.join(__dirname, 'fixtures', 'tides-of-time.txt'), 'utf8'))).mods;
  const life = mods.find((m) => /^Life Flasks/.test(m.text));
  const mana = mods.find((m) => /^Mana Flasks/.test(m.text));
  const util = mods.find((m) => /^Utility Flasks/.test(m.text));
  assert.deepEqual([life.display, mana.display, util.display], [0, 1, 3]);
  assert.equal(life.enabled, false);
  assert.deepEqual([mana.min, util.min], [1, 3]);
});

test('a not mirrored item is searched "not mirrored"; a mirrored one "mirrored"', () => {
  const fs = require('fs'); const path = require('path');
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'manifold-ring.txt'), 'utf8');
  const stats = { result: [{ id: 'explicit', entries: [{ id: 'explicit.stat_1050105434', text: '# to maximum Mana', type: 'explicit' }] }] };
  const it = parseItem(text);
  const r = T.prepareSearch(stats, it);
  assert.equal(r.props.mirrored, 'no');
  assert.deepEqual(T.buildQuery(it, r.mods, { props: r.props }).query.filters.misc_filters.filters.mirrored, { option: 'false' });
  const m = parseItem(`${text}--------\nMirrored\n`);
  const rm = T.prepareSearch(stats, m);
  assert.equal(rm.props.mirrored, 'yes');
  assert.deepEqual(T.buildQuery(m, rm.mods, { props: rm.props }).query.filters.misc_filters.filters.mirrored, { option: 'true' });
  assert.deepEqual(T.buildQuery(it, r.mods, { props: r.props }).query.filters.misc_filters.filters.fractured_item, { option: 'false' }, 'not fractured');
  // a Manifold Ring: 4 prefixes and 1 suffix allowed, so 1 open prefix and no open suffix
  assert.deepEqual(PF.emptyAffix(it), { prefix: 1, suffix: 0 });
});
