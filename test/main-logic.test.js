'use strict';
// End-to-end tests of the wired services (everything except Electron itself).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('./fixtures');
const { createServices } = require('../src/main/services');

function fakeFetch(log) {
  return async (url, opts = {}) => {
    log.push(url);
    const ok = (body, headers = {}) => ({ status: 200, ok: true, headers: new Map(Object.entries({ etag: 'e1', ...headers })), json: async () => body });
    if (url.includes('/economy/leagues')) return ok([{ id: 'Allflame', name: 'Curse of the Allflame' }, { id: 'Standard', name: 'Standard' }]);
    if (url.includes('currency/overview')) return ok({ lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 180 }, { currencyTypeName: 'Exalted Orb', chaosEquivalent: 12 }] });
    if (url.includes('type=DivinationCard')) return ok({ core: { primary: 'chaos', items: [{ id: 'a', name: 'The Apothecary' }, { id: 'w', name: 'The Wolf' }] }, lines: [{ id: 'a', primaryValue: 9000 }, { id: 'w', primaryValue: 30 }] });
    if (url.includes('/exchange/')) return ok({ core: { primary: 'chaos', items: [] }, lines: [] });
    if (url.includes('type=UniqueArmour')) return ok({ lines: [{ name: "Kaom's Heart", baseType: 'Glorious Plate', chaosValue: 50, listingCount: 30 }] });
    if (url.includes('/item/overview')) return ok({ lines: [] });
    if (url.includes('get-stash-items')) {
      assert.equal(opts.headers.Cookie, 'POESESSID=0123456789abcdef0123456789abcdef');
      const rl = { 'x-rate-limit-rules': 'Account', 'x-rate-limit-account': '30:60:60', 'x-rate-limit-account-state': '1:60:0' };
      if (url.includes('tabs=1')) return ok({ tabs: [{ i: 0, n: 'Currency', id: 't0', type: 'CurrencyStash' }, { i: 1, n: 'Dump', id: 't1', type: 'PremiumStash' }], items: [{ frameType: 5, typeLine: 'Divine Orb', stackSize: 5 }] }, rl);
      return ok({ items: [{ frameType: 6, typeLine: 'The Apothecary', stackSize: 1 }] }, rl);
    }
    return { status: 404, ok: false, headers: new Map(), json: async () => ({}) };
  };
}

function setup(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-svc-'));
  const filterDir = path.join(dir, 'filters');
  fs.mkdirSync(filterDir);
  fs.writeFileSync(path.join(filterDir, 'NeverSink.filter'), F.filter);
  const log = [];
  const secrets = { encrypt: (s) => 'x:' + s, decrypt: (v) => (v ? v.slice(2) : null) };
  const svc = createServices({ dataDir: path.join(dir, 'data'), secrets, fetchImpl: fakeFetch(log), log: () => {} });
  // older tests check exact tier lists; the default Giga tier has its own test
  if (!opts.giga) { svc.settings.set('gigaDone', true); svc.settings.set('gigaRestoreV1', true); }
  if (!opts.belts) svc.settings.set('bigBeltsDone', true);
  return { svc, log, filterDir };
}

test('price check uses poe.ninja only and auto-detects league', async () => {
  const { svc, log } = setup();
  const r = await svc.priceText(F.divCard);
  assert.equal(r.price.league, 'Allflame');
  assert.equal(r.price.chaos, 9000);
  assert.ok(log.every((u) => u.includes('poe.ninja')), 'no GGG calls');
  assert.equal(svc.usageSnapshot().ggg.today.total, 0);
  assert.equal(svc.settings.get('history')[0].name, 'The Apothecary');
});

test('net worth snapshot: tab list + tab 0 reused, 1 extra request for tab 1', async () => {
  const { svc, log } = setup();
  svc.settings.patch({ accountName: 'Me#1234', sessionEnc: 'x:0123456789abcdef0123456789abcdef', selectedTabs: [0, 1] });
  const snap = await svc.networth.takeSnapshot();
  const stashCalls = log.filter((u) => u.includes('get-stash-items'));
  assert.equal(stashCalls.length, 2, 'tab list (incl. tab 0 items) + tab 1');
  assert.equal(snap.totalChaos, 5 * 180 + 9000);
  assert.equal(snap.byTab.Currency, 900);
  // Accidental double snapshot within 60s: everything is reused, zero new requests
  await svc.networth.takeSnapshot();
  assert.equal(log.filter((u) => u.includes('get-stash-items')).length, 2);
  const rep = svc.networth.report('Allflame');
  assert.equal(rep.series.length, 2);
  assert.equal(svc.usageSnapshot().ggg.today.byKey.stash, 2);
});

