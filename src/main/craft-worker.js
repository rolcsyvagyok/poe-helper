'use strict';
/**
 * The best-fossils search (core/craft-sim bestFossils) takes a second or two, so it runs here, in its own
 * process (Electron's utilityProcess), and the app keeps answering hotkeys meanwhile.
 * In: { id, state, targets }. Out: { id, result } or { id, error }.
 */
const { bestFossils } = require('../core/craft-sim');

process.parentPort.on('message', (e) => {
  const msg = e.data || {};
  try { process.parentPort.postMessage({ id: msg.id, result: bestFossils(msg.state, msg.targets) }); } catch (err) { process.parentPort.postMessage({ id: msg.id, error: String(err?.message || err) }); }
});
