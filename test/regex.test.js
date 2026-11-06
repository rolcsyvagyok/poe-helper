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
    const hit = new RegExp(s, 'i').test(text);
    return neg ? !hit : hit;
  });
}
const mapText = (lines, { quantity = 60, pack = 20, rarity = 'Rare', corrupted = false } = {}) => [
  'Item Class: Maps', `Rarity: ${rarity}`, 'Grim Haven', 'Strand Map', '--------', 'Map Tier: 16',
  `Item Quantity: +${quantity}% (augmented)`, 'Item Rarity: +40% (augmented)', `Monster Pack Size: +${pack}% (augmented)`, '--------', 'Item Level: 83', '--------',
  ...lines.map((l) => l.replace(/#/g, '23')), '--------', 'Travel to this Map by using it in a personal Map Device. Maps can only be used once.', ...(corrupted ? ['Corrupted'] : []),
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
  const r = R.buildMapRegex({ rarity: { normal: 'avoid', magic: 'avoid' }, corrupted: 'avoid', mapTypes: { blighted: 'avoid' }, custom: '!delirium' });
  assert.equal(gameSearch(r.regex, mapText([], { rarity: 'Rare' })), true);
  assert.equal(gameSearch(r.regex, mapText([], { rarity: 'Magic' })), false);
  assert.equal(gameSearch(r.regex, mapText([], { corrupted: true })), false);
  assert.equal(gameSearch(r.regex, mapText([]).replace('Strand Map', 'Blighted Strand Map')), false);
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
