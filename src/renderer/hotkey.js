/* Hotkey helpers shared by the settings page (window.Hotkey) and the main process / tests (require).
   Accelerators use Electron's format, e.g. "Alt+E", "Ctrl+Shift+D", "F2". */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Hotkey = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Super'];
  const MOD_ALIASES = { control: 'Ctrl', ctrl: 'Ctrl', commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', super: 'Super', meta: 'Super', cmd: 'Super', command: 'Super' };
  // Combinations that would break normal use of Windows or the game.
  const RESERVED = new Set(['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+A', 'Alt+F4', 'Alt+Tab', 'Ctrl+Alt+Delete', 'Alt+Space', 'Ctrl+Escape', 'Alt+Escape']);

  const CODE_KEYS = {
    Space: 'Space', Enter: 'Return', NumpadEnter: 'Return', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
  };

  /** Key name from a KeyboardEvent, by physical key (so it works the same on Hungarian, German, US layouts). */
  function keyFromCode(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return 'num' + code.slice(6);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
    return CODE_KEYS[code] || null;
  }

  /**
   * KeyboardEvent -> { accelerator } | { pending: true } (only modifiers so far) | { error }.
   */
  function fromEvent(e) {
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');
    if (/^(Control|Alt|Shift|Meta|AltGraph|OS)/.test(e.key || '') || /^(Control|Alt|Shift|Meta|OS)(Left|Right)$/.test(e.code || '')) return { pending: true, mods };
    const key = keyFromCode(e.code || '');
    if (!key) return { error: 'That key can\'t be used for a hotkey.' };
    const accelerator = [...mods, key].join('+');
    const err = validate(accelerator);
    return err ? { error: err, accelerator } : { accelerator };
  }

  function parse(acc) {
    const parts = String(acc || '').split('+').map((p) => p.trim()).filter(Boolean);
    const mods = new Set();
    let key = null;
    for (const p of parts) {
      const m = MOD_ALIASES[p.toLowerCase()];
      if (m) mods.add(m);
      else key = p.length === 1 ? p.toUpperCase() : p;
    }
    return { mods: MOD_ORDER.filter((m) => mods.has(m)), key };
  }

  function normalize(acc) {
    const { mods, key } = parse(acc);
    return key ? [...mods, key].join('+') : '';
  }

  /** Returns a message when the hotkey shouldn't be used, else null. */
  function validate(acc) {
    const { mods, key } = parse(acc);
    if (!key) return 'Press a key together with Ctrl, Alt or Shift.';
    const isF = /^F\d+$/.test(key);
    if (!mods.length && !isF) return 'Add Ctrl, Alt or Shift, otherwise the key stops working while you type or play.';
    if (mods.length === 1 && mods[0] === 'Shift' && !isF) return 'Shift alone changes letters while typing. Use Ctrl or Alt.';
    if (RESERVED.has([...mods, key].join('+'))) return `${label(acc)} is used by Windows or the game.`;
    return null;
  }

  function label(acc) {
    const n = normalize(acc);
    return n ? n.split('+').join(' + ') : 'Off';
  }

  return { fromEvent, parse, normalize, validate, label, keyFromCode };
});
