'use strict';
/**
 * Runs Path of Building (your installed copy) headless in its own process: PoB's own LuaJIT (lua51.dll)
 * through koffi, with src/pob/host.lua driving it. The app sends JSON requests, this answers them.
 * Started with Electron's utilityProcess, its working folder set to the PoB folder (PoB reads its
 * files relative to it).
 */
const path = require('path');

let call = null;
const keep = []; // callbacks Lua holds on to

function start({ pobDir, hostSource, stubSource }) {
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
  // Inflate and Deflate for PoB (its timeless jewel tables are zlib files): SimpleGraphic gives them to PoB,
  // headless they come from Node's zlib
  const zlib = require('zlib');
  const LuaCFunction = koffi.proto('int LuaCFunction(void* L)');
  const pushcclosure = lib.func('void lua_pushcclosure(void* L, LuaCFunction* fn, int n)');
  const setfield = lib.func('void lua_setfield(void* L, int idx, const char* k)');
  const tobytes = lib.func('const void* lua_tolstring(void* L, int idx, _Out_ size_t* len)');
  const pushbytes = lib.func('void lua_pushlstring(void* L, const uint8_t* s, size_t len)');
  const pushnil = lib.func('void lua_pushnil(void* L)');
  const argBytes = (Ls) => {
    const len = [0];
    const ptr = tobytes(Ls, 1, len);
    if (!ptr || !len[0]) return Buffer.alloc(0);
    return Buffer.from(koffi.view(ptr, len[0]));
  };
  const zfn = (fn) => koffi.register((Ls) => {
    try {
      const out = fn(argBytes(Ls));
      pushbytes(Ls, out, out.length);
    } catch { pushnil(Ls); }
    return 1;
  }, koffi.pointer(LuaCFunction));
  keep.push(zfn((b) => { try { return zlib.inflateSync(b); } catch { return zlib.gunzipSync(b); } }), zfn((b) => zlib.deflateSync(b)));
  pushcclosure(L, keep[0], 0); setfield(L, GLOBALS, 'POEHELPER_INFLATE');
  pushcclosure(L, keep[1], 0); setfield(L, GLOBALS, 'POEHELPER_DEFLATE');
  const run = (code, name) => {
    if (loadbuffer(L, code, Buffer.byteLength(code), name) || pcall(L, 0, 0, 0)) {
      const err = tostr(L, -1, null);
      settop(L, 0);
      throw new Error(err);
    }
  };
  const dir = pobDir.replace(/\\/g, '/').replace(/'/g, "\\'");
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
