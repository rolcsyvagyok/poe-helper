'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fixtures');
const { parse, serialize } = require('../src/core/filter/parser');
const { explain } = require('../src/core/filter/matcher');
const { parseItem } = require('../src/core/item-parser');
const T = require('../src/core/filter/tiers');

const card = (name) => `Item Class: Divination Cards\nRarity: Divination Card\n${name}\n--------\nStack Size: 1/8`;
const cur = (name) => `Item Class: Stackable Currency\nRarity: Currency\n${name}\n--------\nStack Size: 1/20`;

test('reads NeverSink tiers with bases and styles', () => {
  const types = T.extractTiers(parse(F.nsFilter));
  assert.deepEqual(types.map((t) => t.type), ['currency', 'divination', 'uniques']);
  const c = types[0];
  assert.deepEqual(c.tiers.map((t) => t.tier), ['t1', 't2', 't4', 't6']);
  assert.deepEqual(c.tiers[0].bases, ['Divine Orb', 'Mirror of Kalandra', 'Mirror Shard']);
  assert.equal(c.tiers[0].style.sound.id, 6);
  assert.deepEqual(c.tiers[0].style.icon, { size: 0, color: 'Red', shape: 'Star' });
  assert.equal(c.tiers[3].action, 'Hide');
  const restex = types[1].tiers.find((t) => t.tier === 'restex');
  assert.equal(restex.hasBaseList, false, 'catch-all tiers are not move targets');
  assert.equal(types[1].tiers[0].style.customSound, '1maybevaluable.mp3');
});

test('empty patch reproduces the filter byte for byte', () => {
  assert.equal(T.applyTierPatch(F.nsFilter, {}), F.nsFilter);
});

test('moving a base between tiers changes what the game does with it', () => {
  let p = T.withMove({}, 'currency', 'Chaos Orb', 't1');
  const out = T.applyTierPatch(F.nsFilter, p);
  const r = explain(parse(out), parseItem(cur('Chaos Orb')));
  assert.match(r.comment, /\$tier->t1/);
  // and it's gone from t4
  const t4 = T.extractTiers(parse(out))[0].tiers.find((t) => t.tier === 't4');
  assert.ok(!t4.bases.includes('Chaos Orb'));
  // Hide tier -> show tier
  p = T.withMove(p, 'currency', 'Portal Scroll', 't4');
  const r2 = explain(parse(T.applyTierPatch(F.nsFilter, p)), parseItem(cur('Portal Scroll')));
  assert.equal(r2.action, 'Show');
});

test('hiding a base inserts a scoped hide block before its old tier', () => {
  const p = T.withMove({}, 'divination', 'Rain of Chaos', T.HIDE);
  const out = T.applyTierPatch(F.nsFilter, p);
  assert.equal(explain(parse(out), parseItem(card('Rain of Chaos'))).action, 'Hide');
  assert.equal(explain(parse(out), parseItem(card('The Carrion Crow'))).action, 'Show', 'other cards in the tier unaffected');
  // the hide block keeps the tier's other conditions (Class), so it can't hide unrelated items
  assert.match(out, /Hide # \$type->divination \$tier->poehelper-hidden.*\n\tClass == "Divination Cards"\n\tBaseType == "Rain of Chaos"/);
  // and shows up as a tier in the view
  const v = T.tierView(F.nsFilter, p);
  const hidden = v.types[1].tiers.find((t) => t.tier === T.HIDDEN_TIER);
  assert.deepEqual(hidden.bases, ['Rain of Chaos']);
  assert.equal(v.moved['divination\tRain of Chaos'], 't5');
});

test('moving the last base out of a tier never leaves an empty BaseType line', () => {
  let p = T.withMove({}, 'currency', 'Exalted Orb', 't1');
  p = T.withMove(p, 'currency', 'Orb of Annulment', 't1');
  const out = T.applyTierPatch(F.nsFilter, p);
  assert.doesNotMatch(out, /BaseType ==\s*$/m);
  assert.equal(explain(parse(out), parseItem(cur('Exalted Orb'))).comment.includes('t1'), true);
});

test('restyling a tier replaces only style lines, keeps conditions and Continue', () => {
  const style = { fontSize: 42, text: [10, 20, 30, 255], background: [200, 0, 200, 255], customSound: 'poehelper-sounds/chime.mp3', beam: { color: 'Purple' }, icon: { size: 1, color: 'Purple', shape: 'Moon' } };
  const p = T.withStyle({}, 'currency|t2', style);
  const out = T.applyTierPatch(F.nsFilter, p);
  const t2 = T.extractTiers(parse(out))[0].tiers.find((t) => t.tier === 't2');
  assert.deepEqual(t2.style.text, [10, 20, 30, 255]);
  assert.equal(t2.style.customSound, 'poehelper-sounds/chime.mp3');
  assert.equal(t2.style.sound, undefined, 'old PlayAlertSound removed');
  assert.equal(t2.style.border, undefined, 'border removed when not set');
  assert.deepEqual(t2.bases, ['Exalted Orb', 'Orb of Annulment']);
  assert.equal(serialize(parse(out)), out);
  // other tiers untouched
  assert.equal(T.extractTiers(parse(out))[0].tiers[0].style.sound.id, 6);
});

test('themes carry styles between filters by type|tier', () => {
  const v = T.tierView(F.nsFilter, T.withStyle({}, 'uniques|t1', { fontSize: 40, text: [1, 2, 3, 255] }));
  const theme = T.themeFromView(v);
  assert.deepEqual(theme['uniques|t1'].text, [1, 2, 3, 255]);
  assert.ok(theme['currency|t1']);
  assert.deepEqual(T.locateBase(v.types, 'Vaal Regalia'), { type: 'uniques', tier: 't1', key: 'uniques|t1' });
});

// ---- lessons from a real FilterBlade "Uber Plus Strict" online filter ----
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listFilters, helperPathFor, FilterManager } = require('../src/core/filter/manager');
const { JsonStore } = require('../src/core/cache');

