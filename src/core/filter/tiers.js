'use strict';
/**
 * FilterBlade-style tiers on top of a NeverSink-based filter.
 *
 * NeverSink (and every FilterBlade export of it) tags blocks like
 *     Show # %D5 $type->currency $tier->t1
 * Blocks with the same $type and $tier form a tier. We read those, show them
 * like FilterBlade does, and apply your edits as a *patch*:
 *
 *   patch = {
 *     moves:  { "currency\tExalted Orb": "t1", "divination\tRain of Chaos": "__hide__" },
 *     styles: { "currency|t2": { text, border, background, fontSize, sound|customSound, beam, icon } },
 *   }
 *
 *   actions: { "endgameflasks|utility85": "Show" | "Hide" | "Off" }   // Off = commented out
 *
 * The patch is applied to a fresh copy of your filter every time, so a new
 * FilterBlade download never loses your changes and the original file is never touched.
 */

const { parse, serialize, blocks, parseLine, renderBlock, renderStyleLines, styleFromLines, STYLE_KEYWORDS } = require('./parser');

const HIDE = '__hide__';
const HIDDEN_TIER = 'poehelper-hidden';
const NEVER = 'PoE Helper: moved to another tier';
// an empty tier that FilterBlade emptied (not you): still off in FilterBlade, but items can go in
const EMPTY = 'PoE Helper: empty tier';
const isMarker = (v) => v === NEVER || v === EMPTY;
const STYLE_SET = new Set(STYLE_KEYWORDS);
// an exception block: conditions beyond Class and Rarity (StackSize, LinkedSockets, HasInfluence...)
const isSpecialBlock = (b) => b.lines.some((l) => l.keyword && !['Class', 'Rarity', 'BaseType', 'Continue'].includes(l.keyword) && !STYLE_SET.has(l.keyword));

function tagsOf(block) {
  const c = block.headerComment || '';
  const type = /\$type->(\S+)/.exec(c)?.[1];
  const tier = /\$tier->(\S+)/.exec(c)?.[1];
  return type && tier ? { type, tier } : null;
}

function baseLines(block) {
  return block.lines.filter((l) => l.keyword === 'BaseType' && (!l.op || l.op === '==' || l.op === '='));
}

const crOf = (raw) => (raw.endsWith('\r') ? '\r' : '');

function indentOf(block) {
  const l = block.lines.find((x) => x.keyword);
  return l ? /^[ \t]*/.exec(l.raw)[0] || '\t' : '\t';
}

function quoteList(values) {
  return values.map((v) => `"${String(v).replace(/"/g, '')}"`).join(' ');
}

// Blocks that pick items by class alone stand for every base of the class; their bases are listed so
// you can switch single ones off (the block then gets a BaseType line with the rest)
const CLASS_BASES = {
  'Utility Flasks': ['Quicksilver Flask', 'Bismuth Flask', 'Stibnite Flask', 'Amethyst Flask', 'Ruby Flask', 'Sapphire Flask', 'Topaz Flask', 'Silver Flask', 'Aquamarine Flask', 'Granite Flask', 'Jade Flask', 'Quartz Flask', 'Sulphur Flask', 'Basalt Flask', 'Diamond Flask', 'Gold Flask', 'Corundum Flask', 'Iron Flask'],
  'Abyss Jewels': ['Searching Eye Jewel', 'Murderous Eye Jewel', 'Hypnotic Eye Jewel', 'Ghastly Eye Jewel'],
  Tinctures: ['Rosethorn Tincture', 'Prismatic Tincture', 'Ironwood Tincture', 'Fulgurite Tincture', 'Borealwood Tincture', 'Ashbark Tincture', 'Poisonberry Tincture', 'Blood Sap Tincture', 'Sporebloom Tincture', 'Oakbranch Tincture'],
};
// conditions you can change on a tier, FilterBlade style: "at least / at most / exactly / any"
const NUMBER_CONDS = ['GemLevel', 'ItemLevel', 'AreaLevel', 'Quality'];
const impliedBases = (lines) => {
  const cls = lines.find((l) => l.keyword === 'Class');
  if (!cls) return null;
  const list = cls.values.flatMap((v) => CLASS_BASES[v] || (Object.keys(CLASS_BASES).find((k) => k.toLowerCase() === String(v).toLowerCase()) ? CLASS_BASES[Object.keys(CLASS_BASES).find((k) => k.toLowerCase() === String(v).toLowerCase())] : []));
  return list.length ? list : null;
};

