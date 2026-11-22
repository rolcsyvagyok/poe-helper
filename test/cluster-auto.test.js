const test = require('node:test');
const assert = require('node:assert');
const cl = require('../src/core/cluster');

test('price rule: top, good, and cheaper ones hidden', () => {
  const p = { 'Large|Attack Damage|8|84': 8, 'Large|Attack Damage|12|84': 300, 'Large|Fire Damage|12|84': 40, 'Large|Cold Damage|12|84': 0 };
  const r = cl.autoCells(p, { top: 200, good: 20, hide: true });
  assert.deepStrictEqual(r, { 'Large|Attack Damage|8|84': 'hide', 'Large|Attack Damage|12|84': 'top', 'Large|Fire Damage|12|84': 'good' });
  assert.ok(!('Large|Attack Damage|8|84' in cl.autoCells(p, { top: 200, good: 20, hide: false })));
});

test('price rule cells become filter rules', () => {
  const rules = cl.clusterRules(cl.autoCells({ 'Large|Attack Damage|8|84': 8 }, { top: 200, good: 20 }));
  assert.ok(rules.some((r) => r.action === 'Hide'));
});

test('price rule: basic look between A tier and hidden', () => {
  const r = cl.autoCells({ a: 300, b: 40, c: 8, d: 2 }, { top: 200, good: 20, basic: 5 });
  assert.deepStrictEqual(r, { a: 'top', b: 'good', c: 'basic', d: 'hide' });
  const rules = cl.clusterRules({ 'Large|Attack Damage|8|84': 'basic' }, { Large: { basic: { fontSize: 30 } } });
  assert.strictEqual(rules[0].action, 'Show');
  assert.strictEqual(rules[0].style.fontSize, 30);
});

test('auto cells don\'t flip around a line: 20% margin, and a missing price keeps the level', () => {
  const { autoCells } = require('../src/core/cluster');
  const o = { top: 50, good: 10, basic: null, hide: true };
  let cells = autoCells({ a: 10, b: 50, c: 30 }, o);
  assert.deepEqual(cells, { a: 'good', b: 'top', c: 'good' });
  // 9c and 45c: just under the lines, they stay
  cells = autoCells({ a: 9, b: 45, c: 30 }, { ...o, prev: cells });
  assert.deepEqual(cells, { a: 'good', b: 'top', c: 'good' });
  // 8c is past the margin (10 / 1.2 = 8.33): it drops; 59c goes up (50 * 1.2 = 60 is the line from good)
  cells = autoCells({ a: 8, b: 30, c: 59 }, { ...o, prev: cells });
  assert.deepEqual(cells, { a: 'hide', b: 'good', c: 'good' });
  cells = autoCells({ a: 11, b: 30, c: 61 }, { ...o, prev: cells });
  assert.deepEqual(cells, { a: 'hide', b: 'good', c: 'top' });
  // no price this time: kept
  cells = autoCells({ b: 30 }, { ...o, prev: cells });
  assert.deepEqual(cells, { a: 'hide', b: 'good', c: 'top' });
});
