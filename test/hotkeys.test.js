'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/renderer/hotkey');
const { parseItem } = require('../src/core/item-parser');

const ev = (code, mods = {}, key = 'x') => ({ code, key, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: false });

test('key presses become Electron accelerators by physical key', () => {
  assert.deepEqual(H.fromEvent(ev('KeyE', { alt: true })), { accelerator: 'Alt+E' });
  assert.deepEqual(H.fromEvent(ev('KeyD', { ctrl: true, alt: true })), { accelerator: 'Ctrl+Alt+D' });
  assert.deepEqual(H.fromEvent(ev('F2')), { accelerator: 'F2' }, 'F-keys work alone');
  assert.deepEqual(H.fromEvent(ev('Digit3', { alt: true }, '#')), { accelerator: 'Alt+3' }, 'layout-independent');
  assert.equal(H.fromEvent(ev('AltLeft', { alt: true }, 'Alt')).pending, true, 'only a modifier so far');
});

test('unsafe combinations are refused with a reason', () => {
  assert.match(H.fromEvent(ev('KeyE')).error, /Add Ctrl, Alt or Shift/);
  assert.match(H.fromEvent(ev('KeyE', { shift: true })).error, /Shift alone/);
  assert.match(H.fromEvent(ev('KeyC', { ctrl: true })).error, /used by Windows or the game/);
  assert.match(H.fromEvent(ev('F4', { alt: true })).error, /used by Windows/);
  assert.equal(H.validate('Alt+E'), null);
});

test('accelerators normalise and display nicely', () => {
  assert.equal(H.normalize('alt+e'), 'Alt+E');
  assert.equal(H.normalize('Shift+CommandOrControl+d'), 'Ctrl+Shift+D');
  assert.deepEqual(H.parse('Alt+E').mods, ['Alt']);
  assert.equal(H.label('Ctrl+Alt+D'), 'Ctrl + Alt + D');
  assert.equal(H.label(''), 'Off');
});

test('advanced copies (Ctrl+Alt+C) parse to the same mods, with mod names', () => {
  const adv = `Item Class: Rings
Rarity: Rare
Doom Loop
Two-Stone Ring
--------
Item Level: 84
--------
{ Implicit Modifier — Elemental, Cold, Lightning, Resistance }
+14(12-16)% to Cold and Lightning Resistances (implicit)
--------
{ Prefix Modifier "Fecund" (Tier: 2) — Life }
+45(40-49) to maximum Life
{ Suffix Modifier "of the Volcano" (Tier: 4) — Elemental, Fire, Resistance }
+38(36-41)% to Fire Resistance`;
  const it = parseItem(adv);
  assert.deepEqual(it.mods.implicit, ['+14% to Cold and Lightning Resistances']);
  assert.deepEqual(it.mods.explicit, ['+45 to maximum Life', '+38% to Fire Resistance']);
  assert.deepEqual(it.modNames, ['Fecund', 'of the Volcano']);
});
