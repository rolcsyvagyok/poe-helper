'use strict';
/**
 * The craft emulator: an item you can try crafts on, like Craft of Exile's emulator. Currency (Transmutation
 * to Divine), the crafting bench, Harvest reforges and fossils, with the game's own mod weights from
 * core/regex/item-mods.json. Everything here is pure: an item state in, a new item state out.
 *
 * state: { base, ilvl, rarity: 'Normal'|'Magic'|'Rare', influences: ['shaper', …], corrupted, mods: [mod] }
 * mod:   { id, aff: 'prefix'|'suffix', text, groups, tags, crafted?, fractured?, meta?, unknown? }
 *
 * How many mods a reforge gives (Chaos Orb, Alchemy, fossils, Harvest): 4 mods 8 in 12, 5 mods 3 in 12,
 * 6 mods 1 in 12 (jewels: 3 or 4). Transmutation and Alteration: 1 or 2 mods, half each. These are the
 * usual community numbers; the game doesn't publish them.
 */
const { readItem, craftView, weightOn, showTags, INFLUENCES, DATA, kindOf, addedTags } = require('./crafting'); // DATA: gear and cluster jewel mods

const baseByName = new Map(DATA.bases.map((b) => [b.name, b]));
const modById = new Map(DATA.mods.map((m) => [m.id, m]));
const fossilByName = new Map((DATA.fossils || []).map((f) => [f.name, f]));
const benchById = new Map((DATA.benchAll || []).map((b) => [b.id, b]));

const TPL = (t) => String(t).replace(/\((-?[\d.]+)-(-?[\d.]+)\)|-?\d+(?:\.\d+)?/g, '#').toLowerCase();
const side = (a) => (a === 'p' || a === 'prefix' ? 'prefix' : 'suffix');
const keyOf = (m) => `${m.aff[0]}|${m.type}`;

// ---------- random numbers: Math.random by default, a seeded one for chances (the same answer each time) ----------
function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- the item ----------
function itemTags(base, influences, enchant) {
  const tags = new Set(base.tags);
  const infTags = DATA.influence[base.cls] || [];
  for (const inf of influences || []) { const t = infTags.find((x) => x.endsWith(`_${inf}`)); if (t) tags.add(t); }
  const k = kindOf(base, enchant); // a cluster jewel's small passive kind
  if (k) tags.add(k.tag);
  return tags;
}
/** The tags now, with the ones the item's mods add (a cluster jewel's notable: no second one on a Small). */
const tagsNow = (state, base) => { const t = itemTags(base, state.influences, state.enchant); for (const x of addedTags(state.mods)) t.add(x); return t; };
const isJewel = (base) => /Jewel/.test(base.cls);
const maxPerSide = (base, rarity) => (rarity === 'Magic' ? 1 : rarity === 'Rare' ? (isJewel(base) ? 2 : 3) : 0);
const count = (state, sd) => state.mods.filter((m) => m.aff === sd).length;
const takenGroups = (state) => new Set(state.mods.flatMap((m) => m.groups || []));
const metas = (state) => new Set(state.mods.map((m) => m.meta).filter(Boolean));
// mods a Scour, an Annulment or a Harvest reforge can't touch: fractured ones and a side the bench locked
function locked(state) {
  const me = metas(state);
  return (m) => !!m.fractured || (me.has('keepPrefixes') && m.aff === 'prefix') || (me.has('keepSuffixes') && m.aff === 'suffix');
}

/** One value inside each "(a-b)"; lucky: the better of two. */
function rollText(text, rng, lucky) {
  return String(text).replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, (_, a, b) => {
    const lo = Number(a); const hi = Number(b);
    const dec = Math.max((a.split('.')[1] || '').length, (b.split('.')[1] || '').length);
    const one = () => { const v = lo + (hi - lo) * rng(); return dec ? Number(v.toFixed(dec)) : Math.round(v); };
    let v = one();
    if (lucky) { const w = one(); v = Math.abs(w) > Math.abs(v) ? w : v; }
    return String(v);
  });
}

function newMod(m, rng, o = {}) {
  return { id: m.id, aff: side(m.aff), text: rollText(m.text, rng, o.lucky), groups: m.grp ? [m.grp] : [], tags: m.tags || [], ...(o.crafted ? { crafted: true } : {}) };
}

