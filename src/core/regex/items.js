'use strict';
/**
 * Item mods search: pick a base, the mods you want and how good a tier, and get a string for the stash
 * search (handy while you roll an item: it lights up when it hits). Which mods a base can roll comes
 * from the game data (item-mods.json, built by scripts/build-item-mods.js); the search terms are our own.
 */

const DATA = require('./item-mods.json');

const MAX = 250;
const NUM = '#';
// lines every item has that aren't mods; a term must not match them
const NOISE = ['item class: #', 'rarity: magic', 'rarity: rare', 'rarity: normal', 'quality: +#%', 'armour: #', 'evasion rating: #', 'energy shield: #', 'ward: #', 'chance to block: #%',
  'physical damage: #-#', 'elemental damage: #-#', 'chaos damage: #-#', 'critical strike chance: #.#%', 'attacks per second: #.#', 'weapon range: #.#', 'requirements:', 'level: #', 'str: #', 'dex: #', 'int: #',
  'sockets: ', 'item level: #', 'corrupted', 'mirrored', 'unidentified', 'split', 'fractured item', 'synthesised item', 'searing exarch item', 'eater of worlds item', 'shaper item', 'elder item',
  'crusader item', 'hunter item', 'redeemer item', 'warlord item', 'lasts # seconds', 'consumes # of # charges on use', 'currently has # charges', 'recovers # life over #.# seconds', 'recovers # mana over #.# seconds',
  'right click to drink. can only hold charges while in belt. refills as you kill monsters.', 'place into an allocated jewel socket on the passive skill tree. right click to remove from the socket.'];

const lc = (s) => String(s).toLowerCase();
/** "+(60-69) to maximum Mana" -> { tpl: "+# to maximum mana", first: {min, max} } */
function template(line) {
  let first = null;
  const tpl = line.replace(/\((-?[\d.]+)-(-?[\d.]+)\)|(-?\d+(?:\.\d+)?)/g, (m, a, b, c) => {
    if (!first) first = a != null ? { min: Number(a), max: Number(b) } : { min: Number(c), max: Number(c) };
    return NUM;
  });
  return { tpl: lc(tpl).replace(/\s+/g, ' ').trim(), first };
}

const baseByName = new Map(DATA.bases.map((b) => [b.name, b]));

function canRoll(mod, tags) {
  for (const [tag, w] of mod.w) if (tags.has(tag)) return w > 0;
  return false;
}

/** The item classes and their bases (newest, highest level last). */
function itemBases() {
  const byCls = new Map();
  for (const b of DATA.bases) {
    if (!byCls.has(b.cls)) byCls.set(b.cls, []);
    byCls.get(b.cls).push({ name: b.name, lvl: b.lvl });
  }
  return [...byCls].map(([cls, bases]) => ({ cls, name: CLASS_NAMES[cls] || cls, bases }));
}
const CLASS_NAMES = { AbyssJewel: 'Abyss Jewels', Jewel: 'Jewels', LifeFlask: 'Life Flasks', ManaFlask: 'Mana Flasks', HybridFlask: 'Hybrid Flasks', UtilityFlask: 'Utility Flasks', 'Body Armour': 'Body Armours', 'Thrusting One Hand Sword': 'Thrusting One Hand Swords', 'Rune Dagger': 'Rune Daggers', Staff: 'Staves', Warstaff: 'Warstaves', Boots: 'Boots', Gloves: 'Gloves' };

const INFLUENCES = [['shaper', 'Shaper'], ['elder', 'Elder'], ['crusader', 'Crusader'], ['basilisk', 'Hunter'], ['eyrie', 'Redeemer'], ['adjudicator', 'Warlord']];

/**
 * Every mod a base can roll, as families (one per mod, its tiers best first).
 * o: { base, influences: ['shaper', ...], ilvl }
 */
