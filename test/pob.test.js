'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listBuilds, snapshotFile, pickCharacter, findPobDir } = require('../src/main/pob');

test('PoB builds: every .xml in the folder, newest first; a folder without PoB is not taken', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pobb-'));
  fs.mkdirSync(path.join(dir, 'League'));
  fs.writeFileSync(path.join(dir, 'Old.xml'), '<PathOfBuilding/>');
  fs.writeFileSync(path.join(dir, 'League', 'New.xml'), '<PathOfBuilding/>');
  fs.utimesSync(path.join(dir, 'Old.xml'), new Date(2020, 1, 1), new Date(2020, 1, 1));
  const list = listBuilds(dir);
  assert.deepStrictEqual(list.map((b) => b.name), ['League / New', 'Old']);
  assert.strictEqual(findPobDir(dir, {}), null);
});

test('PoB snapshot: named after the character and the time, in its own folder; the last played character by default', () => {
  const f = snapshotFile(path.join('B'), 'My:Char', new Date(2026, 10, 9, 22, 5));
  assert.strictEqual(f, path.join('B', 'PoE Helper snapshots', 'My-Char 2026-11-09 22-05.xml'));
  const list = [{ name: 'a' }, { name: 'b', lastActive: true }];
  assert.strictEqual(pickCharacter(list).name, 'b');
  assert.strictEqual(pickCharacter(list, 'a').name, 'a');
  assert.strictEqual(pickCharacter(list, 'gone'), null);
  assert.strictEqual(pickCharacter([]), null);
});

test('GGG characters: the same pages PoB imports from, with the session and the account name', async () => {
  const { GggClient } = require('../src/core/ggg');
  const seen = [];
  const store = new Map();
  const cache = { isFresh: () => false, get: (k) => store.get(k), set: (k, v) => store.set(k, { data: v }) };
  const fetchImpl = async (url, opt) => { seen.push([url, opt.headers.Cookie]); return { status: 200, ok: true, headers: new Map(), json: async () => (/get-characters/.test(url) ? [{ name: 'X', lastActive: true }] : { items: [] }) }; };
  const g = new GggClient({ cache, fetchImpl, userAgent: 't', getSessionId: () => 'sid', getAccountName: () => 'Me#1234' });
  assert.deepStrictEqual(await g.characters(), [{ name: 'X', lastActive: true }]);
  await g.characterItems('X'); await g.characterPassives('X');
  assert.deepStrictEqual(seen.map(([u]) => u.replace('https://www.pathofexile.com/character-window/', '')), [
    'get-characters?accountName=Me%231234&realm=pc', 'get-items?accountName=Me%231234&realm=pc&character=X', 'get-passive-skills?accountName=Me%231234&realm=pc&character=X']);
  assert.ok(seen.every(([, c]) => c === 'POESESSID=sid'));
});