test('filter quick rule + economy tiers write a valid helper file next to the base', async () => {
  const { svc, filterDir } = setup();
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter', economy: { enabled: true, thresholds: { top: 100, high: 20, mid: 5 } } });
  await svc.regenerateEconomy();
  const { target } = svc.quickFilter('hide', F.normalBase);
  assert.equal(path.basename(target), 'NeverSink (helper).filter');
  const out = fs.readFileSync(target, 'utf8');
  assert.match(out, /Hide # Hide normal Vermillion Ring/);
  assert.match(out, /BaseType == "The Apothecary"/);
  assert.ok(out.endsWith(F.filter), 'base filter appended untouched');
  assert.equal(fs.readFileSync(path.join(filterDir, 'NeverSink.filter'), 'utf8'), F.filter, 'base file never modified');
  // The explainer now reads the helper file, so the override wins
  const r = await svc.priceText(F.normalBase);
  assert.equal(r.filterHit.action, 'Hide');
});

test('tink sounds are referenced with CustomAlertSound and copied next to the filter', async () => {
  const { svc, filterDir } = setup();
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter', economy: { enabled: true, thresholds: { top: 100, high: 20, mid: 5, sounds: { top: 'sparkle' } } } });
  await svc.regenerateEconomy();
  svc.filters.addOverride({ id: 'x', enabled: true, action: 'Show', label: 'Divines', conditions: [{ keyword: 'BaseType', op: '==', values: ['Divine Orb'] }], style: { customSound: 'poehelper-sounds/coin.mp3' } });
  const target = svc.filters.write();
  const out = fs.readFileSync(target, 'utf8');
  assert.match(out, /CustomAlertSound "poehelper-sounds\/coin\.mp3"/);
  assert.match(out, /CustomAlertSound "poehelper-sounds\/sparkle\.mp3"/, 'per-tier sound choice used');
  for (const f of ['coin.mp3', 'sparkle.mp3']) assert.ok(fs.statSync(path.join(filterDir, 'poehelper-sounds', f)).size > 1000, `${f} copied`);
});

test('FilterBlade flow: move, hide, restyle, theme round-trip; original file untouched', async () => {
  const { svc, filterDir } = setup();
  fs.writeFileSync(path.join(filterDir, 'FilterBlade.filter'), F.nsFilter);
  svc.settings.patch({ filterDir, baseFilter: 'FilterBlade.filter' });
  const v0 = svc.tierViewNow();
  assert.equal(v0.types.length, 3);

  svc.moveBases('currency', ['Chaos Orb'], 't2');
  svc.moveBases('divination', ['Rain of Chaos'], '__hide__');
  const { target } = svc.setTierStyle('currency|t2', { fontSize: 44, text: [255, 255, 255, 255], background: [120, 0, 200, 255], customSound: 'poehelper-sounds/sparkle.mp3' });
  const out = fs.readFileSync(target, 'utf8');
  assert.equal(path.basename(target), 'FilterBlade (helper).filter');
  assert.match(out, /BaseType == "Exalted Orb" "Orb of Annulment" "Chaos Orb"/);
  assert.match(out, /\$tier->poehelper-hidden/);
  assert.match(out, /CustomAlertSound "poehelper-sounds\/sparkle\.mp3"/);
  assert.ok(fs.existsSync(path.join(filterDir, 'poehelper-sounds', 'sparkle.mp3')));
  assert.equal(fs.readFileSync(path.join(filterDir, 'FilterBlade.filter'), 'utf8'), F.nsFilter, 'FilterBlade file untouched');

  // Moving back to the original tier removes the edit instead of stacking it
  svc.moveBases('currency', ['Chaos Orb'], 't4');
  assert.equal(svc.settings.get('tierPatch').moves['currency\tChaos Orb'], undefined);

  // Overlay info for an item
  const r = await svc.priceText(`Item Class: Stackable Currency\nRarity: Currency\nExalted Orb\n--------\nStack Size: 1/20`);
  assert.equal(r.tierInfo.type, 'currency');
  assert.equal(r.tierInfo.tier, 't2');
  assert.deepEqual(r.tierInfo.options.map((o) => o.tier), ['t1', 't2', 't4', 't6']);

  // Theme: save, export, wipe, import, apply
  const theme = svc.saveTheme('Purple currency', { onlyEdited: true });
  assert.deepEqual(Object.keys(theme.styles), ['currency|t2']);
  const json = svc.exportTheme(theme.id);
  svc.resetTiers({ key: 'currency|t2' });
  const imported = svc.importTheme(json);
  const res = svc.applyTheme(imported.id);
  assert.equal(res.applied, 1);
  assert.deepEqual(res.view.types[0].tiers.find((t) => t.tier === 't2').style.background, [120, 0, 200, 255]);
  assert.throws(() => svc.importTheme('{"styles":{}}'), /not a PoE Helper theme/);
});

test('overlay never offers a tier whose conditions the item fails (rare base listed only under uniques)', async () => {
  const { svc, filterDir } = setup();
  fs.writeFileSync(path.join(filterDir, 'FilterBlade.filter'), F.nsFilter);
  svc.settings.patch({ filterDir, baseFilter: 'FilterBlade.filter' });
  const rare = `Item Class: Body Armours\nRarity: Rare\nGrim Shell\nGlorious Plate\n--------\nItem Level: 86\n--------\nUnidentified`;
  const r = await svc.priceText(rare);
  assert.equal(r.tierInfo, null, 'Glorious Plate is only listed in "Rarity Unique" tiers');
  const uni = await svc.priceText(F.unique);
  assert.equal(uni.tierInfo.type, 'uniques');
});

test('Highlight on a random rare matches rares of that base only; Hide covers rare and below', async () => {
  const { svc, filterDir } = setup();
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter' });
  const rare = `Item Class: Two Hand Axes\nRarity: Rare\nCorpse Bite\nVaal Axe\n--------\nItem Level: 86\n--------\nUnidentified`;
  const normal = `Item Class: Two Hand Axes\nRarity: Normal\nVaal Axe\n--------\nItem Level: 86`;
  svc.quickFilter('highlight', rare);
  assert.equal((await svc.priceText(rare)).filterHit.comment, 'Highlight rare Vaal Axe');
  assert.notEqual((await svc.priceText(normal)).filterHit.comment, 'Highlight rare Vaal Axe', 'normal Vaal Axes are not highlighted');
  svc.filters.saveOverrides([]);
  svc.quickFilter('hide', rare);
  assert.equal((await svc.priceText(normal)).filterHit.action, 'Hide');
});

test('quick rule with chosen rarities and item level range', async () => {
  const { svc, filterDir } = setup();
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter' });
  const axe = (rar, ilvl, name = '') => `Item Class: Two Hand Axes\nRarity: ${rar}\n${name ? name + '\n' : ''}Vaal Axe\n--------\nItem Level: ${ilvl}`;
  const { rule } = svc.quickFilter('highlight', axe('Rare', 86, 'Corpse Bite'), { rarities: ['Magic', 'Rare'], ilvlMin: 84, ilvlMax: 86 });
  assert.equal(rule.label, 'Highlight magic/rare Vaal Axe, ilvl 84-86');
  const hit = async (t) => (await svc.priceText(t)).filterHit.comment === rule.label;
  assert.equal(await hit(axe('Rare', 86, 'Corpse Bite')), true);
  assert.equal(await hit(axe('Magic', 84)), true);
  assert.equal(await hit(axe('Rare', 83, 'Corpse Bite')), false, 'below the range');
  assert.equal(await hit(axe('Rare', 87, 'Corpse Bite')), false, 'above the range');
  assert.equal(await hit(axe('Normal', 85)), false, 'normal not ticked');
});

test('price review: plans moves from poe.ninja prices, applies them, logs and undoes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-review-'));
  const filterDir = path.join(dir, 'filters');
  fs.mkdirSync(filterDir);
  // realistic tier sizes: real filters have dozens of cards in the low tiers
  fs.writeFileSync(path.join(filterDir, 'FilterBlade.filter'), F.nsFilter.replace('BaseType == "Rain of Chaos" "The Carrion Crow"', 'BaseType == "Rain of Chaos" "The Carrion Crow" "Her Mask" "The Gambler" "The Scholar"'));
  const ex = (pairs) => ({ core: { primary: 'chaos', items: pairs.map(([n], i) => ({ id: 'i' + i, name: n })) }, lines: pairs.map(([, c], i) => ({ id: 'i' + i, primaryValue: c, volumePrimaryValue: 100 })) });
  const prices = {
    DivinationCard: [['The Apothecary', 9000], ['House of Mirrors', 4000], ['Rain of Chaos', 0.3], ['The Carrion Crow', 2500], ['Her Mask', 0.5], ['The Gambler', 0.4], ['The Scholar', 0.6]],
    Currency: [['Divine Orb', 180], ['Mirror of Kalandra', 20000], ['Mirror Shard', 1000], ['Exalted Orb', 14], ['Orb of Annulment', 40], ['Chaos Orb', 1], ['Orb of Alchemy', 0.3], ['Orb of Fusing', 30], ['Portal Scroll', 0.05], ['Scroll of Wisdom', 0.02]],
  };
  const fetchImpl = async (url) => {
    const ok = (b) => ({ status: 200, ok: true, headers: new Map(), json: async () => b });
    if (url.includes('/economy/leagues')) return ok([{ id: 'Test', name: 'Test' }]);
    if (url.includes('currency/overview')) return ok({ lines: [] }); // force the exchange fallback for Currency
    const type = /type=([A-Za-z]+)/.exec(url)?.[1];
    return ok(prices[type] ? ex(prices[type]) : { core: { items: [] }, lines: [] });
  };
  const svc = createServices({ dataDir: path.join(dir, 'data'), secrets: { encrypt: (x) => x, decrypt: (x) => x }, fetchImpl, log: () => {} });
  svc.settings.patch({ filterDir, baseFilter: 'FilterBlade.filter', gigaDone: true, gigaRestoreV1: true, bigBeltsDone: true });

  const r = await svc.priceReview();
  const byType = Object.fromEntries(r.categories.map((c) => [c.type, c]));
  assert.ok(byType.divination.enabled && byType.currency.enabled, 'default categories are enabled');
  const divMoves = Object.fromEntries(byType.divination.moves.map((m) => [m.base, m.to]));
  assert.equal(divMoves['The Carrion Crow'], 't1', 'a hidden card that spiked is promoted');
  const curMoves = Object.fromEntries(byType.currency.moves.map((m) => [m.base, m.to]));
  assert.equal(curMoves['Orb of Fusing'], 't2');
  assert.equal(curMoves['Divine Orb'], undefined, 'items that fit stay put');

  const all = r.categories.flatMap((c) => c.moves.map((m) => ({ ...m, type: c.type })));
  const { count } = svc.applyReviewMoves(all);
  assert.equal(count, all.length);
  const crow = await svc.priceText('Item Class: Divination Cards\nRarity: Divination Card\nThe Carrion Crow\n--------\nStack Size: 1/4');
  assert.match(crow.filterHit.comment, /\$tier->t1/, 'the game now shows it as tier 1');
  assert.equal(svc.settings.get('priceReviewLog').length, 1);

  // A second review right after finds nothing left to move
  const again = await svc.priceReview();
  assert.equal(again.categories.reduce((a, c) => a + c.moves.length, 0), 0);

  const u = svc.undoLastReview();
  assert.equal(u.undone, all.length);
  assert.equal(Object.keys(svc.settings.get('tierPatch').moves).length, 0, 'undo puts everything back');

  // user floors per category change the plan
  const strict = await svc.priceReview({ overrides: { currency: { thresholds: { t1: 5000 } } } });
  const sm = Object.fromEntries(strict.categories.find((c) => c.type === 'currency').moves.map((m) => [m.base, m.to]));
  assert.equal(sm['Divine Orb'], 't2', 'with a 5000c floor for tier 1, Divine Orb drops a tier');
});

