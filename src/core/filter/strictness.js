'use strict';
/**
 * FilterBlade's strictness (Soft ... Uber Plus Strict), done in the app: each level switches some tiers
 * on, off or hidden (strictness.json, built from FilterBlade's downloads by scripts/build-strictness.js).
 * Only what changes between your filter's own level and the level you pick is applied, so your own
 * FilterBlade choices stay, and your own tier changes in the app win over the strictness.
 */
const DATA = require('./strictness.json');

const LEVELS = DATA.levels;
const STATE = { S: 'Show', H: 'Hide', O: 'Off' };
const NOTES = [
  'Shows nearly everything. For the start of the campaign.',
  'Hides only clearly useless items.',
  'For beginners and league starters. Hides terrible items, shows anything possibly useful.',
  'Hides low value items. For early maps.',
  'Hides most items worth little. For red maps.',
  'Shows only valuable items.',
  'Shows only very valuable items.',
];

/** The level the FilterBlade download was made at ("# TYPE: 2-SEMI-STRICT" -> 2); null when it doesn't say. */
function levelOf(text) {
  const m = /^#\s*TYPE:\s*(\d)-/m.exec(String(text || '').slice(0, 5000));
  return m ? Number(m[1]) : null;
}

/** { "type|tier": "Show" | "Hide" | "Off" } to go from the filter's own level to `level`. */
function strictnessActions(text, level) {
  if (level == null || !(level >= 0 && level < LEVELS.length)) return {};
  const from = levelOf(text);
  const out = {};
  for (const [key, states] of Object.entries(DATA.tiers)) {
    const to = states[level];
    if (from != null && states[from] === to) continue;
    out[key] = STATE[to];
  }
  return out;
}

/**
 * Each filter remembers its own strictness (yours, a friend's...): settings.strictness is
 * { "<filter name>": level }. The name is the online filter's "#name" or the file name.
 */
function filterKey(text, file = '') {
  const m = /^#name:(.*)$/m.exec(String(text || '').slice(0, 2000));
  return (m ? m[1] : String(file).split(/[\\/]/).pop().replace(/\.filter$/i, '')).trim() || 'filter';
}
function levelFor(saved, text, file) {
  if (saved == null || typeof saved !== 'object') return Number.isInteger(saved) ? saved : null;
  const v = saved[filterKey(text, file)];
  return Number.isInteger(v) ? v : null;
}

/** The patch with the strictness under your own changes (yours win). */
function withStrictness(text, patch = {}, level = null) {
  const sa = strictnessActions(text, level);
  if (!Object.keys(sa).length) return patch;
  return { ...patch, actions: { ...sa, ...(patch.actions || {}) } };
}

module.exports = { filterKey, levelFor, LEVELS, NOTES, levelOf, strictnessActions, withStrictness, VERSION: DATA.version };
