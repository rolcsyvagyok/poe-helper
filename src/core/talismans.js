'use strict';
/**
 * Talismans (the beast talisman amulet bases, e.g. Flame Hellion Talisman): FilterBlade spreads them over
 * many "exotic bases" tiers. Here you give each one a tier of your own: S (your design's Tier 1 look),
 * A (Tier 2), hidden, or left to the filter; and you can hide every one you haven't picked.
 */

/** Every talisman base the filter names. */
function talismanBases(text = '') {
  const out = new Set();
  for (const m of String(text).matchAll(/"([A-Z][A-Za-z' -]* Talisman)"/g)) out.add(m[1]);
  return [...out].sort();
}

/** state: { base: 'top'|'good'|'hide' }; rest: hide every other talisman. looks: { t1, t2 }. */
function talismanRules(state = {}, { rest = false, all = [], looks = {} } = {}) {
  const by = { top: [], good: [], hide: [] };
  for (const [b, v] of Object.entries(state || {})) if (by[v] && /Talisman$/.test(b)) by[v].push(b);
  const rarity = { keyword: 'Rarity', values: ['Normal', 'Magic', 'Rare'] };
  const out = [];
  const add = (v, list, action, style, label) => {
    if (!list.length) return;
    out.push({ id: `talisman-${v}`, enabled: true, group: 'talismans', label, action, conditions: [rarity, { keyword: 'BaseType', op: '==', values: [...list].sort() }], style });
  };
  add('top', by.top, 'Show', looks.t1 || {}, 'Talismans: S tier');
  add('good', by.good, 'Show', looks.t2 || {}, 'Talismans: A tier');
  const hide = [...by.hide, ...(rest ? all.filter((b) => !state[b]) : [])];
  add('hide', hide, 'Hide', { disableDropSound: true }, rest ? 'Talismans: hidden (and every one you haven\'t picked)' : 'Talismans: hidden');
  return out;
}

module.exports = { talismanBases, talismanRules };
