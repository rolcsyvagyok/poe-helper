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
