'use strict';
/**
 * Mercenary Warrants, searched the way Awakened PoE Trade does (MIT, github.com/SnosMe/awakened-poe-trade):
 *  - a support counts only on its own skill: the trade site's "mercenary" stat group;
 *  - each build's skills are primary (they make the build: always searched), secondary or utility (yours
 *    to tick); a few are "bricks" (weak for that build) and warrants with them are left out;
 *  - a support matches its tier or better ("More Duration" also finds "Greater More Duration");
 *  - a skill with 5 supports can be searched as "5 of the supports it can have, N of them Tier 3";
 *  - your build's skills that yours doesn't have can be ruled out.
 * On top, as xddbsns.com's Warrant Price Check: the 20 cheapest matches are read to show what ticking each
 * support does to the cheapest one and how many of them have it. 1 search + up to 2 fetches per change.
 */
const DATA = require('./merc-data.json');

const BRICKS = { Kineticist: ['Kinetic Bolt'], Manyshot: ['Icicle Rain'], Combatant: ['Wild Strike', 'Spectral Helix'] };
const idNum = (id) => Number(String(id).split('_').pop());

/** The ids a support of this tier is searched by: its tier and better (synthetic families: Tier 3 only). */
function supportIds(ref) {
  const s = DATA.supports[ref];
  if (!s) return [];
  return s.family.map((r) => DATA.supports[r]).filter((x) => x && (x.tier ?? 0) >= (s.tier ?? 0)).map((x) => x.id);
}

/**
 * Your warrant as search rows. choices (what you ticked, kept between searches):
 * { skills: { [skill id]: { on, sup: { [support id]: on }, full, t3 } }, not: { [skill id]: on }, level }
 */
function model(warrant, choices = {}) {
  const buildName = DATA.aliases[warrant?.build] || warrant?.build;
  const build = DATA.builds[buildName] || [];
  const bricks = BRICKS[buildName] || [];
  const typeOf = (n) => build.find((b) => b.name === n)?.type || 'secondary';
  const skills = [];
  for (const s of warrant?.skills || []) {
    const sk = DATA.skills[s.skill];
    const type = bricks.includes(s.skill) ? 'brick' : typeOf(s.skill);
    const c = choices.skills?.[sk?.id] || {};
    const sups = [];
    for (const line of s.supports) {
      const m = /^(.+?) \(Tier:? (\d)\)$/.exec(line) || [null, line, null];
      const d = DATA.supports[m[1]];
      if (d?.synthetic && d.tier !== 3) continue; // Awakened: synthetic families only count at Tier 3
      sups.push({ name: m[1], tier: d?.tier ?? (m[2] ? Number(m[2]) : null), id: d?.id || null, ids: supportIds(m[1]), canonical: d?.canonical || m[1], on: !!(d && c.sup?.[d.id]) });
    }
    sups.sort((a, b) => ((b.tier ?? 0) & 3) - ((a.tier ?? 0) & 3));
    // a skill with all 5 supports: "5 of the supports it can have, at least N at Tier 3"
    let full = null;
    if (sups.length === 5 && sk?.supports?.length) {
      const t3 = sups.filter((x) => (x.tier ?? 0) >= 3 || DATA.supports[x.name]?.family?.at(-1) === x.name).length;
      full = { on: !!c.full, t3, t3on: c.t3 ?? t3, possible: sk.supports.map((canon) => { const fam = DATA.supports[canon]?.family || [canon]; return fam.map((r) => DATA.supports[r]).filter(Boolean).filter((x, i, a) => a.length < 3 || (x.tier ?? 0) >= (DATA.supports[canon]?.synthetic ? 3 : 2)).map((x) => x.id); }) };
    }
    skills.push({ name: s.skill, id: sk?.id || null, icon: sk?.icon || null, type, on: type === 'primary' ? true : !!c.on, supports: sups, full });
  }
  // your build's skills that yours doesn't have: bricks ruled out from the start, the rest yours to rule out
  const have = new Set(skills.map((s) => s.name));
  const missing = build.filter((b) => !have.has(b.name)).map((b) => {
    const sk = DATA.skills[b.name];
    const brick = bricks.includes(b.name);
    return { name: b.name, id: sk?.id || null, icon: sk?.icon || null, type: brick ? 'brick' : b.type, on: choices.not?.[sk?.id] ?? brick };
  }).filter((m) => m.id);
  return { build: warrant?.build || null, buildKnown: !!build.length, level: warrant?.level || null, levelOn: !!choices.level, skills, missing };
}

