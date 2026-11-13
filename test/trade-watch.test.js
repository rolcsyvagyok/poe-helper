'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TW = require('../src/core/trade-watch');
const { findTradeState } = require('../src/core/ggg');

test('trade links: normal, live, exchange, and rubbish', () => {
  assert.deepEqual(TW.parseTradeUrl('https://www.pathofexile.com/trade/search/Mercenaries/AbC123'), { kind: 'search', league: 'Mercenaries', id: 'AbC123', live: false });
  assert.deepEqual(TW.parseTradeUrl('pathofexile.com/trade/search/Hardcore%20Mercenaries/Zz9/live'), { kind: 'search', league: 'Hardcore Mercenaries', id: 'Zz9', live: true });
  assert.equal(TW.parseTradeUrl('https://www.pathofexile.com/trade/exchange/Standard/Q1w2').kind, 'exchange');
  assert.equal(TW.parseTradeUrl('https://evil.example/trade/search/Standard/x'), null);
  assert.equal(TW.parseTradeUrl('https://www.pathofexile.com.evil.example/trade/search/Standard/x'), null);
  assert.equal(TW.tradeLink({ kind: 'search', league: 'Hardcore Mercenaries', id: 'Zz9', live: true }), 'https://www.pathofexile.com/trade/search/Hardcore%20Mercenaries/Zz9/live');
});

test('price watch: hits at or under the price, once per listing, divines counted', () => {
  const fetched = { result: [
    { id: 'a', listing: { price: { amount: 1, currency: 'divine' }, account: { name: 'x' } }, item: { name: 'Doom Veil', typeLine: 'Vaal Regalia' } },
    { id: 'b', listing: { price: { amount: 120, currency: 'chaos' } }, item: {} },
    { id: 'c', listing: { price: { amount: 300, currency: 'chaos' } }, item: {} },
  ] };
  const list = TW.listingsOf(fetched, 150);
  const r = TW.priceHits(list, { amount: 150, unit: 'chaos' }, 150, ['b']);
  assert.deepEqual(r.hits.map((x) => x.id), ['a']);
  assert.equal(r.cheapest.id, 'b');
  assert.equal(TW.priceHits(list, { amount: 1, unit: 'divine' }, null).hits.length, 0, 'no divine price: no guessing');
  assert.deepEqual(TW.cheapestFirst({ query: { status: { option: 'online' } }, sort: { price: 'desc' } }), { query: { status: { option: 'online' } }, sort: { price: 'asc' } });
});

test('price watch: due searches and requests a day', () => {
  const now = 1e9;
  const list = [
    { key: 1, watch: true, max: { amount: 5 }, everyMin: 15, lastCheck: now - 16 * 60000 },
    { key: 2, watch: true, max: { amount: 5 }, everyMin: 15, lastCheck: now - 5 * 60000 },
    { key: 3, watch: true, max: null },
    { key: 4, watch: false, max: { amount: 5 } },
    { key: 5, watch: true, max: { amount: 5 }, everyMin: 1 },
  ];
  assert.deepEqual(TW.dueSearches(list, now).map((s) => s.key), [1, 5]);
  assert.equal(TW.requestsPerDay(list), 96 * 2 * 2 + 288 * 2, "15 min: 96 checks, 1 min counts as 5");
});

test('the trade page search state is read from its script', () => {
  const html = '<script>require(["main"],function(){require(["trade"],function(t){t({"tab":"search","state":{"status":{"option":"securable"},"type":"Vaal Regalia","stats":[{"type":"and","filters":[]}]},"loggedIn":false});});});</script>';
  assert.deepEqual(findTradeState(html), { status: { option: 'securable' }, type: 'Vaal Regalia', stats: [{ type: 'and', filters: [] }] });
  assert.equal(findTradeState('<html></html>'), null);
});

test('league: the running challenge league, never Standard or Hardcore, newest first', () => {
  const { pickChallengeLeague } = require('../src/core/ggg');
  const { isChallenge } = require('../src/core/ninja');
  const now = Date.parse('2026-11-13T20:00:00Z');
  const list = [
    { id: 'Standard', startAt: '2013-01-23T21:00:00Z', endAt: null },
    { id: 'Hardcore', startAt: '2013-01-23T21:00:00Z', endAt: null },
    { id: 'Mercenaries', startAt: '2026-07-01T19:00:00Z', endAt: '2026-11-10T21:00:00Z' },
    { id: 'Covens of Umbra', startAt: '2026-11-13T19:00:00Z', endAt: null },
    { id: 'Hardcore Covens of Umbra', startAt: '2026-11-13T19:00:00Z', endAt: null, rules: [{ id: 'Hardcore' }] },
    { id: 'SSF Covens of Umbra', startAt: '2026-11-13T19:00:00Z', endAt: null, rules: [{ id: 'NoParties' }] },
  ];
  assert.equal(pickChallengeLeague(list, now), 'Covens of Umbra');
  assert.equal(pickChallengeLeague(list, Date.parse('2026-11-13T18:00:00Z')), null, 'between leagues: none (the last one ended, the new one not started)');
  assert.equal(isChallenge('Standard'), false);
  assert.equal(isChallenge('HC Covens of Umbra'), false);
  assert.equal(isChallenge('Covens of Umbra'), true);
});
