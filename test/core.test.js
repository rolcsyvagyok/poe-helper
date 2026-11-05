'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const F = require('./fixtures');
const { parseItem, classify, modTemplate } = require('../src/core/item-parser');
const { RateLimiter } = require('../src/core/rate-limiter');
const { parseExchange, parseCurrency, NinjaClient } = require('../src/core/ninja');
const { DiskCache, JsonStore } = require('../src/core/cache');
const { Pricer, categoriesFor } = require('../src/core/pricer');
const { matchItemMods, buildQuery } = require('../src/core/trade');
const { checkMap } = require('../src/core/map-mods');
const { valueTabs, buildIndex, diffItems } = require('../src/core/networth');
const { parse, serialize, renderBlock } = require('../src/core/filter/parser');
const { explain } = require('../src/core/filter/matcher');
const { buildHelperFilter, economyRules, quickRule, MARK } = require('../src/core/filter/manager');
const { GggClient, BudgetExceededError } = require('../src/core/ggg');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-'));

// ---------- item parser ----------
test('parses stackable currency', () => {
  const it = parseItem(F.divineOrb);
  assert.equal(it.itemClass, 'Stackable Currency');
  assert.equal(it.typeLine, 'Divine Orb');
  assert.deepEqual(it.stack, { current: 7, max: 20 });
  assert.equal(classify(it), 'currency');
});

test('parses unique, sockets, drops flavour text', () => {
  const it = parseItem(F.unique);
  assert.equal(it.name, "Kaom's Heart");
  assert.equal(it.baseType, 'Glorious Plate');
  assert.equal(it.sockets.links, 6);
  assert.equal(it.itemLevel, 84);
  assert.equal(it.requirements.level, 68);
  assert.ok(it.mods.explicit.includes('+500 to maximum Life'));
  assert.ok(!it.mods.explicit.some((m) => m.includes('warrior who fears')));
});

test('parses rare with implicit, crafted, corrupted', () => {
  const it = parseItem(F.rare);
  assert.equal(classify(it), 'rare');
  assert.deepEqual(it.mods.implicit, ['+14% to Cold and Lightning Resistances']);
  assert.deepEqual(it.mods.crafted, ['+20 to Strength']);
  assert.equal(it.mods.explicit.length, 4);
  assert.equal(it.flags.corrupted, true);
});

test('parses gem level/quality and map tier', () => {
  const g = parseItem(F.gem);
  assert.equal(g.gemLevel, 21);
  assert.equal(g.quality, 20);
  const m = parseItem(F.map);
  assert.equal(m.mapTier, 16);
  assert.equal(classify(m), 'map');
  assert.equal(m.properties['Item Quantity'], '+78%');
});

test('parses influence and rejects non-items', () => {
  const it = parseItem(F.normalBase);
  assert.deepEqual(it.influences, ['Shaper']);
  assert.equal(parseItem('hello world'), null);
  assert.equal(modTemplate('Adds 10 to 20 Fire Damage'), 'Adds # to # Fire Damage');
});

