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
    else if (k === 'other') {
      const t = it.typeLine || it.baseType || '';
      if (it.frameType === 15) { need.add('Viscera'); need.add('Corpse'); } // Wickerman parts, Necropolis corpses
      else if (/\(Tier \d+\)$/.test(t)) ['Map', 'BlightedMap', 'BlightRavagedMap'].forEach((c) => need.add(c)); // 3.30 maps: "Blighted Map (Tier 1)"
      else if (/Cluster Jewel$/.test(t) && it.enchantMods?.length) need.add('ClusterJewel');
      else if (it.frameType === 0) STACK_CATS.forEach((c) => need.add(c)); // fragments kept as normal items (An Audience With The King, invitations)
    }
  }
  return [...need];
}

function buildIndex(catData) {
  const byName = new Map(); // stackables, cards
  const uniques = new Map(); // name -> [lines]
  const gems = new Map();
  const maps = new Map();
  const clusters = [];
  const viscera = [];
  for (const [cat, lines] of Object.entries(catData)) {
    for (const l of lines) {
      const n = norm(l.name);
      if (UNIQUE_CATS.includes(cat)) (uniques.get(n) || uniques.set(n, []).get(n)).push(l);
      else if (cat === 'SkillGem') (gems.get(n) || gems.set(n, []).get(n)).push(l);
      else if (cat === 'ClusterJewel') clusters.push(l);
      else if (cat === 'Viscera') viscera.push(l);
      else if (cat === 'Map') (maps.get(norm(l.baseType || l.name)) || maps.set(norm(l.baseType || l.name), []).get(norm(l.baseType || l.name))).push(l);
      else if (!byName.has(n) || (byName.get(n).volume ?? 0) < (l.volume ?? 0)) byName.set(n, { ...l, category: cat });
    }
  }
  return { byName, uniques, gems, maps, clusters, viscera };
}

/**
 * A 3.30 map's poe.ninja line. poe.ninja lists one base ("Map (Tier 16)", "Vaal Temple Map") several times: the plain
 * map, and the conqueror ("Baran Map (Tier 16)") and Elder guardian ("The Purifier Map (Tier 16)") ones. A map whose
 * implicits name one of them ("Map contains Baran's Citadel") gets that line; any other gets the plain one.
 */
function mapLine(it, idx, typeLine) {
  const lines = idx.maps.get(norm(typeLine)) || [];
  if (!lines.length) return null;
  const implicits = (it.implicitMods || []).map((x) => (typeof x === 'string' ? x : x?.description || '')).join('\n').toLowerCase();
  const base = norm(typeLine);
  for (const l of lines) {
    const n = norm(l.name);
    if (n === base || !n.endsWith(` ${base}`)) continue;
    const who = n.slice(0, -base.length - 1).replace(/^the /, ''); // "baran", "purifier"
    if (who && implicits.includes(who)) return { line: l, label: l.name };
  }
  const plain = lines.find((l) => norm(l.name) === base);
  return plain ? { line: plain, label: typeLine } : null;
}

