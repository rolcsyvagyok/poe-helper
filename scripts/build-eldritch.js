'use strict';
/**
 * Builds src/core/regex/eldritch-mods.json: the Searing Exarch and Eater of Worlds implicits (Eldritch Embers and
 * Ichors) with their spawn weights, from a RePoE export of the game data (data/mods.json). Run after a game patch:
 *   node scripts/build-eldritch.js <RePoE data folder>
 * Tiers 1-6 are Lesser, Greater, Grand, Exceptional, Exquisite and Perfect. "Presence" mods work while a unique
 * (or a pinnacle) enemy is near; they only roll from tier 2 (unique) or 3 (pinnacle) up.
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/build-eldritch.js <RePoE data folder>'); process.exit(1); }
const mods = JSON.parse(fs.readFileSync(path.join(dir, 'mods.json'), 'utf8'));

const out = { source: 'RePoE mods.json', exarch: [], eater: [] };
for (const [id, m] of Object.entries(mods)) {
  const side = m.generation_type === 'searing_exarch_implicit' ? 'exarch' : m.generation_type === 'eater_of_worlds_implicit' ? 'eater' : null;
  if (!side || !m.text) continue;
  const w = (m.spawn_weights || []).filter((x) => x.weight > 0).map((x) => [x.tag, x.weight]);
  if (!w.length) continue;
  const tier = Number(/(\d+)$/.exec(id)?.[1]) || 1;
  const presence = (m.stats || []).some((s) => /requires_unique_monster_presence/.test(s.id)) ? 'unique'
    : (m.stats || []).some((s) => /requires_celestial_boss_presence/.test(s.id)) ? 'pinnacle' : null;
  out[side].push({ type: m.type.replace(/(Unique|Pinnacle)Presence$/, ''), tier, presence, text: m.text.replace(/\r/g, ''), w, tags: (m.implicit_tags || []).filter((t) => t !== 'default') });
}
for (const k of ['exarch', 'eater']) out[k].sort((a, b) => a.type.localeCompare(b.type) || (a.presence || '').localeCompare(b.presence || '') || a.tier - b.tier);
fs.writeFileSync(path.join(__dirname, '..', 'src', 'core', 'regex', 'eldritch-mods.json'), JSON.stringify(out));
console.log(`exarch ${out.exarch.length}, eater ${out.eater.length}`);
