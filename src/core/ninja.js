'use strict';
/**
 * poe.ninja economy client (PoE 1).
 *
 * Follows https://poe.ninja/docs/api usage guidelines:
 *  - only the documented economy endpoints
 *  - conditional requests (If-None-Match) with ETag
 *  - descriptive User-Agent
 *  - never poll faster than the data refreshes (~15 min for PoE 1); default TTL 20 min
 *  - categories are fetched lazily: a price check on a div card only loads DivinationCard
 *  - one request at a time, spaced out
 *
 * `baseUrl` is configurable so you can point this at your own caching proxy
 * (poe.ninja recommends that for apps with many users).
 */

const EXCHANGE_TYPES = [
  'Currency', 'Fragment', 'Runegraft', 'AllflameEmber', 'Tattoo', 'Omen', 'DjinnCoin', 'Ducat',
  'EnshroudingCrystal', 'DivinationCard', 'Artifact', 'Oil', 'DeliriumOrb', 'Scarab', 'Astrolabe',
  'Fossil', 'Resonator', 'Essence',
];

const ITEM_TYPES = [
  'Wombgift', 'Corpse', 'Incubator', 'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask',
  'UniqueJewel', 'ForbiddenJewel', 'ShrineBelt', 'UniqueTincture', 'UniqueRelic', 'SkillGem', 'ImbuedGem',
  'ClusterJewel', 'Map', 'BlightedMap', 'BlightRavagedMap', 'UniqueMap', 'ValdoMap', 'Invitation', 'Memory',
  'IncursionTemple', 'ScryingOrb', 'BaseType', 'Flask', 'Beast', 'Vial',
];

const DEFAULT_TTL = 20 * 60 * 1000;
const LEAGUES_TTL = 6 * 60 * 60 * 1000;
const MIN_SPACING_MS = 400;

