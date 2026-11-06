'use strict';
/**
 * Stash search strings for maps: "skip maps with these mods, keep ones with those, at least this much
 * quantity…". The game's search box takes a regex of up to 250 characters, case-insensitive; a term in
 * quotes may hold spaces, "!" in front means "not", "|" means "or", and terms separated by spaces must
 * all match.
 *
 * Each mod gets the shortest piece of its own text that no other map mod (or map name, or the usual
 * map lines) contains. When several mods are picked, one piece may cover more than one of them
 * ("cursed with" covers every curse), so the picked set is covered greedily with the fewest
 * characters, using only pieces that match nothing outside the set.
 */

const DATA = require('./map-mods.json');

const MAX = 250;
// lines every map can show besides its mods; a search piece must not be found in them
const STATIC_TEXT = [
  'item quantity: +', 'item rarity: +', 'monster pack size: +', 'more currency: +', 'more scarabs: +', 'more maps: +', 'more divination cards: +',
  'quality: +', 'quality (quantity): +', 'quality (currency): +', 'quality (divination cards): +', 'quality (rarity): +', 'quality (pack size): +', 'quality (scarabs): +',
  'map tier: ', 'item level: ', 'monster level: ', 'rarity: normal', 'rarity: magic', 'rarity: rare', 'rarity: unique', 'item class: maps', 'corrupted', 'unidentified', 'mirrored', 'note: ',
  'travel to this map by using it in a personal map device. maps can only be used once.',
  'area is influenced by the shaper', 'area is influenced by the elder', 'area is influenced by the originator\'s memories',
  'map contains al-hezmin\'s citadel', 'map contains baran\'s citadel', 'map contains drox\'s citadel', 'map contains veritania\'s citadel',
  'area is infested with fungal growths', 'natural inhabitants of this area have been removed', 'map\'s item quantity modifiers also affect blight chest count at 25% value',
  'map\'s item quantity modifiers also affect blight chest count at 50% value', 'can be anointed up to 3 times', 'delirium reward type: ', 'players in area are #% delirious',
  'blighted', 'blight-ravaged', 'shaped', 'elder', 'memory', 'unique', 'requirements: ',
];

const NUMBERS = [
  { id: 'quantity', label: 'Item quantity', prefix: 'tity: \\+' },
  { id: 'rarity', label: 'Item rarity', prefix: 'rity: \\+' },
  { id: 'packSize', label: 'Pack size', prefix: 'ize: \\+' },
  { id: 'maps', label: 'More maps', prefix: 'aps: \\+' },
  { id: 'currency', label: 'More currency', prefix: 'ncy: \\+' },
  { id: 'scarabs', label: 'More scarabs', prefix: 'abs: \\+' },
  { id: 'divination', label: 'More divination cards', prefix: 'rds: \\+' },
];
const QUALITY = [
  { id: 'regular', label: 'Quality (quantity)', prefix: 'tity\\): \\+' },
  { id: 'rarity', label: 'Quality (rarity)', prefix: 'rity\\): \\+' },
  { id: 'packSize', label: 'Quality (pack size)', prefix: 'ize\\): \\+' },
  { id: 'currency', label: 'Quality (currency)', prefix: 'ncy\\): \\+' },
  { id: 'scarabs', label: 'Quality (scarabs)', prefix: 'abs\\): \\+' },
  { id: 'divination', label: 'Quality (divination cards)', prefix: 'rds\\): \\+' },
];
const MAP_TYPES = [
  { id: 'shaper', label: 'Shaper', term: 'the shaper' },
  { id: 'elder', label: 'Elder', term: 'the elder' },
  { id: 'conqueror', label: 'Conqueror', term: 'citadel' },
  { id: 'originator', label: 'Originator', term: 'originator' },
  { id: 'blighted', label: 'Blighted', term: 'blighted' },
  { id: 'ravaged', label: 'Blight-ravaged', term: 'ravaged' },
];

