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
    // its own state, as Awakened does: a not corrupted item isn't compared with corrupted ones (they can't be changed)
    corrupted: item.flags?.corrupted ? 'yes' : kind === 'unique' || kind === 'gem' || kind === 'rare' || kind === 'magic' ? 'no' : 'any',
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
    // a stat with options ("Added Small Passive Skills grant: …" is "enchant.stat_3948993189" option 13)
    const opt = /^(.+)\|(\d+)$/.exec(m.id);
    if (opt) { q.query.stats[0].filters.push({ id: opt[1], disabled: false, value: { option: Number(opt[2]) } }); continue; }
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
    // armour / evasion / energy shield / ward (at 20% quality, as the trade site counts them)
    const def = {};
    for (const d of props.defence || []) if (d.on && Number(d.min) > 0) def[d.key] = { min: Number(d.min) };
    if (Object.keys(def).length) q.query.filters.armour_filters = { filters: def };
    // maps: quantity / rarity / pack size; heist: the job level and a priceless target
    const mf = {};
    for (const m of props.mapStats || []) if (m.on && Number(m.min) > 0) mf[`map_${m.key}`] = { min: Number(m.min) };
    if (Object.keys(mf).length) q.query.filters.map_filters = { filters: { ...(q.query.filters.map_filters?.filters || {}), ...mf } };
    if (props.heist?.on && props.heist.min) q.query.filters.heist_filters = { filters: { [props.heist.key]: { min: Number(props.heist.min) } } };
    if (props.priceless) q.query.filters.heist_filters = { filters: { ...(q.query.filters.heist_filters?.filters || {}), heist_objective_value: { option: 'priceless' } } };
    if (props.dps?.on && DPS_FILTERS[props.dps.mode] && Number(props.dps.min) > 0) q.query.filters.weapon_filters = { filters: { [DPS_FILTERS[props.dps.mode]]: { min: Number(props.dps.min) } } };
    if (props.links?.on && range(props.links)) q.query.filters.socket_filters = { filters: { links: range(props.links) } };
    if (props.mapTier?.on && range(props.mapTier)) q.query.filters.map_filters = { filters: { ...(q.query.filters.map_filters?.filters || {}), map_tier: range(props.mapTier) } };
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

// ---------- the price check's search, after Awakened PoE Trade (see price-filters.js) ----------
const MELEE = /^(one|two) hand (axes|swords|maces)$|^thrusting one hand swords$|^(staves|warstaves|claws|daggers)$/i;
const PDPS_TYPES = /^(one|two) hand (axes|swords)$|^bows$|^warstaves$/i; // physical DPS matters most (Awakened's list)

/** Every mod of the item as a search row, with its tier/range info (Ctrl+Alt+C) and template; nothing ticked. */
function itemRows(idx, item, tol) {
  const PF = require('./price-filters');
  const out = [];
  const kinds = item.flags?.unidentified ? ['enchant', 'implicit'] : ['enchant', 'implicit', 'fractured', 'explicit', 'crafted', 'scourge', 'crucible'];
  for (const kind of kinds) {
    (item.mods[kind] || []).forEach((m, i) => {
      const opts = { unique: item.rarity === 'Unique' };
      const hit = matchMod(idx, m, kind, item.itemClass, opts) || (kind === 'fractured' ? matchMod(idx, m, 'explicit', item.itemClass, opts) : null);
      const meta = item.modMeta?.[kind]?.[i] || null;
      const row = hit ? { ...hit, group: kind, enabled: false } : { id: null, text: m, type: kind, group: kind, enabled: false, unmatched: true };
      row.meta = meta;
      row.tpl = PF.tplOf(m);
      if (row.display != null) { row.min = PF.minOf(row.display, tol); row.max = null; }
      out.push(row);
    });
  }
  return out;
}

