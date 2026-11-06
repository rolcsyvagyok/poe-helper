'use strict';
/**
 * The same map choices as the Regex page, as a pathofexile.com/trade search: mods you skip become a
 * "not" group, mods you want an "and" (all) or "count at least 1" (any) group, and the numbers go in
 * the map filters the trade site has (tier, quantity, rarity, pack size).
 */

const DATA = require('./map-mods.json');

// map types the trade site finds by their implicit line ("|n" = which one) or its own map filters
const TYPE_STATS = {
  shaper: [{ id: 'implicit.stat_1792283443|1' }],
  elder: [{ id: 'implicit.stat_1792283443|2' }],
  conqueror: [1, 2, 3, 4].map((n) => ({ id: `implicit.stat_2563183002|${n}` })),
  originator: [{ id: 'implicit.stat_2696470877' }],
};
// "more maps / currency / scarabs / divination cards" are pseudo stats on the trade site
const MORE_STATS = { maps: 'pseudo.pseudo_map_more_map_drops', currency: 'pseudo.pseudo_map_more_currency_drops', scarabs: 'pseudo.pseudo_map_more_scarab_drops', divination: 'pseudo.pseudo_map_more_card_drops' };
const TYPE_FILTERS = { blighted: 'map_blighted', ravaged: 'map_uberblighted' };

