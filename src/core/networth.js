'use strict';
/**
 * WealthyExile-style net worth tracking.
 *
 * Request budget per snapshot = number of tabs you selected (1 request each).
 * The tab list is cached 6h, prices come from the shared poe.ninja cache, and
 * automatic snapshots are skipped when you are not actually playing (Client.txt idle).
 */

const fs = require('fs');
const { norm, EXCHANGE_TYPES } = require('./ninja');

const UNIQUE_CATS = ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'ForbiddenJewel', 'UniqueRelic', 'UniqueTincture', 'UniqueMap'];
const STACK_CATS = ['Currency', 'Fragment', ...EXCHANGE_TYPES.filter((t) => t !== 'Currency' && t !== 'Fragment' && t !== 'DivinationCard'), 'Incubator', 'Vial', 'Invitation', 'Memory'];

function prop(it, name) {
  const p = (it.properties || []).find((x) => x.name === name);
  return p?.values?.[0]?.[0] ?? null;
}

function maxLinks(it) {
  if (!Array.isArray(it.sockets) || !it.sockets.length) return 0;
  const counts = {};
  for (const s of it.sockets) counts[s.group] = (counts[s.group] || 0) + 1;
  return Math.max(...Object.values(counts));
}

/** What kind of thing is this stash item (from GGG's JSON)? */
function stashKind(it) {
  if (prop(it, 'Map Tier') != null) return it.frameType === 3 ? 'unique-map' : 'map';
  switch (it.frameType) {
    case 3: case 9: case 10: return 'unique';
    case 4: return 'gem';
    case 5: return 'stack';
    case 6: return 'divination';
    default: return 'other';
  }
}

function neededCategories(items) {
  const need = new Set();
  for (const it of items) {
    const k = stashKind(it);
    if (k === 'stack') STACK_CATS.forEach((c) => need.add(c));
    else if (k === 'divination') need.add('DivinationCard');
    else if (k === 'gem') need.add('SkillGem');
    else if (k === 'unique') UNIQUE_CATS.forEach((c) => need.add(c));
    else if (k === 'unique-map') need.add('UniqueMap');
    else if (k === 'map') need.add('Map');
  }
  return [...need];
}

function buildIndex(catData) {
  const byName = new Map(); // stackables, cards
  const uniques = new Map(); // name -> [lines]
  const gems = new Map();
  const maps = new Map();
  for (const [cat, lines] of Object.entries(catData)) {
    for (const l of lines) {
      const n = norm(l.name);
      if (UNIQUE_CATS.includes(cat)) (uniques.get(n) || uniques.set(n, []).get(n)).push(l);
      else if (cat === 'SkillGem') (gems.get(n) || gems.set(n, []).get(n)).push(l);
      else if (cat === 'Map') (maps.get(norm(l.baseType || l.name)) || maps.set(norm(l.baseType || l.name), []).get(norm(l.baseType || l.name))).push(l);
      else if (!byName.has(n) || (byName.get(n).volume ?? 0) < (l.volume ?? 0)) byName.set(n, { ...l, category: cat });
    }
  }
  return { byName, uniques, gems, maps };
}