// item level brackets that matter for cluster jewels (which notables can roll)
const floorTo = (v, list) => list.filter((x) => x <= v).pop() ?? list[0];
const ceilTo = (v, list) => [...list].sort((a, b) => a - b).find((x) => x >= v) ?? null;
const HEIST_JOBS = { Lockpicking: 'heist_lockpicking', 'Brute Force': 'heist_brute_force', Perception: 'heist_perception', Demolition: 'heist_demolition', 'Counter-Thaumaturgy': 'heist_counter_thaumaturgy', 'Trap Disarmament': 'heist_trap_disarmament', Agility: 'heist_agility', Deception: 'heist_deception', Engineering: 'heist_engineering' };

/** Awakened's rules for cluster jewels, flasks, maps and heist contracts. Returns the mods (props changed in place). */
function specialRules(mods, item, props, kind, tol) {
  const cls = String(item.itemClass || '');
  const base = String(item.baseType || '');
  // cluster jewels: the passive count (in its useful brackets), the small passives' bonus, item level brackets
  if (/cluster jewel/i.test(base)) {
    props.base.on = true;
    for (const m of mods) {
      if (m.group !== 'enchant') continue;
      if (/Added Passive Skills are Jewel Sockets/i.test(m.text)) { m.hidden = true; m.enabled = false; continue; }
      if (/^Adds \d+ Passive Skills$/i.test(m.text)) {
        const n = m.display;
        m.enabled = true;
        // 4: at most 5; 5: exactly 5 (at most 5 on a rare); 3, 6, 10-12: at least; 2, 8, 9: at most
        if (n === 4) { m.min = null; m.max = 5; } else if (n === 5) { m.min = kind === 'rare' ? null : 5; m.max = 5; }
        else if ([3, 6, 10, 11, 12].includes(n)) { m.min = n; m.max = null; } else { m.min = null; m.max = n; }
        continue;
      }
      if (/^Added Small Passive Skills grant/i.test(m.text)) { m.enabled = true; m.min = m.display; m.max = null; }
    }
    // notables ("1 Added Passive Skill is Smoking Remains"): there or not, no number to type
    for (const m of mods) if (/^1 Added Passive Skill is /i.test(m.text)) { m.min = null; m.max = null; m.display = null; }
    if (props.ilvl && item.itemLevel) { props.ilvl.min = floorTo(item.itemLevel, [1, 50, 68, 75, 84]); props.ilvl.max = ceilTo(item.itemLevel, [49, 67, 74, 100]); props.ilvl.on = false; }
    return mods;
  }
  // flasks: the exact base; top-tier mods ticked; enchantments (harvest, instilling) hidden; no totals
  if (/flask/i.test(cls)) {
    props.base.on = true;
    if (props.ilvl) props.ilvl.on = false;
    if (props.quality) { props.quality.on = (item.quality || 0) > 20; props.quality.min = item.quality || null; props.quality.show = true; }
    const enkindled = mods.some((m) => /Gains no Charges during Flask Effect/i.test(m.text));
    return mods.filter((m) => m.group !== 'pseudo').map((m) => {
      if (m.group === 'enchant' && !enkindled) return { ...m, hidden: true, enabled: false };
      if (m.group === 'explicit' || m.group === 'crafted') return { ...m, enabled: item.advanced ? (m.meta?.tier != null && m.meta.tier <= 2) : !m.unmatched };
      return m;
    });
  }
  // maps: quantity, rarity, pack size and the "more scarabs / currency / cards / maps" numbers
  if (kind === 'map') {
    const p = item.properties || {};
    const n = (k) => { const v = /(\d+)/.exec(String(p[k] || '')); return v ? Number(v[1]) : null; };
    const more = ['More Scarabs', 'More Currency', 'More Divination Cards'].some((k) => n(k));
    props.mapStats = [
      ['iiq', 'Item Quantity', true], ['iir', 'Item Rarity', !more], ['packsize', 'Monster Pack Size', true],
    ].filter(([, k]) => n(k)).map(([key, label, on]) => ({ key, label, value: n(label), on, min: Math.floor(n(label) * (1 - tol)) }));
    const ids = { 'More Scarabs': 'pseudo.pseudo_map_more_scarab_drops', 'More Currency': 'pseudo.pseudo_map_more_currency_drops', 'More Divination Cards': 'pseudo.pseudo_map_more_card_drops', 'More Maps': 'pseudo.pseudo_map_more_map_drops' };
    const extra = Object.entries(ids).filter(([k]) => n(k)).map(([k, id]) => ({ id, text: `${k}: +${n(k)}%`, statText: `${k}: #%`, value: n(k), display: n(k), min: Math.floor(n(k) * (1 - tol)), max: null, negate: false, type: 'pseudo', group: 'pseudo', enabled: k !== 'More Maps' }));
    return [...extra, ...mods];
  }
  // heist contracts: the job and its level, and whether the target is priceless
  if (/heist contract/i.test(cls)) {
    const j = (item.heistJobs || [])[0];
    if (j && HEIST_JOBS[j.job]) props.heist = { key: HEIST_JOBS[j.job], label: `${j.job} level`, min: j.level, on: true };
    props.priceless = /\(Priceless\)/.test(String(item.properties?.['Heist Target'] || ''));
    if (props.ilvl) props.ilvl.on = false;
    props.base.on = false;
    return mods;
  }
  return mods;
}