const norm = (s) => String(s || '').toLowerCase().replace(/[+-]?#/g, '#').replace(/\s+/g, ' ').trim();

/** explicit stat text -> id, from the trade site's stat list (GET /api/trade/data/stats) */
function statIndex(tradeStats) {
  const byText = new Map();
  const ids = new Set();
  for (const g of tradeStats?.result || []) {
    for (const e of g.entries || []) {
      ids.add(e.id);
      if (String(e.id).startsWith('explicit.') && !byText.has(norm(e.text))) byText.set(norm(e.text), e.id);
    }
  }
  return { byText, ids, known: ids.size > 0 };
}

/** The trade ids for one mod: the game data's, checked against the trade site's list, else by its text. */
function idsOf(mod, index) {
  const out = [];
  mod.lines.forEach((line, i) => {
    const own = mod.trade?.[i];
    if (own && (!index?.known || index.ids.has(own))) out.push(own);
    else if (index?.byText.has(norm(line))) out.push(index.byText.get(norm(line)));
  });
  return [...new Set(out)];
}

/**
 * choices: the Regex page's map choices; opts: { tierMin, tierMax, status }; tradeStats: the stat list.
 * -> { query, left: [mod lines the trade site can't search] }
 */
function buildMapTradeQuery(choices = {}, opts = {}, tradeStats = null) {
  const index = tradeStats ? statIndex(tradeStats) : null;
  const byId = new Map(DATA.mods.map((m) => [m.id, m]));
  const t17 = choices.kind === 't17';
  const kindOk = (m) => (t17 ? m.kinds.includes('t17') : m.kinds.includes('regular') || (choices.nightmare && m.kinds.includes('nightmare')));
  const left = [];
  const collect = (ids) => {
    const filters = [];
    for (const id of ids || []) {
      const m = byId.get(id);
      if (!m || !kindOk(m)) continue;
      const tids = idsOf(m, index);
      if (!tids.length) { left.push(m.lines.join(' / ')); continue; }
      // a mod with several lines is found by its first line the trade site knows
      filters.push({ id: tids[0] });
    }
    return filters;
  };
  const avoid = collect(choices.avoid);
  const wantIds = (choices.want || []).filter((id) => !(choices.avoid || []).includes(id));
  const want = collect(wantIds);

  const stats = [];
  if (avoid.length) stats.push({ type: 'not', filters: avoid });
  if (want.length) stats.push(choices.wantAll ? { type: 'and', filters: want } : { type: 'count', value: { min: 1 }, filters: want });
  const typeWant = Object.entries(choices.mapTypes || {}).filter(([k, v]) => v === 'want' && TYPE_STATS[k]).flatMap(([k]) => TYPE_STATS[k]);
  const typeAvoid = Object.entries(choices.mapTypes || {}).filter(([k, v]) => v === 'avoid' && TYPE_STATS[k]).flatMap(([k]) => TYPE_STATS[k]);
  if (typeWant.length) stats.push({ type: 'count', value: { min: 1 }, filters: typeWant });
  if (typeAvoid.length) {
    const not = stats.find((s) => s.type === 'not');
    if (not) not.filters.push(...typeAvoid); else stats.push({ type: 'not', filters: typeAvoid });
  }
  const min = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };
  const mapFilters = {};
  const tierMin = t17 ? 17 : min(opts.tierMin);
  const tierMax = t17 ? 17 : min(opts.tierMax);
  if (tierMin || tierMax) mapFilters.map_tier = { ...(tierMin ? { min: tierMin } : {}), ...(tierMax ? { max: tierMax } : {}) };
  const n = choices.numbers || {};
  const more = Object.entries(MORE_STATS).filter(([k]) => min(n[k])).map(([k, id]) => ({ id, value: { min: min(n[k]) } }));
  if (more.length) stats.push(choices.numbersAny && more.length > 1 ? { type: 'count', value: { min: 1 }, filters: more } : { type: 'and', filters: more });
  // quantity, rarity and pack size are map filters, so each is a minimum of its own
  if (min(n.quantity)) mapFilters.map_iiq = { min: min(n.quantity) };
  if (min(n.rarity)) mapFilters.map_iir = { min: min(n.rarity) };
  if (min(n.packSize)) mapFilters.map_packsize = { min: min(n.packSize) };
  for (const [k, f] of Object.entries(TYPE_FILTERS)) {
    if (choices.mapTypes?.[k] === 'want') mapFilters[f] = { option: 'true' };
    if (choices.mapTypes?.[k] === 'avoid') mapFilters[f] = { option: 'false' };
  }
  const qualityAsked = Object.values(choices.quality || {}).some(min);

  // how many mods the map has (8 = a fully rolled map)
  if (min(opts.modsMin)) {
    const f = { id: 'pseudo.pseudo_number_of_affix_mods', value: { min: min(opts.modsMin) } };
    const and = stats.find((x) => x.type === 'and');
    if (and) and.filters.push(f); else stats.push({ type: 'and', filters: [f] });
  }
  if (!stats.length) stats.push({ type: 'and', filters: [] });

  const typeFilters = { category: { option: 'map' } };
  const rar = choices.rarity || {};
  const wantR = ['normal', 'magic', 'rare'].filter((r) => rar[r] === 'want');
  const okR = ['normal', 'magic', 'rare'].filter((r) => rar[r] !== 'avoid' && (!wantR.length || wantR.includes(r)));
  if (okR.length === 1) typeFilters.rarity = { option: okR[0] };
  else if (okR.length < 3) typeFilters.rarity = { option: 'nonunique' };
  const misc = {};
  if (choices.corrupted === 'want') misc.corrupted = { option: 'true' };
  if (choices.corrupted === 'avoid') misc.corrupted = { option: 'false' };
  if (choices.unidentified === 'want') misc.identified = { option: 'false' };
  if (choices.unidentified === 'avoid') misc.identified = { option: 'true' };

  const filters = { type_filters: { filters: typeFilters } };
  if (Object.keys(mapFilters).length) filters.map_filters = { filters: mapFilters };
  if (Object.keys(misc).length) filters.misc_filters = { filters: misc };
  const status = ['securable', 'online', 'onlineleague', 'any'].includes(opts.status) ? opts.status : 'securable';
  const notes = [];
  if (okR.length === 2) notes.push('The trade site takes one rarity or "any but unique": it searches any but unique.');
  if (qualityAsked) notes.push('Quality types are left out of the trade search.');
  if (choices.numbersAny && [n.quantity, n.rarity, n.packSize].some(min)) notes.push('On the trade site "any one is enough" covers more maps, currency, scarabs and divination cards; quantity, rarity and pack size stay minimums.');
  if (left.length) notes.push(`The trade site doesn't list: ${left.join('; ')}.`);
  return { query: { query: { status: { option: status }, stats, filters }, sort: { price: 'asc' } }, left, notes };
}

module.exports = { buildMapTradeQuery, statIndex, idsOf };
