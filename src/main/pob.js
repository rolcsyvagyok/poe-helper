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
        if (m.error && !m.stats) p.reject(new Error(m.error)); else p.resolve(m);
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
    if (!keepState) this.state = 'off';
  }

  /** A new build from your character, made by PoB's Import code. Returns the summary and the build file's text. */
  async importCharacter({ character, items, passives, name }) {
    return this.send({ op: 'import', character, items, passives, name }, 120000);
  }
}

module.exports = { PobEngine, snapshotFile, pickCharacter, findPobDir, isPobDir, pobDirs, buildsDirs, listBuilds };
