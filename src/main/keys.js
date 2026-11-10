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
  uIOhook.keyTap(UiohookKey.C, advanced ? [UiohookKey.Ctrl, UiohookKey.Alt] : [UiohookKey.Ctrl]);
  return true;
}

/**
 * A chat message: Enter opens the chat, the text goes in by paste (works with any keyboard layout), Enter
 * sends it. Your clipboard is put back afterwards. send: false leaves it typed, e.g. "@last " for a reply.
 */
async function sendChat(text, { send = true, clipboard } = {}) {
  if (!hook || !clipboard) return false;
  const { uIOhook, UiohookKey } = hook;
  const before = clipboard.readText();
  for (const k of [UiohookKey.Shift, UiohookKey.Ctrl, UiohookKey.Alt]) { try { uIOhook.keyToggle(k, 'up'); } catch { /* ignore */ } }
  clipboard.writeText(text);
  uIOhook.keyTap(UiohookKey.Enter);
  await wait(60);
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

module.exports = { hasKeySender, sendCopy, sendChat, onMouse, stopHook };
