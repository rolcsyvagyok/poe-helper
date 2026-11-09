'use strict';
/**
 * Beast search strings: for each beast the shortest piece of its name that no other beast's name has,
 * then the beasts you want joined into strings the game's search box takes (250 characters each).
 * Works in the Bestiary's captured-beasts search and on itemised beasts in the stash.
 */

const DATA = require('./beasts.json');

const MAX = 250;
// text on an itemised beast that isn't its name; a piece must not match any of it
const NOISE = ['captured beast', 'right click to add this to your bestiary.', 'bestiary', 'monster level', 'genus', 'group', 'family', 'itemised', 'rare', 'unique',
  ...new Set(DATA.beasts.flatMap((b) => [b.family, b.group]))].map((s) => s.toLowerCase());

const plain = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const OK = /^[a-z0-9 ',-]+$/;

/** The shortest piece of `name` that only matches `name` among `names` (lower case); "^" pins it to the start. */
function shortestPiece(name, names, noise = NOISE) {
  const me = plain(name);
  const others = names.map(plain).filter((n) => n !== me);
  const real = name.toLowerCase();
  let best = null;
  const score = (p) => p.length + (/^ | $/.test(p) ? 0.5 : 0) + (/^\^|\$$/.test(p) ? 0.25 : 0);
  const consider = (p) => { if (!best || score(p) < score(best)) best = p; };
  for (let len = 2; len <= me.length; len += 1) {
    if (best && len > best.length + 2) break;
    for (let i = 0; i + len <= me.length; i += 1) {
      const p = me.slice(i, i + len);
      // the game sees the real letters, so a piece with an accented letter in it is left out
      if (!OK.test(p) || real.slice(i, i + len) !== p) continue;
      const clash = (t) => t.includes(p);
      if (!others.some(clash) && !noise.some(clash)) consider(p);
      const start = i === 0;
      const end = i + len === me.length;
      if (start && !others.some((t) => t.startsWith(p)) && !noise.some((t) => t.startsWith(p))) consider(`^${p}`);
      if (end && !others.some((t) => t.endsWith(p)) && !noise.some((t) => t.endsWith(p))) consider(`${p}$`);
      // a name that's part of longer names (Goatman, Mountain Hellion) is pinned at both ends
      if (start && end) consider(`^${p}$`);
    }
  }
  return best || me;
}

let pieces = null;
function piecesByName() {
  if (!pieces) {
    const names = DATA.beasts.map((b) => b.name);
    pieces = new Map(DATA.beasts.map((b) => [b.name, shortestPiece(b.name, names)]));
  }
  return pieces;
}

/**
 * prices: [{ name, chaos, listingCount }] from poe.ninja.
 * -> every beast with its piece, price and how many are listed, most valuable first.
 */
function beastList(prices = []) {
  const p = piecesByName();
  const byName = new Map(prices.map((x) => [plain(x.name), x]));
  return DATA.beasts.map((b) => {
    const pr = byName.get(plain(b.name));
    return { ...b, piece: p.get(b.name), chaos: pr ? Math.round(pr.chaos * 10) / 10 : null, listed: pr?.listingCount ?? 0 };
  }).sort((a, b) => (b.chaos ?? -1) - (a.chaos ?? -1) || a.name.localeCompare(b.name));
}

/** Joins pieces into as few search strings as fit (each at most `max` characters with its quotes). */
function joinPieces(list, max = MAX) {
  const out = [];
  let cur = [];
  const len = (arr) => arr.join('|').length + 2;
  for (const b of list) {
    if (cur.length && len([...cur, b.piece]) > max) { out.push(cur); cur = []; }
    cur.push(b.piece);
  }
  if (cur.length) out.push(cur);
  return out.map((arr, i) => ({ text: `"${arr.join('|')}"`, count: arr.length, first: i }));
}

/**
 * choices: { minChaos, maxChaos, family, group, minListed, skip: [names], pick: [names] }
 * pick: beasts you add by hand (they're in whatever the filters say); skip: ones you leave out.
 */
function buildBeastRegex(choices = {}, prices = []) {
  const all = beastList(prices);
  const c = { minListed: 5, ...choices };
  const skip = new Set(c.skip || []);
  const pick = new Set(c.pick || []);
  const min = Number(c.minChaos) > 0 ? Number(c.minChaos) : null;
  const max = Number(c.maxChaos) > 0 ? Number(c.maxChaos) : null;
  // every beast you can capture is a red beast now (the yellow ones left the game), so there's no colour choice
  // every beast is a red beast and a Harvest beast now, so there's no kind to choose
  const matches = (b) => (!c.family || b.family === c.family)
    && (!c.group || b.group === c.group)
    && (min == null || (b.chaos != null && b.chaos >= min && b.listed >= c.minListed))
    && (max == null || (b.chaos != null && b.chaos <= max));
  const chosen = all.filter((b) => !skip.has(b.name) && (pick.has(b.name) || matches(b)));
  const strings = joinPieces(chosen);
  return { strings, chosen: chosen.map((b) => b.name), count: chosen.length, max: MAX };
}

function beastView(prices = []) {
  const list = beastList(prices);
  return {
    beasts: list,
    families: [...new Set(list.map((b) => b.family))].sort(),
    groups: [...new Set(list.map((b) => b.group))].sort(),
    priced: list.some((b) => b.chaos != null),
  };
}

module.exports = { shortestPiece, beastList, beastView, buildBeastRegex, joinPieces, piecesByName, MAX };
