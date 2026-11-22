'use strict';
/**
 * The atlas passive tree: GGG's atlastree-export data.json, read at runtime (never shipped), and tree links.
 *
 * Links that are read:
 *  - pathofexile.com/fullscreen-atlas-skill-tree/<code>, wealthyexile.com/atlas/<code> and poeplanner links
 *    that hold GGG's code: base64url of [u32 version][u8 class][u8 ascendancy][u8 n][u16 node × n]
 *    [u8 n][u16 × n (cluster nodes, none here)][u8 n][(u16 effect, u16 node) × n (multiple-choice nodes)].
 *  - poeplanner.com/atlas-tree/<code>: [u16 format][u16 tree version][bool PoE 2 (format ≥ 5)][u16 n][u16 node × n]…
 *  - hypostasis.faith/atlas/…#t=<code>: a 24-bit FNV checksum (4 chars), then one bit per node met by a
 *    breadth-first walk from the start (neighbours by ascending id), 1 = picked; a picked multiple-choice node
 *    is followed by its choice + 1 in as few bits as its number of choices needs. Base64url, 6 bits a char.
 *  - hypostasis.faith …#s=<id>,<id>:<choice>,…
 */

const A16 = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
const A40 = [0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350];
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// a node's league mechanic: its icon says it best (NewBreachNotable4.png); the text when the icon is generic
const ICON_CATS = [
  [/Breach/, 'Breach'], [/Abyss/, 'Abyss'], [/Legion/, 'Legion'], [/Delirium/, 'Delirium'], [/Blight/, 'Blight'],
  [/Expedition/, 'Expedition'], [/Harvest/, 'Harvest'], [/Ritual/, 'Ritual'], [/Ultimatum/, 'Ultimatum'],
  [/Bestiary/, 'Bestiary'], [/Jun/, 'Betrayal'], [/Essence/, 'Essence'], [/Strongbox/, 'Strongboxes'],
  [/Shrine|GreedShrine/, 'Shrines'], [/Torment|SpeakeroftheDead/, 'Torment'], [/Anarchy/, 'Rogue Exiles'],
  [/Merc/, 'Mercenaries'], [/Alva/, 'Incursion'], [/Sentinel|Sentinek/, 'Sentinels'], [/Mirage/, 'Mirage'],
  [/Kalguur|Settlers|WheelofDisablingOreDesposits/, 'Settlers'], [/Beyond/, 'Beyond'], [/AzmeriForest|MorePrimalWisps/, 'Wildwood'],
  [/TheCleansingFire/, 'Searing Exarch'], [/TheTangle/, 'Eater of Worlds'], [/ElderShaper|Conqueror|TheMaven/, 'Shaper, Elder & Conquerors'],
  [/AtlasDivinationCards|PassiveMasteryDivination/, 'Divination cards'], [/Synthesis|AtlasMemories/, 'Memories'],
  [/Thread/, 'Threads'], [/AtlasGold/, 'Gold'], [/AtlasAnomalies/, 'Anomalies'], [/BossMapDrops/, 'Map drops'],
  [/AtlasUniquemonsters|UniqueMonsters/, 'Unique monsters'], [/RareMonsters/, 'Rare monsters'], [/AtlasMagicmonsters|MagicMonsters/, 'Magic monsters'],
  [/ItemQuantity/, 'Quantity & rarity'], [/ModifierTier|AtlasMapModGeneric/, 'Map modifiers'], [/Labyrinth|Ascendancy/, 'Labyrinth'],
];
const TEXT_CATS = [
  ['Breach', /breach|hive/i], ['Abyss', /abyss/i], ['Legion', /legion|monolith/i], ['Delirium', /delirium|simulacrum/i],
  ['Blight', /blight|\boils?\b/i], ['Expedition', /expedition|logbook|remnant/i], ['Harvest', /harvest|lifeforce|sacred grove/i],
  ['Ritual', /ritual|tribute/i], ['Ultimatum', /ultimatum|catalyst/i], ['Heist', /heist|blueprint|smuggler/i],
  ['Bestiary', /beasts?\b|einhar|bestiary|imprisoned monster/i], ['Betrayal', /syndicate|betrayal|veiled|allflame/i], ['Essence', /essence/i],
  ['Strongboxes', /strongbox/i], ['Shrines', /shrine/i], ['Torment', /torment|possess/i], ['Rogue Exiles', /rogue exile/i],
  ['Mercenaries', /mercenar/i], ['Incursion', /incursion|architect|vaal temple/i], ['Sentinels', /sentinel/i], ['Mirage', /mirage/i],
  ['Settlers', /kalguur|ore deposit|verisium/i], ['Wildwood', /wildwood|wisp|sacred flora|sacred fauna|\broots\b/i], ['Beyond', /beyond/i],
  ['Searing Exarch', /searing exarch|cleansing fire/i], ['Eater of Worlds', /eater of worlds|tangle/i],
  ['Shaper, Elder & Conquerors', /shaper|elder|guardian|maven|conqueror|sirus|eldritch/i], ['Divination cards', /divination/i],
  ['Memories', /memor/i], ['Threads', /thread/i], ['Gold', /\bgold\b/i], ['Labyrinth', /labyrinth|trial of ascendancy/i],
  ['Map drops', /maps? (?:found|drop)|unique maps|boss maps|maps of tier|scarab/i], ['Unique monsters', /unique monsters|map bosses/i],
  ['Rare monsters', /rare monsters/i], ['Magic monsters', /magic monsters/i], ['Quantity & rarity', /quantity|rarity/i],
  ['Map modifiers', /modifier/i], ['Maps', /./],
];

