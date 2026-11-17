'use strict';
/**
 * Crafting: every mod a base can roll at an item level, with the game's own spawn weights, so you can see
 * how likely a new prefix or suffix is each mod (a Chaos Orb, an Exalted Orb, an Orb of Alchemy…), and
 * each mod's tags (Fire, Attack, Life…). Data: the game's files, through scripts/build-item-mods.js.
 */
const DATA = require('./regex/item-mods.json');

const baseByName = new Map(DATA.bases.map((b) => [b.name, b]));
const INFLUENCES = [['shaper', 'Shaper'], ['elder', 'Elder'], ['crusader', 'Crusader'], ['basilisk', 'Hunter'], ['eyrie', 'Redeemer'], ['adjudicator', 'Warlord']];

// the game's tags as the item text shows them; the others only steer the game's own rules
const HIDDEN_TAGS = new Set(['physical_damage', 'elemental_damage', 'caster_damage', 'chaos_damage', 'influence_mod', 'necropolis_exclusive_mod', 'red_herring', 'flat_life_regen', 'resource', 'drop']);
const TAG_NAMES = { dot_multi: 'Damage over Time', energy_shield: 'Energy Shield', power_charge: 'Power Charge', endurance_charge: 'Endurance Charge', frenzy_charge: 'Frenzy Charge', defences: 'Defences' };
const tagName = (t) => TAG_NAMES[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const showTags = (tags = []) => tags.filter((t) => !HIDDEN_TAGS.has(t)).map(tagName);

/** The weight a mod has on a base with these tags: the first of its tags the base has decides. */
function weightOn(mod, tags) {
  for (const [tag, w] of mod.w) if (tags.has(tag)) return w;
  return 0;
}

// the game's markup: "[PlayerItemRarity|Item Rarity]" -> "Item Rarity"
const cleanText = (t) => t.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1');

/** "+(3-189) to maximum Life": the lines with each number's full range over the tiers given. */
function rangeText(texts) {
  if (!texts.length) return null;
  const NUM = /\((-?[\d.]+)-(-?[\d.]+)\)|(-?\d+(?:\.\d+)?)/g;
  const tpl = (t) => t.replace(NUM, '#');
  const first = tpl(texts[0]);
  if (texts.some((t) => tpl(t) !== first)) return null;
  const lo = []; const hi = [];
  for (const t of texts) {
    let i = 0;
    for (const m of t.matchAll(NUM)) {
      const a = Number(m[1] ?? m[3]); const b = Number(m[2] ?? m[3]);
      lo[i] = Math.min(lo[i] ?? a, a); hi[i] = Math.max(hi[i] ?? b, b); i++;
    }
  }
  let i = 0;
  return first.replace(/#/g, () => { const a = lo[i]; const b = hi[i]; i++; return a === b ? String(a) : `(${a}-${b})`; });
}

/**
 * Your own item from its text (Ctrl+C, or Ctrl+Alt+C for mod names): base, item level, influences, rarity
 * and its prefixes and suffixes. Mods are found by name (advanced copy) or else by their text.
 */
function readItem(text) {
  const raw = String(text || '').replace(/\r/g, '');
  const lines = raw.split('\n').map((l) => l.trim());
  const rarity = (/^Rarity: (\w+)/m.exec(raw) || [])[1] || null;
  const ilvl = Number((/^Item Level: (\d+)/m.exec(raw) || [])[1]) || null;
  const inf = [];
  for (const [id, name] of INFLUENCES) if (new RegExp(`^${name} Item$`, 'm').test(raw)) inf.push(id);
  // the base: the last header line (before the first ----) that is a base name
  const head = lines.slice(0, Math.max(1, lines.indexOf('--------')));
  let base = null;
  for (const l of head) {
    const clean = l.replace(/^(Superior|Synthesised|Fractured) /, '');
    if (baseByName.has(clean)) base = clean;
    else for (const b of baseByName.keys()) if (clean.includes(b) && (!base || b.length > base.length)) base = b; // magic: "Prefix Base of Suffix"
  }
  const mods = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\{ (Fractured |Master Crafted )?(Prefix|Suffix) Modifier "([^"]+)"/.exec(lines[i]);
    if (!m) continue;
    const body = [];
    for (let j = i + 1; j < lines.length && lines[j] && !lines[j].startsWith('{') && lines[j] !== '--------'; j++) body.push(lines[j].replace(/ \((fractured|crafted)\)$/, '').replace(/(\d)\(-?[\d.]+--?[\d.]+\)/g, '$1'));
    mods.push({ aff: m[2].toLowerCase(), name: m[3], text: body.filter((x) => !/^\(.*\)$/.test(x)).join('\n'), crafted: m[1] === 'Master Crafted ', fractured: m[1] === 'Fractured ' });
  }
  // plain copy: the explicit lines (the block after Item Level, before the flavour text)
  let plain = [];
  if (!mods.length) {
    const blocks = raw.split(/\n--------\n/);
    const k = blocks.findIndex((b) => /^Item Level:/m.test(b));
    const cand = blocks.slice(k + 1).filter((b) => !/\(implicit\)|\(enchant\)|^(Corrupted|Mirrored|Fractured Item|Note:)/m.test(b) && !/^"/.test(b.trim()));
    plain = (cand[0] || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ line: l.replace(/ \((fractured|crafted)\)$/, '').replace(/(\d)\(-?[\d.]+--?[\d.]+\)/g, '$1'), crafted: / \(crafted\)$/.test(l), fractured: / \(fractured\)$/.test(l) }));
  }
  return { base, ilvl, rarity, influences: inf, mods, plain, fractured: /^Fractured Item$/m.test(raw), corrupted: /^Corrupted$/m.test(raw) };
}

