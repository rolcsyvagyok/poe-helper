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
    // "(Local)", and a shield's own block chance "+#% Chance to Block (Shields)"
    .replace(/\s+\((Local|Shields)\)$/i, '')
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
      const entry = { id: e.id, text: e.text, local: /\((Local|Shields)\)$/i.test(e.text) };
      (idx[type][key] = idx[type][key] || []).push(entry);
      const lk = `~${looseKey(key)}`;
      (idx[type][lk] = idx[type][lk] || []).push(entry);
      // "Chain an additional time" on trade, "Chain 2 additional times" on the item
      if (/\ban additional\b/.test(key)) {
        const nk = `~${looseKey(key.replace(/\ban additional\b/, '# additional'))}`;
        (idx[type][nk] = idx[type][nk] || []).push({ ...entry, countsAn: true });
      }
    }
  }
  return idx;
}

/** The numbers of a mod where the trade site's text has a "#": "6% … per 1% … above 75%" is 6, not the average of 6, 1
 *  and 75. null when the texts don't line up (the usual number-reading takes over). */
function valuesAt(statText, modText) {
  // a stat on two lines and a mod joined into one ("…Retaliation skill to become usable for every 100 life…")
  const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  if (/\n/.test(statText || '') && !/\n/.test(modText || '') && /#/.test(statText)) {
    const esc = flat(statText).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#/g, '([+-]?\\d+(?:\\.\\d+)?)');
    const m = new RegExp(`^\\+?${esc}$`, 'i').exec(flat(modText));
    if (m) return m.slice(1).map(Number);
  }
  const lines = String(statText || '').split('\n');
  const one = lines.find((l) => l.includes('#')) || '';
  if ((one.match(/#/g) || []).length === 0) return null;
  const esc = one.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#/g, '([+-]?\\d+(?:\\.\\d+)?)');
  const m = new RegExp(`^\\+?${esc}$`, 'i').exec(String(modText || '').split('\n')[0].trim());
  if (!m) return null;
  return m.slice(1).map(Number);
}

function matchMod(idx, modText, type, itemClass, { unique = false } = {}) {
  const table = idx[type] || {};
  let key = normTemplate(modTemplate(modText));
  let hits = table[key] || table[`~${looseKey(key)}`];
  // the item says "an additional time", the trade site "# additional times": the number is 1
  let one = false;
  if (!hits && /\ban additional\b/i.test(modText)) {
    const k1 = key.replace(/\ban additional\b/, '# additional');
    hits = table[k1] || table[`~${looseKey(k1)}`];
    one = !!hits;
  }
  // "reduced X" is stored as negative "increased X" on trade
  let negate = false;
  if (!hits && /\breduced\b/i.test(modText)) {
    hits = table[key.replace(/\breduced\b/, 'increased')];
    negate = !!hits;
  }
  // some uniques (Le Heup of All…) say "+30% to Item Rarity"; the trade site lists it as "#% increased Rarity of Items found"
  if (!hits) {
    // and a Medium Cluster Jewel's "1 Added Passive Skill is a Jewel Socket" is "# Added Passive Skills are Jewel Sockets"
    const alias = { '#% to item rarity': '#% increased rarity of items found', '#% to item quantity': '#% increased quantity of items found', '# added passive skill is a jewel socket': '# added passive skills are jewel sockets' }[key];
    if (alias) hits = table[alias] || table[`~${looseKey(alias)}`];
  }
  // the item says "+3 to maximum Blooms", the trade site "+# maximum Bloom"
  if (!hits && /# to maximum /.test(key)) {
    const k2 = key.replace('# to maximum ', '# maximum ');
    hits = table[k2] || table[`~${looseKey(k2)}`];
  }
  if (!hits && /\bless\b/i.test(modText)) {
    hits = table[key.replace(/\bless\b/, 'more')];
    negate = !!hits;
  }
  // "Monsters Inflict Withered for 2 seconds on Hit" is "Monsters have #% chance to inflict Withered…" at 100%
  let always = false;
  if (!hits && /\binflict\b/i.test(modText) && !/chance/i.test(modText)) {
    const k4 = key.replace(/^(monsters|minions|enemies) inflict\b/, '$1 have #% chance to inflict').replace(/^inflict\b/, '#% chance to inflict');
    if (k4 !== key) { hits = table[k4] || table[`~${looseKey(k4)}`]; always = !!hits; }
  }
  // "expires 75% slower" is stored as "expires #% faster" at -75 (The Infinite Pursuit), and the other way round
  for (const [a, b] of [['slower', 'faster'], ['faster', 'slower']]) {
    if (hits || !new RegExp(`\\b${a}\\b`, 'i').test(modText)) continue;
    const k3 = key.replace(new RegExp(`\\b${a}\\b`), b);
    hits = table[k3] || table[`~${looseKey(k3)}`];
    negate = !!hits;
  }
  if (!hits) return null;
  const wantLocal = LOCAL_CLASSES.test(itemClass || '');
  // random-support uniques (Forbidden Shako...) are searched by the trade site's "support" stats
  // random-skill uniques (Replica Dragonfang's Flight) by the "skill" stats; a gem listed twice is searched as either
  const skills = unique ? hits.filter((h) => /indexable_skill/.test(h.id)) : [];
  const entry = (unique && hits.find((h) => /indexable_support/.test(h.id))) || skills[0] || hits.find((h) => h.local === wantLocal && !/indexable_support/.test(h.id)) || hits.find((h) => !/indexable_support/.test(h.id)) || hits[0];
  // a stat without a "#" ("…in the past 2 seconds") has no number to search
  const vals = always ? [100] : one ? [1] : !/#/.test(entry.text || '') && /\d/.test(entry.text || '') ? [] : valuesAt(entry.text, modText) || modValues(modText);
  // "Adds 10 to 20 Fire Damage" is searched by its average on trade
  const display = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  const value = display != null && negate ? -display : display;
  return { id: entry.id, text: modText, statText: entry.text, value, display, negate, type, ...(skills.length > 1 ? { anyOf: skills.map((h) => h.id) } : {}) };
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
  const kinds = item.flags?.unidentified ? ['enchant', 'implicit'] : ['enchant', 'implicit', 'fractured', 'explicit', 'crafted', 'scourge', 'crucible', 'mercenary', 'imbued', 'veiled', 'delve'];
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
/** "-25 Physical Damage taken from Hits": lower is better, so it is searched as a maximum (-25 -> -22 and lower) */
// mods where a smaller number is better: Corpse Rose's "after spending #% of your Maximum Life" (17% -> 18% and lower)
const SMALLER_IS_BETTER = [/\bafter spending #%/i];
function takenAsMax(m, tolerance) {
  if (m.display > 0 && SMALLER_IS_BETTER.some((re) => re.test(m.statText || ''))) {
    const hi = m.display * (1 + tolerance);
    m.max = Number.isInteger(m.display) ? Math.ceil(hi) : Math.ceil(hi * 100) / 100;
    m.min = null;
    return;
  }
  if (!(m.display < 0) || !/\btaken\b/i.test(m.statText || m.text || '')) return;
  const hi = m.display * (1 - tolerance);
  m.max = Number.isInteger(m.display) ? Math.ceil(hi) : Math.ceil(hi * 100) / 100;
  m.min = null;
}

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
      takenAsMax(m, tolerance);
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
    // links only matter on body armours and two-handed weapons (the only items with 5 or 6 sockets)
    links: { on: (item.sockets?.links || 0) >= 5, min: item.sockets?.links || null, show: (item.sockets?.sockets || 0) > 0 && /^(body armours|two hand|bows$|staves$|warstaves$)/i.test(String(item.itemClass || '')) },
    quality: { on: kind === 'gem' && !!item.quality, min: item.quality || null, show: item.quality != null || kind === 'gem' },
    gemLevel: { on: kind === 'gem' && !!item.gemLevel, min: item.gemLevel || null, show: kind === 'gem' },
    // Facetor's Lens: what it sells for is the experience stored in it
    storedExp: (() => { const v = Number(String(item.properties?.['Stored Experience'] || '').replace(/[^\d]/g, '')); return v > 0 ? { on: true, min: Math.floor(v * 0.9 / 1e5) / 10, max: null, show: true } : { on: false, show: false }; })(), // in millions
    mapTier: { on: !!item.mapTier, min: item.mapTier || null, show: item.mapTier != null },
    // a temple's area level (83 is the best): searched at least this level
    areaLevel: /^Chronicle of Atzoatl$/i.test(item.typeLine || '') && item.areaLevel ? { on: true, min: item.areaLevel, max: null, show: true }
      : /^Inscribed Ultimatum$/i.test(item.typeLine || '') && item.areaLevel ? { on: false, min: item.areaLevel, max: null, show: true } : { on: false, show: false },
    // an Inscribed Ultimatum: the reward and what it takes (ticked), the challenge (not ticked)
    ultimatum: /^Inscribed Ultimatum$/i.test(item.typeLine || '') ? (() => { const u = ultimatumOf(item); const swap = !!u.output; return { show: true, ...u, rewardOn: !!u.reward && !swap, inputOn: !!u.input && !swap, outputOn: swap, challengeOn: false }; })() : { show: false },
    // its own state, as Awakened does: a not corrupted item isn't compared with corrupted ones (they can't be changed)
    twiceCorrupted: !!item.flags?.twiceCorrupted,
    corrupted: item.flags?.corrupted ? 'yes' : kind === 'unique' || kind === 'gem' || kind === 'rare' || kind === 'magic' || kind === 'map' || isJewel(item) ? 'no' : 'any',
    // jewels: a fractured one is only compared with fractured ones, and one that isn't with ones that aren't
    fracturedState: isJewel(item) ? (item.flags?.fractured ? 'yes' : 'no') : null,
    // unidentified items are compared with other unidentified ones
    identified: item.flags?.unidentified ? 'no' : 'any',
    influences: Object.fromEntries((item.influences || []).map((i) => [i, true])),
    fractured: !!item.flags?.fractured,
    // a Foulborn unique: only Foulborn ones (untick: any of the unique)
    foulborn: item.flags?.foulborn ? { show: true, on: true } : { show: false, on: false },
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
  } else if (kind === 'unique' && props?.uniqueName) {
    // an unidentified unique, once you said which one it is (Awakened PoE Trade does the same): that unique,
    // unidentified ones only (an identified one can roll lower)
    q.query.name = props.uniqueName;
    q.query.type = item.baseType || item.typeLine;
    q.query.filters.misc_filters = { filters: { ...(q.query.filters.misc_filters?.filters || {}), identified: { option: 'false' } } };
  } else if (opts.warrantType) {
    // a Mercenary Warrant: its build ("Mercenary Warrant (Combatant)" is { option, discriminator: 'mercenary_warrant' })
    q.query.type = opts.warrantType;
  } else if (kind === 'gem') {
    // a transfigured gem is its base gem with a "discriminator" ("Ethereal Knives of the Massacre" ->
    // { option: 'Ethereal Knives', discriminator: 'alt_x' }), from the trade site's item list
    q.query.type = opts.gemType || item.typeLine;
  } else if (kind === 'map' && BLIGHT_MAP.test(item.typeLine || '')) {
    // blighted maps aren't listed by name on the trade site: any map with the blight implicits (rows) and its tier
    q.query.filters.type_filters = { filters: { category: { option: 'map' } } };
  } else if (useBase && item.baseType && (kind !== 'magic' || item.baseType !== item.typeLine)) { // a magic item: when its base was found in its name
    q.query.type = item.baseType;
  }

  for (const m of mods) {
    if (!m.enabled || !m.id) continue;
    // a stat with options ("Added Small Passive Skills grant: …" is "enchant.stat_3948993189" option 13)
    // (an imbued support is one stat of its own: "imbued.pseudo_built_in_support|3076322868" is searched whole)
    const opt = /pseudo_built_in_support/.test(m.id) ? null : /^(.+)\|(\d+)$/.exec(m.id);
    if (opt) { q.query.stats[0].filters.push({ id: opt[1], disabled: false, value: { option: Number(opt[2]) } }); continue; }
    // any one of a few stats at this value (a jewel's single resistance: fire, cold or lightning)
    if (Array.isArray(m.anyOf) && m.anyOf.length) {
      const v = statRange(m) || (m.value != null ? { min: Math.floor(m.value * (1 - tolerance)) } : undefined);
      q.query.stats.push({ type: 'count', value: { min: 1 }, filters: m.anyOf.map((id) => ({ id, disabled: false, ...(v ? { value: v } : {}) })) });
      continue;
    }
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
    if (props.storedExp?.on && range(props.storedExp)) { const r = range(props.storedExp); misc.stored_experience = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1e6)])); }
    if (props.corrupted === 'yes') misc.corrupted = { option: 'true' };
    // twice corrupted (3.30): only other twice corrupted ones compare
    if (props.corrupted === 'yes' && (props.twiceCorrupted || item.flags?.twiceCorrupted)) misc.twice_corrupted = { option: 'true' };
    if (props.corrupted === 'no') misc.corrupted = { option: 'false' };
    if (props.foulborn ? props.foulborn.on : item.flags?.foulborn) misc.mutated = { option: 'true' }; // Foulborn: the trade site's "mutated"
    if (item.flags?.vestigial) misc.vestigial = { option: 'true' }; // a vestigial base ("Vestigial Tricorne")
    if (props.identified === 'yes') misc.identified = { option: 'true' };
    if (props.identified === 'no') misc.identified = { option: 'false' };
    for (const [inf, on] of Object.entries(props.influences || {})) if (on) misc[`${inf.toLowerCase()}_item`] = { option: 'true' };
    if (props.fracturedState === 'yes' || (props.fracturedState == null && props.fractured)) misc.fractured_item = { option: 'true' };
    if (props.fracturedState === 'no') misc.fractured_item = { option: 'false' };
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
    if (props.dps?.kinds) {
      const wf = {};
      for (const [k, d] of Object.entries(props.dps.kinds)) if (d.on && DPS_FILTERS[k] && Number(d.min) > 0) wf[DPS_FILTERS[k]] = { min: Number(d.min) };
      if (Object.keys(wf).length) q.query.filters.weapon_filters = { filters: wf };
    } else if (props.dps?.on && DPS_FILTERS[props.dps.mode] && Number(props.dps.min) > 0) q.query.filters.weapon_filters = { filters: { [DPS_FILTERS[props.dps.mode]]: { min: Number(props.dps.min) } } }; // a search saved before 1.0.155
    if (props.links?.on && range(props.links)) q.query.filters.socket_filters = { filters: { links: range(props.links) } };
    if (props.mapTier?.on && range(props.mapTier)) q.query.filters.map_filters = { filters: { ...(q.query.filters.map_filters?.filters || {}), map_tier: range(props.mapTier) } };
    if (props.ultimatum?.show) {
      const u = props.ultimatum; const uf = {};
      if (u.rewardOn && u.reward) uf.ultimatum_reward = { option: u.reward };
      if (u.inputOn && u.input) uf.ultimatum_input = { option: u.input };
      if (u.outputOn && u.output) uf.ultimatum_output = { option: u.output };
      if (u.challengeOn && u.challenge) uf.ultimatum_challenge = { option: u.challenge };
      if (Object.keys(uf).length) q.query.filters.ultimatum_filters = { filters: uf };
    }
    if (props.areaLevel?.on && range(props.areaLevel)) q.query.filters.map_filters = { filters: { ...(q.query.filters.map_filters?.filters || {}), area_level: range(props.areaLevel) } };
    if (!useBase && props.category) q.query.filters.type_filters = { filters: { category: { option: props.category } } };
  } else {
    if (opts.useIlvl !== false && item.itemLevel && kind !== 'unique' && kind !== 'gem') misc.ilvl = { min: item.itemLevel };
    if (kind === 'gem') {
      if (item.gemLevel) misc.gem_level = { min: item.gemLevel };
      if (item.quality) misc.quality = { min: item.quality };
    }
    if (item.flags.corrupted) misc.corrupted = { option: 'true' };
    if (item.flags.twiceCorrupted) misc.twice_corrupted = { option: 'true' };
    if (item.flags.foulborn) misc.mutated = { option: 'true' }; // the trade site calls Foulborn "mutated"
    if (item.flags.vestigial) misc.vestigial = { option: 'true' };
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
    // a magic item is compared with magic ones only (its one or two mods are what it is)
    q.query.filters.type_filters = { filters: { ...tf, rarity: { option: kind === 'magic' ? 'magic' : props?.rareOnly?.on ? 'rare' : 'nonunique' } } };
  }
  // an unidentified unique is searched by its base: only uniques of it (not rares of the same base)
  if (kind === 'unique' && item.flags.unidentified) {
    const tf = q.query.filters.type_filters?.filters || {};
    q.query.filters.type_filters = { filters: { ...tf, rarity: { option: 'unique' } } };
  }
  // a map: the special map implicits it doesn't have are left out ("not"), so a plain or an Originator map isn't
  // compared with conqueror, Elder or Shaper guardian maps, nor these with each other
  if (kind === 'map' && !BLIGHT_MAP.test(`${item.typeLine || ''} ${item.baseType || ''}`)) {
    const own = new Set([...mods.map((m) => String(m.id || '').split('|')[0]), ...(item.mods?.implicit || []).map((t) => MAP_SPECIAL.find(([, re]) => re.test(t))?.[0]).filter(Boolean)]);
    // (a stat with options is only left out option by option: without one, "not" leaves nothing out)
    const not = MAP_SPECIAL.filter(([id]) => !own.has(id)).flatMap(([id, , opts]) => (opts ? opts.map((o) => ({ id, value: { option: o } })) : [{ id }]));
    if (not.length) q.query.stats.push({ type: 'not', filters: not });
    // a unique map has the same base ("Map (Tier 16)"): only non-unique maps compare
    const tf = q.query.filters.type_filters?.filters || {};
    if (!tf.rarity) q.query.filters.type_filters = { filters: { ...tf, rarity: { option: 'nonunique' } } };
  }
  return q;
}
// the map implicits that make a special map: conqueror citadel, Elder guardian, Shaper / Elder influence, Originator
const MAP_SPECIAL = [
  ['implicit.stat_2563183002', /^Map contains .+'s Citadel$/i, [1, 2, 3, 4]],
  ['implicit.stat_3624393862', /^Map is occupied by /i, [1, 2, 3, 4]],
  ['implicit.stat_1792283443', /^Area is influenced by The (Shaper|Elder)$/i, [1, 2]],
  ['implicit.stat_2696470877', /^Area is Influenced by the Originator's Memories$/i],
];

// ---------- the price check's search, after Awakened PoE Trade (see price-filters.js) ----------
const MELEE = /^(one|two) hand (axes|swords|maces)$|^thrusting one hand swords$|^(staves|warstaves|claws|daggers)$/i;
const PDPS_TYPES = /^(one|two) hand (axes|swords)$|^bows$|^warstaves$/i; // physical DPS matters most (Awakened's list)

function veiledStat(idx, side) {
  const want = /^p/i.test(side) ? 'veiled' : 'of the veil';
  const e = Object.values(idx.veiled || {}).flat().find((x) => x.text.toLowerCase() === want);
  const id = e?.id || (want === 'veiled' ? 'veiled.mod_65000' : 'veiled.mod_63099');
  return { id, text: `Veiled ${/^p/i.test(side) ? 'Prefix' : 'Suffix'}`, display: null, value: null, negate: false, type: 'veiled', min: null, max: null };
}

/** Ritual bases (3.13 helmets, gloves and boots): their implicit makes the base; the price check searches the base
 *  and the implicit only */
const RITUAL_BASES = new Set([
  'Blizzard Crown', 'Winter Crown', 'Gale Crown', 'Archdemon Crown', 'Demon Crown', 'Imp Crown', 'Atonement Mask', 'Penitent Mask', 'Sorrow Mask',
  'Nexus Gloves', 'Aetherwind Gloves', 'Leyline Gloves',
  'Stormrider Boots', 'Brimstone Treads', 'Dreamquest Slippers', 'Duskwalk Slippers', 'Nightwind Slippers', 'Cloudwhisper Boots', 'Windbreak Boots', 'Darksteel Treads', 'Basemetal Treads',
]);

/** Every mod of the item as a search row, with its tier/range info (Ctrl+Alt+C) and template; nothing ticked. */
const BLIGHT_MAP = /\bBlight(ed|-ravaged) .*Map\b/i;

function itemRows(idx, item, tol) {
  const PF = require('./price-filters');
  const out = [];
  const kinds = item.flags?.unidentified ? ['enchant', 'implicit'] : ['enchant', 'implicit', 'fractured', 'explicit', 'crafted', 'scourge', 'crucible', 'mercenary', 'imbued', 'veiled', 'delve'];
  for (const kind of kinds) {
    const list = item.mods[kind] || [];
    const joined = new Set(); // a line already searched with the line before it
    list.forEach((m, i) => {
      if (joined.has(i)) return;
      const opts = { unique: item.rarity === 'Unique' };
      // two lines that are one stat on the trade site: a Large Cluster Jewel's "Claw Attacks …" + "Dagger Attacks …"
      // enchant (option 3 of "Added Small Passive Skills grant: …"), Axe + Sword, Staff + Mace, Bows, Trap + Mine
      if (list[i + 1] && /^Added Small Passive Skills grant/i.test(m)) {
        const two = `${m}\n${list[i + 1]}`.toLowerCase();
        const e = Object.values(idx[kind] || {}).flat().find((x) => String(x.text).toLowerCase() === two);
        if (e) {
          joined.add(i + 1);
          out.push({ id: e.id, text: `${m}\n${list[i + 1]}`, display: null, value: null, negate: false, type: kind, group: kind, enabled: false, special: true, min: null, max: null, meta: null });
          return;
        }
      }
      // a conqueror's map: "Map contains Al-Hezmin's Citadel" and its rewards line are one stat on the trade site
      if (/^Item Quantity increases amount of Rewards .+ drops by/i.test(m) && /^Map contains .+'s Citadel$/i.test(list[i - 1] || '')) return;
      // blighted maps: the trade site finds them by "Area is infested with Fungal Growths" (one stat with "Can be
      // Anointed up to # times": 3 on a Blighted map, 9 on a Blight-ravaged one, which is how the two are told apart)
      if (BLIGHT_MAP.test(item.typeLine || '') && (kind === 'implicit' || kind === 'explicit')) {
        if (/^(Map's Item Quantity Modifiers also affect Blight Chest|Can be Anointed up to|Natural inhabitants of this area have been removed)/i.test(m)) return;
        const e = /^Area is infested with Fungal Growths$/i.test(m) ? Object.values(idx.implicit || {}).flat().find((x) => /^area is infested with fungal growths(\n|$)/i.test(x.text)) : null;
        if (e) {
          const ravaged = /\bBlight-ravaged /i.test(item.typeLine || '');
          out.push({ id: e.id, text: ravaged ? 'Blight-ravaged (Anointed up to 9 times)' : 'Blighted (Anointed up to 3 times)', display: null, value: null, negate: false, type: 'implicit', group: 'implicit', enabled: true, special: true, blight: true, min: ravaged ? 9 : null, max: ravaged ? null : 3, meta: null });
          return;
        }
      }
      const cit = /^Map contains .+'s Citadel$/i.test(m) ? Object.values(idx.implicit || {}).flat().find((e) => e.text.toLowerCase().startsWith(`${m.toLowerCase()}\n`)) : null;
      if (cit) { out.push({ id: cit.id, text: m, display: null, value: null, negate: false, type: kind, group: kind, enabled: true, special: true, min: null, max: null, meta: null }); return; }
      const vp = /^Veiled (Prefix|Suffix)$/i.exec(m);
      // an unrevealed veiled mod: the trade site lists it as "Veiled" (prefix) or "of the Veil" (suffix)
      // Wickerman parts: the copy calls their buff an implicit, the trade site an explicit
      const alt = kind === 'fractured' || (kind === 'implicit' && item.itemClass === 'Viscera') ? 'explicit' : null;
      const hit = vp ? veiledStat(idx, vp[1]) : (matchMod(idx, m, kind, item.itemClass, opts) || (alt ? matchMod(idx, m, alt, item.itemClass, opts) : null));
      const meta = item.modMeta?.[kind]?.[i] || null;
      const row = hit ? { ...hit, group: kind, enabled: false } : { id: null, text: m, type: kind, group: kind, enabled: false, unmatched: true };
      row.meta = meta;
      if (meta?.foulborn) row.foulborn = true; // the Foulborn mod of a Foulborn unique (purple in the panel)
      // league mods (mercenary, imbued, Breach, eldritch…) make the item: they start ticked
      if (['scourge', 'crucible', 'mercenary', 'imbued', 'veiled', 'delve'].includes(kind) || meta?.special || vp) { row.special = true; if (!row.unmatched) row.enabled = true; }
      row.tpl = PF.tplOf(m);
      if (row.display != null) { row.min = PF.minOf(row.display, tol); row.max = null; takenAsMax(row, tol); }
      // a socketed support's level comes only in whole tiers (16, 18, 20): search the level the item has
      if (row.display != null && /Supported by Level \d+/i.test(row.text || '')) row.min = row.display;
      // a warrant's skills make it (ticked); its supports narrow it down (yours to tick); a tier isn't a number to search
      if (kind === 'mercenary' && item.warrant) { row.display = null; row.value = null; row.min = null; row.max = null; if (!row.unmatched) row.enabled = !!meta?.mercSkill; if (meta?.mercSupport) row.mercSupport = true; }
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
    // they are what a cluster sells for, so they start ticked
    for (const m of mods) if (/^1 Added Passive Skill is /i.test(m.text)) { m.min = null; m.max = null; m.display = null; if (!m.unmatched) m.enabled = true; }
    // Voices and other uniques: the number of jewel sockets is the price
    for (const m of mods) if (/^Adds \d+ Jewel Socket Passive Skills?/i.test(m.text) && m.display != null) { m.enabled = true; m.min = m.display; m.max = m.display; }
    if (props.ilvl && item.itemLevel) { props.ilvl.min = floorTo(item.itemLevel, [1, 50, 68, 75, 84]); props.ilvl.max = ceilTo(item.itemLevel, [49, 67, 74, 100]); props.ilvl.on = false; }
    return mods;
  }
  // Wickerman parts (Viscera): the exact part, its buff ticked at your roll or better; item level doesn't matter
  if (cls === 'Viscera') {
    props.base.on = true;
    if (props.ilvl) props.ilvl.on = false;
    // the buff is an implicit on the trade site, even when the stat list we have only knows it as an explicit
    return mods.filter((m) => m.group !== 'pseudo').map((m) => (m.group === 'implicit' && !m.unmatched
      ? { ...m, enabled: true, ...(/^explicit\./.test(m.id || '') ? { id: m.id.replace(/^explicit\./, 'implicit.'), type: 'implicit' } : {}) } : m));
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
    // a map is searched by its tier and influence: everything else starts unticked
    props.mapStats = [
      ['iiq', 'Item Quantity', false], ['iir', 'Item Rarity', false], ['packsize', 'Monster Pack Size', false],
    ].filter(([, k]) => n(k)).map(([key, label, on]) => ({ key, label, value: n(label), on, min: Math.floor(n(label) * (1 - tol)) }));
    const ids = { 'More Scarabs': 'pseudo.pseudo_map_more_scarab_drops', 'More Currency': 'pseudo.pseudo_map_more_currency_drops', 'More Divination Cards': 'pseudo.pseudo_map_more_card_drops', 'More Maps': 'pseudo.pseudo_map_more_map_drops' };
    const extra = Object.entries(ids).filter(([k]) => n(k)).map(([k, id]) => ({ id, text: `${k}: +${n(k)}%`, statText: `${k}: #%`, value: n(k), display: n(k), min: Math.floor(n(k) * (1 - tol)), max: null, negate: false, type: 'pseudo', group: 'pseudo', enabled: false }));
    if (props.mapTier) props.mapTier.on = true;
    // a Mirage (rare-only map mod) sells the map, so it is searched too
    // the yellow "Rare-only" mods (Area contains a Mirage / an Evocator / a buried Apex Sentinel…) are always searched
    for (const m of mods) m.enabled = (/^Area is influenced by|^Map contains .+'s Citadel$|^Area contains (an? )?(Empowered )?Mirage/i.test(m.text || '') || !!m.meta?.rareOnly) && !m.unmatched;
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
 * Rares and magic items: the mods a buyer searches for start ticked, like Awakened PoE Trade (tier 1 and 2
 * mods) and a little smarter. A mod is ticked when it is tier 1-2, or tier 3 and one of the mods that sell this
 * kind of item (movement speed on boots, +levels to gems, suppression…). The totals (life, resistances) stay
 * as they were. At most MAX_TICKED rows end up ticked, best tiers first, so the search doesn't come back empty.
 * Without tiers in the copy (a plain Ctrl+C) nothing more is ticked.
 */
const MAX_TICKED = 5;
const KEY_MODS = [
  [/boots/i, /movement speed/i],
  [/./, /to level of (all|socketed)/i],
  [/./, /suppress spell damage/i],
  [/amulet|ring|jewel|quiver|glove/i, /critical strike multiplier|critical damage bonus/i],
  [/amulet|ring|glove|quiver|belt|jewel/i, /(attack|cast) speed/i],
  [/belt|amulet|body/i, /to maximum energy shield|increased maximum life/i],
  [/glove|helmet|amulet|ring/i, /adds .* damage to (attacks|spells)/i],
  [/shield|helmet|body/i, /% chance to block/i],
  [/./, /% (of|to) all elemental resistances|to all attributes/i],
];
// rare jewels sell for a few mods; resistances, attributes and small damage mods don't move the price.
// The earlier a mod in this list, the more it counts; at most 3 are ticked, with the exact base.
const JEWEL_USEFUL = [
  /to maximum (fire|cold|lightning|chaos) resistance/i,
  /increased maximum life$|^\+?\d+ to maximum life$/i,
  /critical strike multiplier|critical damage bonus/i,
  /damage over time multiplier/i,
  /increased maximum energy shield$|to maximum energy shield$/i,
  /chance to suppress spell damage/i,
  /increased (attack|cast) speed$|total (attack|cast) speed/i,
  /minions? (deal|have) .*(damage|attack|cast speed)/i,
  /adds \d+ to \d+ \w+ damage to (attacks|spells)/i,
  /to all elemental resistances|chance to block/i,
];
function tickJewel(mods, item) {
  const useful = (m) => { const i = JEWEL_USEFUL.findIndex((re) => re.test(m.text || '')); return i < 0 ? 99 : i; };
  const cand = mods.filter((m) => !m.hidden && !m.unmatched && m.id && m.group !== 'implicit' && m.group !== 'enchant' && !m.special && !/^pseudo\.pseudo_number_of_empty/.test(m.id));
  for (const m of cand) m.enabled = false;
  cand.filter((m) => useful(m) < 99).sort((a, b) => useful(a) - useful(b) || (a.meta?.tier ?? 9) - (b.meta?.tier ?? 9)).slice(0, 3).forEach((m) => { m.enabled = true; });
}

// mods nobody pays for, whatever their tier: never ticked to start
const LOW_VALUE = /item rarity|rarity of items|light radius|stun and block recovery|attribute requirements|accuracy rating$|reflects \d+ physical damage|mana gained|life gained on kill|stun duration/i;

function tickBestMods(mods, item) {
  const cls = String(item.itemClass || '');
  if (/jewel/i.test(cls)) return tickJewel(mods, item);
  // a mod's tier; a total made of mods (movement speed, dexterity…) has the best tier among them
  const tierOf = (m) => (m.group === 'pseudo' ? (m.sources || []).reduce((t, x) => (x.meta?.tier != null && (t == null || x.meta.tier < t) ? x.meta.tier : t), null) : m.meta?.tier ?? null);
  const own = mods.filter((m) => !m.special && !m.hidden && !m.unmatched && m.id && (['explicit', 'crafted', 'fractured'].includes(m.group) || (m.group === 'pseudo' && !m.enabled && m.sources?.length)));
  if (!own.some((m) => tierOf(m) != null)) return; // no tiers known: leave it to you
  const key = (m) => KEY_MODS.some(([c, re]) => c.test(cls) && re.test(m.text || ''));
  for (const m of own) {
    const t = tierOf(m);
    m.enabled = t != null && !LOW_VALUE.test(m.text || '') && (t <= 2 || (t === 3 && key(m)));
  }
  // not too narrow: the totals that were ticked first, then the best tiers (key mods win a tie)
  const on = mods.filter((m) => m.enabled && !m.hidden && !m.special); // special mods are always kept
  if (on.length <= MAX_TICKED) return;
  const rank = (m) => (m.group === 'pseudo' && !own.includes(m) ? 0 : (tierOf(m) ?? 9) * 2 - (key(m) ? 1 : 0));
  on.sort((a, b) => rank(a) - rank(b)).slice(MAX_TICKED).forEach((m) => { m.enabled = false; });
}

/**
 * The price check's search for an item: { mods, props, presets }.
 *  presets.base (when offered): the "crafting base" search (exact base, item level, influences, implicits,
 *  fractured mods and top-tier mods), next to the default "finished item" search.
 */
// the rooms that make a temple worth running: ticked when they are open
const GOOD_TEMPLE_ROOMS = /^(Apex of Atzoatl|Locus of Corruption|Doryani's Institute)\b/i;

/**
 * A Chronicle of Atzoatl: one row per room, "Has Room: <room>" on the trade site with the option open (1) or
 * obstructed (2). The best rooms are ticked when open.
 */
function templeRooms(statsJson, item) {
  const rooms = new Map();
  for (const g of statsJson?.result || []) for (const e of g.entries || []) {
    const m = /^Has Room: (.+)$/.exec(e.text || '');
    if (m && /pseudo_temple/.test(e.id)) rooms.set(m[1].toLowerCase(), e);
  }
  const lines = [...(item.mods?.explicit || []), ...(item.mods?.implicit || [])];
  const out = [];
  let open = null;
  for (const raw of lines) {
    const t = String(raw).trim();
    if (/^Open Rooms:?$/i.test(t)) { open = true; continue; }
    if (/^Obstructed Rooms:?$/i.test(t)) { open = false; continue; }
    if (open == null || !t) continue;
    const e = rooms.get(t.toLowerCase());
    if (!e && !/^[A-Z][A-Za-z' -]{2,40}(?: \(Tier \d\))?$/.test(t)) continue; // flavour text and help lines, not rooms
    const good = GOOD_TEMPLE_ROOMS.test(t);
    out.push(e
      ? { id: `${e.id}|${open ? 1 : 2}`, text: `${t}${open ? '' : ' (obstructed)'}`, statText: e.text, display: null, value: null, negate: false, type: 'pseudo', group: open ? 'temple' : 'temple-closed', enabled: good && open, min: null, max: null, meta: null }
      : { id: null, text: t, type: 'pseudo', group: 'temple', enabled: false, unmatched: true, meta: null });
  }
  // the good rooms first, then open rooms, then obstructed ones
  const rank = (m) => (m.enabled ? 0 : m.group === 'temple' ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

// ---- Inscribed Ultimatum: searched by its reward and sacrifice (the trade site's Ultimatum filters) ----
const ULTI_LIFE = [30, 70, 120, 200];
const ULTI_CHALLENGE = { 'defeat waves of enemies': 'Exterminate', survive: 'Survival', 'protect the altar': 'Defense', 'stand in the stone circles': 'Conquer' };
function ultimatumOf(item) {
  const p = item.properties || {};
  const reward = String(p.Reward || '').trim();
  const input = String(p['Requires Sacrifice'] || '').replace(/\s+x\d+$/i, '').trim();
  const type = /divination card/i.test(reward) ? 'DoubleDivCards' : /currency/i.test(reward) ? 'DoubleCurrency' : /mirror/i.test(reward) ? 'MirrorRare' : reward ? 'ExchangeUnique' : null;
  return { challenge: ULTI_CHALLENGE[String(p.Challenge || '').trim().toLowerCase()] || null, challengeText: p.Challenge || null, reward: type, rewardText: reward, input, output: type === 'ExchangeUnique' ? reward : null };
}
/**
 * its modifiers ("Razor Dance"), each a trade stat, none ticked: the reward and sacrifice make the price. Its
 * "30% more Monster Life" line is the exception: more monster life means more reward, so it is ticked at its number
 * and marked as a key row.
 */
function ultimatumMods(statsJson, item) {
  const byName = new Map();
  const explicit = new Map();
  for (const g of statsJson?.result || []) {
    if (g.id === 'ultimatum') for (const e of g.entries || []) byName.set(e.text.toLowerCase(), e);
    if (g.id === 'explicit') for (const e of g.entries || []) if (!explicit.has(e.text.toLowerCase())) explicit.set(e.text.toLowerCase(), e);
  }
  const rows = [];
  for (const t of item.mods?.explicit || []) {
    const num = /^(\d+(?:\.\d+)?)% (more|increased) Monster (Life|Damage)$/i.exec(t);
    if (num) {
      const e = explicit.get(t.replace(num[1], '#').toLowerCase());
      const v = Number(num[1]);
      const key = /more monster life/i.test(t);
      // more monster life only comes as 30, 70, 120 or 200% (checked on the trade site, 3.30): searched at exactly
      // its own value, with the others one click away
      rows.push(e ? { id: e.id, text: t, statText: e.text, display: v, value: v, negate: false, type: 'explicit', group: 'ultimatum', enabled: key, key, min: key ? v : null, max: key ? v : null, meta: null, ...(key ? { choices: ULTI_LIFE } : {}) }
        : { id: null, text: t, type: 'ultimatum', group: 'ultimatum', enabled: false, unmatched: true, meta: null });
      continue;
    }
    if (!/^[A-Z][A-Za-z' -]+(?: [IV]+)?$/.test(t)) continue; // the explanation lines in brackets
    const e = byName.get(t.toLowerCase());
    rows.push(e ? { id: e.id, text: t, statText: e.text, display: null, value: null, negate: false, type: 'ultimatum', group: 'ultimatum', enabled: false, min: null, max: null, meta: null }
      : { id: null, text: t, type: 'ultimatum', group: 'ultimatum', enabled: false, unmatched: true, meta: null });
  }
  return rows.sort((a, b) => (b.key ? 1 : 0) - (a.key ? 1 : 0));
}

function prepareSearch(statsJson, item, { tolerance = 0.1 } = {}) {
  const PF = require('./price-filters');
  const kind = classify(item);
  const props = defaultProps(item);
  const idx = indexStats(statsJson);
  if (props.storedExp?.show) return { mods: [], props, presets: null }; // a Facetor's Lens has no mods, only its experience
  if (kind === 'gem') {
    // an imbued gem sells for its built-in support ("Supported by Level 1 Spell Echo"): searched, ticked
    const all = (statsJson?.result || []).flatMap((g) => g.entries || []).filter((e) => /^imbued\./.test(e.id || ''));
    // compared loosely (the copy can carry odd spaces or link marks): "supported by level 1 spell echo"
    const loose = (x) => String(x || '').toLowerCase().replace(/<[^>]*>|[{}]/g, '').replace(/[^a-z0-9']+/g, ' ').trim();
    const supOf = (x) => loose(x).replace(/^supported by level \d+ /, '').replace(/ support$/, '');
    const mods = (item.mods?.imbued || []).map((t) => {
      const e = all.find((x) => loose(x.text) === loose(t)) || all.find((x) => supOf(x.text) === supOf(t));
      return e ? { id: e.id, text: t, statText: e.text, display: null, value: null, negate: false, type: 'imbued', group: 'imbued', enabled: true, special: true, min: null, max: null, meta: null }
        : { id: null, text: t, type: 'imbued', group: 'imbued', enabled: false, unmatched: true, meta: null };
    });
    return { mods, props, presets: null };
  }
  if (/^Chronicle of Atzoatl$/i.test(item.typeLine || item.baseType || '')) return { mods: templeRooms(statsJson, item), props, presets: null };
  if (/^Inscribed Ultimatum$/i.test(item.typeLine || item.baseType || '')) {
    // a unique swap is priced by the unique it gives: the life row (more reward) doesn't matter for it
    const mods = ultimatumMods(statsJson, item);
    if (props.ultimatum?.output) for (const m of mods) m.enabled = false;
    return { mods, props, presets: null };
  }
  const rows = itemRows(idx, item, tolerance);
  const plain = kind === 'rare' || kind === 'magic' || kind === 'normal';
  const cls = String(item.itemClass || '');

  // the item's own numbers: defences and weapon DPS at 20% quality (their local mods fold into them)
  if (plain) {
    const def = PF.defenceProps(item, rows);
    if (def.length) {
      // the defences are ticked (like a weapon's DPS) when a defence mod on the item is tier 2 or better;
      // otherwise the armour number says little about the price
      const goodDef = rows.some((r) => r.folded && ['explicit', 'crafted', 'fractured'].includes(r.group) && r.meta?.tier != null && r.meta.tier <= 2 && /armour|evasion|energy shield/i.test(r.text || ''));
      for (const d of def) d.on = goodDef;
      props.defence = def;
    }
    const w = PF.weaponProps(item, rows, weaponDps(item));
    if (w && props.dps?.show) {
      props.dps.values = w;
      const both = w.phys > 0 && w.ele > 0;
      props.dps.mode = MELEE.test(cls) ? 'phys' // melee weapons: physical DPS only (the owner's choice)
        : PDPS_TYPES.test(cls) && w.phys / w.total >= 0.67 ? 'phys' : w.ele / w.total >= 0.67 ? 'ele' : both ? 'total' : w.phys ? 'phys' : 'ele';
      props.dps.min = Math.floor(w[props.dps.mode] * 0.9);
      props.dps.on = true;
      // three numbers, each with its own tick: physical, elemental and total DPS, ticked only for good damage mods
      props.dps.kinds = PF.dpsTicks(item, rows, w, props.dps.mode);
      props.dps.on = Object.values(props.dps.kinds).some((k) => k.on);
    }
  }
  // totals instead of the mods that add up to them
  const { pseudo, consumed } = PF.pseudoTotals(rows, item, idx.pseudo || {}, normTemplate, tolerance);
  // mods counted in a total or in the DPS / defence numbers start hidden and unticked; the panel can show them
  let mods = [...pseudo, ...rows.map((r) => (consumed.has(r) || r.folded ? { ...r, enabled: false, hidden: true, counted: r.folded ? 'item' : 'total' } : r))];
  // what is ticked to start
  if (kind === 'unique') {
    PF.uniqueRolls(mods, item, tolerance);
    // whole-number rolls get a whole-number minimum (4.8 -> 4)
    for (const m of mods) if (Number.isInteger(m.display) && m.min != null && !Number.isInteger(m.min)) m.min = Math.floor(m.min);
    for (const m of mods) if (KEY_UNIQUE_ROLLS.some((re) => re.test(m.text))) { m.enabled = true; m.min = m.display; m.hidden = false; }
    // a Foulborn unique sells for its Foulborn mod: ticked (searchable ones)
    for (const m of mods) if (m.foulborn && m.id && !m.unmatched) { m.enabled = true; m.hidden = false; }
    // Watcher's Eye: the aura mods are the price (the life / mana / energy shield ones hardly matter)
    if (/^Watcher's Eye$/i.test(item.name || '')) for (const m of mods) { m.enabled = /while affected by/i.test(m.text || '') && !m.unmatched && !!m.id; if (m.enabled) m.hidden = false; }
  }
  // open prefixes and suffixes: searchable as "at least this many empty" (unticked to start)
  const open = kind === 'map' ? null : PF.emptyAffix(item); // a map's open slots don't change its price
  for (const side of ['prefix', 'suffix']) {
    const n = open?.[side];
    if (!n) continue;
    const Side = side === 'prefix' ? 'Prefix' : 'Suffix';
    mods.push({ id: `pseudo.pseudo_number_of_empty_${side}_mods`, text: n === 1 ? `Has an open ${side}` : `${n} open ${side}es`, statText: `# Empty ${Side} Modifiers`, value: n, display: n, min: n, max: null, negate: false, type: 'pseudo', group: 'pseudo', enabled: false });
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
  if ((kind === 'rare' || kind === 'magic') && !/flask|map|cluster/i.test(cls + (item.baseType || ''))) {
    tickBestMods(mods, item);
    // a jewel's base decides what it can roll: Cobalt, Crimson, Viridian, Prismatic, Abyss bases…
    if (/jewel/i.test(cls) && props.base) props.base.on = true;
    // a single fire / cold / lightning resistance (or maximum resistance) can be swapped with Harvest:
    // the search takes any of the three at that value
    if (/jewel/i.test(cls)) {
      const RES = /^(\+\d+(?:\.\d+)?% to (?:maximum )?)(Fire|Cold|Lightning)( Resistance)$/i;
      for (const m of mods) {
        const r = RES.exec(m.text || '');
        if (!r || !m.id || m.group === 'pseudo') continue;
        const ids = ['Fire', 'Cold', 'Lightning'].map((el) => matchMod(idx, `${r[1]}${el}${r[3]}`, m.group, cls)?.id).filter(Boolean);
        if (ids.length === 3) { m.anyOf = ids; m.text = `${r[1]}Fire, Cold or Lightning${r[3]} (any: Harvest can swap it)`; }
      }
    }
  }
  // overquality (more than 20%): the base and the quality are the price, nothing else
  if (plain && (item.quality || 0) > 20 && !/flask|map/i.test(cls)) {
    for (const m of mods) m.enabled = false;
    props.base.on = true;
    if (props.quality) { props.quality.on = true; props.quality.min = item.quality; props.quality.show = true; }
    for (const k of ['dps', 'ilvl', 'links']) if (props[k] && 'on' in props[k]) props[k].on = false;
    if (Array.isArray(props.defence)) for (const d of props.defence) d.on = false;
    for (const k of Object.keys(props.influences || {})) props.influences[k] = false;
  } else
  // enchantments on gear (labyrinth, Harvest, Heist…) start ticked, like PoE Overlay does
  if (plain && !/cluster|flask|map/i.test(cls + (item.baseType || ''))) for (const m of mods) if (m.group === 'enchant' && !m.hidden && !m.unmatched && m.id) m.enabled = true;
  // a fractured rare or magic item sells for its fractured mod on that base: only those, with the exact base
  if ((kind === 'rare' || kind === 'magic') && mods.some((m) => m.group === 'fractured' && !m.unmatched)) {
    for (const m of mods) m.enabled = m.group === 'fractured' && !m.unmatched;
    for (const m of mods) if (m.group === 'fractured') m.hidden = false;
    props.base.on = true;
    for (const k of ['dps', 'defence', 'ilvl', 'links', 'quality']) if (props[k] && 'on' in props[k]) props[k].on = false;
    if (Array.isArray(props.defence)) for (const d of props.defence) d.on = false;
  }
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
  // magic items: their one or two mods at the roll they have (a "7% maximum Life" jewel is searched as 7%+), no totals
  if (kind === 'magic' && !/flask|tincture/i.test(cls) && !item.flags?.unidentified) {
    for (const m of mods) {
      if (m.group === 'pseudo') { m.enabled = false; continue; }
      if (['explicit', 'crafted', 'fractured'].includes(m.group) && m.id && !m.unmatched && !LOW_VALUE.test(m.text || '')) { m.enabled = true; m.hidden = false; if (m.display != null) m.min = m.display; }
    }
  }
  // how many prefixes / suffixes the item can have (the panel's "1 of 2"), and "only rares" for the rarity chip
  props.maxAffix = item.rarity === 'Magic' ? 1 : /jewel/i.test(`${cls} ${item.baseType || ''}`) ? 2 : 3;
  // every item is searched from its own item level up (86 and over is the same for every mod), maps excepted:
  // their tier is what counts
  // (identified uniques too are left out: their mods don't depend on it, and it only hides cheaper listings;
  // and invitations: any one opens the same fight)
  if (item.itemLevel && kind !== 'map' && kind !== 'gem' && !(kind === 'unique' && !item.flags?.unidentified) && !/heist contract|viscera/i.test(cls) && !/ Invitation$/.test(item.typeLine || '')) {
    props.ilvl = { ...(props.ilvl || {}), on: true, min: Math.min(item.itemLevel, 86), max: null, show: true };
  }
  // Ritual bases (Stormrider Boots, Nexus Gloves, Blizzard Crown…): the base and its implicit are what sells; nothing else is ticked
  if (RITUAL_BASES.has(item.baseType) && ['Rare', 'Magic', 'Normal'].includes(item.rarity) && !item.flags?.unidentified) {
    for (const m of mods) {
      const imp = m.group === 'implicit' && m.id && !m.unmatched;
      m.enabled = imp;
      // the implicit is the same on every one of these boots (the roll barely moves): no number to match
      if (imp) { m.hidden = false; m.min = null; m.max = null; }
    }
    if (props.base) props.base.on = true;
    for (const k of ['quality', 'links', 'dps']) if (props[k] && typeof props[k] === 'object') props[k].on = false;
    for (const d of props.defence || []) d.on = false;
  }
  // Necropolis corpses: searched by name only (their monster mods don't matter for the price)
  if (/^corpses$/i.test(cls)) {
    mods.length = 0;
    if (props.ilvl) { props.ilvl.on = false; props.ilvl.show = false; }
    props.maxAffix = 0;
  }
  // a blighted map's implicits are what finds it on the trade site: always searched
  for (const m of mods) if (m.blight) { m.enabled = true; m.hidden = false; }
  // a vestigial implicit is what sets a vestigial item apart: always searched
  for (const m of mods) if (m.meta?.vestigial && !m.unmatched) m.enabled = true;
  return { mods, props, presets };
}

/**
 * Fetched listings, cheapest first, as Awakened PoE Trade shows them: the same seller at the same price (or
 * right after their own listing) grouped as one row with a count; each with when it was listed and whether the
 * seller is online or AFK. { prices, min, median } (min/median in chaos, counting each listing once).
 */
/** What an Inscribed Ultimatum asks you to sacrifice ("Chaos Orb ×10"), from a fetched listing; null for other items. */
function sacrificeOf(item) {
  const pr = (item?.properties || []).find((x) => /^Requires Sacrifice/i.test(x?.name || ''));
  if (!pr) return null;
  const v = (pr.values || []).map((x) => String(x?.[0] || '').trim()).filter(Boolean);
  if (!v.length) return null;
  const n = /^x(\d+)$/i.exec(v[1] || '');
  return n ? `${v[0]} ×${n[1]}` : v.join(' ');
}

/** Jewels of every kind (normal, abyss, cluster). */
function isJewel(item) {
  return /^(Abyss )?Jewels?$/i.test(item?.itemClass || '') || /\bJewel$/i.test(item?.baseType || item?.typeLine || '');
}

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
    const x = { amount: p.amount, currency: p.currency, chaos, seller: acc.name, ign: acc.lastCharacterName || null, indexed: r.listing.indexed, status, mine: !!me && acc.name === me, times: 1, whisper: typeof r.listing.whisper === 'string' ? r.listing.whisper.slice(0, 400) : null, note: sacrificeOf(r.item) };
    flat.push(x);
    const same = rows.findIndex((y, i) => y.seller === x.seller && y.note === x.note && ((y.amount === x.amount && y.currency === x.currency) || rows.length - i <= 2));
    if (rows.length && same >= 0 && status !== 'merchant') rows[same].times += 1;
    else rows.push(x);
  }
  const chaosVals = flat.map((p) => p.chaos).filter((x) => x != null).sort((a, b) => a - b);
  const median = chaosVals.length ? chaosVals[Math.floor(chaosVals.length / 2)] : null;
  return { prices: rows, min: chaosVals[0] ?? null, median, count: flat.length };
}

/** The trade site's type for a gem: a transfigured one as { option, discriminator }; null when the list doesn't know it. */
/** The trade site's type for a Mercenary Warrant of this build ("Combatant", "Infamous Combatant"). */
function warrantTradeType(itemsJson, build) {
  const want = `mercenary warrant (${String(build || '').toLowerCase()})`;
  for (const g of itemsJson?.result || []) for (const e of g.entries || []) {
    if (e.disc === 'mercenary_warrant' && String(e.text || '').toLowerCase() === want) return { option: e.type, discriminator: e.disc };
  }
  return null;
}

function gemTradeType(itemsJson, name) {
  const want = String(name || '').toLowerCase();
  for (const g of itemsJson?.result || []) {
    if (g.id !== 'gem' && !/gem/i.test(g.label || '')) continue;
    for (const e of g.entries || []) {
      if (String(e.text || e.type || '').toLowerCase() !== want) continue;
      return e.disc ? { option: e.type, discriminator: e.disc } : e.type;
    }
  }
  return null;
}

/** The trade site's name for a Wickerman part: the plain name ("Hag's Stomach") when it lists that, else the full
 *  name ("Greater Golemic Stone"); null when its item list has neither */
function partTradeType(itemsJson, typeLine) {
  const full = String(typeLine || '');
  const plain = full.replace(/^(Lesser|Greater|Grand|Superior|Perfect|Imperfect)\s+/i, '');
  const names = new Set();
  for (const g of itemsJson?.result || []) for (const e of g.entries || []) names.add(String(e.type || e.text || '').toLowerCase());
  if (names.has(plain.toLowerCase())) return plain;
  if (names.has(full.toLowerCase())) return full;
  return null;
}

module.exports = { warrantTradeType, gemTradeType, partTradeType, prepareSearch, weaponDps, DPS_MOD, DPS_FILTERS, indexStats, matchItemMods, matchMod, buildQuery, summarizeListings, normTemplate, defaultProps, statRange, resistanceTotals, applyDefaults, CATEGORIES, TRADE_STATUSES };
