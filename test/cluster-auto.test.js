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
