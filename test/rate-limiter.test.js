'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RateLimiter } = require('../src/core/rate-limiter');

test('hits the server knows about (browser, other tools) are spread over the window, and a clicked search may use more', () => {
  let t = 1_000_000;
  const rl = new RateLimiter({ safety: 0.5, now: () => t });
  const headers = { 'X-Rate-Limit-Rules': 'Ip', 'X-Rate-Limit-Ip': '8:10:60,15:60:120,60:300:1800', 'X-Rate-Limit-Ip-State': '1:10:0,1:60:0,40:300:0' };
  rl.update('trade-search', headers, 200);
  // 40 of 60 in 5 minutes: background work (30 allowed) waits, but not the whole 5 minutes
  const bg = rl.waitTime('trade-search');
  assert.ok(bg > 0 && bg < 300 * 1000, `background waits ${bg}`);
  // a search you clicked may use 85% (51): no wait
  assert.equal(rl.waitTime('trade-search', { safety: 0.85 }), 0);
});
