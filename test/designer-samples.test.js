'use strict';
// The Tier designer's preview shows real items from your currency tiers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sampleItems } = require('../src/core/filter/designer');

const view = (tiers) => ({ types: [{ type: 'currency', tiers: tiers.map(([tier, bases, customName]) => ({ tier, bases, ...(customName ? { customName } : {}) })) }] });

test('each tier shows its best-known item, and moves follow', () => {
  const s = sampleItems(view([['poehelper-giga', ['Mirror Shard', 'Mirror of Kalandra'], 'Giga'], ['t1exalted', ['Awakener\'s Orb', 'Divine Orb']], ['t2divine', ['Fertile Catalyst']], ['t3annul', ['Orb of Annulment']], ['t4chaos', ['Ancient Orb']], ['t5alchemy', ['Chaos Orb', 'Orb of Scouring']], ['t6chrom', ['Orb of Alteration']]]));
  assert.deepEqual(s, { giga: 'Mirror of Kalandra', 1: 'Divine Orb', 2: 'Fertile Catalyst', 3: 'Orb of Annulment', 4: 'Ancient Orb', 5: 'Chaos Orb', 6: 'Orb of Alteration' });
});

test('an empty tier never repeats an item shown elsewhere', () => {
  const s = sampleItems(view([['t1', ['Chaos Orb']], ['t2', []], ['t3', ['Divine Orb']]]));
  assert.equal(s[1], 'Chaos Orb');
  assert.equal(s[3], 'Divine Orb');
  assert.equal(s[2], 'Exalted Orb');
  assert.equal(new Set(Object.values(s)).size, 7);
  assert.deepEqual(Object.keys(sampleItems(null)).sort(), ['1', '2', '3', '4', '5', '6', 'giga']);
});
