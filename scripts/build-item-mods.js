'use strict';
/**
 * Builds src/core/regex/item-mods.json, every mod that can roll on gear, flasks and jewels, from a RePoE
 * export of the game data (https://github.com/repoe-fork/repoe-fork.github.io, files data/mods.json,
 * data/base_items.json and data/item_classes.json). Run it after a game patch:
 *   node scripts/build-item-mods.js <RePoE data folder>
 * Only the game's own data goes in; which mods a base can roll and the search terms are worked out
 * by the app (core/regex/items.js).
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/build-item-mods.js <RePoE data folder>'); process.exit(1); }
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const mods = read('mods.json');
const bases = read('base_items.json');
const classes = read('item_classes.json');

const DOMAINS = ['item', 'flask', 'misc', 'abyss_jewel'];
const SKIP_CLASSES = new Set(['HiddenItem', 'FishingRod']);

const baseList = [];
for (const b of Object.values(bases)) {
  if (b.release_state !== 'released' || !DOMAINS.includes(b.domain) || SKIP_CLASSES.has(b.item_class)) continue;
  if (/^(Demigod|Golden) /.test(b.name)) continue; // never drop
  // its implicit lines are on the item too, so the search terms must not match them
  const imp = (b.implicits || []).map((id) => mods[id]?.text).filter(Boolean).map((t) => t.replace(/\r/g, ''));
  baseList.push({ name: b.name, cls: b.item_class, dom: b.domain, lvl: b.drop_level || 1, tags: b.tags, ...(imp.length ? { imp } : {}) });
}
baseList.sort((a, b) => a.cls.localeCompare(b.cls) || a.lvl - b.lvl || a.name.localeCompare(b.name));

const modList = [];
for (const [id, m] of Object.entries(mods)) {
  if (!DOMAINS.includes(m.domain) || !['prefix', 'suffix'].includes(m.generation_type) || m.is_essence_only) continue;
  const w = (m.spawn_weights || []).map((x) => [x.tag, x.weight]);
  if (!w.some(([, n]) => n > 0) || !m.text) continue;
  // tags: the mod's own tags (Fire, Attack, Life…) as the game shows them; grp: mods in one group can't roll together
  const tags = (m.implicit_tags || []).filter((t) => t !== 'default');
  // "Socketed Gems are Supported by Level 20 Hypothermia": the export leaves this line out of the text
  let text = m.text.replace(/\r/g, '');
  for (const st of m.stats || []) {
    const g = /^local_display_socketed_gems_(?:supported_by_level_x_|supported_by_x_|get_)(.+?)(?:_level)?$/.exec(st.id);
    if (!g) continue;
    const gem = g[1].split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    // the game's files don't say the gem level here (it comes with the tier): "#"
    const lvl = !st.max ? '#' : st.min === st.max ? String(st.min) : `(${st.min}-${st.max})`;
    text = `Socketed Gems are Supported by Level ${lvl} ${gem} Support\n${text}`;
  }
  modList.push({ id, aff: m.generation_type[0], dom: m.domain, type: m.type, name: m.name || '', lvl: m.required_level || 1, text, w, ...(tags.length ? { tags } : {}), ...(m.groups?.length ? { grp: m.groups[0] } : {}) });
}

const influence = {};
for (const [k, c] of Object.entries(classes)) if (c.influence_tags?.length) influence[k] = c.influence_tags;

const out = path.join(__dirname, '..', 'src', 'core', 'regex', 'item-mods.json');
fs.writeFileSync(out, JSON.stringify({ source: 'Path of Exile game data (RePoE export)', bases: baseList, mods: modList, influence }));
console.log(`${baseList.length} bases, ${modList.length} mods -> ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