function categoryOf(node) {
  const icon = node.icon || '';
  const byIcon = ICON_CATS.find(([r]) => r.test(icon.replace(/.*\//, '')));
  if (byIcon) return byIcon[1];
  const text = [node.name, ...(node.stats || []), ...(node.variants || []).map((v) => v.text)].join(' ');
  return (TEXT_CATS.find(([, r]) => r.test(text)) || ['Maps'])[0];
}

// [Tag|Shown text] → Shown text; [Word] → Word
const plain = (s) => String(s).replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]|]+)\]/g, '$1');

// "…spread their Rewards to\nLegion Monsters…" is one stat wrapped; "…from\nYour Maps…" and "is one\n200%…" are two
function statLines(text) {
  const out = [];
  for (const part of text.split('\n')) {
    const prev = out[out.length - 1];
    if (prev != null && (!/^[A-Z0-9+]/.test(part) || /\b(to|a|an|the|of|be|by|and|or|with|for|in|on|at)$/i.test(prev))) out[out.length - 1] = `${prev} ${part}`;
    else out.push(part);
  }
  return out;
}

/** GGG's data.json → { nodes: Map(id → node), edges: [[a, b]], start, bounds, sprites, version }. */
function buildTree(data) {
  const C = data.constants || {};
  const per = C.skillsPerOrbit || [1, 6, 16, 16, 40, 72, 72];
  const radii = C.orbitRadii || [0, 82, 162, 335, 493, 662, 846];
  const angle = (orbit, i) => {
    const k = per[orbit];
    return (k === 16 ? A16[i] : k === 40 ? A40[i] : (360 * i) / k) * Math.PI / 180;
  };
  const nodes = new Map();
  const root = data.nodes.root;
  for (const [key, n] of Object.entries(data.nodes)) {
    if (key === 'root') continue;
    const g = data.groups[n.group];
    if (!g) continue;
    const a = angle(n.orbit || 0, n.orbitIndex || 0);
    const r = radii[n.orbit || 0] || 0;
    const kind = n.isKeystone ? 'keystone' : n.isNotable ? 'notable' : n.isMastery ? 'mastery' : n.isWormhole ? 'wormhole' : 'normal';
    const node = {
      id: Number(key), name: n.name, kind, icon: n.icon || '',
      // a new line before a capital starts a new stat ("…chance to be from\nYour Maps…"); before a small letter it's only wrapped
      stats: (n.stats || []).flatMap((s) => statLines(plain(s))),
      reminder: (n.reminderText || []).map(plain),
      variants: (n.variantEffects || []).map((v) => ({ effect: v.effect, text: plain((v.stats || []).join(' ')).replace(/\n/g, ' ') })),
      x: Math.round((g.x + r * Math.sin(a)) * 10) / 10, y: Math.round((g.y - r * Math.cos(a)) * 10) / 10,
      group: n.group, orbit: n.orbit || 0, gx: g.x, gy: g.y, r, a,
      out: (n.out || []).filter((o) => o !== 'root').map(Number),
    };
    node.cat = categoryOf(node);
    nodes.set(node.id, node);
  }
  const edges = [];
  for (const n of nodes.values()) for (const o of n.out) if (nodes.has(o)) edges.push([n.id, o]);
  const start = Number(root?.out?.[0]) || 29045;
  return { nodes, edges, start, version: data.tree || 'Atlas', bounds: [data.min_x, data.min_y, data.max_x, data.max_y], sprites: data.sprites || {}, points: data.points?.totalPoints || 150 };
}