/** Read tiers from a parsed filter. */
function extractTiers(doc) {
  const types = new Map();
  for (const b of blocks(doc)) {
    const tags = tagsOf(b);
    if (!tags) continue;
    if (!types.has(tags.type)) types.set(tags.type, { type: tags.type, tiers: new Map() });
    const t = types.get(tags.type);
    const key = `${tags.type}|${tags.tier}`;
    if (!t.tiers.has(key)) {
      t.tiers.set(key, {
        key,
        type: tags.type,
        tier: tags.tier,
        action: b.action,
        line: b.startLine,
        bases: [],
        hasBaseList: false,
        conditions: b.lines.filter((l) => l.keyword && l.keyword !== 'BaseType' && !STYLE_SET.has(l.keyword) && l.keyword !== 'Continue').map((l) => l.raw.trim()),
        style: styleFromLines(b.lines),
        blockCount: 0,
        offCount: 0,
        generated: tags.tier === HIDDEN_TIER,
        // a tier you made in PoE Helper ("Giga" above Tier 1): only you put items in it
        own: tags.tier !== HIDDEN_TIER && tags.tier.startsWith('poehelper-'),
        // Exception tiers add extra conditions (StackSize >= 3, LinkedSockets 6, Sockets < 1...).
        // Moving a base into one would silently add those, so they aren't move targets.
        special: false,
        group: tags.type.split('->')[0],
      });
      const t0 = t.tiers.get(key);
      t0.special = t0.conditions.some((c) => !/^(Class|Rarity)\b/.test(c));
      const ss = b.lines.find((l) => l.keyword === 'StackSize');
      if (ss) t0.stackSize = { op: ss.op || '>=', value: Number(ss.values?.[0]) };
      // item level, area level and quality as the filter has them (missing = any)
      t0.numbers = {};
      for (const k of NUMBER_CONDS) {
        // area level: the upper bound ("AreaLevel <= 67", the campaign) is the one that matters
        const all = b.lines.filter((x) => x.keyword === k);
        const l = (k === 'AreaLevel' && all.find((x) => /^</.test(x.op || ''))) || all[0];
        t0.numbers[k] = l ? { op: l.op || '=', value: Number(l.values?.[0]) } : null;
      }
      // a campaign tier: it stops at some area level
      t0.campaign = b.lines.some((x) => x.keyword === 'AreaLevel' && /^</.test(x.op || ''));
      const rar = b.lines.find((l) => l.keyword === 'Rarity');
      t0.rarity = rar ? rar.values.slice() : null;
      if (!baseLines(b).length) t0.implied = impliedBases(b.lines);
    }
    const tier = t.tiers.get(key);
    tier.blockCount++;
    // emptied by your moves (commented out by us) doesn't count as switched off by FilterBlade
    if (b.disabled && !baseLines(b).some((l) => l.values.includes(NEVER))) tier.offCount++;
    tier.off = tier.offCount === tier.blockCount; // switched off in FilterBlade (commented out)
    if (tier.off) tier.action = b.action;
    for (const l of baseLines(b)) {
      tier.hasBaseList = true;
      for (const v of l.values) if (!isMarker(v) && !tier.bases.includes(v)) tier.bases.push(v);
    }
  }
  return [...types.values()]
    .map((t, i) => ({ type: t.type, label: typeLabel(t.type), tiers: [...t.tiers.values()], _i: i }))
    .sort((a, b) => groupRank(a.type) - groupRank(b.type) || (a.type.includes('->') ? 1 : 0) - (b.type.includes('->') ? 1 : 0) || a._i - b._i)
    .map(({ _i, ...t }) => t);
}

const TYPE_NAMES = {
  '6l': 'Six-links', gold: 'Gold', rareid: 'Rares worth identifying', magicid: 'Magic items worth identifying',
  exoticbases: 'Exotic bases', exoticbaseslower: 'Exotic bases (lower)', exoticmods: 'Exotic mods', hidelayer: 'Hide layer',
  decorators: 'Decorators', endgameflasks: 'Endgame flasks', endgametinctures: 'Endgame tinctures', jewels: 'Jewels',
  heist: 'Heist', artefact: 'Artefacts', questlike: 'Quest-like items', questlikeexception: 'Quest-like exceptions',
  influenced: 'Influenced items', vials: 'Vials', runesgrafts: 'Runegrafts', corpses: 'Corpses', enshrouded: 'Enshrouded items',
  event: 'Event items', leveling: 'Levelling', anyremaining: 'Anything remaining', charts: 'Charts', expedition: 'Expedition',
  miscmapitems: 'Miscellaneous map items', miscmapitemsextra: 'Miscellaneous map items (extra)', heisttarget: 'Heist targets', exoticmap: 'Exotic maps',
  gear: 'Gear', exotic: 'Exotic items', viscera: 'Viscera', mapenchantments: 'Allflame embers',
  currency: 'Currency', divination: 'Divination cards', uniques: 'Uniques', fragments: 'Fragments', scarabs: 'Scarabs',
  essence: 'Essences', fossil: 'Fossils', oil: 'Oils', gems: 'Gems', maps: 'Maps', incubator: 'Incubators',
  delirium: 'Delirium orbs', exotic: 'Exotic bases', rare: 'Rare items', crafting: 'Crafting bases', flasks: 'Flasks',
  rr: 'Vendor recipes', animatedweapons: 'Animated weapons', normalcraft: 'Normal crafting bases', rareblendid: 'Rares worth identifying (blend)',
  corruptedid: 'Corrupted items worth identifying', rareoptional: 'Rares (optional)', questlikeexception: 'Quest-like exceptions', socketslinks: 'Sockets & links',
  endgamergb: 'R-G-B recipe', maphiders: 'Map hiders', chancing: 'Chancing bases', gold: 'Gold',
};
// Order FilterBlade users expect; anything else follows in file order.
const GROUP_ORDER = ['currency', 'divination', 'uniques', 'fragments', 'gems', 'maps', 'jewels', 'crafting', 'exoticbases', 'rareid', '6l', 'influenced', 'heist', 'viscera', 'mapenchantments', 'vials', 'runesgrafts', 'corpses', 'gold', 'leveling'];
function groupRank(type) {
  const i = GROUP_ORDER.indexOf(type.split('->')[0]);
  return i < 0 ? GROUP_ORDER.length : i;
}

