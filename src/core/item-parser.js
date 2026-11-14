'use strict';
/**
 * Parses the text PoE puts on the clipboard when you press Ctrl+C over an item
 * (or Ctrl+Alt+C for the "advanced" description with mod tiers).
 *
 * Sections are separated by "--------". We extract what pricing, trade search,
 * price check and the filter explainer need. Unknown lines are kept in
 * `mods.explicit` so nothing is lost.
 */

const SEP = '--------';

const RARITIES = ['Normal', 'Magic', 'Rare', 'Unique', 'Currency', 'Divination Card', 'Gem', 'Quest'];

const FLAG_LINES = {
  'Corrupted': 'corrupted',
  'Unidentified': 'unidentified',
  'Mirrored': 'mirrored',
  'Split': 'split',
  'Synthesised Item': 'synthesised',
  'Fractured Item': 'fractured',
  'Searing Exarch Item': 'searing',
  'Eater of Worlds Item': 'eater',
  'Foulborn Item': 'foulborn',
};

const INFLUENCES = ['Shaper', 'Elder', 'Crusader', 'Hunter', 'Redeemer', 'Warlord'];

const MOD_SUFFIX_TYPES = [
  ['(implicit)', 'implicit'],
  ['(crafted)', 'crafted'],
  ['(fractured)', 'fractured'],
  ['(enchant)', 'enchant'],
  ['(scourge)', 'scourge'],
  ['(crucible)', 'crucible'],
];

function isPoeItemText(text) {
  if (typeof text !== 'string') return false;
  const t = text.replace(/\r/g, '');
  return /^(Item Class: .+\n)?Rarity: .+\n/m.test(t) && t.includes(SEP);
}

