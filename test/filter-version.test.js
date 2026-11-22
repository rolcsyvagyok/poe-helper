'use strict';
// The FilterBlade filter's NeverSink version, and the "update it on FilterBlade" check.
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../src/core/filter/version');

const head = (v) => `#Online Item Filter\n#name:3.30\n#====\n# NeverSink's Indepth Loot Filter\n#====\n# VERSION:  ${v}\n# TYPE:     2-SEMI-STRICT\n`;
const now = new Date('2026-11-22T12:00:00Z');

test('reads the version and build date from the header', () => {
  assert.deepEqual(V.filterVersion(head('8.21.0a.2026.317.17')), { version: '8.21.0a', date: '2026-03-17' });
  assert.deepEqual(V.filterVersion(head('8.20.1d.2026.228.19')), { version: '8.20.1d', date: '2026-02-28' });
  assert.deepEqual(V.filterVersion(head('8.20.2.2026.1105.7')), { version: '8.20.2', date: '2026-11-05' });
  assert.equal(V.filterVersion('Show\n  BaseType "Chaos Orb"\n'), null);
});

test('versions compare with letters after the number', () => {
  assert.ok(V.compareVersions('8.21.1', '8.21.0a') > 0);
  assert.ok(V.compareVersions('8.21.0a', '8.21.0') > 0);
  assert.ok(V.compareVersions('8.20.10', '8.20.9') > 0);
  assert.equal(V.compareVersions('8.21.0a', '8.21.0a'), 0);
});

test('old when a newer NeverSink is out, or (without one) after 90 days', () => {
  const t = head('8.21.0a.2026.317.17');
  assert.equal(V.filterAge(t, '8.21.1', now).old, true);
  assert.equal(V.filterAge(t, '8.21.1', now).month, 'March');
  assert.equal(V.filterAge(t, '8.21.0a', now).old, false);
  assert.equal(V.filterAge(t, null, now).old, true);
  assert.equal(V.filterAge(head('8.21.1.2026.1101.3'), null, now).old, false);
  assert.equal(V.filterAge(head('8.18.0.2025.1201.3'), null, now).month, 'December 2025');
});