// ---------- rate limiter ----------
test('rate limiter learns rules from headers and waits within safety margin', async () => {
  let t = 0;
  const slept = [];
  const rl = new RateLimiter({ safety: 0.5, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
  const headers = { 'X-Rate-Limit-Rules': 'Ip', 'X-Rate-Limit-Ip': '4:10:60', 'X-Rate-Limit-Ip-State': '1:10:0' };
  for (let i = 0; i < 5; i++) await rl.schedule('k', async () => ({ status: 200, headers }));
  // allowed = floor(4*0.5) = 2 per 10s => 5 requests need at least 2 waits
  assert.ok(slept.length >= 2, `expected waits, got ${slept}`);
  assert.ok(t >= 20000);
});

test('rate limiter honours Retry-After on 429', async () => {
  let t = 0;
  const rl = new RateLimiter({ now: () => t, sleep: async (ms) => { t += ms; } });
  await rl.schedule('k', async () => ({ status: 429, headers: { 'Retry-After': '30' } }));
  assert.ok(rl.waitTime('k') >= 29000);
});

// ---------- poe.ninja ----------
test('parses exchange overview by joining items on id', () => {
  const out = parseExchange({ core: { primary: 'chaos', items: [{ id: 'divine', name: 'Divine Orb' }] }, lines: [{ id: 'divine', primaryValue: 210 }] });
  assert.deepEqual(out.map((x) => [x.name, x.chaos]), [['Divine Orb', 210]]);
  const conv = parseExchange({ core: { primary: 'divine', rates: { chaos: 200 }, items: [{ id: 'x', name: 'X' }] }, lines: [{ id: 'x', primaryValue: 0.5 }] });
  assert.equal(conv[0].chaos, 100);
  assert.equal(parseCurrency({ lines: [{ currencyTypeName: 'Exalted Orb', chaosEquivalent: 15 }] })[0].chaos, 15);
});

function fakeNinjaFetch(counter) {
  const data = {
    'stash/current/currency/overview': { lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 200 }] },
    'type=DivinationCard': { core: { primary: 'chaos', items: [{ id: 'apo', name: 'The Apothecary' }] }, lines: [{ id: 'apo', primaryValue: 9000 }] },
    'type=UniqueArmour': { lines: [{ name: "Kaom's Heart", baseType: 'Glorious Plate', chaosValue: 50, listingCount: 40 }, { name: "Kaom's Heart", baseType: 'Glorious Plate', chaosValue: 400, links: 6, listingCount: 4 }] },
    'type=SkillGem': { lines: [{ name: 'Spark', gemLevel: 20, gemQuality: 20, chaosValue: 5, listingCount: 30 }, { name: 'Spark', gemLevel: 21, gemQuality: 20, corrupted: true, chaosValue: 60, listingCount: 30 }] },
  };
  return async (url, opts) => {
    counter.n++;
    const key = Object.keys(data).find((k) => url.includes(k));
    if (opts.headers['If-None-Match'] === 'v1') return { status: 304, ok: false, headers: new Map(), json: async () => ({}) };
    return { status: key ? 200 : 404, ok: !!key, headers: new Map([['etag', 'v1']]), json: async () => data[key] };
  };
}

test('pricer prices currency stacks, uniques with links, gems, div cards with few requests', async () => {
  const counter = { n: 0 };
  const ninja = new NinjaClient({ cache: new DiskCache(tmp()), fetchImpl: fakeNinjaFetch(counter), userAgent: 'test' });
  const pricer = new Pricer({ ninja, getLeague: async () => 'Test' });

  const cur = await pricer.price(parseItem(F.divineOrb));
  assert.equal(cur.chaos, 200);
  assert.equal(cur.totalChaos, 1400);

  const u = await pricer.price(parseItem(F.unique));
  assert.equal(u.chaos, 400, '6-link price used');

  const g = await pricer.price(parseItem(F.gem));
  assert.equal(g.chaos, 60);

  const d = await pricer.price(parseItem(F.divCard));
  assert.equal(d.chaos, 9000);

  const before = counter.n;
  await pricer.price(parseItem(F.divineOrb));
  await pricer.price(parseItem(F.unique));
  assert.equal(counter.n, before, 'second round served from cache: zero requests');
});

test('category routing', () => {
  assert.deepEqual(categoriesFor(parseItem(F.divCard)), ['DivinationCard']);
  assert.deepEqual(categoriesFor(parseItem(F.unique)), ['UniqueArmour']);
  assert.deepEqual(categoriesFor(parseItem(F.normalBase)), ['BaseType']);
});

// ---------- trade ----------
const STATS = { result: [
  { id: 'explicit', label: 'Explicit', entries: [
    { id: 'explicit.stat_life', text: '+# to maximum Life', type: 'explicit' },
    { id: 'explicit.stat_fire', text: '+#% to Fire Resistance', type: 'explicit' },
    { id: 'explicit.stat_chaos', text: '+#% to Chaos Resistance', type: 'explicit' },
    { id: 'explicit.stat_manacost', text: '#% increased Mana Cost of Skills', type: 'explicit' },
  ] },
  { id: 'implicit', label: 'Implicit', entries: [{ id: 'implicit.stat_coldlight', text: '+#% to Cold and Lightning Resistances', type: 'implicit' }] },
  { id: 'crafted', label: 'Crafted', entries: [{ id: 'crafted.stat_str', text: '+# to Strength', type: 'crafted' }] },
] };

test('matches rare mods to trade stats, including reduced->negative', () => {
  const it = parseItem(F.rare);
  const mods = matchItemMods(STATS, it);
  const life = mods.find((m) => m.id === 'explicit.stat_life');
  assert.equal(life.value, 45);
  const mana = mods.find((m) => m.id === 'explicit.stat_manacost');
  assert.equal(mana.value, -5);
  assert.ok(mods.find((m) => m.id === 'implicit.stat_coldlight'));
  const q = buildQuery(it, mods, { tolerance: 0.1 });
  assert.equal(q.query.type, 'Two-Stone Ring');
  const lf = q.query.stats[0].filters.find((f) => f.id === 'explicit.stat_life');
  assert.deepEqual(lf.value, { min: 40 });
  assert.equal(q.query.filters.misc_filters.filters.corrupted.option, 'true');
});

