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

// Wisdom, then Portal, then fragments; each from a single scroll up to the biggest stack
const kindOf = (bases, tier, type) => {
  const t = `${bases.join(' ')} ${tier} ${type}`;
  if (/fragment/i.test(t)) return 2;
  if (/wisdom/i.test(t)) return 0;
  return 1;
};
const stackOf = (conds) => {
  const m = (conds || []).map((c) => /^StackSize\s*>=?\s*(\d+)/.exec(c)).find(Boolean);
  return m ? Number(m[1]) : 0;
};

/** Every scroll tier of the view, in the order above. Campaign rules stay with Levelling currency. */
function scrollTiers(view) {
  const out = [];
  for (const t of view?.types || []) {
    if (!/^currency(->|$)/.test(t.type) || /->leveling/.test(t.type)) continue;
    for (const tier of t.tiers || []) {
      if (tier.generated) continue;
      const bases = tier.bases || [];
      // scrolls only; or an empty rule FilterBlade made for scrolls ("tportal", switched off)
      const scrollsOnly = bases.length ? bases.every((b) => SCROLL_BASES.has(b)) : /portal|wisdom|scroll/i.test(tier.tier);
      if (!scrollsOnly) continue;
      out.push({ key: tier.key, type: t.type, tier: tier.tier, line: tier.line || 0, kind: kindOf(bases, tier.tier, t.type), stack: stackOf(tier.conditions), empty: !bases.length });
    }
  }
  out.sort((a, b) => a.kind - b.kind || a.empty - b.empty || a.stack - b.stack || a.line - b.line);
  return out;
}

module.exports = { scrollTiers, SCROLL_BASES };
