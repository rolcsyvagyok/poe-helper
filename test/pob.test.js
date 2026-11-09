'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { summarise, listBuilds, findPobDir } = require('../src/main/pob');

test('PoB comparison: DPS first, only what changes, no weapon swap', () => {
  const r = summarise({
    item: 'Doom Edge', full: false,
    base: { CombinedDPS: 1000, Life: 5000, FireResist: 75, Armour: 100 },
    slots: [
      { slot: 'Weapon 1', current: 'Old Sword', stats: { CombinedDPS: 1250, Life: 4900, FireResist: 75, Armour: 100 } },
      { slot: 'Weapon 1 Swap', current: null, stats: { CombinedDPS: 900, Life: 5000, FireResist: 75, Armour: 100 } },
    ],
  });
  assert.strictEqual(r.slots.length, 1);
  const [s] = r.slots;
  assert.deepStrictEqual(s.changes.map((c) => c.key), ['dps', 'Life']);
  assert.strictEqual(Math.round(s.changes[0].pct), 25);
  assert.strictEqual(s.changes[1].diff, -100);
});

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
