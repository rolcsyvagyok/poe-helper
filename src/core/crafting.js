'use strict';
/**
 * Crafting: every mod a base can roll at an item level, with the game's own spawn weights, so you can see
 * how likely a new prefix or suffix is each mod (a Chaos Orb, an Exalted Orb, an Orb of Alchemy…), and
 * each mod's tags (Fire, Attack, Life…). Data: the game's files, through scripts/build-item-mods.js.
 */
// the gear mods, and the cluster jewels' (their own file: scripts/build-cluster-mods.js); a copy, so the item regex
// (core/regex/items.js, same item-mods.json) doesn't get cluster jewels
const DATA = (() => {
  const d = require('./regex/item-mods.json');
  let c = { bases: [], mods: [] };
  try { c = require('./regex/cluster-mods.json'); } catch { /* without cluster jewels */ }
  return { ...d, bases: [...d.bases, ...c.bases], mods: [...d.mods, ...c.mods] };
})();

const baseByName = new Map(DATA.bases.map((b) => [b.name, b]));
const INFLUENCES = [['shaper', 'Shaper'], ['elder', 'Elder'], ['crusader', 'Crusader'], ['basilisk', 'Hunter'], ['eyrie', 'Redeemer'], ['adjudicator', 'Warlord']];

// the game's tags as the item text shows them; the others only steer the game's own rules
const HIDDEN_TAGS = new Set(['physical_damage', 'elemental_damage', 'caster_damage', 'chaos_damage', 'influence_mod', 'necropolis_exclusive_mod', 'red_herring', 'flat_life_regen', 'resource', 'drop', 'unveiled_mod']);
const TAG_NAMES = { dot_multi: 'Damage over Time', energy_shield: 'Energy Shield', power_charge: 'Power Charge', endurance_charge: 'Endurance Charge', frenzy_charge: 'Frenzy Charge', defences: 'Defences' };
const tagName = (t) => TAG_NAMES[t] || t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const showTags = (tags = []) => tags.filter((t) => !HIDDEN_TAGS.has(t)).map(tagName);

/**
 * The weight a mod has on a base with these tags: the first of its tags the base has decides. Cluster jewel mods
 * also have generation weights (a percentage, the first matching tag again): tags other mods add
 * ("has_affliction_notable") change them, so a Small Cluster Jewel with a notable can't roll another.
 */
function weightOn(mod, tags) {
  let w = 0;
  for (const [tag, n] of mod.w) if (tags.has(tag)) { w = n; break; }
  if (w > 0 && mod.gw) for (const [tag, n] of mod.gw) if (tags.has(tag)) { w = (w * n) / 100; break; }
  return w;
}