/**
 * The price check's search for an item: { mods, props, presets }.
 *  presets.base (when offered): the "crafting base" search (exact base, item level, influences, implicits,
 *  fractured mods and top-tier mods), next to the default "finished item" search.
 */
function prepareSearch(statsJson, item, { tolerance = 0.1 } = {}) {
  const PF = require('./price-filters');
  const kind = classify(item);
  const props = defaultProps(item);
  if (kind === 'gem') return { mods: [], props, presets: null };
  const idx = indexStats(statsJson);
  const rows = itemRows(idx, item, tolerance);
  const plain = kind === 'rare' || kind === 'magic' || kind === 'normal';
  const cls = String(item.itemClass || '');

  // the item's own numbers: defences and weapon DPS at 20% quality (their local mods fold into them)
  if (plain) {
    const def = PF.defenceProps(item, rows);
    if (def.length) props.defence = def;
    const w = PF.weaponProps(item, rows, weaponDps(item));
    if (w && props.dps?.show) {
      props.dps.values = w;
      const both = w.phys > 0 && w.ele > 0;
      props.dps.mode = MELEE.test(cls) ? 'phys' // melee weapons: physical DPS only (the owner's choice)
        : PDPS_TYPES.test(cls) && w.phys / w.total >= 0.67 ? 'phys' : w.ele / w.total >= 0.67 ? 'ele' : both ? 'total' : w.phys ? 'phys' : 'ele';
      props.dps.min = Math.floor(w[props.dps.mode] * 0.9);
      props.dps.on = true;
    }
  }
  // totals instead of the mods that add up to them
  const { pseudo, consumed } = PF.pseudoTotals(rows, item, idx.pseudo || {}, normTemplate, tolerance);
  let mods = [...pseudo, ...rows.filter((r) => !consumed.has(r) && !r.folded)];
  // what is ticked to start
  if (kind === 'unique') {
    PF.uniqueRolls(mods, item, tolerance);
    for (const m of mods) if (KEY_UNIQUE_ROLLS.some((re) => re.test(m.text))) { m.enabled = true; m.min = m.display; m.hidden = false; }
  }
  // an open prefix or suffix (5 mods, or 6 with a crafted one): can be searched for
  const open = PF.emptyAffix(item);
  if (open) {
    const id = open === 'prefix' ? 'pseudo.pseudo_number_of_empty_prefix_mods' : 'pseudo.pseudo_number_of_empty_suffix_mods';
    mods.push({ id, text: `Has an open ${open}`, statText: `# Empty ${open === 'prefix' ? 'Prefix' : 'Suffix'} Modifiers`, value: 1, display: 1, min: 1, max: null, negate: false, type: 'pseudo', group: 'pseudo', enabled: false });
  }
  // a rare or magic item: any base of its kind, any item level (the totals and the item's own numbers decide)
  if (plain && props.category && kind !== 'normal') {
    props.base.on = false;
    if (props.ilvl) props.ilvl.on = false;
    // influences matter to a crafter (the crafting-base search ticks them), not to a finished item
    for (const k of Object.keys(props.influences || {})) props.influences[k] = false;
  }
  if (MELEE.test(cls) && props.dps?.show) for (const k of ['ilvl', 'links', 'quality']) if (props[k]) props[k].on = false;
  mods = specialRules(mods, item, props, kind, tolerance);
  for (const m of mods) { delete m.sources; delete m.rule; }

  // the crafting-base search, for an unfinished item worth crafting on
  let presets = null;
  if (PF.craftingBase(item)) {
    const inf = (item.influences || []).length || item.flags?.fractured;
    const baseRows = rows.filter((r) => !r.unmatched && r.id && (
      r.group === 'fractured' || r.group === 'enchant' || (r.group === 'implicit' && !inf) || (r.group === 'explicit' && kind === 'magic')
    )).map((r) => ({ ...r, folded: undefined, enabled: r.group === 'explicit' ? (r.meta?.tier != null && r.meta.tier <= 2) : true }));
    const bp = defaultProps(item);
    bp.base.on = true;
    if (bp.ilvl) { bp.ilvl.on = true; bp.ilvl.min = Math.min(item.itemLevel || 1, 86); }
    for (const k of Object.keys(bp.influences || {})) bp.influences[k] = true;
    if (bp.dps) bp.dps.on = false;
    let bRows = baseRows;
    if (/cluster jewel/i.test(item.baseType || '')) { bRows = specialRules(baseRows, item, bp, kind, tolerance); if (bp.ilvl) bp.ilvl.on = true; }
    presets = { active: 'finished', base: { mods: bRows, props: bp } };
  }
  return { mods, props, presets };
}