function norm(s) {
  return String(s || '').toLowerCase().replace(/[’']/g, "'").trim();
}

/**
 * Exchange overview -> [{name, chaos, icon, volume, sparkline}]
 * Values are quoted in core.primary (chaos for PoE 1). If a league ever quotes
 * in something else, convert using core.rates.
 */
/** "Vivid Crystallised Lifeforce" -> "vivid-crystallised-lifeforce" (how poe.ninja ids look) */
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "vivid-crystallised-lifeforce" -> "Vivid Crystallised Lifeforce" (only when poe.ninja sends no name) */
function unslug(id) {
  return String(id).split(/[-_]/).filter(Boolean).map((w) => (/^(of|the|and|to)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
}

/**
 * Exchange overview -> [{name, slug, chaos, icon, volume, sparkline}]
 * Lines are joined with core.items by id. Values are quoted in core.primary; when that isn't
 * chaos, core.rates converts them. The docs don't say which way a rate points, so we use the
 * fact that the primary is always worth more than chaos: a chaos rate above 1 means
 * "chaos per primary", below 1 means "primary per chaos".
 */
function parseExchange(json) {
  const core = json.core || {};
  // core.items only holds the reference currencies (chaos, divine); every listed item's real name
  // and picture is in the top-level items list. Read both, top-level last so it wins.
  const byId = new Map();
  const add = (items) => {
    for (const it of Array.isArray(items) ? items : Object.entries(items || {}).map(([k, v]) => (v && typeof v === 'object' ? { id: v.id ?? k, ...v } : null))) {
      if (it && it.id != null) byId.set(String(it.id), it);
    }
  };
  add(core.items);
  add(json.items);
  const primary = String(core.primary || 'chaos').toLowerCase();
  let toChaos = 1;
  if (!primary.includes('chaos')) {
    const rates = core.rates || {};
    const chaosKey = Object.keys(rates).find((k) => k.toLowerCase().includes('chaos'));
    const r = chaosKey ? Number(rates[chaosKey]) : NaN;
    if (r > 0) toChaos = r >= 1 ? r : 1 / r;
    // Currency list fallback: the Chaos Orb line itself tells us how much one chaos is in primary units
    const chaosLine = (json.lines || []).find((l) => /chaos/.test(String(l.id)) && !/(shard|splinter|tainted|eldritch|veiled|harbinger)/.test(String(l.id)));
    if (!(r > 0) && chaosLine && Number(chaosLine.primaryValue) > 0) toChaos = 1 / Number(chaosLine.primaryValue);
  }
  const out = [];
  for (const l of json.lines || []) {
    const meta = byId.get(String(l.id)) || {};
    const slug = String(meta.detailsId || meta.id || l.id || '');
    const real = meta.name || meta.text || l.name || null;
    // a name rebuilt from the URL slug loses apostrophes ("gemcutters-mercy"), so it is only a guess
    const name = real || (slug ? unslug(slug) : null);
    if (!name || l.primaryValue == null) continue;
    out.push({
      name,
      guessed: !real,
      slug: slugify(slug),
      chaos: Number(l.primaryValue) * toChaos,
      icon: imageUrl(meta.icon || meta.image),
      volume: l.volumePrimaryValue ?? null,
      sparkline: l.sparkline || l.sparkLine || null,
    });
  }
  return out;
}

/**
 * poe.ninja's 7-day sparkline -> { change, old, now, points: [{ts, chaos}] }.
 * data[i] is the change in % since the start of the week; the last value present is today
 * (it equals totalChange). Returns null when there's nothing usable.
 */
function trendOf(sparkline, chaos, nowMs = Date.now()) {
  if (!sparkline || !Array.isArray(sparkline.data) || !(chaos > 0)) return null;
  const vals = sparkline.data.map((v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v)));
  let last = vals.length - 1;
  while (last >= 0 && vals[last] == null) last--;
  if (last < 0) return null;
  const change = Number.isFinite(Number(sparkline.totalChange)) ? Number(sparkline.totalChange) : vals[last];
  if (!(change > -100)) return null;
  const old = chaos / (1 + change / 100);
  const DAY = 86400000;
  const points = [{ ts: nowMs - (last + 1) * DAY, chaos: old }];
  vals.forEach((v, i) => { if (v != null && i <= last) points.push({ ts: nowMs - (last - i) * DAY, chaos: old * (1 + v / 100) }); });
  return { change: Math.round(change * 10) / 10, old, now: chaos, points };
}

/** A price change worth a look: doubled (+100% or more) or halved (-50% or more), on something worth at least 1c. */
function isBigChange(trend, { up = 100, down = -50, minChaos = 1 } = {}) {
  if (!trend) return false;
  if (Math.max(trend.old, trend.now) < minChaos) return false;
  return trend.change >= up || trend.change <= down;
}

/** poe.ninja gives pictures as "/gen/image/..." on GGG's image server. */
function imageUrl(p) {
  if (!p) return null;
  const s = String(p);
  return s.startsWith('/') ? `https://web.poecdn.com${s}` : s;
}

/** Stash currency overview (Currency/Fragment) -> same shape */
function parseCurrency(json) {
  const icons = new Map((json.currencyDetails || []).map((d) => [d.name, d.icon]));
  return (json.lines || []).map((l) => ({
    name: l.currencyTypeName,
    chaos: Number(l.chaosEquivalent) || 0,
    icon: icons.get(l.currencyTypeName) || null,
    volume: l.receive?.count ?? l.pay?.count ?? null,
    sparkline: l.receiveSparkLine || null,
  }));
}

/** Stash item overview -> keep the fields the pricer needs */
function parseItems(json) {
  return (json.lines || []).map((l) => ({
    name: l.name,
    baseType: l.baseType || null,
    chaos: Number(l.chaosValue) || 0,
    divine: l.divineValue ?? null,
    variant: l.variant || null,
    links: l.links || 0,
    gemLevel: l.gemLevel ?? null,
    gemQuality: l.gemQuality ?? null,
    corrupted: !!l.corrupted,
    mapTier: l.mapTier ?? null,
    levelRequired: l.levelRequired ?? null,
    itemClass: l.itemClass ?? null,
    listingCount: l.listingCount ?? l.count ?? 0,
    icon: l.icon || null,
    sparkline: l.sparkLine || null,
    detailsId: l.detailsId || null,
  }));
}

class NinjaClient {
  constructor({ cache, fetchImpl, userAgent, baseUrl = 'https://poe.ninja', ttlMs = DEFAULT_TTL, log = () => {} }) {
    this.cache = cache;
    this.fetch = fetchImpl || globalThis.fetch;
    this.userAgent = userAgent;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.ttlMs = Math.max(5 * 60 * 1000, ttlMs); // never below 5 minutes
    this.log = log;
    this.inflight = new Map();
    this.lastRequestAt = 0;
    this.chain = Promise.resolve();
    this.stats = { requests: 0, notModified: 0, cacheHits: 0, errors: 0 };
  }

  async _get(urlPath, cacheKey, ttl) {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < ttl) {
      this.stats.cacheHits++;
      return cached.data;
    }
    if (this.inflight.has(cacheKey)) return this.inflight.get(cacheKey);
    // A list that just failed (e.g. 404) isn't asked for again for 5 minutes.
    const failed = this.failedUntil?.get(cacheKey);
    if (failed && failed > Date.now()) throw new Error(`poe.ninja ${urlPath} failed recently`);

    // Requests run one after another. A failed request must not break the chain for the next ones.
    const p = this.chain.then(async () => {
      const gap = Date.now() - this.lastRequestAt;
      if (gap < MIN_SPACING_MS) await new Promise((r) => setTimeout(r, MIN_SPACING_MS - gap));
      this.lastRequestAt = Date.now();
      const headers = { 'User-Agent': this.userAgent, Accept: 'application/json' };
      if (cached?.etag) headers['If-None-Match'] = cached.etag;
      this.stats.requests++;
      try {
        const res = await this.fetch(this.baseUrl + urlPath, { headers });
        if (res.status === 304 && cached) {
          this.stats.notModified++;
          this.cache.touch(cacheKey);
          return cached.data;
        }
        if (!res.ok) throw new Error(`poe.ninja ${res.status} for ${urlPath}`);
        const json = await res.json();
        this.cache.set(cacheKey, json, { etag: res.headers.get('etag') });
        return json;
      } catch (err) {
        this.stats.errors++;
        this.log('ninja error', err.message);
        if (!this.failedUntil) this.failedUntil = new Map();
        this.failedUntil.set(cacheKey, Date.now() + 5 * 60 * 1000);
        if (cached) return cached.data; // stale data beats no data
        throw err;
      }
    });
    this.chain = p.catch(() => {});
    this.inflight.set(cacheKey, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  async leagues() {
    const data = await this._get('/poe1/api/economy/leagues', 'ninja_leagues', LEAGUES_TTL);
    return Array.isArray(data) ? data : data.leagues || [];
  }

  /** First entry is the current challenge league per poe.ninja docs. */
  async currentLeague() {
    const ls = await this.leagues();
    return ls[0]?.id || 'Standard';
  }

  async category(league, type) {
    const enc = encodeURIComponent(league);
    if (type === 'Currency' || type === 'Fragment') {
      // Both lists: the currency exchange has items the stash list lacks (lifeforce, new league
      // currency); the stash list fills the gaps. Exchange prices win when both have an item.
      let exchange = [];
      let stash = [];
      try {
        exchange = parseExchange(await this._get(`/poe1/api/economy/exchange/current/overview?league=${enc}&type=${type}`, `ninja_${league}_ex_${type}`, this.ttlMs));
      } catch (e) { this.log('exchange list failed', type, e.message); }
      try {
        stash = parseCurrency(await this._get(`/poe1/api/economy/stash/current/currency/overview?league=${enc}&type=${type}`, `ninja_${league}_cur_${type}`, this.ttlMs));
      } catch (e) { this.log('stash list failed', type, e.message); }
      if (!exchange.length && !stash.length) throw new Error(`poe.ninja has no ${type} prices right now`);
      // the exchange list may only give a URL slug; the stash list has the real spelling
      const key = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
      const real = new Map(stash.map((x) => [key(x.name), x.name]));
      exchange = exchange.map((x) => (x.guessed && real.has(key(x.name)) ? { ...x, name: real.get(key(x.name)), guessed: false } : x));
      const seen = new Set(exchange.map((x) => norm(x.name)));
      return [...exchange, ...stash.filter((x) => !seen.has(norm(x.name))).map((x) => ({ ...x, slug: slugify(x.name) }))];
    }
    if (EXCHANGE_TYPES.includes(type)) {
      const json = await this._get(`/poe1/api/economy/exchange/current/overview?league=${enc}&type=${type}`, `ninja_${league}_ex_${type}`, this.ttlMs);
      return parseExchange(json);
    }
    if (ITEM_TYPES.includes(type)) {
      const json = await this._get(`/poe1/api/economy/stash/current/item/overview?league=${enc}&type=${type}`, `ninja_${league}_item_${type}`, this.ttlMs);
      return parseItems(json);
    }
    throw new Error(`Unknown poe.ninja type ${type}`);
  }

  /**
   * name -> picture for every item poe.ninja knows in a category, also ones without a price right now
   * (the exchange lists them in its items list). Uses the same cached lists as category().
   */
  async icons(league, type) {
    const enc = encodeURIComponent(league);
    const out = new Map();
    const put = (name, icon) => { const u = imageUrl(icon); if (name && u && !out.has(name)) out.set(name, u); };
    if (EXCHANGE_TYPES.includes(type)) {
      const json = await this._get(`/poe1/api/economy/exchange/current/overview?league=${enc}&type=${type}`, `ninja_${league}_ex_${type}`, this.ttlMs);
      for (const it of [...(Array.isArray(json.items) ? json.items : Object.values(json.items || {})), ...(json.core?.items || [])]) put(it?.name || it?.text, it?.icon || it?.image);
    }
    if (type === 'Currency' || type === 'Fragment') {
      try {
        const json = await this._get(`/poe1/api/economy/stash/current/currency/overview?league=${enc}&type=${type}`, `ninja_${league}_cur_${type}`, this.ttlMs);
        for (const d of json.currencyDetails || []) put(d.name, d.icon);
      } catch { /* the exchange list is enough */ }
    } else if (ITEM_TYPES.includes(type)) {
      const json = await this._get(`/poe1/api/economy/stash/current/item/overview?league=${enc}&type=${type}`, `ninja_${league}_item_${type}`, this.ttlMs);
      for (const l of json.lines || []) put(l.name, l.icon);
    }
    return out;
  }

  /** Divine price in chaos, used for display conversions. */
  async divinePrice(league) {
    const cur = await this.category(league, 'Currency');
    return cur.find((c) => norm(c.name) === 'divine orb')?.chaos || null;
  }

  cachedAge(league, type) {
    const keys = [`ninja_${league}_cur_${type}`, `ninja_${league}_ex_${type}`, `ninja_${league}_item_${type}`];
    for (const k of keys) {
      const e = this.cache.get(k);
      if (e) return Date.now() - e.savedAt;
    }
    return null;
  }
}

module.exports = { trendOf, isBigChange, slugify, unslug, NinjaClient, parseExchange, parseCurrency, parseItems, EXCHANGE_TYPES, ITEM_TYPES, norm };
