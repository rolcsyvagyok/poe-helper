'use strict';
// Path of Exile 2 price check: reading PoE2 items, matching mods to the trade2 stat list, the search, prices.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const T2 = require('../src/core/poe2/trade2');
const { createNinja2 } = require('../src/core/poe2/ninja2');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', 'poe2', `${n}.txt`), 'utf8');
// a few entries in the shape of GET /api/trade2/data/stats
const E = (id, text) => ({ id, text, type: id.split('.')[0] });
const STATS = { result: [
  { id: 'pseudo', entries: [E('pseudo.pseudo_total_elemental_resistance', '+#% total Elemental Resistance'), E('pseudo.pseudo_total_life', '+# total maximum Life')] },
  { id: 'explicit', entries: [
    E('explicit.stat_phys', '#% increased Physical Damage'), E('explicit.stat_addphys', 'Adds # to # Physical Damage'), E('explicit.stat_addcold', 'Adds # to # Cold Damage'),
    E('explicit.stat_attr', '#% increased Attribute Requirements'), E('explicit.stat_proj', '# to Level of all Projectile Skills'), E('explicit.stat_leech', 'Leeches #% of Physical Damage as Mana'),
    E('explicit.stat_ms', '#% increased Movement Speed'), E('explicit.stat_es', '#% increased Energy Shield'), E('explicit.stat_fes', '# to maximum Energy Shield (Local)'), E('explicit.stat_fes2', '# to maximum Energy Shield'),
    E('explicit.stat_fire', '#% to Fire Resistance'), E('explicit.stat_light', '#% to Lightning Resistance'), E('explicit.stat_mana', '# to maximum Mana'), E('explicit.stat_int', '# to Intelligence'),
    E('explicit.stat_spirit1', '# to Spirit'), E('explicit.stat_spirit2', '# to Spirit')] },
  { id: 'desecrated', entries: [E('desecrated.stat_fes', '# to maximum Energy Shield (Local)')] },
  { id: 'rune', entries: [E('rune.stat_phys', '#% increased Physical Damage'), E('rune.stat_aees', '#% increased Armour, Evasion and Energy Shield')] },
  { id: 'crafted', entries: [E('crafted.stat_spirit', '# to Spirit')] },
] };

test('poe2: a rare bow, its runes, DPS and the mods that start ticked', () => {
  const it = T2.parseItem2(fx('bow'));
  assert.equal(it.category, 'weapon.bow');
  assert.deepEqual(it.mods.rune, ['40% increased Physical Damage']);
  assert.equal(it.runeSockets, 2);
  assert.deepEqual(T2.weaponDps2(it), { pdps: 279.6, edps: 68.4, cdps: 0, dps: 348, aps: 1.2 });
  const r = T2.prepareSearch2(STATS, it);
  const on = r.mods.filter((m) => m.enabled).map((m) => m.text);
  assert.deepEqual(on, ['+3 to Level of all Projectile Skills', 'Leeches 4.02% of Physical Damage as Mana']);
  const proj = r.mods.find((m) => /Projectile/.test(m.text));
  assert.equal(proj.min, 2); // whole numbers stay whole
  const attr = r.mods.find((m) => /Attribute/.test(m.text));
  assert.deepEqual([attr.value, attr.max], [-35, -31]); // reduced: searched as at most -31% increased
  assert.ok(r.props.dps.kinds.phys.on);
  const q = T2.buildQuery2(it, r.mods, r.props).query;
  assert.equal(q.type, 'Expert Composite Bow');
  assert.deepEqual(q.filters.type_filters.filters.category, { option: 'weapon.bow' });
  assert.deepEqual(q.filters.equipment_filters.filters.pdps, { min: 251 });
  assert.deepEqual(q.stats[0].filters.map((f) => f.id), ['explicit.stat_proj', 'explicit.stat_leech']);
});