/**
 * Fetched listings, cheapest first, as Awakened PoE Trade shows them: the same seller at the same price (or
 * right after their own listing) grouped as one row with a count; each with when it was listed and whether the
 * seller is online or AFK. { prices, min, median } (min/median in chaos, counting each listing once).
 */
function summarizeListings(fetchJson, divineChaos, { me = '' } = {}) {
  const rows = [];
  const flat = [];
  for (const r of fetchJson?.result || []) {
    const p = r?.listing?.price;
    if (!p) continue;
    let chaos = null;
    if (p.currency === 'chaos') chaos = p.amount;
    else if (p.currency === 'divine' && divineChaos) chaos = p.amount * divineChaos;
    const acc = r.listing.account || {};
    const status = r.listing.fee != null ? 'merchant' : acc.online ? (acc.online.status === 'afk' ? 'afk' : 'online') : 'offline';
    const x = { amount: p.amount, currency: p.currency, chaos, seller: acc.name, ign: acc.lastCharacterName || null, indexed: r.listing.indexed, status, mine: !!me && acc.name === me, times: 1 };
    flat.push(x);
    const same = rows.findIndex((y, i) => y.seller === x.seller && ((y.amount === x.amount && y.currency === x.currency) || rows.length - i <= 2));
    if (rows.length && same >= 0 && status !== 'merchant') rows[same].times += 1;
    else rows.push(x);
  }
  const chaosVals = flat.map((p) => p.chaos).filter((x) => x != null).sort((a, b) => a - b);
  const median = chaosVals.length ? chaosVals[Math.floor(chaosVals.length / 2)] : null;
  return { prices: rows, min: chaosVals[0] ?? null, median, count: flat.length };
}

module.exports = { prepareSearch, weaponDps, DPS_MOD, DPS_FILTERS, indexStats, matchItemMods, matchMod, buildQuery, summarizeListings, normTemplate, defaultProps, statRange, resistanceTotals, applyDefaults, CATEGORIES, TRADE_STATUSES };