// ---------- the mods that can roll ----------
/** The fossils' multiplier for one mod: each fossil's weight for each tag the mod has (1000 = ×10, 0 = never). */
function fossilFactor(m, fossils) {
  const tags = m.tags || [];
  let f = 1;
  for (const fo of fossils) {
    for (const [t, w] of fo.more) if (tags.includes(t)) f *= w / 100;
    for (const [t, w] of fo.less) if (tags.includes(t)) f *= w / 100;
    if (/No Tagless/i.test(fo.text) && !tags.length) f = 0;
  }
  return f;
}

/** Every mod the item could get (before slots and groups): { m, w, key, inf }. */
function candidates(state, o = {}) {
  const base = baseByName.get(state.base);
  const tags = itemTags(base, state.influences, state.enchant);
  const fossils = o.fossils || [];
  const added = new Set(fossils.flatMap((f) => f.added));
  const out = [];
  for (const m of DATA.mods) {
    if (m.dom !== base.dom && !(m.dom === 'delve' && added.has(m.id))) continue;
    if (m.lvl > state.ilvl) continue;
    let w = weightOn(m, tags);
    if (!(w > 0)) continue;
    if (fossils.length) w *= fossilFactor(m, fossils);
    if (!(w > 0)) continue;
    const inf = m.w.some(([t, n]) => n > 0 && tags.has(t) && INFLUENCES.some(([id]) => t.endsWith(`_${id}`)));
    out.push({ m, w, key: keyOf(m), inf, aff: side(m.aff), grp: m.grp, tags: m.tags || [], ...(m.gw ? { gw: true } : {}) });
  }
  return out;
}

/** The ones that fit now: an open slot on their side, their group not on the item, no "Cannot roll …" in the way. */
function fits(state, cands, o = {}) {
  const base = baseByName.get(state.base);
  const max = maxPerSide(base, state.rarity === 'Normal' ? 'Rare' : state.rarity);
  const taken = takenGroups(state);
  const me = metas(state);
  const open = { prefix: count(state, 'prefix') < max, suffix: count(state, 'suffix') < max };
  const ok = cands.filter((c) => open[c.aff] && !(c.grp && taken.has(c.grp))
    && !(me.has('attack') && c.tags.includes('attack')) && !(me.has('caster') && c.tags.includes('caster'))
    && (!o.tag || c.tags.includes(o.tag)) && (!o.influence || c.inf));
  // cluster jewel mods: their weight with the tags the item's mods add now (a Small Cluster Jewel's second notable: 0)
  if (!ok.some((c) => c.gw)) return ok;
  const now = tagsNow(state, base);
  return ok.map((c) => (c.gw ? { ...c, w: (c.w / weightOn(c.m, itemTags(base, state.influences, state.enchant))) * weightOn(c.m, now) } : c)).filter((c) => c.w > 0);
}

function pickWeighted(list, rng) {
  const tot = list.reduce((n, c) => n + c.w, 0);
  if (!(tot > 0)) return null;
  let r = rng() * tot;
  for (const c of list) { r -= c.w; if (r < 0) return c; }
  return list[list.length - 1];
}

/** Adds one random mod; false when nothing can roll. */
function addOne(state, cands, rng, o = {}) {
  const c = pickWeighted(fits(state, cands, o), rng);
  if (!c) return false;
  state.mods.push(newMod(c.m, rng, o));
  return true;
}

function reforgeCount(base, rng) {
  const r = rng();
  if (isJewel(base)) return r < 2 / 3 ? 3 : 4;
  return r < 8 / 12 ? 4 : r < 11 / 12 ? 5 : 6;
}

/**
 * Rerolls a rare: keeps `keep` mods, then rolls up to a random total (at least one new mod when `first`
 * asks for one: a Harvest tag, an influence mod).
 */
function reforge(state, rng, o = {}) {
  const base = baseByName.get(state.base);
  const keep = o.keep || ((m) => !!m.fractured);
  state.mods = state.mods.filter(keep);
  state.rarity = 'Rare';
  const cands = o.cands || candidates(state, o);
  const want = Math.max(reforgeCount(base, rng), state.mods.length + (o.first ? 1 : 0));
  if (o.first && !addOne(state, cands, rng, { ...o.first, lucky: o.lucky })) return false;
  while (state.mods.length < want) if (!addOne(state, cands, rng, { lucky: o.lucky })) break;
  return true;
}