function adjacency(tree) {
  if (tree._adj) return tree._adj;
  const adj = new Map();
  for (const [a, b] of tree.edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  for (const l of adj.values()) l.sort((x, y) => x - y);
  Object.defineProperty(tree, '_adj', { value: adj, enumerable: false });
  return adj;
}

function fromB64url(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(t + '='.repeat((4 - (t.length % 4)) % 4), 'base64');
}
function toB64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

// GGG's code (also WealthyExile's and poeplanner's official form)
function decodeOfficial(code, tree) {
  const b = fromB64url(code);
  if (b.length < 7) return null;
  const version = b.readUInt32BE(0);
  let p = 6;
  const nodes = [];
  const choices = {};
  if (version <= 4) {
    for (p = 7; p + 1 < b.length; p += 2) nodes.push(b.readUInt16BE(p));
  } else {
    const n = b[p++];
    for (let i = 0; i < n && p + 1 < b.length; i++, p += 2) nodes.push(b.readUInt16BE(p));
    const c = b[p++] || 0; p += 2 * c;
    if (version >= 6 && p < b.length) {
      const m = b[p++] || 0;
      for (let i = 0; i < m && p + 3 < b.length; i++, p += 4) {
        const effect = b.readUInt16BE(p); const node = b.readUInt16BE(p + 2);
        const idx = tree?.nodes.get(node)?.variants.findIndex((v) => v.effect === effect);
        if (idx >= 0) choices[node] = idx;
      }
    }
  }
  return { nodes, choices };
}

function encodeOfficial(nodes, choices = {}, tree = null) {
  const ids = [...nodes];
  const pairs = Object.entries(choices || {})
    .map(([id, i]) => [Number(id), tree?.nodes.get(Number(id))?.variants[i]?.effect])
    .filter(([id, e]) => e != null && ids.includes(id));
  const b = Buffer.alloc(4 + 3 + ids.length * 2 + 1 + 1 + pairs.length * 4);
  let p = 0;
  b.writeUInt32BE(6, p); p += 4; b[p++] = 0; b[p++] = 0;
  b[p++] = Math.min(255, ids.length);
  for (const id of ids.slice(0, 255)) { b.writeUInt16BE(id, p); p += 2; }
  b[p++] = 0;
  b[p++] = pairs.length;
  for (const [id, e] of pairs) { b.writeUInt16BE(e, p); b.writeUInt16BE(id, p + 2); p += 4; }
  return toB64url(b.subarray(0, p));
}

function decodePoeplanner(code) {
  const b = fromB64url(code);
  if (b.length < 6) return null;
  const fmt = b.readUInt16BE(0);
  let p = 4;
  if (fmt >= 5) p += 1;
  const n = b.readUInt16BE(p); p += 2;
  const nodes = [];
  for (let i = 0; i < n && p + 1 < b.length; i++, p += 2) nodes.push(b.readUInt16BE(p));
  return { nodes, choices: {} };
}

function checksum(items) {
  const s = items.slice().sort((a, b) => a[0] - b[0]).map(([id, c]) => (c === undefined ? id : `${id}:${c}`)).join(',');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = ((h >>> 24) ^ h) & 0xffffff;
  let out = '';
  for (let i = 0; i < 4; i++) out += B64[(h >>> (6 * (3 - i))) & 63];
  return out;
}
const bitWidth = (k) => Math.ceil(Math.log2(k + 1));

function decodeHypostasis(code, tree) {
  if (code.length < 4 || /[^\w-]/.test(code)) return null;
  const bits = [];
  for (const ch of code.slice(4)) { const x = B64.indexOf(ch); for (let b = 5; b >= 0; b--) bits.push((x >> b) & 1); }
  let pos = 0; let bad = false;
  const read = (n) => { let x = 0; while (n--) x = x * 2 + (bits[pos++] || 0); return x; };
  const adj = adjacency(tree);
  const seen = new Set([tree.start]); const queue = [tree.start]; const items = [];
  for (let i = 0; i < queue.length; i++) {
    for (const id of adj.get(queue[i]) || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!read(1)) continue;
      const k = tree.nodes.get(id)?.variants.length || 0;
      const x = k ? read(bitWidth(k)) : 0;
      if (x > k) bad = true;
      items.push([id, x ? x - 1 : undefined]);
      queue.push(id);
    }
  }
  if (bad || !items.length || bits.indexOf(1, pos) >= 0 || checksum(items) !== code.slice(0, 4)) return null;
  const choices = {};
  for (const [id, c] of items) if (c !== undefined) choices[id] = c;
  return { nodes: items.map(([id]) => id), choices };
}

