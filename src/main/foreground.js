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
    return read(a.cls, h) === 'POEWindowClass' || /^Path of Exile$/.test(read(a.title, h));
  } catch { return null; }
}

module.exports = { poeInFront };
