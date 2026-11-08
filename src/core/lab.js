'use strict';
/**
 * Daily Labyrinth layouts from poelab.com.
 *
 * poelab posts one picture per difficulty every day at
 *   https://www.poelab.com/wp-content/labfiles/<YYYY-MM-DD>_<number>_<difficulty>.jpg
 * on a page per difficulty (the uber page is https://www.poelab.com/jvcpv/). The number changes daily,
 * so the picture is found on that page. Each page and picture is fetched at most once a day and kept
 * on disk; the app shows poelab's picture as it is and links back to poelab.
 */

const fs = require('fs');
const path = require('path');

const DIFFS = [
  { id: 'normal', name: 'Normal', level: 33 },
  { id: 'cruel', name: 'Cruel', level: 55 },
  { id: 'merciless', name: 'Merciless', level: 68 },
  { id: 'uber', name: 'Uber', level: 75 },
];
const HOME = 'https://www.poelab.com/';
const KNOWN_PAGES = { uber: 'https://www.poelab.com/jvcpv/' };
const IMG_RE = /(?:https?:\/\/www\.poelab\.com)?\/wp-content\/labfiles\/(\d{4}-\d{2}-\d{2})_[A-Za-z0-9_-]*?_(normal|cruel|merciless|uber)\.(jpe?g|png|webp)/gi;

/** poelab's day starts at midnight UTC (when the layouts change in game). */
const todayUtc = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** The newest layout picture for a difficulty in a poelab page. */
function findImage(html, diff) {
  let best = null;
  for (const m of String(html || '').matchAll(IMG_RE)) {
    if (m[2].toLowerCase() !== diff) continue;
    const url = m[0].startsWith('/') ? `https://www.poelab.com${m[0]}` : m[0].replace(/^http:/, 'https:');
    if (!best || m[1] > best.date) best = { date: m[1], url };
  }
  return best;
}

/** The daily pages linked from poelab's front page: { normal: url, ... }. */
function findPages(html) {
  const out = {};
  for (const m of String(html || '').matchAll(/<a\b[^>]*href="(https:\/\/www\.poelab\.com\/[a-z0-9]{3,10}\/?)"[^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, ' ').toLowerCase();
    if (!/lab/.test(text)) continue;
    const d = DIFFS.find((x) => new RegExp(`\\b${x.id}\\b`).test(text));
    if (d && !out[d.id]) out[d.id] = m[1].endsWith('/') ? m[1] : `${m[1]}/`;
  }
  return out;
}

class LabClient {
  constructor({ dir, fetchImpl, userAgent = 'PoE-Helper', log = () => {}, store = null, browser = null }) {
    this.dir = dir;
    // the app may pass no fetch (it then uses Electron's), and a bare fetch must not be called as a method
    this.fetch = (url, opts) => (fetchImpl || globalThis.fetch)(url, opts);
    this.userAgent = userAgent;
    this.log = log;
    this.store = store; // settings: labPages (your page addresses), labIndex (what is on disk)
    // poelab sits behind Cloudflare, which sometimes turns away plain requests (403) depending on the
    // network. browser: { text(url), buffer(url, referer) } loads it like a normal browser instead.
    this.browser = browser;
  }

  async getText(url) {
    let status = null;
    try {
      const r = await this.fetch(url, { headers: { 'User-Agent': this.userAgent, Accept: 'text/html' } });
      if (r.ok) return await r.text();
      status = r.status;
    } catch (e) { if (!this.browser) throw e; }
    if (this.browser && (status == null || status === 403 || status === 429 || status === 503)) {
      this.log(`poelab: plain request ${status ? `answered ${status}` : 'failed'}, loading it as a browser`);
      return this.browser.text(url);
    }
    throw new Error(`poelab answered ${status}`);
  }

  async getPicture(url, referer) {
    let status = null;
    try {
      const r = await this.fetch(url, { headers: { 'User-Agent': this.userAgent, Referer: referer } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      status = r.status;
    } catch (e) { if (!this.browser) throw e; }
    if (this.browser && (status == null || status === 403 || status === 429 || status === 503)) return this.browser.buffer(url, referer);
    throw new Error(`poelab's picture answered ${status}`);
  }

  async pageFor(diff) {
    const mine = this.store?.get('labPages') || {};
    if (mine[diff]) return mine[diff];
    if (KNOWN_PAGES[diff]) return KNOWN_PAGES[diff];
    const found = findPages(await this.getText(HOME));
    if (this.store) this.store.set('labPages', { ...found, ...mine });
    if (!found[diff]) throw new Error(`Couldn't find poelab's ${diff} page. Paste its address in Daily lab → Pages.`);
    return found[diff];
  }

  /**
   * Today's layout for a difficulty: { diff, date, today, file, page, url, stale }.
   * stale: poelab hasn't posted today's yet, so this is the newest one it has.
   */
  async layout(diff, { refresh = false, now = Date.now() } = {}) {
    if (!DIFFS.some((d) => d.id === diff)) throw new Error('Unknown labyrinth difficulty.');
    const today = todayUtc(now);
    const index = this.store?.get('labIndex') || {};
    const have = index[diff];
    const fresh = have && have.date === today && fs.existsSync(have.file);
    // a picture from an earlier day is looked for again at most every 20 minutes
    const recent = have && fs.existsSync(have.file) && now - (have.checkedAt || 0) < 20 * 60000;
    if (!refresh && (fresh || recent)) return { ...have, today, stale: have.date !== today };

    const page = await this.pageFor(diff);
    const img = findImage(await this.getText(page), diff);
    if (!img) {
      if (have && fs.existsSync(have.file)) return { ...have, today, stale: true };
      throw new Error(`poelab hasn't uploaded today's ${diff} layout yet. It's usually up some time after the daily reset at midnight UTC; try again in a few minutes.`);
    }
    fs.mkdirSync(this.dir, { recursive: true });
    const ext = img.url.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
    const file = path.join(this.dir, `${img.date}_${diff}.${ext}`);
    if (!fs.existsSync(file)) {
      const buf = await this.getPicture(img.url, page);
      if (buf.length < 1000) throw new Error("poelab's picture came back empty.");
      fs.writeFileSync(file, buf);
      this.cleanup();
    }
    const entry = { diff, date: img.date, file, page, url: img.url, checkedAt: now };
    if (this.store) this.store.set('labIndex', { ...(this.store.get('labIndex') || {}), [diff]: entry });
    return { ...entry, today, stale: img.date !== today };
  }

  /** Keep the last three days of pictures. */
  cleanup() {
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => /^\d{4}-\d{2}-\d{2}_/.test(f)).sort(); } catch { return; }
    const days = [...new Set(files.map((f) => f.slice(0, 10)))].sort().reverse().slice(3);
    for (const f of files) if (days.includes(f.slice(0, 10))) { try { fs.unlinkSync(path.join(this.dir, f)); } catch { /* in use */ } }
  }
}

module.exports = { LabClient, DIFFS, findImage, findPages, todayUtc, KNOWN_PAGES };