/** A cluster jewel's small passive kinds (from its enchantment); the kind's tag lets its notables roll. */
const kindsOf = (base) => base?.kinds || null;
function kindOf(base, enchant) {
  const k = kindsOf(base);
  if (!k) return null;
  return k.find((x) => x.tag === enchant || x.name === enchant) || k[0];
}
/** The tags the item's own mods add (a notable adds "has_affliction_notable"). */
function addedTags(mods) {
  const out = [];
  for (const m of mods || []) { const d = m?.id ? DATA.mods.find((x) => x.id === m.id) : m; for (const t of d?.adds || []) out.push(t); }
  return out;
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
    // a "#" already in the text (a level the files leave open) keeps its place
    for (const m of t.matchAll(/\((-?[\d.]+)-(-?[\d.]+)\)|(-?\d+(?:\.\d+)?)|#/g)) {
      if (m[0] === '#') { i++; continue; }
      const a = Number(m[1] ?? m[3]); const b = Number(m[2] ?? m[3]);
      lo[i] = Math.min(lo[i] ?? a, a); hi[i] = Math.max(hi[i] ?? b, b); i++;
    }
  }
  let i = 0;
  // a "#" the game's files leave open (a socketed support's level) stays "#"
  return first.replace(/#/g, () => { const a = lo[i]; const b = hi[i]; i++; return a == null || b == null ? '#' : a === b ? String(a) : `(${a}-${b})`; });
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
    for (let j = i + 1; j < lines.length && lines[j] && !lines[j].startsWith('{') && lines[j] !== '--------'; j++) body.push(lines[j].replace(/ \((fractured|crafted)\)$/, '').replace(/(\d)\(-?[\d.]+--?[\d.]+\)/g, '$1').replace(/ — Unscalable Value$/, ''));
    mods.push({ aff: m[2].toLowerCase(), name: m[3], text: body.filter((x) => !/^\(.*\)$/.test(x)).join('\n'), crafted: m[1] === 'Master Crafted ', fractured: m[1] === 'Fractured ' });
  }
  // plain copy: the explicit lines (the block after Item Level, before the flavour text)
  let plain = [];
  if (!mods.length) {
    const blocks = raw.split(/\n--------\n/);
    const k = blocks.findIndex((b) => /^Item Level:/m.test(b));
    const cand = blocks.slice(k + 1).filter((b) => !/\(implicit\)|\(enchant\)|^(Corrupted|Mirrored|Fractured Item|Note:)/m.test(b) && !/^"/.test(b.trim()));
    plain = (cand[0] || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ line: l.replace(/ \((fractured|crafted)\)$/, '').replace(/(\d)\(-?[\d.]+--?[\d.]+\)/g, '$1').replace(/ — Unscalable Value$/, ''), crafted: / \(crafted\)$/.test(l), fractured: / \(fractured\)$/.test(l) }));
  }
  // a cluster jewel's enchantment: its passive count and the small passives' kind ("Added Small Passive Skills grant:
  // 12% increased Fire Damage"; two lines for some kinds)
  let enchant = null; let passives = null;
  const kinds = kindsOf(baseByName.get(base));
  if (kinds) {
    const clean = (l) => l.replace(/ \(enchant\)$/, '').replace(/ — Unscalable Value$/, '').replace(/(\d)\(-?[\d.]+--?[\d.]+\)/g, '$1');
    const grants = lines.map(clean).map((l) => /^Added Small Passive Skills grant: (.+)$/.exec(l)?.[1]).filter(Boolean);
    const tpl = (t) => t.replace(/-?\d+(?:\.\d+)?/g, '#').toLowerCase();
    const want = tpl(grants.join('\n'));
    enchant = grants.length ? (kinds.find((k) => tpl(k.text) === want) || kinds.find((k) => tpl(k.text).split('\n')[0] === want.split('\n')[0]))?.tag || null : null;
    passives = Number((/^Adds (\d+) Passive Skills/m.exec(raw) || [])[1]) || null;
  }
  return { base, ilvl, rarity, influences: inf, mods, plain, fractured: /^Fractured Item$/m.test(raw), corrupted: /^Corrupted$/m.test(raw), enchant, passives };
}

const TPL = (t) => t.replace(/\((-?[\d.]+)-(-?[\d.]+)\)|-?\d+(?:\.\d+)?/g, '#').toLowerCase();

