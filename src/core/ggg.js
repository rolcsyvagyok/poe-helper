'use strict';
/**
 * Grinding Gear Games API client. Deliberately small surface:
 *
 *   stash      GET /character-window/get-stash-items   (POESESSID, net worth only, user-triggered or scheduled)
 *   character  GET /character-window/get-characters, get-items, get-passive-skills
 *                                                     (POESESSID, only when you save a Path of Building snapshot)
 *   tradeStats GET /api/trade/data/stats               (cached 7 days, only when you build a rare search)
 *   search     POST /api/trade/search/{league}         (only when you click "Search" in the overlay)
 *   fetch      GET /api/trade/fetch/{ids}?query={id}   (only if you ask for listings; max 10 per call)
 *
 * Leagues and prices come from poe.ninja, so normal price checks make ZERO calls to GGG.
 * Every call is counted, rate limited via GGG's headers, and blocked once the
 * daily budget is used up.
 */

const { RateLimiter } = require('./rate-limiter');

const WEB = 'https://www.pathofexile.com';
const STATS_TTL = 7 * 24 * 60 * 60 * 1000;
const TAB_LIST_TTL = 6 * 60 * 60 * 1000;

class BudgetExceededError extends Error {}
class AuthError extends Error {}

class GggClient {
  constructor({ cache, fetchImpl, userAgent, getSessionId, getAccountName, usage, dailyBudget = 300, limiter, log = () => {} }) {
    this.cache = cache;
    this.fetch = fetchImpl || globalThis.fetch;
    this.userAgent = userAgent;
    this.getSessionId = getSessionId || (() => null);
    this.getAccountName = getAccountName || (() => null);
    this.limiter = limiter || new RateLimiter({ safety: 0.5 });
    this.usage = usage; // JsonStore-like {get,set}
    this.dailyBudget = dailyBudget;
    this.log = log;
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  usageToday() {
    const u = this.usage?.get('gggUsage') || {};
    return u.date === this._today() ? u : { date: this._today(), total: 0, byKey: {} };
  }

  _count(key) {
    const u = this.usageToday();
    u.total++;
    u.byKey[key] = (u.byKey[key] || 0) + 1;
    this.usage?.set('gggUsage', u);
  }

  async _request(key, url, { method = 'GET', body, withSession = false } = {}) {
    if (this.usageToday().total >= this.dailyBudget) {
      throw new BudgetExceededError(`Daily GGG request budget (${this.dailyBudget}) reached. Change it in Settings if you really need more.`);
    }
    const headers = { 'User-Agent': this.userAgent, Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (withSession === 'optional') {
      // sent when you set one: the trade site allows bigger searches when you're logged in
      const sid = this.getSessionId();
      if (sid) headers.Cookie = `POESESSID=${sid}`;
    } else if (withSession) {
      const sid = this.getSessionId();
      if (!sid) throw new AuthError('POESESSID is not set. Add it in Settings to track stash value.');
      headers.Cookie = `POESESSID=${sid}`;
    }
    const res = await this.limiter.schedule(key, async () => {
      this._count(key);
      const r = await this.fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, headers: r.headers, response: r };
    });
    const r = res.response;
    if (r.status === 401 || r.status === 403) throw new AuthError(`GGG returned ${r.status}. Your POESESSID may have expired, or the account name is wrong.`);
    if (r.status === 429) throw new Error('Rate limited by GGG. The helper will wait automatically before the next request.');
    if (!r.ok) {
      // GGG says what it didn't like ({ error: { code, message } }); keep it in the error
      let msg = '';
      try { const j = await r.json(); msg = j?.error?.message || ''; } catch { /* no body */ }
      throw new Error(msg ? `The trade site said: ${msg} (GGG ${r.status} for ${key})` : `GGG ${r.status} for ${key}`);
    }
    return r.json();
  }

  // ---------- Stash (net worth) ----------

  _stashUrl(league, tabIndex, withTabs) {
    const acct = this.getAccountName();
    if (!acct) throw new AuthError('Account name (Name#1234) is not set in Settings.');
    const q = new URLSearchParams({ accountName: acct, realm: 'pc', league, tabs: withTabs ? '1' : '0', tabIndex: String(tabIndex) });
    return `${WEB}/character-window/get-stash-items?${q}`;
  }

  /**
   * Tab list. Cached for 6 hours because tabs rarely change. When we have to
   * fetch it we also get tab 0's items for free in the same response.
   */
  async stashTabs(league, { force = false } = {}) {
    const key = `ggg_tabs_${league}_${this.getAccountName()}`;
    if (!force && this.cache.isFresh(key, TAB_LIST_TTL)) return this.cache.get(key).data;
    const json = await this._request('stash', this._stashUrl(league, 0, true), { withSession: true });
    const tabs = (json.tabs || []).map((t) => ({ index: t.i, id: t.id, name: t.n, type: t.type, colour: t.colour, hidden: !!t.hidden }));
    this.cache.set(key, tabs);
    // Opportunistic: tab 0 items are in this response; keep them for the next snapshot.
    this.cache.set(`ggg_tab_${league}_0`, json.items || []);
    return tabs;
  }

  /** Items of one tab. `maxAgeMs` lets a snapshot reuse a very recent fetch instead of calling again. */
  async stashTabItems(league, tabIndex, { maxAgeMs = 0 } = {}) {
    const key = `ggg_tab_${league}_${tabIndex}`;
    if (maxAgeMs > 0 && this.cache.isFresh(key, maxAgeMs)) return this.cache.get(key).data;
    const json = await this._request('stash', this._stashUrl(league, tabIndex, false), { withSession: true });
    const items = json.items || [];
    this.cache.set(key, items);
    return items;
  }

  // ---------- Characters (Path of Building snapshots, on demand) ----------

  _charUrl(what, extra = {}) {
    const acct = this.getAccountName();
    if (!acct) throw new AuthError('Account name (Name#1234) is not set in Settings.');
    const q = new URLSearchParams({ accountName: acct, realm: 'pc', ...extra });
    return `${WEB}/character-window/${what}?${q}`;
  }

  /** Your characters: name, league, class (the ascendancy once you have one), level; lastActive marks the one you played last. */
  async characters({ maxAgeMs = 0 } = {}) {
    const key = `ggg_chars_${this.getAccountName()}`;
    if (maxAgeMs > 0 && this.cache.isFresh(key, maxAgeMs)) return this.cache.get(key).data;
    const json = await this._request('character', this._charUrl('get-characters'), { withSession: true });
    const list = Array.isArray(json) ? json : json?.characters || [];
    this.cache.set(key, list);
    return list;
  }

  /** What the character wears, with its gems ({ items, character }). */
  async characterItems(name) {
    return this._request('character', this._charUrl('get-items', { character: name }), { withSession: true });
  }

  /** The character's passive tree and jewels ({ hashes, hashes_ex, mastery_effects, items, jewel_data, ... }). */
  async characterPassives(name) {
    return this._request('character', this._charUrl('get-passive-skills', { character: name }), { withSession: true });
  }

  // ---------- Leagues ----------

  /** GGG's own list of the main leagues (public, no login), cached 3 hours: has a new league from its first minute. */
  async leagues() {
    const key = 'ggg_leagues';
    if (this.cache.isFresh(key, 3 * 60 * 60 * 1000)) return this.cache.get(key).data;
    try {
      const json = await this._request('leagues', `${WEB}/api/leagues?type=main&realm=pc`);
      const list = Array.isArray(json) ? json : json?.leagues || [];
      this.cache.set(key, list);
      return list;
    } catch (e) {
      const stale = this.cache.get(key);
      if (stale) return stale.data;
      throw e;
    }
  }

  // ---------- Trade (rares, on demand) ----------

  async tradeStats() {
    const key = 'ggg_trade_stats';
    if (this.cache.isFresh(key, STATS_TTL)) return this.cache.get(key).data;
    try {
      const json = await this._request('trade-data', `${WEB}/api/trade/data/stats`);
      this.cache.set(key, json);
      return json;
    } catch (e) {
      const stale = this.cache.get(key);
      if (stale) return stale.data;
      throw e;
    }
  }

  /** The trade site's item names and their exchange tags ("Chaos Orb" -> "chaos"), cached like the stats. */
  async tradeStatic() {
    const key = 'ggg_trade_static';
    if (this.cache.isFresh(key, STATS_TTL)) return this.cache.get(key).data;
    try {
      const json = await this._request('trade-data', `${WEB}/api/trade/data/static`);
      this.cache.set(key, json);
      return json;
    } catch (e) {
      const stale = this.cache.get(key);
      if (stale) return stale.data;
      throw e;
    }
  }

  /** The trade site's list of item names (bases, uniques, gems with their transfigured "discriminator"), cached like the stats. */
  async tradeItems() {
    const key = 'ggg_trade_items';
    if (this.cache.isFresh(key, STATS_TTL)) return this.cache.get(key).data;
    try {
      const json = await this._request('trade-data', `${WEB}/api/trade/data/items`);
      this.cache.set(key, json);
      return json;
    } catch (e) {
      const stale = this.cache.get(key);
      if (stale) return stale.data;
      throw e;
    }
  }

  /** Bulk exchange (currency and other stackables): the listings come with the answer, no fetch. */
  async tradeExchange(league, body, { maxWaitMs = null } = {}) {
    const key = `${league}|${JSON.stringify(body)}`;
    const hit = this._exchangeCache?.get(key);
    if (hit && Date.now() - hit.at < 3 * 60 * 1000) return hit.res;
    const wait = this.limiter?.waitTime?.('trade-exchange') || 0;
    if (maxWaitMs != null && wait > maxWaitMs) throw new Error(`The trade site asks to wait ${Math.ceil(wait / 1000)} seconds before the next exchange search. Try again then.`);
    const res = await this._request('trade-exchange', `${WEB}/api/trade/exchange/${encodeURIComponent(league)}`, { method: 'POST', body });
    if (!this._exchangeCache) this._exchangeCache = new Map();
    this._exchangeCache.set(key, { at: Date.now(), res });
    if (this._exchangeCache.size > 50) this._exchangeCache.delete(this._exchangeCache.keys().next().value);
    return res;
  }

  exchangeUrl(league, queryId) {
    return `${WEB}/trade/exchange/${encodeURIComponent(league)}/${encodeURIComponent(queryId)}`;
  }

  async tradeSearch(league, query, { login = false, maxWaitMs = null } = {}) {
    // the same search again within 3 minutes (price checking the same item twice): the answer we have, no request
    const key = `${league}|${JSON.stringify(query)}`;
    const hit = this._searchCache?.get(key);
    if (hit && Date.now() - hit.at < 3 * 60 * 1000) return hit.res;
    // a price check shouldn't sit in a queue for long: say how long the trade site wants us to wait instead
    const wait = this.limiter?.waitTime?.('trade-search') || 0;
    if (maxWaitMs != null && wait > maxWaitMs) throw new Error(`The trade site asks to wait ${Math.ceil(wait / 1000)} seconds before the next search. Try again then.`);
    const res = await this._request('trade-search', `${WEB}/api/trade/search/${encodeURIComponent(league)}`, { method: 'POST', body: query, withSession: login ? 'optional' : false });
    if (!this._searchCache) this._searchCache = new Map();
    this._searchCache.set(key, { at: Date.now(), res });
    if (this._searchCache.size > 50) this._searchCache.delete(this._searchCache.keys().next().value);
    return res;
  }

  /** Whether a POESESSID is set (searches made logged in may use more filters). */
  hasSession() { return !!this.getSessionId(); }

  async tradeFetch(queryId, ids) {
    const slice = ids.slice(0, 10);
    if (!slice.length) return { result: [] };
    // the same listings again within 3 minutes: no request
    const key = `${queryId}|${slice.join(',')}`;
    const hit = this._fetchCache?.get(key);
    if (hit && Date.now() - hit.at < 3 * 60 * 1000) return hit.res;
    const res = await this._request('trade-fetch', `${WEB}/api/trade/fetch/${slice.join(',')}?query=${encodeURIComponent(queryId)}`);
    if (!this._fetchCache) this._fetchCache = new Map();
    this._fetchCache.set(key, { at: Date.now(), res });
    if (this._fetchCache.size > 100) this._fetchCache.delete(this._fetchCache.keys().next().value);
    return res;
  }

  /**
   * The query behind a saved trade search link (once per saved search; the app keeps it). The trade API
   * gives it for a search id; if it doesn't, the trade page itself holds it.
   */
  async tradeQuery(league, queryId) {
    const path = `${encodeURIComponent(league)}/${encodeURIComponent(queryId)}`;
    let first;
    try {
      const j = await this._request('trade-search', `${WEB}/api/trade/search/${path}`);
      if (j?.query) return { query: j.query, sort: j.sort || null };
    } catch (e) { first = e; if (e instanceof BudgetExceededError) throw e; }
    try {
      const html = await this._requestText('trade-search', `${WEB}/trade/search/${path}`);
      const state = findTradeState(html);
      if (state?.query || state?.status) return { query: state.query || state, sort: state.sort || null };
    } catch (e) { if (e instanceof BudgetExceededError) throw e; }
    throw new Error(`Couldn't read this trade search from pathofexile.com${first ? ` (${first.message})` : ''}. Check the link opens in your browser.`);
  }

  /** A web page (not JSON), counted and rate limited like the API calls. */
  async _requestText(key, url) {
    if (this.usageToday().total >= this.dailyBudget) throw new BudgetExceededError(`Daily GGG request budget (${this.dailyBudget}) reached.`);
    const res = await this.limiter.schedule(key, async () => {
      this._count(key);
      const r = await this.fetch(url, { headers: { 'User-Agent': this.userAgent, Accept: 'text/html' } });
      return { status: r.status, headers: r.headers, response: r };
    });
    if (!res.response.ok) throw new Error(`GGG ${res.response.status} for ${key}`);
    return res.response.text();
  }

  tradeUrl(league, queryId) {
    return `${WEB}/trade/search/${encodeURIComponent(league)}/${encodeURIComponent(queryId)}`;
  }

  snapshot() {
    return { today: this.usageToday(), dailyBudget: this.dailyBudget, limiter: this.limiter.snapshot() };
  }
}

/**
 * The running challenge league from GGG's list: started, not ended, not Standard / Hardcore / SSF / Ruthless,
 * the newest first. null when there is none (between leagues).
 */
function pickChallengeLeague(list, now = Date.now()) {
  const { isChallenge } = require('./ninja');
  const t = (x) => (x ? Date.parse(x) : NaN);
  return (list || [])
    .filter((l) => isChallenge(l?.id) && !(l.rules || []).some((r) => /hardcore|solo|ruthless|noparties|hardmode/i.test(r?.id || r?.name || '')) && !l.event)
    .filter((l) => !(t(l.startAt) > now) && !(t(l.endAt) <= now))
    .sort((a, b) => (t(b.startAt) || 0) - (t(a.startAt) || 0))[0]?.id || null;
}

/** The search the trade page was opened with: its script has `"state":{...}` with the query. */
function findTradeState(html) {
  const at = String(html || '').indexOf('"state":{');
  if (at < 0) return null;
  let i = at + '"state":'.length;
  const start = i;
  let depth = 0; let inStr = false;
  for (; i < html.length; i += 1) {
    const c = html[i];
    if (inStr) { if (c === '\\') i += 1; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (!depth) break; }
  }
  try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
}

module.exports = { GggClient, BudgetExceededError, AuthError, findTradeState, pickChallengeLeague };