function encodeHypostasis(nodes, choices, tree) {
  const picked = new Set(nodes);
  const bits = []; const items = [];
  const adj = adjacency(tree);
  const seen = new Set([tree.start]); const queue = [tree.start];
  for (let i = 0; i < queue.length; i++) {
    for (const id of adj.get(queue[i]) || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const on = picked.has(id);
      bits.push(on ? 1 : 0);
      if (!on) continue;
      const k = tree.nodes.get(id)?.variants.length || 0;
      let c = choices?.[id];
      if (!k || !(c >= 0 && c < k)) c = undefined;
      items.push([id, c]);
      if (k) for (let x = c === undefined ? 0 : c + 1, b = bitWidth(k) - 1; b >= 0; b--) bits.push((x >> b) & 1);
      queue.push(id);
    }
  }
  if (!items.length) return '';
  while (bits.length && !bits[bits.length - 1]) bits.pop();
  let out = checksum(items);
  for (let i = 0; i < bits.length; i += 6) { let x = 0; for (let j = 0; j < 6; j++) x = x * 2 + (bits[i + j] || 0); out += B64[x]; }
  return out;
}

/**
 * A tree link (or a bare code) → { nodes: [id], choices: { id: index }, from, unknown }.
 * Throws a short, player-facing error when the link isn't a tree it can read.
 */
function parseLink(link, tree) {
  const s = String(link || '').trim();
  if (!s) throw new Error('Paste an atlas tree link first.');
  let r = null; let from = '';
  const hypoS = /#s=([\d,:]+)/.exec(s);
  const hypoT = /#t=([\w-]+)/.exec(s);
  if (hypoS) {
    from = 'hypostasis.faith';
    const choices = {}; const nodes = [];
    for (const part of hypoS[1].split(',')) { const [id, c] = part.split(':').map(Number); if (id) { nodes.push(id); if (c >= 0) choices[id] = c; } }
    r = { nodes, choices };
  } else if (hypoT) {
    from = 'hypostasis.faith';
    r = decodeHypostasis(hypoT[1], tree);
    if (!r) throw new Error('That hypostasis.faith link is for another version of the atlas tree, or it was cut short.');
  } else {
    const code = (/(?:atlas-skill-tree|atlas-tree2?|\/atlas)\/([\w-]+)/.exec(s) || [null, /^[\w-]{8,}$/.test(s) ? s : null])[1];
    if (!code) throw new Error('That isn\'t an atlas tree link. Links from pathofexile.com, poeplanner.com, hypostasis.faith and wealthyexile.com work.');
    from = /poeplanner/.test(s) ? 'poeplanner.com' : /wealthyexile/.test(s) ? 'wealthyexile.com' : /pathofexile/.test(s) ? 'pathofexile.com' : 'code';
    const b = fromB64url(code);
    r = b.length >= 3 && b[0] + b[1] + b[2] === 0 ? decodeOfficial(code, tree) : decodePoeplanner(code);
    if (!r) throw new Error('That tree link couldn\'t be read.');
  }
  const known = r.nodes.filter((id) => tree.nodes.has(id));
  if (!known.length) throw new Error('No passives of this atlas tree were found in that link.');
  return { nodes: [...new Set(known)], choices: r.choices, from, unknown: r.nodes.length - known.length };
}