// ---------- map mods ----------
test('flags dangerous map mods', () => {
  const r = checkMap(parseItem(F.map));
  assert.equal(r.verdict, 'skip');
  assert.ok(r.hits.find((h) => h.id === 'reflect-ele'));
  assert.ok(r.hits.find((h) => h.id === 'less-recovery'));
  assert.equal(r.stats.quantity, 78);
});

// ---------- net worth ----------
test('values stash tabs and diffs snapshots', () => {
  const idx = buildIndex({
    Currency: [{ name: 'Divine Orb', chaos: 200 }, { name: 'Chaos Orb', chaos: 1 }],
    DivinationCard: [{ name: 'The Apothecary', chaos: 9000 }],
    UniqueArmour: [{ name: "Kaom's Heart", baseType: 'Glorious Plate', chaos: 50 }],
  });
  const tabs = [{ name: 'Currency', items: [
    { frameType: 5, typeLine: 'Divine Orb', stackSize: 10 },
    { frameType: 5, typeLine: 'Chaos Orb', stackSize: 300 },
    { frameType: 6, typeLine: 'The Apothecary', stackSize: 1 },
    { frameType: 3, name: "Kaom's Heart", typeLine: 'Glorious Plate', identified: true },
    { frameType: 2, name: 'Rare thing', typeLine: 'Two-Stone Ring', identified: true },
  ] }];
  const v = valueTabs(tabs, idx);
  assert.equal(Math.round(v.total), 2000 + 300 + 9000 + 50);
  const a = { items: [{ n: 'Divine Orb', q: 10, e: 200 }] };
  const b = { items: [{ n: 'Divine Orb', q: 13, e: 200 }, { n: 'Chaos Orb', q: 50, e: 1 }] };
  const d = diffItems(a, b);
  assert.equal(d[0].name, 'Divine Orb');
  assert.equal(d[0].deltaChaos, 600);
});

// ---------- filters ----------
test('filter parser round-trips byte-for-byte', () => {
  assert.equal(serialize(parse(F.filter)), F.filter);
  const crlf = F.filter.replace(/\n/g, '\r\n');
  assert.equal(serialize(parse(crlf)), crlf);
});

test('explainer finds first matching block and reports unknowns', () => {
  const doc = parse(F.filter);
  const div = explain(doc, parseItem(F.divineOrb));
  assert.equal(div.action, 'Show');
  assert.match(div.comment, /currency/);

  const kaom = explain(doc, parseItem(F.unique));
  assert.match(kaom.comment, /uniques/);

  // Rare ring ilvl 84: lowlevel hide doesn't match (ilvl), continue block applies border, then shown
  const ring = explain(doc, parseItem(F.rare));
  assert.equal(ring.action, 'Show');
  assert.equal(ring.chain.length, 2);
  assert.deepEqual(ring.style.SetBorderColor, ['0', '0', '0', '255']);
});

