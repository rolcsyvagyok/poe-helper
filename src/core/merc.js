'use strict';
/**
 * Mercenary Warrants, priced against the listed ones like them (as xddbsns.com's Warrant Price Check does):
 * one trade search for the build with the skills and supports you tick, then the cheapest listings are
 * read to show, for each support of your mercenary, what ticking it would do to the cheapest match and how
 * many of those listings have it. Few requests: 1 search + up to 2 fetches (20 listings) per change.
 */

/** Your warrant's skills and supports as trade stat ids (from the trade site's Mercenary stats). */
function warrantStats(statsJson, warrant) {
  const merc = (statsJson?.result || []).find((g) => /mercenary/i.test(g.id || g.label || ''));
  const byText = new Map((merc?.entries || []).map((e) => [e.text.toLowerCase(), e.id]));
  return (warrant?.skills || []).map((s) => ({
    name: s.skill,
    id: byText.get(s.skill.toLowerCase()) || null,
    supports: s.supports.map((sup) => {
      const m = /^(.+?) \(Tier:? (\d)\)$/.exec(sup) || [null, sup, null];
      return { name: m[1], tier: m[2] ? Number(m[2]) : null, id: byText.get(`${m[1]} (tier ${m[2]})`.toLowerCase()) || null };
    }),
  }));
}

function warrantQuery(type, ids, status = 'securable') {
  const q = { query: { status: { option: status }, stats: [{ type: 'and', filters: ids.map((id) => ({ id, disabled: false })) }] }, sort: { price: 'asc' } };
  if (type) q.query.type = type;
  return q;
}

/** A listing's price in chaos, and which skill/support stat ids it has (supports on any skill, as the trade site counts them). */
function readListing(r, divine) {
  const p = r?.listing?.price;
  if (!p) return null;
  const chaos = p.currency === 'chaos' ? p.amount : p.currency === 'divine' && divine ? p.amount * divine : null;
  if (chaos == null) return null;
  const ids = new Set();
  for (const s of r.item?.mercenarySkills || []) {
    ids.add(`mercenary.skill_${s.hash}`);
    for (const sup of s.supports || []) ids.add(`mercenary.support_${sup.hash}`);
  }
  return { chaos, ids, name: (r.item?.properties || []).find((x) => !x.name && x.values?.[0]?.[0])?.values[0][0] || null, level: Number((r.item?.properties || []).find((x) => x.name === 'Mercenary Level')?.values?.[0]?.[0]) || null };
}

/**
 * skills: from warrantStats, with .on on what you ticked; listings: readListing of the cheapest matches.
 * Each support you didn't tick gets: how many of those listings have it, and the cheapest of them
 * (its "delta" from the cheapest match now). Ticked ones only say they're ticked.
 */
function analyze(skills, listings) {
  const cheapest = listings.length ? Math.min(...listings.map((l) => l.chaos)) : null;
  for (const s of skills) {
    for (const sup of s.supports) {
      if (!sup.id || sup.on) { sup.count = null; sup.delta = null; continue; }
      const with_ = listings.filter((l) => l.ids.has(sup.id));
      sup.count = with_.length;
      sup.delta = with_.length && cheapest != null ? Math.min(...with_.map((l) => l.chaos)) - cheapest : null;
    }
  }
  return { cheapest, sample: listings.length };
}

module.exports = { warrantStats, warrantQuery, readListing, analyze };
