'use strict';
// PobEngine: closing Path of Building on purpose (5 minutes unused) isn't logged as a crash; a crash is.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');
const { PobEngine } = require('../src/main/pob');

function fakeUp() {
  const procs = [];
  return { procs, fork: () => { const p = new EventEmitter(); p.postMessage = (m) => { if (m.op === 'start') setImmediate(() => p.emit('message', { id: m.id, ms: 5 })); }; p.kill = () => setImmediate(() => p.emit('exit', 0)); procs.push(p); return p; } };
}

test('an idle stop is logged as closed, a crash as stopped', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pob-'));
  fs.writeFileSync(path.join(dir, 'host.lua'), '');
  fs.writeFileSync(path.join(dir, 'SimpleGraphic.lua'), '');
  const logs = [];
  const up = fakeUp();
  const e = new PobEngine({ utilityProcess: up, hostFile: path.join(dir, 'host.lua'), workerFile: 'w.js', log: (...a) => logs.push(a.join(' ')) });
  await e.start(dir);
  e.lastOp = 'working on "tree"';
  e.stop();
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(logs.some((l) => /PoB closed \(not in use\)/.test(l)));
  assert.ok(!logs.some((l) => /stopped while/.test(l)));
  await e.start(dir);
  e.lastOp = 'working on "tree"';
  up.procs[1].emit('exit', 3221225477);
  assert.ok(logs.some((l) => /stopped while working on "tree" \(3221225477 0xC0000005\)/.test(l)));
});
