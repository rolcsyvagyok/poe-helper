'use strict';
/**
 * Preview copies of the game's own item filter alert sounds (PlayAlertSound 1-16 and the named ones
 * like ShDivine), made from the Path of Exile install on this PC. Nothing from the game ships with the
 * app: each player's app reads their own game files and keeps the copies in its data folder.
 *
 * Where they are: FMOD/Desktop/ItemFilter.bank in the game folder (Steam or the standalone client).
 * A bank is a RIFF file holding an FSB5 sound bank; the sounds in it are FMOD's Vorbis: raw Vorbis
 * audio packets without the three Vorbis headers. FMOD's encoder uses a few fixed "setup" headers,
 * named by their CRC32; vorbis-setups.bin holds them (from vgmstream / python-fsb5, see
 * vorbis-setups.LICENSE). This file rebuilds the headers and wraps everything as a normal .ogg file.
 */

const fs = require('fs');
const path = require('path');

const FREQ = { 1: 8000, 2: 11000, 3: 11025, 4: 16000, 5: 22050, 6: 24000, 7: 32000, 8: 44100, 9: 48000 };
const MODE_VORBIS = 15;

/** The game folders to look in, most likely first. */
function candidateDirs({ env = process.env, extra = [] } = {}) {
  const pf = [env['ProgramFiles(x86)'], env.ProgramFiles, 'C:\\Program Files (x86)', 'C:\\Program Files'].filter(Boolean);
  const out = [...extra];
  for (const root of pf) {
    out.push(path.join(root, 'Steam', 'steamapps', 'common', 'Path of Exile'));
    out.push(path.join(root, 'Grinding Gear Games', 'Path of Exile'));
  }
  for (const d of 'CDEFGH') {
    out.push(`${d}:\\Steam\\steamapps\\common\\Path of Exile`);
    out.push(`${d}:\\SteamLibrary\\steamapps\\common\\Path of Exile`);
    out.push(`${d}:\\Games\\Path of Exile`);
    out.push(`${d}:\\Path of Exile`);
  }
  return [...new Set(out)];
}

const bankIn = (dir) => path.join(dir, 'FMOD', 'Desktop', 'ItemFilter.bank');

/** The game folder that has the alert sounds, or null. */
function findGameDir(opts) {
  for (const d of candidateDirs(opts)) {
    try { if (fs.statSync(bankIn(d)).isFile()) return d; } catch { /* not here */ }
  }
  return null;
}

/** FSB5 inside a bank: [{ name, rate, channels, samples, setupId, data }] */
function readFsb5(buf) {
  const at = buf.indexOf('FSB5');
  if (at < 0) throw new Error('No FMOD sound bank in this file.');
  const u32 = (o) => buf.readUInt32LE(o);
  const version = u32(at + 4);
  const count = u32(at + 8);
  const headersSize = u32(at + 12);
  const namesSize = u32(at + 16);
  const dataSize = u32(at + 20);
  const mode = u32(at + 24);
  if (mode !== MODE_VORBIS) throw new Error(`Unexpected sound format (${mode}).`);
  const base = at + (version === 0 ? 64 : 60);
  const namesAt = base + headersSize;
  const dataAt = namesAt + namesSize;
  let p = base;
  const list = [];
  for (let i = 0; i < count; i++) {
    const raw = buf.readBigUInt64LE(p); p += 8;
    let next = Number(raw & 1n);
    const s = {
      rate: FREQ[Number((raw >> 1n) & 0xFn)] || 44100,
      channels: Number((raw >> 5n) & 1n) + 1,
      offset: Number((raw >> 6n) & 0x0FFFFFFFn) * 16,
      samples: Number((raw >> 34n) & 0x3FFFFFFFn),
      setupId: null,
    };
    while (next) {
      const c = u32(p); p += 4;
      next = c & 1;
      const size = (c >>> 1) & 0xFFFFFF;
      const type = (c >>> 25) & 0x7F;
      if (type === 1) s.channels = buf[p];
      else if (type === 2) s.rate = u32(p);
      else if (type === 11) s.setupId = u32(p);
      p += size;
    }
    list.push(s);
  }
  const names = [];
  for (let i = 0; i < count; i++) {
    const o = namesAt + u32(namesAt + i * 4);
    names.push(buf.toString('latin1', o, buf.indexOf(0, o)));
  }
  const ends = list.map((s) => s.offset).sort((a, b) => a - b);
  return list.map((s, i) => {
    const end = ends.find((e) => e > s.offset) ?? dataSize;
    return { ...s, name: names[i], data: buf.subarray(dataAt + s.offset, dataAt + end) };
  });
}

/** vorbis-setups.bin: "VFVS", count, then [crc, offset, size] */
function loadSetups(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'VFVS') throw new Error('Bad Vorbis setup table.');
  const map = new Map();
  for (let i = 0, n = b.readUInt32LE(4); i < n; i++) {
    const o = 8 + i * 12;
    map.set(b.readUInt32LE(o), b.subarray(b.readUInt32LE(o + 4), b.readUInt32LE(o + 4) + b.readUInt32LE(o + 8)));
  }
  return map;
}

