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
