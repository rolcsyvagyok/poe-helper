'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Tiny JSON-on-disk cache. Each key is one file so a corrupt write only loses one entry.
 * Entries: { savedAt, etag, lastModified, data }
 */
class DiskCache {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.mem = new Map();
  }

  file(key) {
    return path.join(this.dir, key.replace(/[^a-z0-9._-]+/gi, '_') + '.json');
  }

  get(key) {
    if (this.mem.has(key)) return this.mem.get(key);
    try {
      const entry = JSON.parse(fs.readFileSync(this.file(key), 'utf8'));
      this.mem.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  set(key, data, meta = {}) {
    const entry = { savedAt: Date.now(), etag: meta.etag || null, lastModified: meta.lastModified || null, data };
    this.mem.set(key, entry);
    const f = this.file(key);
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(entry));
    fs.renameSync(tmp, f);
    return entry;
  }

  touch(key) {
    const e = this.get(key);
    if (e) this.set(key, e.data, e);
  }

  isFresh(key, ttlMs) {
    const e = this.get(key);
    return !!e && Date.now() - e.savedAt < ttlMs;
  }

  delete(key) {
    this.mem.delete(key);
    try { fs.unlinkSync(this.file(key)); } catch { /* ignore */ }
  }
}

/** Simple JSON document store for settings/snapshots. */
class JsonStore {
  constructor(file, defaults = {}) {
    this.file = file;
    this.defaults = defaults;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      this.data = { ...structuredClone(defaults), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      this.data = structuredClone(defaults);
    }
  }
  get(k) { return k == null ? this.data : this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }
  patch(obj) { Object.assign(this.data, obj); this.save(); }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { DiskCache, JsonStore };