const SUB_NAMES = {
  stackedsix: 'Big stacks', stackedthree: 'Small stacks', stackedsuppliesportal: 'Portal scrolls', stackedsupplieswisdom: 'Wisdom scrolls',
  leagueexclusive: 'League exclusive', deliriumorbs: 'Delirium orbs', fossil: 'Fossils', ducats: 'Ducats', oil: 'Oils', essence: 'Essences',
  splinter: 'Splinters', stackedsplintershigh: 'Stacked splinters (high)', stackedsplinterslow: 'Stacked splinters (low)', simulacrum: 'Simulacrum',
  deadmansulphur: "Dead man's sulphur", harvest: 'Harvest', heist: 'Heist', others: 'Others', trial: 'Trial', omen: 'Omens', tattoo: 'Tattoos',
  scarabs: 'Scarabs', replicas: 'Replicas', foulborn: 'Foulborn', maps: 'Unique maps', exceptional: 'Exceptional', special: 'Special', generic: 'Generic',
  qualityperfection: 'Perfect quality', memorystrand: 'Memory strands', influenced: 'Influenced', nightmare: 'Nightmare', blighted: 'Blighted',
  vaaltemple: 'Vaal temple', corruptedspecial: 'Corrupted special', enchanted: 'Enchanted', abyss: 'Abyss', clustereco: 'Cluster (economy)', cluster: 'Cluster',
  cloak: 'Cloaks', brooch: 'Brooches', gear: 'Gear', tool: 'Tools', contract: 'Contracts', blueprint: 'Blueprints', logbook: 'Logbooks', sanctum: 'Sanctum',
  wombgifts: 'Wombgifts', idols: 'Idols', corruptions: 'Corruptions', sockets: 'Sockets', fractured: 'Fractured', misc: 'Misc',
  talisman: 'Talismans', sanctifiedrelics: 'Sanctum', breachrings: 'Breach rings', all: 'All', flasks: 'Flasks', utility: 'Utility', hybrid: 'Hybrid', life: 'Life', mana: 'Mana',
  tincture: 'Tinctures', rare: 'Rare', magic: 'Magic', armours: 'Armours', firstlevels: 'First levels', wandprogression: 'Wand progression', remaining: 'Remaining',
  rareeg: 'Rare endgame', exotic: 'Exotic', tiered: 'Unid item tier',
  levelingstacked: 'Stacked (levelling)', leveling: 'Levelling', stackedsupplieshigh: 'Transmutes', stackedsupplieslow: 'Augmentations',
  stacked: 'Stacked', corruptedimplicit: 'Corrupted implicits', implicitmod: 'Implicit mods', expensive: 'Expensive', generalgear: 'General gear',
  socketslinks: 'Sockets & links', normalmagic: 'Normal & magic', '4l': '4-link', '3l': '3-link', rgb: 'R-G-B', act1: 'Act 1', act2: 'Act 2',
  otheracts: 'Other acts', minion: 'Minion', weaponprogression: 'Weapon progression', exarch: 'Searing Exarch', eater: 'Eater of Worlds',
  crucible: 'Crucible', droppeditems: 'Dropped items', amuring: 'Amulets & rings', belts: 'Belts', extra: 'Extra', exotics: 'Exotics',
  universal: 'Universal', caster: 'Caster', quality: 'Quality', idols: 'Idols', logbook: 'Logbooks', sanctum: 'Sanctum', veiled: 'Veiled',
  deadmansulphur: "Dead Man's Sulphur", leagueexclusive: 'League exclusive', ducats: 'Ducats', others: 'Others', trial: 'Trial',
  melee2h: 'Two-handed melee', melee1h: 'One-handed melee', archer: 'Archer',
  stackedsplintershigh: 'Stacked splinters (high)', stackedsplinterslow: 'Stacked splinters (low)', tool: 'Tools', misc: 'Misc',
};
// Words NeverSink glues together in type names ("stackedsupplieshigh"); used to split names we don't list above.
const WORDS = ['stacked', 'supplies', 'supply', 'splinters', 'splinter', 'leveling', 'levelling', 'normal', 'magic', 'rare', 'rares', 'unique', 'uniques', 'corrupted', 'implicit', 'implicits', 'explicit', 'mods', 'mod',
  'exotic', 'exotics', 'general', 'gear', 'weapon', 'weapons', 'armour', 'armours', 'progression', 'other', 'others', 'acts', 'act', 'dropped', 'items', 'item', 'extra', 'special', 'quality', 'any', 'all',
  'generic', 'misc', 'maps', 'map', 'bases', 'base', 'flasks', 'flask', 'utility', 'life', 'mana', 'hybrid', 'jewels', 'jewel', 'cluster', 'abyss', 'high', 'low', 'mid', 'top', 'tier', 'tiers', 'portal', 'wisdom',
  'scrolls', 'scroll', 'currency', 'fragments', 'fragment', 'gems', 'gem', 'links', 'link', 'sockets', 'socket', 'expensive', 'cheap', 'remaining', 'hide', 'hidden', 'show', 'early', 'late', 'mapping',
  'endgame', 'league', 'exclusive', 'stack', 'multi', 'single', 'animated', 'optional', 'blend', 'identified', 'id', 'recipe', 'recipes', 'influenced', 'chancing', 'crafting', 'craft', 'lifemana',
  'universal', 'caster', 'minion', 'attack', 'melee', 'ranged', 'small', 'large', 'medium', 'new', 'old', 'outdated', 'perfect', 'perfection', 'tinctures', 'tincture'].sort((a, b) => b.length - a.length);
