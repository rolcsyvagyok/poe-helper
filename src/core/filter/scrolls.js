'use strict';
/**
 * Scrolls: FilterBlade keeps Portal Scrolls, Scrolls of Wisdom and Scroll Fragments in five places
 * (stacked supplies, levelling stacks, levelling, the plain currency tiers and scroll fragments).
 * Here every tier that holds only scrolls is gathered into one list (the Scrolls page), best first.
 * No tiers of the app's own: each keeps FilterBlade's rule and look.
 *
 * It works from FilterBlade's own $type/$tier tags each time the filter is read, so a new FilterBlade
 * download (more or fewer scroll tiers, renamed tiers) is listed the same way.
 */
const SCROLL_BASES = new Set(['Portal Scroll', 'Scroll of Wisdom', 'Scroll Fragment']);

// best first: big stacks of supplies, levelling stacks, levelling, single scrolls, fragments
function rank(type, tier) {
  if (/->stackedsupplies(portal|wisdom)$/.test(type)) return 0;
  if (/->levelingstacked$/.test(type)) return 1;
  if (/->leveling$/.test(type)) return 2;
  if (/fragment/i.test(tier)) return 4;
  return 3;
}
const levelNumber = (tier) => { const m = /^t(\d+)/.exec(tier); return m ? Number(m[1]) : 99; };

/** Every scroll tier of the view, best first. */
function scrollTiers(view) {
  const out = [];
  for (const t of view?.types || []) {
    if (!/^currency(->|$)/.test(t.type)) continue;
    for (const tier of t.tiers || []) {
      if (tier.generated) continue;
      const bases = tier.bases || [];
      // scrolls only; or an empty rule FilterBlade made for scrolls ("tportal", switched off)
      const scrollsOnly = bases.length ? bases.every((b) => SCROLL_BASES.has(b)) : /portal|wisdom|scroll/i.test(tier.tier);
      if (!scrollsOnly) continue;
      out.push({ key: tier.key, type: t.type, tier: tier.tier, line: tier.line || 0, rank: rank(t.type, tier.tier) });
    }
  }
  // portal before wisdom inside a group, FilterBlade's own t1, t2... order, then the file's order
  const kind = (x) => (/wisdom/i.test(x.type + x.tier) ? 1 : 0);
  out.sort((a, b) => a.rank - b.rank || kind(a) - kind(b) || levelNumber(a.tier) - levelNumber(b.tier) || a.line - b.line);
  return out;
}

module.exports = { scrollTiers, SCROLL_BASES };