test('the Giga tier follows the top currency look when a design is applied, until you edit it', () => {
  const { svc, filterDir } = setup({ giga: true });
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter' });
  const cur = svc.tierViewNow().types.find((t) => t.type === 'currency');
  if (!cur || cur.tiers[0].tier !== 'poehelper-giga') return; // fixture without currency tiers
  const from = svc.settings.get('tierPatch').newTiers.find((x) => x.name === 'Giga').copyFrom;
  const st = svc.designerState();
  svc.designerApply({ levels: st.presets[1].levels, lockTier1: false });
  const v = svc.tierViewNow().types.find((t) => t.type === 'currency');
  const giga = v.tiers.find((t) => t.tier === 'poehelper-giga');
  const src = v.tiers.find((t) => t.tier === from);
  assert.deepEqual(giga.style.background.slice(0, 3), src.style.text.slice(0, 3), 'the themed top tier reversed: its text colour as the background');
  assert.deepEqual(giga.style.text, [255, 215, 0, 255], 'gold text, so a Mirror never looks like a Divine');
  assert.notDeepEqual(giga.style.background, src.style.background);
  assert.ok(giga.style.beam && giga.style.icon);
  svc.setTierStyle('currency|poehelper-giga', { ...giga.style, text: [1, 2, 3, 255] });
  svc.designerApply({ levels: st.presets[2].levels, lockTier1: false });
  assert.deepEqual(svc.tierViewNow().types.find((t) => t.type === 'currency').tiers.find((t) => t.tier === 'poehelper-giga').style.text, [1, 2, 3, 255]);
});

