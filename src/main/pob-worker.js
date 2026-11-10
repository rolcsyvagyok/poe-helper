'use strict';
/**
 * Runs Path of Building (your installed copy) headless in its own process: PoB's own LuaJIT (lua51.dll)
 * through koffi, with src/pob/host.lua driving it. The app sends JSON requests, this answers them.
 * Started with Electron's utilityProcess, its working folder set to the PoB folder (PoB reads its
 * files relative to it).
 */
const path = require('path');

let call = null;

// the timeless jewel tables, unpacked: { [packed size]: unpacked file }
function unpackTimeless(pobDir, cacheDir) {
  const fs = require('fs');
  const zlib = require('zlib');
  const out = {};
  const dataDir = path.join(pobDir, 'Data', 'TimelessJewelData');
  if (!cacheDir || !fs.existsSync(dataDir)) return out;
  const names = new Set(fs.readdirSync(dataDir).map((f) => /^(\w+)\.zip(\.part\d+)?$/.exec(f)?.[1]).filter(Boolean));
  fs.mkdirSync(cacheDir, { recursive: true });
  for (const name of names) {
    try {
      const single = path.join(dataDir, `${name}.zip`);
      const parts = fs.existsSync(single) ? [single] : fs.readdirSync(dataDir).filter((f) => f.startsWith(`${name}.zip.part`))
        .sort((x, y) => Number(x.split('part')[1]) - Number(y.split('part')[1])).map((f) => path.join(dataDir, f));
      const size = parts.reduce((n, f) => n + fs.statSync(f).size, 0);
      const bin = path.join(cacheDir, `${name}-${size}.bin`);
      // tables of an older PoB (another size) go
      for (const f of fs.readdirSync(cacheDir)) if (f.startsWith(`${name}-`) && f !== path.basename(bin)) { try { fs.unlinkSync(path.join(cacheDir, f)); } catch { /* in use */ } }
      if (!fs.existsSync(bin)) {
        const data = zlib.inflateSync(Buffer.concat(parts.map((f) => fs.readFileSync(f))));
        fs.writeFileSync(`${bin}.tmp`, data);
        fs.renameSync(`${bin}.tmp`, bin);
      }
      out[size] = bin.replace(/\\/g, '/');
    } catch { /* that jewel's table stays unavailable, as in PoB without it */ }
  }
  return out;
}

function start({ pobDir, hostSource, stubSource, cacheDir }) {
  const koffi = require('koffi');
  const lib = koffi.load(path.join(pobDir, 'lua51.dll'));
  const newstate = lib.func('void* luaL_newstate()');
  const openlibs = lib.func('void luaL_openlibs(void* L)');
  const loadbuffer = lib.func('int luaL_loadbuffer(void* L, const char* buf, size_t size, const char* name)');
  const pcall = lib.func('int lua_pcall(void* L, int nargs, int nresults, int errfunc)');
  const tostr = lib.func('const char* lua_tolstring(void* L, int idx, void* len)');
  const settop = lib.func('void lua_settop(void* L, int idx)');
  const getfield = lib.func('void lua_getfield(void* L, int idx, const char* k)');
  const pushlstring = lib.func('void lua_pushlstring(void* L, const char* s, size_t len)');
  const GLOBALS = -10002;

  const L = newstate();
  openlibs(L);
  // PoB's timeless jewel tables are zlib files it unpacks with SimpleGraphic's Inflate. Headless, they are
  // unpacked here once into the app's cache folder, and Inflate (SimpleGraphic.lua) reads the unpacked file
  // that matches the data it is given (by its size). No calls from Lua back into JavaScript.
  const inflated = unpackTimeless(pobDir, cacheDir);
  const run = (code, name) => {
    if (loadbuffer(L, code, Buffer.byteLength(code), name) || pcall(L, 0, 0, 0)) {
      const err = tostr(L, -1, null);
      settop(L, 0);
      throw new Error(err);
    }
  };
  const dir = pobDir.replace(/\\/g, '/').replace(/'/g, "\\'");
  const lua = (t) => `'${String(t).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  run(`POEHELPER_INFLATED = { ${Object.entries(inflated).map(([n, f]) => `[${Number(n)}] = ${lua(f)}`).join(', ')} }`, '=poehelper-inflate');
  run(`POEHELPER_EMBEDDED = true
package.path = '${dir}/lua/?.lua;${dir}/lua/?/init.lua;${dir}/?.lua;' .. package.path
package.cpath = '${dir}/?.dll;' .. package.cpath`, '=poehelper');
  if (stubSource) run(stubSource, '@SimpleGraphic.lua'); // PoB's headless stand-ins; installed PoB doesn't ship them
  run(hostSource, '@host.lua');
  getfield(L, GLOBALS, 'POEHELPER_STARTUP_ERROR');
  const startErr = tostr(L, -1, null);
  settop(L, 0);
  if (startErr) throw new Error(String(startErr).replace(/\^\d/g, '').split('\n').filter(Boolean).slice(0, 2).join(' '));

  call = (req) => {
    const line = JSON.stringify(req);
    getfield(L, GLOBALS, 'handle');
    pushlstring(L, line, Buffer.byteLength(line));
    const r = pcall(L, 1, 1, 0);
    const out = tostr(L, -1, null);
    settop(L, 0);
    if (r) throw new Error(out);
    return JSON.parse(out);
  };
}

process.parentPort.on('message', (e) => {
  const msg = e.data || {};
  try {
    if (msg.op === 'start') {
      const t = Date.now();
      start(msg);
      process.parentPort.postMessage({ id: msg.id, ready: true, ms: Date.now() - t });
    } else if (!call) {
      process.parentPort.postMessage({ id: msg.id, error: 'Path of Building is not running.' });
    } else {
      process.parentPort.postMessage(call(msg));
    }
  } catch (err) {
    process.parentPort.postMessage({ id: msg.id, error: String(err.message || err) });
  }
});