const ONLINE_HEAD = '#Online Item Filter\n#name:3.29 Leg Start\n#version:3.29.3\n#realm:pc\n';
const realish = ONLINE_HEAD + [
  '#===================',
  'Show # %D8 $type->gear->memorystrand $tier->strandedveiled',
  '\tMemoryStrands >= 60',
  '\tHasExplicitMod "Veiled"',
  '\tSetFontSize 40',
  '',
  'Show # %D3 $type->currency $tier->t1exalted',
  '\tClass == "Stackable Currency"',
  '\tBaseType == "Divine Orb" "Mirror of Kalandra"',
  '\tSetFontSize 45',
  '',
  'Show # $type->divination $tier->excustomstack',
  '\tStackSize >= 3',
  '\tClass == "Divination Cards"',
  '\tBaseType == "The Fortunate"',
  '',
  'Show # $type->uniques $tier->foulborn',
  '\tFoulborn True',
  '\tRarity Unique',
  '',
  'Show # $type->uniques $tier->3xabyss',
  '\tSockets >= AAA',
  '\tRarity Unique',
  '\tBaseType == "Carnal Armour"',
  '',
  'Show # $type->uniques $tier->t1',
  '\tRarity Unique',
  '\tBaseType == "Glorious Plate"',
  '',
].join('\r\n') + '\r\n';

test('mixed LF/CRLF online filters round-trip exactly, edits keep each line ending', () => {
  assert.equal(serialize(parse(realish)), realish);
  assert.equal(T.applyTierPatch(realish, {}), realish);
  const out = T.applyTierPatch(realish, T.withMove({}, 'currency', 'Divine Orb', T.HIDE));
  const lines = out.split('\n');
  assert.equal(lines.slice(0, 4).every((l) => !l.endsWith('\r')), true, 'header stays LF');
  assert.equal(lines.slice(4, -1).every((l) => l.endsWith('\r')), true, 'body stays CRLF, including inserted lines');
});

test('rare properties the clipboard lacks are assumed absent, not present', () => {
  const doc = parse(realish);
  const divine = explain(doc, parseItem(cur('Divine Orb')));
  assert.match(divine.comment, /t1exalted/, 'memory strand block must not catch currency');
  const kaom = explain(doc, parseItem(F.unique));
  assert.match(kaom.comment, /\$tier->t1/, 'Foulborn/abyss blocks must not catch a normal unique');
  const fortunate3 = explain(doc, parseItem(card('The Fortunate').replace('1/8', '3/8')));
  assert.match(fortunate3.comment, /excustomstack/);
});

