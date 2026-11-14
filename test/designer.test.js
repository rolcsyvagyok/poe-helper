'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('every theme is full size and solid; only colours differ', () => {
  const D = require('../src/core/filter/designer');
  const themes = [...D.PRESETS, D.randomTheme(() => 0.42)];
  for (const t of themes) for (const [lv, st] of Object.entries(t.levels)) {
    assert.equal(st.fontSize, 45, `${t.id} ${lv}`);
    for (const k of ['text', 'border', 'background']) if (st[k]) assert.equal(st[k][3], 255, `${t.id} ${lv} ${k}`);
  }
  assert.deepEqual(D.fullLook({ fontSize: 30, text: [1, 2, 3, 120], background: [0, 0, 0, 170] }), { fontSize: 45, text: [1, 2, 3, 255], background: [0, 0, 0, 255] });
});

test('stacked currency takes only the design colours', () => {
  const D = require('../src/core/filter/designer');
  const view = { types: [{ type: 'currency->stackedthree', tiers: [{ key: 'currency->stackedthree|t3', tier: 't3', conditions: ['StackSize >= 3', 'Class == "Stackable Currency"'], style: { fontSize: 40, text: [0, 0, 0, 255], sound: { id: 2, volume: 300 }, beam: { color: 'Yellow' } } }] }] };
  const styles = {};
  assert.equal(D.stackedColours(view, styles, { 3: { fontSize: 45, text: [1, 2, 3, 200], background: [9, 9, 9, 100], beam: { color: 'Red' } } }), 1);
  assert.deepEqual(styles['currency->stackedthree|t3'], { fontSize: 40, text: [1, 2, 3, 255], background: [9, 9, 9, 255], sound: { id: 2, volume: 300 }, beam: { color: 'Yellow' } });
});

test('items drawn in a tier colour of the filter take that tier colour from the design', () => {
  const D = require('../src/core/filter/designer');
  const orange = { text: [255, 255, 255, 255], border: [255, 255, 255, 255], background: [240, 90, 35, 255] };
  const tiers = ['t2a', 't2b', 't2c'].map((tier) => ({ key: `currency|${tier}`, tier, action: 'Show', style: orange, conditions: [] }));
  const odd = { key: 'currency|special', tier: 'special', action: 'Show', special: true, style: { ...orange, background: [238, 92, 30, 255], fontSize: 40, sound: { id: 3, volume: 300 } }, conditions: ['StackSize >= 2'] };
  const other = { key: 'currency|other', tier: 'other', action: 'Show', style: { text: [0, 240, 190, 255] }, conditions: [] };
  const view = { types: [{ type: 'currency', tiers: [...tiers, odd, other] }] };
  const styles = {};
  assert.equal(D.paletteColours(view, styles, { 2: { text: [1, 1, 1, 255], border: [2, 2, 2, 255], background: [3, 3, 3, 255] } }), 1);
  assert.deepEqual(styles['currency|special'], { text: [1, 1, 1, 255], border: [2, 2, 2, 255], background: [3, 3, 3, 255], fontSize: 40, sound: { id: 3, volume: 300 } });
  assert.equal(styles['currency|other'], undefined);
});
