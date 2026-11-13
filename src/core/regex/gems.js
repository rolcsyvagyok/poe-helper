'use strict';
/**
 * Gem search strings: every gem gets the shortest piece of its name that no other gem's name (and no gem
 * description) has, then the gems you pick are joined into strings the game's search box takes (250
 * characters each). For vendors (Lilly, the act vendors) and your stash.
 */

const DATA = require('./gems.json');

const MAX = 250;
const OK = /^[a-z0-9 '-]+$/;
const lc = (s) => String(s).toLowerCase();
// lines a gem shows besides its name and description
const NOISE = ['rarity: gem', 'level: #', 'quality: +#%', 'cost: # mana', 'cast time: # sec', 'attack speed multiplier', 'experience: #/#', 'requirements:', 'place into an item socket of the right colour to gain this skill. right click to remove from a socket.',
  'this is a support gem. it does not grant a bonus to your character, but to skills in sockets connected to it. place into an item socket connected to a socket containing the skill gem you wish to augment. right click to remove from a socket.',
  'supports any skill gem', 'transfigured', 'corrupted', 'mana reserved', 'reservation', 'souls per use', 'can store # use', 'cooldown time', 'critical strike chance', 'effectiveness of added damage', 'damage multiplier', 'cost & reservation multiplier'].map(lc);
const descText = DATA.text.map(lc);

/** The shortest piece of a gem's name that only matches it ("^" pins the start of the name, "$" the end). */
function gemPiece(name, names) {
  const me = lc(name);
  const others = names.map(lc).filter((n) => n !== me);
  const text = [...NOISE, ...descText];
  let best = null;
  const cost = (p) => p.length + (/^\^|\$$/.test(p) ? 0.5 : 0);
  const take = (p) => { if (!best || cost(p) < cost(best)) best = p; };
  for (let len = 3; len <= me.length; len += 1) {
    if (best && len > best.length + 1) break;
    for (let i = 0; i + len <= me.length; i += 1) {
      const p = me.slice(i, i + len);
      if (!OK.test(p) || /^ | $/.test(p)) continue;
      // a piece across a space starts at a word
      if (p.includes(' ') && i > 0 && me[i - 1] !== ' ') continue;
      const start = i === 0;
      const end = i + len === me.length;
      if (!others.some((t) => t.includes(p)) && !text.some((t) => t.includes(p))) take(p);
      // a name inside longer ones ("Ice Nova" / "Ice Nova of Frostbolts"): pinned to the end of the name line
      if (end && !others.some((t) => t.endsWith(p)) && !NOISE.some((t) => t.endsWith(p))) take(`${p}$`);
      // the start of the name line ("^added f" isn't in "Awakened Added Fire…")
      if (start && !others.some((t) => t.startsWith(p)) && !text.some((t) => t.startsWith(p))) take(`^${p}`);
      if (start && end) take(`^${p}$`);
    }
  }
  return best || `^${me}$`;
}

let pieces = null;
function piecesByName() {
  if (!pieces) {
    const names = DATA.gems.map((g) => g.name);
    pieces = new Map(DATA.gems.map((g) => [g.name, gemPiece(g.name, names)]));
  }
  return pieces;
}

function gemList() {
  const p = piecesByName();
  return DATA.gems.map((g) => ({ ...g, piece: p.get(g.name) }));
}

/** The picked gems as as few search strings as fit (each at most 250 characters with its quotes). */
function buildGemRegex(choices = {}) {
  const picked = new Set(choices.picks || []);
  const list = gemList().filter((g) => picked.has(g.name));
  const out = [];
  let cur = [];
  const len = (arr) => arr.join('|').length + 2;
  for (const g of list) {
    if (cur.length && len([...cur, g.piece]) > MAX) { out.push(cur); cur = []; }
    cur.push(g.piece);
  }
  if (cur.length) out.push(cur);
  return { strings: out.map((arr) => ({ text: `"${arr.join('|')}"`, count: arr.length })), count: list.length, max: MAX };
}

/**
 * Where a gem comes from while levelling, for one class: its quest reward and the first vendor that sells
 * it (Lilly Roth in Act 6 sells nearly all of them to everyone). Names may leave off " Support" (as PoB does).
 * Returns { reward, buy, lilly, note } with plain sentences, or null for a gem the list doesn't know.
 */
const BY_NAME = new Map(DATA.gems.map((g) => [g.name.toLowerCase(), g]));
function whereToGet(name, cls = '') {
  const n = String(name || '').trim().toLowerCase();
  const g = BY_NAME.get(n) || BY_NAME.get(`${n} support`);
  if (!g) return null;
  const forMe = (e) => !cls || !e.classes?.length || e.classes.includes(cls);
  const real = (e) => e.npc && !/tutorial/i.test(e.npc);
  const reward = (g.reward || []).filter(real).find(forMe);
  const buy = (g.buy || []).filter(real).find(forMe);
  const lilly = (g.buy || []).find((e) => /lilly/i.test(e.npc) && forMe(e));
  const out = { reward: null, buy: null, lilly: null, note: null };
  if (reward) out.reward = `Quest reward: Act ${reward.act}, ${reward.quest} (${reward.npc})`;
  if (buy) out.buy = `Buy: Act ${buy.act}, ${buy.npc}, after ${buy.quest}`;
  if (lilly && lilly !== buy) out.lilly = `Also sold by Lilly Roth in Act ${lilly.act}, after ${lilly.quest}`;
  if (!out.reward && !out.buy) {
    if (g.trans) out.note = `Transfigured ${g.trans}: from the Divine Font in the Labyrinth, or trade`;
    else if (g.vaal) out.note = 'Vaal gem: corrupt the normal gem with a Vaal Orb, or find it';
    else if (g.awakened) out.note = 'Awakened gem: drops in the endgame, or trade';
    else out.note = cls ? `Not sold to ${cls} in the campaign: Lilly Roth, another class's vendor in a party, or trade` : 'Not sold in the campaign';
  }
  return out;
}

module.exports = { gemPiece, gemList, buildGemRegex, piecesByName, whereToGet, MAX };