test('exception tiers are flagged special so bases never move into them', () => {
  const types = T.extractTiers(parse(realish));
  const div = types.find((t) => t.type === 'divination');
  assert.equal(div.tiers[0].special, true);
  const u = types.find((t) => t.type === 'uniques');
  assert.equal(u.tiers.find((t) => t.tier === 't1').special, false);
  assert.equal(u.tiers.find((t) => t.tier === '3xabyss').special, true);
});

test('finds FilterBlade-synced online filters and writes the copy next to local filters', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-online-'));
  fs.mkdirSync(path.join(dir, 'OnlineFilters'));
  fs.writeFileSync(path.join(dir, 'OnlineFilters', 'go8d2vcE'), realish);
  fs.writeFileSync(path.join(dir, 'Local.filter'), F.nsFilter);
  const files = listFilters(dir);
  const online = files.find((f) => f.online);
  assert.equal(online.display, '3.29 Leg Start (synced from FilterBlade)');
  assert.equal(online.name, 'OnlineFilters/go8d2vcE');
  assert.equal(helperPathFor(online.path), path.join(dir, '3.29 Leg Start (helper).filter'));
  const store = new JsonStore(path.join(dir, 's.json'), {});
  store.patch({ filterDir: dir, baseFilter: online.name, tierPatch: T.withMove({}, 'currency', 'Mirror of Kalandra', T.HIDE) });
  const target = new FilterManager({ store }).write();
  const out = fs.readFileSync(target, 'utf8');
  assert.doesNotMatch(out, /^#Online Item Filter/m, 'online metadata stripped from the local copy');
  assert.match(out, /\$tier->poehelper-hidden/);
  assert.equal(fs.readFileSync(path.join(dir, 'OnlineFilters', 'go8d2vcE'), 'utf8'), realish, 'online file untouched');
});

const TP = require('../src/core/filter/tier-prices');
test('tier prices: flags items whose current price belongs to another tier', () => {
  const view = { type: 'fragments->scarabs', tiers: [
    { key: 's|t1', tier: 't1', action: 'Show', hasBaseList: true, special: false, generated: false, bases: ['A', 'B', 'Crashed'] },
    { key: 's|t3stackedex', tier: 't3stackedex', action: 'Show', hasBaseList: true, special: true, generated: false, bases: ['A', 'Cheap1'] },
    { key: 's|t4', tier: 't4', action: 'Show', hasBaseList: true, special: false, generated: false, bases: ['M1', 'M2'] },
    { key: 's|t5', tier: 't5', action: 'Hide', hasBaseList: true, special: false, generated: false, bases: ['Cheap1', 'Cheap2', 'Spiked'] },
  ] };
  const lines = [['A', 60], ['B', 40], ['Crashed', 0.5], ['M1', 5], ['M2', 7], ['Cheap1', 0.3], ['Cheap2', 0.5], ['Spiked', 45]].map(([name, chaos]) => ({ name, chaos, listingCount: 50 }));
  const idx = TP.priceIndex('fragments->scarabs', { Scarab: lines });
  const r = TP.analyse(view, idx);
  assert.equal(r.tiers['s|t1'].median, 40);
  assert.equal(r.tiers['s|t3stackedex'].median, null, 'special tiers are not used as yardsticks');
  const byBase = Object.fromEntries(r.suggestions.map((x) => [x.base, x]));
  assert.equal(byBase.Spiked.to, 't1');
  assert.equal(byBase.Spiked.direction, 'up');
  assert.equal(byBase.Crashed.to, 't5');
  assert.equal(byBase.A, undefined, 'items priced like their tier are left alone');
  assert.deepEqual(TP.categoriesForType('fragments->scarabs'), ['Scarab', 'AllflameEmber']);
  assert.deepEqual(TP.categoriesForType('decorators->rareeg'), []);
});

test('tier prices: uniques are priced by base, cheapest unique decides', () => {
  const idx = TP.priceIndex('uniques', { UniqueArmour: [{ name: 'X', baseType: 'Simple Robe', chaos: 300 }, { name: 'Y', baseType: 'Simple Robe', chaos: 1 }, { name: 'Z', baseType: 'Simple Robe', chaos: 900, links: 6 }] });
  assert.deepEqual([idx.get('simple robe').chaos, idx.get('simple robe').max], [1, 300]);
});

