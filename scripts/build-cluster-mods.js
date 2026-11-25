'use strict';
/**
 * Builds src/core/regex/cluster-mods.json for Crafting: the cluster jewel bases, the mods they roll (domain
 * "affliction_jewel": notables and small-passive bonuses) and the small passive kinds an enchantment can give
 * (each kind's tag is what lets its notables roll). From a RePoE export (data/mods.json, base_items.json,
 * cluster_jewels.json):
 *   node scripts/build-cluster-mods.js <RePoE data folder>
 * gw: the game's generation weights (a mod's chance changes with tags other mods add: a Small Cluster Jewel with
 * a notable can't roll another); adds: the tags a mod adds.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/build-cluster-mods.js <RePoE data folder>'); process.exit(1); }
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const mods = read('mods.json');
const bases = read('base_items.json');
const clusters = read('cluster_jewels.json');

const baseList = [];
for (const [id, b] of Object.entries(bases)) {
  if (b.domain !== 'affliction_jewel' || b.release_state !== 'released') continue;
  const c = clusters[id];
  baseList.push({ name: b.name, cls: b.item_class, dom: b.domain, lvl: b.drop_level || 1, tags: b.tags,
    ...(c ? { passives: [c.min_skills, c.max_skills], kinds: c.passive_skills.map((p) => ({ tag: p.tag, name: p.name, text: (p.stat_text || []).join('\n') })) } : {}) });
}
baseList.sort((a, b) => a.lvl - b.lvl || a.name.localeCompare(b.name));

const modList = [];
for (const [id, m] of Object.entries(mods)) {
  if (m.domain !== 'affliction_jewel' || !['prefix', 'suffix'].includes(m.generation_type) || !m.text) continue;
  const w = (m.spawn_weights || []).map((x) => [x.tag, x.weight]);
  if (!w.some(([, n]) => n > 0)) continue;
  const tags = (m.implicit_tags || []).filter((t) => t !== 'default');
  const gw = (m.generation_weights || []).map((x) => [x.tag, x.weight]);
  modList.push({ id, aff: m.generation_type[0], dom: m.domain, type: m.type, name: m.name || '', lvl: m.required_level || 1, text: m.text.replace(/\r/g, ''), w,
    ...(tags.length ? { tags } : {}), ...(m.groups?.length ? { grp: m.groups[0] } : {}), ...(gw.length ? { gw } : {}), ...(m.adds_tags?.length ? { adds: m.adds_tags } : {}) });
}

const out = path.join(__dirname, '..', 'src', 'core', 'regex', 'cluster-mods.json');
fs.writeFileSync(out, JSON.stringify({ source: 'Path of Exile game data (RePoE export)', bases: baseList, mods: modList }));
console.log(`${baseList.length} bases, ${modList.length} mods -> ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
