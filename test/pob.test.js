'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listBuilds, snapshotFile, pickCharacter, findPobDir, withLastBuild, pobSettingsFiles } = require('../src/main/pob');

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

test('PoB item tester: DPS first, only what changes, weapon swap marked', () => {
  const { summarise } = require('../src/main/pob');
  const r = summarise({
    item: 'Doom Loop, Steel Ring', full: false,
    base: { CombinedDPS: 1000, Life: 3000, Str: 100 },
    slots: [
      { slot: 'Ring 1', current: 'Old', stats: { CombinedDPS: 1250, Life: 2900, Str: 100 } },
      { slot: 'Weapon 1 Swap', current: null, stats: { CombinedDPS: 1000, Life: 3000, Str: 100 } },
    ],
  });
  const ring = r.slots[0];
  assert.deepStrictEqual(ring.changes.map((c) => c.key), ['dps', 'Life']);
  assert.strictEqual(Math.round(ring.changes[0].pct), 25);
  assert.strictEqual(ring.changes[1].diff, -100);
  assert.strictEqual(r.slots[1].swap, true);
  assert.strictEqual(r.slots[1].changes.length, 0);
});

test('Open in PoB: the build PoB opens at start is set, the rest of its settings stay', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<PathOfBuilding>\n\t<Mode mode="LIST">\n\t\t<Arg string=""/>\n\t</Mode>\n\t<Accounts lastAccountName="x"/>\n</PathOfBuilding>\n';
  const out = withLastBuild(xml, 'C:\\B\\PoE Helper snapshots\\A & B.xml', 'A & B');
  assert.match(out, /<Mode mode="BUILD">\s*<Arg string="C:\\B\\PoE Helper snapshots\\A &amp; B.xml"\/>\s*<Arg string="A &amp; B"\/>\s*<\/Mode>/);
  assert.match(out, /<Accounts lastAccountName="x"\/>/);
  assert.strictEqual((out.match(/<Mode /g) || []).length, 1);
  assert.match(withLastBuild('<PathOfBuilding><Mode mode="BUILD"/></PathOfBuilding>', 'f.xml', 'f'), /<Arg string="f.xml"\/>/);
  assert.match(withLastBuild('<PathOfBuilding>\n</PathOfBuilding>', 'f.xml', 'f'), /<PathOfBuilding>\n\t<Mode mode="BUILD">/);
  assert.match(withLastBuild('', 'f.xml', 'f'), /^<\?xml[\s\S]*<Mode mode="BUILD">/);
  assert.strictEqual(pobSettingsFiles(path.join('D', 'Path of Building', 'Builds'), 'D', 'P')[0], path.join('D', 'Path of Building', 'Settings.xml'));
});
