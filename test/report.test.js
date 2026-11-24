'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { makeZip } = require('../src/core/zip');
const { createServices } = require('../src/main/services');

// reads back a zip made by makeZip (deflate entries)
function readZip(buf) {
  const out = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18); const n = buf.readUInt16LE(p + 26); const x = buf.readUInt16LE(p + 28);
    const name = buf.slice(p + 30, p + 30 + n).toString('utf8');
    const data = buf.slice(p + 30 + n + x, p + 30 + n + x + size);
    out[name] = zlib.inflateRawSync(data).toString('utf8');
    p += 30 + n + x + size;
  }
  return out;
}

test('zip: files come back as they went in', () => {
  const z = readZip(makeZip([{ name: 'a.txt', data: 'hello' }, { name: 'filters/b.filter', data: Buffer.from('Show\n\tBaseType "Ä"') }]));
  assert.deepEqual(z, { 'a.txt': 'hello', 'filters/b.filter': 'Show\n\tBaseType "Ä"' });
});

test('bug report: logs, settings without the login, both filters', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-report-'));
  const fdir = path.join(dir, 'filters'); fs.mkdirSync(fdir);
  fs.writeFileSync(path.join(fdir, 'Mine.filter'), 'Show\n');
  fs.writeFileSync(path.join(dir, 'poe-helper.log'), 'a line\n');
  const s = createServices({ dataDir: dir, secrets: { encrypt: (x) => 'enc:' + x, decrypt: (x) => x }, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), log: () => {} });
  s.settings.patch({ sessionEnc: 'enc:SECRET123', contact: 'me@example.com', accountName: 'Someone#1234', filterDir: fdir, baseFilter: 'Mine.filter' });
  s.filters.write();
  const files = s.reportFiles({ hotkeys: { hotkeyLab: 'ok' } });
  const names = files.map((f) => f.name);
  assert.ok(names.includes('report.txt') && names.includes('settings.json') && names.includes('poe-helper.log'));
  assert.ok(names.includes('filters/Mine.filter'));
  assert.ok(names.some((n) => /^filters\/Mine \(helper\)\.filter$/.test(n)), names.join(','));
  const settings = files.find((f) => f.name === 'settings.json').data.toString();
  assert.doesNotMatch(settings, /SECRET123|me@example\.com|Someone#1234/);
  assert.match(files.find((f) => f.name === 'report.txt').data.toString(), /hotkeyLab/);
});

test('"Show all currency": a tier your filter hides shows as shown, and a Hide you click stays hidden', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-sac-'));
  const fdir = path.join(dir, 'f'); fs.mkdirSync(fdir);
  fs.writeFileSync(path.join(fdir, 'NS.filter'), [
    'Show # %H3 $type->currency->essence $tier->t5 !currency_e', '\tClass == "Stackable Currency"', '\tBaseType == "Wailing Essence of Anger"', '\tSetFontSize 45', '',
    'Hide # %HS1 $type->currency->essence $tier->t6 !currency_supply2', '\tClass == "Stackable Currency"', '\tBaseType == "Muttering Essence of Anger"', '\tSetFontSize 45', '',
  ].join('\n'));
  const s = createServices({ dataDir: dir, secrets: { encrypt: (x) => x, decrypt: (x) => x }, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), log: () => {} });
  s.settings.patch({ filterDir: fdir, baseFilter: 'NS.filter', showAllCurrency: true });
  s.filters.write();
  const out = () => fs.readFileSync(path.join(fdir, 'NS (helper).filter'), 'utf8');
  const t6 = () => s.tierViewNow().types.flatMap((t) => t.tiers).find((t) => t.key === 'currency->essence|t6');
  assert.match(out(), /^Show # %HS1 \$type->currency->essence \$tier->t6/m);
  assert.equal(t6().state, 'Show', 'the app says what the game does');
  assert.equal(t6().allCurrency, true);
  s.setTierAction('currency->essence|t6', 'Hide');
  assert.match(out(), /^Hide # %HS1 \$type->currency->essence \$tier->t6/m, 'your Hide is kept');
  assert.equal(t6().state, 'Hide');
});

test('strictness preview: lists the tiers a stricter level hides, without switching', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-sp-'));
  const fdir = path.join(dir, 'f'); fs.mkdirSync(fdir);
  fs.writeFileSync(path.join(fdir, 'NS.filter'), require('./fixtures').nsFilter);
  const s = createServices({ dataDir: dir, secrets: { encrypt: (x) => x, decrypt: (x) => x }, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), log: () => {} });
  s.settings.patch({ filterDir: fdir, baseFilter: 'NS.filter' });
  const p = s.strictnessPreview(6);
  assert.equal(p.fromName, 'Regular');
  assert.equal(p.toName, 'Uber Plus Strict');
  assert.deepEqual(p.changes.map((c) => [c.key, c.before, c.after]), [['uniques|t3', 'Show', 'Hide']]);
  assert.ok(p.changes[0].bases.includes('Leather Belt'));
  assert.ok(!Object.keys(s.settings.get('strictness') || {}).length, 'nothing switched yet');
});