/** The mods to list for a kind of map: 'regular' (with nightmare ones if asked) or 't17'. */
function modsFor(kind = 'regular', { nightmare = false } = {}) {
  return DATA.mods.filter((m) => (kind === 't17' ? m.kinds.includes('t17') : m.kinds.includes('regular') || (nightmare && m.kinds.includes('nightmare'))));
}

// ---------- search pieces ----------
const OK_CHAR = /^[a-z ',-]+$/;
const lower = (s) => s.toLowerCase();
const cache = new Map(); // kind -> { mods, texts, candidates: Map(modId -> [{ piece, hits:Set }]) }

function universe(kind) {
  if (cache.has(kind)) return cache.get(kind);
  // the mods that can be on such a map, picked or not (nightmare ones can always roll on regular maps)
  const mods = kind === 't17' ? DATA.mods.filter((m) => m.kinds.includes('t17')) : DATA.mods.filter((m) => m.kinds.includes('regular') || m.kinds.includes('nightmare'));
  const texts = mods.map((m) => ({ id: m.id, lines: m.lines.map(lower), name: lower(m.name || '') }));
  const outside = [...STATIC_TEXT, ...(DATA.mapNames || []).map(lower)];
  const hitsOf = (piece) => {
    const s = new Set();
    // a magic map's name carries its mods' names ("Strand Map of Giants"), so a mod's name counts as its own text
    for (const t of texts) if (t.lines.some((l) => l.includes(piece)) || (t.name && t.name.includes(piece))) s.add(t.id);
    return s;
  };
  const candidates = new Map();
  for (const t of texts) {
    const seen = new Set();
    const list = [];
    for (const line of t.lines) {
      for (let i = 0; i < line.length; i++) {
        for (let len = 2; len <= 18 && i + len <= line.length; len++) {
          const piece = line.slice(i, i + len);
          if (seen.has(piece) || piece.startsWith(' ') || piece.endsWith(' ') || !OK_CHAR.test(piece)) continue;
          seen.add(piece);
          if (outside.some((o) => o.includes(piece))) continue;
          const hits = hitsOf(piece);
          list.push({ piece, hits });
        }
      }
    }
    // shortest first; among equals the one that hits the fewest mods
    list.sort((a, b) => a.piece.length - b.piece.length || a.hits.size - b.hits.size || a.piece.localeCompare(b.piece));
    candidates.set(t.id, list);
  }
  const u = { mods, candidates };
  cache.set(kind, u);
  return u;
}

/**
 * The fewest characters of pieces that between them match every mod in ids and nothing else.
 * Returns { pieces: [...], extra: [ids matched that weren't asked for], missing: [ids with no piece] }.
 */
function coverMods(ids, kind = 'regular') {
  const want = new Set(ids);
  if (!want.size) return { pieces: [], extra: [], missing: [] };
  const { candidates } = universe(kind);
  const pool = [];
  for (const id of want) for (const c of candidates.get(id) || []) if ([...c.hits].every((h) => want.has(h))) pool.push(c);
  const left = new Set(want);
  const pieces = [];
  while (left.size) {
    let best = null;
    let bestScore = 0;
    for (const c of pool) {
      let n = 0;
      for (const h of c.hits) if (left.has(h)) n++;
      if (!n) continue;
      const score = n / (c.piece.length + 1); // +1 for the "|" between pieces
      if (score > bestScore || (score === bestScore && best && c.piece.length < best.piece.length)) { best = c; bestScore = score; }
    }
    if (!best) break;
    pieces.push(best.piece);
    for (const h of best.hits) left.delete(h);
  }
  // mods whose whole text is part of another mod: the closest piece, matching a few others too
  const extra = new Set();
  const missing = [];
  for (const id of left) {
    const c = (candidates.get(id) || []).slice().sort((a, b) => a.hits.size - b.hits.size || a.piece.length - b.piece.length)[0];
    if (!c) { missing.push(id); continue; }
    pieces.push(c.piece);
    for (const h of c.hits) if (!want.has(h)) extra.add(h);
  }
  // a piece that's inside another picked piece is redundant only if it covers nothing new: keep it simple
  return { pieces: [...new Set(pieces)], extra: [...extra], missing };
}

/** "at least n" for a whole number, as a regex: 80 -> ([89]\d|\d{3}) */
function atLeast(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1000) return String(n);
  const s = String(n);
  const d = s.length;
  const alts = [];
  // 20 -> [2-9]\d rather than [3-9]\d|2\d: trailing zeros fold into the last digit that isn't one
  const zeros = (s.match(/0+$/) || [''])[0].length;
  const tens = (k) => (k === 0 ? '' : k === 1 ? '\\d' : `\\d{${k}}`);
  for (let i = 0; i < d; i++) {
    const digit = +s[i];
    const rest = d - i - 1;
    if (zeros && i === d - zeros - 1) { alts.push(s.slice(0, i) + (digit === 9 ? '9' : `[${digit}-9]`) + tens(zeros)); break; }
    if (i === d - 1) { alts.push(s.slice(0, i) + (digit === 9 ? '9' : digit === 0 ? '\\d' : `[${digit}-9]`)); break; }
    if (digit < 9) alts.push(s.slice(0, i) + (digit + 1 === 9 ? '9' : `[${digit + 1}-9]`) + (rest === 1 ? '\\d' : `\\d{${rest}}`));
  }
  if (d < 3) alts.push(d === 1 ? '\\d\\d\\d?' : '\\d{3}');
  const tidy = alts.map((a) => a.replace(/\[(\d)-9\]/g, (m, x) => (x === '8' ? '[89]' : m)));
  return tidy.length === 1 ? tidy[0] : `(${tidy.join('|')})`;
}

