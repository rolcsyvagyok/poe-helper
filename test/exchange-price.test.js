'use strict';
// Prices from the bulk exchange for currency poe.ninja doesn't price yet (Originator's Exalted Orb on patch day).
const test = require('node:test');
const assert = require('node:assert/strict');
const PF = require('../src/core/price-filters');
const { NetWorthTracker } = require('../src/core/networth');

test('the fair price is the 3rd cheapest online seller; joke listings and offline sellers don\'t set it', () => {
  const rows = { chaos: [
    { each: 1, status: 'online' }, { each: 2, status: 'online' }, { each: 40, status: 'offline' }, { each: 55, status: 'online' }, { each: 60, status: 'afk' }, { each: 70, status: 'online', mine: true },
  ], divine: [{ each: 0.25, status: 'online' }] };
  // online/afk: 1, 2, 50 (0.25 div at 200), 55, 60 -> 3rd is 50
  assert.deepEqual(PF.exchangeEstimate(rows, 200), { chaos: 50, sellers: 5 });
  assert.deepEqual(PF.exchangeEstimate(rows, null), { chaos: 55, sellers: 4 });
  assert.equal(PF.exchangeEstimate({ chaos: [{ each: 5, status: 'online' }, { each: 6, status: 'online' }], divine: [] }), null);
});

test('a snapshot prices currency poe.ninja doesn\'t list with the exchange price it is given', async () => {
  const store = new Map([['selectedTabs', [0]], ['selectedTabIds', ['a']]]);
  const items = [
    { typeLine: "Originator's Exalted Orb", stackSize: 2, frameType: 5 },
    { typeLine: 'Chaos Orb', stackSize: 10, frameType: 5 },
    { typeLine: 'Transmutation Shard', stackSize: 20, frameType: 5 },
  ];
  const asked = [];
  const t = new NetWorthTracker({
    store: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
    getLeague: async () => 'L',
    ggg: { stashTabs: async () => [{ id: 'a', index: 0, name: 'Main' }], stashTabItems: async () => items },
    ninja: { category: async (l, c) => (c === 'Currency' ? [{ name: 'Chaos Orb', chaos: 1 }, { name: 'Orb of Transmutation', chaos: 0.2 }] : []), divinePrice: async () => 200 },
    extraPrices: async (names) => { asked.push(...names); return new Map([["Originator's Exalted Orb", 30]]); },
  });
  const snap = await t.takeSnapshot();
  assert.deepEqual(asked, ["Originator's Exalted Orb"]); // the shard is priced from its orb, not asked
  assert.equal(snap.totalChaos, 60 + 10 + Math.round(0.2));
  assert.ok(snap.items.some((i) => i.n === "Originator's Exalted Orb" && i.e === 30));
});
