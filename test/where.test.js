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

test('currency has six tiers: Tier 7 and lower go into Tier 6, from any FilterBlade download; scrolls stay', () => {
  const { applyTierPatch, tierView } = require('../src/core/filter/tiers');
  const block = (tier, bases, action = 'Show') => [`${action} # $type->currency $tier->${tier}`, '\tClass == "Stackable Currency"', `\tBaseType == ${bases.map((b) => `"${b}"`).join(' ')}`, '\tSetFontSize 40', ''].join('\n');
  const text = [block('t5alchemy', ['Vaal Orb']), block('t6chrom', ['Regal Orb'], 'Hide'), block('t7chance', ['Orb of Chance'], 'Hide'), block('t8trans', ['Orb of Binding', 'Portal Scroll'], 'Hide')].join('\n');
  const v = tierView(text, {});
  const cur = v.types.find((t) => t.type === 'currency');
  const six = cur.tiers.find((x) => x.tier === 't6chrom');
  assert.deepStrictEqual(six.bases.sort(), ['Orb of Binding', 'Orb of Chance', 'Regal Orb']);
  assert.strictEqual(cur.tiers.find((x) => x.tier === 't7chance').folded, true);
  assert.deepStrictEqual(cur.tiers.find((x) => x.tier === 't8trans').bases, ['Portal Scroll']);
  assert.deepStrictEqual(v.moved, {}); // the app's folding isn't shown as your moves
  // your move into Tier 7 lands in Tier 6
  const out = applyTierPatch(text, { moves: { 'currency\tVaal Orb': 't7chance' } });
  const t6 = out.split('\n\n').find((b) => b.includes('$tier->t6chrom'));
  assert.ok(t6.includes('"Vaal Orb"'));
});

test('scrolls: Wisdom, then Portal, each from one scroll up to the biggest stack, then fragments; campaign rules stay out', () => {
  const { scrollTiers } = require('../src/core/filter/scrolls');
  const view = { types: [
    { type: 'currency', tiers: [{ key: 'a', tier: 'twisdom', bases: ['Scroll of Wisdom'], line: 30 }, { key: 'b', tier: 't4chaos', bases: ['Chaos Orb', 'Portal Scroll'], line: 10 }, { key: 'f', tier: 'scrollfragments', bases: ['Scroll Fragment'], line: 90 }, { key: 'p', tier: 't9armour', bases: ['Portal Scroll'], line: 80 }] },
    { type: 'currency->leveling', tiers: [{ key: 'c', tier: 'portal', bases: ['Portal Scroll'], line: 5 }] },
    { type: 'currency->stackedsuppliesportal', tiers: [{ key: 'd', tier: 't2', bases: ['Portal Scroll'], conditions: ['StackSize >= 5'], line: 50 }, { key: 'e', tier: 't1', bases: ['Portal Scroll'], conditions: ['StackSize >= 10'], line: 40 }] },
    { type: 'currency->stackedsupplieswisdom', tiers: [{ key: 'w', tier: 't3', bases: ['Scroll of Wisdom'], conditions: ['StackSize >= 3'], line: 60 }] },
  ] };
  assert.deepStrictEqual(scrollTiers(view).map((x) => x.key), ['a', 'w', 'p', 'd', 'e', 'f']);
});
