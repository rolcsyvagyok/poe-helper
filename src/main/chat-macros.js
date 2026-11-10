'use strict';
/**
 * Chat macros: a key (F1-F5 by default) presses Enter, types your text and presses Enter again, e.g. /exit to
 * log out to character select. One key press sends one chat message, like typing it yourself.
 * The keys are only taken while Path of Exile is the active window, so other apps keep F1-F5.
 */
const DEFAULT_MACROS = [
  { key: 'F1', text: '/exit', send: true },
  { key: 'F2', text: '/hideout', send: true },
  { key: 'F3', text: '', send: true },
  { key: 'F4', text: '', send: true },
  { key: 'F5', text: '', send: true },
];

function createChatMacros({ globalShortcut, clipboard, keys, foreground, settings, log = () => {} }) {
  let timer = null;
  let active = false; // keys registered right now
  let busy = false;

  const macros = () => (Array.isArray(settings.get('chatMacros')) ? settings.get('chatMacros') : DEFAULT_MACROS)
    .filter((m) => m && m.key && String(m.text || '').trim()).slice(0, 12);

  async function run(m) {
    if (busy) return;
    busy = true;
    try { await keys.sendChat(String(m.text).slice(0, 250), { send: m.send !== false, clipboard }); } catch (e) { log('chat macro failed', e.message); } finally { busy = false; }
  }

  function register() {
    if (active) return;
    active = true;
    for (const m of macros()) {
      try { if (!globalShortcut.register(m.key, () => run(m))) log('chat macro key taken', m.key); } catch (e) { log('chat macro key invalid', m.key, e.message); }
    }
  }
  function unregister() {
    if (!active) return;
    active = false;
    for (const m of macros()) { try { globalShortcut.unregister(m.key); } catch { /* ignore */ } }
  }

  function tick() {
    const front = foreground.poeInFront();
    // can't tell which window is in front: keep the keys off rather than take F1-F5 from every app
    if (front) register(); else unregister();
  }

  /** Start or stop watching, after a settings change or when the other hotkeys were re-registered. */
  function refresh() {
    unregister();
    active = false;
    clearInterval(timer);
    timer = null;
    if (settings.get('chatMacrosOn') === false || !keys.hasKeySender() || foreground.poeInFront() === null) return { on: false, reason: settings.get('chatMacrosOn') === false ? 'off' : 'unsupported' };
    timer = setInterval(tick, 300);
    tick();
    return { on: true };
  }
  function stop() { clearInterval(timer); timer = null; unregister(); }
  return { refresh, stop, status: () => ({ on: !!timer, poeInFront: active }) };
}

module.exports = { createChatMacros, DEFAULT_MACROS };
