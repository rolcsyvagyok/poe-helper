'use strict';
/**
 * Saved trade searches (pathofexile.com/trade links) and the price watch: every few minutes the search is
 * run again, cheapest first, and you get a notification when a listing is at or under your price.
 * Pure logic here; the requests are made by the services with the GGG client (rate limited, counted).
 */

const MIN_EVERY = 5; // minutes between two checks of one search, at least
const MAX_WATCHED = 10; // searches watched at once
const REQUESTS_PER_CHECK = 2; // the search, and one fetch of the 10 cheapest when they changed (so at most 2)

/** "https://www.pathofexile.com/trade/search/Mercenaries/AbC123/live" -> { league, id, live, kind } */
function parseTradeUrl(text) {
  const s = String(text || '').trim();
  const m = /^(?:https?:\/\/)?(?:www\.)?pathofexile\.com\/trade\/(search|exchange)\/(?:poe1\/)?([^/?#\s]+)\/([A-Za-z0-9]+)(\/live)?\/?(?:[?#].*)?$/i.exec(s);
  if (!m) return null;
  let league;
  try { league = decodeURIComponent(m[2]); } catch { return null; }
  return { kind: m[1].toLowerCase(), league, id: m[3], live: !!m[4] };
}

function tradeLink({ kind = 'search', league, id, live = false }) {
  return `https://www.pathofexile.com/trade/${kind}/${encodeURIComponent(league)}/${encodeURIComponent(id)}${live ? '/live' : ''}`;
}

/** A listing's price in chaos (divines with poe.ninja's Divine Orb price); null when it can't be told. */
function chaosOf(price, divineChaos) {
  if (!price || !(Number(price.amount) > 0)) return null;
  if (price.currency === 'chaos') return Number(price.amount);
  if (price.currency === 'divine') return divineChaos ? Number(price.amount) * divineChaos : null;
  return null;
}

/** Your price in chaos: { amount, unit: 'chaos' | 'divine' }. */
function maxChaos(max, divineChaos) {
  if (!max || !(Number(max.amount) > 0)) return null;
  if (max.unit === 'divine') return divineChaos ? Number(max.amount) * divineChaos : null;
  return Number(max.amount);
}

/** The cheapest listings of a fetch, with chaos prices. */
function listingsOf(fetchJson, divineChaos) {
  const out = [];
  for (const r of fetchJson?.result || []) {
    const p = r?.listing?.price;
    if (!p) continue;
    out.push({ id: r.id, amount: p.amount, currency: p.currency, chaos: chaosOf(p, divineChaos), seller: r.listing.account?.name || '', name: [r.item?.name, r.item?.typeLine].filter(Boolean).join(' ').trim() });
  }
  return out;
}

/**
 * Listings to tell you about: at or under your price and not told before.
 * Returns { hits, cheapest } where cheapest is the lowest priced listing seen.
 */
function priceHits(listings, max, divineChaos, told = []) {
  const limit = maxChaos(max, divineChaos);
  const seen = new Set(told);
  const priced = listings.filter((l) => l.chaos != null).sort((a, b) => a.chaos - b.chaos);
  const cheapest = priced[0] || listings[0] || null;
  const hits = limit == null ? [] : priced.filter((l) => l.chaos <= limit + 1e-9 && !seen.has(l.id));
  return { hits, cheapest };
}

/** The search run again cheapest first (the saved query with sort by price). */
function cheapestFirst(saved) {
  const q = saved?.query ? saved : { query: saved };
  return { query: q.query, sort: { price: 'asc' } };
}

/** Which watched searches are due now. */
function dueSearches(list, now = Date.now()) {
  return (list || []).filter((s) => s.watch && s.kind !== 'exchange' && s.max && Number(s.max.amount) > 0)
    .slice(0, MAX_WATCHED)
    .filter((s) => !s.lastCheck || now - s.lastCheck >= Math.max(MIN_EVERY, Number(s.everyMin) || 30) * 60000);
}

/** GGG requests a day the watched searches take. */
function requestsPerDay(list) {
  return (list || []).filter((s) => s.watch && s.kind !== 'exchange' && s.max && Number(s.max.amount) > 0).slice(0, MAX_WATCHED)
    .reduce((n, s) => n + Math.ceil((24 * 60) / Math.max(MIN_EVERY, Number(s.everyMin) || 30)) * REQUESTS_PER_CHECK, 0);
}

module.exports = { parseTradeUrl, tradeLink, chaosOf, maxChaos, listingsOf, priceHits, cheapestFirst, dueSearches, requestsPerDay, MIN_EVERY, MAX_WATCHED, REQUESTS_PER_CHECK };