const clone = (s) => ({ ...s, influences: [...(s.influences || [])], mods: s.mods.map((m) => ({ ...m })) });

// ---------- the crafts ----------
const RES = ['Fire', 'Cold', 'Lightning'];
/** Harvest's tags: the button's name and the mod tag it guarantees. */
const HARVEST_TAGS = [['Fire', 'fire'], ['Cold', 'cold'], ['Lightning', 'lightning'], ['Physical', 'physical'], ['Chaos', 'chaos'], ['Life', 'life'], ['Defence', 'defences'], ['Attack', 'attack'], ['Caster', 'caster'], ['Speed', 'speed'], ['Critical', 'critical']];

const CURRENCY = [
  ['transmute', 'Orb of Transmutation', 'Normal item → magic, 1 or 2 mods'],
  ['alteration', 'Orb of Alteration', 'Rerolls a magic item'],
  ['augment', 'Orb of Augmentation', 'Adds a mod to a magic item with room'],
  ['regal', 'Regal Orb', 'Magic → rare, adds a mod'],
  ['alchemy', 'Orb of Alchemy', 'Normal item → rare'],
  ['chaos', 'Chaos Orb', 'Rerolls a rare'],
  ['exalt', 'Exalted Orb', 'Adds a mod to a rare with room'],
  ['annul', 'Orb of Annulment', 'Removes a random mod'],
  ['scour', 'Orb of Scouring', 'Removes every mod'],
  ['divine', 'Divine Orb', 'Rerolls the numbers'],
];

/** Why an action can't be used now (a short reason), or null when it can. */
function whyNot(state, action, args = {}) {
  if (state.corrupted) return 'The item is corrupted';
  const base = baseByName.get(state.base);
  const r = state.rarity;
  const lock = locked(state);
  const free = state.mods.filter((m) => !lock(m));
  const room = () => fits(state, candidates(state)).length > 0;
  switch (action) {
    case 'transmute': case 'alchemy': return r === 'Normal' ? null : 'Needs a normal item';
    case 'alteration': case 'regal': return r === 'Magic' ? null : 'Needs a magic item';
    case 'augment': return r !== 'Magic' ? 'Needs a magic item' : state.mods.length >= 2 || !room() ? 'No room for another mod' : null;
    case 'chaos': return r === 'Rare' ? null : 'Needs a rare item';
    case 'exalt': return r !== 'Rare' ? 'Needs a rare item' : !room() ? 'No room for another mod' : null;
    case 'annul': return r === 'Normal' ? 'Needs a magic or rare item' : !free.length ? 'No mod it can remove' : null;
    case 'scour': return r === 'Normal' ? 'Already normal' : !free.length ? 'No mod it can remove' : null;
    case 'divine': return state.mods.some((m) => !m.fractured && modById.get(m.id) && /\(-?[\d.]+--?[\d.]+\)/.test(modById.get(m.id).text)) ? null : 'No numbers to reroll';
    case 'bench': {
      const b = benchById.get(args.id);
      if (!b) return 'Unknown craft';
      if (r === 'Normal') return 'Needs a magic or rare item';
      if (!b.cls.includes(base.cls)) return 'Not for this item';
      const crafted = state.mods.filter((m) => m.crafted).length;
      const multi = metas(state).has('multimod');
      if (crafted >= (multi ? 3 : 1)) return 'Already has a crafted mod';
      if (b.meta && metas(state).has(b.meta)) return 'Already on the item';
      if (count(state, side(b.aff)) >= maxPerSide(base, r)) return `No open ${side(b.aff)}`;
      const taken = takenGroups(state);
      if (b.groups.some((g) => taken.has(g))) return 'A mod of this kind is on the item';
      return null;
    }
    case 'removeCrafted': return state.mods.some((m) => m.crafted) ? null : 'No crafted mod';
    case 'harvestReforge': return r === 'Rare' ? null : 'Needs a rare item';
    case 'harvestAdd': return r !== 'Rare' ? 'Needs a rare item' : state.influences.length ? 'Not on influenced items' : !free.length ? 'No mod it can remove' : !room() ? 'No room for another mod' : null;
    case 'harvestResist': {
      const from = state.mods.find((m) => !m.fractured && resistOf(m) === args.from);
      return from ? null : `No ${args.from} Resistance mod`;
    }
    case 'harvestInfluence': return r !== 'Rare' ? 'Needs a rare item' : !state.influences.length ? 'Needs an influenced item' : null;
    case 'fossil': {
      const fs = (args.fossils || []).map((n) => fossilByName.get(n)).filter(Boolean);
      if (!fs.length) return 'Pick a fossil';
      if (fs.length > 4) return 'Up to 4 fossils';
      const bad = fs.find((f) => (f.allowed.length && !f.allowed.some((t) => base.tags.includes(t))) || f.forbidden.some((t) => base.tags.includes(t)));
      if (bad) return `${bad.name} can't be used on this item`;
      if (fs.some((f) => f.fracture) && state.mods.some((m) => m.fractured)) return 'Fractured Fossil: the item is already fractured';
      return null;
    }
    default: return 'Unknown craft';
  }
}