const TPL = (t) => t.replace(/\((-?[\d.]+)-(-?[\d.]+)\)|-?\d+(?:\.\d+)?/g, '#').toLowerCase();

// is the rolled value inside the tier's range?
function rollIn(tierLine, line) {
  const r = [...tierLine.matchAll(/\((-?[\d.]+)-(-?[\d.]+)\)|(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1] ?? m[3]), Number(m[2] ?? m[3])]);
  const v = [...line.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return r.length === v.length && r.every(([a, b], i) => v[i] >= Math.min(a, b) && v[i] <= Math.max(a, b));
}

/** Open prefix and suffix slots: rare 3 + 3 (jewels 2 + 2), magic 1 + 1. */
function slotsFor(base, item, yours) {
  const jewel = /Jewel/.test(base.cls);
  const max = item.rarity === 'Magic' ? 1 : item.rarity === 'Rare' ? (jewel ? 2 : 3) : 0;
  const n = (a) => yours.filter((y) => y.aff === a).length;
  return { max, prefix: n('prefix'), suffix: n('suffix') };
}

/** Bases by item class, for the picker. */
function craftBases() {
  const byCls = new Map();
  for (const b of DATA.bases) {
    if (!byCls.has(b.cls)) byCls.set(b.cls, []);
    // armour by its defences (like Craft of Exile's STR / DEX / INT tabs)
    const at = (b.tags || []).find((t) => /^(str|dex|int|str_dex|str_int|dex_int|str_dex_int)_(armour|shield)$/.test(t));
    const attr = at ? at.replace(/_(armour|shield)$/, '').split('_').map((x) => x.toUpperCase()).join('/') : null;
    byCls.get(b.cls).push({ name: b.name, lvl: b.lvl, ...(attr ? { attr } : {}) });
  }
  return [...byCls].map(([cls, bases]) => ({ cls, bases, influence: !!DATA.influence[cls] }));
}

/**
 * o: { base, ilvl (default 86), influences: ['shaper', …] (up to 2) }
 * Returns { base, ilvl, influences, prefix: { total, families }, suffix: { … }, tags: [{ tag, prefix, suffix }] }.
 * A family is one kind of mod (its tiers best first); chance = its weight / every weight on that side.
 */
