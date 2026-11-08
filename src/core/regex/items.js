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
  const ilvl = Number(o.ilvl) > 0 ? Number(o.ilvl) : 100;
  const fam = new Map();
  for (const m of DATA.mods) {
    if (m.dom !== base.dom || !canRoll(m, tags)) continue;
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
  if (!namesByCls.has(cls)) namesByCls.set(cls, DATA.bases.filter((b) => b.cls === cls).map((b) => b.name.toLowerCase()));
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

module.exports = { itemBases, modsView, buildItemRegex, families, termFor, atLeast, template, MAX };
