'use strict';
// Maps run in a session, counted from Client.txt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { countMaps, mapsBetween } = require('../src/core/client-log');

const line = (t, area, seed, lvl = 83) => `${t} 123456 cff94598 [DEBUG Client 7744] Generating level ${lvl} area "${area}" with seed ${seed}`;
const LOG = [
  line('2026/11/22 16:58:00', 'MapWorldsCemetery', 11),
  '2026/11/22 17:00:01 123 abc [INFO Client 7744] : You have entered Cemetery.',
  line('2026/11/22 17:01:00', 'MapWorldsCemetery', 22),
  line('2026/11/22 17:04:00', 'HideoutChurch', 33, 68),
  line('2026/11/22 17:05:00', 'MapWorldsCemetery', 22), // back in through a portal: the same map
  line('2026/11/22 17:09:00', 'MapWorldsStrand', 44),
  line('2026/11/22 17:20:00', 'Map3_10_1', 55),
  line('2026/11/22 18:30:00', 'MapWorldsDunes', 66),
].join('\r\n');
const at = (s) => new Date(s.replace(/\//g, '-').replace(' ', 'T')).getTime();

test('one map per seed, hideouts and portal trips left out, only inside the session', () => {
  const r = mapsBetween(LOG, at('2026/11/22 17:00:00'), at('2026/11/22 18:00:00'));
  assert.equal(r.count, 3);
  assert.deepEqual(r.maps.map((m) => m.area), ['MapWorldsCemetery', 'MapWorldsStrand', 'Map3_10_1']);
});

test('read from the end of the file; a missing file gives null', () => {
  const f = path.join(os.tmpdir(), `client-${process.pid}.txt`);
  fs.writeFileSync(f, 'x'.repeat(3 * 1024 * 1024) + '\n' + LOG);
  try {
    assert.equal(countMaps(f, at('2026/11/22 17:00:00')).count, 4);
  } finally { fs.unlinkSync(f); }
  assert.equal(countMaps(path.join(os.tmpdir(), 'nope-client.txt'), 0), null);
});
