'use strict';
// Path of Exile 2 loot filter: its own folder, strictness data, a lean build, and its own setup apart from PoE1's.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const strictness = require('../src/core/filter/strictness');
const { FilterManager, candidateFilterDirs } = require('../src/core/filter/manager');
const { listsForType2, createNinja2 } = require('../src/core/poe2/ninja2');
const { createServices } = require('../src/main/services');

// a tiny NeverSink-style PoE2 filter (made up here, not anyone's real filter)
const P2 = [
  '# NeverSink\'s Indepth Loot Filter - for Path of Exile 2',
  '# VERSION:  0.10.4',
  '# TYPE:     1-REGULAR',
  '',
  'Show # $type->currency $tier->a',
  '  Class == "Stackable Currency"',
  '  BaseType == "Divine Orb" "Perfect Exalted Orb"',
  '  SetFontSize 45',
  '',
  'Show # $type->currency $tier->c',
  '  Class == "Stackable Currency"',
  '  BaseType == "Orb of Augmentation" "Regal Orb"',
  '  SetFontSize 40',
  '',
  'Show # $type->gold $tier->any',
  '  BaseType == "Gold"',
  '',
].join('\n');

test('PoE2 filters are told apart by their header, and use their own strictness tiers', () => {
  assert.equal(strictness.isPoe2Filter(P2), true);
  assert.equal(strictness.isPoe2Filter('# NeverSink\'s Indepth Loot Filter\n# TYPE: 1-REGULAR'), false);
  // gold is hidden from Very Strict on in NeverSink's PoE2 filter; PoE1 has no gold tier like that
  const a = strictness.strictnessActions(P2, 4);
  assert.equal(a['gold|any'], 'Hide');
  assert.ok(!('gold|any' in strictness.strictnessActions(P2.replace('for Path of Exile 2', ''), 4)));
});

test('the PoE2 filter folder is My Games/Path of Exile 2', () => {
  assert.ok(candidateFilterDirs('poe2').every((d) => /Path of Exile 2$/.test(d)));
  assert.ok(candidateFilterDirs('poe1').every((d) => /Path of Exile$/.test(d)));
});

test('a PoE2 filter is written with your moves and strictness, and none of the PoE1 rules', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-p2f-'));
  fs.writeFileSync(path.join(dir, 'NeverSink PoE2.filter'), P2);
  const st = { game: 'poe2', filterDir: dir, baseFilter: 'NeverSink PoE2.filter', tierPatch: { moves: { 'currency\tRegal Orb': 'a' } }, strictness: { 'NeverSink PoE2': 4 }, baseRanks: { 'Vaal Regalia': 'S' }, campaignHide: { Wands: true } };
  const m = new FilterManager({ store: { get: (k) => st[k], set: (k, v) => { st[k] = v; } } });
  const out = fs.readFileSync(m.write(), 'utf8');
  assert.match(out, /BaseType == "Divine Orb" "Perfect Exalted Orb" "Regal Orb"/);
  assert.match(out, /Hide # \$type->gold \$tier->any/);
  assert.doesNotMatch(out, /Vaal Regalia|Wand/);
});

test('poe.ninja lists that price PoE2 filter categories', () => {
  assert.deepEqual(listsForType2('currency->omen'), ['Ritual']);
  assert.deepEqual(listsForType2('currency'), ['Currency']);
  assert.ok(listsForType2('uniques').includes('UniqueArmours'));
  assert.deepEqual(listsForType2('uniques->special'), []);
  assert.deepEqual(listsForType2('waystones'), []);
});

test('PoE2 poe.ninja rows are in exalted', async () => {
  const fetchImpl = async (url) => ({ ok: true, json: async () => (/type=Currency/.test(url)
    ? { core: { primary: 'divine', rates: { exalted: 400 }, items: [{ id: 'divine', name: 'Divine Orb' }, { id: 'regal', name: 'Regal Orb' }] }, lines: [{ id: 'regal', primaryValue: 0.001, volumePrimaryValue: 50 }] }
    : { lines: [{ name: 'Headhunter', baseType: 'Heavy Belt', exaltedValue: 9000, listingCount: 3 }] }) });
  const n = createNinja2({ fetchImpl });
  const cur = await n.rows('L', 'Currency');
  assert.deepEqual(cur, [{ name: 'Regal Orb', baseType: null, chaos: 0.4, listingCount: 50 }]);
  const un = await n.rows('L', 'UniqueAccessories');
  assert.equal(un[0].chaos, 9000);
  assert.equal(un[0].baseType, 'Heavy Belt');
});

