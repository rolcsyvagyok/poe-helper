'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LabClient, findImage, findPages, todayUtc } = require('../src/core/lab');

const page = `<div><a href="https://www.poelab.com/wp-content/labfiles/2026-11-04_000043000_uber.jpg">old</a>
<img src="https://www.poelab.com/wp-content/labfiles/2026-11-05_000043330_uber.jpg" alt="">
<img src="/wp-content/labfiles/2026-11-05_000043331_merciless.jpg"></div>`;

test('finds the newest layout of a difficulty on a poelab page', () => {
  assert.deepEqual(findImage(page, 'uber'), { date: '2026-11-05', url: 'https://www.poelab.com/wp-content/labfiles/2026-11-05_000043330_uber.jpg' });
  assert.equal(findImage(page, 'merciless').url, 'https://www.poelab.com/wp-content/labfiles/2026-11-05_000043331_merciless.jpg');
  assert.equal(findImage(page, 'normal'), null);
});

test('finds the daily pages on the front page', () => {
  const home = '<a href="https://www.poelab.com/gtgax/">Normal Labyrinth</a> <a href="https://www.poelab.com/r8aws/"><span>Cruel</span> Lab</a> <a href="https://www.poelab.com/about/">About</a>';
  assert.deepEqual(findPages(home), { normal: 'https://www.poelab.com/gtgax/', cruel: 'https://www.poelab.com/r8aws/' });
});

test('downloads today\'s picture once and keeps it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-'));
  const store = new Map();
  const st = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('.jpg')) return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(5000).buffer };
    return { ok: true, status: 200, text: async () => page };
  };
  const lab = new LabClient({ dir, fetchImpl, store: st });
  const now = Date.parse('2026-11-05T10:00:00Z');
  const a = await lab.layout('uber', { now });
  assert.equal(a.date, '2026-11-05');
  assert.equal(a.stale, false);
  assert.equal(a.page, 'https://www.poelab.com/jvcpv/');
  assert.ok(fs.existsSync(a.file));
  await lab.layout('uber', { now: now + 3600e3 });
  assert.equal(calls.length, 2, 'second call the same day uses the saved picture');
  const b = await lab.layout('uber', { now: Date.parse('2026-11-06T01:00:00Z') });
  assert.equal(b.stale, true, 'next day, before poelab posts: the newest one, marked stale');
  assert.equal(todayUtc(Date.parse('2026-11-05T23:59:00Z')), '2026-11-05');
});

test('works without a fetch passed in (uses the global one)', () => {
  const lab = new LabClient({ dir: os.tmpdir() });
  assert.equal(typeof lab.fetch, 'function');
});

test('a 403 from Cloudflare falls back to loading poelab as a browser', async () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab403-'));
  const today = todayUtc(Date.now());
  const html = `<img src="https://www.poelab.com/wp-content/labfiles/${today}_000043330_uber.jpg">`;
  const used = [];
  const lab = new LabClient({
    dir,
    fetchImpl: async () => ({ ok: false, status: 403 }),
    browser: { text: async (u) => { used.push(['text', u]); return html; }, buffer: async (u) => { used.push(['pic', u]); return Buffer.alloc(5000, 1); } },
  });
  const r = await lab.layout('uber');
  assert.equal(r.date, today);
  assert.ok(fs.existsSync(r.file));
  assert.deepEqual(used.map((x) => x[0]), ['text', 'pic']);
});

test('without a browser a 403 is still reported', async () => {
  const lab = new LabClient({ dir: require('os').tmpdir(), fetchImpl: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(() => lab.layout('uber', { refresh: true }), /403/);
});
