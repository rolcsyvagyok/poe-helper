'use strict';
/**
 * Builds official trade site queries from a parsed item.
 * Nothing here talks to the network: the overlay shows the matched mods as
 * checkboxes and only calls GGG when you press "Search".
 */

const { modTemplate, modValues, classify } = require('./item-parser');

const TRADE_STATUSES = ['securable', 'available', 'online', 'onlineleague', 'any'];

const LOCAL_CLASSES = /weapon|claw|dagger|wand|sword|axe|mace|sceptre|bow|stave|staff|body armour|helmet|glove|boot|shield/i;

function normTemplate(t) {
  return t
    .replace(/\+#/g, '#')
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/\s+\(Local\)$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * The trade site writes some mods in the singular ("Leftmost # Magic Utility Flask constantly applies its
 * Flask Effect to you") while the item says "Leftmost 4 ... Flasks ... apply their ... Effects". This key
 * ignores singular/plural so both find each other.
 */
function looseKey(key) {
  return key.split(' ').map((w) => {
    if (w === 'their' || w === 'its') return 'it';
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
    if (/[^s]s$/.test(w) && w.length > 3) return w.slice(0, -1);
    return w;
  }).join(' ');
}

/** Build lookup: type -> template -> [entries] from /api/trade/data/stats */
function indexStats(statsJson) {
  const idx = {};
  for (const group of statsJson?.result || []) {
    for (const e of group.entries || []) {
      const type = e.type || group.id;
      const key = normTemplate(e.text);
      idx[type] = idx[type] || {};
      const entry = { id: e.id, text: e.text, local: /\(Local\)$/i.test(e.text) };
      (idx[type][key] = idx[type][key] || []).push(entry);
      const lk = `~${looseKey(key)}`;
      (idx[type][lk] = idx[type][lk] || []).push(entry);
    }
  }
  return idx;
}

function matchMod(idx, modText, type, itemClass, { unique = false } = {}) {
  const table = idx[type] || {};
  let key = normTemplate(modTemplate(modText));
  let hits = table[key] || table[`~${looseKey(key)}`];
  // "reduced X" is stored as negative "increased X" on trade
  let negate = false;
  if (!hits && /\breduced\b/i.test(modText)) {
    hits = table[key.replace(/\breduced\b/, 'increased')];
    negate = !!hits;
  }
  if (!hits && /\bless\b/i.test(modText)) {
    hits = table[key.replace(/\bless\b/, 'more')];
    negate = !!hits;
  }
  if (!hits) return null;
  const wantLocal = LOCAL_CLASSES.test(itemClass || '');
  // random-support uniques (Forbidden Shako...) are searched by the trade site's "support" stats
  const entry = (unique && hits.find((h) => /indexable_support/.test(h.id))) || hits.find((h) => h.local === wantLocal && !/indexable_support/.test(h.id)) || hits.find((h) => !/indexable_support/.test(h.id)) || hits[0];
  const vals = modValues(modText);
  // "Adds 10 to 20 Fire Damage" is searched by its average on trade
  const display = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  const value = display != null && negate ? -display : display;
  return { id: entry.id, text: modText, statText: entry.text, value, display, negate, type };
}

// ---------- pseudo totals (what the trade site calls "pseudo" stats) ----------
const ELE = ['fire', 'cold', 'lightning'];
function resistanceTotals(item) {
  const lines = ['implicit', 'explicit', 'crafted', 'fractured', 'enchant'].flatMap((k) => item.mods?.[k] || []);
  let ele = 0, chaos = 0, life = 0, lines_ = 0, lifeLines = 0;
  for (const l of lines) {
    const t = l.toLowerCase();
    const n = modValues(l)[0];
    if (n == null) continue;
    const res = /% to (.+?) resistances?$/.exec(t);
    if (res && !/maximum/.test(t)) {
      const what = res[1];
      if (what === 'all elemental') { ele += 3 * n; lines_++; continue; }
      const parts = what.split(/ and /).map((x) => x.trim());
      let hit = false;
      for (const p of parts) {
        if (ELE.includes(p)) { ele += n; hit = true; }
        if (p === 'chaos') { chaos += n; hit = true; }
      }
      if (hit) lines_++;
      continue;
    }
    if (/^\+?\d+ to maximum life$/.test(t)) { life += n; lifeLines++; }
  }
  return { ele, chaos, life, resLines: lines_, lifeLines };
}

// unique mods whose roll sets the price
const KEY_UNIQUE_ROLLS = [
  /^Leftmost \d+ Magic Utility Flasks?\b/i, // Mageblood
  /^Socketed Gems are Supported by Level \d+ /i, // Forbidden Shako and other random-support uniques: the gem and its level
];

const PSEUDO = [
  { key: 'ele', text: '+#% total Elemental Resistance', fallback: 'pseudo.pseudo_total_elemental_resistance', label: (v) => `+${v}% total Elemental Resistance` },
  { key: 'all', text: '+#% total Resistance', fallback: 'pseudo.pseudo_total_resistance', label: (v) => `+${v}% total Resistance` },
  { key: 'life', text: '+# total maximum Life', fallback: 'pseudo.pseudo_total_life', label: (v) => `+${v} total maximum Life` },
];

function pseudoMods(idx, item) {
  const t = resistanceTotals(item);
  const vals = { ele: t.ele, all: t.ele + t.chaos, life: t.life };
  const out = [];
  for (const p of PSEUDO) {
    const v = vals[p.key];
    if (!v) continue;
    // a total is only useful when two or more lines add up to it
    if (p.key === 'life' && t.lifeLines < 2) continue;
    if ((p.key === 'ele' || p.key === 'all') && t.resLines < 2) continue;
    if (p.key === 'all' && !t.chaos) continue; // same as the elemental total
    const hit = (idx.pseudo || {})[normTemplate(p.text)]?.[0];
    out.push({ id: hit?.id || p.fallback, text: p.label(v), statText: p.text, value: v, display: v, negate: false, type: 'pseudo', pseudo: p.key, resLines: t.resLines });
  }
  return out;
}

/**
 * Every mod on the item, in item order, plus pseudo totals.
 * [{id, text, display, value, negate, type, enabled, min, max, unmatched?}]
 */
function matchItemMods(statsJson, item, { tolerance = 0.1 } = {}) {
  if (classify(item) === 'gem') return []; // gem text isn't affixes; level, quality and corruption are props
  const idx = indexStats(statsJson);
  const out = [];
  // an unidentified item only shows its implicits (and enchantments); its other mods are unknown
  const kinds = item.flags?.unidentified ? ['enchant', 'implicit'] : ['enchant', 'implicit', 'fractured', 'explicit', 'crafted', 'scourge', 'crucible'];
  for (const kind of kinds) {
    for (const m of item.mods[kind] || []) {
      const type = kind === 'scourge' || kind === 'crucible' ? kind : kind;
      // Fractured mods can also be searched as explicit; try fractured first then explicit.
      const opts = { unique: item.rarity === 'Unique' };
      const hit = matchMod(idx, m, type, item.itemClass, opts) || (type === 'fractured' ? matchMod(idx, m, 'explicit', item.itemClass, opts) : null);
      if (hit) out.push({ ...hit, group: kind, enabled: false });
      else out.push({ id: null, text: m, type: kind, group: kind, enabled: false, unmatched: true });
    }
  }
  const pseudo = pseudoMods(idx, item).map((m) => ({ ...m, group: 'pseudo', enabled: false }));
  const all = [...pseudo, ...out];
  applyDefaults(all, item, tolerance);
  return all;
}

/** Ticks and starting min values a player would usually want. */
function applyDefaults(mods, item, tolerance = 0.1) {
  const kind = classify(item);
  const isRes = (m) => /resistances?$/i.test(m.text) && !/maximum/i.test(m.text);
  const resCount = mods.filter((m) => !m.unmatched && m.group !== 'pseudo' && isRes(m)).length;
  for (const m of mods) {
    if (m.unmatched) continue;
    // Starting range: a bit below the item's value; no maximum.
    if (m.display != null) {
      // a bit below the item's value: 45 -> 40, and -10 -> -11 (so the item itself still matches)
      const lo = m.display >= 0 ? m.display * (1 - tolerance) : m.display * (1 + tolerance);
      m.min = Number.isInteger(m.display) ? Math.floor(lo) : Math.floor(lo * 100) / 100;
      m.max = null;
    }
    if (kind === 'unique') {
      // a unique is searched by name; only the roll that decides its price is ticked (Mageblood: how many flasks),
      // searched at exactly this value, since 4 and 2 are worth very different amounts
      if (KEY_UNIQUE_ROLLS.some((re) => re.test(m.text))) { m.enabled = true; m.min = m.display; }
      continue;
    }
    if (kind === 'gem') continue;
    if (m.group === 'pseudo') {
      // Two or more resistance lines: search the total instead of each line.
      m.enabled = resCount >= 2 && (m.pseudo === 'ele' || m.pseudo === 'all');
      continue;
    }
    if (m.group === 'crafted' || m.group === 'enchant') continue;
    m.enabled = !(resCount >= 2 && isRes(m));
  }
  // with chaos resistance present, the "total Resistance" pseudo covers it; don't tick both totals
  const all = mods.find((m) => m.pseudo === 'all' && m.enabled);
  const ele = mods.find((m) => m.pseudo === 'ele');
  if (all && ele) ele.enabled = false;
  return mods;
}

// ---------- item properties ----------
const CATEGORIES = {
  rings: 'accessory.ring', amulets: 'accessory.amulet', belts: 'accessory.belt', trinkets: 'accessory.trinket',
  'body armours': 'armour.chest', helmets: 'armour.helmet', gloves: 'armour.gloves', boots: 'armour.boots', shields: 'armour.shield', quivers: 'armour.quiver',
  claws: 'weapon.claw', daggers: 'weapon.dagger', 'rune daggers': 'weapon.runedagger', wands: 'weapon.wand',
  'one hand swords': 'weapon.onesword', 'thrusting one hand swords': 'weapon.onesword', 'one hand axes': 'weapon.oneaxe', 'one hand maces': 'weapon.onemace',
  sceptres: 'weapon.sceptre', bows: 'weapon.bow', staves: 'weapon.staff', warstaves: 'weapon.warstaff',
  'two hand swords': 'weapon.twosword', 'two hand axes': 'weapon.twoaxe', 'two hand maces': 'weapon.twomace', 'fishing rods': 'weapon.rod',
  jewels: 'jewel', 'abyss jewels': 'jewel.abyss', 'utility flasks': 'flask', 'life flasks': 'flask', 'mana flasks': 'flask', 'hybrid flasks': 'flask',
};

/** Item property filters for the picker, with sensible starting values. */
/**
 * A weapon's own DPS, as the trade site counts it: the damage ranges the game shows (local mods and quality
 * already in) times attacks per second. { phys, ele, chaos, total, aps } rounded to one decimal, or null.
 */
function weaponDps(item) {
  const p = item?.properties || {};
  const aps = parseFloat(String(p['Attacks per Second'] || '').replace(',', '.'));
  if (!(aps > 0)) return null;
  const avg = (txt) => String(txt || '').split(',').reduce((n, part) => {
    const m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(part);
    return m ? n + (Number(m[1]) + Number(m[2])) / 2 : n;
  }, 0);
  const r = (x) => Math.round(x * 10) / 10;
  const phys = avg(p['Physical Damage']) * aps;
  const ele = avg(p['Elemental Damage']) * aps;
  const chaos = avg(p['Chaos Damage']) * aps;
  if (!(phys + ele + chaos > 0)) return null;
  return { phys: r(phys), ele: r(ele), chaos: r(chaos), total: r(phys + ele + chaos), aps };
}
// the trade site's weapon DPS filters
const DPS_FILTERS = { phys: 'pdps', ele: 'edps', total: 'dps' };
// mods a DPS search already counts (the weapon's own damage and attack speed): unticked when searching by DPS
const DPS_MOD = /(\d+% increased Physical Damage$|^Adds \d+ to \d+ (Physical|Fire|Cold|Lightning|Chaos) Damage$|% increased Attack Speed$)/;

function defaultProps(item) {
  const kind = classify(item);
  const plain = kind === 'rare' || kind === 'magic' || kind === 'normal';
  const cat = CATEGORIES[String(item.itemClass || '').toLowerCase()] || null;
  return {
    base: { on: true, value: item.baseType || item.typeLine, canChange: plain && !!cat },
    category: cat,
    ilvl: { on: plain && !!item.itemLevel && item.itemLevel >= 75, min: item.itemLevel ? Math.min(item.itemLevel, 86) : null, max: null, show: plain && !!item.itemLevel },
    links: { on: (item.sockets?.links || 0) >= 5, min: item.sockets?.links || null, show: (item.sockets?.sockets || 0) > 0 },
    quality: { on: kind === 'gem' && !!item.quality, min: item.quality || null, show: item.quality != null || kind === 'gem' },
    gemLevel: { on: kind === 'gem' && !!item.gemLevel, min: item.gemLevel || null, show: kind === 'gem' },
    mapTier: { on: !!item.mapTier, min: item.mapTier || null, show: item.mapTier != null },
    corrupted: item.flags?.corrupted ? 'yes' : kind === 'unique' || kind === 'gem' ? 'no' : 'any',
    // unidentified items are compared with other unidentified ones
    identified: item.flags?.unidentified ? 'no' : 'any',
    influences: Object.fromEntries((item.influences || []).map((i) => [i, true])),
    fractured: !!item.flags?.fractured,
    synthesised: !!item.flags?.synthesised,
    // weapons: search by the weapon's own DPS (physical, elemental or all), most of its worth in one number
    dps: (() => {
      const w = plain ? weaponDps(item) : null;
      if (!w) return { show: false };
      const mode = w.ele > w.phys ? 'ele' : 'phys';
      return { show: true, on: true, mode, values: w, min: Math.floor(w[mode] * 0.9) };
    })(),
  };
}

/** Display min/max -> trade stat range (reduced/less stats are stored negated on trade). */
function statRange(m) {
  const num = (x) => (x === '' || x == null || !Number.isFinite(+x) ? null : +x);
  let min = num(m.min);
  let max = num(m.max);
  if (m.negate) [min, max] = [max != null ? -max : null, min != null ? -min : null];
  const v = {};
  if (min != null) v.min = min;
  if (max != null) v.max = max;
  return Object.keys(v).length ? v : null;
}

/**
 * @param item  parsed item
 * @param mods  rows from matchItemMods with the player's ticks and min/max (display values)
 * @param opts  { tolerance, online, props }  props = defaultProps() as edited in the picker.
 *              Without props, falls back to automatic filters from the item.
 */
function buildQuery(item, mods, opts = {}) {
  const tolerance = opts.tolerance ?? 0.1;
  const kind = classify(item);
  const props = opts.props || null;
  // Trade status: 'securable' = Instant Buyout only (merchant tabs, since 3.27; the default),
  // 'available' = Instant Buyout and In Person, 'online' = In Person with online sellers, 'any'.
  const status = TRADE_STATUSES.includes(opts.status) ? opts.status : opts.online === false ? 'any' : 'securable';
  const q = { query: { status: { option: status }, stats: [{ type: 'and', filters: [] }], filters: {} }, sort: { price: 'asc' } };

  const useBase = props ? props.base?.on !== false : true;
  if (kind === 'unique' && !item.flags.unidentified) {
    q.query.name = item.name;
    q.query.type = item.baseType;
  } else if (kind === 'gem') {
    q.query.type = item.typeLine;
  } else if (useBase && item.baseType && kind !== 'magic') {
    q.query.type = item.baseType;
  }

  for (const m of mods) {
    if (!m.enabled || !m.id) continue;
    const f = { id: m.id, disabled: false };
    if ('min' in m || 'max' in m) {
      const v = statRange(m);
      if (v) f.value = v;
    } else if (m.value != null) {
      // no range given: a bit below the item's value
      const lo = m.value >= 0 ? Math.floor(m.value * (1 - tolerance)) : Math.ceil(m.value * (1 + tolerance));
      f.value = m.value >= 0 ? { min: lo } : { max: lo };
    }
    q.query.stats[0].filters.push(f);
  }

  const misc = {};
  const range = (r) => {
    const o = {};
    if (r?.min != null && r.min !== '') o.min = +r.min;
    if (r?.max != null && r.max !== '') o.max = +r.max;
    return Object.keys(o).length ? o : null;
  };
  if (props) {
    if (props.ilvl?.on && range(props.ilvl)) misc.ilvl = range(props.ilvl);
    if (props.quality?.on && range(props.quality)) misc.quality = range(props.quality);
    if (props.gemLevel?.on && range(props.gemLevel)) misc.gem_level = range(props.gemLevel);
    if (props.corrupted === 'yes') misc.corrupted = { option: 'true' };
    if (props.corrupted === 'no') misc.corrupted = { option: 'false' };
    if (props.identified === 'yes') misc.identified = { option: 'true' };
    if (props.identified === 'no') misc.identified = { option: 'false' };
    for (const [inf, on] of Object.entries(props.influences || {})) if (on) misc[`${inf.toLowerCase()}_item`] = { option: 'true' };
    if (props.fractured) misc.fractured_item = { option: 'true' };
    if (props.synthesised) misc.synthesised_item = { option: 'true' };
    if (props.dps?.on && DPS_FILTERS[props.dps.mode] && Number(props.dps.min) > 0) q.query.filters.weapon_filters = { filters: { [DPS_FILTERS[props.dps.mode]]: { min: Number(props.dps.min) } } };
    if (props.links?.on && range(props.links)) q.query.filters.socket_filters = { filters: { links: range(props.links) } };
    if (props.mapTier?.on && range(props.mapTier)) q.query.filters.map_filters = { filters: { map_tier: range(props.mapTier) } };
    if (!useBase && props.category) q.query.filters.type_filters = { filters: { category: { option: props.category } } };
  } else {
    if (opts.useIlvl !== false && item.itemLevel && kind !== 'unique' && kind !== 'gem') misc.ilvl = { min: item.itemLevel };
    if (kind === 'gem') {
      if (item.gemLevel) misc.gem_level = { min: item.gemLevel };
      if (item.quality) misc.quality = { min: item.quality };
    }
    if (item.flags.corrupted) misc.corrupted = { option: 'true' };
    else if (kind === 'unique' || kind === 'gem') misc.corrupted = { option: 'false' };
    if (item.flags.unidentified) misc.identified = { option: 'false' };
    if (item.flags.fractured) misc.fractured_item = { option: 'true' };
    if (item.flags.synthesised) misc.synthesised_item = { option: 'true' };
    for (const inf of item.influences) misc[`${inf.toLowerCase()}_item`] = { option: 'true' };
    if (opts.useLinks !== false && item.sockets?.links >= 5) q.query.filters.socket_filters = { filters: { links: { min: item.sockets.links } } };
  }
  if (Object.keys(misc).length) q.query.filters.misc_filters = { filters: misc };
  if (kind === 'rare' || kind === 'magic') {
    const tf = q.query.filters.type_filters?.filters || {};
    q.query.filters.type_filters = { filters: { ...tf, rarity: { option: 'nonunique' } } };
  }
  return q;
}

/** Summarize fetched listings: price list in chaos using a divine rate. */
function summarizeListings(fetchJson, divineChaos) {
  const prices = [];
  for (const r of fetchJson?.result || []) {
    const p = r?.listing?.price;
    if (!p) continue;
    let chaos = null;
    if (p.currency === 'chaos') chaos = p.amount;
    else if (p.currency === 'divine' && divineChaos) chaos = p.amount * divineChaos;
    prices.push({ amount: p.amount, currency: p.currency, chaos, seller: r.listing.account?.name, indexed: r.listing.indexed });
  }
  const chaosVals = prices.map((p) => p.chaos).filter((x) => x != null).sort((a, b) => a - b);
  const median = chaosVals.length ? chaosVals[Math.floor(chaosVals.length / 2)] : null;
  return { prices, min: chaosVals[0] ?? null, median };
}

module.exports = { weaponDps, DPS_MOD, DPS_FILTERS, indexStats, matchItemMods, matchMod, buildQuery, summarizeListings, normTemplate, defaultProps, statRange, resistanceTotals, applyDefaults, CATEGORIES, TRADE_STATUSES };
