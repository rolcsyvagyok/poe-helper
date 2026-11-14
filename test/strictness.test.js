'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/core/filter/strictness');
const T = require('../src/core/filter/tiers');
const DATA = require('../src/core/filter/strictness.json');

const KEY = 'gold|stack1'; // shown up to Uber Strict, hidden at Uber Plus Strict
const block = (type, tier) => [`Show # $type->${type} $tier->${tier}`, '\tClass == "Stackable Currency"', '\tBaseType == "Gold"', '\tSetFontSize 40', ''].join('\n');
const text = (level) => `# TYPE:     ${level}-SOMETHING\n\n${block('gold', 'stack1')}`;

test('strictness: reads the level of a FilterBlade download', () => {
  assert.equal(S.levelOf(text(2)), 2);
  assert.equal(S.levelOf('#name:x\nShow'), null);
  assert.equal(S.LEVELS.length, 7);
  assert.equal(DATA.tiers[KEY], 'SSSSSSH');
});

test('strictness: only what changes from your download level is applied, and your changes win', () => {
  assert.deepEqual(S.strictnessActions(text(2), null), {}, 'no strictness picked: the filter as FilterBlade made it');
  assert.equal(S.strictnessActions(text(2), 2)[KEY], undefined, 'same level: nothing changes');
  assert.equal(S.strictnessActions(text(2), 6)[KEY], 'Hide');
  const out = T.applyTierPatch(text(2), S.withStrictness(text(2), {}, 6));
  assert.match(out, /^Hide # \$type->gold \$tier->stack1/m);
  const mine = T.applyTierPatch(text(2), S.withStrictness(text(2), { actions: { [KEY]: 'Show' } }, 6));
  assert.match(mine, /^Show # \$type->gold \$tier->stack1/m);
});

test('folding Tier 7+ into Tier 6 never shows a tier the filter hides', () => {
  const b = (tier, base, action) => [`${action} # $type->currency $tier->${tier}`, '\tClass == "Stackable Currency"', `\tBaseType == "${base}"`, '\tSetFontSize 40', ''].join('\n');
  const src = [b('t6chrom', 'Chromatic Orb', 'Show'), b('t7chance', 'Orb of Chance', 'Show'), b('t8trans', 'Orb of Transmutation', 'Hide')].join('\n');
  const out = T.applyTierPatch(src, {});
  assert.match(out, /t6chrom\n\tClass == "Stackable Currency"\n\tBaseType == "Chromatic Orb" "Orb of Chance"/);
  assert.match(out, /^Hide # \$type->currency \$tier->t8trans\n\tClass == "Stackable Currency"\n\tBaseType == "Orb of Transmutation"/m);
});
