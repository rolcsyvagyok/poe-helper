'use strict';
/**
 * Live prices for FilterBlade tiers. FilterBlade tiers by price when the filter is generated;
 * prices drift afterwards. This compares each base's current poe.ninja price with the
 * typical price of its tier and suggests moves when an item clearly belongs elsewhere.
 */

const { norm, trendOf, isBigChange } = require('../ninja');

const UNIQUE_CATS = ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueRelic', 'UniqueTincture'];

/** Which poe.ninja categories price a FilterBlade category. Empty = no prices for it. */
function categoriesForType(type) {
  const [g, ...rest] = type.split('->');
  const sub = rest.join('->');
  if (g === 'divination') return ['DivinationCard'];
  if (g === 'fragments') return sub.includes('scarabs') ? ['Scarab', 'AllflameEmber'] : ['Fragment', 'Invitation', 'Memory'];
  if (g === 'uniques') return sub === 'maps' ? ['UniqueMap'] : sub ? [] : UNIQUE_CATS;
  if (g === 'runesgrafts') return ['Runegraft'];
  if (g === 'vials') return ['Vial'];
  if (g === 'mapenchantments') return ['AllflameEmber'];
  if (g === 'corpses') return ['Corpse'];
  if (g === 'currency') {
    const map = { fossil: ['Fossil'], oil: ['Oil'], essence: ['Essence'], deliriumorbs: ['DeliriumOrb'], 'trial->omen': ['Omen'], 'trial->tattoo': ['Tattoo'], ducats: ['Ducat'], 'splinter->simulacrum': ['Fragment'] };
    if (map[sub]) return map[sub];
    if (/splinter/.test(sub)) return ['Fragment', 'Currency'];
    return ['Currency', 'Artifact', 'Astrolabe', 'EnshroudingCrystal', 'DjinnCoin', 'AllflameEmber'];
  }
  return [];
}