test('auto-tier plan: suggested floors, user floors, hysteresis, few listings, never into special/new tiers', () => {
  const view = { type: 'fragments->scarabs', tiers: [
    { key: 's|t1', tier: 't1', action: 'Show', hasBaseList: true, special: false, generated: false, bases: ['A', 'B', 'Crashed', 'Edge'] },
    { key: 's|tnew', tier: 'tnew', action: 'Hide', hasBaseList: true, special: false, generated: false, bases: ['NewThing'] },
    { key: 's|t3stackedex', tier: 't3stackedex', action: 'Show', hasBaseList: true, special: true, generated: false, bases: ['A'] },
    { key: 's|t4', tier: 't4', action: 'Show', hasBaseList: true, special: false, generated: false, bases: ['M1', 'M2'] },
    { key: 's|t5', tier: 't5', action: 'Hide', hasBaseList: true, special: false, generated: false, bases: ['Cheap1', 'Cheap2', 'Cheap3', 'Cheap4', 'Spiked', 'Thin'] },
  ] };
  const L = (name, chaos, listingCount = 50) => ({ name, chaos, listingCount });
  const lines = [L('A', 60), L('B', 40), L('Crashed', 0.5), L('Edge', 2.5), L('NewThing', 90), L('M1', 5), L('M2', 7), L('Cheap1', 0.3), L('Cheap2', 0.5), L('Cheap3', 0.4), L('Cheap4', 0.6), L('Spiked', 45), L('Thin', 80, 2), L('Unlisted', 30)];
  const idx = TP.priceIndex('fragments->scarabs', { Scarab: lines });
  const plan = TP.autoTierPlan(view, idx, {});
  assert.deepEqual(plan.tiers.map((t) => t.tier), ['t1', 't4', 't5'], 'special and "new" tiers are not targets');
  assert.equal(plan.tiers[0].min, Math.round(Math.sqrt(21.25 * 6) * 100) / 100, 'halfway between typical t1 (21.25c) and t4 (6c)');
  const m = Object.fromEntries(plan.moves.map((x) => [x.base, x.to]));
  assert.equal(m.Spiked, 't1');
  assert.equal(m.Crashed, 't5');
  assert.equal(m.NewThing, undefined, 'items in the "new" tier are left to the user');
  assert.equal(m.Thin, undefined, 'few listings: skipped');
  assert.equal(plan.skipped.fewListings, 1);
  assert.equal(m.Edge, 't4', '2.5c is far below the t1 floor, and inside t4');
  // user floors override suggestions
  const strict = TP.autoTierPlan(view, idx, { thresholds: { t1: 50 }, margin: 1 });
  const s2 = Object.fromEntries(strict.moves.map((x) => [x.base, x.to]));
  assert.equal(s2.B, 't4', 'B (40c) falls below a 50c floor');
  assert.equal(strict.tiers[0].custom, true);
  // optional: tier items the filter doesn't list yet
  const withNew = TP.autoTierPlan(view, idx, { includeNew: true });
  assert.equal(withNew.moves.find((x) => x.base === 'Unlisted').to, 't1');
});

test('auto-tier skips hidden-to-hidden moves and single-item tiers', () => {
  const view = { type: 'currency', tiers: [
    { key: 'c|t1', tier: 't1', action: 'Show', hasBaseList: true, special: false, generated: false, bases: ['Div', 'Mir'] },
    { key: 'c|t4', tier: 't4', action: 'Show', hasBaseList: true, special: false, generated: false, bases: ['Chaos', 'Alch'] },
    { key: 'c|t6', tier: 't6', action: 'Hide', hasBaseList: true, special: false, generated: false, bases: ['Bauble', 'Chrome', 'Blessed'] },
    { key: 'c|t8', tier: 't8', action: 'Hide', hasBaseList: true, special: false, generated: false, bases: ['Trans', 'Aug'] },
    { key: 'c|twisdom', tier: 'twisdom', action: 'Hide', hasBaseList: true, special: false, generated: false, bases: ['Wisdom'] },
  ] };
  const L = (name, chaos) => ({ name, chaos, listingCount: 100 });
  const idx = TP.priceIndex('currency', { Currency: [L('Div', 200), L('Mir', 9000), L('Chaos', 1), L('Alch', 0.8), L('Bauble', 0.1), L('Chrome', 0.12), L('Blessed', 0.001), L('Trans', 0.005), L('Aug', 0.004), L('Wisdom', 0.0001)] });
  const plan = TP.autoTierPlan(view, idx, {});
  assert.ok(!plan.tiers.some((t) => t.tier === 'twisdom'), 'single-item tier is not a price band');
  assert.equal(plan.moves.find((m) => m.base === 'Blessed'), undefined, 'hidden t6 -> hidden t8 is skipped');
  assert.equal(plan.moves.find((m) => m.base === 'Wisdom'), undefined);
});

