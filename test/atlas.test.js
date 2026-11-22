'use strict';
// Atlas tree links (pathofexile.com, WealthyExile, poeplanner, hypostasis.faith) and what a tree does.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const A = require('../src/core/atlas');

const tree = A.buildTree(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'atlas-3.30.json.gz')))));
const name = (id) => tree.nodes.get(id).name;

test('node positions follow the groups and orbits (checked against a viewer)', () => {
  assert.equal(tree.nodes.size, 1116);
  assert.equal(tree.start, 29045);
  for (const [id, x, y] of [[63753, -6868, -6725], [51082, -5931, -9422], [2585, 43, -5735], [8146, 1933, -5881], [33916, 6282, -5528], [42908, -3785, -10552]]) {
    const n = tree.nodes.get(id);
    assert.ok(Math.abs(n.x - x) < 2 && Math.abs(n.y - y) < 2, `${n.name} at ${n.x},${n.y}`);
  }
});

test('a WealthyExile / pathofexile.com link: nodes and the multiple-choice node', () => {
  const link = 'https://wealthyexile.com/atlas/AAAABgAAdAaGB1AH-wi3CUoM7xFXF8sZdhtqH2YfxCABJEMkYiVqKFEpEilOKyAr1yv4LosvTC9PMiQy9zPkNAw0vjZ3Nrg-Oj6IRj5I0krCTCFM_lGCUklSolOvW0tb2WEyY7Vj2mmUax1xoHIvcxhzpXUneVp7In0phxiH-oloiWyPmJCGk3KU9JVEl3-a1p1enpOkrKoPqsKvwbcCt8y4crh2uHm6KbrlwLrBpsO5xMbGDMYzyQnJqtCi0STYntxF3_vgwOJl4n_lj-ZU6BfsjOzG7OXxYfHl8fDyTfVM9eL3AvdP-rL85_3w_skAAYzrG2o?v=3.30';
  const r = A.parseLink(link, tree);
  assert.equal(r.nodes.length, 116);
  assert.equal(r.from, 'wealthyexile.com');
  assert.equal(name(r.nodes[0]), "Fortune's Favour");
  assert.deepEqual(r.choices, { 7018: 1 }); // Hunting Grounds: The Wilds
  const e = A.effects(tree, r.nodes, r.choices);
  assert.deepEqual(e.categories.slice(0, 4).map((c) => c.name), ['Mercenaries', 'Settlers', 'Bestiary', 'Threads']);
  assert.deepEqual(e.categories.find((c) => c.name === 'Threads').keystones, ['Unwavering Vision']);
  const beasts = e.categories.find((c) => c.name === 'Bestiary').lines.map((l) => l.text);
  assert.ok(beasts.includes('Red Beasts in your Maps have 100% increased chance to be from The Wilds'));
  assert.ok(beasts.includes('Your Maps that contain capturable Beasts contain an additional Red Beast from The Wilds'));
  // and back: the same code
  const again = A.parseLink('https://www.pathofexile.com/fullscreen-atlas-skill-tree/' + A.encodeOfficial(r.nodes, r.choices, tree), tree);
  assert.deepEqual(again.nodes, r.nodes);
  assert.deepEqual(again.choices, r.choices);
});

test('a hypostasis.faith short link, with its checksum; a broken one is refused', () => {
  const code = 'qrmXAv4r4tzGXlcXtlRxmi_Xj9_rZ29b_70CSbHFCTOFS3hD-';
  const r = A.parseLink(`https://hypostasis.faith/atlas/data.html#t=${code}`, tree);
  assert.equal(r.nodes.length, 149);
  assert.deepEqual(r.choices, { 12887: 3, 28029: 1 });
  assert.equal(A.encodeHypostasis(r.nodes, r.choices, tree), code);
  assert.throws(() => A.parseLink('https://hypostasis.faith/atlas/data.html#t=qrmX' + code.slice(5), tree), /another version|cut short/);
  // the long form
  assert.deepEqual(A.parseLink('https://hypostasis.faith/atlas/data.html#s=57739,23769,12887:3', tree).choices, { 12887: 3 });
});

