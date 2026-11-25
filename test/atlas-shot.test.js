'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Shot = require('../src/core/atlas-shot');

// a made-up tree (no game data in the repo): nodes scattered over 14000 × 14000 units, each joined to the nearest
// earlier one; and a screenshot of it drawn here: gold rings, the taken ones pale blue
function fakeTree() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const nodes = new Map();
  const edges = [];
  for (let id = 1; id <= 400; id++) {
    const n = { id, x: Math.round(rnd() * 14000 - 7000), y: Math.round(rnd() * 14000 - 14000), kind: id % 5 === 0 ? 'notable' : 'normal' };
    if (id === 1) { n.x = 0; n.y = -7000; }
    let near = null;
    for (const o of nodes.values()) if (!near || Math.hypot(o.x - n.x, o.y - n.y) < Math.hypot(near.x - n.x, near.y - n.y)) near = o;
    // keep nodes apart, like the real tree
    if (near && Math.hypot(near.x - n.x, near.y - n.y) < 260) continue;
    nodes.set(id, n);
    if (near) edges.push([near.id, id]);
  }
  return { nodes, edges, start: 1, points: 150 };
}

function draw(tree, taken, { w = 1100, h = 1100, s = 0.075, tx = 560, ty = 1080 } = {}) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = 14; data[i * 4 + 1] = 16; data[i * 4 + 2] = 22; data[i * 4 + 3] = 255; }
  for (const n of tree.nodes.values()) {
    const cx = n.x * s + tx, cy = n.y * s + ty;
    const R = (n.kind === 'notable' ? 50 : 34) * s;
    const col = taken.has(n.id) ? [150, 195, 240] : [150, 128, 92];
    for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d > R * 0.7 && d < R * 1.1) { const p = (y * w + x) * 4; data[p] = col[0]; data[p + 1] = col[1]; data[p + 2] = col[2]; }
    }
  }
  return { width: w, height: h, data };
}

test('atlas screenshot: the taken passives are read back', () => {
  const tree = fakeTree();
  // taken: a walk from the start
  const adj = new Map();
  for (const [a, b] of tree.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const taken = new Set([1]);
  const queue = [1];
  while (queue.length && taken.size < 40) { const id = queue.shift(); for (const o of adj.get(id) || []) if (!taken.has(o) && taken.size < 40) { taken.add(o); queue.push(o); } }
  const r = Shot.readAtlasShot(draw(tree, taken), tree);
  assert.ok(r, 'the tree is found');
  const got = Shot.joinReads(tree, [r]).sort((a, b) => a - b);
  const want = [...taken].filter((id) => id !== 1).sort((a, b) => a - b);
  assert.deepEqual(got, want);
});

test('atlas screenshot: a picture without the tree is refused', () => {
  const tree = fakeTree();
  const w = 400, h = 300;
  const data = new Uint8Array(w * h * 4).fill(30);
  assert.equal(Shot.readAtlasShot({ width: w, height: h, data }, tree), null);
});
