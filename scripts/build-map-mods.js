'use strict';
/**
 * Builds src/core/regex/map-mods.json, the map mods the Regex page lists, from a RePoE export of the
 * game data (https://github.com/repoe-fork/repoe-fork.github.io, files data/mods.json,
 * data/stat_translations.json and data/base_items.json for the map names). Run it after a game patch:
 *   node scripts/build-map-mods.js <folder with mods.json and stat_translations.json>
 * Only the game's own mod text goes in; the search terms are worked out by the app (core/regex/maps.js).
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/build-map-mods.js <RePoE data folder>'); process.exit(1); }
const mods = JSON.parse(fs.readFileSync(path.join(dir, 'mods.json'), 'utf8'));
const trans = JSON.parse(fs.readFileSync(path.join(dir, 'stat_translations.json'), 'utf8'));
const byStat = new Map();
for (const t of trans) for (const id of t.ids) if (!byStat.has(id)) byStat.set(id, t);

// stats every map mod carries that the game shows as the map's totals, not as a line of the mod
const HIDDEN = /^map_(item_drop_quantity|item_drop_rarity|pack_size)_\+%$|^map_experience_gain_\+%$/;
const REGULAR = new Set(['low_tier_map', 'mid_tier_map', 'top_tier_map', 'default']);
const UBER = new Set(['uber_tier_map', 'has_uber_map_suffix', 'has_uber_map_prefix ', 'has_uber_map_prefix']);
const NIGHTMARE = new Set(['maven_map', 'primordial_map']);

function matches(cond, v) {
  if (!cond) return true;
  const inside = (cond.min == null || v >= cond.min) && (cond.max == null || v <= cond.max);
  return cond.negated ? !inside : inside;
}
function linesOf(stats, trade = []) {
  const used = new Set();
  const out = [];
  for (const s of stats) {
    if (used.has(s.id) || HIDDEN.test(s.id)) continue;
    const t = byStat.get(s.id);
    if (!t || t.hidden) continue;
    const vals = t.ids.map((id) => { const x = stats.find((y) => y.id === id); if (x) used.add(id); return x ? (x.min ?? 0) : 0; });
    const pick = (t.English || []).find((e) => e.condition.every((c, i) => matches(c, vals[i])));
    if (!pick || !pick.string) continue;
    let str = pick.string.replace(/\{(\d+)\}/g, (_, i) => { const f = pick.format[+i]; return f === 'ignore' ? '' : f.replace('#', '#'); });
    // the game's markup: [Tag|Shown text] or [Text]
    str = str.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1');
    for (const line of str.split('\n')) if (line.trim()) out.push(line.trim().replace(/\s+/g, ' '));
    // the trade site's id for this line (pathofexile.com/trade), when it has one
    const ts = (t.trade_stats || []).find((x) => x.type === 'explicit');
    if (ts && !trade.includes(ts.id)) trade.push(ts.id);
  }
  return out;
}

const found = new Map(); // generalised text -> entry
for (const [id, m] of Object.entries(mods)) {
  if (m.domain !== 'area' || !['prefix', 'suffix'].includes(m.generation_type)) continue;
  const tags = (m.spawn_weights || []).filter((w) => w.weight > 0).map((w) => w.tag);
  const kind = tags.some((t) => NIGHTMARE.has(t)) ? 'nightmare' : tags.some((t) => UBER.has(t)) ? 't17' : tags.some((t) => REGULAR.has(t)) ? 'regular' : null;
  if (!kind) continue;
  const trade = [];
  const lines = linesOf(m.stats || [], trade);
  if (!lines.length) continue;
  const key = [...lines].sort().join('\n'); // the same lines in another order are the same mod
  const e = found.get(key) || { lines, affix: m.generation_type, kinds: [], names: [], ids: [], trade };
  if (!e.kinds.includes(kind)) e.kinds.push(kind);
  if (m.name && !e.names.includes(m.name)) e.names.push(m.name);
  e.ids.push(id);
  found.set(key, e);
}
const list = [...found.values()]
  .map((e) => ({ id: e.ids.sort()[0], affix: e.affix, kinds: e.kinds.sort(), name: e.names[0] || '', lines: e.lines, trade: e.trade }))
  .sort((a, b) => a.lines[0].localeCompare(b.lines[0]));
// map names: search terms must not match them (every map's name is in its text)
let mapNames = [];
try {
  const bases = JSON.parse(fs.readFileSync(path.join(dir, 'base_items.json'), 'utf8'));
  mapNames = [...new Set(Object.values(bases).filter((b) => b.item_class === 'Map' && b.release_state !== 'unreleased').map((b) => b.name))].sort();
} catch { console.warn('No base_items.json: map names left out'); }
const out = path.join(__dirname, '..', 'src', 'core', 'regex', 'map-mods.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: 'Path of Exile game data (RePoE export)', count: list.length, mods: list, mapNames }, null, 1));
console.log(`${list.length} map mods -> ${out}`);
