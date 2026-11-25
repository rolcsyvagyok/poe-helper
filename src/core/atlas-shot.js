'use strict';
/**
 * Reads an atlas passive tree from a screenshot of the game's atlas tree.
 *  1. Finds where the tree is: the scale and position that put GGG's node positions on the screenshot's node frames
 *     (a coarse search over scales, then a finer one around the best).
 *  2. A node is allocated when its frame is the game's pale "allocated" blue (unallocated frames are gold/brown).
 *  3. Only nodes joined to the start through other allocated nodes are kept; a node the reading missed between two
 *     allocated ones is put back.
 * img: { width, height, data } with RGBA bytes (canvas ImageData) or BGRA (Electron's toBitmap, bgra: true).
 * Pure: no DOM, no Electron.
 */

function luma(img) {
  const { width: w, height: h, data } = img;
  const step = data.length / (w * h);
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += step) out[i] = 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2];
  return out;
}

/** box blur of radius r (two passes: rows, then columns) */
function blur(src, w, h, r) {
  if (r < 1) return Float32Array.from(src);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0, n = 0;
    for (let x = -r; x < w; x++) {
      if (x + r < w) { acc += src[y * w + x + r]; n++; }
      if (x - r - 1 >= 0) { acc -= src[y * w + x - r - 1]; n--; }
      if (x >= 0) tmp[y * w + x] = acc / n;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0, n = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h) { acc += tmp[(y + r) * w + x]; n++; }
      if (y - r - 1 >= 0) { acc -= tmp[(y - r - 1) * w + x]; n--; }
      if (y >= 0) out[y * w + x] = acc / n;
    }
  }
  return out;
}

/** shrink by a whole factor f (average of each f×f block) */
function shrink(src, w, h, f) {
  const W = Math.floor(w / f), H = Math.floor(h / f);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += src[(y * f + dy) * w + x * f + dx];
    out[y * W + x] = s / (f * f);
  }
  return { map: out, w: W, h: H };
}

/** bright spots on a darker surround: the node frames */
function spotMap(gray, w, h, r) {
  const a = blur(gray, w, h, Math.max(1, Math.round(r / 2)));
  const b = blur(gray, w, h, Math.max(2, Math.round(r * 2.5)));
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, a[i] - b[i]);
  return out;
}

const KEY = new Set(['notable', 'keystone', 'wormhole']);

function score(map, w, h, pts, s, tx, ty, minIn) {
  let sum = 0, n = 0;
  for (const p of pts) {
    const x = Math.round(p.x * s + tx), y = Math.round(p.y * s + ty);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    sum += map[y * w + x]; n++;
  }
  return n >= minIn ? sum / n : -1;
}

/** Bright spots in a small map: local maxima of a difference of blurs, the brightest first. */
function peaks(map, w, h, max) {
  const a = blur(map, w, h, 1), b = blur(map, w, h, 4);
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = a[i] - b[i];
  const out = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const v = d[y * w + x];
    if (v <= 4) continue;
    let top = true;
    for (let dy = -1; dy <= 1 && top; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && d[(y + dy) * w + x + dx] > v) { top = false; break; }
    if (top) out.push({ x, y, v });
  }
  out.sort((p, q) => q.v - p.v);
  return out.slice(0, max);
}

/**
 * The scale and offset (screen = tree × s + t) that fit the screenshot best. Every bright spot votes, for every node,
 * for the offset that would put that node on it (per scale); the right scale and offset get far the most votes.
 * Then a finer search on the full-size screenshot.
 */
function locate(img, tree) {
  const W = img.width, H = img.height;
  const gray = luma(img);
  const nodes = [...tree.nodes.values()].filter((n) => n.kind !== 'mastery');
  const [x0, y0, x1, y1] = extent(nodes);
  const f = Math.max(1, Math.round(Math.max(W, H) / 500));
  const small = shrink(gray, W, H, f);
  const spots = peaks(small.map, small.w, small.h, 700);
  if (spots.length < 30) return null;
  const treeW = x1 - x0;
  let best = { votes: 0 };
  // the tree from a quarter of the screenshot wide to three screenshots wide
  for (let s = (small.w * 0.25) / treeW; s <= (small.w * 3) / treeW; s *= 1.012) {
    // offsets that keep some of the tree on screen; 1 px bins
    const ox = -(Math.floor(-x1 * s) - 2), oy = -(Math.floor(-y1 * s) - 2); // bin = offset + o
    const aw = Math.ceil(small.w - x0 * s) + ox + 3, ah = Math.ceil(small.h - y0 * s) + oy + 3;
    const acc = new Uint16Array(aw * ah);
    for (const n of nodes) {
      const nx = n.x * s - ox, ny = n.y * s - oy;
      for (const q of spots) {
        const tx = Math.round(q.x - nx), ty = Math.round(q.y - ny);
        if (tx >= 0 && ty >= 0 && tx < aw && ty < ah) acc[ty * aw + tx]++;
      }
    }
    for (let y = 1; y < ah - 1; y++) for (let x = 1; x < aw - 1; x++) {
      const i = y * aw + x;
      if (acc[i] < 8) continue;
      const v = acc[i] + (acc[i - 1] + acc[i + 1] + acc[i - aw] + acc[i + aw]) / 2;
      if (v > best.votes) best = { votes: v, s: s * f, tx: (x - ox) * f, ty: (y - oy) * f };
    }
  }
  if (!best.s) return null;
  const fine = spotMap(gray, W, H, Math.max(2, 55 * best.s));
  let cur = { ...best, v: score(fine, W, H, nodes, best.s, best.tx, best.ty, 20) };
  for (const [ds, dt] of [[0.006, 2 * f], [0.003, f], [0.0015, 1]]) {
    const start = cur;
    for (let k = -3; k <= 3; k++) {
      const s = start.s * (1 + k * ds);
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        const tx = start.tx + dx * dt, ty = start.ty + dy * dt;
        const v = score(fine, W, H, nodes, s, tx, ty, 20);
        if (v > cur.v) cur = { v, s, tx, ty };
      }
    }
  }
  return { s: cur.s, tx: cur.tx, ty: cur.ty, fit: cur.v, votes: best.votes };
}

