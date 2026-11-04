'use strict';
/**
 * Grinding Gear Games API client. Deliberately small surface:
 *
 *   stash      GET /character-window/get-stash-items   (POESESSID, net worth only, user-triggered or scheduled)
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
    if (withSession) {
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
    if (!r.ok) throw new Error(`GGG ${r.status} for ${key}`);
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

  async tradeSearch(league, query) {
    return this._request('trade-search', `${WEB}/api/trade/search/${encodeURIComponent(league)}`, { method: 'POST', body: query });
  }

  async tradeFetch(queryId, ids) {
    const slice = ids.slice(0, 10);
    if (!slice.length) return { result: [] };
    return this._request('trade-fetch', `${WEB}/api/trade/fetch/${slice.join(',')}?query=${encodeURIComponent(queryId)}`);
  }

  tradeUrl(league, queryId) {
    return `${WEB}/trade/search/${encodeURIComponent(league)}/${encodeURIComponent(queryId)}`;
  }

  snapshot() {
    return { today: this.usageToday(), dailyBudget: this.dailyBudget, limiter: this.limiter.snapshot() };
  }
}

module.exports = { GggClient, BudgetExceededError, AuthError };
