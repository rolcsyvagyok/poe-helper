'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { piecesByName, buildGemRegex } = require('../src/core/regex/gems');

test('every gem piece finds that gem by its name line and no other gem', () => {
  const p = piecesByName();
  const names = [...p.keys()];
  assert.ok(names.length > 800);
  for (const [name, piece] of p) {
    const re = new RegExp(piece, 'im');
    assert.deepStrictEqual(names.filter((n) => re.test(n)), [name], `${name}: ${piece}`);
  }
  assert.ok(!new RegExp(p.get('Ice Nova'), 'im').test('Ice Nova of Frostbolts'));
});

test('gem searches stay under 250 characters each', () => {
  const all = [...piecesByName().keys()].slice(0, 120);
  const r = buildGemRegex({ picks: all });
  assert.ok(r.strings.length > 1 && r.strings.every((s) => s.text.length <= 250));
  assert.strictEqual(r.strings.reduce((a, s) => a + s.count, 0), 120);
});

test('where to get a gem while levelling, for the build\'s class', () => {
  const { whereToGet } = require('../src/core/regex/gems');
  const s = whereToGet('Sunder', 'Marauder');
  assert.match(s.reward, /Act 1, The Siren's Cadence \(Nessa\)/);
  assert.match(s.buy, /Act 1, Nessa/);
  assert.match(whereToGet('Ruthless', 'Marauder').buy, /Enemy at the Gate/, 'PoB leaves " Support" off');
  assert.match(whereToGet('Ground Slam of Earthshaking', 'Marauder').note, /Divine Font/);
  assert.equal(whereToGet('No Such Gem'), null);
});