const quote = (s) => `"${s}"`;

/**
 * The search string for a set of choices:
 * { kind, nightmare, avoid:[ids], want:[ids], wantAll, numbers:{quantity:80,...}, numbersAny,
 *   quality:{regular:20,...}, qualityAny, mapTypes:{shaper:'want'|'avoid'}, rarity:{normal,magic,rare:'want'|'avoid'},
 *   corrupted:'want'|'avoid', unidentified:'want'|'avoid', custom }
 * -> { regex, length, max, parts:[{ label, text }], notes:[...] }
 */
function buildMapRegex(o = {}) {
  const kind = o.kind === 't17' ? 't17' : 'regular';
  const byId = new Map(DATA.mods.map((m) => [m.id, m]));
  const listed = new Set(modsFor(kind, { nightmare: !!o.nightmare }).map((m) => m.id));
  const avoid = (o.avoid || []).filter((id) => listed.has(id));
  const want = (o.want || []).filter((id) => listed.has(id) && !avoid.includes(id));
  const parts = [];
  const notes = [];
  const label = (id) => byId.get(id)?.lines.join(' / ') || id;

  const typeTerms = (side) => MAP_TYPES.filter((t) => o.mapTypes?.[t.id] === side).map((t) => t.term);

  const bad = coverMods(avoid, kind);
  const badTerms = [...bad.pieces, ...typeTerms('avoid')];
  if (badTerms.length) parts.push({ label: 'Skip maps with', text: quote(`!${badTerms.join('|')}`) });
  if (bad.extra.length) notes.push(`To skip ${bad.extra.length === 1 ? 'one mod' : 'some mods'}, the search also skips: ${bad.extra.map(label).join('; ')}.`);

  if (want.length) {
    if (o.wantAll) {
      const terms = want.map((id) => coverMods([id], kind)).flatMap((r) => (r.pieces.length > 1 ? [`${r.pieces.join('|')}`] : r.pieces));
      parts.push({ label: 'Must have all of', text: terms.map(quote).join(' ') });
    } else {
      const good = coverMods(want, kind);
      parts.push({ label: 'Must have one of', text: quote(good.pieces.join('|')) });
      if (good.extra.length) notes.push(`The "must have" search also takes: ${good.extra.map(label).join('; ')}.`);
    }
  }
  const types = typeTerms('want');
  if (types.length) parts.push({ label: 'Map type', text: quote(types.join('|')) });

  const nums = NUMBERS.map((n) => ({ n, r: atLeast(o.numbers?.[n.id]) })).filter((x) => x.r);
  if (nums.length) {
    if (o.numbersAny && nums.length > 1) parts.push({ label: 'At least one of', text: quote(nums.map((x) => `${x.n.prefix}${x.r}%`).join('|')) });
    else for (const x of nums) parts.push({ label: `${x.n.label} ${o.numbers[x.n.id]}%+`, text: quote(`${x.n.prefix}${x.r}%`) });
  }
  const qs = QUALITY.map((q) => ({ q, r: atLeast(o.quality?.[q.id]) })).filter((x) => x.r);
  if (qs.length) {
    if (o.qualityAny && qs.length > 1) parts.push({ label: 'Quality, one of', text: quote(qs.map((x) => `${x.q.prefix}${x.r}%`).join('|')) });
    else for (const x of qs) parts.push({ label: `${x.q.label} ${o.quality[x.q.id]}%+`, text: quote(`${x.q.prefix}${x.r}%`) });
  }

  const RAR = { normal: 'n', magic: 'm', rare: 'r' };
  for (const side of ['want', 'avoid']) {
    const r = Object.keys(RAR).filter((k) => o.rarity?.[k] === side);
    if (!r.length) continue;
    const inner = r.length === 1 ? RAR[r[0]] : `(${r.map((k) => RAR[k]).join('|')})`;
    parts.push({ label: side === 'want' ? `Rarity: ${r.join(' or ')}` : `Not ${r.join(' or ')}`, text: quote(`${side === 'avoid' ? '!' : ''}rity: ${inner}`) });
  }
  if (o.corrupted === 'want') parts.push({ label: 'Corrupted', text: 'corrupted' });
  if (o.corrupted === 'avoid') parts.push({ label: 'Not corrupted', text: '!corrupted' });
  if (o.unidentified === 'want') parts.push({ label: 'Unidentified', text: 'unidentified' });
  if (o.unidentified === 'avoid') parts.push({ label: 'Identified', text: '!unidentified' });
  if (o.custom && String(o.custom).trim()) parts.push({ label: 'Your own', text: String(o.custom).trim() });

  const regex = parts.map((p) => p.text).join(' ');
  if (regex.length > MAX) notes.unshift(`${regex.length} characters: the game takes ${MAX}. Pick fewer mods or drop a number.`);
  if (bad.missing.length) notes.push(`No search piece for: ${bad.missing.map(label).join('; ')}.`);
  return { regex, length: regex.length, max: MAX, parts, notes };
}

/** What the page lists: { kinds, mods:[{id, lines, affix, name, kinds, piece}], numbers, quality, mapTypes } */
function mapRegexView({ kind = 'regular', nightmare = false } = {}) {
  const k = kind === 't17' ? 't17' : 'regular';
  const { candidates } = universe(k);
  const mods = modsFor(k, { nightmare }).map((m) => {
    const own = (candidates.get(m.id) || []).find((c) => c.hits.size === 1);
    return { id: m.id, lines: m.lines, affix: m.affix, name: m.name, kinds: m.kinds, nightmareOnly: !m.kinds.includes(k === 't17' ? 't17' : 'regular'), piece: own ? own.piece : null };
  });
  return { kind: k, mods, numbers: NUMBERS.map(({ id, label }) => ({ id, label })), quality: QUALITY.map(({ id, label }) => ({ id, label })), mapTypes: MAP_TYPES.map(({ id, label }) => ({ id, label })), max: MAX };
}

module.exports = { buildMapRegex, mapRegexView, coverMods, atLeast, modsFor, MAX, STATIC_TEXT };