const D = require('../src/core/filter/designer');
test('designer: tier levels, presets keep Tier 1 white with the tink, apply to every category', () => {
  assert.equal(D.tierLevel('t1exalted'), 1);
  assert.equal(D.tierLevel('t3boss'), 3);
  assert.equal(D.tierLevel('t4c'), 4);
  assert.equal(D.tierLevel('t12'), null);
  assert.equal(D.tierLevel('restex'), null);
  assert.equal(D.tierLevel('tnew'), null);
  for (const p of D.PRESETS) {
    const t1 = p.levels[1];
    assert.deepEqual(t1.background, [255, 255, 255, 255], `${p.name}: Tier 1 background is white`);
    assert.equal(t1.customSound, 'poehelper-sounds/divine-tink.mp3', `${p.name}: Tier 1 plays the tink`);
    assert.equal(t1.beam.color, 'White');
  }
  // the lock repairs a design that drifted
  const locked = D.lockTier1({ 1: { text: [10, 20, 30, 255], background: [0, 0, 0, 255], sound: { id: 3 } }, 2: { fontSize: 40 } });
  assert.deepEqual(locked[1].background, [255, 255, 255, 255]);
  assert.deepEqual(locked[1].text, [10, 20, 30, 255], 'text colour kept');
  assert.equal(locked[1].customSound, D.TINK);
  assert.equal(locked[2].fontSize, 40);

  const view = T.tierView(F.nsFilter, {});
  const { patch, count } = D.applyDesign(view, {}, D.PRESETS[1].levels);
  // currency t1,t2,t4,t6 + divination t1,t5 + uniques t1,t3 = 8 levelled tiers (restex skipped)
  assert.equal(count, 8);
  const out = T.applyTierPatch(F.nsFilter, patch);
  const cur = T.extractTiers(parse(out))[0].tiers;
  assert.deepEqual(cur[0].style.background, [255, 255, 255, 255]);
  assert.equal(cur[0].style.customSound, D.TINK);
  assert.deepEqual(cur[1].style.background, [112, 52, 180, 255]);
  // scoped to one category
  const only = D.applyDesign(view, {}, D.PRESETS[0].levels, { groups: ['divination'] });
  assert.equal(only.count, 2);
});

test('hide or show a whole tier; switches survive other edits; typed items move into a tier', () => {
  const card = (n) => `Item Class: Divination Cards\nRarity: Divination Card\n${n}\n--------\nStack Size: 1/8`;
  const cur = (n) => `Item Class: Stackable Currency\nRarity: Currency\n${n}\n--------\nStack Size: 1/20`;
  // hide the divination Tier 1: no sound/beam/icon left, items hidden
  let p = T.withAction({}, 'divination|t1', 'Hide');
  let out = T.applyTierPatch(F.nsFilter, p);
  const apo = explain(parse(out), parseItem(card('The Apothecary')));
  assert.equal(apo.action, 'Hide');
  const block = out.split('\n\n').find((b) => b.includes('$type->divination $tier->t1'));
  assert.match(block, /^Hide /);
  assert.doesNotMatch(block, /CustomAlertSound|PlayEffect|MinimapIcon/);
  assert.match(block, /DisableDropSound/);
  // show a tier the filter hides
  p = T.withAction(p, 'currency|t6', 'Show');
  out = T.applyTierPatch(F.nsFilter, p);
  assert.equal(explain(parse(out), parseItem(cur('Portal Scroll'))).action, 'Show');
  // other edits keep the switches
  p = T.withStyle(p, 'currency|t2', { fontSize: 40, text: [1, 1, 1, 255] });
  p = T.withMove(p, 'currency', 'Chaos Orb', 't1');
  assert.deepEqual(p.actions, { 'divination|t1': 'Hide', 'currency|t6': 'Show' });
  const { patch: designed } = D.applyDesign(T.tierView(F.nsFilter, p), p, D.PRESETS[0].levels);
  assert.deepEqual(designed.actions, p.actions, 'applying a design keeps tier switches');
  // switching back removes the change
  assert.deepEqual(T.withAction(p, 'currency|t6', null).actions, { 'divination|t1': 'Hide' });
  // typed item the filter doesn't list yet goes into the tier
  out = T.applyTierPatch(F.nsFilter, T.withMove({}, 'currency', 'Vivid Crystallised Lifeforce', 't4'));
  assert.match(explain(parse(out), parseItem(cur('Vivid Crystallised Lifeforce'))).comment, /\$tier->t4/);
  // typed item that's in another tier leaves it
  out = T.applyTierPatch(F.nsFilter, T.withMove({}, 'currency', 'Exalted Orb', 't4'));
  const t2 = T.extractTiers(parse(out))[0].tiers.find((t) => t.tier === 't2');
  assert.ok(!t2.bases.includes('Exalted Orb'));
  assert.equal(serialize(parse(out)), out);
});

