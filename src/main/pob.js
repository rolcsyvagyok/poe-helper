'use strict';
/**
 * Path of Building inside the app: finds your PoB (Community) install and your builds folder, and runs PoB
 * headless in a worker (pob-worker.js) to make snapshots of your character the way its Import tab does.
 * Path of Building is MIT licensed; the app uses your installed copy.
 */
const fs = require('fs');
const path = require('path');

function pobDirs(env = process.env) {
  const list = [];
  if (env.APPDATA) list.push(path.join(env.APPDATA, 'Path of Building Community'));
  if (env.ProgramData) list.push(path.join(env.ProgramData, 'Path of Building Community'));
  for (const pf of [env.ProgramFiles, env['ProgramFiles(x86)']]) if (pf) list.push(path.join(pf, 'Path of Building Community'));
  if (env.LOCALAPPDATA) list.push(path.join(env.LOCALAPPDATA, 'Programs', 'Path of Building Community'));
  return list;
}
/** A PoB folder has its LuaJIT and its Launch.lua. */
function isPobDir(dir) {
  try { return !!dir && fs.existsSync(path.join(dir, 'lua51.dll')) && fs.existsSync(path.join(dir, 'Launch.lua')); } catch { return false; }
}
function findPobDir(preferred, env) {
  if (isPobDir(preferred)) return preferred;
  return pobDirs(env).find(isPobDir) || null;
}

/** Where PoB keeps builds: its own setting (Settings.xml buildPath), else Documents\Path of Building\Builds. */
function buildsDirs(documents) {
  const out = [];
  const userDir = path.join(documents, 'Path of Building');
  try {
    const xml = fs.readFileSync(path.join(userDir, 'Settings.xml'), 'utf8');
    const m = /buildPath="([^"]+)"/.exec(xml);
    if (m) out.push(m[1].replace(/&amp;/g, '&'));
  } catch { /* no settings */ }
  out.push(path.join(userDir, 'Builds'));
  return [...new Set(out)];
}
/** Every build (.xml) in the folder and its sub-folders, newest first. */
function listBuilds(dir, max = 500) {
  const out = [];
  const walk = (d, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= max) return;
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 4) walk(p, depth + 1);
      else if (e.isFile() && /\.xml$/i.test(e.name)) {
        let mtime = 0; try { mtime = fs.statSync(p).mtimeMs; } catch { /* gone */ }
        out.push({ file: p, name: path.relative(dir, p).replace(/\.xml$/i, '').replace(/[\\/]/g, ' / '), mtime });
      }
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => b.mtime - a.mtime);
}

/** Where a snapshot goes: <builds>/PoE Helper snapshots/<character> <date time>.xml */
function snapshotFile(buildsDir, charName, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const safe = String(charName || 'Character').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').trim() || 'Character';
  return path.join(buildsDir, 'PoE Helper snapshots', `${safe} ${stamp}.xml`);
}
/** The character a snapshot is of: the one you picked, else the one you played last. */
function pickCharacter(list, wanted) {
  if (!Array.isArray(list) || !list.length) return null;
  if (wanted) return list.find((c) => c.name === wanted) || null;
  return list.find((c) => c.lastActive) || list[0];
}

class PobEngine {
  constructor({ utilityProcess, hostFile, workerFile, log = () => {} }) {
    this.up = utilityProcess;
    this.hostFile = hostFile;
    this.workerFile = workerFile;
    this.log = log;
    this.proc = null;
    this.pending = new Map();
    this.seq = 0;
    this.dir = null;
    this.state = 'off'; // off | starting | ready | failed
    this.error = null;
  }

  send(msg, timeoutMs = 120000) {
    if (!this.proc) return Promise.reject(new Error('Path of Building is not running.'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Path of Building took too long.')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.postMessage({ ...msg, id });
    });
  }