test('helper filter puts overrides first and keeps base intact; rebuild is idempotent', () => {
  const rule = quickRule('hide', parseItem(F.normalBase));
  const out = buildHelperFilter({ baseText: F.filter, overrides: [rule], header: { baseName: 'test.filter' } });
  assert.ok(out.startsWith(`${MARK} START`));
  assert.ok(out.endsWith(F.filter));
  assert.match(out, /Hide # Hide normal Vermillion Ring/);
  // Feeding the helper file back in must not nest sections
  const again = buildHelperFilter({ baseText: out, overrides: [rule] });
  assert.equal(again.split(`${MARK} START`).length, 2);
  // Override wins in explainer
  const r = explain(parse(out), parseItem(F.normalBase));
  assert.equal(r.action, 'Hide');
});

test('economy rules render valid blocks', () => {
  const rules = economyRules({
    DivinationCard: [{ name: 'The Apothecary', chaos: 9000 }, { name: 'The Wolf', chaos: 30 }, { name: 'Rain of Chaos', chaos: 0.5 }],
    UniqueArmour: [{ name: 'A', baseType: 'Glorious Plate', chaos: 500, listingCount: 10 }, { name: 'B', baseType: 'Simple Robe', chaos: 1, listingCount: 10 }, { name: 'C', baseType: 'Simple Robe', chaos: 300, listingCount: 10 }],
  }, { top: 100, high: 20, mid: 5, hideDivBelow: 1 });
  const text = rules.map((r) => renderBlock(r)).join('\n\n');
  assert.match(text, /BaseType == "The Apothecary"/);
  assert.match(text, /Hide # Economy: hide divination cards < 1c\n\tClass == "Divination Cards"\n\tBaseType == "Rain of Chaos"/);
  assert.match(text, /some unique on base[\s\S]*"Simple Robe"/);
  assert.equal(serialize(parse(text)), text);
});

// ---------- GGG client ----------
test('GGG client counts calls, enforces daily budget, never sends session to trade', async () => {
  const usage = new JsonStore(path.join(tmp(), 'u.json'));
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url, cookie: opts.headers.Cookie });
    return { status: 200, ok: true, headers: new Map(), json: async () => ({ id: 'q1', result: ['a'], tabs: [{ i: 0, n: 'Cur', id: 'x', type: 'CurrencyStash' }], items: [] }) };
  };
  const ggg = new GggClient({ cache: new DiskCache(tmp()), fetchImpl, userAgent: 't', usage, dailyBudget: 2, getSessionId: () => 'sid', getAccountName: () => 'Me#1234', limiter: new RateLimiter({ sleep: async () => {} }) });
  await ggg.tradeSearch('Test', { query: {} });
  assert.equal(seen[0].cookie, undefined);
  const tabs = await ggg.stashTabs('Test');
  assert.equal(tabs[0].name, 'Cur');
  assert.equal(seen[1].cookie, 'POESESSID=sid');
  assert.match(seen[1].url, /accountName=Me%231234/);
  await ggg.stashTabs('Test'); // cached
  assert.equal(seen.length, 2);
  await assert.rejects(ggg.tradeSearch('Test', {}), BudgetExceededError);
});

test('trade picker: every mod listed, pseudo totals, min/max in item terms, instant buyout', () => {
  const { defaultProps, statRange } = require('../src/core/trade');
  const it = parseItem(F.rare);
  const mods = matchItemMods(STATS, it);
  // every line of the item is there, plus totals
  assert.equal(mods.filter((m) => m.group !== 'pseudo').length, 6, '1 implicit + 4 explicit + 1 crafted');
  const pseudo = Object.fromEntries(mods.filter((m) => m.group === 'pseudo').map((m) => [m.pseudo, m]));
  assert.equal(pseudo.ele.display, 14 * 2 + 38, 'cold+lightning counts twice, plus fire');
  assert.equal(pseudo.all.display, 14 * 2 + 38 + 12, 'plus chaos');
  assert.equal(pseudo.life, undefined, 'one life line: no separate total');
  // defaults: 3 resistance lines -> search the total resistance, not each line
  assert.equal(pseudo.all.enabled, true);
  assert.equal(pseudo.ele.enabled, false, 'not both totals');
  assert.equal(mods.find((m) => /Fire Resistance/.test(m.text)).enabled, false);
  assert.equal(mods.find((m) => /maximum Life/.test(m.text) && m.group === 'explicit').enabled, true);
  assert.equal(mods.find((m) => m.group === 'crafted').enabled, false, 'crafted mods start unticked');
  // "5% reduced Mana Cost": the player types 4..8 as shown on the item; trade stores it as increased -8..-4
  const mana = mods.find((m) => /Mana Cost/.test(m.text));
  assert.equal(mana.display, 5);
  assert.deepEqual(statRange({ ...mana, min: 4, max: 8 }), { min: -8, max: -4 });
  // min and max end up in the query
  const life = mods.find((m) => /maximum Life/.test(m.text) && m.group === 'explicit');
  life.min = 40; life.max = 60;
  const props = defaultProps(it);
  props.base.on = false; props.ilvl.on = true; props.ilvl.min = 82; props.ilvl.max = 86;
  const q = buildQuery(it, mods, { props });
  assert.equal(q.query.status.option, 'securable', 'instant buyout by default');
  assert.equal(q.query.type, undefined, 'any base');
  assert.equal(q.query.filters.type_filters.filters.category.option, 'accessory.ring');
  assert.equal(q.query.filters.type_filters.filters.rarity.option, 'nonunique');
  assert.deepEqual(q.query.filters.misc_filters.filters.ilvl, { min: 82, max: 86 });
  assert.deepEqual(q.query.stats[0].filters.find((f) => f.id === 'explicit.stat_life').value, { min: 40, max: 60 });
  assert.ok(q.query.stats[0].filters.some((f) => f.id === 'pseudo.pseudo_total_resistance'));
  assert.equal(buildQuery(it, mods, { props, status: 'available' }).query.status.option, 'available');
});