// "+#% to Fire Resistance" (one element only, not hybrids)
function resistOf(m) {
  const d = modById.get(m.id);
  const t = d ? d.type : '';
  const r = /^(Fire|Cold|Lightning)Resistance$/.exec(t);
  return r ? r[1] : null;
}
/** The same tier of another element's resistance. */
function swapResist(state, m, to, rng) {
  const base = baseByName.get(state.base);
  const tags = itemTags(base, state.influences, state.enchant);
  const fam = (type) => DATA.mods.filter((x) => x.dom === base.dom && x.type === type && x.aff === m.aff[0] && weightOn(x, tags) > 0).sort((a, b) => b.lvl - a.lvl);
  const from = fam(modById.get(m.id).type);
  const into = fam(`${to}Resistance`);
  const i = from.findIndex((x) => x.id === m.id);
  const t = into[Math.min(Math.max(0, i), into.length - 1)];
  return t ? newMod(t, rng) : null;
}

/** state + action -> { state, note } (the new state is a copy) or { error }. */
function act(state0, action, args = {}, rng = Math.random) {
  const no = whyNot(state0, action, args);
  if (no) return { error: no };
  const state = clone(state0);
  const base = baseByName.get(state.base);
  const lock = locked(state);
  const removeRandom = (pool) => { const i = Math.floor(rng() * pool.length); const m = pool[i]; state.mods.splice(state.mods.indexOf(m), 1); return m; };
  let note = '';
  switch (action) {
    case 'transmute': case 'alteration': {
      state.mods = state.mods.filter((m) => m.fractured);
      state.rarity = 'Magic';
      const cands = candidates(state);
      const n = rng() < 0.5 ? 1 : 2;
      while (state.mods.length < n && addOne(state, cands, rng));
      break;
    }
    case 'augment': case 'exalt': addOne(state, candidates(state), rng); break;
    case 'regal': state.rarity = 'Rare'; addOne(state, candidates(state), rng); break;
    case 'alchemy': case 'chaos': reforge(state, rng); break;
    case 'annul': note = `Removed: ${removeRandom(state.mods.filter((m) => !lock(m))).text.split('\n')[0]}`; break;
    case 'scour': state.mods = state.mods.filter(lock); if (!state.mods.length) state.rarity = 'Normal'; break;
    case 'divine': state.mods = state.mods.map((m) => (m.fractured || !modById.get(m.id) ? m : { ...m, text: rollText(modById.get(m.id).text, rng) })); break;
    case 'bench': {
      const b = benchById.get(args.id);
      state.mods.push({ id: `bench:${b.id}`, aff: side(b.aff), text: rollText(b.text, rng), groups: b.groups, tags: b.tags || [], crafted: true, ...(b.meta ? { meta: b.meta } : {}) });
      note = `Cost: ${b.cost}`;
      break;
    }
    case 'removeCrafted': state.mods = state.mods.filter((m) => !m.crafted); break;
    case 'harvestReforge': {
      const ok = reforge(state, rng, { keep: lock, first: { tag: args.tag } });
      if (!ok) return { error: `No ${args.tag} mod can roll on this item` };
      break;
    }
    case 'harvestAdd': {
      // adds a mod with the tag, then removes a random other one
      if (!addOne(state, candidates(state), rng, { tag: args.tag })) return { error: `No ${args.tag} mod can roll on this item now` };
      const added = state.mods[state.mods.length - 1];
      note = `Removed: ${removeRandom(state.mods.filter((m) => m !== added && !lock(m))).text.split('\n')[0]}`;
      break;
    }
    case 'harvestResist': {
      const m = state.mods.find((x) => !x.fractured && resistOf(x) === args.from);
      const n = swapResist(state, m, args.to, rng);
      if (!n || takenGroups({ mods: state.mods.filter((x) => x !== m) }).has(n.groups[0])) return { error: `It already has ${args.to} Resistance` };
      state.mods[state.mods.indexOf(m)] = n;
      break;
    }
    case 'harvestInfluence': {
      if (!reforge(state, rng, { keep: lock, first: { influence: true } })) return { error: 'No influence mod can roll on this item' };
      break;
    }
    case 'fossil': {
      const fossils = args.fossils.map((n) => fossilByName.get(n));
      const lucky = fossils.some((f) => f.lucky);
      reforge(state, rng, { fossils, lucky });
      // Fractured Fossil: one random mod becomes fractured (needs 4 or more mods)
      if (fossils.some((f) => f.fracture) && state.mods.length >= 4) { const m = state.mods[Math.floor(rng() * state.mods.length)]; m.fractured = true; note = `Fractured: ${m.text.split('\n')[0]}`; }
      break;
    }
    default: return { error: 'Unknown craft' };
  }
  void base;
  return { state, note };
}