test('guide strategies from every website are added once; a deleted one stays deleted; old installs only get the new website', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-presets-'));
  const tree = require('../src/core/atlas').buildTree(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'atlas-3.30.json.gz')))));
  const s = createServices({ dataDir: dir, secrets: { encrypt: (x) => x, decrypt: (x) => x }, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), log: () => {} });
  // an install that already had the poeatlasplanner.com ones (and deleted all but one)
  s.settings.patch({ atlasPresetsV1: true, atlasStrategies: [{ id: 'pap-red-altars', presetId: 'pap-red-altars', name: 'Fubgun · Red altars', nodes: [1], guide: { author: 'Fubgun' } }] });
  s.addGuidePresetsForTest(tree);
  const list = s.settings.get('atlasStrategies');
  assert.equal(list.filter((x) => x.presetId?.startsWith('pap-')).length, 1, 'deleted poeatlasplanner ones stay deleted');
  assert.equal(list.filter((x) => x.presetId?.startsWith('mx-')).length, 11, 'maxroll ones added');
  const nm = list.find((x) => x.presetId === 'mx-sr13h300');
  assert.equal(nm.mapKind, 'Nightmare maps');
  assert.match(nm.guide.source, /^https:\/\/maxroll\.gg\//);
  s.settings.set('atlasStrategies', list.filter((x) => x.presetId !== 'mx-sr13h300'));
  s.addGuidePresetsForTest(tree);
  assert.ok(!s.settings.get('atlasStrategies').some((x) => x.presetId === 'mx-sr13h300'), 'a deleted one is not added again');
});

test('guide website check: reads poeatlasplanner.com sections; a tree already in the list is not added twice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-sync-'));
  const tree = require('../src/core/atlas').buildTree(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'atlas-3.30.json.gz')))));
  const s = createServices({ dataDir: dir, secrets: { encrypt: (x) => x, decrypt: (x) => x }, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), log: () => {} });
  const red = require('../src/core/atlas-presets.json').presets.find((p) => p.id === 'pap-red-altars');
  const code = red.link.split('#p=')[1];
  const html = `<h2 id="farm">Farming trees</h2><div><section class="guide-preset guide-preset-compact" id="red-altars"><div class="guide-preset-heading"><h3>Fubgun · Red altars</h3><span>150<!-- --> pts</span></div><p class="guide-preset-goal">Exarch loot · stronger map modifiers</p><div class="guide-preset-footer"><a class="guide-button" href="/?preset=red-altars#p=${code}">Open tree</a></div></section></div>
    <h2 id="u">Ultimatum farming: the 121-point tree and what to change</h2><section class="guide-preset" id="new-one"><h3>Someone · Brand new</h3><p class="guide-preset-goal">Something new</p><a href="/?preset=new-one#p=${code}x">Open</a></section>`;
  const found = s.papPresetsFrom(html);
  assert.deepEqual(found.map((p) => [p.id, p.group, p.author, p.name, p.about]), [
    ['pap-red-altars', 'Farming trees', 'Fubgun', 'Red altars', 'Exarch loot · stronger map modifiers'],
    ['pap-new-one', 'Ultimatum farming', 'Someone', 'Brand new', 'Something new'],
  ]);
  s.addGuidePresetsForTest(tree);
  const before = s.settings.get('atlasStrategies').length;
  // the same tree found on the page under another id: already there
  const again = found[0];
  assert.equal(s.addPresetsForTest([again], tree).length, 0);
  assert.equal(s.settings.get('atlasStrategies').length, before);
});

test('copy a guide strategy to My strategies', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poeh-copy-'));
  const s = createServices({ dataDir: dir, secrets: { encrypt: (x) => x, decrypt: (x) => x }, fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }), log: () => {} });
  s.settings.patch({ atlasStrategies: [{ id: 'pap-red-altars', presetId: 'pap-red-altars', name: 'Fubgun · Red altars', nodes: [1, 2], choices: { 2: 1 }, threads: [{ name: 'Abyss Thread', count: 8 }], guide: { author: 'Fubgun', source: 'https://poeatlasplanner.com/guides/best-atlas-tree' } }] });
  const c = s.atlasCopy('pap-red-altars');
  assert.equal(c.name, 'Red altars (Fubgun)');
  assert.ok(!c.guide && !c.presetId);
  assert.deepEqual(c.nodes, [1, 2]);
  assert.match(c.notes, /poeatlasplanner\.com/);
  assert.equal(s.settings.get('atlasStrategies').length, 2);
});