test('currency exchange: lifeforce priced from the exchange list, ids without names, divine-quoted rates', async () => {
  const { slugify } = require('../src/core/ninja');
  assert.equal(slugify('Vivid Crystallised Lifeforce'), 'vivid-crystallised-lifeforce');
  // exchange list quoted in divines, items without names, rate as "chaos per divine"
  const ex = { core: { primary: 'divine', rates: { chaos: 340 }, items: [{ id: 'vivid-crystallised-lifeforce' }] }, lines: [{ id: 'vivid-crystallised-lifeforce', primaryValue: 0.001 }] };
  const a = parseExchange(ex);
  assert.equal(a[0].name, 'Vivid Crystallised Lifeforce');
  assert.ok(Math.abs(a[0].chaos - 0.34) < 1e-9);
  // same data with the rate the other way round ("divine per chaos")
  const b = parseExchange({ ...ex, core: { ...ex.core, rates: { chaos: 1 / 340 } } });
  assert.ok(Math.abs(b[0].chaos - 0.34) < 1e-9);

  // end to end: stash list lacks lifeforce, exchange list has it
  const counter = { n: 0 };
  const fetchImpl = async (url) => {
    counter.n++;
    const ok = (body) => ({ status: 200, ok: true, headers: new Map(), json: async () => body });
    if (url.includes('stash/current/currency/overview')) return ok({ lines: [{ currencyTypeName: 'Divine Orb', chaosEquivalent: 340 }] });
    if (url.includes('exchange/current/overview') && url.includes('type=Currency')) return ok({ core: { primary: 'chaos', items: [{ id: 'vivid-crystallised-lifeforce', name: 'Vivid Crystallised Lifeforce' }] }, lines: [{ id: 'vivid-crystallised-lifeforce', primaryValue: 0.35, volumePrimaryValue: 900 }] });
    return { status: 404, ok: false, headers: new Map(), json: async () => ({}) };
  };
  const ninja = new NinjaClient({ cache: new DiskCache(tmp()), fetchImpl, userAgent: 't' });
  const pricer = new Pricer({ ninja, getLeague: async () => 'Test' });
  const r = await pricer.price(parseItem('Item Class: Stackable Currency\nRarity: Currency\nVivid Crystallised Lifeforce\n--------\nStack Size: 2,500/50,000'));
  assert.equal(r.found, true);
  assert.equal(r.chaos, 0.35);
  assert.equal(Math.round(r.totalChaos), 875);
  assert.equal((await pricer.price(parseItem(F.divineOrb))).chaos, 340, 'stash list still fills in');
});

test('reminder text is not a mod; negative mods start below their value', () => {
  const svalinn = `Item Class: Shields
Rarity: Unique
Svalinn
Girded Tower Shield
--------
Item Level: 85
--------
+20 to maximum Life
-10% to maximum Chance to Block Attack Damage
(Maximum Chance to Block Attack Damage cannot be raised above 90%)
Chance to Block is Lucky
(Lucky things are rolled twice and the best result used)
--------
Odin's shield.`;
  const it = parseItem(svalinn);
  assert.deepEqual(it.mods.explicit, ['+20 to maximum Life', '-10% to maximum Chance to Block Attack Damage', 'Chance to Block is Lucky']);
  const stats = { result: [{ id: 'explicit', entries: [{ id: 'explicit.stat_life', text: '+# to maximum Life', type: 'explicit' }, { id: 'explicit.stat_maxblock', text: '#% to maximum Chance to Block Attack Damage', type: 'explicit' }] }] };
  const block = matchItemMods(stats, it).find((m) => /maximum Chance to Block/.test(m.text));
  assert.equal(block.display, -10);
  assert.equal(block.min, -11, 'the item itself (-10) is inside the range');
});