test('poe2: boots with a desecrated mod, totals and a stat listed twice', () => {
  const it = T2.parseItem2(fx('boots'));
  assert.deepEqual(it.mods.desecrated, ['+47 to maximum Energy Shield']);
  const r = T2.prepareSearch2(STATS, it);
  const total = r.mods.find((m) => m.id === 'pseudo.pseudo_total_elemental_resistance');
  assert.equal(total.value, 63);
  assert.ok(total.enabled);
  const spirit = r.mods.find((m) => /Spirit/.test(m.text));
  assert.equal(spirit.group, 'crafted');
  const des = r.mods.find((m) => m.desecrated);
  assert.equal(des.ids[0], 'desecrated.stat_fes');
  assert.ok(des.hidden); // counted in the energy shield
  assert.deepEqual(r.props.defence.map((d) => [d.key, d.value]), [['es', 203]]);
  // "+# to Spirit" is listed twice: the search takes either
  const two = T2.prepareSearch2(STATS, { ...it, mods: { explicit: ['+20 to Spirit'] }, modMeta: {} });
  const row = two.mods.find((m) => /Spirit/.test(m.text));
  assert.equal(row.ids.length, 2);
  row.enabled = true;
  const q = T2.buildQuery2(it, [row], {}).query;
  assert.equal(q.stats[1].type, 'count');
  assert.equal(q.stats[1].filters.length, 2);
});

test('poe2: a magic item\'s base, a waystone and a unique', () => {
  const staff = T2.parseItem2(fx('staff'), { bases: ['Ashen Staff', 'Staff'] });
  assert.equal(staff.baseType, 'Ashen Staff');
  const way = T2.parseItem2(fx('waystone'));
  assert.equal(way.waystoneTier, 15);
  const rw = T2.prepareSearch2(STATS, way);
  assert.deepEqual([rw.props.mapTier.min, rw.props.mapTier.max, rw.props.corrupted], [15, 15, 'yes']);
  assert.ok(rw.mods.every((m) => !m.enabled));
  const hh = T2.parseItem2(fx('headhunter'));
  const rh = T2.prepareSearch2(STATS, hh);
  const q = T2.buildQuery2(hh, rh.mods, rh.props).query;
  assert.deepEqual([q.name, q.type], ['Headhunter', 'Heavy Belt']);
  assert.deepEqual(q.filters.type_filters.filters.rarity, { option: 'unique' });
});

test('poe2: poe.ninja prices in exalted orbs', async () => {
  const lists = {
    Currency: { core: { primary: 'divine', rates: { exalted: 140 }, items: [{ id: 'divine', name: 'Divine Orb' }, { id: 'annul', name: 'Orb of Annulment' }] }, lines: [{ id: 'annul', primaryValue: 0.05 }] },
    UniqueAccessories: { lines: [{ name: 'Headhunter', baseType: 'Heavy Belt', exaltedValue: 4200, listingCount: 30 }] },
  };
  const fetchImpl = async (url) => ({ ok: true, json: async () => lists[/type=(\w+)/.exec(url)[1]] || { lines: [] } });
  const n = createNinja2({ fetchImpl, cache: null });
  assert.equal(await n.divineInEx('L'), 140);
  const annul = await n.price({ rarity: 'Currency', itemClass: 'Stackable Currency', typeLine: 'Orb of Annulment' }, 'L');
  assert.equal(annul.ex, 7);
  const hh = await n.price({ rarity: 'Unique', name: 'Headhunter', baseType: 'Heavy Belt', itemClass: 'Belts', flags: {} }, 'L');
  assert.equal(hh.ex, 4200);
});

test('poe2: listings in exalted orbs', () => {
  const r = T2.summarizeListings2({ result: [
    { listing: { price: { amount: 2, currency: 'divine' }, account: { name: 'a' } } },
    { listing: { price: { amount: 50, currency: 'exalted' }, account: { name: 'b', online: {} } } },
  ] }, { divineEx: 140 });
  assert.deepEqual([r.min, r.prices[0].currency, r.prices[1].currency], [50, 'div', 'ex']);
});