function readableWord(part) {
  if (SUB_NAMES[part]) return SUB_NAMES[part];
  if (/^\d+l$/.test(part)) return `${part.slice(0, -1)}-link`;
  // split glued words: "stackedsupplieshigh" -> "stacked supplies high"
  const out = [];
  let rest = part.toLowerCase();
  while (rest) {
    const w = WORDS.find((x) => rest.startsWith(x));
    if (w) { out.push(w); rest = rest.slice(w.length); continue; }
    const num = /^\d+/.exec(rest);
    if (num) { out.push(num[0]); rest = rest.slice(num[0].length); continue; }
    return part.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()); // can't split: show as is
  }
  return out.join(' ').replace(/^\w/, (c) => c.toUpperCase());
}
function typeLabel(type) {
  const parts = type.split('->');
  const head = TYPE_NAMES[parts[0]] || readableWord(parts[0]);
  return parts.length > 1 ? `${head}: ${parts.slice(1).map(readableWord).join(', ')}` : head;
}

/** Apply a patch to filter text. Returns new text. Pure: same input, same output. */
// ---- six tiers ----
// Currency (General) has FilterBlade's Tier 1-9; the app works with six (the tier designs have six looks).
// Everything in Tier 7 and lower goes into Tier 6, worked out again from each FilterBlade download, and a
// move into Tier 7+ (yours or price review's) lands in Tier 6 too. Scrolls stay where FilterBlade has them:
// they are listed on their own page.
const FOLD_TYPES = new Set(['currency']);
const FOLD_KEEP = new Set(['Portal Scroll', 'Scroll of Wisdom', 'Scroll Fragment']);
const tierNum = (name) => { const m = /^t(\d+)(?!\d)/i.exec(String(name || '')); return m ? Number(m[1]) : null; };
function foldInfo(types, actions = {}) {
  const info = new Map(); // type -> { six, folded: Set of tier names }
  // only tiers in the same state as Tier 6 are folded (shown into shown, hidden into hidden), so folding
  // never shows items your filter (or your strictness) hides, and never hides what it shows
  const stateOf = (type, x) => actions[`${type}|${x.tier}`] || (x.off ? 'Off' : x.action);
  for (const t of types) {
    if (!FOLD_TYPES.has(t.type)) continue;
    const six = t.tiers.find((x) => tierNum(x.tier) === 6 && !x.special);
    if (!six) continue;
    const folded = new Set(t.tiers.filter((x) => tierNum(x.tier) > 6 && !x.special && stateOf(t.type, x) === stateOf(t.type, six)).map((x) => x.tier));
    if (folded.size) info.set(t.type, { six: six.tier, folded, tiers: t.tiers });
  }
  return info;
}
// ---- stacked supplies ----
// FilterBlade's "Supplies: High/Low Stacking" (Orb of Transmutation, Orb of Augmentation in stacks of 3+)
// are folded into Small stacks: their bases join its lowest shown tier, which already starts at 3, and
// their own blocks lose those bases, so they are commented out (an empty base list never reaches the game).
const SUPPLY_TYPES = ['currency->stackedsupplieshigh', 'currency->stackedsupplieslow'];
const SMALL_STACKS = 'currency->stackedthree';
const GONE = '__folded__'; // a tier that doesn't exist: the base leaves every tier of that type
function supplyMoves(types, actions = {}) {
  const small = types.find((t) => t.type === SMALL_STACKS);
  if (!small) return {};
  const stateOf = (type, x) => actions[`${type}|${x.tier}`] || (x.off ? 'Off' : x.action);
  // the lowest tier of Small stacks that is switched on and has bases (Tier 6 on FilterBlade's filters)
  const shown = small.tiers.filter((x) => x.bases.length && stateOf(SMALL_STACKS, x) === 'Show');
  const low = shown[shown.length - 1];
  if (!low) return {};
  const moves = {};
  for (const type of SUPPLY_TYPES) {
    const t = types.find((x) => x.type === type);
    // only when your strictness shows every stack tier of them: otherwise they stay as FilterBlade has them
    if (!t || t.tiers.some((tier) => tier.bases.length && stateOf(type, tier) !== 'Show')) continue;
    for (const tier of t.tiers) for (const b of tier.bases) { moves[`${type}\t${b}`] = GONE; moves[`${SMALL_STACKS}\t${b}`] = low.tier; }
  }
  return moves;
}