test('one failed poe.ninja download does not break the ones after it, and is not retried at once', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes('type=Scarab')) return { status: 500, ok: false, headers: new Map(), json: async () => ({}) };
    return { status: 200, ok: true, headers: new Map(), json: async () => ({ core: { primary: 'chaos', items: [{ id: 'a', name: 'The Wolf' }] }, lines: [{ id: 'a', primaryValue: 30 }] }) };
  };
  const ninja = new NinjaClient({ cache: new DiskCache(tmp()), fetchImpl, userAgent: 't' });
  await assert.rejects(ninja.category('Test', 'Scarab'));
  const cards = await ninja.category('Test', 'DivinationCard');
  assert.equal(cards[0].chaos, 30, 'the next download still works');
  const before = calls;
  await assert.rejects(ninja.category('Test', 'Scarab'));
  assert.equal(calls, before, 'the failed list waits 5 minutes before it is tried again');
});

test('gems: description lines are not mods; trade uses level, quality and corruption', () => {
  const { parseItem } = require('../src/core/item-parser');
  const { matchItemMods, defaultProps, buildQuery } = require('../src/core/trade');
  const text = 'Item Class: Skill Gems\nRarity: Gem\nArmageddon Brand\n--------\nBrand, Spell, AoE, Duration, Fire\nLevel: 20 (Max)\nQuality: +20% (augmented)\n--------\nRequirements:\nLevel: 70\n--------\nCreates a magical brand which can attach to a nearby enemy.\n--------\nActivates every 1.5 seconds while Attached\nDeals 225 to 338 Fire Damage\n--------\nCorrupted';
  const item = parseItem(text);
  assert.equal(item.mods.explicit.length, 0);
  assert.deepEqual(matchItemMods({ result: [] }, item), []);
  const props = defaultProps(item);
  assert.equal(props.gemLevel.on, true);
  assert.equal(props.gemLevel.min, 20);
  assert.equal(props.quality.min, 20);
  assert.equal(props.corrupted, 'yes');
  const q = buildQuery(item, [], { props });
  const misc = q.query.filters.misc_filters.filters;
  assert.deepEqual(misc.gem_level, { min: 20 });
  assert.deepEqual(misc.quality, { min: 20 });
  assert.deepEqual(misc.corrupted, { option: 'true' });
  assert.equal(q.query.stats[0].filters.length, 0);
});

test('poe.ninja exchange: names and pictures come from the top-level items list', () => {
  const { parseExchange } = require('../src/core/ninja');
  const json = {
    core: { primary: 'chaos', items: [{ id: 'chaos', name: 'Chaos Orb' }, { id: 'divine', name: 'Divine Orb' }], rates: { divine: 0.005 } },
    items: [{ id: 'gemcutters-mercy', name: "Gemcutter's Mercy", image: '/gen/image/abc/Mercy.png' }],
    lines: [{ id: 'gemcutters-mercy', primaryValue: 12 }],
  };
  const [x] = parseExchange(json);
  assert.equal(x.name, "Gemcutter's Mercy");
  assert.equal(x.guessed, false);
  assert.equal(x.icon, 'https://web.poecdn.com/gen/image/abc/Mercy.png');
});

test('advanced copy (Ctrl+Alt+C): lines under an implicit header are implicit mods', () => {
  const it = require('../src/core/item-parser').parseItem([
    'Item Class: Rings', 'Rarity: Rare', 'Viper Nail', 'Paua Ring', '--------', 'Item Level: 83', '--------',
    '{ Corruption Implicit Modifier }', '+1 to Maximum Frenzy Charges', '--------',
    '{ Prefix Modifier "Sanguine" (Tier: 6) — Life }', '+39(25-39) to maximum Life',
    '{ Suffix Modifier "of the Ranger" (Tier: 1) — Attack }', '+441(351-480) to Accuracy Rating', '--------', 'Corrupted',
  ].join('\n'));
  assert.deepEqual(it.mods.implicit, ['+1 to Maximum Frenzy Charges']);
  assert.deepEqual(it.mods.explicit, ['+39 to maximum Life', '+441 to Accuracy Rating']);
});

test('tier names are readable words, never glued ids', () => {
  const { tierName } = require('../src/renderer/tier-names');
  assert.equal(tierName({ tier: 'fourlinkedrares' }), '4-link rares');
  assert.equal(tierName({ tier: 't2divine', type: 'currency' }), 'Tier 2');
  assert.equal(tierName({ tier: 't1', type: 'uniques' }), 'S tier');
  assert.equal(tierName({ tier: 'n12_i84_t1' }), '12 passives, item level 84+: top');
  assert.equal(tierName({ tier: 'threesocketedgear' }), '3-socket gear');
  assert.equal(tierName({ tier: 'corruptedmaphider' }), 'Corrupted maps');
});

