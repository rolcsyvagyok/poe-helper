'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/core/pob-code');

test('PoB codes: a build goes to a URL-safe code and back; junk is refused', () => {
  const xml = '<?xml version="1.0"?><PathOfBuilding><Build level="92" className="Marauder" ascendClassName="Berserker" mainSocketGroup="2"/><Skills><Skill><Gem nameSpec="Vitality"/></Skill><Skill><Gem nameSpec="Perforate"/><Gem nameSpec="Brutality"/></Skill></Skills></PathOfBuilding>';
  const code = C.encode(xml);
  assert.match(code, /^[A-Za-z0-9_-]+=*$/);
  assert.strictEqual(C.decode(code), xml);
  assert.strictEqual(C.decode(`  ${code.slice(0, 20)}\n${code.slice(20)} `), xml);
  assert.throws(() => C.decode('hello world'), /Path of Building/);
  assert.deepStrictEqual(C.infoFromXml(xml), { level: 92, className: 'Marauder', ascendancy: 'Berserker', skill: 'Perforate' });
});

test('PoB links: the raw code of the sites PoB imports from', () => {
  assert.deepStrictEqual(C.linkSource('https://pobb.in/AbC-12_x'), { site: 'pobb.in', raw: 'https://pobb.in/pob/AbC-12_x' });
  assert.strictEqual(C.linkSource('https://poe.ninja/poe1/pob/1a2b').raw, 'https://poe.ninja/poe1/pob/raw/1a2b');
  assert.strictEqual(C.linkSource('https://poe.ninja/pob/1a2b').raw, 'https://poe.ninja/poe1/pob/raw/1a2b');
  assert.strictEqual(C.linkSource('https://pastebin.com/xyz12').raw, 'https://pastebin.com/raw/xyz12');
  assert.strictEqual(C.linkSource('https://pob.codes/b/q1').raw, 'https://api.pob.codes/q1/raw');
  assert.strictEqual(C.linkSource('https://example.com/x'), null);
  assert.ok(C.isLink(' https://x.y/z'));
});