/** base name -> { chaos, max?, listings } from parsed poe.ninja categories. */
function priceIndex(type, catData) {
  const out = new Map();
  const isUniques = type.split('->')[0] === 'uniques' && !type.includes('->');
  for (const lines of Object.values(catData)) {
    for (const l of lines || []) {
      if (isUniques) {
        // Uniques are tiered by base type: the cheapest unique on a base decides how safe it is to show.
        if (!l.baseType || l.links) continue;
        const k = norm(l.baseType);
        const e = out.get(k) || { chaos: Infinity, max: 0, listings: 0, names: [] };
        e.chaos = Math.min(e.chaos, l.chaos);
        e.max = Math.max(e.max, l.chaos);
        e.listings += l.listingCount || 0;
        if (e.names.length < 4) e.names.push(l.name);
        out.set(k, e);
      } else {
        const k = norm(l.name);
        const prev = out.get(k);
        if (!prev || (l.listingCount ?? l.volume ?? 0) > (prev.listings ?? 0)) {
          const trend = trendOf(l.sparkline, l.chaos);
          out.set(k, { name: l.name, chaos: l.chaos, listings: l.listingCount ?? l.volume ?? null, ...(trend ? { trend, big: isBigChange(trend) } : {}) });
        }
      }
    }
  }
  return out;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * @param typeView one entry of tierView().types
 * @param index    priceIndex() result
 * @returns {{prices, tiers: {key: {median, priced}}, suggestions: [{base, from, to, chaos, typicalFrom, typicalTo}]}}
 */
function analyse(typeView, index, { factor = 3 } = {}) {
  const prices = {};
  const tiers = {};
  const ranked = []; // normal, movable tiers with a typical price
  for (const t of typeView.tiers) {
    const vals = [];
    for (const b of t.bases) {
      const p = index.get(norm(b));
      if (p && Number.isFinite(p.chaos)) {
        prices[b] = p;
        if (!t.special) vals.push(p.chaos);
      }
    }
    const med = median(vals);
    tiers[t.key] = { median: med, priced: vals.length, total: t.bases.length };
    if (t.hasBaseList && !t.special && !t.generated && !t.own && med != null && vals.length >= 2) ranked.push({ tier: t.tier, key: t.key, median: med, action: t.action });
  }
  const suggestions = [];
  if (ranked.length >= 2) {
    for (const t of typeView.tiers) {
      if (!t.hasBaseList || t.special || t.generated || t.own) continue;
      const own = tiers[t.key]?.median;
      for (const b of t.bases) {
        const p = prices[b];
        if (!p || own == null || p.listings === 0) continue;
        // closest tier by price ratio
        const best = ranked.reduce((a, r) => (Math.abs(Math.log((p.chaos + 0.1) / (r.median + 0.1))) < Math.abs(Math.log((p.chaos + 0.1) / (a.median + 0.1))) ? r : a));
        const off = (p.chaos + 0.1) / (own + 0.1);
        if (best.tier !== t.tier && (off >= factor || off <= 1 / factor)) {
          suggestions.push({ base: b, from: t.tier, to: best.tier, chaos: p.chaos, typicalFrom: own, typicalTo: best.median, direction: off > 1 ? 'up' : 'down', toAction: best.action });
        }
      }
    }
  }
  suggestions.sort((a, b) => Math.abs(Math.log((b.chaos + 0.1) / (b.typicalFrom + 0.1))) - Math.abs(Math.log((a.chaos + 0.1) / (a.typicalFrom + 0.1))));

  // Colour per item: how well its price fits the tier it's in.
  //   good: within 2x of the tier's typical price   warn: 2-3x off   bad: more than 3x off
  //   none: no price, or a special/catch-all tier that isn't a price band
  const fit = {};
  const counts = { good: 0, warn: 0, bad: 0, none: 0 };
  for (const t of typeView.tiers) {
    const med = tiers[t.key]?.median;
    const band = t.hasBaseList && !t.special && !t.generated && !t.own && med != null && tiers[t.key].priced >= 2;
    for (const b of t.bases) {
      const p = prices[b];
      let level = 'none';
      let dir = null;
      if (band && p) {
        const r = (p.chaos + 0.1) / (med + 0.1);
        const off = Math.max(r, 1 / r);
        level = off <= 2 ? 'good' : off <= 3 ? 'warn' : 'bad';
        dir = r > 1 ? 'up' : 'down';
      }
      fit[`${t.tier}\t${b}`] = { level, dir };
      counts[level]++;
    }
  }
  return { prices, tiers, suggestions, fit, counts };
}

// Tiers that must never be auto-tiered into: new/unknown items, exceptions, catch-alls.
const NOT_TARGET = /^(tnew|new|ex|restex|rest$|hide$|exhide)/i;

/**
 * Auto-tier plan for one FilterBlade category.
 *
 * Each eligible tier gets a price floor ("from X chaos"). Suggested floors sit halfway (geometric
 * mean) between neighbouring tiers' typical prices; `cfg.thresholds[tier]` overrides them. An item
 * goes to the highest tier whose floor it reaches, but only moves if it's clearly outside its
 * current tier's range (`margin`), so prices hovering at a boundary don't shuffle items back and forth.
 *
 * Like FilterBlade's "Apply currency" table, each tier can be left out (`include[tier] = false`):
 * an excluded tier is never filled and its items stay where they are. `rest` says what happens to
 * items cheaper than the lowest included tier: 'keep' (stay where they are) or 'hide'.
 *
 * @param typeView  one entry of tierView().types
 * @param index     priceIndex() result
 * @param cfg { thresholds?: {tier: chaos}, include?: {tier: bool}, rest?: 'keep'|'hide', minListings = 5, margin = 1.5, includeNew = false, knownNames? }
 */
const HIDE_TARGET = '__hide__';
function autoTierPlan(typeView, index, cfg = {}) {
  const minListings = cfg.minListings ?? 5;
  const margin = Math.max(1, cfg.margin ?? 1.5);
  const user = cfg.thresholds || {};
  const include = cfg.include || {};
  const hideRest = cfg.rest === 'hide';
  const a = analyse(typeView, index, { factor: Infinity });
  // Single-item tiers (NeverSink's "twisdom", "scrollfragments", ...) are purpose-built, not price bands.
  // Switched-off tiers are skipped too: an item moved there would fall through to later rules.
  // Your own tiers ("Giga") are yours: never filled by prices, and what you put there stays.
  const eligible = typeView.tiers.filter((t) => t.hasBaseList && !t.special && !t.generated && !t.own && !t.off && !NOT_TARGET.test(t.tier) && t.bases.length > 1);
  const userOf = (t) => (user[t.tier] !== '' && user[t.tier] != null && Number.isFinite(+user[t.tier]) ? +user[t.tier] : null);
  const rows = eligible.map((t) => ({ tier: t.tier, key: t.key, action: t.action, median: a.tiers[t.key]?.median ?? null, user: userOf(t), included: include[t.tier] !== false }));
  // Keep the filter's own order (FilterBlade lists tiers from most to least valuable). Typical prices
  // are clamped so each tier sits below the one above it, even if some of its items have drifted.
  const placed = rows.filter((t) => t.included && (t.median != null || t.user != null));
  let cap = Infinity;
  for (const t of placed) {
    t.typical = Math.min(t.median ?? t.user, cap / 1.5);
    cap = t.typical;
  }
  for (let i = 0; i < placed.length; i++) {
    const next = placed[i + 1];
    placed[i].suggested = next ? Math.round(Math.sqrt(Math.max(placed[i].typical, 0.01) * Math.max(next.typical, 0.01)) * 100) / 100
      : hideRest ? Math.round(placed[i].typical / 2 * 100) / 100 : 0;
  }
  let prevMin = Infinity;
  for (let i = 0; i < placed.length; i++) {
    const last = i === placed.length - 1;
    placed[i].min = Math.min(placed[i].user ?? (last && !hideRest ? 0 : placed[i].suggested), prevMin);
    prevMin = placed[i].min;
  }
  const lowest = placed[placed.length - 1];
  const hideTier = { tier: HIDE_TARGET, action: 'Hide' };
  const targetFor = (p) => placed.find((t) => p >= t.min) || (hideRest ? hideTier : lowest);
  const generated = typeView.tiers.find((t) => t.generated);
  const rangeOf = (tier) => {
    if (generated && tier === generated.tier) return hideRest && lowest ? { lo: 0, hi: lowest.min } : null;
    const i = placed.findIndex((t) => t.tier === tier);
    if (i < 0) return null;
    return { lo: placed[i].min, hi: i === 0 ? Infinity : placed[i - 1].min };
  };

  const moves = [];
  const skipped = { fewListings: [], unpriced: 0 };
  const seen = new Set();
  if (placed.length >= (hideRest ? 1 : 2)) {
    for (const t of typeView.tiers) {
      if (!t.hasBaseList || t.special || (t.generated && !hideRest)) continue;
      for (const b of t.bases) {
        if (seen.has(b)) continue;
        seen.add(b);
        const p = index.get(norm(b));
        if (!p || !Number.isFinite(p.chaos)) { skipped.unpriced++; continue; }
        if (p.listings != null && p.listings < minListings) { skipped.fewListings.push(b); continue; }
        const target = targetFor(p.chaos);
        if (!target || target.tier === t.tier || (t.generated && target === hideTier)) continue;
        const r = rangeOf(t.tier);
        // current tier isn't an auto-tier target (excluded, or e.g. "tnew"): leave it to the user
        if (!r) continue;
        // hidden -> hidden changes nothing you'd see in game: skip the noise
        if ((t.action === 'Hide' || t.generated) && target.action === 'Hide') continue;
        if (p.chaos >= r.lo / margin && p.chaos < r.hi * margin) continue; // close enough to its own tier
        moves.push({ base: b, from: t.tier, to: target.tier, toAction: target.action, chaos: p.chaos, listings: p.listings ?? null, direction: p.chaos >= r.hi ? 'up' : 'down', trend: p.trend || null, big: !!p.big });
      }
    }
    if (cfg.includeNew) {
      for (const [k, p] of index) {
        const name = p.name || null;
        if (!name || seen.has(name) || (cfg.knownNames && cfg.knownNames.has(k))) continue;
        if (!Number.isFinite(p.chaos) || (p.listings != null && p.listings < minListings)) continue;
        const target = targetFor(p.chaos);
        if (target && target !== hideTier) moves.push({ base: name, from: null, to: target.tier, toAction: target.action, chaos: p.chaos, listings: p.listings ?? null, direction: 'new', trend: p.trend || null, big: !!p.big });
      }
    }
  }
  moves.sort((x, y) => y.chaos - x.chaos);
  const byTier = new Map(placed.map((t) => [t.tier, t]));
  return {
    // every row of the table, placed or not, in filter order
    tiers: rows.map((r) => {
      const pl = byTier.get(r.tier);
      return { tier: r.tier, key: r.key, action: r.action, median: r.median, included: r.included, custom: r.user != null, typical: pl?.typical ?? null, suggested: pl?.suggested ?? null, min: pl?.min ?? null };
    }),
    rest: hideRest ? 'hide' : 'keep',
    moves,
    skipped: { fewListings: skipped.fewListings.length, fewListingsNames: skipped.fewListings.slice(0, 20), unpriced: skipped.unpriced },
    prices: a.prices,
  };
}

module.exports = { categoriesForType, priceIndex, analyse, autoTierPlan, median, NOT_TARGET };
