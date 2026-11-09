'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { whereInFilter } = require('../src/core/filter/where');

const FILE = [
  '#### POE-HELPER START — generated now',          // 1
  'Show # My bases: Silk Gloves, ilvl 84+',          // 2
  '\tBaseType == "Silk Gloves"',                     // 3
  'Show # Base ranks: rares, rank D',                // 4
  '\tRarity Rare',                                   // 5
  'Show # Highlight rare Vaal Regalia',              // 6
  '\tBaseType == "Vaal Regalia"',                    // 7
  '#### POE-HELPER END',                             // 8
  '# [[0600]] IDENTIFIED MOD FILTERING',             // 9
  '#   [0609] Gloves',                               // 10
  'Show # %H3 $type->rare->gloves $tier->idmod',      // 11
  '\tRarity Rare',                                   // 12
  'Show # $type->currency $tier->t1',                // 13
  '\tBaseType == "Mirror of Kalandra"',              // 14
].join('\n');

test('where in the filter: PoE Helper\'s own pages, your rules, FilterBlade tiers, else the section of the file', () => {
  const at = (line, comment, label) => whereInFilter(FILE, { line, comment }, label);
  assert.deepStrictEqual(at(2, 'My bases: Silk Gloves, ilvl 84+'), { text: 'My bases: Silk Gloves, ilvl 84+', goto: { page: 'filters', special: 'mybases' } });
  assert.deepStrictEqual(at(4, 'Base ranks: rares, rank D'), { text: 'Base ranks: rares, rank D', goto: { page: 'filters', special: 'basematrix' } });
  assert.deepStrictEqual(at(6, 'Highlight rare Vaal Regalia'), { text: 'your rule "Highlight rare Vaal Regalia"', goto: null });
  // a tier the tier view doesn't know: the section it is in
  assert.deepStrictEqual(at(11, '%H3 $type->rare->gloves $tier->idmod'), { text: 'Identified Mod Filtering › Gloves', goto: null });
  const r = at(13, '$type->currency $tier->t1', (type, tier) => (type === 'currency' ? { category: 'Currency', key: `currency|${tier}` } : null));
  assert.deepStrictEqual(r, { text: 'Currency', tier: { type: 'currency', tier: 't1', name: null }, goto: { page: 'filters', type: 'currency', key: 'currency|t1' } });
  assert.strictEqual(whereInFilter(FILE, { line: null }), null);
});