/** The patch with Tier 7+ folded into Tier 6 and the stacked supplies folded into Small stacks (automatic moves first, then yours, yours into Tier 7+ redirected). */
function foldedPatch(text, patch = {}) {
  const types = extractTiers(parse(text));
  const info = foldInfo(types, patch.actions || {});
  const supply = supplyMoves(types, patch.actions || {});
  if (!info.size && !Object.keys(supply).length) return patch;
  const moves = { ...supply };
  for (const [type, f] of info) {
    for (const x of f.tiers) if (f.folded.has(x.tier)) for (const b of x.bases) if (!FOLD_KEEP.has(b)) moves[`${type}\t${b}`] = f.six;
  }
  for (const [k, to] of Object.entries(patch.moves || {})) {
    const f = info.get(k.split('\t')[0]);
    moves[k] = f && f.folded.has(to) ? f.six : to;
  }
  return { ...patch, moves };
}

function applyTierPatch(text, patch = {}) {
  patch = foldedPatch(text, patch);
  const doc = parse(text);
  const all = blocks(doc);
  const byType = new Map();
  for (const b of all) {
    const tags = tagsOf(b);
    if (!tags) continue;
    b._tags = tags;
    (byType.get(tags.type) || byType.set(tags.type, []).get(tags.type)).push(b);
  }

  // ---- tiers FilterBlade emptied ----
  // An emptied tier (Tier 1 of essences with nothing in it, say) comes without a BaseType line, which
  // would make it catch everything once switched on. It gets an empty base list instead, so you can
  // put items into it, and it stays out of the game until something is in it.
  const condOnly = (b) => b.lines.filter((l) => l.keyword && l.keyword !== 'BaseType' && !STYLE_SET.has(l.keyword) && l.keyword !== 'Continue');
  for (const typeBlocks of byType.values()) {
    if (!typeBlocks.some((b) => baseLines(b).length)) continue; // a category without base lists
    for (const b of typeBlocks) {
      // only tiers FilterBlade switched off: a switched-on tier without bases is a catch-all ("any Heist gear")
      if (!b.disabled || baseLines(b).length || !/^t\d+[a-z]*$/i.test(b._tags.tier)) continue;
      if (condOnly(b).some((l) => !/^(Class|Rarity)$/.test(l.keyword))) continue; // a special case, not a tier
      const ind = indentOf(b);
      const cr = crOf(b.lines.find((l) => l.keyword)?.raw || '');
      const at = b.lines.findIndex((l) => l.keyword && (STYLE_SET.has(l.keyword) || l.keyword === 'Continue'));
      b.lines.splice(at < 0 ? b.lines.length : at, 0, parseLine(`${ind}BaseType == ${quoteList([EMPTY])}${cr}`));
    }
  }

  // ---- your own tiers (e.g. a "Giga" tier above Tier 1) ----
  // newTiers: [{ type, tier, name, copyFrom: "<tier>", before: "<tier>" }]. A new tier is a copy of
  // copyFrom's first block (same conditions and look) with its own base list, placed before `before`.
  const inserts = new Map(); // block -> [new blocks to put before it]
  for (const nt of patch.newTiers || []) {
    const typeBlocks = byType.get(nt.type);
    if (!typeBlocks || !nt.tier || typeBlocks.some((b) => b._tags.tier === nt.tier)) continue;
    const src = typeBlocks.find((b) => b._tags.tier === nt.copyFrom && !b.disabled && baseLines(b).length) || typeBlocks.find((b) => !b.disabled && baseLines(b).length);
    if (!src) continue;
    const at = typeBlocks.find((b) => b._tags.tier === (nt.before || nt.copyFrom)) || src;
    const cr = crOf(src.lines.find((l) => l.keyword)?.raw || '');
    const ind = indentOf(src);
    const lines = src.lines.filter((l) => l.keyword !== 'BaseType').map((l) => ({ ...l, values: l.values ? [...l.values] : l.values }));
    const firstBase = src.lines.findIndex((l) => l.keyword === 'BaseType');
    lines.splice(Math.max(0, firstBase), 0, parseLine(`${ind}BaseType == "${NEVER}"${cr}`));
    const block = { kind: 'block', action: 'Show', headerRaw: `Show # $type->${nt.type} $tier->${nt.tier} (your tier, made with PoE Helper)${cr}`, headerComment: `$type->${nt.type} $tier->${nt.tier}`, lines, startLine: at.startLine, _tags: { type: nt.type, tier: nt.tier } };
    if (!inserts.has(at)) inserts.set(at, []);
    inserts.get(at).push(block);
    typeBlocks.unshift(block);
    all.push(block);
  }
  if (inserts.size) {
    const segs = [];
    for (const sg of doc.segments) {
      if (inserts.has(sg)) for (const nb of inserts.get(sg)) segs.push(nb, { kind: 'raw', lines: [doc.eol === '\r\n' ? '\r' : ''] });
      segs.push(sg);
    }
    doc.segments = segs;
  }

  // ---- moves ----
  const hideGroups = new Map(); // insertBefore block -> Map(signature -> {conds, bases, type})
  for (const [k, to] of Object.entries(patch.moves || {})) {
    const [type, base] = k.split('\t');
    const typeBlocks = byType.get(type);
    if (!typeBlocks || !base) continue;
    let firstSource = null;
    // Remove it from every tier of this type, except exception blocks ("6-link Tabula", "Shaper +
    // Elder influenced"...) when the base also has a plain tier: those keep catching their special case.
    const plain = typeBlocks.some((b) => !isSpecialBlock(b) && baseLines(b).some((l) => l.values.includes(base)));
    for (const b of typeBlocks) {
      if (plain && isSpecialBlock(b) && b._tags.tier !== to) continue;
      for (const l of baseLines(b)) {
        if (!l.values.includes(base)) continue;
        if (!firstSource) firstSource = b;
        const ind = /^[ \t]*/.exec(l.raw)[0];
        const rest = l.values.filter((v) => v !== base);
        l.values = rest.length ? rest : [NEVER];
        l.raw = `${ind}BaseType == ${quoteList(l.values)}${crOf(l.raw)}`;
      }
    }
    if (to === HIDE) {
      const src = firstSource || typeBlocks[0];
      const conds = src.lines.filter((l) => l.keyword && l.keyword !== 'BaseType' && !STYLE_SET.has(l.keyword) && l.keyword !== 'Continue').map((l) => l.raw.trim());
      const sig = conds.join('\n');
      if (!hideGroups.has(src)) hideGroups.set(src, new Map());
      const g = hideGroups.get(src);
      if (!g.has(sig)) g.set(sig, { conds, bases: [], type });
      g.get(sig).bases.push(base);
      continue;
    }
    const target = typeBlocks.find((b) => b._tags.tier === to && baseLines(b).length);
    if (!target) continue;
    // A tier FilterBlade left empty is commented out there. With your base in it, it is switched
    // on, or the base would fall through to the loud "anything else" rule at the end of its section.
    if (target.disabled && baseLines(target).every((x) => x.values.every((v) => v === EMPTY))) target.disabled = false;
    const l = baseLines(target)[0];
    if (!l.values.includes(base)) {
      const ind = /^[ \t]*/.exec(l.raw)[0];
      l.values = l.values.filter((v) => !isMarker(v)).concat(base);
      l.raw = `${ind}BaseType == ${quoteList(l.values)}${crOf(l.raw)}`;
    }
  }

  // ---- styles ----
  const FILTER_SOUND = new Set(['PlayAlertSound', 'PlayAlertSoundPositional', 'CustomAlertSound', 'CustomAlertSoundOptional', 'DisableDropSound', 'EnableDropSound', 'DisableDropSoundIfAlertSound', 'EnableDropSoundIfAlertSound']);
  for (const [key, style] of Object.entries(patch.styles || {})) {
    const [type, tier] = key.split('|');
    for (const b of byType.get(type) || []) {
      if (b._tags.tier !== tier) continue;
      const ind = indentOf(b);
      const keep = b.lines.filter((l) => !STYLE_SET.has(l.keyword) && l.keyword !== 'Continue');
      const cont = b.lines.filter((l) => l.keyword === 'Continue');
      const cr = crOf(b.lines.find((l) => l.keyword)?.raw || '');
      // keepSound: a new look, but the tier's own (FilterBlade's) sound lines stay
      const own = style.keepSound && !style.sound && !style.customSound ? b.lines.filter((l) => FILTER_SOUND.has(l.keyword)) : [];
      b.lines = [...keep, ...renderStyleLines(style, ind).map((x) => parseLine(x + cr)), ...own, ...cont];
    }
  }

  // ---- your stack sizes: conditions: { "currency->stackedsix|t1": { StackSize: 8 } } ----
  // and your item level, area level, quality, rarity and switched-off bases:
  // { "endgameflasks|t1": { ItemLevel: { op: '>=', value: 84 }, AreaLevel: 'any', Rarity: ['Magic'], exclude: ['Iron Flask'] } }
  for (const [key, cond] of Object.entries(patch.conditions || {})) {
    const [type, tier] = key.split('|');
    const n = Number(cond?.StackSize);
    for (const b of byType.get(type) || []) {
      if (b._tags.tier !== tier) continue;
      const ind = indentOf(b);
      const cr = crOf(b.lines.find((l) => l.keyword)?.raw || '');
      if (Number.isFinite(n) && n >= 1) {
        for (const l of b.lines) {
          if (l.keyword !== 'StackSize') continue;
          l.op = l.op || '>=';
          l.values = [String(Math.round(n))];
          l.raw = `${/^[ \t]*/.exec(l.raw)[0]}StackSize ${l.op} ${Math.round(n)}${crOf(l.raw)}`;
        }
      }
      for (const k of NUMBER_CONDS) {
        const c = cond?.[k];
        if (c === undefined) continue;
        // with two area level lines (">= 2" and "<= 67") the one on the same side is changed
        const upper = /^</.test(c?.op || '');
        const same = b.lines.findIndex((l) => l.keyword === k && (k !== 'AreaLevel' || /^</.test(l.op || '') === upper));
        const at = same >= 0 ? same : b.lines.findIndex((l) => l.keyword === k);
        if (c === 'any' || c?.op === 'any') { if (at >= 0) b.lines.splice(at, 1); continue; }
        const v = Math.round(Number(c?.value));
        const op = ['>=', '<=', '=', '>', '<'].includes(c?.op) ? c.op : '>=';
        if (!Number.isFinite(v)) continue;
        const line = parseLine(`${ind}${k} ${op} ${v}${cr}`);
        if (at >= 0) b.lines[at] = line;
        else b.lines.splice(Math.max(0, b.lines.findIndex((l) => l.keyword)), 0, line); // with the other conditions
      }
      if (Array.isArray(cond?.Rarity) && cond.Rarity.length) {
        const vals = cond.Rarity.filter((r) => ['Normal', 'Magic', 'Rare', 'Unique'].includes(r));
        const at = b.lines.findIndex((l) => l.keyword === 'Rarity');
        if (vals.length) {
          const line = parseLine(`${ind}Rarity ${vals.join(' ')}${cr}`);
          if (at >= 0) b.lines[at] = line; else b.lines.splice(Math.max(0, b.lines.findIndex((l) => l.keyword)), 0, line);
        }
      }
      const ex = new Set(Array.isArray(cond?.exclude) ? cond.exclude : []);
      if (ex.size) {
        const bl = baseLines(b);
        if (bl.length) {
          for (const l of bl) {
            const keep = l.values.filter((v) => !ex.has(v));
            l.values = keep.length ? keep : [NEVER];
            l.raw = `${/^[ \t]*/.exec(l.raw)[0]}BaseType ${l.op || '=='} ${quoteList(l.values)}${crOf(l.raw)}`;
          }
        } else {
          const all = impliedBases(b.lines);
          if (all) {
            const keep = all.filter((v) => !ex.has(v));
            b.lines.splice(Math.max(0, b.lines.findIndex((l) => l.keyword === 'Class') + 1), 0, parseLine(`${ind}BaseType == ${quoteList(keep.length ? keep : [NEVER])}${cr}`));
          }
        }
      }
    }
  }

  // ---- show/hide whole tiers ----
  const ALERTS = new Set(['PlayAlertSound', 'PlayAlertSoundPositional', 'CustomAlertSound', 'CustomAlertSoundOptional', 'PlayEffect', 'MinimapIcon', 'EnableDropSound', 'DisableDropSound', 'DisableDropSoundIfAlertSound', 'EnableDropSoundIfAlertSound']);
  for (const [key, action] of Object.entries(patch.actions || {})) {
    const [type, tier] = key.split('|');
    for (const b of byType.get(type) || []) {
      if (b._tags.tier !== tier) continue;
      // 'Off' comments the block out like FilterBlade does; Show/Hide switches it back on
      if (action === 'Off') { b.disabled = true; continue; }
      if (b.disabled) b.disabled = false;
      if (b.action === action) continue;
      b.action = action;
      b.headerRaw = b.headerRaw.replace(/^(\s*)(Show|Hide|Minimal)\b/, `$1${action}`);
      if (action === 'Hide') {
        // a hidden tier makes no sound and shows no beam or minimap icon
        const ind = indentOf(b);
        const cr = crOf(b.lines.find((l) => l.keyword)?.raw || '');
        const keep = b.lines.filter((l) => !ALERTS.has(l.keyword) && l.keyword !== 'Continue');
        const cont = b.lines.filter((l) => l.keyword === 'Continue');
        b.lines = [...keep, parseLine(`${ind}DisableDropSound${cr}`), ...cont];
      }
    }
  }

  // ---- insert hide blocks right before the block that used to show the base ----
  if (hideGroups.size) {
    const segs = [];
    for (const s of doc.segments) {
      if (s.kind === 'block' && hideGroups.has(s)) {
        for (const { conds, bases, type } of hideGroups.get(s).values()) {
          const ind = indentOf(s);
          const lines = [`Hide # $type->${type} $tier->${HIDDEN_TIER} (hidden with PoE Helper)`, ...conds.map((c) => ind + c), `${ind}BaseType == ${quoteList(bases)}`, `${ind}DisableDropSound`];
          segs.push({ kind: 'block', rendered: lines.join(doc.eol) }, { kind: 'raw', lines: [doc.eol === '\r\n' ? '\r' : ''] });
        }
      }
      segs.push(s);
    }
    doc.segments = segs;
  }
  // A block whose base list is now empty must not reach the game: it rejects the whole filter
  // over a BaseType value that matches nothing. Such a block can't match anything anyway, so it
  // is commented out (even if you switched its tier on; it comes back when a base is moved in).
  for (const b of all) if (baseLines(b).some((l) => l.values.length === 1 && isMarker(l.values[0]))) b.disabled = true;
  return serialize(doc);
}

