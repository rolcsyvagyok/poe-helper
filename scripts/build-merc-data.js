'use strict';
/**
 * Builds src/core/merc-data.json (Mercenary Warrants: each build's skills and their kind, each skill's
 * possible supports, the support families and tiers) from Awakened PoE Trade's game data
 * (https://github.com/SnosMe/awakened-poe-trade, MIT licence, renderer/public/data/en/items.ndjson and
 * stats.ndjson). Run it when a patch changes mercenaries:
 *   node scripts/build-merc-data.js <awakened-poe-trade>/renderer/public/data/en
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) { console.error('Usage: node scripts/build-merc-data.js <data/en folder>'); process.exit(1); }
const lines = (f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const builds = {};
const aliases = {};
for (const it of lines('items.ndjson')) {
  if (it.namespace !== 'MERCENARY_BUILD') continue;
  if (typeof it.mercenaryBuild === 'string') aliases[it.name] = it.mercenaryBuild;
  else builds[it.name] = it.mercenaryBuild.skills.map((s) => ({ name: s.name, type: s.type }));
}
const skills = {};
const supports = {};
for (const st of lines('stats.ndjson')) {
  if (!st.mercenary) continue;
  const id = st.trade?.ids?.pseudo?.[0];
  if (!id) continue;
  if (/skill_/.test(id)) skills[st.ref] = { id, icon: st.mercenary.icon || null, supports: st.mercenary.supports || [] };
  else supports[st.ref] = { id, tier: st.mercenary.tier ?? null, family: st.modFamily || [st.ref], canonical: st.mercenary.canonical || st.ref, ...(st.mercenary.syntheticFamily ? { synthetic: true } : {}) };
}
const out = path.join(__dirname, '..', 'src', 'core', 'merc-data.json');
fs.writeFileSync(out, JSON.stringify({ source: 'Awakened PoE Trade game data (MIT)', builds, aliases, skills, supports }));
console.log(`${Object.keys(builds).length} builds, ${Object.keys(skills).length} skills, ${Object.keys(supports).length} supports -> ${out}`);
