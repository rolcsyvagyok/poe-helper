'use strict';
/**
 * Maps run, from the game's Client.txt: each new map instance logs
 *   2026/11/22 17:01:02 123 abc [DEBUG Client 456] Generating level 83 area "MapWorldsCemetery" with seed 1234
 * A map is an area whose id starts with "Map" (not a hideout); one seed is one map, so going back
 * into the same map through a portal isn't counted twice. The file is read from the end, only as far back as needed.
 */
const fs = require('fs');

const LINE = /^(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)\b.*Generating level (\d+) area "([^"]+)" with seed (\d+)/;
const isMapArea = (id) => /^Map/i.test(id) && !/Hideout/i.test(id);

function parseLine(line) {
  const m = LINE.exec(line);
  if (!m) return null;
  const ts = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); // the game writes local time
  return { ts, level: +m[7], area: m[8], seed: m[9] };
}

/** Maps entered between from and to (ms): { count, maps: [{ ts, area, level }] }. */
function mapsBetween(text, from, to = Infinity) {
  const seen = new Set();
  const maps = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.includes('Generating level')) continue;
    const r = parseLine(line);
    if (!r || r.ts < from || r.ts > to || !isMapArea(r.area)) continue;
    const key = `${r.area}|${r.seed}`;
    if (seen.has(key)) continue;
    seen.add(key);
    maps.push({ ts: r.ts, area: r.area, level: r.level });
  }
  return { count: maps.length, maps };
}

/** Reads the end of Client.txt back to `from` (at most maxBytes) and counts maps. null when the file can't be read. */
function countMaps(file, from, to = Infinity, { maxBytes = 64 * 1024 * 1024 } = {}) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const CHUNK = 1024 * 1024;
    let pos = size; let text = '';
    while (pos > 0 && size - pos < maxBytes) {
      const len = Math.min(CHUNK, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, pos);
      text = buf.toString('utf8') + text;
      // stop once the oldest whole line in what was read is before `from`
      const firstNl = text.indexOf('\n');
      const first = /^(\d{4})\/(\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d)/.exec(pos > 0 ? text.slice(firstNl + 1) : text);
      if (first && new Date(+first[1], +first[2] - 1, +first[3], +first[4], +first[5], +first[6]).getTime() < from) break;
    }
    return mapsBetween(text, from, to);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* */ }
  }
}

module.exports = { countMaps, mapsBetween, parseLine, isMapArea };