/** Tier view after the patch, plus where each moved base came from. */
function tierView(text, patch = {}) {
  const original = extractTiers(parse(text));
  const patched = extractTiers(parse(applyTierPatch(text, patch)));
  const origTierOf = new Map();
  for (const t of original) for (const tier of t.tiers) for (const b of tier.bases) {
    const k = `${t.type}\t${b}`;
    if (!origTierOf.has(k)) origTierOf.set(k, tier.tier);
  }
  const moved = {};
  for (const k of Object.keys(patch.moves || {})) moved[k] = origTierOf.get(k) || null;
  // what FilterBlade had for each tier, so switching back removes the change instead of stacking it
  const stateOf = (tier) => (tier.off ? 'Off' : tier.action);
  const orig = new Map(original.flatMap((t) => t.tiers.map((x) => [x.key, stateOf(x)])));
  for (const t of patched) for (const x of t.tiers) { x.state = stateOf(x); x.origState = orig.get(x.key) || x.state; }
  for (const nt of patch.newTiers || []) {
    const x = patched.find((t) => t.type === nt.type)?.tiers.find((y) => y.tier === nt.tier);
    if (x) { x.customName = nt.name; x.mine = true; x.copyFrom = nt.copyFrom; }
  }
  // the tiers folded into Tier 6 aren't shown
  const folds = foldInfo(original, patch.actions || {});
  for (const t of patched) { const f = folds.get(t.type); if (f) for (const x of t.tiers) if (f.folded.has(x.tier) && !x.bases.length) x.folded = true; }
  return { types: patched, moved, editedStyles: Object.keys(patch.styles || {}), editedActions: patch.actions || {} };
}

