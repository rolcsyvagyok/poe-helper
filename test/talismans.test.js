'use strict';
const test = require('node:test');
const assert = require('node:assert');
const tal = require('../src/core/talismans');

test('talisman bases are read from the filter', () => {
  assert.deepStrictEqual(tal.talismanBases('BaseType == "Flame Hellion Talisman" "Onyx Amulet" "Rhex Talisman"'), ['Flame Hellion Talisman', 'Rhex Talisman']);
});

test('talisman tiers become rules; hide the rest hides every unpicked one', () => {
  const r = tal.talismanRules({ 'Flame Hellion Talisman': 'top', 'Rhex Talisman': 'hide' }, { rest: true, all: ['Flame Hellion Talisman', 'Rhex Talisman', 'Ape Talisman'], looks: { t1: { fontSize: 45 } } });
  const top = r.find((x) => x.id === 'talisman-top');
  const hide = r.find((x) => x.id === 'talisman-hide');
  assert.strictEqual(top.style.fontSize, 45);
  assert.deepStrictEqual(hide.conditions[1].values, ['Ape Talisman', 'Rhex Talisman']);
  assert.ok(hide.conditions[0].values.every((v) => v !== 'Unique'));
});
