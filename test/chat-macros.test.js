'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createChatMacros } = require('../src/main/chat-macros');

function fakes({ front = true, on = true } = {}) {
  const reg = new Map();
  const sent = [];
  const settings = { v: { chatMacrosOn: on, chatMacros: [{ key: 'F1', text: '/exit', send: true }, { key: 'F2', text: '', send: true }] }, get(k) { return this.v[k]; } };
  const env = {
    front,
    globalShortcut: { register: (k, fn) => { reg.set(k, fn); return true; }, unregister: (k) => reg.delete(k) },
    clipboard: {}, settings,
    keys: { hasKeySender: () => true, sendChat: async (text, o) => { sent.push([text, o.send]); } },
  };
  env.foreground = { poeInFront: () => env.front };
  return { env, reg, sent };
}

test('chat macros take their keys only while Path of Exile is in front, and skip empty ones', async () => {
  const { env, reg, sent } = fakes();
  const m = createChatMacros(env);
  m.refresh();
  assert.deepEqual([...reg.keys()], ['F1'], 'F2 has no text, so it is not taken');
  await reg.get('F1')();
  assert.deepEqual(sent, [['/exit', true]]);
  env.front = false;
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(reg.size, 0, 'another app in front: F1 is given back');
  m.stop();
});

test('chat macros switched off take no keys', () => {
  const { env, reg } = fakes({ on: false });
  const m = createChatMacros(env);
  assert.equal(m.refresh().on, false);
  assert.equal(reg.size, 0);
});