/** Patch helpers (immutable). */
const clonePatch = (patch = {}) => ({ moves: { ...(patch.moves || {}) }, styles: { ...(patch.styles || {}) }, actions: { ...(patch.actions || {}) }, newTiers: [...(patch.newTiers || [])], conditions: { ...(patch.conditions || {}) } });

/** Change a tier's stack size (null puts the filter's own back). */
function withStackSize(patch, key, n) {
  return withCondition(patch, key, 'StackSize', n == null || n === '' ? null : Math.max(1, Math.round(Number(n))));
}

/** One of your condition changes on a tier; null puts that one back to what the filter has. */
function withCondition(patch, key, field, value) {
  const p = clonePatch(patch);
  const c = { ...(p.conditions[key] || {}) };
  if (value == null) delete c[field]; else c[field] = value;
  if (Object.keys(c).length) p.conditions[key] = c; else delete p.conditions[key];
  return p;
}

/** Add your own tier to a category. Returns [patch, tierId]. */
function withNewTier(patch, { type, name, copyFrom, before }) {
  const p = clonePatch(patch);
  const slug = String(name || 'tier').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'tier';
  let tier = `poehelper-${slug}`;
  for (let i = 2; p.newTiers.some((x) => x.type === type && x.tier === tier); i++) tier = `poehelper-${slug}${i}`;
  p.newTiers.push({ type, tier, name: String(name || 'My tier').slice(0, 40), copyFrom, before: before || copyFrom });
  return [p, tier];
}
/** Remove your tier; its items go back to where the filter had them. */
function withoutNewTier(patch, type, tier) {
  const p = clonePatch(patch);
  p.newTiers = p.newTiers.filter((x) => !(x.type === type && x.tier === tier));
  for (const [k, to] of Object.entries(p.moves)) if (to === tier && k.startsWith(type + '\t')) delete p.moves[k];
  delete p.styles[`${type}|${tier}`];
  delete p.actions[`${type}|${tier}`];
  return p;
}

