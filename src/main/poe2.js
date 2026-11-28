'use strict';
/* Path of Exile 2: the price check only. The same popup and trade panel as PoE1; here the item is read as a PoE2
   item, priced from poe.ninja's PoE2 lists, and searched on the PoE2 trade site (/trade2). GGG requests are the
   same few as for PoE1: the stat and item lists (cached a week), and a search only when you press Search. */

const T2 = require('../core/poe2/trade2');
const { createNinja2 } = require('../core/poe2/ninja2');

function createPoe2({ ggg2, settings, cache, fetchImpl, userAgent, log = () => {}, filterInfo = null }) {
  const ninja2 = createNinja2({ fetchImpl, cache, userAgent, log });

  // ---------- league ----------
  // the trade site's PoE2 leagues; yours from Settings, else the running challenge league (not Standard / Hardcore)
  async function leagues() {
    try { return (await ggg2.leagues()).map((l) => ({ id: l.id, text: l.text || l.id })); } catch (e) { log('poe2 leagues', e.message); return []; }
  }
  async function getLeague() {
    const own = settings.get('league2');
    if (own) return own;
    const list = await leagues();
    const pick = list.find((l) => !/^(standard|hardcore)$|\bhc\b|hardcore|ssf|solo/i.test(l.id)) || list[0];
    return pick?.id || 'Standard';
  }

  // ---------- items ----------
  let basesCache = null;
  async function bases() {
    if (basesCache) return basesCache;
    try { basesCache = T2.baseNames(await ggg2.tradeItems()); } catch (e) { log('poe2 item list', e.message); basesCache = []; }
    return basesCache;
  }
  async function readItem(text) { return T2.parseItem2(text, { bases: await bases() }); }
  // currency and other stackables (by item class, not the name: "Runeforged Sekhema Sandals" are boots)
  const isStackable = (item) => item.rarity === 'Currency' || /^(Stackable Currency|Socketable|Omen|Omens|Essences?|Map Fragments|Soul Cores?|Runes?|Idols?|Uncut .* Gems|Catalysts?|Splinters?|Augment)$/i.test(item.itemClass || '');

  // ---------- the popup ----------
  async function priceText(text) {
    const item = await readItem(text);
    if (!item) return { error: 'Clipboard does not contain a Path of Exile 2 item.' };
    const league = await getLeague();
    let p = null;
    try { p = await ninja2.price(item, league); } catch (e) { log('poe2 price', e.message); }
    const stack = item.stack?.current || 1;
    const divine = p?.divineInEx || (await ninja2.divineInEx(league).catch(() => null));
    const price = p ? { found: true, chaos: round(p.ex), divine, confidence: p.versions > 1 ? 'range' : p.listings != null && p.listings < 5 ? 'low' : 'high', stackSize: stack, totalChaos: round(p.ex * stack), range: p.high != null ? [round(p.ex), round(p.high)] : null, source: 'poe.ninja' } : { found: false, divine };
    const stackable = isStackable(item) && item.rarity !== 'Unique';
    const kind = item.rarity === 'Unique' ? 'unique' : stackable ? 'currency' : String(item.rarity || '').toLowerCase();
    const tradeable = !stackable;
    const weapon = /^weapon\./.test(item.category || '') ? T2.weaponDps2(item) : null;
    const entry = { at: Date.now(), name: item.name !== item.typeLine && item.name ? `${item.name} ${item.typeLine}` : item.typeLine, kind, chaos: price.chaos ?? null, total: price.totalChaos ?? null, game: 'poe2' };
    settings.set('history2', [entry, ...(settings.get('history2') || [])].slice(0, 100));
    return {
      game: 'poe2', units: { small: 'ex', big: 'div', smallName: 'exalted' },
      item, price, kind, tradeable, bulk: stackable, autoBulk: stackable && !p,
      weapon: weapon ? { phys: weapon.pdps, ele: weapon.edps, chaos: weapon.cdps, total: weapon.dps, aps: weapon.aps } : null,
      ...(filterInfo ? filterInfo(item) : { filterHit: null, filterWhere: null }), tierInfo: null, baseRank: null, collection: null,
    };
  }

  // ---------- the trade panel ----------
  let statsRetryAt = 0;
  async function tradePrepare(text) {
    const item = await readItem(text);
    if (!item) throw new Error('Not an item.');
    let stats = await ggg2.tradeStats();
    const tol = settings.get('tradeTolerance') ?? 0.1;
    let r = T2.prepareSearch2(stats, item, { tolerance: tol });
    // a mod the list doesn't know may be new: a list over a day old is fetched again (once an hour at most)
    if (r.mods.some((m) => m.unmatched) && Date.now() - statsRetryAt > 60 * 60 * 1000) {
      statsRetryAt = Date.now();
      const fresh = await ggg2.tradeStats({ maxAge: 24 * 60 * 60 * 1000 }).catch(() => stats);
      if (fresh !== stats) { stats = fresh; r = T2.prepareSearch2(stats, item, { tolerance: tol }); }
    }
    for (const m of r.mods) if (m.unmatched) log(`poe2 ${m.group} not matched`, JSON.stringify(m.text));
    const autoSearch = settings.get('tradeAutoSearch') !== false && item.rarity === 'Unique' && !item.flags?.unidentified;
    return { mods: r.mods, props: r.props, presets: null, kind: r.kind, autoSearch, uniqueChoices: null, status: settings.get('tradeStatus') || 'securable', game: 'poe2' };
  }
  async function rates(league) {
    const divineEx = await ninja2.divineInEx(league).catch(() => null);
    let chaosEx = null;
    try {
      const list = await ninja2.exchange(league, 'Currency');
      const core = list?.core || {};
      const r = Number(core.rates?.chaos), e = Number(core.rates?.exalted);
      if (r > 0) chaosEx = core.primary === 'exalted' ? 1 / r : e > 0 ? e / r : null;
    } catch { /* no chaos rate */ }
    return { divineEx, chaosEx };
  }
  function query(item, mods, props, opts) {
    return T2.buildQuery2(item, mods || [], props || {}, { status: opts?.status || settings.get('tradeStatus') || 'securable' });
  }
  async function tradeSiteUrl({ text, mods, props = null, opts = {} }) {
    const item = await readItem(text);
    if (!item) throw new Error('Not an item.');
    const league = await getLeague();
    const q = query(item, mods, props, opts);
    return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify({ query: q.query, sort: q.sort }))}`;
  }
  async function tradeSearch({ text, mods, props = null, opts = {} }) {
    const item = await readItem(text);
    if (!item) throw new Error('Not an item.');
    const league = await getLeague();
    const q = query(item, mods, props, opts);
    const res = await ggg2.tradeSearch(league, q, { maxWaitMs: 10000 }).catch((e) => {
      if (/Unknown item base type/i.test(e.message)) throw new Error(`The trade site doesn't list ${item.typeLine || 'this item'}.`);
      throw e;
    });
    const out = { url: ggg2.tradeUrl(league, res.id), total: res.total ?? res.result?.length ?? 0, listings: null };
    if ((opts.fetchListings ?? settings.get('tradeFetchListings') ?? true) && res.result?.length) {
      const first = await ggg2.tradeFetch(res.id, res.result.slice(0, 10));
      out.listings = T2.summarizeListings2(first, { ...(await rates(league)), me: settings.get('accountName') || '' });
    }
    return out;
  }
  async function tradeBulk({ text, status } = {}) {
    const item = await readItem(text);
    if (!item) throw new Error('Not an item.');
    const name = item.typeLine || item.baseType || item.name;
    const tag = require('../core/price-filters').exchangeTag(await ggg2.tradeStatic(), name);
    if (!tag) return null;
    const league = await getLeague();
    const res = await ggg2.tradeExchange(league, T2.exchangeQuery2(tag, { status }), { maxWaitMs: 10000 });
    const rows = T2.exchangeListings2(res, { me: settings.get('accountName') || '' });
    return { tag, total: res.total ?? Object.keys(res.result || {}).length, url: ggg2.exchangeUrl(league, res.id), currencies: ['exalted', 'divine'], ...rows };
  }

  // ---------- the Loot filter page: a category's poe.ninja prices (in exalted) ----------
  async function tierPriceData(type) {
    const { listsForType2 } = require('../core/poe2/ninja2');
    const lists = listsForType2(type);
    if (!lists.length) return null;
    const league = await getLeague();
    const data = {};
    for (const l of lists) {
      try { data[l] = await ninja2.rows(league, l); } catch (e) { log('poe2 tier prices', l, e.message); }
    }
    return { league, data, divine: await ninja2.divineInEx(league).catch(() => null) };
  }

  // item pictures for PoE2 (its Divine Orb, not PoE1's): only GGG's image server
  async function art(names = []) {
    const plain = [];
    let uniques = false;
    for (const raw of names) {
      const [n, hint] = String(raw).split('\t');
      if (!n || n.startsWith('*')) continue;
      if (/^Unique/i.test(hint || '')) uniques = true;
      plain.push(n);
    }
    if (!plain.length) return {};
    const league = await getLeague();
    const m = await ninja2.art(league, plain, { uniques });
    return Object.fromEntries(Object.entries(m).filter(([, u]) => /^https:\/\/web\.poecdn\.com\//.test(u || '')));
  }

  return { art, tierPriceData, priceText, tradePrepare, tradeSiteUrl, tradeSearch, tradeBulk, getLeague, leagues, ninja2 };
}

const round = (x) => (x == null ? null : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100);

module.exports = { createPoe2 };