// ---------- Ogg ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();
function oggCrc(buf) {
  let c = 0;
  for (let i = 0; i < buf.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  return c >>> 0;
}

/** One Ogg page holding whole packets. */
function oggPage(packets, { serial, seq, granule, first = false, last = false }) {
  const lacing = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) { lacing.push(255); n -= 255; }
    lacing.push(n);
  }
  const head = Buffer.alloc(27 + lacing.length);
  head.write('OggS', 0, 'latin1');
  head[4] = 0;
  head[5] = (first ? 2 : 0) | (last ? 4 : 0);
  head.writeBigInt64LE(BigInt(granule), 6);
  head.writeUInt32LE(serial, 14);
  head.writeUInt32LE(seq, 18);
  head[26] = lacing.length;
  Buffer.from(lacing).copy(head, 27);
  const page = Buffer.concat([head, ...packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

function idHeader(channels, rate) {
  const b = Buffer.alloc(30);
  b[0] = 1; b.write('vorbis', 1, 'latin1');
  b.writeUInt32LE(0, 7); b[11] = channels; b.writeUInt32LE(rate, 12);
  b.writeInt32LE(0, 16); b.writeInt32LE(0, 20); b.writeInt32LE(0, 24);
  b[28] = (11 << 4) | 8; // FMOD's fixed block sizes: 256 short, 2048 long
  b[29] = 1;
  return b;
}
function commentHeader() {
  const vendor = Buffer.from('PoE Helper', 'latin1');
  const b = Buffer.alloc(7 + 4 + vendor.length + 4 + 1);
  b[0] = 3; b.write('vorbis', 1, 'latin1');
  b.writeUInt32LE(vendor.length, 7); vendor.copy(b, 11);
  b.writeUInt32LE(0, 11 + vendor.length);
  b[b.length - 1] = 1;
  return b;
}

/** FMOD Vorbis sample -> .ogg file. */
function toOgg(sample, setups) {
  const setup = setups.get(sample.setupId);
  if (!setup) throw new Error(`No Vorbis setup for ${sample.name} (${(sample.setupId >>> 0).toString(16)}).`);
  // the audio: [u16 size][packet] ... (0 or 0xFFFF ends it)
  const packets = [];
  for (let o = 0; o + 2 <= sample.data.length;) {
    const n = sample.data.readUInt16LE(o); o += 2;
    if (!n || n === 0xffff || o + n > sample.data.length) break;
    packets.push(sample.data.subarray(o, o + n)); o += n;
  }
  if (!packets.length) throw new Error(`${sample.name} has no audio.`);
  const serial = 0x504f4548; // "POEH"
  const pages = [
    oggPage([idHeader(sample.channels, sample.rate)], { serial, seq: 0, granule: 0, first: true }),
    oggPage([commentHeader(), setup], { serial, seq: 1, granule: 0 }),
  ];
  // audio pages of up to ~32 KB; the last one carries the exact length, the others an even share
  const groups = [];
  let cur = [], size = 0, segs = 0;
  for (const p of packets) {
    const s = Math.floor(p.length / 255) + 1;
    if (cur.length && (size + p.length > 32000 || segs + s > 255)) { groups.push(cur); cur = []; size = 0; segs = 0; }
    cur.push(p); size += p.length; segs += s;
  }
  if (cur.length) groups.push(cur);
  let done = 0;
  groups.forEach((g, i) => {
    done += g.length;
    const last = i === groups.length - 1;
    const granule = last ? sample.samples : Math.round((sample.samples * done) / packets.length);
    pages.push(oggPage(g, { serial, seq: 2 + i, granule, last }));
  });
  return Buffer.concat(pages);
}

/** "AlertSound_06" -> "6", "SH22Divine" -> "ShDivine" (the names PlayAlertSound uses). */
function soundIdOf(name) {
  let m = /^AlertSound_(\d+)$/.exec(name);
  if (m) return String(Number(m[1]));
  m = /^SH22(\w+)$/.exec(name);
  if (m) return `Sh${m[1]}`;
  return null;
}

/**
 * Make preview copies in outDir: { "1": "game-1.ogg", ..., "ShDivine": "game-ShDivine.ogg" }.
 * The bank is read where the game keeps it and never changed.
 */
function extract({ gameDir, outDir, setupsFile }) {
  const bank = bankIn(gameDir);
  const samples = readFsb5(fs.readFileSync(bank));
  const setups = loadSetups(setupsFile);
  fs.mkdirSync(outDir, { recursive: true });
  const files = {};
  const failed = [];
  for (const s of samples) {
    const id = soundIdOf(s.name);
    if (!id) continue;
    try {
      const file = `game-${id}.ogg`;
      fs.writeFileSync(path.join(outDir, file), toOgg(s, setups));
      files[id] = file;
    } catch (e) { failed.push(`${s.name}: ${e.message}`); }
  }
  return { files, failed, bank, bankMtime: fs.statSync(bank).mtimeMs };
}

module.exports = { candidateDirs, findGameDir, bankIn, readFsb5, loadSetups, toOgg, oggCrc, soundIdOf, extract };
