'use strict';
/**
 * Builds src/core/regex/gems.json, every gem in the game, from a RePoE export of the game data
 * (https://github.com/repoe-fork/repoe-fork.github.io, file data/gems_minimal.json), with where each gem
 * is a quest reward and which vendor sells it first, per class, from exile-leveling's quest data
 * (https://github.com/HeartofPhos/exile-leveling, MIT licence, common/data/json/quests.json).
 * Run it after a game patch:
 *   node scripts/build-gems.js <RePoE data folder> <exile-leveling quests.json>
 * Only the game's own data goes in; the search terms are worked out by the app (core/regex/gems.js).
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/build-gems.js <RePoE data folder>'); process.exit(1); }
const gems = JSON.parse(fs.readFileSync(path.join(dir, 'gems_minimal.json'), 'utf8'));
const questsFile = process.argv[3];
const quests = questsFile ? JSON.parse(fs.readFileSync(questsFile, 'utf8')) : {};
// gem id -> [{ act, npc, quest, classes }], in story order (act, then the quests' order in the file)
const buy = new Map();
const reward = new Map();
const add = (map, id, e) => { if (!map.has(id)) map.set(id, []); map.get(id).push(e); };
const order = Object.values(quests).map((q, i) => ({ q, i })).sort((a, b) => Number(a.q.act) - Number(b.q.act) || a.i - b.i).map((x) => x.q);
for (const q of order) {
  for (const o of Object.values(q.reward_offers || {})) {
    for (const [id, v] of Object.entries(o.quest || {})) add(reward, id, { act: Number(q.act), npc: o.quest_npc, quest: q.name, classes: v.classes || [] });
    for (const [id, v] of Object.entries(o.vendor || {})) add(buy, id, { act: Number(q.act), npc: v.npc, quest: q.name, classes: v.classes || [] });
  }
}
const KIND_TAGS = new Set(['attack', 'spell', 'minion', 'aura', 'herald', 'curse', 'warcry', 'totem', 'trap', 'mine', 'brand', 'movement', 'guard', 'golem', 'link', 'banner', 'stance', 'blink', 'mark', 'hex', 'nova', 'chaining', 'projectile', 'area', 'melee', 'bow', 'fire', 'cold', 'lightning', 'chaos', 'physical', 'duration', 'channelling', 'orb', 'strike', 'slam', 'trigger', 'critical']);
const out = new Map();
const text = new Set(); // the gems' own descriptions: a search term must not match them
for (const g of gems) {
  const b = g.base_item;
  if (!b || b.release_state !== 'released' || !g.display_name || out.has(g.display_name) || /^\[/.test(g.display_name)) continue; // "[DNT]" and "[UNUSED]" are placeholders
  const name = g.display_name;
  const desc = g.active_skill?.description || '';
  if (desc) text.add(desc.replace(/\s+/g, ' ').trim());
  out.set(name, {
    name,
    c: g.color || 'w',
    support: !!g.is_support,
    vaal: (g.tags || []).includes('vaal') || /^Vaal /.test(name),
    awakened: /^Awakened /.test(name),
    trans: name !== b.display_name && !/^Vaal /.test(name) ? b.display_name : null,
    tags: (g.tags || []).filter((t) => KIND_TAGS.has(t)),
    ...(g.quest_reward ? { act: g.quest_reward.act } : {}),
    ...(name === b.display_name && buy.has(b.id) ? { buy: buy.get(b.id) } : {}),
    ...(name === b.display_name && reward.has(b.id) ? { reward: reward.get(b.id) } : {}),
  });
}
const list = [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
const file = path.join(__dirname, '..', 'src', 'core', 'regex', 'gems.json');
fs.writeFileSync(file, JSON.stringify({ source: 'Path of Exile game data (RePoE export)', gems: list, text: [...text] }));
console.log(`${list.length} gems -> ${file} (${Math.round(fs.statSync(file).size / 1024)} KB)`);