// is the rolled value inside the tier's range?
function rollIn(tierLine, line) {
  // "#": a number the game's files don't give (a socketed support's level) matches any value
  const r = [...tierLine.matchAll(/\((-?[\d.]+)-(-?[\d.]+)\)|(-?\d+(?:\.\d+)?)|#/g)].map((m) => (m[0] === '#' ? [-Infinity, Infinity] : [Number(m[1] ?? m[3]), Number(m[2] ?? m[3])]));
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
/**
 * Every mod of one domain a base with these tags can roll, as families with chances on each side.
 * dom 'unveiled': the mods Jun's Veiled mods unveil into.
 */
function poolsFor(base, tags, ilvl, dom) {
  const fams = new Map();
  for (const m of DATA.mods) {
    if (m.dom !== dom) continue;
    const w = weightOn(m, tags);
    if (!(w > 0)) continue;
    const key = `${m.aff}|${m.type}`;
    if (!fams.has(key)) {
      const inf = INFLUENCES.find(([id]) => m.w.some(([tag, n]) => n > 0 && tags.has(tag) && tag.endsWith(`_${id}`)));
      fams.set(key, { key, aff: m.aff === 'p' ? 'prefix' : 'suffix', group: m.grp || m.type, tags: showTags(m.tags), influence: inf ? inf[1] : null, tiers: [] });
    }
    fams.get(key).tiers.push({ name: m.name, lvl: m.lvl, text: cleanText(m.text), weight: w, open: m.lvl <= ilvl });
  }
  const sides = { prefix: { total: 0, families: [] }, suffix: { total: 0, families: [] } };
  for (const f of fams.values()) {
    f.tiers.sort((a, b) => b.lvl - a.lvl || a.text.localeCompare(b.text));
    f.tiers.forEach((t, i) => { t.tier = i + 1; });
    f.weight = f.tiers.filter((t) => t.open).reduce((n, t) => n + t.weight, 0);
    const top = f.tiers.find((t) => t.open) || f.tiers[0];
    f.text = top.text.replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, '#').replace(/(^|[^\w])-?\d+(\.\d+)?/g, '$1#');
    f.range = rangeText(f.tiers.filter((t) => t.open).map((t) => t.text)) || f.text;
    if (!f.weight) continue;
    sides[f.aff].families.push(f);
    sides[f.aff].total += f.weight;
  }
  for (const s of Object.values(sides)) {
    for (const f of s.families) { f.chance = f.weight / s.total; for (const t of f.tiers) t.chance = t.open ? t.weight / s.total : 0; }
    s.families.sort((a, b) => b.chance - a.chance || a.text.localeCompare(b.text));
  }
  return sides;
}

// ---------- Searing Exarch and Eater of Worlds implicits (Eldritch Embers and Ichors) ----------
let ELDRITCH = null;
const eldritchData = () => ELDRITCH || (ELDRITCH = require('./regex/eldritch-mods.json'));
const ELDRITCH_TIERS = ['Lesser', 'Greater', 'Grand', 'Exceptional', 'Exquisite', 'Perfect'];
const PRESENCE = { unique: 'While a Unique Enemy is in your Presence, ', pinnacle: 'While a Pinnacle Atlas Boss is in your Presence, ' };

/**
 * The implicits a Searing Exarch (Ember) or Eater of Worlds (Ichor) orb of a tier can give this base, with the chance
 * of each. side: 'exarch' | 'eater'; tier 1-6 (Lesser … Perfect). -> { total, families } like a mod pool, or null
 * when the base can't have them (only body armours, helmets, gloves, boots and amulets).
 */
function eldritchPool(base, side, tier = 6) {
  const tags = new Set(base.tags);
  const fams = new Map();
  for (const m of eldritchData()[side] || []) {
    const w = weightOn(m, tags);
    if (!(w > 0)) continue;
    const key = `${side}|${m.type}|${m.presence || ''}`;
    const text = (PRESENCE[m.presence] || '') + cleanText(m.text);
    if (!fams.has(key)) fams.set(key, { key, aff: side, group: m.type, tags: showTags(m.tags), influence: null, noWant: true, presence: m.presence, tiers: [] });
    fams.get(key).tiers.push({ tier: m.tier, name: ELDRITCH_TIERS[m.tier - 1], lvl: m.tier, text, weight: w, open: m.tier === tier });
  }
  if (!fams.size) return null;
  const out = { total: 0, families: [] };
  for (const f of fams.values()) {
    f.tiers.sort((a, b) => b.tier - a.tier);
    const at = f.tiers.find((t) => t.open);
    f.weight = at ? at.weight : 0;
    f.text = (at || f.tiers[0]).text;
    f.range = f.text;
    f.tierWord = true; // the tier list shows the orb name, not an item level
    out.families.push(f);
    out.total += f.weight;
  }
  for (const f of out.families) { f.chance = out.total ? f.weight / out.total : 0; for (const t of f.tiers) t.chance = t.open && out.total ? t.weight / out.total : 0; }
  out.families.sort((a, b) => b.chance - a.chance || a.text.localeCompare(b.text));
  out.families = out.families.filter((f) => f.weight > 0).concat(out.families.filter((f) => !f.weight)); // ones this tier can't give last
  return out;
}

/** Unveiling offers 3 different mods: the chance each one is among them (drawn by weight, no repeats). */
function withOffered(sides) {
  for (const s of Object.values(sides)) {
    const p = s.families.map((f) => f.chance);
    const n = p.length;
    s.families.forEach((f, i) => {
      if (n <= 3) { f.offered = 1; return; }
      let q = p[i];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        q += p[j] * p[i] / (1 - p[j]);
        for (let k = 0; k < n; k++) if (k !== i && k !== j) q += p[j] * (p[k] / (1 - p[j])) * (p[i] / (1 - p[j] - p[k]));
      }
      f.offered = Math.min(1, q);
    });
  }
  return sides;
}

/**
 * Blockers: bench crafts that make the mods you want likelier. A crafted mod takes a slot on its side and
 * stops its mod group(s) rolling there (a hybrid like "+# to Strength and Dexterity" stops two groups);
 * "Cannot roll Attack / Caster Modifiers" stops every attack / caster mod on both sides. For each one: the
 * chance a new prefix / suffix is one you ticked, before and after. Blockers that would block what you
 * want are left out.
 */
function blockersFor(cls, v, targets) {
  const want = new Set(targets || []);
  if (!want.size) return null;
  const sides = ['prefix', 'suffix'];
  const live = (f) => !f.yours && !f.blocked;
  const chance = (side, out = new Set()) => {
    const fs = v[side].families.filter((f) => live(f) && !out.has(f.key));
    const tot = fs.reduce((n, f) => n + f.weight, 0);
    const hit = fs.filter((f) => want.has(f.key)).reduce((n, f) => n + f.weight, 0);
    return tot ? hit / tot : 0;
  };
  const wantSides = sides.filter((sd) => v[sd].families.some((f) => want.has(f.key)));
  const before = Object.fromEntries(wantSides.map((sd) => [sd, chance(sd)]));
  const rows = [];
  for (const b of DATA.bench || []) {
    if (!b.cls.includes(cls)) continue;
    const bSide = b.aff === 'p' ? 'prefix' : 'suffix';
    const out = new Set();
    const blocked = [];
    for (const sd of sides) for (const f of v[sd].families) {
      if (!live(f)) continue;
      const hit = b.meta ? (f.rawTags || []).includes(b.meta) : sd === bSide && b.groups.includes(f.group);
      if (hit) { out.add(f.key); blocked.push({ side: sd, text: f.range || f.text, weight: f.weight, chance: f.chance }); }
    }
    if (!blocked.length || [...out].some((k) => want.has(k))) continue;
    const after = Object.fromEntries(wantSides.map((sd) => [sd, chance(sd, out)]));
    const gain = wantSides.reduce((n, sd) => n + (after[sd] - before[sd]), 0) / wantSides.length;
    if (!(gain > 1e-9)) continue;
    rows.push({ text: cleanText(b.text), side: bSide, cost: b.cost, meta: b.meta || null, groups: b.groups.length, blocked, before, after, gain, takesSlot: bSide });
  }
  // one line per blocker (its cheapest tier): the same groups blocked the same way
  const best = new Map();
  for (const r of rows) { const k = `${r.side}|${r.meta || r.blocked.map((x) => x.text).join('|')}`; const p = best.get(k); if (!p) best.set(k, r); }
  const list = [...best.values()].sort((a, b) => b.gain - a.gain);
  return { before, sides: wantSides, rows: list.slice(0, 12) };
}

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
  // a cluster jewel: the small passives' kind (from your item's enchantment, or picked) decides its notables
  const kind = kindOf(base, o.enchant || item?.enchant);
  if (kind) tags.add(kind.tag);
  // tags your item's mods add (a cluster jewel's notable: "has_affliction_notable"): they change the chances of
  // the next mod, not which families your mods are found in
  const tagsNow = new Set(tags);
  if (item && base.dom === 'affliction_jewel') {
    const lines = [...item.mods.map((md) => md.text), ...item.plain.map((p) => p.line)];
    for (const l of lines) { const d = DATA.mods.find((x) => x.dom === base.dom && x.adds && TPL(cleanText(x.text)) === TPL(l)); for (const t of d?.adds || []) tagsNow.add(t); }
  }
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
    fams.get(key).tiers.push({ name: m.name, lvl: m.lvl, text: cleanText(m.text), weight: tagsNow.size > tags.size ? weightOn(m, tagsNow) : w, open: m.lvl <= ilvl });
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
      const same = (x) => x.name === md.name && TPL(x.text) === TPL(md.text);
      const inRoll = (x) => { const tl = x.text.split('\n'); const ml = md.text.split('\n'); return tl.length === ml.length && tl.every((l, k) => rollIn(l, ml[k])); };
      const t = f?.tiers.find((x) => same(x) && inRoll(x)) || f?.tiers.find(same) || f?.tiers.find((x) => x.name === md.name);
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
    if (mine) f.yours = { tier: mine.tier, name: mine.name, crafted: mine.crafted, fractured: mine.fractured, text: mine.text };
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
    blockers: blockersFor(base.cls, sides, o.targets),
    // Jun's Veiled mods: what a veiled prefix / suffix unveils into on this base (you pick 1 of 3 offered)
    veiled: base.dom === 'item' ? withOffered(poolsFor(base, new Set(base.tags), ilvl, 'unveiled')) : null,
    // each influence's own mods, with their chance if the item had that influence (and no other)
    influenceMods: infTags.length ? Object.fromEntries(INFLUENCES.map(([id, name]) => {
      const t = new Set(base.tags); const it = infTags.find((x) => x.endsWith(`_${id}`)); if (it) t.add(it);
      const sides = poolsFor(base, t, ilvl, base.dom);
      for (const k of ['prefix', 'suffix']) sides[k] = { total: sides[k].total, families: sides[k].families.filter((f) => f.influence === name) };
      return [id, sides];
    })) : null,
    // the Searing Exarch and Eater of Worlds implicits at the orb tier you pick
    eldritch: (() => { const t = Math.min(6, Math.max(1, Math.round(Number(o.eldritchTier) || 6))); const ex = eldritchPool(base, 'exarch', t); const ea = eldritchPool(base, 'eater', t); return ex || ea ? { tier: t, tiers: ELDRITCH_TIERS, exarch: ex, eater: ea } : null; })(),
    item: item ? { rarity: item.rarity, fractured: item.fractured, corrupted: item.corrupted, mods: yours, slots: slotsFor(base, item, yours), unknown: item.base ? 0 : 1 } : null,
    tags: [...tagTotals.values()].sort((a, b) => b.prefix + b.suffix - (a.prefix + a.suffix)),
    // a cluster jewel: the small passive kinds its enchantment can be (the picked one decides the notables)
    cluster: kind ? { kinds: kindsOf(base).map((k) => ({ tag: k.tag, name: k.name, text: k.text })), enchant: kind.tag, passives: item?.passives || null, range: base.passives || null, fromItem: !!item?.enchant } : null,
  };
}

module.exports = { eldritchPool, ELDRITCH_TIERS, readItem, rangeText, craftView, craftBases, weightOn, showTags, INFLUENCES, DATA, kindOf, addedTags };