  async start(dir) {
    if (this.proc && this.dir === dir && this.state === 'ready') return;
    this.stop();
    this.dir = dir;
    this.state = 'starting';
    this.error = null;
    try {
      this.proc = this.up.fork(this.workerFile, [], { cwd: dir, serviceName: 'Path of Building', stdio: 'ignore' });
      this.proc.on('message', (m) => {
        const p = this.pending.get(m?.id);
        if (!p) return;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.error && !m.stats && !m.slots && !m.detail && !m.results) p.reject(new Error(m.error)); else p.resolve(m);
      });
      this.proc.on('exit', (code) => {
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(`Path of Building stopped (${code}).`)); }
        this.pending.clear();
        if (this.state !== 'off') { this.state = 'failed'; this.error = this.error || `Path of Building stopped (${code}).`; }
        this.proc = null;
      });
      const hostSource = fs.readFileSync(this.hostFile, 'utf8');
      const stubSource = fs.readFileSync(path.join(path.dirname(this.hostFile), 'SimpleGraphic.lua'), 'utf8');
      const r = await this.send({ op: 'start', pobDir: dir, hostSource, stubSource }, 180000);
      this.state = 'ready';
      this.log(`PoB started in ${r.ms} ms`);
    } catch (err) {
      this.state = 'failed';
      this.error = err.message;
      this.stop(true);
      throw err;
    }
  }

  stop(keepState) {
    if (this.proc) { try { this.proc.kill(); } catch { /* gone */ } }
    this.proc = null;
    this.loaded = null;
    if (!keepState) this.state = 'off';
  }

  /** Opens a build file in PoB (skipped when it is already open and unchanged). */
  async load(file, mainGroup = null) {
    let mtime = 0;
    try { mtime = fs.statSync(file).mtimeMs; } catch { /* checked by the caller */ }
    if (this.loaded && this.loaded.file === file && this.loaded.mtime === mtime && this.loaded.mainGroup === mainGroup) return this.loaded.summary;
    let r;
    if (this.loaded && this.loaded.file === file && this.loaded.mtime === mtime) r = this.loaded.summary;
    else r = await this.send({ op: 'load', xml: fs.readFileSync(file, 'utf8'), name: path.basename(file).replace(/\.xml$/i, '') });
    // the main skill you picked for this build
    if (mainGroup) r = await this.send({ op: 'main', group: mainGroup });
    this.loaded = { file, mtime, mainGroup, summary: r };
    return r;
  }

  /** The open build's numbers, skills, gear and gems. */
  stats() { return this.send({ op: 'stats' }, 60000); }

  /** What equipping an item does in each slot it fits. */
  compare(itemText) { return this.send({ op: 'compare', item: itemText }, 60000); }

  /** PoB's Configuration options for the open build (what it shows for this build, and what is set). */
  config() { return this.send({ op: 'config' }, 60000); }

  /** Sets Configuration options; with save, returns the build file's new text too. */
  async setConfig(values, { save = false, name } = {}) {
    const r = await this.send({ op: 'setConfig', values, save, name }, 60000);
    return r;
  }

  /** What each mod is worth on a blank item in that slot (for trade weights). */
  weights(slot, lines) { return this.send({ op: 'weights', slot, lines }, 120000); }

  /** For each gear slot: what one more good mod would do. */
  upgrades() { return this.send({ op: 'upgrades' }, 180000); }

  /** A new build from your character, made by PoB's Import code. Returns the summary and the build file's text. */
  async importCharacter({ character, items, passives, name, config = null }) {
    return this.send({ op: 'import', character, items, passives, name, config }, 120000);
  }
}

