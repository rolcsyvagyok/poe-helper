'use strict';
/**
 * Sends Ctrl+C (or Ctrl+Alt+C for the advanced item description) to the game, and watches
 * the mouse so the price popup can close when you move away. Uses the optional native module
 * `uiohook-napi`. Without it the app still works: press Ctrl+C on the item yourself.
 */

let hook = null;
try {
  hook = require('uiohook-napi');
} catch {
  hook = null;
}

function hasKeySender() {
  return !!hook;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HOLD_MS = 40; // about two frames at 50 fps

/**
 * @param advanced  Ctrl+Alt+C (mod tiers and names) instead of Ctrl+C
 * @param held      modifiers of the hotkey the player is still holding, e.g. ['Alt'] for Alt+E.
 *                  They are released first; otherwise Alt+E would turn the copy into Ctrl+Alt+C.
 */
async function sendCopy({ advanced = false, held = [] } = {}) {
  if (!hook) return false;
  const { uIOhook, UiohookKey } = hook;
  const release = new Set(['Shift', ...held]);
  if (advanced) release.delete('Alt');
  for (const m of release) {
    const k = { Alt: UiohookKey.Alt, Shift: UiohookKey.Shift, Ctrl: UiohookKey.Ctrl, Super: UiohookKey.Meta }[m];
    if (k != null) { try { uIOhook.keyToggle(k, 'up'); } catch { /* ignore */ } }
  }
  if (release.size) await wait(15); // let the game see the release before the copy
  // Keys are held for a few frames, like a person does: the game reads the keyboard once a frame, and
  // an instant tap can fall between two frames when the game runs slow (a busy Tier 16 map, say).
  const mods = advanced ? [UiohookKey.Ctrl, UiohookKey.Alt] : [UiohookKey.Ctrl];
  try {
    for (const m of mods) uIOhook.keyToggle(m, 'down');
    await wait(HOLD_MS);
    uIOhook.keyToggle(UiohookKey.C, 'down');
    await wait(HOLD_MS);
    uIOhook.keyToggle(UiohookKey.C, 'up');
    await wait(10);
  } finally {
    // let go of everything (as a key tap does), so no key is left stuck down
    for (const m of mods) { try { uIOhook.keyToggle(m, 'up'); } catch { /* ignore */ } }
  }
  return true;
}

/**
 * A chat message: Enter opens the chat, the text goes in by paste (works with any keyboard layout), Enter
 * sends it. Your clipboard is put back afterwards. send: false leaves it typed, e.g. "@last " for a reply.
 */
async function sendChat(text, { send = true, clipboard, clear = true } = {}) {
  if (!hook || !clipboard) return false;
  const { uIOhook, UiohookKey } = hook;
  const before = clipboard.readText();
  for (const k of [UiohookKey.Shift, UiohookKey.Ctrl, UiohookKey.Alt]) { try { uIOhook.keyToggle(k, 'up'); } catch { /* ignore */ } }
  clipboard.writeText(text);
  uIOhook.keyTap(UiohookKey.Enter);
  await wait(60);
  if (clear) {
    // Enter, Backspace, Backspace, then the text: the first Backspace drops a waiting "^" (or another accent
    // key), the second anything left in front of the text
    for (let i = 0; i < 2; i += 1) { uIOhook.keyTap(UiohookKey.Backspace); await wait(30); }
  }
  uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl]);
  await wait(60);
  if (send) uIOhook.keyTap(UiohookKey.Enter);
  await wait(120);
  clipboard.writeText(before);
  return true;
}

let started = false;
const mouseListeners = new Set();

/** fn('move' | 'down') on every global mouse event. Returns an unsubscribe function. */
function onMouse(fn) {
  if (!hook) return () => {};
  const { uIOhook } = hook;
  if (!started) {
    try {
      uIOhook.on('mousemove', () => mouseListeners.forEach((f) => f('move')));
      uIOhook.on('mousedown', () => mouseListeners.forEach((f) => f('down')));
      uIOhook.start();
      started = true;
    } catch {
      return () => {};
    }
  }
  mouseListeners.add(fn);
  return () => mouseListeners.delete(fn);
}

function stopHook() {
  if (hook && started) { try { hook.uIOhook.stop(); } catch { /* ignore */ } started = false; }
}

/**
 * One click for a hotkey: a left click where the mouse is, or Alt + left click. One click per key press
 * (GGG's rule: one action per key press). The hotkey's own modifiers are let go first, so Alt+Q doesn't
 * turn a plain click into an Alt click.
 */
async function sendClick({ alt = false, held = [], click } = {}) {
  if (!hook || !click) return false;
  const { uIOhook, UiohookKey } = hook;
  const M = { Alt: UiohookKey.Alt, Shift: UiohookKey.Shift, Ctrl: UiohookKey.Ctrl, Super: UiohookKey.Meta };
  for (const m of held) { if (M[m] != null && !(alt && m === 'Alt')) { try { uIOhook.keyToggle(M[m], 'up'); } catch { /* ignore */ } } }
  if (held.length) await wait(15);
  try {
    if (alt) { uIOhook.keyToggle(UiohookKey.Alt, 'down'); await wait(HOLD_MS); }
    click();
    await wait(HOLD_MS);
  } finally {
    if (alt) { try { uIOhook.keyToggle(UiohookKey.Alt, 'up'); } catch { /* ignore */ } }
  }
  return true;
}

module.exports = { hasKeySender, sendCopy, sendChat, sendClick, onMouse, stopHook };
