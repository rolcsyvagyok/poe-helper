'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'state:get', 'hotkeys:pause', 'hotkeys:resume', 'leagues:list', 'settings:set', 'session:set', 'session:login', 'usage:get', 'history:get',
  'price:text', 'trade:prepare', 'trade:search',
  'networth:tabs', 'networth:select', 'networth:snapshot', 'networth:report', 'networth:clear',
  'filter:list', 'filter:overrides', 'filter:saveOverrides', 'filter:write', 'filter:quick', 'filter:economyRules', 'prices:units', 'app:version', 'app:changelog', 'app:notesSeen', 'update:status', 'update:check', 'update:install', 'bases:list', 'matrix:get', 'cluster:get', 'cluster:set', 'matrix:set', 'matrix:opts', 'bases:add', 'bases:update', 'bases:remove', 'bases:style', 'tiers:stack', 'tiers:add', 'tiers:remove', 'tiers:rename', 'art:icons', 'icons:list', 'icons:import', 'icons:delete', 'appIcon:get', 'appIcon:pick', 'appIcon:reset', 'tray:hide', 'sounds:list', 'sounds:import', 'sounds:data', 'gameSounds:get', 'gameSounds:extract', 'filter:explain', 'filter:render',
  'font:get', 'font:pick', 'font:clear', 'tiers:view', 'tiers:prices', 'tiers:action', 'tiers:suggest', 'designer:state', 'designer:draft', 'designer:apply', 'designer:undo', 'designer:saveTheme', 'designer:deleteTheme', 'review:run', 'farm:dashboard', 'review:apply', 'review:undo', 'review:log', 'review:config', 'tiers:move', 'tiers:style', 'tiers:reset', 'themes:list', 'themes:save', 'themes:apply', 'themes:delete', 'themes:export', 'themes:import',
  'lab:get', 'lab:favorite', 'lab:show', 'lab:hide', 'lab:opacity', 'overlay:hide', 'overlay:resize', 'overlay:keep', 'overlay:resetPos', 'shell:open', 'app:show',
]);
const EVENTS = new Set(['prices:units', 'app:version', 'app:changelog', 'app:notesSeen', 'update:status', 'lab:pick', 'overlay:kept', 'overlay:show', 'toast', 'networth:updated', 'filter:rebuilt', 'history:updated', 'gameSounds:changed']);

contextBridge.exposeInMainWorld('poe', {
  async call(channel, ...args) {
    if (!INVOKE.has(channel)) throw new Error(`Blocked channel ${channel}`);
    const res = await ipcRenderer.invoke(channel, ...args);
    if (!res.ok) throw new Error(res.error);
    return res.data;
  },
  on(channel, fn) {
    if (!EVENTS.has(channel)) return () => {};
    const h = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, h);
    return () => ipcRenderer.removeListener(channel, h);
  },
});