function families(o = {}) {
  const base = baseByName.get(o.base);
  if (!base) return null;
  const tags = new Set(base.tags);
  const infTags = DATA.influence[base.cls] || [];
  for (const inf of o.influences || []) { const t = infTags.find((x) => x.endsWith(`_${inf}`)); if (t) tags.add(t); }
  // more bases that count as the same kind (rapiers with one-hand swords): a mod either can roll counts
  const more = (o.also || []).map((n) => baseByName.get(n)).filter(Boolean).map((b) => new Set(b.tags));
  const ilvl = Number(o.ilvl) > 0 ? Number(o.ilvl) : 100;
  const fam = new Map();
  for (const m of DATA.mods) {
    if (m.dom !== base.dom || !(canRoll(m, tags) || more.some((t) => canRoll(m, t)))) continue;
    const lines = m.text.split('\n').map((l) => l.trim()).filter(Boolean);
    const t = lines.map(template);
    const key = `${m.aff}|${t.map((x) => x.tpl).join(' / ')}`;
    if (!fam.has(key)) {
      const inf = INFLUENCES.find(([id]) => m.w.some(([tag, w]) => w > 0 && tags.has(tag) && tag.endsWith(`_${id}`)));
      fam.set(key, { key, aff: m.aff === 'p' ? 'prefix' : 'suffix', tpl: t.map((x) => x.tpl), show: lines.map((l) => l.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, '#').replace(/\d+(\.\d+)?/g, '#')), influence: inf ? inf[1] : null, tiers: [] });
    }
    fam.get(key).tiers.push({ name: m.name, lvl: m.lvl, text: lines.join(' / '), first: t[0].first, ok: m.lvl <= ilvl });
  }
  const list = [...fam.values()];
  for (const f of list) {
    f.tiers.sort((a, b) => b.lvl - a.lvl || (b.first?.min ?? 0) - (a.first?.min ?? 0));
    f.tiers.forEach((t, i) => { t.tier = i + 1; });
    f.tiers = f.tiers.filter((t) => t.ok).map(({ ok, ...t }) => t);
  }
  return { base, families: list.filter((f) => f.tiers.length) };
}

const REGEX_SPECIAL = /[\\^$.|?*+()[\]{}]/g;
const esc = (s) => s.replace(REGEX_SPECIAL, (c) => `\\${c}`);

/** a regex for whole numbers of at least n, used right before the mod's text (numbers on items have no leading zeros) */
function atLeast(n) {
  n = Math.floor(n);
  if (n <= 1) return '\\d+';
  const s = String(n);
  const d = s.length;
  const rng = (a) => (a === 9 ? '9' : a === 8 ? '[89]' : `[${a}-9]`);
  const rest = (k) => (k === 0 ? '' : k === 1 ? '\\d' : `\\d{${k}}`);
  // "50" -> "[5-9]\d": trailing zeros take the whole range of the digit before them
  let k = d - 1;
  while (k > 0 && s[k] === '0') k -= 1;
  const parts = [s.slice(0, k) + rng(Number(s[k])) + rest(d - k - 1)];
  for (let i = k - 1; i >= 0; i -= 1) {
    const dg = Number(s[i]);
    if (dg === 9) continue;
    parts.push(s.slice(0, i) + rng(dg + 1) + rest(d - i - 1));
  }
  parts.push(`\\d{${d + 1}}`); // any longer number (a run of d+1 digits sits right before the text)
  return `(${parts.join('|')})`;
}

/**
 * The shortest search term for a family's first line: a piece of its text (and the number, when you ask
 * for a minimum) that no other mod this base can roll, and no other line on the item, has.
 */