test('price colours: good / a bit off / wrong tier / no price', () => {
  const view = { type: 's', tiers: [
    { key: 's|t1', tier: 't1', action: 'Show', hasBaseList: true, special: false, generated: false, bases: ['A', 'B', 'C', 'D', 'Crashed'] },
    { key: 's|t5', tier: 't5', action: 'Hide', hasBaseList: true, special: false, generated: false, bases: ['X', 'Y', 'Spiked', 'Unknown'] },
    { key: 's|t3stackedex', tier: 't3stackedex', action: 'Show', hasBaseList: true, special: true, generated: false, bases: ['A'] },
  ] };
  const L = (name, chaos) => ({ name, chaos, listingCount: 50 });
  const idx = TP.priceIndex('s', { Scarab: [L('A', 50), L('B', 40), L('C', 100), L('D', 45), L('Crashed', 1), L('X', 0.3), L('Y', 0.4), L('Spiked', 60)] });
  const r = TP.analyse(view, idx);
  const f = (tier, b) => r.fit[`${tier}\t${b}`].level;
  assert.equal(f('t1', 'A'), 'good');
  assert.equal(f('t1', 'C'), 'warn', '100c in a ~50c tier is a bit off');
  assert.equal(f('t1', 'Crashed'), 'bad');
  assert.equal(f('t5', 'Spiked'), 'bad');
  assert.equal(r.fit['t5\tSpiked'].dir, 'up');
  assert.equal(f('t5', 'Unknown'), 'none', 'no price');
  assert.equal(f('t3stackedex', 'A'), 'none', 'special tiers are not price bands');
  assert.equal(r.counts.bad, 2);
});

test('filter never gets a BaseType the game would reject', () => {
  const { nameChecker, cleanRule } = require('../src/core/filter/manager');
  const base = 'Show # $type->currency $tier->t1\n\tBaseType == "Gemcutter\'s Prism" "Divine Orb"\n\n#Show # $type->currency $tier->t9\n#\tBaseType == "Gemcutter\'s Mercy"\n';
  const c = nameChecker(base, ['Mirror of Kalandra']);
  const r = cleanRule({ action: 'Show', conditions: [{ keyword: 'BaseType', op: '==', values: ['Gemcutters Mercy', 'Fake Orb', 'Mirror of Kalandra'] }] }, c.fix);
  assert.deepEqual(r.conditions[0].values, ["Gemcutter's Mercy", 'Mirror of Kalandra']);
  assert.deepEqual([...c.dropped], ['Fake Orb']);
  assert.equal(cleanRule({ action: 'Show', conditions: [{ keyword: 'BaseType', values: ['Mageblood'] }] }, c.fix), null);
});