// "2% increased effect of Explicit Modifiers" ×10 → "20% increased effect of Explicit Modifiers"
function sumLines(lines) {
  const by = new Map();
  for (const line of lines) {
    const nums = [];
    const tpl = line.replace(/\d+(?:\.\d+)?/g, (m) => { nums.push(Number(m)); return '#'; });
    const e = by.get(tpl) || { tpl, nums: nums.map(() => 0), count: 0 };
    if (e.nums.length !== nums.length) { by.set(line, { tpl: line, nums: [], count: 1 }); continue; }
    nums.forEach((n, i) => { e.nums[i] += n; });
    e.count++;
    by.set(tpl, e);
  }
  return [...by.values()].map((e) => {
    let i = 0;
    const round = (n) => Math.round(n * 100) / 100;
    const text = e.nums.length ? e.tpl.replace(/#/g, () => round(e.nums[i++])) : e.tpl;
    return { text, count: e.count };
  });
}

/** What a tree does: its stats summed and grouped by league mechanic, biggest groups first. */
function effects(tree, nodes, choices = {}) {
  const cats = new Map();
  let notables = 0; let keystones = 0;
  for (const id of nodes) {
    const n = tree.nodes.get(id);
    if (!n || n.kind === 'mastery') continue;
    if (n.kind === 'notable') notables++;
    if (n.kind === 'keystone') keystones++;
    const lines = n.kind === 'wormhole' ? [] : [...n.stats];
    if (n.variants.length) {
      const c = choices[id];
      const v = n.variants[c];
      // the choice finishes each line ("Red Beasts … chance to be from" + "The Wilds")
      if (v) lines.splice(0, lines.length, ...(n.stats.length ? n.stats.map((l) => `${l} ${v.text}`) : [v.text]));
      else lines.push(`(${n.name}: no choice made)`);
    }
    if (!lines.length) continue;
    const c = cats.get(n.cat) || { name: n.cat, lines: [], nodes: [], keystones: [] };
    if (n.kind === 'keystone') c.keystones.push(n.name);
    c.lines.push(...lines);
    c.nodes.push(id);
    cats.set(n.cat, c);
  }
  const list = [...cats.values()].map((c) => ({ name: c.name, nodes: c.nodes, keystones: c.keystones, lines: sumLines(c.lines) }))
    .sort((a, b) => b.nodes.length - a.nodes.length || a.name.localeCompare(b.name));
  return { points: nodes.filter((id) => tree.nodes.get(id)?.kind !== 'mastery').length, notables, keystones, categories: list };
}

/** The data the page draws: nodes, edges (with arcs on a group's orbit) and the sprite sheet coordinates it needs. */
function drawData(tree) {
  const nodes = [...tree.nodes.values()].map((n) => ({
    id: n.id, name: n.name, kind: n.kind, x: n.x, y: n.y, cat: n.cat, stats: n.stats, reminder: n.reminder,
    variants: n.variants.map((v) => v.text), icon: n.icon,
  }));
  const edges = [];
  for (const [a, b] of tree.edges) {
    const A = tree.nodes.get(a); const B = tree.nodes.get(b);
    if (A.kind === 'mastery' || B.kind === 'mastery') continue;
    if (A.kind === 'wormhole' && B.kind === 'wormhole') continue; // gateways link across the tree; no line
    const e = { a, b };
    if (A.group === B.group && A.orbit === B.orbit && A.orbit > 0) {
      let d = B.a - A.a;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      // canvas angles start at +x and go clockwise (y down); the tree's start at the top
      e.arc = { cx: A.gx, cy: A.gy, r: A.r, a1: A.a - Math.PI / 2, a2: A.a - Math.PI / 2 + d };
    }
    edges.push(e);
  }
  // sprite sheets at one zoom level: the active / inactive icons and the masteries
  const zoom = (s) => { if (!s) return null; const keys = Object.keys(s); const k = keys.includes('0.3835') ? '0.3835' : keys[keys.length - 1]; return s[k]; };
  const sheets = {};
  for (const key of ['normalActive', 'notableActive', 'keystoneActive', 'wormholeActive', 'normalInactive', 'notableInactive', 'keystoneInactive', 'wormholeInactive', 'mastery']) {
    const z = zoom(tree.sprites[key]);
    if (!z || !/^https:\/\/web\.poecdn\.com\//.test(z.filename)) continue;
    sheets[key] = { url: z.filename, w: z.w, h: z.h, coords: z.coords };
  }
  // every link, gateways' too, for picking a path to a passive you click
  return { nodes, edges, links: tree.edges, start: tree.start, bounds: tree.bounds, points: tree.points, sheets, version: tree.version };
}

/**
 * A tree made by hand: only real passives (no masteries), only those linked to the start through other
 * taken passives, at most the tree's points. -> the cleaned list.
 */
function connectedNodes(tree, nodes) {
  const want = new Set(nodes.map(Number).filter((id) => tree.nodes.has(id) && tree.nodes.get(id).kind !== 'mastery'));
  const adj = adjacency(tree);
  const seen = new Set([tree.start]); const queue = [tree.start]; const out = [];
  for (let i = 0; i < queue.length; i++) {
    for (const id of adj.get(queue[i]) || []) {
      if (seen.has(id) || !want.has(id)) continue;
      seen.add(id); queue.push(id); out.push(id);
    }
  }
  return out.slice(0, tree.points);
}

module.exports = { connectedNodes, buildTree, parseLink, effects, sumLines, drawData, categoryOf, encodeOfficial, encodeHypostasis, decodeHypostasis, decodeOfficial, decodePoeplanner };
