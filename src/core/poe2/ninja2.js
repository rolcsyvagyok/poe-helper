'use strict';
/* Path of Exile 2 prices from poe.ninja (poe.ninja/poe2/api/economy). Few requests: each list is fetched once an
   hour at most (poe.ninja refreshes PoE2 prices about hourly), and only the lists an item needs.
   Prices are kept in Exalted Orbs; a Divine Orb's worth in exalted comes with the currency list. */

const BASE = 'https://poe.ninja/poe2/api/economy';
const TTL = 60 * 60 * 1000;

// the exchange lists (currency and other stackables) and the item lists (uniques)
const EXCHANGE_TYPES = ['Currency', 'Fragments', 'Abyss', 'UncutGems', 'LineageSupportGems', 'Essences', 'SoulCores', 'Idols', 'Runes', 'Ritual', 'Expedition', 'Delirium', 'Breach', 'Verisium'];
const UNIQUE_TYPES = ['UniqueWeapons', 'UniqueArmours', 'UniqueAccessories', 'UniqueFlasks', 'UniqueCharms', 'UniqueJewels', 'UniqueSanctumRelics', 'UniqueTablets', 'PrecursorTablets'];

// which exchange list an item class is on (the rest: tried in this order)
function exchangeTypesFor(item) {
  const c = String(item.itemClass || '').toLowerCase();
  const n = String(item.typeLine || item.baseType || item.name || '');
  if (/omen/i.test(n)) return ['Ritual', 'Currency'];
  if (/^essence|essence of/i.test(n)) return ['Essences', 'Currency'];
  if (/catalyst/i.test(n)) return ['Breach', 'Currency'];
  if (/liquid|distilled|diluted|concentrated/i.test(n)) return ['Delirium', 'Currency'];
  if (/soul core/i.test(n)) return ['SoulCores', 'Currency'];
  if (/\brune\b/i.test(n) || /socketable|rune/.test(c)) return ['Runes', 'SoulCores', 'Idols', 'Currency'];
  if (/idol/i.test(n)) return ['Idols', 'Currency'];
  if (/uncut .* gem/i.test(n)) return ['UncutGems'];
  if (/support gem|lineage/i.test(c) || /lineage/i.test(n)) return ['LineageSupportGems'];
  if (/fragment|splinter|key|crest|simulacrum|tablet/i.test(c + ' ' + n)) return ['Fragments', 'Breach', 'Abyss', 'Currency'];
  if (/expedition|artifact|logbook|exotic coinage|broken circle|sun artifact|order artifact|black scythe/i.test(n)) return ['Expedition', 'Currency'];
  return ['Currency', 'Fragments', 'Abyss', 'Ritual', 'Breach', 'Delirium', 'Essences', 'Runes', 'SoulCores', 'Idols', 'Expedition', 'Verisium'];
}

const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();

/**
 * createNinja2({ fetchImpl, cache, userAgent, log }) -> { price(item, league), divineInEx(league), leagues() }
 * cache: JsonStore-like { isFresh(key, ms), get(key) -> { data }, set(key, data) }
 */
