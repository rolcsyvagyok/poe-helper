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
  let r = buildBeastRegex({ red: true, harvest: true, minChaos: 10 }, prices);
  assert.deepStrictEqual(r.chosen, ['Fenumal Plagued Arachnid', 'Vivid Vulture']); // Farrul has too few listings
  r = buildBeastRegex({ red: true, harvest: false, minChaos: 10, pick: ['Goatman'], skip: ['Fenumal Plagued Arachnid'] }, prices);
  assert.deepStrictEqual(r.chosen, ['Goatman']);
  assert.match(r.strings[0].text, /\^goatman\$/);
  r = buildBeastRegex({ red: true, yellow: true, minChaos: null }, prices);
  assert.ok(r.strings.length > 1 && r.strings.every((s) => s.text.length <= 250));
  assert.strictEqual(r.strings.reduce((a, s) => a + s.count, 0), r.count);
});