function valueItem(it, idx) {
  const kind = stashKind(it);
  const qty = it.stackSize || 1;
  const typeLine = it.typeLine || it.baseType || '';
  // shards: a twentieth of their orb; a Scroll Fragment a fifth of a Scroll of Wisdom
  const part = { 'transmutation shard': ['orb of transmutation', 20], 'alteration shard': ['orb of alteration', 20], 'scroll fragment': ['scroll of wisdom', 5], 'alchemy shard': ['orb of alchemy', 20], 'regal shard': ['regal orb', 20], 'chaos shard': ['chaos orb', 20] }[norm(typeLine)];
  if (part) {
    const l = idx.byName.get(part[0]) || (part[0] === 'chaos orb' ? { chaos: 1 } : null);
    return l ? { name: typeLine, qty, each: l.chaos / part[1], category: 'Currency' } : null;
  }
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
  if (kind === 'other') {
    // a normal cluster jewel: poe.ninja prices it by its enchantment, passive count and item level
    if (/Cluster Jewel$/.test(typeLine) && it.frameType === 0 && it.enchantMods?.length) {
      const n = Number((/Adds (\d+) Passive Skills/.exec(it.enchantMods.join('\n')) || [])[1]);
      const grants = it.enchantMods.join('\n').split('\n').map((x) => (/^Added Small Passive Skills grant: (.+)$/.exec(x.trim()) || [])[1]).filter(Boolean).join(', ');
      const cands = (idx.clusters || []).filter((l) => norm(l.baseType) === norm(typeLine) && l.variant === `${n} passives` && norm(l.name) === norm(grants) && (l.levelRequired ?? 0) <= (it.ilvl || 0))
        .sort((a, b) => (b.levelRequired ?? 0) - (a.levelRequired ?? 0));
      return cands[0] ? { name: `${typeLine} (${n}, ${grants.split(',')[0]})`, qty: 1, each: cands[0].chaos, category: 'Cluster' } : null;
    }
    // Wickerman parts: by name and the buff they carry
    if (it.frameType === 15 && idx.viscera?.length) {
      const p = require('./pricer').pickViscera(idx.viscera, typeLine, [...(it.implicitMods || []), ...(it.explicitMods || [])].map((m) => (typeof m === 'string' ? m : m?.description || '')));
      if (p.best) return { name: typeLine, qty, each: p.best.chaos, category: 'Viscera' };
    }
    // normal items poe.ninja prices by name: fragments, invitations, memories, corpses, 3.30 maps ("Blighted Map (Tier 1)")
    if (it.frameType === 0 || it.frameType === 15) {
      const m = mapLine(it, idx, typeLine);
      if (m) return { name: m.label, qty, each: m.line.chaos, category: 'Map' };
      const l = idx.byName.get(norm(typeLine));
      return l ? { name: typeLine, qty, each: l.chaos, category: l.category || 'Map' } : null;
    }
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
      const a = agg.get(v.name) || { name: v.name, qty: 0, each: v.each, total: 0, category: v.category, icon, tabs: new Set() };
      if (!a.icon && icon) a.icon = icon;
      a.tabs.add(tab.name);
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
  constructor({ ggg, ninja, store, getLeague, log = () => {}, extraPrices = null }) {
    // extraPrices(names) -> Map(name -> chaos): prices from elsewhere (the bulk exchange) for stackables poe.ninja doesn't price
    this.extraPrices = extraPrices;
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
      // the tab list as it is now (1 request; it brings tab 0's items too): a tab you moved keeps its id but gets
      // another number, and an old list would read the wrong tab under the wrong name
      const oldMeta = this.ggg.cachedTabs ? this.ggg.cachedTabs(league) : [];
      const tabsMeta = await this.ggg.stashTabs(league, { force: !(this.ggg.tabsFresh && this.ggg.tabsFresh(league, 60 * 1000)) });
      let ids = this.store.get('selectedTabIds') || [];
      if (!ids.length) ids = selected.map((i) => oldMeta.find((t) => t.index === i)?.id).filter(Boolean);
      const metas = ids.length ? ids.map((id) => tabsMeta.find((t) => t.id === id)).filter(Boolean) : selected.map((i) => tabsMeta.find((t) => t.index === i)).filter(Boolean);
      if (ids.length) {
        this.store.set('selectedTabIds', metas.map((m) => m.id));
        this.store.set('selectedTabs', metas.map((m) => m.index));
      }
      const tabs = [];
      for (const meta of metas) {
        const index = meta.index;
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
      // currency poe.ninja has no price for yet (new this league): the bulk exchange's price
      if (this.extraPrices) {
        const missing = [...new Set(allItems.filter((it) => it.stackSize > 0 && it.frameType === 5 && !valueItem(it, idx)?.each).map((it) => it.typeLine))];
        if (missing.length) {
          try {
            for (const [name, chaos] of await this.extraPrices(missing)) if (chaos > 0) idx.byName.set(norm(name), { name, chaos, category: 'Currency' });
          } catch (e) { this.log('exchange prices', e.message); }
        }
      }
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
        items: v.items.filter((i) => i.total >= 1).slice(0, 400).map((i) => ({ n: i.name, q: i.qty, e: Math.round(i.each * 100) / 100, c: i.category, ...(i.icon ? { i: i.icon } : {}), t: [...(i.tabs || [])] })),
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
      series: all.map((s) => ({ ts: s.ts, chaos: s.totalChaos, divine: s.divine, tabs: s.byTab })),
      sessions: this.sessions(league),
      newest: all[all.length - 1].ts,
      diff,
    };
  }

  /**
   * What changed between two snapshots (from / to: snapshot times; to defaults to the newest, from to the one
   * before it). See compareSnaps.
   */
  compare(league, { from = null, to = null } = {}) {
    const all = this.snapshots(league);
    if (all.length < 2) return { list: all.map((s) => ({ ts: s.ts, chaos: s.totalChaos, reason: s.reason })), result: null };
    const b = to ? all.filter((s) => s.ts <= to).pop() : all[all.length - 1];
    const before = all.filter((s) => s.ts < b.ts);
    // no "from": the last snapshot before it that differs (snapshots taken seconds apart are the same)
    const same = (x) => x.totalChaos === b.totalChaos && (x.items || []).length === (b.items || []).length;
    const a = (from ? before.filter((s) => s.ts <= from).pop() || before[0] : [...before].reverse().find((x) => !same(x)) || before[before.length - 1]) || null;
    return { list: all.map((s) => ({ ts: s.ts, chaos: s.totalChaos, reason: s.reason })), result: a ? compareSnaps(a, b) : null };
  }

  /** Farming sessions: a start and an end (open while running); profit is measured from the snapshot at the start. */
  sessions(league) {
    return (this.store.get('sessions') || []).filter((s) => !league || s.league === league);
  }

  /** strategy: an Atlas strategy's id, so the strategy can show what its sessions earned */
  startSession(league, { strategy = null, name = null } = {}) {
    const all = this.store.get('sessions') || [];
    for (const s of all) if (s.league === league && !s.end) s.end = Date.now();
    const n = all.filter((s) => s.league === league).length + 1;
    const s = { id: `${Date.now()}`, league, name: name ? `${name} ${all.filter((x) => x.league === league && x.strategy === strategy).length + 1}` : `Session ${n}`, start: Date.now(), end: null };
    if (strategy) s.strategy = strategy;
    all.push(s);
    this.store.set('sessions', all.slice(-200));
    return s;
  }

  stopSession(league) {
    const all = this.store.get('sessions') || [];
    const s = all.filter((x) => x.league === league && !x.end).pop();
    if (s) s.end = Date.now();
    this.store.set('sessions', all);
    return s || null;
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

/**
 * Two snapshots side by side: where the change in worth came from.
 *  - loot: items you have more of (valued at the newer price)
 *  - spent: items you have fewer of (sold, used, moved out of the tracked tabs)
 *  - prices: what you held all along, worth more or less now
 *  - other: the rest (items under 1c, which snapshots don't list one by one)
 * Plus each item's change, the change per category and per stash tab, and per hour.
 */
function compareSnaps(a, b) {
  const before = new Map((a.items || []).map((i) => [i.n, i]));
  const after = new Map((b.items || []).map((i) => [i.n, i]));
  const items = [];
  let loot = 0; let spent = 0; let prices = 0;
  for (const n of new Set([...before.keys(), ...after.keys()])) {
    const x = before.get(n); const y = after.get(n);
    const q0 = x?.q || 0; const q1 = y?.q || 0;
    const e0 = x?.e ?? y?.e ?? 0; const e1 = y?.e ?? x?.e ?? 0;
    const dq = q1 - q0;
    // the quantity change at the newer price; the price change on what you held before
    const fromQty = dq * e1;
    const fromPrice = q0 * (e1 - e0); // q1·e1 − q0·e0 = dq·e1 + q0·(e1 − e0)
    if (dq > 0) loot += fromQty; else spent += fromQty;
    prices += fromPrice;
    if (Math.abs(fromQty) < 0.5 && Math.abs(fromPrice) < 0.5) continue;
    items.push({ n, c: y?.c || x?.c || 'Other', i: y?.i || x?.i, q0, q1, dq, e0, e1, fromQty: Math.round(fromQty * 10) / 10, fromPrice: Math.round(fromPrice * 10) / 10 });
  }
  const total = (b.totalChaos || 0) - (a.totalChaos || 0);
  const byCat = new Map();
  for (const it of items) {
    if (!byCat.has(it.c)) byCat.set(it.c, { c: it.c, loot: 0, spent: 0, prices: 0 });
    const g = byCat.get(it.c);
    if (it.dq > 0) g.loot += it.fromQty; else g.spent += it.fromQty;
    g.prices += it.fromPrice;
  }
  const tabs = [...new Set([...Object.keys(a.byTab || {}), ...Object.keys(b.byTab || {})])]
    .map((t) => ({ t, v: Math.round(((b.byTab || {})[t] || 0) - ((a.byTab || {})[t] || 0)) })).filter((x) => x.v).sort((p, q) => q.v - p.v);
  const hours = (b.ts - a.ts) / 3600000;
  const r = (v) => Math.round(v) + 0; // + 0: no "-0"
  return {
    from: { ts: a.ts, chaos: a.totalChaos, divine: a.divine }, to: { ts: b.ts, chaos: b.totalChaos, divine: b.divine },
    hours, total: r(total), perHour: hours >= 0.25 ? r(total / hours) : null,
    loot: r(loot), spent: r(spent), prices: r(prices), other: r(total - loot - spent - prices),
    gained: items.filter((i) => i.dq > 0).sort((p, q) => q.fromQty - p.fromQty),
    lost: items.filter((i) => i.dq < 0).sort((p, q) => p.fromQty - q.fromQty),
    moved: items.filter((i) => Math.abs(i.fromPrice) >= 1).sort((p, q) => Math.abs(q.fromPrice) - Math.abs(p.fromPrice)),
    byCat: [...byCat.values()].map((g) => ({ ...g, loot: r(g.loot), spent: r(g.spent), prices: r(g.prices), net: r(g.loot + g.spent + g.prices) })).filter((g) => g.net || g.loot || g.spent).sort((p, q) => q.net - p.net),
    tabs,
  };
}

/** PoE writes to Client.txt on every zone change and chat line. Idle > 15 min = not playing. */
function isPlaying(clientLogPath, idleMs = 15 * 60 * 1000) {
  try {
    return Date.now() - fs.statSync(clientLogPath).mtimeMs < idleMs;
  } catch {
    return true; // can't tell; don't block
  }
}

module.exports = { NetWorthTracker, valueTabs, buildIndex, valueItem, neededCategories, diffItems, compareSnaps, stashKind, isPlaying };
