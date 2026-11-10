'use strict';
/**
 * Path of Building build codes and links: the code is the build file deflated (zlib) and written in URL-safe
 * base64, like PoB's Import/Export tab. Links from the sites PoB imports from are read through their raw pages.
 */
const zlib = require('zlib');

function encode(xml) {
  return zlib.deflateSync(Buffer.from(String(xml), 'utf8'), { level: 9 }).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}
function decode(code) {
  const b = Buffer.from(String(code).trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!b.length) throw new Error('That isn\'t a Path of Building code.');
  let xml;
  try { xml = zlib.inflateSync(b).toString('utf8'); } catch {
    try { xml = zlib.inflateRawSync(b).toString('utf8'); } catch { throw new Error('That isn\'t a Path of Building code.'); }
  }
  if (!/<PathOfBuilding\b/.test(xml)) throw new Error('That code doesn\'t hold a Path of Building build.');
  return xml;
}

// the sites PoB itself imports from (its BuildSiteTools list): the link, and where the raw code is
const SITES = [
  { label: 'pobb.in', re: /^https?:\/\/pobb\.in\/(?:pob\/)?([\w-]+)\/?$/i, raw: (id) => `https://pobb.in/pob/${id}` },
  { label: 'pob.codes', re: /^https?:\/\/pob\.codes\/b\/([\w-]+)\/?$/i, raw: (id) => `https://api.pob.codes/${id}/raw` },
  { label: 'poe.ninja', re: /^https?:\/\/poe\.ninja\/(?:poe1\/)?pob\/(\w+)\/?$/i, raw: (id) => `https://poe.ninja/poe1/pob/raw/${id}` },
  { label: 'Maxroll', re: /^https?:\/\/maxroll\.gg\/poe\/pob\/([\w-]+)\/?$/i, raw: (id) => `https://maxroll.gg/poe/api/pob/${id}` },
  { label: 'Pastebin', re: /^https?:\/\/pastebin\.com\/(?:raw\/)?(\w+)\/?$/i, raw: (id) => `https://pastebin.com/raw/${id}` },
  { label: 'Rentry', re: /^https?:\/\/rentry\.co\/(\w+)\/?$/i, raw: (id) => `https://rentry.co/paste/${id}/raw` },
  { label: 'poedb', re: /^https?:\/\/poedb\.tw\/pob\/([\w-]+)\/?$/i, raw: (id) => `https://poedb.tw/pob/${id}/raw` },
];
/** A link to a build: { site, raw } (where its code is), or null when it isn't a link PoB knows. */
function linkSource(text) {
  const t = String(text || '').trim();
  for (const s of SITES) {
    const m = s.re.exec(t);
    if (m) return { site: s.label, raw: s.raw(m[1]) };
  }
  return null;
}
const isLink = (text) => /^https?:\/\//i.test(String(text || '').trim());

/** What a build is, from its file: class, ascendancy, level and the main skill's gems. */
function infoFromXml(xml) {
  const attr = (tag, name) => new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`).exec(xml)?.[1];
  const level = Number(attr('Build', 'level')) || null;
  const className = attr('Build', 'className') || null;
  const ascendancy = attr('Build', 'ascendClassName');
  const mainGroup = Number(attr('Build', 'mainSocketGroup')) || 1;
  const skills = [...xml.matchAll(/<Skill\b[^>]*>([\s\S]*?)<\/Skill>/g)];
  const group = skills[mainGroup - 1]?.[1] || skills[0]?.[1] || '';
  const gem = /<Gem\b[^>]*\bnameSpec="([^"]+)"/.exec(group)?.[1] || null;
  return { level, className, ascendancy: ascendancy && ascendancy !== 'None' ? ascendancy : null, skill: gem };
}

module.exports = { encode, decode, linkSource, isLink, infoFromXml, SITES };
