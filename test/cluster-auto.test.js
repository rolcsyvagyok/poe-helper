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