test('trade: a mod the trade site writes in the singular still matches (Mageblood)', () => {
  const { matchItemMods } = require('../src/core/trade');
  const stats = { result: [{ id: 'explicit', entries: [{ id: 'explicit.stat_2388347909', text: 'Leftmost # Magic Utility Flask constantly applies its Flask Effect to you', type: 'explicit' }] }] };
  const item = parseItem(['Item Class: Belts', 'Rarity: Unique', 'Mageblood', 'Heavy Belt', '--------', 'Item Level: 86', '--------',
    'Leftmost 4 Magic Utility Flasks constantly apply their Flask Effects to you'].join('\n'));
  const m = matchItemMods(stats, item).find((x) => /Leftmost/.test(x.text));
  assert.equal(m.id, 'explicit.stat_2388347909');
  assert.equal(m.value, 4);
  assert.equal(m.enabled, true, 'ticked: the number of flasks sets the price');
  assert.equal(m.min, 4);
});

test('trade: Forbidden Shako supports match the trade site\'s support stats, from your gem level', () => {
  const { matchItemMods } = require('../src/core/trade');
  const stats = { result: [{ id: 'explicit', entries: [
    { id: 'explicit.stat_1384629003', text: 'Socketed Gems are Supported by Level # Ice Bite', type: 'explicit' },
    { id: 'explicit.indexable_support_73', text: 'Socketed Gems are Supported by Level # Ice Bite', type: 'explicit' },
  ] }] };
  const item = parseItem(['Item Class: Helmets', 'Rarity: Unique', 'Forbidden Shako', 'Great Crown', '--------', 'Item Level: 85', '--------',
    '{ Unique Modifier — Gem }', 'Socketed Gems are Supported by Level 30 Ice Bite(Greater Multiple Projectiles-Hallow)', '+27(10-30) to all Attributes'].join('\n'));
  assert.ok(item.mods.explicit.includes('Socketed Gems are Supported by Level 30 Ice Bite'));
  const m = matchItemMods(stats, item).find((x) => /Ice Bite/.test(x.text));
  assert.equal(m.id, 'explicit.indexable_support_73');
  assert.equal(m.enabled, true);
  assert.equal(m.min, 30);
});

test('maps: the tier comes from the base name when the copy has no Map Tier line', () => {
  const it = parseItem(['Item Class: Maps', 'Rarity: Rare', 'Torture Bearings', 'Map (Tier 16)', '--------', 'Item Level: 85', '--------', 'Players have Elemental Weakness'].join('\n'));
  assert.equal(it.mapTier, 16);
  assert.equal(it.baseType, 'Map (Tier 16)');
});

test('unidentified map: no help text as a mod, only implicits, searched as unidentified', () => {
  const { matchItemMods, buildQuery, defaultProps } = require('../src/core/trade');
  const item = parseItem(['Item Class: Maps', 'Rarity: Rare', 'Map (Tier 16)', '--------', 'Monster Level: 83', '--------', 'Item Level: 83', '--------',
    "Map contains Al-Hezmin's Citadel (implicit)", '--------', 'Unidentified', '--------',
    'Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.'].join('\n'));
  assert.equal(item.flags.unidentified, true);
  assert.deepEqual(item.mods.explicit, []);
  const stats = { result: [{ id: 'implicit', entries: [{ id: 'implicit.stat_x', text: "Map contains Al-Hezmin's Citadel", type: 'implicit' }] }] };
  const mods = matchItemMods(stats, item);
  assert.ok(mods.every((m) => m.group === 'implicit'));
  if (typeof defaultProps === 'function' && typeof buildQuery === 'function') {
    const props = defaultProps(item);
    assert.equal(props.identified, 'no');
    const q = buildQuery(item, mods, { props });
    assert.deepEqual(q.query.filters.misc_filters?.filters?.identified, { option: 'false' });
  }
});

test('every source file parses (a syntax error in one page script blanks the whole app)', () => {
  const { execFileSync } = require('child_process');
  const dirs = ['src', 'src/main', 'src/core', 'src/core/filter', 'src/renderer'];
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(__dirname, '..', d)).filter((x) => x.endsWith('.js'))) {
      execFileSync(process.execPath, ['--check', path.join(__dirname, '..', d, f)]);
    }
  }
});