function toNumber(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[,+%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** "Stack Size: 1,234/5,000" -> {current, max} */
function parseStack(v) {
  const m = /([\d,.]+)\s*\/\s*([\d,.]+)/.exec(v);
  if (!m) return null;
  return { current: toNumber(m[1]), max: toNumber(m[2]) };
}

/** "R-G-B B-W" -> {sockets: 5, links: 3, groups: [3,2], colors} */
function parseSockets(v) {
  const groups = v.trim().split(/\s+/).filter(Boolean);
  let sockets = 0;
  let links = 0;
  const sizes = [];
  const colors = { R: 0, G: 0, B: 0, W: 0, A: 0, D: 0 };
  for (const g of groups) {
    const parts = g.split('-').filter(Boolean);
    sizes.push(parts.length);
    sockets += parts.length;
    links = Math.max(links, parts.length);
    for (const c of parts) if (c in colors) colors[c]++;
  }
  return { sockets, links, groups: sizes, colors, raw: v.trim() };
}

function stripModSuffix(line) {
  for (const [suffix, type] of MOD_SUFFIX_TYPES) {
    if (line.endsWith(suffix)) return { text: line.slice(0, -suffix.length).trim(), type };
  }
  return { text: line.trim(), type: 'explicit' };
}

/** Advanced copy (Ctrl+Alt+C) puts headers like `{ Prefix Modifier "Hale" (Tier: 3) — Life }` */
function isAdvancedHeader(line) {
  return /^\{.*\}$/.test(line.trim());
}

function parseItem(rawText) {
  if (!isPoeItemText(rawText)) return null;
  const text = rawText.replace(/\r/g, '').trim();
  const sections = text.split(`\n${SEP}\n`).map((s) => s.split('\n').map((l) => l.trimEnd()).filter((l) => l.length));

  const item = {
    raw: text,
    itemClass: null,
    rarity: null,
    name: null,
    baseType: null,
    typeLine: null,
    itemLevel: null,
    quality: null,
    stack: null,
    sockets: null,
    gemLevel: null,
    mapTier: null,
    areaLevel: null,
    requirements: {},
    properties: {},
    influences: [],
    flags: {},
    mods: { enchant: [], implicit: [], explicit: [], crafted: [], fractured: [], scourge: [], crucible: [] },
    note: null,
    transfigured: false,
    modNames: [],
    // Ctrl+Alt+C: per mod line (same index as item.mods[kind]) its tier, prefix/suffix and roll ranges
    modMeta: { enchant: [], implicit: [], explicit: [], crafted: [], fractured: [], scourge: [], crucible: [] },
    advanced: false,
  };

  // --- Header section ---
  const header = sections[0] || [];
  let hi = 0;
  if (header[hi] && header[hi].startsWith('Item Class:')) {
    item.itemClass = header[hi].slice('Item Class:'.length).trim();
    hi++;
  }
  if (header[hi] && header[hi].startsWith('Rarity:')) {
    item.rarity = header[hi].slice('Rarity:'.length).trim();
    hi++;
  }
  const names = header.slice(hi);
  if (names.length >= 2) {
    item.name = names[0];
    item.baseType = names[1];
    item.typeLine = names[1];
  } else if (names.length === 1) {
    item.name = names[0];
    item.typeLine = names[0];
    item.baseType = names[0];
  }

  // Magic items have affixes glued to the base; we keep typeLine and let the
  // pricer/trade fall back to fuzzy matching against known bases.
  if (item.rarity === 'Magic' && names.length === 1) item.baseType = null;

  const remaining = sections.slice(1);
  const modSections = [];

  for (const sec of remaining) {
    // Flag-only lines can appear in any section
    const nonFlag = [];
    for (const line of sec) {
      if (FLAG_LINES[line]) {
        item.flags[FLAG_LINES[line]] = true;
        continue;
      }
      const inf = INFLUENCES.find((i) => line === `${i} Item`);
      if (inf) {
        item.influences.push(inf);
        continue;
      }
      nonFlag.push(line);
    }
    if (!nonFlag.length) continue;

    const first = nonFlag[0];
    if (first.startsWith('Requirements:') || first === 'Requires:') {
      for (const line of nonFlag.slice(1)) {
        const m = /^([A-Za-z]+):\s*(\d+)/.exec(line);
        if (m) item.requirements[m[1].toLowerCase()] = Number(m[2]);
      }
      continue;
    }
    if (first.startsWith('Requires Level')) {
      const m = /Level (\d+)/.exec(first);
      if (m) item.requirements.level = Number(m[1]);
      continue;
    }

    // a section of mod lines ("Added Small Passive Skills grant: … (enchant)" has a colon but is a mod)
    if (nonFlag.some((l) => /\((enchant|implicit|crafted|fractured)\)$/.test(l))) { modSections.push(nonFlag); continue; }
    let consumed = false;
    for (const line of nonFlag) {
      // heist contracts: "Requires Lockpicking (Level 5)"
      const job = /^Requires (.+?) \(Level (\d+)\)$/.exec(line);
      if (job) { (item.heistJobs ||= []).push({ job: job[1], level: Number(job[2]) }); consumed = true; continue; }
      const kv = /^([^:]+):\s*(.+)$/.exec(line);
      if (!kv) continue;
      const [, key, valRaw] = kv;
      const val = valRaw.replace(/\s*\(augmented\)|\s*\(unmet\)/g, '').trim();
      switch (key) {
        case 'Item Level': item.itemLevel = toNumber(val); consumed = true; break;
        case 'Quality': item.quality = toNumber(val); consumed = true; break;
        case 'Stack Size': item.stack = parseStack(val); consumed = true; break;
        case 'Sockets': item.sockets = parseSockets(val); consumed = true; break;
        case 'Level':
          if (item.rarity === 'Gem') item.gemLevel = toNumber(val);
          consumed = true;
          break;
        case 'Map Tier': item.mapTier = toNumber(val); consumed = true; break;
        case 'Area Level': item.areaLevel = toNumber(val); consumed = true; break;
        case 'Note': item.note = val; consumed = true; break;
        default:
          // Generic property lines (Armour, Evasion Rating, Item Quantity, etc.)
          if (/^[A-Z][A-Za-z' ]+$/.test(key) && !/[+#%]/.test(key) && key.length < 40) {
            item.properties[key] = val;
            consumed = true;
          }
      }
    }
    if (consumed) continue;

    modSections.push(nonFlag);
  }

  // Uniques carry flavour text as the last mod-like section; it never contains digits.
  if (item.rarity === 'Unique' && modSections.length > 1) {
    const last = modSections[modSections.length - 1];
    if (last.every((l) => !/\d/.test(l) && !/\((implicit|crafted|enchant)\)$/.test(l))) modSections.pop();
  }

  // Gems: these sections are the skill's description and stats, not affixes. Pricing a gem only
  // needs its level, quality and corruption (and its name for transfigured gems).
  if (item.rarity === 'Gem') {
    item.gemText = modSections.flat();
    modSections.length = 0;
  }

  let headerN = 0; // one per mod (a hybrid mod has two lines under one header)
  for (const sec of modSections) {
    // Ctrl+Alt+C: the header says what the lines below it are ("{ Corruption Implicit Modifier }"),
    // and those lines carry no "(implicit)" suffix
    let headerKind = null;
    let header = null;
    for (const line of sec) {
      // Reminder text like "(Lucky things are rolled twice and the best result used)" isn't a mod
      if (/^\(.*\)$/.test(line.trim())) continue;
      if (isAdvancedHeader(line)) {
        // { Prefix Modifier "Hale" (Tier: 3) — Life }  -> "Hale"
        const nm = /Modifier\s+"([^"]+)"/.exec(line);
        if (nm) item.modNames.push(nm[1]);
        item.advanced = true;
        const tierM = /\((?:Tier|Rank):\s*(\d+)\)/.exec(line);
        headerN += 1;
        header = { n: headerN, tier: tierM ? Number(tierM[1]) : null, gen: /\bPrefix\b/.test(line) ? 'prefix' : /\bSuffix\b/.test(line) ? 'suffix' : null, unique: /\bUnique Modifier\b/.test(line) };
        headerKind = /\bImplicit Modifier\b/i.test(line) ? 'implicit' : /\bEnchant(?:ment)? Modifier\b/i.test(line) ? 'enchant'
          : /\bMaster Crafted\b|\bCrafted\b/i.test(line) ? 'crafted' : /\bScourge\b/i.test(line) ? 'scourge' : null;
        continue;
      }
      // Ctrl+Alt+C writes roll ranges into the line: "+45(40-49) to maximum Life" -> "+45 to maximum Life"
      const clean = line.replace(/\s*—\s*Unscalable Value$/, '').replace(/(\d)\((?:-?\d+(?:\.\d+)?)(?:-(?:-?\d+(?:\.\d+)?))?\)/g, '$1')
        // and the possible choices for random mods: "Level 30 Ice Bite(Greater Multiple Projectiles-Hallow)" -> "Level 30 Ice Bite"
        .replace(/([A-Za-z])\([^()]*[A-Za-z][^()]*-[^()]*\)/g, '$1');
      const stripped = stripModSuffix(clean);
      const modText = stripped.text;
      const type = stripped.type === 'explicit' && headerKind ? headerKind : stripped.type;
      // Skip help text that appears on currency/div cards/maps
      if (/^(Right click|Place into|Travel to (?:this|a) Map|Maps can only be used|Shift click|Can be used|Use this|This is a)/i.test(modText)) continue;
      item.mods[type].push(modText);
      // the rolls with their ranges: "Adds 40(29-40) to 68(58-68)" -> [{value 40, min 29, max 40}, {68, 58, 68}]
      const rolls = [];
      const re = /(-?\d+(?:\.\d+)?)\((-?\d+(?:\.\d+)?)(?:-(-?\d+(?:\.\d+)?))?\)/g;
      let rm;
      while ((rm = re.exec(line))) rolls.push({ value: Number(rm[1]), min: Number(rm[2]), max: rm[3] != null ? Number(rm[3]) : Number(rm[2]) });
      item.modMeta[type][item.mods[type].length - 1] = header ? { ...header, rolls } : (rolls.length ? { tier: null, gen: null, rolls } : null);
    }
  }

  // Maps copied from the game carry their tier only in the base name now: "Map (Tier 16)"
  if (item.mapTier == null) {
    const t = /\(Tier (\d+)\)\s*$/.exec(item.baseType || item.typeLine || '');
    if (t && (/map/i.test(item.itemClass || '') || /\bMap\b/.test(item.baseType || item.typeLine || ''))) item.mapTier = Number(t[1]);
  }

  // Gems: transfigured gems have a different name on the base line
  if (item.rarity === 'Gem' && /\bof\b/.test(item.typeLine || '')) item.transfigured = true;

  if (item.rarity === 'Magic' && !item.baseType) item.baseType = item.typeLine;
  return item;
}

/** Category used for routing prices and filters. */
function classify(item) {
  if (!item) return 'unknown';
  const cls = (item.itemClass || '').toLowerCase();
  const r = item.rarity;
  if (r === 'Divination Card' || cls === 'divination cards') return 'divination';
  if (r === 'Gem' || cls.includes('gem')) return 'gem';
  if (cls === 'maps' || item.mapTier != null) return r === 'Unique' ? 'unique-map' : 'map';
  if (r === 'Currency' || cls.includes('currency') || cls === 'stackable currency') return 'currency';
  if (cls.includes('fragment') || cls === 'map fragments' || cls === 'misc map items') return 'fragment';
  if (r === 'Unique') return 'unique';
  if (r === 'Rare') return 'rare';
  if (r === 'Magic') return 'magic';
  if (r === 'Normal') return 'normal';
  return 'unknown';
}

/** Replace numbers with # to compare mod text against trade stat templates. */
function modTemplate(mod) {
  return mod
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/#\s*to\s*#/g, '# to #')
    .trim();
}

function modValues(mod) {
  return (mod.match(/[+-]?\d+(?:\.\d+)?/g) || []).map(Number);
}

/** Ctrl+Alt+C text as a plain copy: no "{ Prefix Modifier … }" lines, no roll ranges ("45(40-49)" -> "45"). */
function plainItemText(text) {
  return String(text || '').replace(/\r/g, '').split('\n')
    .filter((l) => !isAdvancedHeader(l))
    .map((l) => l.replace(/(\d)\((?:-?\d+(?:\.\d+)?)(?:-(?:-?\d+(?:\.\d+)?))?\)/g, '$1').replace(/\s*—\s*Unscalable Value$/, ''))
    .join('\n');
}

module.exports = { plainItemText, parseItem, isPoeItemText, classify, modTemplate, modValues, parseSockets, SEP, RARITIES };