function termFor(fam, all, minValue, extra) {
  const mine = fam.tpl[0];
  const others = [];
  // a line that another mod has word for word (a hybrid's "+# to maximum life") can't be told apart, so it's left out
  for (const f of all) if (f !== fam) others.push(...f.tpl.filter((t) => t !== mine));
  others.push(...NOISE, ...(extra || []));
  const unique = (p, start, end) => others.every((t) => !(start && end ? t === p : start ? t.startsWith(p) : end ? t.endsWith(p) : t.includes(p)));
  const ok = (p) => /^[a-z0-9 %',:#+-]+$/.test(p) && !/^ | $/.test(p.replace(/#/g, 'x'));
  const at = mine.indexOf(NUM);
  let best = null;
  const take = (pat, cost) => { if (!best || cost < best.cost) best = { pat, cost }; };
  const decimal = fam.tiers.some((t) => t.first && !Number.isInteger(t.first.min));
  if (minValue != null && at >= 0 && !decimal) {
    const num = atLeast(minValue);
    const pre = mine.slice(0, at);
    const post = mine.slice(at + 1);
    for (let a = 0; a <= pre.length; a += 1) {
      const pp = pre.slice(pre.length - a);
      if (a && !ok(pp + 'x')) continue;
      for (let b = 2; b <= post.length; b += 1) {
        const pq = post.slice(0, b);
        if (!ok('x' + pq)) continue;
        const p = pp + NUM + pq;
        const start = a === pre.length && a > 0;
        const end = b === post.length;
        const cost = a + b + (pq.match(/#/g) || []).length * 2;
        if (best && cost >= best.cost) break;
        if (unique(p, false, false)) { take(esc(pp) + num + esc(pq).replace(/#/g, '\\d+'), cost); break; }
        if (end && unique(p, false, true)) take(esc(pp) + num + esc(pq).replace(/#/g, '\\d+') + '$', cost + 1);
        if (start && unique(p, true, false)) take('^' + esc(pp) + num + esc(pq).replace(/#/g, '\\d+'), cost + 1);
      }
    }
    if (best) return best.pat;
  }
  // no minimum: the shortest piece of the text
  // three letters at least: two-letter pieces turn up in rare items' random names too often
  for (let len = 3; len <= mine.length; len += 1) {
    if (best && len > best.cost + 2) break;
    for (let i = 0; i + len <= mine.length; i += 1) {
      const p = mine.slice(i, i + len);
      if (!ok(p)) continue;
      // a piece across a space starts at a word ("d m" would also hit a rare's name like "Blood March")
      if (p.includes(' ') && i > 0 && mine[i - 1] !== ' ' && mine[i - 1] !== '#') continue;
      const start = i === 0;
      const end = i + len === mine.length;
      const pat = () => esc(p).replace(/#/g, '\\d+');
      const cost = len + (p.match(/#/g) || []).length * 2;
      if (unique(p, false, false)) take(pat(), cost);
      else if (end && unique(p, false, true)) take(pat() + '$', cost + 1);
      else if (start && unique(p, true, false)) take('^' + pat(), cost + 1);
      else if (start && end && unique(p, true, true)) take('^' + pat() + '$', cost + 2);
    }
  }
  return best ? best.pat : esc(mine).replace(/#/g, '\\d+');
}

const namesByCls = new Map();
/** the class's base names (they're on the item too) */
function classNames(cls) {
  if (!namesByCls.has(cls)) {
    const list = cls === 'One Hand Sword' || cls === 'Thrusting One Hand Sword' ? ['One Hand Sword', 'Thrusting One Hand Sword'] : [cls];
    namesByCls.set(cls, DATA.bases.filter((b) => list.includes(b.cls)).map((b) => b.name.toLowerCase()));
  }
  return namesByCls.get(cls);
}

function modsView(o = {}) {
  const r = families(o);
  if (!r) return null;
  return {
    base: { name: r.base.name, cls: r.base.cls, lvl: r.base.lvl },
    influences: (DATA.influence[r.base.cls] || []).length ? INFLUENCES.map(([id, name]) => ({ id, name })) : [],
    families: r.families.map((f) => ({ key: f.key, aff: f.aff, text: f.show, influence: f.influence, tiers: f.tiers.map((t) => ({ tier: t.tier, lvl: t.lvl, name: t.name, text: t.text })) }))
      .sort((a, b) => (a.aff === b.aff ? 0 : a.aff === 'prefix' ? -1 : 1) || (a.influence ? 1 : 0) - (b.influence ? 1 : 0) || a.text[0].localeCompare(b.text[0])),
  };
}

/**
 * choices: { base, influences, ilvl, mode: 'any' | 'all' | 'ps', picks: { familyKey: tier (0 = any tier) }, custom }
 * any: one of the mods; all: every one; ps: one of the prefixes and one of the suffixes.
 */
function buildItemRegex(choices = {}) {
  const r = families(choices);
  if (!r) return { regex: '', length: 0, max: MAX, parts: [], notes: ['Pick a base first.'] };
  const picks = choices.picks || {};
  const notes = [];
  const parts = [];
  const extra = [...classNames(r.base.cls), ...(r.base.imp || []).flatMap((t) => t.split('\n')).map((l) => template(l).tpl)];
  for (const f of r.families) {
    if (!(f.key in picks)) continue;
    const want = Number(picks[f.key]) || 0;
    const tier = want ? f.tiers.find((t) => t.tier === want) || f.tiers[f.tiers.length - 1] : null;
    // the lowest tier you'd still take sets the minimum; every tier (or the worst one) needs none
    const worst = f.tiers[f.tiers.length - 1];
    const min = tier && tier !== worst && tier.first ? tier.first.min : null;
    if (tier && f.tiers.some((t) => t.first && !Number.isInteger(t.first.min)) && tier !== worst) notes.push(`"${f.show[0]}" has decimals, so it matches every tier.`);
    parts.push({ key: f.key, aff: f.aff, label: f.show[0] + (tier && tier !== worst ? ` (T${tier.tier}+)` : ''), text: termFor(f, r.families, min, extra) });
  }
  const mode = choices.mode || 'any';
  let terms = [];
  if (!parts.length) terms = [];
  else if (mode === 'all') terms = parts.map((p) => p.text);
  else if (mode === 'ps') {
    const pre = parts.filter((p) => p.aff === 'prefix').map((p) => p.text);
    const suf = parts.filter((p) => p.aff === 'suffix').map((p) => p.text);
    if (!pre.length || !suf.length) notes.push('Pick at least one prefix and one suffix for "a prefix and a suffix".');
    terms = [pre.join('|'), suf.join('|')].filter(Boolean);
  } else terms = [parts.map((p) => p.text).join('|')];
  const custom = String(choices.custom || '').trim();
  const regex = [...terms.map((t) => `"${t}"`), custom].filter(Boolean).join(' ');
  return { regex, length: regex.length, max: MAX, parts, notes };
}

// ---------- magic items: the mod names ("Searing", "of Success") are in the item's name ----------
const DEFENCES = [
  ['str_armour', 'Armour'], ['dex_armour', 'Evasion'], ['int_armour', 'Energy Shield'],
  ['str_dex_armour', 'Armour / Evasion'], ['str_int_armour', 'Armour / Energy Shield'], ['dex_int_armour', 'Evasion / Energy Shield'],
  ['str_dex_int_armour', 'Armour / Evasion / Energy Shield'], ['ward_armour', 'Ward'],
];
const BY_BASE = new Set(['Jewel', 'AbyssJewel', 'UtilityFlask']); // these differ base by base
const TYPE_ORDER = ['Body Armour', 'Helmet', 'Gloves', 'Boots', 'Shield', 'Quiver', 'Amulet', 'Ring', 'Belt',
  'One Hand Sword', 'One Hand Axe', 'One Hand Mace', 'Sceptre', 'Claw', 'Dagger', 'Rune Dagger', 'Wand',
  'Two Hand Sword', 'Two Hand Axe', 'Two Hand Mace', 'Staff', 'Warstaff', 'Bow', 'LifeFlask', 'ManaFlask', 'HybridFlask', 'UtilityFlask', 'Jewel', 'AbyssJewel'];
const TYPE_GROUP = (c) => (['Body Armour', 'Helmet', 'Gloves', 'Boots', 'Shield'].includes(c) ? 'Armour' : ['Amulet', 'Ring', 'Belt'].includes(c) ? 'Jewellery'
  : ['Quiver'].includes(c) ? 'Off-hand' : ['Two Hand Sword', 'Two Hand Axe', 'Two Hand Mace', 'Staff', 'Warstaff', 'Bow'].includes(c) ? 'Two-handed weapons'
    : /Flask$/.test(c) ? 'Flasks' : /Jewel$/.test(c) ? 'Jewels' : 'One-handed weapons');
const TYPE_NAMES = { 'Body Armour': 'Body Armours', Helmet: 'Helmets', Shield: 'Shields', Quiver: 'Quivers', Amulet: 'Amulets', Ring: 'Rings', Belt: 'Belts',
  'One Hand Sword': 'One Hand Swords & Rapiers', 'One Hand Axe': 'One Hand Axes', 'One Hand Mace': 'One Hand Maces',
  Sceptre: 'Sceptres', Claw: 'Claws', Dagger: 'Daggers', 'Rune Dagger': 'Rune Daggers', Wand: 'Wands', 'Two Hand Sword': 'Two Hand Swords', 'Two Hand Axe': 'Two Hand Axes',
  'Two Hand Mace': 'Two Hand Maces', Staff: 'Staves', Warstaff: 'Warstaves', Bow: 'Bows', ...CLASS_NAMES };

/** Item types, and for armour the defence (every base of one type and defence rolls the same mods). */
function itemTypes() {
  const out = [];
  for (const cls of TYPE_ORDER) {
    const bases = DATA.bases.filter((b) => b.cls === cls);
    const extra = cls === 'One Hand Sword' ? DATA.bases.filter((b) => b.cls === 'Thrusting One Hand Sword') : [];
    if (!bases.length) continue;
    // the usual base of the kind: the highest one with the most common tags (not Convoking Wand and other one-offs)
    const best = (list) => {
      const key = (x) => x.tags.filter((t) => t !== 'top_tier_base_item_type' && t !== 'not_for_sale').sort().join(',');
      const count = new Map();
      for (const x of list) count.set(key(x), (count.get(key(x)) || 0) + 1);
      const common = [...count].sort((a, b) => b[1] - a[1])[0][0];
      return [...list].filter((x) => key(x) === common).sort((a, b) => b.lvl - a.lvl)[0];
    };
    let variants = null;
    if (BY_BASE.has(cls)) variants = bases.map((b) => ({ id: b.name, name: b.name, base: b.name }));
    else if (bases.some((b) => DEFENCES.some(([t]) => b.tags.includes(t)))) {
      variants = DEFENCES.map(([t, name]) => { const list = bases.filter((b) => b.tags.includes(t)); return list.length ? { id: t, name, base: best(list).name } : null; }).filter(Boolean);
    }
    const fixed = { Amulet: 'Onyx Amulet', Ring: 'Diamond Ring', Belt: 'Leather Belt' }[cls]; // talismans, unset rings and the like roll differently
    out.push({ id: cls, name: TYPE_NAMES[cls] || cls, group: TYPE_GROUP(cls), base: variants ? null : (fixed && baseByName.has(fixed) ? fixed : best(bases).name), also: extra.length ? [best(extra).name] : [], variants });
  }
  return out;
}
let typesCache = null;
function baseFor(o = {}) {
  if (!typesCache) typesCache = itemTypes();
  // rapiers were their own type before 1.0.24
  const t = typesCache.find((x) => x.id === (o.type === 'Thrusting One Hand Sword' ? 'One Hand Sword' : o.type));
  if (!t) return null;
  if (!t.variants) return t.base;
  return (t.variants.find((v) => v.id === o.variant) || t.variants[0]).base;
}
const alsoFor = (o = {}) => { if (!typesCache) typesCache = itemTypes(); return typesCache.find((x) => x.id === (o.type === 'Thrusting One Hand Sword' ? 'One Hand Sword' : o.type))?.also || []; };

const TOP = 4; // the best tiers: T1 to T4

function magicView(o = {}) {
  const base = baseFor(o);
  const r = base && families({ base, also: alsoFor(o) });
  if (!r) return null;
  const fams = r.families.filter((f) => !f.influence).map((f) => ({ key: f.key, aff: f.aff, text: f.show, tiers: f.tiers.filter((t) => t.tier <= TOP).map((t) => ({ tier: t.tier, lvl: t.lvl, name: t.name, text: t.text })) }))
    .filter((f) => f.tiers.length)
    .sort((a, b) => (a.aff === b.aff ? 0 : a.aff === 'prefix' ? -1 : 1) || a.text[0].localeCompare(b.text[0]));
  return { type: o.type, variant: o.variant || null, base, families: fams };
}

/** The shortest piece of a mod name that nothing else on such an item has: no other mod name, base name or mod line. */
function namePiece(name, others) {
  const me = name.toLowerCase();
  const ok = (p) => /^[a-z' -]+$/.test(p) && !/^ | $/.test(p);
  for (let len = 3; len <= me.length; len += 1) {
    for (let i = 0; i + len <= me.length; i += 1) {
      const p = me.slice(i, i + len);
      // a piece across a space starts at a word, or its first letters could be the end of the word before it
      if (p.includes(' ') && i > 0 && me[i - 1] !== ' ') continue;
      if (ok(p) && !others.some((t) => t.includes(p))) return p;
    }
  }
  return null;
}

/**
 * choices: { type, variant, picks: { familyKey: [1, 2] } } -> a search for magic items with every mod you
 * ticked (any of the tiers you ticked for it), by the mods' names.
 */
function buildMagicRegex(choices = {}) {
  const base = baseFor(choices);
  const r = base && families({ base, also: alsoFor(choices) });
  if (!r) return { regex: '', length: 0, max: MAX, parts: [], notes: ['Pick an item type first.'] };
  const b = baseByName.get(base);
  const picks = choices.picks || {};
  const notes = [];
  const parts = [];
  // every name and line such an item can show
  const allNames = [];
  for (const f of r.families) for (const t of f.tiers) if (t.name) allNames.push({ f, t, n: t.name.toLowerCase() });
  const lines = [...r.families.flatMap((f) => f.tpl), ...NOISE, ...classNames(b.cls), ...(b.imp || []).flatMap((t) => t.split('\n')).map((l) => template(l).tpl)];
  for (const f of r.families) {
    const want = (picks[f.key] || []).map(Number).filter((n) => n >= 1 && n <= TOP);
    if (!want.length) continue;
    const tiers = f.tiers.filter((t) => want.includes(t.tier) && t.name);
    if (!tiers.length) continue;
    const pieces = [];
    for (const t of tiers) {
      const me = t.name.toLowerCase();
      const rest = allNames.filter((x) => x.t !== t && x.n !== me);
      const p = namePiece(t.name, [...rest.map((x) => x.n), ...lines]);
      if (p) { pieces.push(esc(p)); continue; }
      // the name is part of a longer one ("of the Lightning" / "of the Lightning Rod"): a prefix starts the
      // item's name and a suffix ends it, so pin the piece there
      const names = classNames(b.cls);
      let pinned = null;
      for (let len = 3; len <= me.length && !pinned; len += 1) {
        if (f.aff === 'prefix') {
          const q = me.slice(0, len);
          if (!/ $/.test(q) && !rest.some((x) => x.f.aff === 'prefix' && x.n.startsWith(q)) && !names.some((n) => n.startsWith(q)) && !lines.some((l) => l.startsWith(q))) pinned = `^${esc(q)}`;
        } else {
          const q = me.slice(me.length - len);
          if (!/^ /.test(q) && !rest.some((x) => x.f.aff === 'suffix' && x.n.endsWith(q)) && !names.some((n) => n.endsWith(q)) && !lines.some((l) => l.endsWith(q))) pinned = `${esc(q)}$`;
        }
      }
      if (pinned) pieces.push(pinned);
      else { notes.push(`"${t.name}" (${f.show[0]}) can't be told apart from another mod's name.`); pieces.push(esc(me)); }
    }
    parts.push({ key: f.key, aff: f.aff, label: `${f.show[0]} ${tiers.map((t) => `T${t.tier}`).join('/')}`, names: tiers.map((t) => t.name), text: [...new Set(pieces)].join('|') });
  }
  const prefixes = parts.filter((p) => p.aff === 'prefix').length;
  const suffixes = parts.length - prefixes;
  if (prefixes > 1 || suffixes > 1) notes.push('A magic item has one prefix and one suffix: with two mods of the same kind ticked nothing can match.');
  const regex = parts.map((p) => `"${p.text}"`).join(' ');
  return { regex, length: regex.length, max: MAX, parts, notes };
}

/** Campaign: every mod of an item type, all its tiers, searched by its text (any rarity). */
function campaignView(o = {}) {
  const base = baseFor(o);
  if (!base) return null;
  const v = modsView({ base, also: alsoFor(o) });
  return v && { ...v, type: o.type, variant: o.variant || null };
}
function buildCampaignRegex(choices = {}) {
  const base = baseFor(choices);
  if (!base) return { regex: '', length: 0, max: MAX, parts: [], notes: ['Pick an item type first.'] };
  return buildItemRegex({ base, also: alsoFor(choices), picks: choices.picks || {}, mode: choices.mode || 'any' });
}

module.exports = { itemBases, modsView, buildItemRegex, families, termFor, atLeast, template, itemTypes, magicView, buildMagicRegex, namePiece, campaignView, buildCampaignRegex, MAX };