// Awakened's weighted group: every "allOf" id counts more than all the "someOf" ones together
function weighted(allOf, someOf) {
  const surplus = Math.max(0, someOf.ids.length - someOf.min);
  const w = surplus + 1;
  const ids = [...allOf.flatMap((fam) => fam.flatMap((id) => Array(w).fill(id))), ...someOf.ids.flat()];
  return { value: { min: someOf.min + allOf.length * w }, filters: ids.map((id) => ({ id })) };
}

function warrantQuery(m, type, status = 'securable') {
  const and = { type: 'and', filters: [] };
  const stats = [and];
  for (const s of m.skills) {
    if (!s.id || !s.on) continue;
    const on = s.supports.filter((x) => x.on && x.ids.length);
    if (on.length) stats.push({ type: 'mercenary', value: { min: 1 + on.length }, filters: [{ id: s.id }, ...on.flatMap((x) => x.ids.map((id) => ({ id })))] });
    else and.filters.push({ id: s.id });
    if (s.full?.on) {
      stats.push({ type: 'mercenary', ...weighted([[s.id]], { min: 5, ids: s.full.possible }) });
      const t3 = Math.max(0, Math.min(5, s.full.t3on));
      if (t3 > 0) stats.push({ type: 'mercenary', ...weighted([[s.id]], { min: t3, ids: s.full.possible.map((fam) => [fam[fam.length - 1]]) }) });
    }
  }
  const not = m.missing.filter((x) => x.on);
  if (not.length) stats.push({ type: 'not', filters: not.map((x) => ({ id: x.id })) });
  const q = { query: { status: { option: status }, stats }, sort: { price: 'asc' } };
  if (type) q.query.type = type;
  if (m.levelOn && m.level) q.query.filters = { misc_filters: { filters: { ilvl: { min: m.level } } } };
  return q;
}

/** A listing: its price in chaos and, per skill, the supports on it. */
function readListing(r, divine) {
  const p = r?.listing?.price;
  if (!p) return null;
  const chaos = p.currency === 'chaos' ? p.amount : p.currency === 'divine' && divine ? p.amount * divine : null;
  if (chaos == null) return null;
  const skills = new Map();
  for (const s of r.item?.mercenarySkills || []) skills.set(s.hash, new Set((s.supports || []).map((x) => x.hash)));
  const props = r.item?.properties || [];
  return { chaos, skills, name: props.find((x) => !x.name && x.values?.[0]?.[0])?.values[0][0] || null, level: Number(props.find((x) => x.name === 'Mercenary Level')?.values?.[0]?.[0]) || null };
}

/** For each support you didn't tick: how many of the cheapest matches have it on that skill, and the cheapest of them. */
function analyze(m, listings) {
  const cheapest = listings.length ? Math.min(...listings.map((l) => l.chaos)) : null;
  const has = (l, s, x) => { const set = l.skills.get(idNum(s.id)); return !!set && x.ids.some((id) => set.has(idNum(id))); };
  for (const s of m.skills) {
    for (const x of s.supports) {
      if (x.on || !x.ids.length || !s.id) { x.count = null; x.delta = null; continue; }
      const w = listings.filter((l) => has(l, s, x));
      x.count = w.length;
      x.delta = w.length && cheapest != null ? Math.min(...w.map((l) => l.chaos)) - cheapest : null;
    }
  }
  return { cheapest, sample: listings.length };
}

module.exports = { model, warrantQuery, readListing, analyze, supportIds, weighted, BRICKS };