function extent(nodes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  return [x0, y0, x1, y1];
}

/** the game's "allocated" frame colour: pale blue, bright */
function isAllocBlue(r, g, b) {
  return b >= 185 && g >= 140 && b - r >= 55 && b - g <= 75;
}

/** Share of allocated-blue pixels on the node's frame (a ring around its centre). */
function blueShare(img, x, y, rIn, rOut, bgra) {
  const { width: W, height: H, data } = img;
  const step = data.length / (W * H);
  let blue = 0, all = 0;
  const R = Math.ceil(rOut);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy);
    if (d < rIn || d > rOut) continue;
    const px = Math.round(x + dx), py = Math.round(y + dy);
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const p = (py * W + px) * step;
    const r = bgra ? data[p + 2] : data[p], g = data[p + 1], b = bgra ? data[p] : data[p + 2];
    all++;
    if (isAllocBlue(r, g, b)) blue++;
  }
  return all ? blue / all : null;
}

const FRAME = { normal: [0.55, 1.15], notable: [0.7, 1.35], keystone: [0.75, 1.4], wormhole: [0.7, 1.35] };
const SIZE = { normal: 34, notable: 50, keystone: 62, wormhole: 50 }; // frame radius in tree units, about

/**
 * One screenshot → { seen: Set(id), visible: Set(id), fit, transform, share } or null when no tree was found.
 * seen: the allocated nodes read; visible: the nodes on the screenshot.
 */
function readAtlasShot(img, tree, { bgra = false, threshold = 0.065 } = {}) {
  const t = locate(img, tree);
  if (!t || t.fit < 2) return null;
  const share = new Map();
  for (const n of tree.nodes.values()) {
    if (n.kind === 'mastery') continue;
    const x = n.x * t.s + t.tx, y = n.y * t.s + t.ty;
    const R = (SIZE[n.kind] || 34) * t.s;
    if (x < R || y < R || x >= img.width - R || y >= img.height - R) continue;
    const [a, b] = FRAME[n.kind] || FRAME.normal;
    const v = blueShare(img, x, y, Math.max(1, R * a), Math.max(2, R * b), bgra);
    if (v != null) share.set(n.id, v);
  }
  const seen = new Set([...share].filter(([, v]) => v >= threshold).map(([id]) => id));
  // a node between two allocated ones, read just under the bar, is allocated too (a path can't skip it)
  const adj = adjacencyOf(tree);
  for (const [id, v] of share) {
    if (seen.has(id) || v < threshold / 3) continue;
    if ((adj.get(id) || []).filter((o) => seen.has(o)).length >= 2) seen.add(id);
  }
  return { seen, visible: new Set(share.keys()), fit: Math.round(t.fit * 10) / 10, transform: t, share };
}

function adjacencyOf(tree) {
  const adj = new Map();
  for (const [a, b] of tree.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  return adj;
}

/**
 * Several screenshots (zoomed in, each showing part of the tree) → the allocated nodes [id…].
 * Kept: what is joined to the start through allocated nodes. A path that runs off every screenshot can't be
 * followed, so allocated nodes next to a node no screenshot shows are kept too.
 */
function joinReads(tree, reads) {
  const seen = new Set(), visible = new Set();
  for (const r of reads) { for (const id of r.seen) seen.add(id); for (const id of r.visible) visible.add(id); }
  const adj = adjacencyOf(tree);
  const keep = new Set();
  const queue = [];
  const take = (id) => { if (!keep.has(id)) { keep.add(id); queue.push(id); } };
  take(tree.start);
  for (const id of seen) if ((adj.get(id) || []).some((o) => !visible.has(o) && tree.nodes.get(o)?.kind !== 'mastery')) take(id);
  while (queue.length) {
    const id = queue.pop();
    for (const o of adj.get(id) || []) if (seen.has(o)) take(o);
  }
  keep.delete(tree.start);
  return [...keep];
}

module.exports = { readAtlasShot, joinReads, locate, isAllocBlue };