function valueItem(it, idx) {
  const kind = stashKind(it);
  const qty = it.stackSize || 1;
  const typeLine = it.typeLine || it.baseType || '';
  if (kind === 'stack' || kind === 'divination') {
    const l = idx.byName.get(norm(typeLine));
    return l ? { name: typeLine, qty, each: l.chaos, category: l.category } : null;
  }
  if (kind === 'unique' || kind === 'unique-map') {
    if (!it.identified) return null; // can't tell which unique; skip rather than guess
    const lines = idx.uniques.get(norm(it.name)) || [];
    if (!lines.length) return null;
    const links = maxLinks(it);
    const tier = links >= 6 ? 6 : links === 5 ? 5 : 0;
    const pool = lines.filter((l) => (l.links || 0) === tier);
    const use = (pool.length ? pool : lines.filter((l) => !l.links)).sort((a, b) => a.chaos - b.chaos);
    if (!use.length) return null;
    // Conservative: cheapest matching variant
    return { name: it.name + (tier ? ` (${tier}L)` : ''), qty: 1, each: use[0].chaos, category: 'Unique' };
  }
  if (kind === 'gem') {
    const lines = idx.gems.get(norm(typeLine)) || [];
    const lvl = parseInt(prop(it, 'Level') || '1', 10);
    const q = parseInt(String(prop(it, 'Quality') || '0').replace(/\D/g, ''), 10) || 0;
    const ok = lines.filter((l) => (l.gemLevel ?? 1) <= lvl && (l.gemQuality ?? 0) <= q && !!l.corrupted === !!it.corrupted)
      .sort((a, b) => (b.gemLevel - a.gemLevel) || (b.gemQuality - a.gemQuality));
    return ok[0] ? { name: `${typeLine} ${lvl}/${q}`, qty: 1, each: ok[0].chaos, category: 'Gem' } : null;
  }
  if (kind === 'map') {
    const tier = parseInt(prop(it, 'Map Tier'), 10);
    const lines = idx.maps.get(norm(it.baseType || typeLine)) || [];
    const l = lines.find((x) => x.mapTier == null || x.mapTier === tier) || lines[0];
    return l ? { name: `${it.baseType || typeLine} T${tier}`, qty: 1, each: l.chaos, category: 'Map' } : null;
  }
  return null;
}

function valueTabs(tabs, idx, minChaos = 0) {
  const agg = new Map();
  const byTab = {};
  const byCategory = {};
  let total = 0;
  for (const tab of tabs) {
    let tabTotal = 0;
    for (const it of tab.items) {
      const v = valueItem(it, idx);
      if (!v) continue;
      const sum = v.each * v.qty;
      if (sum < minChaos) continue;
      tabTotal += sum;
      byCategory[v.category] = (byCategory[v.category] || 0) + sum;
      // GGG's stash data carries each item's picture (on web.poecdn.com); kept for the dashboard
      const icon = typeof it.icon === 'string' && /^https:\/\/web\.poecdn\.com\//.test(it.icon) ? it.icon : null;
      const a = agg.get(v.name) || { name: v.name, qty: 0, each: v.each, total: 0, category: v.category, icon };
      if (!a.icon && icon) a.icon = icon;
      a.qty += v.qty;
      a.total += sum;
      agg.set(v.name, a);
    }
    byTab[tab.name] = Math.round(tabTotal * 10) / 10;
    total += tabTotal;
  }
  const items = [...agg.values()].sort((a, b) => b.total - a.total);
  return { total, byTab, byCategory, items };
}

class NetWorthTracker {
  constructor({ ggg, ninja, store, getLeague, log = () => {} }) {
    this.ggg = ggg;
    this.ninja = ninja;
    this.store = store; // JsonStore with {snapshots:[], selectedTabs:[], ...}
    this.getLeague = getLeague;
    this.log = log;
    this.running = false;
    this.timer = null;
  }

  snapshots(league) {
    return (this.store.get('snapshots') || []).filter((s) => !league || s.league === league);
  }

  /** User-triggered or scheduled. Costs exactly one GGG request per selected tab. */
  async takeSnapshot({ reason = 'manual' } = {}) {
    if (this.running) throw new Error('A snapshot is already running.');
    this.running = true;
    try {
      const league = await this.getLeague();
      const selected = this.store.get('selectedTabs') || [];
      if (!selected.length) throw new Error('Pick at least one stash tab to track in the Net worth page.');
      const tabsMeta = await this.ggg.stashTabs(league);
      const tabs = [];
      for (const index of selected) {
        const meta = tabsMeta.find((t) => t.index === index);
        if (!meta) continue;
        // Re-use items fetched in the last 60 seconds (e.g. tab 0 came with the tab list).
        const items = await this.ggg.stashTabItems(league, index, { maxAgeMs: 60 * 1000 });
        tabs.push({ name: meta.name, index, items });
      }
      const allItems = tabs.flatMap((t) => t.items);
      const cats = neededCategories(allItems);
      const catData = {};
      for (const c of cats) {
        try { catData[c] = await this.ninja.category(league, c); } catch (e) { this.log('price category failed', c, e.message); }
      }
      const idx = buildIndex(catData);
      const v = valueTabs(tabs, idx, this.store.get('minItemChaos') ?? 0);
      const divine = await this.ninja.divinePrice(league).catch(() => null);
      const snap = {
        ts: Date.now(),
        league,
        reason,
        totalChaos: Math.round(v.total),
        divine,
        byTab: v.byTab,
        byCategory: Object.fromEntries(Object.entries(v.byCategory).map(([k, x]) => [k, Math.round(x)])),
        // Keep everything worth >= 1c so diffs ("what did I gain?") work, but cap size.
        items: v.items.filter((i) => i.total >= 1).slice(0, 400).map((i) => ({ n: i.name, q: i.qty, e: Math.round(i.each * 100) / 100, c: i.category, ...(i.icon ? { i: i.icon } : {}) })),
      };
      const all = this.store.get('snapshots') || [];
      all.push(snap);
      // Retain at most ~2000 snapshots (months of 30-min snapshots)
      this.store.set('snapshots', all.slice(-2000));
      return snap;
    } finally {
      this.running = false;
    }
  }

