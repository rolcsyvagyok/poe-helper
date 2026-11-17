'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { piecesByName, buildBeastRegex } = require('../src/core/regex/beasts');

test('every beast piece finds that beast and no other', () => {
  const p = piecesByName();
  const names = [...p.keys()];
  for (const [name, piece] of p) {
    const re = new RegExp(piece, 'i');
    assert.deepStrictEqual(names.filter((n) => re.test(n)), [name], `${name}: ${piece}`);
  }
});

test('beast search: price limit, hand picks and 250-character strings', () => {
  const prices = [{ name: 'Fenumal Plagued Arachnid', chaos: 160, listingCount: 40 }, { name: 'Farrul, First of the Plains', chaos: 30, listingCount: 3 }, { name: 'Vivid Vulture', chaos: 45, listingCount: 80 }];
  let r = buildBeastRegex({ minChaos: 10 }, prices);
  assert.deepStrictEqual(r.chosen, ['Fenumal Plagued Arachnid', 'Vivid Vulture']); // Farrul has too few listings
  r = buildBeastRegex({ minChaos: 200, pick: ['Goatman'], skip: ['Fenumal Plagued Arachnid'] }, prices);
  assert.deepStrictEqual(r.chosen, ['Goatman']);
  assert.match(r.strings[0].text, /\^goatman\$/);
  r = buildBeastRegex({ minChaos: null }, prices);
  assert.ok(r.strings.length > 1 && r.strings.every((s) => s.text.length <= 250));
  assert.strictEqual(r.strings.reduce((a, s) => a + s.count, 0), r.count);
});

test('no beast piece matches a beast mod (the Bestiary search matches mods too)', () => {
  const b = require('../src/core/regex/beasts');
  const mods = require('../src/core/regex/beasts.json').modNoise.map((m) => m.toLowerCase());
  for (const [name, piece] of b.piecesByName()) {
    const p = piece.replace(/^\^|\$$/g, '');
    const hit = mods.find((m) => (piece.startsWith('^') && piece.endsWith('$') ? m === p : piece.startsWith('^') ? m.startsWith(p) : piece.endsWith('$') ? m.endsWith(p) : m.includes(p)));
    assert.ok(!hit, `${name}: "${piece}" matches the mod "${hit}"`);
  }
  assert.strictEqual(b.piecesByName().get('Fenumal Plagued Arachnid') === 'l p', false);
});

test('no beast piece can turn up in a rare beast\'s own name (Gristlebite the Hulking)', () => {
  const b = require('../src/core/regex/beasts');
  for (const [name, piece] of b.piecesByName()) {
    if (/^\^.*\$$/.test(piece)) continue;
    assert.ok(!b.inRareName(piece), `${name}: "${piece}"`);
  }
  assert.ok(!'gristlebite the hulking'.includes(b.piecesByName().get('Wild Bristle Matron')));
});
