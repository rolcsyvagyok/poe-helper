'use strict';
// The Loot filter chat: set phrases -> tier changes (no AI here; Claude only writes these phrases).
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core/filter/chat');

const tier = (type, tier, bases, extra = {}) => ({ type, tier, key: `${type}|${tier}`, bases, hasBaseList: true, state: 'Show', ...extra });
const VIEW = { types: [
  { type: 'currency', label: 'Currency', tiers: [tier('currency', 't1exalted', ['Divine Orb']), tier('currency', 't4chaos', ['Chaos Orb', 'Stacked Deck']), tier('currency', 'twisdom', ['Scroll of Wisdom'])] },
  { type: 'currency->stackedthree', label: 'Currency: Small stacks', tiers: [tier('currency->stackedthree', 't2', ['Stacked Deck'], { special: true, stackSize: { op: '>=', value: 3 } })] },
  { type: 'uniques', label: 'Uniques', tiers: [tier('uniques', 't1', ['Heavy Belt'])] },
] };
const run = (q, o) => C.resolve(C.read(q), VIEW, o);

test('chat: a new tier for an item, from loose wording and plurals', () => {
  const r = run('Seperate Stacked Decks into a new category in this filter');
  assert.deepEqual([r.op, r.type, r.bases, r.name, r.copyFrom], ['newTier', 'currency', ['Stacked Deck'], 'Stacked Deck', 't4chaos']);
  assert.match(r.note, /Small stacks/);
  assert.equal(run('give Divine Orbs their own tier called Divines').name, 'Divines');
});

test('chat: moves, hides, tiers and stack sizes', () => {
  assert.deepEqual((({ op, to }) => [op, to])(run('move Chaos Orb to tier 1')), ['move', 't1exalted']);
  assert.equal(run('move Chaos Orb to t4').to, 't4chaos');
  const h = run('hide stacked decks');
  assert.equal(h.op, 'hideAll');
  assert.deepEqual(h.moves.map((m) => m.type), ['currency', 'currency->stackedthree']);
  assert.equal(run('show stacked deck').op, 'unmove');
  assert.deepEqual((({ op, key, size }) => [op, key, size])(run('set the stack size of tier 2 in small stacks to 5')), ['stack', 'currency->stackedthree|t2', 5]);
  assert.equal(run('turn off tier 2 in small stacks').action, 'Off');
  assert.match(run('move Chaos Orb to tier 9').reply, /no tier/);
  assert.match(run('hide Banana').reply, /can't find/);
  assert.match(run('rename tier 2 in small stacks to X').reply, /Only tiers you made/);
  assert.equal(C.read('do something clever').kind, 'unknown');
});

test('chat: a unique is found by its base', () => {
  const r = run('move Mageblood to tier 1', { uniques: new Map([['mageblood', 'Heavy Belt']]) });
  assert.deepEqual([r.type, r.bases], ['uniques', ['Heavy Belt']]);
  assert.match(r.note, /tiered by base/);
});

test('chat: answers (shown? how does it look?) and empty new tiers', () => {
  const v = run('is stacked deck visible?');
  assert.match(v.reply, /^Stacked Deck: shown/);
  assert.match(v.reply, /stacks of 3\+/);
  const l = run('how does Stacked Deck look');
  assert.equal(l.looks.length, 2);
  assert.equal(run('make scroll of wisdom visible').op, 'unmove');
  const e = run('make a new tier called Decks in Currency');
  assert.deepEqual([e.op, e.type, e.bases, e.name, e.copyFrom], ['newTier', 'currency', [], 'Decks', 't1exalted']);
  // an empty tier you made can take items
  const m = C.resolve(C.read('move stacked deck to decks'), VIEW, { newTiers: [{ type: 'currency', tier: 'poehelper-decks', name: 'Decks' }] });
  assert.deepEqual([m.op, m.to], ['move', 'poehelper-decks']);
});

test('chat: looks', () => {
  // an item sharing its tier gets its own tier, so the rest keep their look
  const r = run('make stacked deck red');
  assert.equal(r.op, 'styleNew');
  assert.deepEqual([r.style.background, r.style.text], [[255, 0, 0, 255], [255, 255, 255, 255]]);
  // a whole tier
  const t = run('set the border of tier 2 in small stacks to 255 128 0');
  assert.deepEqual([t.op, t.key, t.style.border], ['style', 'currency->stackedthree|t2', [255, 128, 0, 255]]);
  assert.deepEqual(run('give divine orb a blue beam').style.beam, { color: 'Blue' });
  assert.equal(run('give divine orb a blue beam').op, 'style'); // alone in its tier
  assert.deepEqual(run('give divine orb a big cyan star icon').style.icon, { size: 0, color: 'Cyan', shape: 'Star' });
  assert.deepEqual(run('give divine orb sound 6').style.sound, { id: 6, volume: 300 });
  assert.equal(run('set the font size of divine orb to 40').style.fontSize, 40);
  assert.ok(!('beam' in run('remove the beam from divine orb').style));
  assert.match(run('give divine orb a mauve beam').reply, /don't know the colour/);
});