  /** Income per hour over a window, plus item-level diff between first and last snapshot. */
  report(league, { sinceMs = 24 * 3600 * 1000, at = null } = {}) {
    const all = this.snapshots(league);
    if (!all.length) return { snaps: [], latest: null };
    // a snapshot you picked (its time): the report as it was then; else the newest
    const snaps = at ? all.filter((s) => s.ts <= at) : all;
    if (!snaps.length) return { snaps: [], latest: null };
    const latest = snaps[snaps.length - 1];
    const windowSnaps = snaps.filter((s) => s.ts >= latest.ts - sinceMs);
    const first = windowSnaps[0];
    const hours = (latest.ts - first.ts) / 3600000;
    const diff = diffItems(first, latest);
    return {
      latest,
      first,
      hours,
      gainChaos: latest.totalChaos - first.totalChaos,
      perHourChaos: hours > 0.05 ? (latest.totalChaos - first.totalChaos) / hours : null,
      series: all.map((s) => ({ ts: s.ts, chaos: s.totalChaos, divine: s.divine })),
      newest: all[all.length - 1].ts,
      diff,
    };
  }

  /** Auto snapshots: interval >= 15 min, skipped while Client.txt shows you are idle. */
  startAuto({ minutes, clientLogPath, onSnapshot, onError }) {
    this.stopAuto();
    const m = Math.max(15, Number(minutes) || 0);
    if (!minutes) return;
    this.timer = setInterval(async () => {
      if (clientLogPath && !isPlaying(clientLogPath)) return;
      try {
        onSnapshot?.(await this.takeSnapshot({ reason: 'auto' }));
      } catch (e) {
        onError?.(e);
      }
    }, m * 60 * 1000);
  }

  stopAuto() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

function diffItems(a, b) {
  if (!a || !b || a === b) return [];
  const before = new Map((a.items || []).map((i) => [i.n, i]));
  const after = new Map((b.items || []).map((i) => [i.n, i]));
  const names = new Set([...before.keys(), ...after.keys()]);
  const out = [];
  for (const n of names) {
    const x = before.get(n);
    const y = after.get(n);
    const dq = (y?.q || 0) - (x?.q || 0);
    if (!dq) continue;
    const each = y?.e ?? x?.e ?? 0;
    out.push({ name: n, deltaQty: dq, deltaChaos: Math.round(dq * each * 10) / 10, category: y?.c || x?.c });
  }
  return out.sort((p, q) => Math.abs(q.deltaChaos) - Math.abs(p.deltaChaos)).slice(0, 50);
}

/** PoE writes to Client.txt on every zone change and chat line. Idle > 15 min = not playing. */
function isPlaying(clientLogPath, idleMs = 15 * 60 * 1000) {
  try {
    return Date.now() - fs.statSync(clientLogPath).mtimeMs < idleMs;
  } catch {
    return true; // can't tell; don't block
  }
}

module.exports = { NetWorthTracker, valueTabs, buildIndex, valueItem, neededCategories, diffItems, stashKind, isPlaying };