function createNinja2({ fetchImpl, cache, userAgent = 'poe-helper', log = () => {} }) {
  const doFetch = fetchImpl || globalThis.fetch;
  const inFlight = new Map();
  async function getJson(path, key) {
    if (cache?.isFresh(key, TTL)) return cache.get(key).data;
    if (inFlight.has(key)) return inFlight.get(key);
    const p = (async () => {
      try {
        const r = await doFetch(`${BASE}/${path}`, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
        if (!r.ok) throw new Error(`poe.ninja ${r.status}`);
        const j = await r.json();
        cache?.set(key, j);
        return j;
      } catch (e) {
        const stale = cache?.get(key);
        if (stale) return stale.data;
        throw e;
      } finally { inFlight.delete(key); }
    })();
    inFlight.set(key, p);
    return p;
  }
  const exchange = (league, type) => getJson(`exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`, `ninja2_ex_${league}_${type}`);
  const items = (league, type) => getJson(`stash/current/item/overview?league=${encodeURIComponent(league)}&type=${type}`, `ninja2_it_${league}_${type}`);

  // an exchange list's value in Exalted Orbs: primaryValue is in the list's main currency; rates says how many of
  // another currency one of it is worth
  function exValue(list, line) {
    const core = list?.core || {};
    const v = Number(line?.primaryValue);
    if (!Number.isFinite(v)) return null;
    if (!core.primary || core.primary === 'exalted') return v;
    const r = Number(core.rates?.exalted);
    return Number.isFinite(r) && r > 0 ? v * r : null;
  }
  // a Divine Orb in Exalted Orbs
  async function divineInEx(league) {
    try {
      const list = await exchange(league, 'Currency');
      const core = list?.core || {};
      if (core.primary === 'divine' && Number(core.rates?.exalted) > 0) return Number(core.rates.exalted);
      const line = (list?.lines || []).find((l) => l.id === 'divine');
      return line ? exValue(list, line) : null;
    } catch (e) { log('poe.ninja poe2', e.message); return null; }
  }

  async function priceStackable(item, league) {
    const want = norm(item.typeLine || item.baseType || item.name);
    for (const type of exchangeTypesFor(item)) {
      let list;
      try { list = await exchange(league, type); } catch (e) { log('poe.ninja poe2', type, e.message); continue; }
      const named = [...(list?.core?.items || []), ...(list?.items || [])];
      const meta = named.find((x) => norm(x.name) === want);
      if (!meta) continue;
      const line = (list?.lines || []).find((l) => l.id === meta.id) || (list?.core?.primary === meta.id ? { id: meta.id, primaryValue: 1 } : null);
      const ex = line ? exValue(list, line) : null;
      if (ex == null) continue;
      return { ex, source: 'poe.ninja', list: type, volume: line.volumePrimaryValue ?? null, detailsId: meta.detailsId || null };
    }
    return null;
  }

  async function priceUnique(item, league) {
    const name = norm(item.name);
    const base = norm(item.baseType || item.typeLine);
    const hits = [];
    for (const type of UNIQUE_TYPES) {
      let list;
      try { list = await items(league, type); } catch (e) { log('poe.ninja poe2', type, e.message); continue; }
      for (const l of list?.lines || []) if (norm(l.name) === name && (!base || !l.baseType || norm(l.baseType) === base)) hits.push(l);
      if (hits.length) break;
    }
    if (!hits.length) return null;
    // corrupted copies apart, when there are both
    const corr = !!item.flags?.corrupted;
    const same = hits.filter((l) => l.corrupted == null || !!l.corrupted === corr);
    const pool = same.length ? same : hits;
    const val = (l) => (l.exaltedValue != null ? Number(l.exaltedValue) : Number(l.primaryValue));
    const vals = pool.map(val).filter(Number.isFinite).sort((a, b) => a - b);
    if (!vals.length) return null;
    return { ex: vals[0], high: vals.length > 1 ? vals[vals.length - 1] : null, versions: pool.length, source: 'poe.ninja', listings: pool.reduce((n, l) => n + (l.listingCount || 0), 0) || null };
  }

  /** { ex, divineInEx, ... } or null when poe.ninja doesn't list it (rares and the like: the trade search prices those) */
  async function price(item, league) {
    if (!league) return null;
    const kind = String(item.rarity || '').toLowerCase();
    let p = null;
    if (kind === 'unique') p = await priceUnique(item, league);
    else if (kind === 'currency' || /^(Stackable Currency|Socketable|Omens?|Essences?|Map Fragments|Soul Cores?|Runes?|Idols?|Uncut .* Gems|Catalysts?|Splinters?|Augment)$/i.test(item.itemClass || '')) p = await priceStackable(item, league);
    if (!p) return null;
    const div = await divineInEx(league);
    return { ...p, divineInEx: div };
  }

  /**
   * One poe.ninja list as plain rows for the Loot filter's tiers: [{ name, baseType, chaos, listingCount }],
   * where "chaos" holds the price in Exalted Orbs (PoE2's small unit).
   */
  async function rows(league, type) {
    if (UNIQUE_TYPES.includes(type)) {
      const list = await items(league, type);
      return (list?.lines || []).map((l) => ({ name: l.name, baseType: l.baseType || null, chaos: l.exaltedValue != null ? Number(l.exaltedValue) : Number(l.primaryValue), listingCount: l.listingCount ?? null }))
        .filter((r) => r.name && Number.isFinite(r.chaos));
    }
    const list = await exchange(league, type);
    const byId = new Map([...(list?.core?.items || []), ...(list?.items || [])].map((x) => [x.id, x]));
    const out = [];
    for (const l of list?.lines || []) {
      const meta = byId.get(l.id);
      const ex = exValue(list, l);
      if (meta?.name && ex != null) out.push({ name: meta.name, baseType: null, chaos: ex, listingCount: l.volumePrimaryValue != null ? Math.round(l.volumePrimaryValue) : null });
    }
    return out;
  }

  /**
   * PoE2 item pictures by name (GGG's image server), from the same cached poe.ninja lists: { name: url }.
   * Only the lists a name could be in are read (exchangeTypesFor; uniques from the unique lists).
   */
  async function art(league, names, { uniques = false } = {}) {
    const out = {};
    const want = new Set(names.filter(Boolean));
    const abs = (u) => (!u ? null : String(u).startsWith('/') ? `https://web.poecdn.com${u}` : String(u));
    const lists = new Set();
    for (const n of want) for (const t of exchangeTypesFor({ typeLine: n })) lists.add(t);
    for (const type of [...lists, ...(uniques ? UNIQUE_TYPES : [])]) {
      if (![...want].some((n) => !out[n])) break;
      try {
        if (UNIQUE_TYPES.includes(type)) {
          for (const l of (await items(league, type))?.lines || []) if (want.has(l.name) && !out[l.name] && l.icon) out[l.name] = abs(l.icon);
        } else {
          const list = await exchange(league, type);
          for (const x of [...(list?.core?.items || []), ...(list?.items || [])]) if (want.has(x.name) && !out[x.name] && (x.image || x.icon)) out[x.name] = abs(x.image || x.icon);
        }
      } catch (e) { log('poe.ninja poe2 art', type, e.message); }
    }
    return out;
  }

  /**
   * One list for "What to farm": [{ name, chaos (in exalted), icon, volume, listingCount, sparkline }], the same shape
   * as the PoE1 poe.ninja lists, so the page's grouping and 7-day trends work on it.
   */
  async function farmRows(league, type) {
    const abs = (u) => (!u ? null : String(u).startsWith('/') ? `https://web.poecdn.com${u}` : String(u));
    const spark = (l) => { const s = l.sparkline || l.sparkLine || l.lowConfidenceSparkline || l.lowConfidenceSparkLine; return s && Array.isArray(s.data) ? s : null; };
    if (UNIQUE_TYPES.includes(type)) {
      const list = await items(league, type);
      return (list?.lines || []).map((l) => ({ name: l.name, chaos: l.exaltedValue != null ? Number(l.exaltedValue) : Number(l.primaryValue), icon: abs(l.icon), volume: null, listingCount: l.listingCount ?? null, sparkline: spark(l), variant: l.variant || null }))
        .filter((r) => r.name && Number.isFinite(r.chaos));
    }
    const list = await exchange(league, type);
    const byId = new Map([...(list?.core?.items || []), ...(list?.items || [])].map((x) => [x.id, x]));
    const out = [];
    for (const l of list?.lines || []) {
      const meta = byId.get(l.id);
      const ex = exValue(list, l);
      if (!meta?.name || ex == null) continue;
      out.push({ name: meta.name, chaos: ex, icon: abs(meta.image || meta.icon), volume: l.volumePrimaryValue != null ? Math.round(Number(l.volumePrimaryValue)) : null, listingCount: null, sparkline: spark(l) });
    }
    return out;
  }

  return { price, divineInEx, exchange, items, rows, art, farmRows };
}

/** The poe.ninja lists that price a NeverSink PoE2 filter category ("currency->omen" -> Ritual). */
function listsForType2(type) {
  const [g, ...rest] = String(type).split('->');
  const sub = rest.join('->');
  if (g === 'uniques') return sub ? [] : UNIQUE_TYPES;
  if (g === 'currency') {
    const map = { omen: ['Ritual'], essence: ['Essences'], emotions: ['Delirium'], catalysts: ['Breach'], splinter: ['Breach', 'Fragments', 'Delirium'] };
    return map[sub] || ['Currency'];
  }
  if (g === 'fragments') return ['Fragments', 'Abyss', 'Breach'];
  if (g === 'gems') return sub === 'uncut' ? ['UncutGems'] : sub === 'lineage' ? ['LineageSupportGems'] : [];
  if (g === 'sockets') return ['Runes', 'SoulCores', 'Idols'];
  if (g === 'verisium') return ['Verisium'];
  if (g === 'xenotiering') return ['Abyss'];
  if (g === 'expedition') return ['Expedition'];
  return [];
}

module.exports = { createNinja2, exchangeTypesFor, listsForType2, EXCHANGE_TYPES, UNIQUE_TYPES };
