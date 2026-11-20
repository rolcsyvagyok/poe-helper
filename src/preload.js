'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'state:get', 'hotkeys:pause', 'hotkeys:resume', 'leagues:list', 'settings:set', 'session:set', 'session:login', 'trade:prepare', 'trade:search', 'trade:openSite', 'trade:bulk', 'price:guess',
  'networth:tabs', 'networth:select', 'networth:snapshot', 'networth:session', 'networth:report', 'networth:compare', 'networth:clear',
  'filter:list', 'filter:overrides', 'filter:saveOverrides', 'filter:write', 'filter:quick', 'filter:economyRules', 'prices:units', 'app:version', 'app:changelog', 'app:notesSeen', 'update:status', 'update:check', 'update:install', 'bases:list', 'matrix:get', 'cluster:get', 'stream:source', 'stream:open', 'cluster:set', 'cluster:auto', 'merc:analyze', 'craft:bases', 'craft:view', 'craft:simStart', 'craft:simView', 'craft:simAct', 'craft:fossilOdds', 'craft:bestFossils', 'talisman:get', 'talisman:set', 'matrix:set', 'matrix:opts', 'campaignHide:set', 'maps:hide', 'collection:set', 'collection:list', 'collection:get', 'collection:fromStash', 'currency:showAll', 'filter:strictness', 'regex:mapView', 'regex:mapBuild', 'regex:beastView', 'regex:beastBuild', 'regex:itemBases', 'regex:itemView', 'regex:itemBuild', 'regex:campaignView', 'regex:campaignBuild', 'regex:gemView', 'regex:gemBuild', 'pob:state', 'pob:set', 'pob:pickDir', 'pob:openFolder', 'pob:characters', 'pob:snapshot', 'pob:builds', 'pob:stats', 'pob:upgrades', 'pob:calcs', 'pob:breakdown', 'pob:tree', 'pob:autoConfig', 'pob:itemTooltip', 'pob:treeArt', 'pob:node', 'pob:treeEdit', 'pob:power', 'pob:anoints', 'pob:optStart', 'pob:optStep', 'pob:optEnd', 'pob:supportGems', 'pob:timeless', 'pob:timelessTrade', 'pob:levelPlan', 'pob:findItem', 'pob:setMain', 'pob:skillOpt', 'pob:buildSet', 'pob:setCurrent', 'pob:setLevelling', 'pob:buildGems', 'pob:gemRegex', 'pob:renameBuild', 'pob:trashBuild', 'pob:config', 'pob:setConfig', 'pob:icon', 'pob:openInPob', 'pob:exportCode', 'pob:sharePobb', 'pob:importCode', 'clipboard:item', 'regex:mapTrade', 'regex:savePreset', 'trade:list', 'trade:save', 'trade:remove', 'trade:move', 'trade:check', 'trade:open', 'regex:deletePreset', 'clipboard:write', 'ranks:set', 'ranks:kind', 'ranks:auto', 'ranks:default', 'bases:add', 'bases:update', 'bases:remove', 'bases:style', 'tiers:stack', 'filterShare:export', 'filterShare:import', 'filterShare:undo', 'appShare:export', 'appShare:import', 'appShare:undo', 'appShare:canUndo', 'filterShare:canUndo', 'tiers:cond', 'tiers:add', 'tiers:remove', 'tiers:rename', 'art:icons', 'gems:where', 'icons:list', 'icons:import', 'icons:delete', 'appIcon:get', 'overviewBg:get', 'overviewBg:pick', 'overviewBg:reset', 'appIcon:pick', 'appIcon:reset', 'appIcon:style', 'tray:hide', 'sounds:list', 'sounds:import', 'sounds:data', 'gameSounds:extract', 'app:resetAll', 'app:undoReset', 'app:canUndoReset', 'filter:explain', 'filter:render',
  'font:get', 'font:pick', 'font:clear', 'tiers:view', 'tiers:prices', 'tiers:action', 'tiers:suggest', 'designer:state', 'designer:random', 'designer:draft', 'designer:sizes', 'designer:apply', 'designer:undo', 'designer:saveTheme', 'designer:deleteTheme', 'review:run', 'farm:dashboard', 'farm:group', 'review:apply', 'review:undo', 'review:log', 'review:config', 'tiers:move', 'tiers:unlisted', 'tiers:style', 'tiers:styles', 'rarelooks:theme', 'tiers:reset', 'themes:list', 'themes:save', 'themes:apply', 'themes:delete', 'themes:export', 'themes:import',
  'lab:get', 'lab:favorite', 'lab:show', 'lab:hide', 'lab:opacity', 'overlay:hide', 'overlay:resize', 'overlay:keep', 'overlay:snapshotCompare', 'overlay:resetPos', 'shell:open', 'app:show',
]);
const EVENTS = new Set(['pob:copied', 'prices:units', 'app:version', 'app:changelog', 'app:notesSeen', 'update:status', 'lab:pick', 'overlay:kept', 'overlay:show', 'overlay:pob', 'pob:buildsChanged', 'toast', 'networth:updated', 'filter:rebuilt', 'history:updated', 'gameSounds:changed', 'uiTheme:changed', 'app:goto', 'pob:changed', 'trade:watched', 'pob:findProgress']);

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