/** What an item does, slot by slot: the changes worth showing (DPS first). */
const SHOW = [
  ['dps', 'DPS'], ['Life', 'Life'], ['EnergyShield', 'Energy shield'], ['Mana', 'Mana'], ['TotalEHP', 'Effective HP'],
  ['Armour', 'Armour'], ['Evasion', 'Evasion'], ['SpellSuppressionChance', 'Suppression', '%'], ['BlockChance', 'Block', '%'],
  ['FireResist', 'Fire res', '%'], ['ColdResist', 'Cold res', '%'], ['LightningResist', 'Lightning res', '%'], ['ChaosResist', 'Chaos res', '%'],
  ['MovementSpeedMod', 'Movement speed', 'x'], ['Str', 'Str'], ['Dex', 'Dex'], ['Int', 'Int'],
];
function dpsOf(stats, full) { return full ? (stats.FullDPS || 0) : (stats.CombinedDPS || stats.TotalDPS || 0); }
function summarise(r) {
  if (!r || !r.base) return null;
  const baseDps = dpsOf(r.base, r.full);
  return {
    item: r.item,
    full: r.full,
    slots: (r.slots || []).map((s) => {
      const changes = [];
      for (const [k, label, unit] of SHOW) {
        const before = k === 'dps' ? baseDps : r.base[k];
        const after = k === 'dps' ? dpsOf(s.stats, r.full) : s.stats[k];
        if (typeof before !== 'number' || typeof after !== 'number') continue;
        const diff = after - before;
        if (Math.abs(diff) < (unit === 'x' ? 0.001 : 0.5)) continue;
        changes.push({ key: k, label, before, after, diff, pct: before ? (diff / Math.abs(before)) * 100 : null, unit: unit || '' });
      }
      return { slot: s.slot, current: s.current || null, swap: /Swap/.test(s.slot), changes };
    }),
  };
}

/**
 * The Configuration ticks saved in a PoB build file (only the ones that differ from PoB's defaults; PoB saves
 * no others). The active config set when there are several.
 */
function configFromXml(xml) {
  const out = {};
  const cfg = /<Config\b([^>]*)>([\s\S]*?)<\/Config>/.exec(String(xml || ''));
  if (!cfg) return out;
  let body = cfg[2];
  const active = /activeConfigSet="([^"]*)"/.exec(cfg[1])?.[1];
  const sets = [...body.matchAll(/<ConfigSet\b([^>]*)>([\s\S]*?)<\/ConfigSet>/g)];
  if (sets.length) body = (sets.find((m) => new RegExp(`\\bid="${active}"`).test(m[1])) || sets[0])[2];
  const unq = (v) => v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  for (const m of body.matchAll(/<Input\b([^>]*?)\/?>/g)) {
    const a = m[1];
    const name = /\bname="([^"]*)"/.exec(a)?.[1];
    if (!name) continue;
    const b = /\bboolean="([^"]*)"/.exec(a);
    const n = /\bnumber="([^"]*)"/.exec(a);
    const st = /\bstring="([^"]*)"/.exec(a);
    if (b) out[name] = b[1] === 'true';
    else if (n) out[name] = Number(n[1]);
    else if (st) out[name] = unq(st[1]);
  }
  return out;
}
// these come fresh from each import (pathofexile.com has them), so they aren't carried over
const CONFIG_FROM_IMPORT = new Set(['bandit', 'pantheonMajorGod', 'pantheonMinorGod']);
/** The newest earlier snapshot of a character in the snapshot folder (files are named "<character> <date time>.xml"). */
function lastSnapshotOf(dir, charName) {
  let best = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.xml')) continue;
      const m = /^(.*) \d{4}-\d\d-\d\d \d\d-\d\d\.xml$/i.exec(f);
      if (!m || m[1] !== String(charName).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').trim()) continue;
      const file = path.join(dir, f);
      const mtime = fs.statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime };
    }
  } catch { /* no folder yet */ }
  return best?.file || null;
}

module.exports = { configFromXml, lastSnapshotOf, CONFIG_FROM_IMPORT, summarise, dpsOf, SHOW, PobEngine, snapshotFile, pickCharacter, findPobDir, isPobDir, pobDirs, buildsDirs, listBuilds };