test('a poeplanner link (its own format)', () => {
  // format 5, tree version 30, not PoE 2, 3 nodes, then empty notes
  const b = Buffer.from([0, 5, 0, 30, 0, 0, 3, 0xe1, 0xcb, 0x5c, 0xd9, 0x0a, 0x19, 0, 0]);
  const code = b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = A.parseLink(`https://poeplanner.com/atlas-tree/${code}`, tree);
  assert.deepEqual(r.nodes, [57803, 23769, 2585].filter((id) => tree.nodes.has(id)));
  assert.equal(r.from, 'poeplanner.com');
});

test('not a tree link: a short message', () => {
  assert.throws(() => A.parseLink('https://poe.ninja/builds', tree), /isn't an atlas tree link/);
  assert.throws(() => A.parseLink('', tree), /Paste/);
});

test('effects add up like lines and keep different ones apart', () => {
  assert.deepEqual(A.sumLines(['2% increased effect of Explicit Modifiers on your Maps', '2% increased effect of Explicit Modifiers on your Maps', 'Your Maps have +3% chance to contain a Trial', 'Your Maps have +3% chance to contain a Trial']).map((l) => l.text),
    ['4% increased effect of Explicit Modifiers on your Maps', 'Your Maps have +6% chance to contain a Trial']);
});

test('nodes get their league mechanic', () => {
  const cat = (n) => [...tree.nodes.values()].find((x) => x.name === n).cat;
  assert.equal(cat('Divide and Conquer'), 'Breach');
  assert.equal(cat('Hunting Grounds'), 'Bestiary');
  assert.equal(cat('Unwavering Vision'), 'Threads');
  assert.equal(cat('Speaker of the Dead'), 'Torment');
  const d = A.drawData(tree);
  assert.ok(d.edges.some((e) => e.arc));
  assert.ok(!d.edges.some((e) => tree.nodes.get(e.a).kind === 'wormhole' && tree.nodes.get(e.b).kind === 'wormhole'));
});

test('a tree made by hand keeps only passives linked to the start', () => {
  const near = tree.nodes.get(57739); // next to the start
  assert.ok(A.connectedNodes(tree, [57739]).includes(57739), near.name);
  // a passive far away with no path is dropped; masteries are never taken
  const far = [...tree.nodes.values()].find((n) => n.kind === 'keystone').id;
  const mastery = [...tree.nodes.values()].find((n) => n.kind === 'mastery').id;
  assert.deepEqual(A.connectedNodes(tree, [57739, far, mastery]), [57739]);
  // a whole imported tree stays as it is
  const r = A.parseLink('https://hypostasis.faith/atlas/data.html#t=qrmXAv4r4tzGXlcXtlRxmi_Xj9_rZ29b_70CSbHFCTOFS3hD-', tree);
  assert.equal(A.connectedNodes(tree, r.nodes).length, 149);
});

test('a poeatlasplanner.com link, with its multiple-choice picks', () => {
  const r = A.parseLink('https://poeatlasplanner.com/#p=AgYzLjMwLjAJMy4zMC4wLXIxlgGWAc4BuAvKAasBzwKJC5AB9wrxBZ8KigHnAYsCXj3CCB-IAucF7wSXAiGLCAvpBe0B2gG9BdYBowIakQKbByXDAjOSAaUC8wKqAZUF7gOmAYIC7gE9ogLdAY0E9wQ_iAFZ1RjCB6EC7gchuQKzAcgCpAP8BOMEjwH2Ap0GXbsEaccCiQQhmA4w1AMJbbQCKMYC0AwcsgHsBacB2wFQ4ANb1waIBSmMAq8H6gSwAYsT2gHyBdMDgQZFpgEEA-wECjv8DJMEjQK4AtIBugEzzAKZD4IBlQflB-YIO90BhwLCBhookAE5nAKDAogFuwG6Bzof_AjVAk7eBdUBS02pAroELIkE4gEnAyTKTD7fiAFKgl0', tree);
  assert.equal(r.from, 'poeatlasplanner.com');
  assert.equal(r.nodes.length, 150);
  assert.equal(A.connectedNodes(tree, r.nodes).length, 150);
  // Trarthan Policy: Intelligence aligned; Malignant Modifiers: suffixes; House Supremacy: Duelist
  assert.deepEqual(r.choices, { 16487: 2, 28477: 1, 33916: 1 });
  assert.throws(() => A.parseLink('https://poeatlasplanner.com/#p=AgYz', tree), /poeatlasplanner/);
});
