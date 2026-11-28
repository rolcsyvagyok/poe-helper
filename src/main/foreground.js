'use strict';
/**
 * Which window is in front (Windows only), through koffi and user32: so chat macros on F1-F5 only take
 * those keys while Path of Exile is the active window, and every other app keeps its F keys.
 */
let api;
function load() {
  if (api !== undefined) return api;
  api = null;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const u = koffi.load('user32.dll');
    api = {
      fg: u.func('intptr_t __stdcall GetForegroundWindow()'),
      cls: u.func('int __stdcall GetClassNameW(intptr_t hWnd, _Out_ uint16_t *buf, int n)'),
      title: u.func('int __stdcall GetWindowTextW(intptr_t hWnd, _Out_ uint16_t *buf, int n)'),
    };
    try {
      const RECT = koffi.struct('PH_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
      const POINT = koffi.struct('PH_POINT', { x: 'int32', y: 'int32' });
      api.find = u.func('intptr_t __stdcall FindWindowW(str16 cls, str16 name)');
      api.client = u.func('bool __stdcall GetClientRect(intptr_t hWnd, _Out_ PH_RECT *r)');
      api.toScreen = u.func('bool __stdcall ClientToScreen(intptr_t hWnd, _Inout_ PH_POINT *p)');
      api.iconic = u.func('bool __stdcall IsIconic(intptr_t hWnd)');
      void RECT; void POINT;
    } catch { /* no window rect: the stream window shows the whole screen */ }
    try { api.mouse = u.func('void __stdcall mouse_event(uint32 flags, uint32 dx, uint32 dy, uint32 data, uintptr_t extra)'); } catch { /* no clicks */ }
  } catch { api = null; }
  return api;
}
const read = (fn, hwnd) => { const b = new Uint16Array(256); const n = fn(hwnd, b, 256); return n > 0 ? String.fromCharCode(...b.subarray(0, n)) : ''; };

/** True when Path of Exile's window is in front; null when it can't be told (not Windows, no koffi). */
function poeInFront() {
  const a = load();
  if (!a) return null;
  try {
    const h = a.fg();
    if (!h) return false;
    return read(a.cls, h) === 'POEWindowClass' || /^Path of Exile( 2)?$/.test(read(a.title, h));
  } catch { return null; }
}

/** The game's picture on screen in physical pixels {x, y, width, height}, or null (not running, minimised, unknown). */
function poeRect() {
  const a = load();
  if (!a?.find) return null;
  try {
    const h = a.find('POEWindowClass', null);
    if (!h || a.iconic(h)) return null;
    const r = {};
    if (!a.client(h, r)) return null;
    const p = { x: 0, y: 0 };
    if (!a.toScreen(h, p)) return null;
    const width = r.right - r.left; const height = r.bottom - r.top;
    return width > 50 && height > 50 ? { x: p.x, y: p.y, width, height } : null;
  } catch { return null; }
}

/** One left click where the mouse is (Windows). */
function leftClick() {
  const a = load();
  if (!a?.mouse) return false;
  a.mouse(0x0002, 0, 0, 0, 0); // left down
  a.mouse(0x0004, 0, 0, 0, 0); // left up
  return true;
}

module.exports = { poeInFront, poeRect, leftClick };