test('switching the game parks one game\'s filter setup and brings back the other\'s', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-p2s-'));
  const svc = createServices({ dataDir: path.join(dir, 'data'), secrets: { encrypt: (x) => x, decrypt: (x) => x }, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), log: () => {} });
  svc.settings.set('filterDir', path.join(dir, 'poe1'));
  svc.settings.set('baseFilter', 'Mine.filter');
  svc.settings.set('tierPatch', { moves: { 'currency\tChaos Orb': '__hide__' } });
  svc.settings.set('designer', { look: 1 });
  svc.switchGameFilter('poe1', 'poe2'); svc.settings.set('game', 'poe2');
  // PoE2 starts clean: its own folder (found by itself), no filter, no PoE1 moves, bases or Giga tiers
  assert.equal(svc.settings.get('filterDir'), '');
  assert.equal(svc.settings.get('baseFilter'), '');
  assert.deepEqual(svc.settings.get('tierPatch'), { moves: {}, styles: {}, actions: {} });
  assert.deepEqual(svc.settings.get('baseRanks'), {});
  assert.equal(svc.settings.get('gigaDone'), true);
  svc.settings.set('baseFilter', 'PoE2.filter');
  svc.switchGameFilter('poe2', 'poe1'); svc.settings.set('game', 'poe1');
  assert.equal(svc.settings.get('baseFilter'), 'Mine.filter');
  assert.equal(svc.settings.get('filterDir'), path.join(dir, 'poe1'));
  assert.deepEqual(svc.settings.get('tierPatch'), { moves: { 'currency\tChaos Orb': '__hide__' } });
  assert.deepEqual(svc.settings.get('designer'), { look: 1 });
  svc.switchGameFilter('poe1', 'poe2');
  assert.equal(svc.settings.get('baseFilter'), 'PoE2.filter');
});

test('the Tier designer restyles PoE2 tiers S to E as Tier 1 to 6', () => {
  const designer = require('../src/core/filter/designer');
  const { tierView } = require('../src/core/filter/tiers');
  assert.equal(designer.tierLevel('s'), 1);
  assert.equal(designer.tierLevel('e'), 6);
  assert.equal(designer.tierLevel('exhide'), null);
  assert.equal(designer.tierLevel('t3'), 3);
  const view = tierView(P2);
  const targets = designer.targetsFor(view);
  assert.deepEqual(targets.map((t) => [t.tier, t.level]), [['a', 2], ['c', 4]]);
  const levels = designer.lockTier1(designer.fullLevels(designer.PRESETS[0].levels));
  const r = designer.applyDesign(view, {}, levels);
  assert.ok(r.patch.styles['currency|a'] && r.patch.styles['currency|c']);
});

test('PoE2 item pictures come from PoE2\'s own poe.ninja lists', async () => {
  const asked = [];
  const fetchImpl = async (url) => { asked.push(url); return { ok: true, json: async () => (/type=Currency/.test(url)
    ? { core: { items: [{ id: 'divine', name: 'Divine Orb', image: '/gen/image/poe2-divine.png' }] }, lines: [] }
    : { lines: [{ name: 'Headhunter', icon: 'https://web.poecdn.com/gen/image/hh2.png' }] }) }; };
  const n = createNinja2({ fetchImpl });
  assert.deepEqual(await n.art('L', ['Divine Orb']), { 'Divine Orb': 'https://web.poecdn.com/gen/image/poe2-divine.png' });
  assert.ok(asked.every((u) => u.includes('/poe2/')));
  const u = await n.art('L', ['Headhunter'], { uniques: true });
  assert.equal(u.Headhunter, 'https://web.poecdn.com/gen/image/hh2.png');
});