// ---------- your item in, the emulator's view out ----------
/** An item to craft on: from its text (Ctrl+C in game), or a fresh normal base. */
function startItem(o = {}) {
  if (o.text) {
    const it = readItem(o.text);
    const v = it.base ? craftView({ item: o.text }) : null;
    if (!v) return { error: 'That item\'s base isn\'t one that rolls mods.' };
    const base = baseByName.get(v.base.name);
    const mods = [];
    for (const y of v.item.mods) {
      if (y.crafted) {
        const b = (DATA.benchAll || []).find((x) => side(x.aff) === y.aff && x.cls.includes(base.cls) && TPL(x.text) === TPL(y.text));
        mods.push({ id: b ? `bench:${b.id}` : null, aff: y.aff, text: y.text, groups: b?.groups || [], tags: b?.tags || [], crafted: true, ...(b?.meta ? { meta: b.meta } : {}), ...(b ? {} : { unknown: true }) });
        continue;
      }
      const m = y.key ? DATA.mods.find((x) => x.dom === base.dom && keyOf(x) === y.key && x.name === y.tierName && x.text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1') === y.tierText) : null;
      mods.push({ id: m?.id || null, aff: y.aff, text: y.text, groups: m?.grp ? [m.grp] : y.group ? [y.group] : [], tags: m?.tags || [], ...(y.fractured ? { fractured: true } : {}), ...(m ? {} : { unknown: true }) });
    }
    const rarity = ['Normal', 'Magic', 'Rare'].includes(it.rarity) ? it.rarity : mods.length > 2 ? 'Rare' : mods.length ? 'Magic' : 'Normal';
    return { state: { base: base.name, ilvl: it.ilvl || 86, rarity, influences: v.influences, corrupted: !!it.corrupted, mods, ...(v.cluster ? { enchant: v.cluster.enchant, passives: it.passives || null } : {}) } };
  }
  const base = baseByName.get(o.base);
  if (!base) return { error: 'Pick a base' };
  const kind = kindOf(base, o.enchant);
  return { state: { base: base.name, ilvl: Math.max(1, Math.min(100, Number(o.ilvl) || 86)), rarity: 'Normal', influences: (o.influences || []).slice(0, 2), corrupted: false, mods: [], ...(kind ? { enchant: kind.tag } : {}) } };
}

/** What the page shows: each mod with its tier and tags, and which crafts can be used. */
function simView(state) {
  const base = baseByName.get(state.base);
  const tags = itemTags(base, state.influences, state.enchant);
  const tierOf = (id) => {
    const m = modById.get(id);
    if (!m) return null;
    const fam = DATA.mods.filter((x) => (x.dom === m.dom) && x.type === m.type && x.aff === m.aff && weightOn(x, tags) > 0).sort((a, b) => b.lvl - a.lvl);
    const i = fam.findIndex((x) => x.id === id);
    return i >= 0 ? i + 1 : null;
  };
  const mods = state.mods.map((m) => ({ ...m, tier: m.crafted ? null : tierOf(m.id), name: modById.get(m.id)?.name || '', key: modById.get(m.id) ? keyOf(modById.get(m.id)) : null, showTags: showTags(m.tags) }));
  const can = {};
  for (const [a] of CURRENCY) can[a] = whyNot(state, a);
  for (const a of ['removeCrafted', 'harvestReforge', 'harvestAdd', 'harvestInfluence']) can[a] = whyNot(state, a, { tag: 'fire' });
  for (const f of RES) for (const t of RES) if (f !== t) can[`harvestResist:${f}:${t}`] = whyNot(state, 'harvestResist', { from: f, to: t });
  const bench = state.rarity === 'Normal' || state.corrupted ? [] : (DATA.benchAll || []).filter((b) => b.cls.includes(base.cls) && b.lvl <= Math.max(state.ilvl, 1)).map((b) => ({ id: b.id, aff: side(b.aff), text: b.text, cost: b.cost, meta: b.meta || null, why: whyNot(state, 'bench', { id: b.id }) }));
  // fossils can't be used on cluster jewels
  const fossils = base.dom === 'affliction_jewel' ? [] : (DATA.fossils || []).map((f) => ({ name: f.name, text: f.text, fits: !((f.allowed.length && !f.allowed.some((t) => base.tags.includes(t))) || f.forbidden.some((t) => base.tags.includes(t))),
    special: !f.more.length && !f.less.length && !f.added.length && !f.lucky && !f.fracture }));
  return {
    base: { name: base.name, cls: base.cls }, ilvl: state.ilvl, rarity: state.rarity, influences: state.influences, corrupted: state.corrupted,
    cluster: base.kinds ? { kinds: base.kinds.map((k) => ({ tag: k.tag, name: k.name, text: k.text })), enchant: kindOf(base, state.enchant).tag } : null,
    max: maxPerSide(base, state.rarity), prefixes: mods.filter((m) => m.aff === 'prefix'), suffixes: mods.filter((m) => m.aff === 'suffix'),
    can, bench, fossils, currency: CURRENCY.map(([id, name, what]) => ({ id, name, what })), harvestTags: HARVEST_TAGS,
  };
}

/**
 * How likely one fossil reforge (or Chaos Orb, with no fossils) gives the mods you want: tried `n` times on
 * your item. targets: mod kinds ("p|IncreasedLife"); keeps fractured mods like the game does.
 * -> { tries, all: chance all of them, each: { key: chance }, chaos: { all, each } }
 */
/** n resonator reforges of the item with these fossils: how often each wanted mod kind (and all of them) comes. */
function simulate(state, fossils, want, n, seed = 7) {
  const rng = seeded(seed);
  const startState = { ...clone(state), rarity: 'Rare' };
  const cands = candidates(startState, { fossils });
  const lucky = fossils.some((f) => f.lucky);
  let all = 0; const each = Object.fromEntries(want.map((k) => [k, 0]));
  for (let i = 0; i < n; i++) {
    const s = clone(startState);
    reforge(s, rng, { cands, lucky });
    const have = new Set(s.mods.map((m) => (modById.get(m.id) ? keyOf(modById.get(m.id)) : null)));
    let ok = true;
    for (const k of want) { if (have.has(k)) each[k]++; else ok = false; }
    if (ok) all++;
  }
  return { all: all / n, each: Object.fromEntries(want.map((k) => [k, each[k] / n])) };
}

function fossilOdds(state, fossilNames, targets, n = 8000) {
  const want = [...new Set(targets || [])];
  if (!want.length) return null;
  const fossils = (fossilNames || []).map((x) => fossilByName.get(x)).filter(Boolean);
  return { tries: n, fossils: fossils.map((f) => f.name), ...simulate(state, fossils, want, n), chaos: simulate(state, [], want, n) };
}

/**
 * The best fossils for the mods you want: every set of up to 4 fossils that changes the odds and never
 * stops a wanted mod, first ranked by a quick estimate (each wanted mod's share of its side), then the best
 * ones tried for real. Fewer fossils win a tie (cheaper).
 * -> { chaos: { all, each }, best: [{ fossils, all, each }] }
 */
function bestFossils(state, targets, o = {}) {
  const want = [...new Set(targets || [])];
  if (!want.length) return null;
  const base = baseByName.get(state.base);
  const rare = { ...clone(state), rarity: 'Rare' };
  const plain = candidates(rare);
  const wantSet = new Set(want);
  // fossils that fit the base, change some weight, and keep every wanted mod possible
  const pool = (DATA.fossils || []).filter((f) => {
    if ((f.allowed.length && !f.allowed.some((t) => base.tags.includes(t))) || f.forbidden.some((t) => base.tags.includes(t))) return false;
    if (!f.more.length && !f.less.length && !f.added.length) return false;
    if (/Random effects/i.test(f.text)) return false; // Tangled: its effect is random
    let changes = false;
    for (const c of plain) {
      const k = fossilFactor(c.m, [f]);
      if (k !== 1) changes = true;
      if (wantSet.has(c.key) && !(k > 0)) return false; // it would stop a mod you want (one tier is enough to keep)
    }
    return changes || f.added.length;
  });
  // a quick estimate: each wanted kind's chance to be among ~2.5 draws on its side
  const fixed = new Set(state.mods.filter((m) => m.fractured).map((m) => (modById.get(m.id) ? keyOf(modById.get(m.id)) : null)));
  const estimate = (fs) => {
    const cands = fs.length ? candidates(rare, { fossils: fs }) : plain;
    const tot = { prefix: 0, suffix: 0 }; const by = new Map();
    for (const c of cands) { if (fixed.has(c.key)) continue; tot[c.aff] += c.w; by.set(c.key, (by.get(c.key) || 0) + c.w); }
    let p = 1;
    for (const k of want) {
      if (fixed.has(k)) continue;
      const sd = k[0] === 'p' ? 'prefix' : 'suffix';
      const share = tot[sd] ? (by.get(k) || 0) / tot[sd] : 0;
      p *= 1 - (1 - share) ** 2.5;
    }
    return p;
  };
  const combos = [];
  const max = Math.min(4, o.max || 4);
  const rec = (start, cur) => {
    if (cur.length) combos.push([...cur]);
    if (cur.length === max) return;
    for (let i = start; i < pool.length; i++) { cur.push(pool[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  const ranked = combos.map((fs) => ({ fs, est: estimate(fs) })).sort((a, b) => b.est - a.est || a.fs.length - b.fs.length);
  // the estimate misses how slots fill up (more life prefixes leave fewer rolls for suffixes), so the best 40
  // by it get a short trial, and the best of those, plus every smaller set inside the best two (is the 4th
  // fossil worth it?), a full one
  const short = ranked.slice(0, o.shortlist || 40).map(({ fs }) => ({ fs, p: simulate(state, fs, want, 300, 5).all }))
    .sort((a, b) => b.p - a.p || a.fs.length - b.fs.length);
  const pick = new Map();
  const add = (fs) => { const k = fs.map((f) => f.name).sort().join('+'); if (k && !pick.has(k)) pick.set(k, fs); };
  short.slice(0, o.check || 8).forEach(({ fs }) => add(fs));
  for (const { fs } of short.slice(0, 2)) for (let mask = 1; mask < (1 << fs.length); mask++) add(fs.filter((_, i) => mask & (1 << i)));
  const n = o.tries || 2500;
  const tried = [...pick.values()].map((fs) => ({ fossils: fs.map((f) => f.name), ...simulate(state, fs, want, n, 11) }))
    .filter((r) => r.all > 0)
    .sort((a, b) => b.all - a.all || a.fossils.length - b.fossils.length);
  // a set that adds a fossil without doing better than a smaller set inside it isn't worth the fossil
  const best = [];
  for (const r of tried) {
    if (best.some((b) => b.all >= r.all - 0.005 && b.fossils.every((x) => r.fossils.includes(x)))) continue;
    best.push(r);
  }
  return { tries: n, checked: combos.length, chaos: simulate(state, [], want, n, 11), best: best.slice(0, o.show || 5) };
}

module.exports = { startItem, simView, act, whyNot, fossilOdds, bestFossils, candidates, fossilFactor, rollText, seeded, CURRENCY, HARVEST_TAGS };