test('tier designer: apply a preset to the whole filter, Tier 1 locked white + tink, undo', async () => {
  const { svc, filterDir } = setup();
  fs.writeFileSync(path.join(filterDir, 'FilterBlade.filter'), F.nsFilter);
  svc.settings.patch({ filterDir, baseFilter: 'FilterBlade.filter' });
  const st = svc.designerState();
  assert.equal(st.presets.length, 14);
  assert.deepEqual(st.groups.map((g) => g.id).sort(), ['currency', 'divination', 'uniques']);
  // a design that tries to make Tier 1 black gets locked back to white with FilterBlade's Divine sound
  const levels = { ...st.presets[2].levels, 1: { fontSize: 40, text: [255, 0, 0, 255], background: [0, 0, 0, 255] } };
  const r = svc.designerApply({ levels, lockTier1: true });
  assert.equal(r.count, 8);
  const out = fs.readFileSync(r.target, 'utf8');
  assert.match(out, /Show # %D5 \$type->currency \$tier->t1\n(?:\t.*\n)*?\tSetBackgroundColor 255 255 255 255\n(?:\t.*\n)*?\tPlayAlertSound 6 300/, 'FilterBlade\'s Divine sound (game sound 6)');
  const divine = await svc.priceText(`Item Class: Stackable Currency\nRarity: Currency\nDivine Orb\n--------\nStack Size: 1/20`);
  assert.deepEqual(divine.filterHit.style.SetBackgroundColor, ['255', '255', '255', '255']);
  svc.designerUndo();
  assert.deepEqual(svc.settings.get('tierPatch').styles, {});
});

test('magic items: base read from the name; your own sounds are stored and copied next to the filter', () => {
  const { svc, filterDir } = setup();
  svc.settings.set('filterDir', filterDir);
  svc.settings.set('baseFilter', 'NeverSink.filter');
  const base = svc.tierViewNow().types.flatMap((t) => t.tiers.flatMap((x) => x.bases))[0];
  assert.equal(svc.magicBaseOf(`Seething ${base} of Grounding`), base);
  const snd = svc.importSound({ name: 'My Big Drop!.wav', data: Buffer.from('RIFFxxxxWAVE').toString('base64') });
  assert.equal(snd.id, 'my-big-drop.wav');
  assert.ok(svc.listSounds().some((s) => s.id === 'my-big-drop.wav' && s.user));
  assert.match(svc.soundData(snd.id), /^data:audio\/wav;base64,/);
  assert.throws(() => svc.soundData('../../etc/passwd'));
  const key = svc.tierViewNow().types[0].tiers[0].key;
  svc.setTierStyle(key, { text: [255, 255, 255, 255], customSound: 'poehelper-sounds/my-big-drop.wav' });
  assert.ok(fs.existsSync(path.join(filterDir, 'poehelper-sounds', 'my-big-drop.wav')));
});

test('category pictures come only from GGG\'s image server, via poe.ninja data', async () => {
  const { svc } = setup();
  svc.ninja.category = async (league, c) => (c === 'Currency'
    ? [{ name: 'Divine Orb', icon: 'https://web.poecdn.com/gen/image/abc/divine.png' }, { name: 'Chromatic Orb', icon: '/gen/image/def/chrom.png' }, { name: 'Orb of Chance', icon: 'https://evil.example/x.png' }]
    : []);
  const art = await svc.categoryArt(['Divine Orb', 'Chromatic Orb', 'Orb of Chance']);
  assert.equal(art['Divine Orb'], 'https://web.poecdn.com/gen/image/abc/divine.png');
  assert.equal(art['Chromatic Orb'], 'https://web.poecdn.com/gen/image/def/chrom.png');
  assert.equal(art['Orb of Chance'], undefined);
});

test('WealthyExile pictures: the category of an item says which poe.ninja list to look in', async () => {
  const { svc } = setup();
  const asked = [];
  svc.ninja.category = async () => [];
  svc.ninja.icons = async (league, c) => { asked.push(c); return new Map(c === 'SkillGem' ? [['Kinetic Blast', 'https://web.poecdn.com/gen/image/kb.png']] : c === 'Astrolabe' ? [['Templar Astrolabe', 'https://web.poecdn.com/gen/image/ta.png']] : []); };
  const art = await svc.categoryArt(['Kinetic Blast\tGem', 'Templar Astrolabe\tAstrolabe']);
  assert.equal(art['Kinetic Blast'], 'https://web.poecdn.com/gen/image/kb.png');
  assert.equal(art['Templar Astrolabe'], 'https://web.poecdn.com/gen/image/ta.png');
  assert.deepEqual(asked.slice(0, 2), ['SkillGem', 'ImbuedGem']);
});

test('a synced filter the game saved under a new file name is found again', () => {
  const { FilterManager } = require('../src/core/filter/manager');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-online-'));
  fs.mkdirSync(path.join(dir, 'OnlineFilters'));
  const body = '#Online Item Filter\n#name:3.29 Leg Start\n#lastUpdate:x\nShow # $type->currency $tier->t1\n\tBaseType == "Divine Orb"\n';
  fs.writeFileSync(path.join(dir, 'OnlineFilters', 'go8d2vcE'), body);
  const st = { filterDir: dir, baseFilter: 'OnlineFilters/go8d2vcE' };
  const m = new FilterManager({ store: { get: (k) => st[k], set: (k, v) => { st[k] = v; } } });
  assert.ok(m.basePath());
  assert.equal(st.baseFilterName, '3.29 Leg Start');
  // the game drops the old file and saves the same filter under a new id
  fs.unlinkSync(path.join(dir, 'OnlineFilters', 'go8d2vcE'));
  fs.writeFileSync(path.join(dir, 'OnlineFilters', 'Zq81LmAa'), body);
  assert.equal(m.basePath(), path.join(dir, 'OnlineFilters', 'Zq81LmAa'));
  assert.equal(st.baseFilter, 'OnlineFilters/Zq81LmAa');
  // gone without a replacement: no crash, a clear "missing"
  fs.unlinkSync(path.join(dir, 'OnlineFilters', 'Zq81LmAa'));
  assert.equal(m.basePath(), null);
  assert.equal(m.missing().name, '3.29 Leg Start');
  assert.throws(() => m.readBase(), /isn't in the filter folder any more/);
});

test('currency gets a Giga tier above Tier 1 once, with the mirror-level items', () => {
  const { svc, filterDir } = setup({ giga: true });
  svc.settings.set('filterDir', filterDir);
  svc.settings.set('baseFilter', 'NeverSink.filter');
  const cur = svc.tierViewNow().types.find((t) => t.type === 'currency');
  if (!cur) return; // fixture without currency tiers
  assert.equal(cur.tiers[0].tier, 'poehelper-giga');
  assert.equal(cur.tiers[0].customName, 'Giga');
  svc.removeTier({ type: 'currency', tier: 'poehelper-giga' });
  assert.notEqual(svc.tierViewNow().types.find((t) => t.type === 'currency').tiers[0].tier, 'poehelper-giga', 'stays deleted');
});

test('uniques get a Big belts tier above S tier once, holding Heavy Belt and Leather Belt', () => {
  const { svc, filterDir } = setup({ belts: true });
  fs.writeFileSync(path.join(filterDir, 'NS.filter'), F.nsFilter);
  svc.settings.set('filterDir', filterDir);
  svc.settings.set('baseFilter', 'NS.filter');
  const uni = svc.tierViewNow().types.find((t) => t.type === 'uniques');
  assert.equal(uni.tiers[0].tier, 'poehelper-bigbelts');
  assert.equal(uni.tiers[0].customName, 'Big belts');
  assert.deepEqual(uni.tiers[0].bases, ['Leather Belt']);
  assert.ok(!uni.tiers.find((t) => t.tier === 't3').bases.includes('Leather Belt'));
});

test('a synced filter renamed on FilterBlade is still found when it is the only one', () => {
  const { FilterManager } = require('../src/core/filter/manager');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-online2-'));
  fs.mkdirSync(path.join(dir, 'OnlineFilters'));
  fs.writeFileSync(path.join(dir, 'OnlineFilters', 'NewId123'), '#Online Item Filter\n#name:3.29 Mapping\nShow # $type->currency $tier->t1\n\tBaseType == "Divine Orb"\n');
  const st = { filterDir: dir, baseFilter: 'OnlineFilters/go8d2vcE', baseFilterName: '3.29 Leg Start' };
  const m = new FilterManager({ store: { get: (k) => st[k], set: (k, v) => { st[k] = v; } } });
  assert.equal(m.basePath(), path.join(dir, 'OnlineFilters', 'NewId123'));
  assert.equal(st.baseFilterName, '3.29 Mapping');
});

test('patch notes and version info come from CHANGELOG.md', () => {
  const { svc } = setup();
  const notes = svc.changelog();
  assert.ok(notes.length >= 1);
  assert.equal(notes[0].version, require('../package.json').version, 'the current version has patch notes');
  assert.match(notes[0].date, /^\d{4}-\d{2}-\d{2}$/);
  const v = svc.versionInfo();
  assert.equal(v.version, notes[0].version);
  assert.equal(v.releasedAt, notes[0].date);
  assert.equal(v.justUpdated, false, 'first run is an install, not an update');
  svc.settings.set('versionSeen', { version: '0.9.0', at: 1 });
  assert.equal(svc.versionInfo().justUpdated, true);
  assert.equal(svc.versionInfo().updatedFrom, '0.9.0');
});

test('price tiers in divines are converted with the poe.ninja divine price', async () => {
  const { svc } = setup();
  svc.settings.set('economy', { enabled: true, thresholds: { unit: 'divine', top: 1, high: 0.5, mid: 0.1 } });
  const seen = {};
  svc.ninja.category = async (league, c) => (c === 'Currency'
    ? [{ name: 'Divine Orb', chaos: 200 }, { name: 'Exalted Orb', chaos: 12 }]
    : c === 'DivinationCard' ? [{ name: 'The Doctor', chaos: 250 }, { name: 'The Wolf', chaos: 150 }, { name: 'The Gambler', chaos: 30 }] : []);
  const rules = await svc.regenerateEconomy({ preview: true });
  for (const r of rules) for (const c of r.conditions) if (c.keyword === 'BaseType') for (const v of c.values) seen[v] = r.label;
  assert.match(seen['The Doctor'], />= 200c/, '1 divine = 200c');
  assert.match(seen['The Wolf'], /100-200c/, '0.5 divine = 100c');
  assert.match(seen['The Gambler'], /20-100c/, '0.1 divine = 20c');
});

test('thresholds can be typed as 200c, 1 div, 1,5 div or 0.5 ex', () => {
  const { svc } = setup();
  const u = { chaos: 1, divine: 400, exalted: 12 };
  assert.equal(svc.parsePrice('200c', u), 200);
  assert.equal(svc.parsePrice('1 div', u), 400);
  assert.equal(svc.parsePrice('1,5 divine', u), 600);
  assert.equal(svc.parsePrice('0.5ex', u), 6);
  assert.equal(svc.parsePrice('300', u), 300, 'a bare number is chaos');
  assert.equal(svc.parsePrice(2, u, 'divine'), 800, 'old numeric thresholds keep their category unit');
  assert.equal(svc.parsePrice('lots', u), null);
});

test('cluster jewel rules use base, item level and passives, and can hide', () => {
  const { myBaseRule } = require('../src/core/filter/manager');
  const r = myBaseRule({ id: 'c1', group: 'cluster', base: 'Large Cluster Jewel', ilvlMin: 84, passivesMin: 8, passivesMax: 8, action: 'Show' });
  assert.equal(r.label, 'Cluster jewels: Large Cluster Jewel ilvl 84+, 8 passives');
  assert.ok(r.conditions.some((c) => c.keyword === 'EnchantmentPassiveNum' && c.op === '>=' && c.values[0] === '8'));
  const hide = myBaseRule({ id: 'c2', group: 'cluster', base: 'Small Cluster Jewel', ilvlMax: 67, action: 'Hide' });
  assert.equal(hide.action, 'Hide');
  assert.match(hide.label, /hide Small Cluster Jewel ilvl up to 67/);
});

test('"Also when fractured" writes a Hide block for hidden bases above the filter', () => {
  const { svc, filterDir } = setup();
  fs.writeFileSync(path.join(filterDir, 'FilterBlade.filter'), F.nsFilter);
  svc.settings.patch({ filterDir, baseFilter: 'FilterBlade.filter', hideFractured: true, rankKinds: {} });
  const { target } = svc.moveBases('divination', ['Rain of Chaos'], '__hide__');
  const out = fs.readFileSync(target, 'utf8');
  const at = out.indexOf('FracturedItem True');
  assert.ok(at > 0, 'has the fractured block');
  assert.match(out.slice(at, at + 200), /BaseType == "Rain of Chaos"/);
  assert.ok(at < out.indexOf('$type->currency'), 'above the FilterBlade tiers');
  assert.doesNotMatch(out, /SynthesisedItem/);
});

test('base visibility: hide a base, show or hide its fractured copies, written above the filter', () => {
  const { svc, filterDir } = setup();
  fs.writeFileSync(path.join(filterDir, 'FilterBlade.filter'), F.nsFilter);
  svc.settings.patch({ filterDir, baseFilter: 'FilterBlade.filter' });
  const v = svc.baseMatrixView();
  assert.ok(v.bases['Body Armours'].es.some((b) => b.name === 'Vaal Regalia'));
  svc.setBaseMatrix({ bases: ['Vaal Regalia', 'Silk Robe', 'Not A Base'], vis: 'hide' });
  svc.setBaseMatrix({ bases: ['Vaal Regalia'], frac: 'show' });
  const { state, target } = svc.setBaseMatrix({ bases: ['Silk Robe'], frac: 'hide' });
  assert.deepEqual(state, { 'Vaal Regalia': { vis: 'hide', frac: 'show' }, 'Silk Robe': { vis: 'hide', frac: 'hide' } });
  const out = fs.readFileSync(target, 'utf8');
  const show = out.indexOf('Show # Base visibility: fractured bases you want');
  const fh = out.indexOf('Hide # Base visibility: hide fractured');
  const hide = out.indexOf('Hide # Base visibility: bases you hid');
  assert.ok(show > 0 && show < fh && fh < hide && hide < out.indexOf('$type->currency'), 'fractured rules first, all above the filter');
  const hideBlock = out.slice(hide, out.indexOf('\n\n', hide));
  assert.match(hideBlock, /FracturedItem False/);
  assert.match(hideBlock, /AreaLevel >= 68/);
  assert.match(hideBlock, /BaseType == "Silk Robe" "Vaal Regalia"/);
  assert.doesNotMatch(hideBlock, /Unique/);
  // options: everywhere, keep ilvl 86+
  svc.setBaseMatrixOpts({ mapsOnly: false, keepIlvl: 86 });
  const out2 = fs.readFileSync(target, 'utf8');
  const hb2 = out2.slice(out2.indexOf('Hide # Base visibility: bases you hid'));
  assert.doesNotMatch(hb2.slice(0, hb2.indexOf('\n\n')), /AreaLevel/);
  assert.match(hb2, /ItemLevel < 86/);
  // back to the filter
  svc.setBaseMatrix({ bases: ['Vaal Regalia', 'Silk Robe'], vis: null, frac: null });
  assert.doesNotMatch(fs.readFileSync(target, 'utf8'), /Base visibility/);
});

test('cluster jewels: reads the filter grid, prices loosely, writes your choices above the filter', () => {
  const C = require('../src/core/cluster');
  const T = require('../src/core/filter/tiers');
  const text = `Show # $type->jewels->clustereco $tier->n12_i84_t1
	ItemLevel >= 84
	Rarity Normal Magic Rare
	EnchantmentPassiveNum 12
	BaseType == "Large Cluster Jewel"
	EnchantmentPassiveNode "Fire Damage" "Minion Damage"
	SetFontSize 45
	SetBackgroundColor 255 255 255 255

#Show # $type->jewels->clustereco $tier->n4_i84_t2
#	ItemLevel >= 84
#	EnchantmentPassiveNum <= 5
#	BaseType == "Medium Cluster Jewel"
#	EnchantmentPassiveNode "Minion Life"

Show # %D8 $type->jewels->clustereco $tier->n4_i68_t2
	ItemLevel >= 68
	ItemLevel <= 74
	EnchantmentPassiveNum <= 5
	BaseType == "Medium Cluster Jewel"
	EnchantmentPassiveNode "Chaos Damage over Time"
	SetFontSize 40
`;
  const eco = T.tierView(text).types.find((t) => t.type === 'jewels->clustereco');
  const r = C.readFilter(eco);
  assert.equal(r.cells['Large|Fire Damage|12|84'], 't1');
  assert.equal(r.cells['Medium|Chaos Damage over Time|4|68'], 't2');
  assert.equal(r.cells['Medium|Chaos Damage over Time|5|68'], 't2', 'n4 means 4 or 5 passives');
  assert.equal(r.cells['Medium|Minion Life|4|84'], undefined, 'switched-off tiers do nothing');
  assert.equal(r.looks.Large.t1.fontSize, 45);
  const prices = C.priceCells([{ name: 'Minions deal 10% increased Damage while you are affected by a Herald', baseType: 'Medium Cluster Jewel', variant: '4 passives', levelRequired: 84, chaos: 12 }]);
  assert.deepEqual(prices, { 'Medium|Minion Damage while you have a Herald|4|84': 12 });
  const st = { total: 0, missed: [] };
  const more = C.priceCells([
    { name: '12% increased Burning Damage', baseType: 'Medium Cluster Jewel', variant: '5 passives', levelRequired: 75, chaos: 4 },
    { name: '3% increased effect of Non-Curse Auras from your Skills', baseType: 'Small Cluster Jewel', variant: '2 passives', levelRequired: 84, chaos: 90 },
    { name: 'Something new', baseType: 'Small Cluster Jewel', variant: '2 passives', levelRequired: 84, chaos: 1 },
  ], st);
  assert.deepEqual(more, { 'Medium|Fire Damage over Time|5|75': 4, 'Small|Reservation Efficiency|2|84': 90 });
  assert.equal(st.missed.length, 1);

  const { svc, filterDir } = setup();
  fs.writeFileSync(path.join(filterDir, 'FilterBlade.filter'), F.nsFilter + '\n' + text);
  svc.settings.patch({ filterDir, baseFilter: 'FilterBlade.filter' });
  svc.setCluster({ keys: ['Large|Minion Damage|12|84', 'Large|Spell Damage|12|84', 'Large|Bogus|12|84'], value: 'top' });
  const { state, target } = svc.setCluster({ keys: ['Small|Life|2|68'], value: 'hide' });
  assert.deepEqual(Object.keys(state).sort(), ['Large|Minion Damage|12|84', 'Large|Spell Damage|12|84', 'Small|Life|2|68']);
  const out = fs.readFileSync(target, 'utf8');
  const top = out.indexOf('Show # Cluster jewels: top large 12 passives');
  assert.ok(top > 0 && top < out.indexOf('$type->currency'));
  const block = out.slice(top, out.indexOf('\n\n', top));
  assert.match(block, /EnchantmentPassiveNode "Minion Damage" "Spell Damage"/);
  assert.match(block, /SetBackgroundColor 255 255 255 255/, "uses the filter's T1 look");
  assert.match(out, /Hide # Cluster jewels: hide small 2 passives, item level 68-74[\s\S]*?ItemLevel <= 74[\s\S]*?EnchantmentPassiveNode "Life"/);
});

test('price check: an item you hid shows where it is and offers its tiers back, the original first', () => {
  const { svc, filterDir } = setup();
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter' });
  const view = svc.tierViewNow();
  const t = view.types.find((x) => x.tiers.some((y) => y.hasBaseList && y.bases.length && !y.special && !y.generated));
  const tier = t.tiers.find((y) => y.hasBaseList && y.bases.length && !y.special && !y.generated);
  const base = tier.bases[0];
  svc.moveBases(t.type, [base], '__hide__');
  const ti = svc.tierInfoFor({ baseType: base, typeLine: base, rarity: 'Normal' }, null);
  assert.equal(ti.hiddenByYou, true);
  assert.equal(ti.type, t.type);
  assert.equal(ti.options[0].tier, tier.tier);
  assert.equal(ti.options[0].original, true);
});

test('resetting another category keeps the Giga tier; resetting currency brings it back after a delete', () => {
  const { svc, filterDir } = setup({ giga: true });
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter' });
  const gigaThere = () => svc.tierViewNow().types.find((t) => t.type === 'currency').tiers.some((t) => t.tier === 'poehelper-giga');
  if (!gigaThere()) return; // fixture without currency tiers
  svc.resetTiers({ type: 'uniques' });
  assert.ok(gigaThere(), 'a reset elsewhere leaves Giga alone');
  svc.removeTier({ type: 'currency', tier: 'poehelper-giga' });
  assert.ok(!gigaThere(), 'deleted by you');
  assert.ok(!gigaThere(), 'and stays deleted');
  svc.resetTiers({ type: 'currency' });
  assert.ok(gigaThere(), 'resetting currency restores the default Giga tier');
});

test('base ranks: a B rank base hides as a plain rare (rares S only) but shows fractured (B and up)', () => {
  const { svc, filterDir } = setup();
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter' });
  svc.setBaseRanks({ bases: ['Vaal Regalia'], rank: 'B' });
  svc.setBaseRanks({ bases: ['Vaal Regalia', 'Simple Robe'], dir: +1 }); // B -> A, D -> C
  assert.equal(svc.settings.get('baseRanks')['Vaal Regalia'], 'A');
  assert.equal(svc.settings.get('baseRanks')['Simple Robe'], 'C');
  svc.setBaseRanks({ bases: ['Vaal Regalia'], dir: -1 });
  svc.setBaseRanks({ bases: ['Simple Robe'], dir: -1 });
  svc.setBaseRanks({ bases: ['Simple Robe'], dir: -1 }); // already D: stays, the floor
  assert.equal(svc.settings.get('baseRanks')['Vaal Regalia'], 'B');
  assert.equal(svc.settings.get('baseRanks')['Simple Robe'], undefined, 'D (untiered) is the default');
  svc.setRankKind({ kind: 'rares', min: 'S' });
  svc.setRankKind({ kind: 'fractured', min: 'B' });
  const { rankRules } = require('../src/core/filter/manager');
  const rules = rankRules(svc.settings.get('baseRanks'), svc.settings.get('rankKinds'), ['Vaal Regalia', 'Simple Robe']);
  const has = (id, base) => rules.find((r) => r.id === id)?.conditions.find((c) => c.keyword === 'BaseType').values.includes(base);
  assert.ok(has('rank-fractured-B', 'Vaal Regalia'), 'fractured Vaal Regalia shows');
  assert.ok(has('rank-rares-hide', 'Vaal Regalia'), 'plain rare Vaal Regalia hides');
  assert.ok(has('rank-fractured-hide', 'Simple Robe'));
  const hide = rules.find((r) => r.id === 'rank-rares-hide');
  assert.ok(hide.conditions.some((c) => c.keyword === 'Sockets'), 'six sockets still show');
  assert.ok(!rules.some((r) => r.conditions.some((c) => c.keyword === 'Rarity' && c.values.includes('Unique'))), 'uniques untouched');
  const text = require('fs').readFileSync(svc.filters.write(), 'utf8');
  assert.match(text, /Base ranks: fractured, rank B/);
});

test('base ranks: a lowest item level per kind of drop', () => {
  const { svc } = setup();
  svc.setRankKind({ kind: 'fractured', min: 'S' });
  svc.setRankKind({ kind: 'fractured', ilvl: 68 });
  svc.setRankKind({ kind: 'crafting', min: 'A' });
  svc.setRankKind({ kind: 'crafting', ilvl: 84 });
  assert.equal(svc.settings.get('rankKinds').fractured, 'S', 'setting the item level keeps the rank');
  const { rankRules } = require('../src/core/filter/manager');
  const rules = rankRules(svc.settings.get('baseRanks'), svc.settings.get('rankKinds'), ['Royal Plate', 'Simple Robe'], { craftIlvl: svc.settings.get('rankCraftIlvl'), ilvls: svc.settings.get('rankIlvl') });
  const il = (id) => rules.find((r) => r.id === id).conditions.find((c) => c.keyword === 'ItemLevel')?.values[0];
  assert.equal(il('rank-fractured-S'), '68');
  assert.equal(il('rank-fractured-hide'), '68');
  assert.equal(il('rank-crafting-hide'), '84');
  svc.setRankKind({ kind: 'fractured', ilvl: 1 });
  const any = rankRules(svc.settings.get('baseRanks'), svc.settings.get('rankKinds'), ['Royal Plate'], { ilvls: svc.settings.get('rankIlvl') });
  assert.ok(!any.find((r) => r.id === 'rank-fractured-S').conditions.some((c) => c.keyword === 'ItemLevel'), '1 = any item level');
});

test('base ranks: the usual ranking to start from, the old fractured choices move over, and ranks by base order', () => {
  const { svc } = setup();
  let v = svc.baseMatrixView();
  assert.equal(v.ranks['Royal Plate'], 'S');
  assert.equal(v.ranks['Legion Plate'], 'A');
  assert.equal(v.ranks['Vaal Regalia'], 'B');
  assert.equal(v.ranks['Gladiator Plate'], 'C');
  assert.equal(v.ranks['Simple Robe'], undefined, 'untiered (D)');
  assert.deepEqual(v.rankList, ['S', 'A', 'B', 'C', 'D']);
  // an older install: fractured looks and "all ranks" = C
  svc.settings.patch({ ranksV1: false, ranksV2: false, rankKinds: { rares: 'C' }, baseMatrix: { 'Vaal Regalia': { frac: 'top' }, 'Simple Robe': { frac: 'show', vis: 'hide' } } });
  v = svc.baseMatrixView();
  assert.equal(v.kinds.fractured, 'B', 'fractured copies keep showing');
  assert.equal(v.kinds.rares, 'D', 'all ranks is D now');
  assert.deepEqual(svc.settings.get('baseMatrix'), { 'Simple Robe': { vis: 'hide' } });
  assert.equal(v.ranks['Royal Plate'], 'S');
  const r = svc.autoRanks({ s: 1, a: 2, b: 2, c: 2 });
  const col = svc.baseMatrixView().bases['Body Armours'].ar.map((b) => b.name);
  assert.deepEqual(col.slice(0, 8).map((n) => r.ranks[n] || 'D'), ['S', 'A', 'A', 'B', 'B', 'C', 'C', 'D'].slice(0, Math.min(8, col.length)));
  svc.defaultRanks();
  assert.equal(svc.settings.get('baseRanks')['Vaal Regalia'], 'B');
});

test('reset everything: your changes go, account and filter choice stay, and it can be undone once', () => {
  const { svc, filterDir } = setup();
  svc.settings.patch({ filterDir, baseFilter: 'NeverSink.filter', accountName: 'me#1234', hotkeyPrice: 'Ctrl+Q' });
  svc.setBaseMatrix({ bases: ['Royal Plate'], frac: 'top' });
  svc.resetAll();
  assert.equal(svc.settings.get('accountName'), 'me#1234');
  assert.equal(svc.settings.get('baseFilter'), 'NeverSink.filter');
  assert.notEqual(svc.settings.get('hotkeyPrice'), 'Ctrl+Q');
  assert.deepEqual(svc.settings.get('baseMatrix'), {});
  assert.ok(svc.canUndoReset());
  svc.undoResetAll();
  assert.equal(svc.settings.get('hotkeyPrice'), 'Ctrl+Q');
  assert.equal(svc.canUndoReset(), false);
});

test('base ranks leave heist and ritual bases to the filter', () => {
  const M = require('../src/core/filter/manager');
  const D = require('../src/core/base-data');
  const heist = Object.values(D.GROUPS.find((g) => g.id === 'heist').columns).flat();
  const ritual = Object.values(D.GROUPS.find((g) => g.id === 'ritual').columns).flat();
  const ranked = new Set(M.RANKED_NAMES);
  assert.ok(heist.length && ritual.length);
  assert.ok(![...heist, ...ritual].some((b) => ranked.has(b)));
  const { svc } = setup();
  const v = svc.baseMatrixView();
  assert.ok(!v.groups.some((g) => g.id === 'heist' || g.id === 'ritual'));
  svc.setBaseRanks({ bases: [heist[0]], rank: 'S' });
  assert.equal(svc.settings.get('baseRanks')[heist[0]], undefined);
});

test('loot filter settings: export from one app, import in another, undo', () => {
  const a = setup().svc;
  a.setBaseRanks({ bases: ['Simple Robe'], rank: 'S' });
  a.setRankKind({ kind: 'rares', min: 'A' });
  a.settings.set('myBases', [{ id: 'x1', base: 'Vaal Regalia', enabled: true }]);
  a.settings.set('tierPatch', { moves: {}, styles: { 'currency|t1': { customSound: 'poehelper-sounds/my-boom.mp3' } } });
  require('fs').mkdirSync(require('path').join(a.settings.file ? require('path').dirname(a.settings.file) : '.', 'sounds'), { recursive: true });
  const text = a.exportFilterSettings();
  const data = JSON.parse(text);
  assert.equal(data.kind, 'poe-helper-loot-filter-settings');
  assert.ok(!('accountName' in data.settings) && !('sessionEnc' in data.settings), 'no account or login in it');

  const b = setup().svc;
  b.settings.set('accountName', 'Friend');
  b.setBaseRanks({ bases: ['Simple Robe'], rank: 'C' });
  b.settings.set('myBases', [{ id: 'y', base: 'Titan Plate', enabled: true }]);
  b.importFilterSettings(text);
  assert.equal(b.settings.get('baseRanks')['Simple Robe'], 'S');
  assert.equal(b.settings.get('rankKinds').rares, 'A');
  assert.deepEqual(b.settings.get('myBases').map((x) => x.base), ['Vaal Regalia']);
  assert.equal(b.settings.get('accountName'), 'Friend', 'their account stays');
  assert.ok(b.canUndoImport());
  b.undoImportFilterSettings();
  assert.equal(b.settings.get('baseRanks')['Simple Robe'], 'C');
  assert.deepEqual(b.settings.get('myBases').map((x) => x.base), ['Titan Plate']);
  assert.ok(!b.canUndoImport());
  assert.throws(() => b.importFilterSettings('{"kind":"other"}'), /isn't a PoE Helper/);
});

test('rares keep the filter look: base ranks only hide the ranks below your choice', () => {
  const { rankRules } = require('../src/core/filter/manager');
  if (!rankRules) return;
  const rules = rankRules({ 'Vaal Regalia': 'S', 'Silk Robe': 'D' }, { rares: 'B' }, ['Vaal Regalia', 'Silk Robe']);
  assert.ok(!rules.some((r) => r.action === 'Show' && /^rank-rares/.test(r.id)), 'no rank look on rares');
  const hide = rules.find((r) => r.id === 'rank-rares-hide');
  assert.deepEqual(hide.conditions.find((c) => c.keyword === 'BaseType').values, ['Silk Robe']);
});