test('filter: HasExplicitMod >=8 "a" "e"... counts the item\'s mods (corrupted 8-mod maps)', () => {
  const { parse } = require('../src/core/filter/parser');
  const doc = parse([
    'Show # $type->maps->corruptedspecial $tier->mod8',
    '\tCorrupted True', '\tIdentified True', '\tClass == "Maps"', '\tHasExplicitMod >=8 "a" "e" "i" "o" "u" "y"', '\tSetTextColor 145 30 220 255', '',
    'Show # $type->maps $tier->maps_a_t16', '\tMapTier >= 16', '\tClass == "Maps"', '\tSetTextColor 0 0 0 255', ''].join('\n'));
  const lines = ['Monsters deal 90% extra Physical Damage as Fire', 'Monsters have 300% increased Critical Strike Chance', 'Players have 40% less Recovery Rate of Life and Energy Shield',
    'Monsters reflect 18% of Elemental Damage', 'Area has patches of burning ground', '+40% Monster Physical Damage Reduction', 'Monsters are Hexproof', 'Players are Cursed with Elemental Weakness'];
  const map = parseItem(['Item Class: Maps', 'Rarity: Rare', 'Iron Lands', 'Map (Tier 16)', '--------', 'Item Quantity: +104% (augmented)', '--------', 'Item Level: 83', '--------', ...lines, '--------', 'Corrupted'].join('\n'));
  assert.match(explain(doc, map).line ? String(explain(doc, map).chain?.map((c) => c.comment).join(' ') || '') : '', /mod8/);
  const seven = parseItem(['Item Class: Maps', 'Rarity: Rare', 'Iron Lands', 'Map (Tier 16)', '--------', 'Item Level: 83', '--------', ...lines.slice(0, 7), '--------', 'Corrupted'].join('\n'));
  assert.doesNotMatch(String(explain(doc, seven).chain?.map((c) => c.comment).join(' ') || ''), /mod8/);
});

test('game sounds: names, setup table and a synthetic FSB5 bank', () => {
  const G = require('../src/core/game-sounds');
  assert.equal(G.soundIdOf('AlertSound_06'), '6');
  assert.equal(G.soundIdOf('SH22Divine'), 'ShDivine');
  assert.equal(G.soundIdOf('Loop_3'), null);
  const setups = G.loadSetups(path.join(__dirname, '..', 'assets', 'game-sounds', 'vorbis-setups.bin'));
  assert.ok(setups.has(0xbec759ec) && setups.has(0x5d041107), 'the setups ItemFilter.bank uses');
  assert.equal(setups.get(0xbec759ec)[0], 5, 'a Vorbis setup packet');
  // one stereo 44.1 kHz sample, 1000 samples long, with a Vorbis chunk naming its setup
  const raw = (1n) | (8n << 1n) | (1n << 5n) | (0n << 6n) | (1000n << 34n);
  const head = Buffer.alloc(8 + 4 + 4); head.writeBigUInt64LE(raw, 0); head.writeUInt32LE((0) | (4 << 1) | (11 << 25), 8); head.writeUInt32LE(0xbec759ec, 12);
  const names = Buffer.concat([Buffer.from([4, 0, 0, 0]), Buffer.from('AlertSound_06\0', 'latin1')]);
  const data = Buffer.concat([Buffer.from([3, 0, 0, 1, 2]), Buffer.from([0, 0])]);
  const fsb = Buffer.alloc(60); fsb.write('FSB5', 0, 'latin1'); fsb.writeUInt32LE(1, 4); fsb.writeUInt32LE(1, 8); fsb.writeUInt32LE(head.length, 12); fsb.writeUInt32LE(names.length, 16); fsb.writeUInt32LE(data.length, 20); fsb.writeUInt32LE(15, 24);
  const s = G.readFsb5(Buffer.concat([Buffer.from('RIFF....FEV '), fsb, head, names, data]))[0];
  assert.deepEqual([s.name, s.rate, s.channels, s.samples, s.setupId], ['AlertSound_06', 44100, 2, 1000, 0xbec759ec]);
  const ogg = G.toOgg(s, setups);
  assert.equal(ogg.toString('latin1', 0, 4), 'OggS');
  // every page's checksum is right
  for (let o = 0; o < ogg.length;) {
    const segs = ogg[o + 26]; let len = 27 + segs; for (let i = 0; i < segs; i++) len += ogg[o + 27 + i];
    const page = Buffer.from(ogg.subarray(o, o + len)); const crc = page.readUInt32LE(22); page.writeUInt32LE(0, 22);
    assert.equal(G.oggCrc(page), crc); o += len;
  }
});