function craftView(o = {}) {
  const item = o.item ? readItem(o.item) : null;
  if (item?.base) o = { ...o, base: item.base, ilvl: o.ilvl || item.ilvl, influences: o.influences || item.influences };
  const base = baseByName.get(o.base);
  if (!base) return null;
  const ilvl = Math.max(1, Math.min(100, Number(o.ilvl) || 86));
  const tags = new Set(base.tags);
  const infTags = DATA.influence[base.cls] || [];
  const influences = (o.influences || []).filter((i) => INFLUENCES.some(([id]) => id === i)).slice(0, 2);
  for (const inf of influences) { const t = infTags.find((x) => x.endsWith(`_${inf}`)); if (t) tags.add(t); }
  const fams = new Map();
  for (const m of DATA.mods) {
    if (m.dom !== base.dom) continue;
    const w = weightOn(m, tags);
    if (!(w > 0)) continue;
    const key = `${m.aff}|${m.type}`;
    if (!fams.has(key)) {
      const inf = INFLUENCES.find(([id]) => m.w.some(([tag, n]) => n > 0 && tags.has(tag) && tag.endsWith(`_${id}`)));
      fams.set(key, { key, aff: m.aff === 'p' ? 'prefix' : 'suffix', group: m.grp || m.type, tags: showTags(m.tags), rawTags: m.tags || [], influence: inf ? inf[1] : null, tiers: [] });
    }
    fams.get(key).tiers.push({ name: m.name, lvl: m.lvl, text: cleanText(m.text), weight: w, open: m.lvl <= ilvl });
  }
  // your item's mods: which family and tier each is; their groups can't roll again
  const yours = [];
  if (item) {
    const all = [...fams.values()];
    const findByName = (md) => {
      const hits = all.filter((f) => f.aff === md.aff && f.tiers.some((t) => t.name === md.name));
      return hits.find((f) => f.tiers.some((t) => t.name === md.name && TPL(t.text) === TPL(md.text))) || hits[0] || null;
    };
    for (const md of item.mods) {
      const f = findByName(md);
      const t = f?.tiers.find((x) => x.name === md.name && TPL(x.text) === TPL(md.text)) || f?.tiers.find((x) => x.name === md.name);
      yours.push({ ...md, key: f?.key || null, group: f?.group || null, tierName: t?.name, tierText: t?.text });
    }
    // plain copy: match the lines to families by their text; a hybrid mod takes two lines in a row
    const used = new Set();
    const P = item.plain;
    for (let i = 0; i < P.length; i++) {
      const veil = /^Veiled (Prefix|Suffix)$/.exec(P[i].line);
      if (veil) { yours.push({ aff: veil[1].toLowerCase(), name: 'Veiled', text: P[i].line, key: null, group: null }); continue; }
      let best = null;
      for (const f of all) {
        if (used.has(f.key)) continue;
        for (const t of f.tiers) {
          const tl = t.text.split('\n');
          if (i + tl.length > P.length || !tl.every((l, k) => TPL(l) === TPL(P[i + k].line))) continue;
          const inRange = tl.every((l, k) => rollIn(l, P[i + k].line));
          const score = tl.length * 10 + (inRange ? 1 : 0);
          if (!best || score > best.score) best = { f, t: inRange ? t : null, n: tl.length, score };
        }
      }
      if (!best) continue;
      used.add(best.f.key);
      const t = best.t || best.f.tiers.find((x) => x.text.split('\n').every((l, k) => rollIn(l, P[i + k]?.line || '')));
      yours.push({ aff: best.f.aff, name: t?.name || '', text: P.slice(i, i + best.n).map((x) => x.line).join('\n'), crafted: P[i].crafted, fractured: P[i].fractured, key: best.f.key, group: best.f.group, tierName: t?.name, tierText: t?.text });
      i += best.n - 1;
    }
  }
  const taken = new Set(yours.map((y) => y.group).filter(Boolean));
  const sides = { prefix: { total: 0, families: [] }, suffix: { total: 0, families: [] } };
  for (const f of fams.values()) {
    f.tiers.sort((a, b) => b.lvl - a.lvl || a.text.localeCompare(b.text));
    f.tiers.forEach((t, i) => { t.tier = i + 1; });
    f.weight = f.tiers.filter((t) => t.open).reduce((n, t) => n + t.weight, 0);
    // the family's line(s) with numbers as # (from its best open tier)
    const top = f.tiers.find((t) => t.open) || f.tiers[0];
    f.text = top.text.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, '#').replace(/(^|[^\w])-?\d+(\.\d+)?/g, '$1#');
    f.range = rangeText(f.tiers.filter((t) => t.open).map((t) => t.text)) || f.text;
    const mine = yours.find((y) => y.key === f.key);
    if (mine) mine.tier = f.tiers.find((t) => t.name === mine.tierName && t.text === mine.tierText)?.tier ?? null;
    if (mine) f.yours = { tier: mine.tier, name: mine.name, crafted: mine.crafted, fractured: mine.fractured };
    // a group already on your item can't roll again: it stays listed, at 0%
    f.blocked = !mine && taken.has(f.group);
    if (!f.weight) continue;
    sides[f.aff].families.push(f);
    if (!mine && !f.blocked) sides[f.aff].total += f.weight;
  }
  const tagTotals = new Map();
  for (const side of ['prefix', 'suffix']) {
    const s = sides[side];
    for (const f of s.families) {
      const can = !f.yours && !f.blocked && s.total > 0;
      f.chance = can ? f.weight / s.total : 0;
      for (const t of f.tiers) t.chance = can && t.open ? t.weight / s.total : 0;
      for (const tg of f.tags) {
        if (!tagTotals.has(tg)) tagTotals.set(tg, { tag: tg, prefix: 0, suffix: 0 });
        tagTotals.get(tg)[side] += f.chance;
      }
    }
    s.families.sort((a, b) => (b.yours ? 1 : 0) - (a.yours ? 1 : 0) || b.chance - a.chance || a.text.localeCompare(b.text));
  }
  return {
    base: { name: base.name, cls: base.cls, lvl: base.lvl },
    ilvl, influences, canInfluence: infTags.length > 0,
    prefix: sides.prefix, suffix: sides.suffix,
    item: item ? { rarity: item.rarity, fractured: item.fractured, corrupted: item.corrupted, mods: yours, slots: slotsFor(base, item, yours), unknown: item.base ? 0 : 1 } : null,
    tags: [...tagTotals.values()].sort((a, b) => b.prefix + b.suffix - (a.prefix + a.suffix)),
  };
}

module.exports = { readItem, rangeText, craftView, craftBases, weightOn, showTags, INFLUENCES };