test('switched-off FilterBlade tiers round-trip and can be switched on', () => {
  const { parse, serialize } = require('../src/core/filter/parser');
  const T = require('../src/core/filter/tiers');
  const text = 'Show # $type->flasks $tier->t1\n\tBaseType == "Gold Flask"\n\n#Show # # $type->flasks $tier->t2\n#\tItemLevel >= 85\n#\tBaseType == "Quicksilver Flask"\n#\tSetFontSize 45\n\nHide # $type->hidelayer $tier->all\n\tClass == "Utility Flasks"\n';
  assert.equal(serialize(parse(text)), text);
  const v = T.tierView(text, {});
  const t2 = v.types.find((t) => t.type === 'flasks').tiers.find((t) => t.tier === 't2');
  assert.equal(t2.state, 'Off');
  const on = T.applyTierPatch(text, { actions: { 'flasks|t2': 'Show' } });
  assert.match(on, /^Show # # \$type->flasks \$tier->t2\n\tItemLevel >= 85\n/m);
  const off = T.applyTierPatch(text, { actions: { 'flasks|t1': 'Off' } });
  assert.match(off, /^#Show # \$type->flasks \$tier->t1\n#\tBaseType == "Gold Flask"/m);
});

test('auto-tier table: excluded tiers stay put, "anything less valuable" can be hidden', () => {
  const { autoTierPlan } = require('../src/core/filter/tier-prices');
  const view = { type: 'x', tiers: [
    { tier: 't1', key: 'x|t1', action: 'Show', hasBaseList: true, bases: ['A', 'B'], conditions: [] },
    { tier: 't2', key: 'x|t2', action: 'Show', hasBaseList: true, bases: ['C', 'D'], conditions: [] },
    { tier: 't3', key: 'x|t3', action: 'Show', hasBaseList: true, bases: ['E', 'F'], conditions: [] },
  ] };
  const idx = new Map(Object.entries({ a: 100, b: 90, c: 10, d: 0.5, e: 1, f: 1 }).map(([k, v]) => [k, { chaos: v, name: k.toUpperCase() }]));
  const base = autoTierPlan(view, idx, { thresholds: { t1: 50, t2: 5, t3: 0 }, margin: 1 });
  assert.ok(base.moves.some((m) => m.base === 'D' && m.to === 't3'));
  const excl = autoTierPlan(view, idx, { thresholds: { t1: 50, t3: 0 }, include: { t2: false }, margin: 1 });
  assert.ok(!excl.moves.some((m) => m.base === 'D'), 'items in an excluded tier stay');
  assert.ok(!excl.moves.some((m) => m.to === 't2'), 'excluded tier is never filled');
  assert.equal(excl.tiers.find((t) => t.tier === 't2').included, false);
  const hide = autoTierPlan(view, idx, { thresholds: { t1: 50, t2: 5, t3: 2 }, rest: 'hide', margin: 1 });
  assert.deepEqual(hide.moves.filter((m) => m.to === '__hide__').map((m) => m.base).sort(), ['D', 'E', 'F']);
});

test('a tier emptied by moves never writes its placeholder for the game to choke on', () => {
  const T = require('../src/core/filter/tiers');
  const text = 'Show # $type->fragments->stacked $tier->t3\n\tStackSize >= 3\n\tBaseType == "Divine Vessel"\n\tSetFontSize 40\n\nShow # $type->fragments->stacked $tier->t4\n\tBaseType == "Sacrifice at Dawn"\n\tSetFontSize 30\n';
  const cases = [
    { moves: { 'fragments->stacked\tDivine Vessel': 't4' } },
    { moves: { 'fragments->stacked\tDivine Vessel': 't4' }, actions: { 'fragments->stacked|t3': 'Show' } },
    { moves: { 'fragments->stacked\tDivine Vessel': '__hide__' }, actions: { 'fragments->stacked|t3': 'Hide' } },
  ];
  for (const patch of cases) {
    const out = T.applyTierPatch(text, patch);
    for (const line of out.split('\n')) if (!line.startsWith('#')) assert.ok(!line.includes('PoE Helper: moved'), line);
    const t3 = T.tierView(text, patch).types[0].tiers.find((t) => t.tier === 't3');
    assert.notEqual(t3.state, 'Off', 'emptied tier is not shown as switched off');
  }
});

test('your own tier: copies a look, sits above it, takes items, and can be deleted', () => {
  const T = require('../src/core/filter/tiers');
  const text = 'Show # $type->currency $tier->t1exalted\n\tClass == "Stackable Currency"\n\tBaseType == "Divine Orb" "Mirror of Kalandra"\n\tSetFontSize 45\n\nShow # $type->currency $tier->t2divine\n\tBaseType == "Chaos Orb"\n\tSetFontSize 40\n';
  let [p, tier] = T.withNewTier({}, { type: 'currency', name: 'Giga', copyFrom: 't1exalted' });
  assert.equal(tier, 'poehelper-giga');
  const empty = T.applyTierPatch(text, p);
  for (const l of empty.split('\n')) if (!l.startsWith('#')) assert.ok(!l.includes('PoE Helper: moved'));
  p = T.withMove(p, 'currency', 'Mirror of Kalandra', tier);
  const out = T.applyTierPatch(text, p);
  assert.ok(out.indexOf('$tier->poehelper-giga') < out.indexOf('$tier->t1exalted'), 'placed above Tier 1');
  assert.match(out, /poehelper-giga[^\n]*\n\tClass == "Stackable Currency"\n\tBaseType == "Mirror of Kalandra"\n\tSetFontSize 45/);
  const v = T.tierView(text, p).types[0].tiers;
  assert.equal(v[0].customName, 'Giga');
  assert.deepEqual(v[1].bases, ['Divine Orb']);
  const back = T.withoutNewTier(p, 'currency', tier);
  assert.equal(back.newTiers.length, 0);
  assert.equal(Object.keys(back.moves).length, 0);
});

test('My bases: one rule per base with item level range and rarities, never uniques', () => {
  const { myBaseRule } = require('../src/core/filter/manager');
  const r = myBaseRule({ id: 'b1', base: 'Goliath Greaves', ilvlMin: 82, ilvlMax: null, rarities: ['Rare', 'Normal'] });
  assert.equal(r.action, 'Show');
  assert.equal(r.label, 'My bases: Goliath Greaves ilvl 82+');
  assert.deepEqual(r.conditions[0], { keyword: 'Rarity', values: ['Normal', 'Rare'] });
  assert.deepEqual(r.conditions[1], { keyword: 'ItemLevel', op: '>=', values: ['82'] });
  assert.deepEqual(r.conditions.at(-1), { keyword: 'BaseType', op: '==', values: ['Goliath Greaves'] });
});

test('poe.ninja sparkline becomes a 7-day price history; doubling or halving is a big change', () => {
  const { trendOf, isBigChange } = require('../src/core/ninja');
  const t = trendOf({ totalChange: 100, data: [10, 20, 40, 60, 80, 90, 100] }, 20, 8 * 86400000);
  assert.equal(t.change, 100);
  assert.equal(t.old, 10);
  assert.equal(t.points.length, 8);
  assert.equal(t.points[0].chaos, 10);
  assert.equal(t.points.at(-1).chaos, 20);
  assert.equal(t.points.at(-1).ts, 8 * 86400000);
  assert.ok(isBigChange(t));
  assert.ok(!isBigChange(trendOf({ totalChange: 40, data: [40] }, 20)));
  assert.ok(isBigChange(trendOf({ totalChange: -60, data: [-60] }, 20)));
  assert.ok(!isBigChange(trendOf({ totalChange: 300, data: [300] }, 0.2)), 'cheap items are noise');
  const gaps = trendOf({ totalChange: -4.76, data: [0, -32.54, -32.54, -4.76, null, null, null] }, 93, 10 * 86400000);
  assert.equal(gaps.points.at(-1).ts, 10 * 86400000, 'the last value present is today');
  assert.equal(trendOf(null, 5), null);
});

test('hidden bases get Hide blocks for their fractured and synthesised copies when switched on', () => {
  const { hiddenBaseRules } = require('../src/core/filter/manager');
  const { HIDDEN_TIER } = require('../src/core/filter/tiers');
  const patch = { moves: { [`rings\tIron Ring`]: HIDDEN_TIER, [`rings\tGold Ring`]: 't1' } };
  assert.deepEqual(hiddenBaseRules('', patch), []);
  const rules = hiddenBaseRules('', patch, { fractured: true, synthesised: true });
  assert.equal(rules.length, 2);
  assert.equal(rules[0].action, 'Hide');
  const kw = (r, k) => r.conditions.find((c) => c.keyword === k);
  assert.deepEqual(kw(rules[0], 'FracturedItem').values, ['True']);
  assert.deepEqual(kw(rules[1], 'SynthesisedItem').values, ['True']);
  assert.deepEqual(kw(rules[0], 'BaseType').values, ['Iron Ring']);
  assert.ok(!kw(rules[0], 'Rarity').values.includes('Unique'));
});
