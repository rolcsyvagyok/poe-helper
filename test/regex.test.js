'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../src/core/regex/maps');
const DATA = require('../src/core/regex/map-mods.json');

/** How the game reads a search: terms split by spaces outside quotes, all must match, "!" = must not. */
function gameSearch(search, text) {
  const terms = search.match(/"[^"]*"|\S+/g) || [];
  return terms.every((t) => {
    let s = t.replace(/^"|"$/g, '');
    const neg = s.startsWith('!');
    if (neg) s = s.slice(1);
    const hit = new RegExp(s, 'im').test(text); // the game's $ ends a line (poe.re's pieces rely on it)
    return neg ? !hit : hit;
  });
}
const mapText = (lines, { quantity = 60, pack = 20, rarity = 'Rare', corrupted = false } = {}) => [
  'Item Class: Maps', `Rarity: ${rarity}`, 'Grim Haven', 'Strand Map', '--------', 'Map Tier: 16',
  `Atlas Drops: +${quantity}% (augmented)`, 'Item Rarity: +40% (augmented)', `Monster Pack Size: +${pack}% (augmented)`, '--------', 'Item Level: 83', '--------',
  ...lines.map((l) => l.replace(/#/g, '23')), '--------', 'Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.', ...(corrupted ? ['Corrupted'] : []),
].join('\n');
const find = (s, kind = 'regular') => R.modsFor(kind).find((m) => m.lines.join(' ').toLowerCase().includes(s.toLowerCase()));

test('the map mod list comes from the game data', () => {
  assert.ok(DATA.mods.length > 80);
  assert.ok(find('Cursed with Vulnerability'));
  assert.ok(!DATA.mods.some((m) => m.lines.some((l) => /\[|\]/.test(l))), 'no game markup left');
  assert.ok((DATA.mapNames || []).includes('Strand Map'));
});

test('at least: every number from 0 to 999 is judged right', () => {
  for (const n of [1, 7, 10, 35, 80, 99, 100, 145, 300]) {
    const re = new RegExp(`^${R.atLeast(n)}$`);
    for (let x = 0; x < 1000; x++) assert.equal(re.test(String(x)), x >= n, `${n} vs ${x}`);
  }
  assert.equal(R.atLeast(0), '');
});

test('each mod\'s own piece matches only that mod among the maps\' mods', () => {
  for (const kind of ['regular', 't17']) {
    const v = R.mapRegexView({ kind, nightmare: true });
    const all = R.modsFor(kind, { nightmare: true });
    for (const m of v.mods.filter((x) => x.piece)) {
      const others = all.filter((o) => o.id !== m.id && o.lines.join('\n').toLowerCase().includes(m.piece));
      assert.deepEqual(others.map((o) => o.lines[0]), [], `${m.piece} (${m.lines[0]})`);
      assert.ok(!/strand map|item quantity|travel to this map/i.test(m.piece));
    }
    // Tier 17 mods are often two regular mods in one, so fewer of them have a piece of their own
    assert.ok(v.mods.filter((x) => x.piece).length > v.mods.length * (kind === 't17' ? 0.75 : 0.9), 'most mods have their own piece');
  }
});

test('skipping mods: maps with them are left out, the others found', () => {
  const skip = ['Cursed with Vulnerability', 'Cursed with Temporal Chains', 'cannot Regenerate', 'Physical Thorns', 'maximum Resistances'].map((s) => find(s).id);
  const r = R.buildMapRegex({ avoid: skip, numbers: { quantity: 80 } });
  assert.ok(r.length <= r.max);
  const every = R.modsFor('regular');
  for (const m of every) {
    const text = mapText([...m.lines, find('Burning Ground').lines[0]], { quantity: 95 });
    const shouldShow = !skip.includes(m.id) && !(r.notes.join(' ').includes(m.lines[0]));
    assert.equal(gameSearch(r.regex, text), shouldShow, `${m.lines[0]} with ${r.regex}`);
  }
  // quantity below the minimum is left out
  assert.equal(gameSearch(r.regex, mapText([find('Burning Ground').lines[0]], { quantity: 79 })), false);
  assert.equal(gameSearch(r.regex, mapText([find('Burning Ground').lines[0]], { quantity: 112 })), true);
});

test('several curses share one short piece', () => {
  const curses = R.modsFor('regular').filter((m) => /Cursed with/.test(m.lines[0])).map((m) => m.id);
  const r = R.coverMods(curses);
  assert.equal(r.pieces.length, 1, r.pieces.join('|'));
});

test('wanted mods: any one, or all of them', () => {
  const a = find('two Unique Bosses').id;
  const b = find('many Totems').id;
  const any = R.buildMapRegex({ want: [a, b] });
  const all = R.buildMapRegex({ want: [a, b], wantAll: true });
  const one = mapText(find('two Unique Bosses').lines);
  const both = mapText([...find('two Unique Bosses').lines, ...find('many Totems').lines]);
  const none = mapText(find('Burning Ground').lines);
  assert.equal(gameSearch(any.regex, one), true);
  assert.equal(gameSearch(any.regex, none), false);
  assert.equal(gameSearch(all.regex, one), false);
  assert.equal(gameSearch(all.regex, both), true);
});

test('rarity, corrupted, map types and your own text', () => {
  const r = R.buildMapRegex({ rarity: { normal: 'avoid', magic: 'avoid' }, corrupted: 'avoid', mapTypes: { blighted: 'avoid', shaper: 'avoid' }, custom: '!delirium' });
  assert.doesNotMatch(r.regex, /blighted|shaper/, 'map types are only for the trade search');
  assert.equal(gameSearch(r.regex, mapText([], { rarity: 'Rare' })), true);
  assert.equal(gameSearch(r.regex, mapText([], { rarity: 'Magic' })), false);
  assert.equal(gameSearch(r.regex, mapText([], { corrupted: true })), false);
  assert.match(r.regex, /!delirium$/);
});

test('too long a search is flagged', () => {
  const ids = R.modsFor('regular').map((m) => m.id);
  const r = R.buildMapRegex({ want: ids, wantAll: true });
  assert.ok(r.length > r.max);
  assert.match(r.notes[0], /characters/);
});

test('trade search: skipped mods are a "not" group, wanted ones "any of", numbers are map filters', () => {
  const T = require('../src/core/regex/map-trade');
  const skip = [find('Cursed with Vulnerability').id, find('Physical Thorns').id];
  const want = [find('two Unique Bosses').id];
  const stats = { result: [{ entries: [
    { id: find('Cursed with Vulnerability').trade[0], text: 'Players are Cursed with Vulnerability' },
    { id: 'explicit.stat_thorns_test', text: 'Rare Monsters have Physical Thorns reflecting # Physical Damage' },
    ...(find('two Unique Bosses').trade.map((id) => ({ id, text: 'Area contains two Unique Bosses' }))),
  ] }] };
  const { query, notes } = T.buildMapTradeQuery({ avoid: skip, want, numbers: { quantity: 80, packSize: 30, scarabs: 20 },  corrupted: 'avoid', rarity: { normal: 'avoid', magic: 'avoid' }, mapTypes: { blighted: 'avoid' } }, { tierMin: 16, tierMax: 16 }, stats);
  const q = query.query;
  const not = q.stats.find((s) => s.type === 'not');
  assert.deepEqual(not.filters.map((f) => f.id), [find('Cursed with Vulnerability').trade[0], 'explicit.stat_thorns_test'], 'a mod without an id is found by its text');
  assert.equal(q.stats.find((s) => s.type === 'count').value.min, 1);
  assert.deepEqual(q.filters.map_filters.filters.map_tier, { min: 16, max: 16 });
  assert.deepEqual(q.filters.map_filters.filters.map_iiq, { min: 80 });
  assert.deepEqual(q.filters.map_filters.filters.map_packsize, { min: 30 });
  assert.deepEqual(q.filters.map_filters.filters.map_blighted, { option: 'false' });
  assert.equal(q.filters.type_filters.filters.category.option, 'map');
  assert.equal(q.filters.type_filters.filters.rarity.option, 'rare');
  assert.equal(q.filters.misc_filters.filters.corrupted.option, 'false');
  assert.deepEqual(q.stats.find((s) => s.type === 'and').filters, [{ id: 'pseudo.pseudo_map_more_scarab_drops', value: { min: 20 } }], 'more scarabs is a pseudo stat');
  const types = T.buildMapTradeQuery({ mapTypes: { shaper: 'avoid', conqueror: 'avoid' } }).query.query.stats[0];
  assert.equal(types.type, 'not');
  assert.ok(types.filters.some((f) => f.id === 'implicit.stat_1792283443|1') && types.filters.some((f) => f.id === 'implicit.stat_2563183002|4'));
  const any = T.buildMapTradeQuery({ numbers: { maps: 10, currency: 10 }, numbersAny: true }).query.query.stats[0];
  assert.equal(any.type, 'count');
  assert.equal(any.filters.length, 2);
  const eight = T.buildMapTradeQuery({}, { modsMin: 8 }).query.query.stats[0];
  assert.deepEqual(eight.filters, [{ id: 'pseudo.pseudo_number_of_affix_mods', value: { min: 8 } }]);
  assert.equal(R.atLeast(20), '([2-9]\\d|\\d{3})');
  const t17 = T.buildMapTradeQuery({ kind: 't17' }, { tierMin: 3 }).query.query;
  assert.deepEqual(t17.filters.map_filters.filters.map_tier, { min: 17, max: 17 });
});

test('nightmare (tier 17) maps: no influence or rarity choices, corrupted and identified still apply', () => {
  const T = require('../src/core/regex/map-trade');
  const c = { kind: 't17', mapTypes: { shaper: 'want' }, rarity: { magic: 'want' }, corrupted: 'avoid', unidentified: 'avoid' };
  const r = R.buildMapRegex(c);
  assert.doesNotMatch(r.regex, /shaper|rity: m/);
  assert.match(r.regex, /!corrupted/);
  assert.match(r.regex, /!unidentified/);
  const q = T.buildMapTradeQuery(c, {}).query.query;
  assert.ok(!q.stats.some((s) => s.filters.some((f) => f.id.startsWith('implicit.'))));
  assert.equal(q.filters.type_filters.filters.rarity, undefined);
  assert.equal(q.filters.misc_filters.filters.corrupted.option, 'false');
  assert.equal(q.filters.misc_filters.filters.identified.option, 'true');
});

test('map regex: each picked mod is found by its own text (not only by its name on magic maps)', () => {
  const MR = require('../src/core/regex/maps');
  const DATA = require('../src/core/regex/map-mods.json');
  const lines = new Map(DATA.mods.map((m) => [m.id, m.lines.map((l) => l.replace(/#/g, '25'))]));
  for (const kind of ['regular', 't17']) {
    const mods = MR.modsFor(kind, { nightmare: true }).map((m) => m.id);
    for (let n = 0; n < 60; n++) {
      const pick = mods.filter((_, i) => (i * 7 + n * 13) % 9 === 0 || (i + n) % 11 === 0);
      const re = new RegExp(MR.coverMods(pick, kind).pieces.join('|'), 'im');
      for (const id of pick) assert.ok(re.test(lines.get(id).join('\n')), `${kind} ${id} found`);
    }
  }
  // "Monsters have #% increased Area of Effect" without the Unique Boss's area: a number in the piece tells them apart
  const aoe = MR.coverMods(['MapMonsterAreaOfEffect2MapWorlds'], 'regular');
  assert.deepEqual(aoe.extra, []);
  assert.match(aoe.pieces[0], /\\d\+/);
});

test('map regex: a skipped mod\'s piece never matches the reminder text under another mod (3.30 map)', () => {
  const MR = require('../src/core/regex/maps');
  const DATA = require('../src/core/regex/map-mods.json');
  const map = [
    'Item Class: Maps', 'Rarity: Rare', 'Woe Resolve', 'Map (Tier 16)', 'Atlas Drops: +78% (augmented)', 'Item Rarity: +47% (augmented)', 'Monster Pack Size: +30% (augmented)',
    'Item Level: 84', 'Monster Level: 83', 'Area has increased monster variety', '30% increased number of Rare Monsters', 'Monsters deal 106% extra Physical Damage as Cold',
    'Players gain 50% reduced Flask Charges', 'Players are Cursed with Enfeeble',
    "(Enfeeble is a Hex which reduces the targets' Accuracy Rating by 10% and Damage by 15%, or 9% on Rare or Unique targets. It lasts 8 seconds)",
    'Players are Cursed with Elemental Weakness', '(Elemental Weakness is a Hex which inficts -15% to all Elemental Resistances. It lasts 8 seconds)',
    'Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.',
  ].join('\n');
  const skip = MR.modsFor('regular', { nightmare: true }).filter((m) => m.lines.some((l) => /cannot regenerate|less cooldown recovery|less recovery rate of life|reduced chance to block|to all maximum resistances/i.test(l))).map((m) => m.id);
  assert.equal(skip.length, 5);
  const re = new RegExp(MR.coverMods(skip, 'regular').pieces.join('|'), 'im');
  assert.ok(!re.test(map), 'the map is not hidden');
  // and in general: no single mod's piece matches any reminder text
  const rem = DATA.mods.flatMap((m) => (m.reminders || []).map((r) => [m.id, r]));
  assert.ok(rem.length > 10);
  for (const m of MR.modsFor('regular', { nightmare: true })) {
    const r = new RegExp(MR.coverMods([m.id], 'regular').pieces.join('|'), 'im');
    for (const [id, text] of rem) if (id !== m.id) assert.ok(!r.test(text), `${m.id} matches the reminder of ${id}`);
  }
});

test('map regex: 3.30 map lines (Atlas Drops, More Threads)', () => {
  const MR = require('../src/core/regex/maps');
  const r = MR.buildMapRegex({ numbers: { quantity: 70, scarabs: 20 } });
  assert.match(r.regex, /ops: \\\+/);
  assert.match(r.regex, /ads: \\\+/);
});

test('map regex: quality kinds, and "any one" for numbers and quality', () => {
  const M = require('../src/core/regex/maps');
  const r = M.buildMapRegex({ kind: 'regular', quality: { currency: 10, rarity: 20 }, qualityAny: true, numbers: { quantity: 80, packSize: 30 }, numbersAny: true });
  assert.match(r.regex, /ncy\\\): \\\+/);
  assert.equal(r.parts.filter((p) => /one of/.test(p.label)).length, 2);
});

test('flask regex: a prefix and a suffix, or any one', () => {
  const I = require('../src/core/regex/items');
  const v = I.magicView({ type: 'LifeFlask', allTiers: true });
  const p = v.families.find((f) => f.aff === 'prefix'); const s = v.families.find((f) => f.aff === 'suffix');
  const picks = { [p.key]: [1], [s.key]: [1] };
  assert.equal((I.buildMagicRegex({ type: 'LifeFlask', allTiers: true, mode: 'ps', picks }).regex.match(/"/g) || []).length, 4);
  assert.equal((I.buildMagicRegex({ type: 'LifeFlask', allTiers: true, mode: 'any', picks }).regex.match(/"/g) || []).length, 2);
});

test('map regex: every piece has at least 3 letters (2 when it ends a line), so rare map names don\'t trip it', () => {
  const M = require('../src/core/regex/maps');
  for (const kind of ['regular', 't17']) {
    for (const m of M.mapRegexView({ kind, nightmare: true }).mods) {
      for (const p of M.coverMods([m.id], kind).pieces) {
        const letters = p.replace(/\$$/, '').replace(/\\d\+/g, '').replace(/ /g, '').length;
        assert.ok(letters >= 3 || (p.endsWith('$') && letters >= 2), `${m.lines[0]}: "${p}"`);
      }
    }
  }
});

test('map pieces stay clear of T17 mods and dashes when they can', () => {
  const M = require('../src/core/regex/maps.js');
  const D = require('../src/core/regex/map-mods.json').mods;
  const ids = ['MapMonsterLifeLeechImmunityMapWorlds', 'MapMonstersStealChargesOnHitMapWorlds', 'MapPlayerNoLifeESRegenMapWorlds', 'MapPlayersLessCooldownRecovery2MapWorlds',
    'MapPlayerReducedRegen1MapWorlds', 'MapPlayersBlockAndArmour2MapWorlds', 'MapPlayersReducedAuraEffect2MapWorlds', 'MapPlayerMaxResists1MapWorlds'];
  const r = M.coverMods(ids, 'regular');
  assert.deepEqual(r.missing, []);
  assert.ok(r.pieces.every((p) => !p.includes('-')), r.pieces.join('|'));
  const re = new RegExp(r.pieces.join('|'), 'i');
  const t17 = D.filter((m) => m.kinds.includes('t17') && !m.kinds.includes('regular') && !ids.includes(m.id));
  assert.deepEqual(t17.filter((m) => m.lines.some((l) => re.test(l))).map((m) => m.id), []);
  // a regular mod whose line is inside a T17 mod still gets a piece
  assert.deepEqual(M.coverMods(['MapNemesisModOnRaresMapWorlds'], 'regular').missing, []);
});