function withMove(patch, type, base, to) {
  const p = clonePatch(patch);
  p.moves[`${type}\t${base}`] = to;
  return p;
}
function withoutMove(patch, type, base) {
  const p = clonePatch(patch);
  delete p.moves[`${type}\t${base}`];
  return p;
}
function withStyle(patch, key, style) {
  const p = clonePatch(patch);
  if (style) p.styles[key] = style;
  else delete p.styles[key];
  return p;
}

/** Show or hide a whole tier in game. null puts it back to what the filter says. */
function withAction(patch, key, action) {
  const p = clonePatch(patch);
  if (action === 'Show' || action === 'Hide' || action === 'Off') p.actions[key] = action;
  else delete p.actions[key];
  return p;
}

/** Find the tier (type) a base lives in, for the overlay's "move this" menu. */
function locateBase(types, base) {
  for (const t of types) for (const tier of t.tiers) if (tier.bases.includes(base)) return { type: t.type, tier: tier.tier, key: tier.key };
  return null;
}

/** A theme is just the styles part, keyed by type|tier, so it carries over between strictness levels. */
function themeFromView(view, onlyKeys = null) {
  const styles = {};
  for (const t of view.types) for (const tier of t.tiers) {
    if (tier.generated) continue;
    if (onlyKeys && !onlyKeys.includes(tier.key)) continue;
    styles[tier.key] = tier.style;
  }
  return styles;
}

module.exports = { withCondition, CLASS_BASES, NUMBER_CONDS, withStackSize, withNewTier, withoutNewTier, clonePatch, withAction, extractTiers, applyTierPatch, tierView, withMove, withoutMove, withStyle, locateBase, themeFromView, typeLabel, HIDE, HIDDEN_TIER, renderBlock };
