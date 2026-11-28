'use strict';
/* Path of Exile 2 price check: reads a copied PoE2 item, matches its mods to the trade site's stat list
   (GET /api/trade2/data/stats) and builds the trade search (POST /api/trade2/search/poe2/{league}).
   The rows it returns have the same shape as the PoE1 trade panel's, so the same panel draws them.
   How the search starts (which mods are ticked, totals, a stat listed twice searched as "any of them") follows
   Exiled Exchange 2 and Sidekick (both MIT), written here from scratch. */

const { parseItem } = require('../item-parser');

// item class (as the game copies it) -> the trade site's category
const CATEGORY = {
  Amulets: 'accessory.amulet', Rings: 'accessory.ring', Belts: 'accessory.belt',
  'Body Armours': 'armour.chest', Boots: 'armour.boots', Gloves: 'armour.gloves', Helmets: 'armour.helmet',
  Shields: 'armour.shield', Bucklers: 'armour.buckler', Foci: 'armour.focus', Quivers: 'armour.quiver',
  Bows: 'weapon.bow', Crossbows: 'weapon.crossbow', Wands: 'weapon.wand', Staves: 'weapon.staff', Quarterstaves: 'weapon.warstaff',
  Sceptres: 'weapon.sceptre', Spears: 'weapon.spear', Flails: 'weapon.flail', Talismans: 'weapon.talisman', Claws: 'weapon.claw',
  Daggers: 'weapon.dagger', 'One Hand Axes': 'weapon.oneaxe', 'One Hand Maces': 'weapon.onemace', 'One Hand Swords': 'weapon.onesword',
  'Two Hand Axes': 'weapon.twoaxe', 'Two Hand Maces': 'weapon.twomace', 'Two Hand Swords': 'weapon.twosword', 'Fishing Rods': 'weapon.rod',
  Jewels: 'jewel', 'Life Flasks': 'flask.life', 'Mana Flasks': 'flask.mana', Charms: 'flask.charm', Relics: 'sanctum.relic',
  Waystones: 'map.waystone', Tablet: 'map.tablet', Tablets: 'map.tablet', 'Map Fragments': 'map.fragment', Logbooks: 'map.logbook', 'Expedition Logbooks': 'map.logbook',
  'Pinnacle Keys': 'map.bosskey', Breachstones: 'map.breachstone', 'Skill Gems': 'gem.activegem', 'Support Gems': 'gem.supportgem', 'Meta Gems': 'gem.metagem',
  Omen: 'currency.omen', Omens: 'currency.omen', 'Soul Cores': 'currency.soulcore', Runes: 'currency.rune', Idols: 'currency.idol', Augment: 'currency.socketable',
};
const WEAPON = /^weapon\./;
const ARMOUR = /^armour\.(chest|boots|gloves|helmet|shield|buckler|focus)$/;

// lines that describe the item, not mods
const NOT_A_MOD = /^(Creates (a|an) |Upgrades (a|an) |Place (this item|into)|Right click|Can only be (equipped|used)|Currently has \d|Lasts \d|Consumes \d|You cannot use this item|Used automatically|Travel to|Can be used|Shift click|Socket-bound|Bind |Unidentified|Corrupted|Mirrored|Sanctified|Twice Corrupted|Note:|Requires |Grants Skill: )/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '\'').replace(/\s+/g, ' ').trim();

/** Read a PoE2 item copy. bases: the trade site's base names (for a magic item's base), optional. */
function parseItem2(text, { bases = null } = {}) {
  // the warning a character that can't use the item gets is not part of the item
  text = String(text || '').replace(/^You cannot use this item\. Its stats will be ignored\r?\n(--------\r?\n)?/m, '');
  const item = parseItem(text);
  if (!item) return null;
  item.game = 'poe2';
  // mods the game marks: runes and soul cores in sockets, desecrated mods
  const kinds = { rune: [], desecrated: [] };
  for (const g of Object.keys(item.mods || {})) {
    const keep = [];
    const keepMeta = [];
    (item.mods[g] || []).forEach((line, i) => {
      const t = String(line).trim();
      if (/\s\(rune\)$/i.test(t)) { kinds.rune.push(t.replace(/\s\(rune\)$/i, '')); return; }
      if (/\s\(desecrated\)$/i.test(t)) { kinds.desecrated.push(t.replace(/\s\(desecrated\)$/i, '')); return; }
      if (g === 'explicit' && (NOT_A_MOD.test(t) || /[.!?"”]$/.test(t) || /^".*/.test(t) || /\(augmented\)/.test(t))) return;
      keep.push(line);
      keepMeta.push(item.modMeta?.[g]?.[i] || null);
    });
    item.mods[g] = keep;
    if (item.modMeta) item.modMeta[g] = keepMeta;
  }
  item.mods.rune = kinds.rune;
  item.mods.desecrated = [...kinds.desecrated];
  // an advanced copy's "{ Desecrated Prefix Modifier … }": the lines under it are desecrated mods too
  const desecratedN = new Set();
  {
    let n = 0, inDes = false;
    for (const raw of String(text).split(/\r?\n/)) {
      const l = raw.trim();
      if (/^\{.*\}$/.test(l)) { if (/Modifier/.test(l)) { n++; inDes = /\bDesecrated\b/i.test(l); } continue; }
      if (l === '--------') inDes = false;
      if (inDes) desecratedN.add(n);
    }
  }
  if (desecratedN.size && item.modMeta?.explicit) {
    const stay = [], stayMeta = [];
    item.modMeta.desecrated = item.mods.desecrated.map(() => null);
    item.mods.explicit.forEach((l, i) => {
      const m = item.modMeta.explicit[i];
      if (m && desecratedN.has(m.n)) { item.mods.desecrated.push(l); item.modMeta.desecrated.push(m); } else { stay.push(l); stayMeta.push(m); }
    });
    item.mods.explicit = stay; item.modMeta.explicit = stayMeta;
  }
  // a magic item's base: the longest base name in its name ("Chalybeous Ashen Staff of the Augur" -> Ashen Staff)
  if (item.rarity === 'Magic' && bases?.length) {
    const tl = item.typeLine || '';
    const hit = bases.filter((b) => tl.includes(b)).sort((a, b) => b.length - a.length)[0];
    if (hit) item.baseType = hit;
  }
  const props = item.properties || {};
  const num = (v) => { const m = /(-?\d+(?:\.\d+)?)/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };
  // rune sockets ("Sockets: S S")
  const sockRaw = item.sockets?.raw || '';
  item.runeSockets = /^[S\s]+$/.test(sockRaw.trim()) && sockRaw.trim() ? sockRaw.trim().split(/\s+/).length : null;
  item.gemSockets = /^[GRBW\s]+$/.test(sockRaw.trim()) && sockRaw.trim() && /Gem/.test(item.rarity || '') ? sockRaw.trim().split(/\s+/).length : null;
  item.spirit = num(props.Spirit);
  item.waystoneTier = num(props['Waystone Tier']) ?? num(/\(Tier (\d+)\)/.exec(item.typeLine || '')?.[1]);
  item.areaLevel = num(props['Area Level']);
  item.gemLevel = /Gem/.test(item.rarity || '') ? num(props.Level) : null;
  item.uncutLevel = num(/^Uncut .* \(Level (\d+)\)$/.exec(item.typeLine || '')?.[1]);
  item.flags = item.flags || {};
  if (/^Sanctified$/m.test(text)) item.flags.sanctified = true;
  if (/^Twice Corrupted$/m.test(text)) item.flags.twiceCorrupted = true;
  if (/^Unidentified$/m.test(text)) item.flags.unidentified = true;
  // waystones: "Waystone (Tier 15)" is listed as plain "Waystone (Tier 15)" on the trade site? No: the base is the
  // tier's own name; the tier goes in its own filter
  item.category = CATEGORY[item.itemClass] || null;
  return item;
}

// weapons: damage and DPS ("Elemental Damage: 20-31 (fire), 2-91 (lightning)")
function weaponDps2(item) {
  const p = item.properties || {};
  const avg = (s) => { let t = 0; for (const m of String(s || '').matchAll(/(\d+)-(\d+)/g)) t += (Number(m[1]) + Number(m[2])) / 2; return t; };
  const aps = Number(/([\d.]+)/.exec(p['Attacks per Second'] || '')?.[1]) || 0;
  if (!aps) return null;
  const phys = avg(p['Physical Damage']);
  const ele = avg(p['Elemental Damage']) + avg(p['Fire Damage']) + avg(p['Cold Damage']) + avg(p['Lightning Damage']);
  const chaos = avg(p['Chaos Damage']);
  const r = (x) => Math.round(x * 10) / 10;
  return { pdps: r(phys * aps), edps: r(ele * aps), cdps: r(chaos * aps), dps: r((phys + ele + chaos) * aps), aps };
}

// ---------- stats ----------
// a mod line as a template: numbers become "#", the numbers kept ("+42% to Fire Resistance" -> "#% to fire resistance", [42])
function templateOf(line) {
  const values = [];
  const t = String(line).replace(/[+]?(-?\d+(?:\.\d+)?)/g, (m, n) => { values.push(Number(n)); return '#'; });
  return { t: norm(t), values };
}
const SWAPS = [['reduced', 'increased'], ['less', 'more'], ['increased', 'reduced'], ['more', 'less']];

// "Has 2 Charm Slots" and "Has # Charm Slot": both kept without a plural s
const one = (t) => t.replace(/\b(\w{3,}?)(?:ies)\b/g, '$1y').replace(/\b(\w{3,}?[^s])s\b/g, '$1');

/** stats (the trade site's list) -> { group -> Map(template -> [entries]) } */
function indexStats(stats) {
  const idx = {};
  for (const g of stats?.result || []) {
    for (const e of g.entries || []) {
      const group = String(e.id).split('.')[0];
      const plain = norm(String(e.text).replace(/\s*\((local|global)\)\s*$/i, '').replace(/[+]#/g, '#'));
      (idx[group] ||= new Map());
      for (const key of new Set([plain, one(plain)])) {
        const list = idx[group].get(key) || [];
        if (!list.includes(e)) list.push(e);
        idx[group].set(key, list);
      }
    }
  }
  return idx;
}

/** The trade stat(s) for a mod line in a group, with its value: { ids, statText, value, negate } or null */
function matchLine(idx, group, line) {
  const map = idx[group] || idx.explicit;
  if (!map) return null;
  const { t, values } = templateOf(line);
  const get = (tt) => map.get(tt) || map.get(one(tt));
  let hit = get(t), neg = false;
  if (!hit) for (const [a, b] of SWAPS) { const tt = t.replace(new RegExp(`\\b${a}\\b`), b); if (tt !== t && get(tt)) { hit = get(tt); neg = true; break; } }
  // a line with no number ("Cannot be Stunned") or a fixed number in the stat ("1 Added Passive Skill…")
  if (!hit) hit = get(norm(line));
  if (!hit) return null;
  const value = values.length ? (values.length >= 2 && /adds # to #/.test(t) ? (values[0] + values[1]) / 2 : values[0]) : null;
  return { ids: [...new Set(hit.map((e) => e.id))], statText: hit[0].text, value: value == null ? null : (neg ? -value : value), negate: neg };
}

// ---------- totals (pseudo) ----------
const RES = { fire: 'pseudo.pseudo_total_fire_resistance', cold: 'pseudo.pseudo_total_cold_resistance', lightning: 'pseudo.pseudo_total_lightning_resistance', chaos: 'pseudo.pseudo_total_chaos_resistance' };
function resistParts(line) {
  const m = /^[+]?(-?\d+)% to (.+?) Resistances?$/i.exec(String(line).trim());
  if (!m) return null;
  const v = Number(m[1]);
  const what = m[2].toLowerCase();
  if (/^all elemental$/.test(what)) return { fire: v, cold: v, lightning: v };
  if (/^maximum/.test(what)) return null;
  const out = {};
  for (const k of ['fire', 'cold', 'lightning', 'chaos']) if (new RegExp(`\\b${k}\\b`).test(what)) out[k] = v;
  return Object.keys(out).length ? out : null;
}

/**
 * The search the popup starts with: every mod as a row (tick, min, max), totals, and the item's properties.
 * opts.tolerance: how much lower than the item's own roll the min starts (0.1 = 10%)
 */
function prepareSearch2(stats, item, { tolerance = 0.1 } = {}) {
  const idx = indexStats(stats);
  const unique = item.rarity === 'Unique';
  const gear = !!item.category && (WEAPON.test(item.category) || /^armour|^accessory|^jewel|^flask/.test(item.category));
  const weapon = WEAPON.test(item.category || '');
  const armour = ARMOUR.test(item.category || '');
  // whole numbers stay whole ("+3 to Level of…" starts at 2, not 2.7)
  const cut = (v) => (Number.isInteger(v) ? (v < 0 ? Math.ceil(v * (1 - tolerance)) : Math.floor(v * (1 - tolerance))) : (v < 0 ? Math.ceil(v * (1 - tolerance) * 100) / 100 : Math.floor(v * (1 - tolerance) * 100) / 100));
  const minOf = (v) => (v == null || v < 0 ? null : cut(v));
  const maxOf = (v) => (v == null || v >= 0 ? null : cut(v));
  const rows = [];
  const GROUPS = [['enchant', 'enchant'], ['implicit', 'implicit'], ['rune', 'rune'], ['fractured', 'fractured'], ['explicit', 'explicit'], ['desecrated', 'desecrated'], ['crafted', 'crafted']];
  for (const [kind, group] of GROUPS) {
    (item.mods?.[kind] || []).forEach((line, i) => {
      const meta = item.modMeta?.[kind]?.[i] || null;
      // a waystone's and a tablet's mods are its explicit mods; sanctum relics list theirs as "sanctum"
      const hit = matchLine(idx, group, line) || (item.category === 'sanctum.relic' ? matchLine(idx, 'sanctum', line) : null);
      if (!hit) { rows.push({ id: null, ids: [], text: line, type: group, group, enabled: false, unmatched: true, meta }); return; }
      rows.push({ id: hit.ids[0], ids: hit.ids, text: line, statText: hit.statText, value: hit.value, display: hit.value, negate: hit.negate, min: minOf(hit.value), max: maxOf(hit.value), type: group, group, enabled: false, meta });
    });
  }
  // desecrated mods are prefixes and suffixes like the rest: listed with them, marked, searched as desecrated
  for (const r of rows) if (r.group === 'desecrated') { r.group = 'explicit'; r.desecrated = true; r.text = `${r.text} (desecrated)`; }
  // a tablet's uses left
  for (const r of rows) if (r.unmatched && /^(\d+) uses? remaining$/i.test(r.text)) {
    const v = Number(/^(\d+)/.exec(r.text)[1]);
    Object.assign(r, { id: 'pseudo.pseudo_number_of_uses_remaining', ids: ['pseudo.pseudo_number_of_uses_remaining'], statText: '# uses remaining (Tablets)', value: v, display: v, min: v, max: null, unmatched: false, group: 'pseudo' });
  }
  // what to tick: a rare's or magic item's own mods (not runes, not its enchants); a unique is found by its name
  for (const r of rows) {
    if (r.unmatched) continue;
    // uniques are found by name; a waystone by its tier (its mods are what makes it harder, not what sells it)
    if (unique || item.category === 'map.waystone') { r.enabled = false; continue; }
    // (attribute requirements and light radius don't set a price)
    if (['explicit', 'fractured', 'desecrated'].includes(r.group) && !/attribute requirements|light radius|^# to accuracy rating$/i.test(r.statText || '')) r.enabled = true;
    if (r.group === 'implicit' && !gear) r.enabled = true;
  }
  // totals: resistances and life, as Exiled Exchange 2 does; the lines that make them are then left unticked
  const pseudo = [];
  if (!unique) {
    const res = { fire: 0, cold: 0, lightning: 0, chaos: 0 };
    const resRows = [];
    let life = 0; const lifeRows = [];
    let mana = 0; const manaRows = [];
    for (const r of rows) {
      if (r.unmatched || !['explicit', 'implicit', 'fractured', 'desecrated', 'rune', 'crafted', 'enchant'].includes(r.group)) continue;
      const rp = resistParts(r.text);
      if (rp) { for (const k of Object.keys(rp)) res[k] += rp[k]; resRows.push(r); continue; }
      const lm = /^[+]?(\d+) to maximum (Life|Mana)$/i.exec(r.text.trim());
      if (lm && !(armour && /Local/i.test(r.statText || ''))) { if (/life/i.test(lm[2])) { life += Number(lm[1]); lifeRows.push(r); } else { mana += Number(lm[1]); manaRows.push(r); } }
    }
    const ele = res.fire + res.cold + res.lightning;
    const total = (id, text, v, from, on) => {
      if (!stats || !v) return;
      pseudo.push({ id, ids: [id], text, statText: text.replace(/[+]?\d+/, '#'), value: v, display: v, min: minOf(v), max: null, type: 'pseudo', group: 'pseudo', enabled: on, sources: from });
      if (on) for (const r of from) r.enabled = false;
    };
    if (resRows.length >= 2 || (resRows.length && gear)) {
      total('pseudo.pseudo_total_elemental_resistance', `+${ele}% total Elemental Resistance`, ele, resRows.filter((r) => !/chaos/i.test(r.text) || /fire|cold|lightning/i.test(r.text)), ele > 0);
      if (res.chaos) total(RES.chaos, `+${res.chaos}% total to Chaos Resistance`, res.chaos, resRows.filter((r) => /chaos/i.test(r.text)), true);
    }
    if (lifeRows.length) total('pseudo.pseudo_total_life', `+${life} total maximum Life`, life, lifeRows, true);
    if (manaRows.length > 1) total('pseudo.pseudo_total_mana', `+${mana} total maximum Mana`, mana, manaRows, true);
  }
  // ---------- properties ----------
  const props = { corrupted: item.flags?.corrupted ? 'yes' : 'no', identified: item.flags?.unidentified ? 'no' : 'any', mirrored: item.flags?.mirrored ? 'yes' : 'no' };
  if (unique) props.uniqueName = item.name;
  if (item.flags?.twiceCorrupted) props.twiceCorrupted = true;
  if (item.itemLevel != null && item.rarity !== 'Gem') props.ilvl = { on: !unique && ['Normal', 'Magic'].includes(item.rarity) && gear, min: item.itemLevel, max: null, show: true };
  if (item.quality != null && item.quality > 0) props.quality = { on: /Gem/.test(item.rarity || ''), min: item.quality, max: null, show: true };
  if (item.runeSockets) props.runeSockets = { on: false, min: item.runeSockets, max: null, show: true };
  if (item.gemLevel != null) props.gemLevel = { on: true, min: item.gemLevel, max: null, show: true };
  if (item.gemSockets) props.gemSockets = { on: false, min: item.gemSockets, max: null, show: true };
  if (item.waystoneTier != null && item.category === 'map.waystone') props.mapTier = { on: true, min: item.waystoneTier, max: item.waystoneTier, show: true };
  if (item.areaLevel != null && /tablet|fragment|logbook/.test(item.category || '')) props.areaLevel = { on: false, min: item.areaLevel, max: null, show: true };
  if (item.spirit != null && gear) props.spirit = { on: false, min: item.spirit, max: null, show: true };
  // the base, for rares and magic items: same base or any base of this kind
  if (!unique && item.baseType && gear) props.base = { value: item.baseType, on: item.rarity !== 'Rare' || !!(weapon || armour), canChange: true };
  // weapons: their own DPS; their local damage and attack speed mods are counted in it
  const dps = weapon ? weaponDps2(item) : null;
  if (dps && !unique) {
    const goodPhys = dps.pdps > 0, goodEle = dps.edps > 0;
    props.dps = { show: true, values: { phys: dps.pdps, ele: dps.edps, total: dps.dps }, kinds: {
      ...(goodPhys ? { phys: { on: goodPhys && dps.pdps >= dps.edps, min: Math.floor(dps.pdps * (1 - tolerance)) } } : {}),
      ...(goodEle ? { ele: { on: goodEle && dps.edps > dps.pdps, min: Math.floor(dps.edps * (1 - tolerance)) } } : {}),
      total: { on: false, min: Math.floor(dps.dps * (1 - tolerance)) } } };
    props.dps.on = Object.values(props.dps.kinds).some((k) => k.on);
    for (const r of rows) if (/^adds # to # (physical|fire|cold|lightning|chaos) damage$|^#% increased physical damage$|^#% increased attack speed$/i.test(String(r.statText || '').replace(/\s*\(local\)$/i, ''))) { r.enabled = false; r.hidden = true; }
  }
  // armour: its own armour / evasion / energy shield; the local defence mods are counted in them
  if (armour && !unique) {
    const p = item.properties || {};
    const d = [];
    const n = (k) => Number(/(\d+)/.exec(p[k] || '')?.[1]) || 0;
    for (const [k, id, label] of [['Armour', 'ar', 'Armour'], ['Evasion Rating', 'ev', 'Evasion'], ['Energy Shield', 'es', 'Energy Shield']]) {
      const v = n(k);
      if (v) d.push({ key: id, label, value: v, note: '', on: true, min: Math.floor(v * (1 - tolerance)) });
    }
    if (d.length) {
      props.defence2 = d;
      props.defence = d.map((x) => ({ ...x }));
      for (const r of rows) if (/^#% increased (armour|evasion rating|energy shield|armour and evasion|armour and energy shield|evasion and energy shield|armour, evasion and energy shield)$|^# to (armour|evasion rating|maximum energy shield)$/i.test(String(r.statText || '').replace(/\s*\(local\)$/i, '')) && ['explicit', 'fractured', 'desecrated'].includes(r.group)) { r.enabled = false; r.hidden = true; }
    }
  }
  const mods = [...pseudo, ...rows];
  return { mods, props, kind: unique ? 'unique' : String(item.rarity || '').toLowerCase() };
}

/** The trade search for the rows and properties as they are now (what you ticked and typed). */
function buildQuery2(item, mods, props = {}, { status = 'securable' } = {}) {
  const q = { status: { option: status }, stats: [], filters: {} };
  const set = (group, key, val) => { ((q.filters[group] ||= { filters: {} }).filters)[key] = val; };
  if (props.uniqueName && item.rarity === 'Unique') { q.name = props.uniqueName; q.type = item.baseType || item.typeLine; }
  else if (props.base?.canChange) { if (props.base.on) q.type = props.base.value; }
  else if (item.rarity !== 'Rare' && item.rarity !== 'Magic') q.type = item.typeLine || item.baseType;
  else if (item.baseType) q.type = item.baseType;
  if (item.category) set('type_filters', 'category', { option: item.category });
  if (item.rarity === 'Unique') set('type_filters', 'rarity', { option: 'unique' });
  else if (['Rare', 'Magic', 'Normal'].includes(item.rarity) && item.category) set('type_filters', 'rarity', { option: 'nonunique' });
  const range = (p) => ({ ...(p.min != null ? { min: p.min } : {}), ...(p.max != null ? { max: p.max } : {}) });
  if (props.ilvl?.on) set('type_filters', 'ilvl', range(props.ilvl));
  if (props.quality?.on) set('type_filters', 'quality', range(props.quality));
  if (props.runeSockets?.on) set('equipment_filters', 'rune_sockets', range(props.runeSockets));
  if (props.spirit?.on) set('equipment_filters', 'spirit', range(props.spirit));
  if (props.gemLevel?.on) set('misc_filters', 'gem_level', range(props.gemLevel));
  if (props.gemSockets?.on) set('misc_filters', 'gem_sockets', range(props.gemSockets));
  if (props.mapTier?.on) set('map_filters', 'map_tier', range(props.mapTier));
  if (props.areaLevel?.on) set('misc_filters', 'area_level', range(props.areaLevel));
  if (props.dps?.kinds) {
    const k = props.dps.kinds;
    if (k.phys?.on) set('equipment_filters', 'pdps', { min: k.phys.min });
    if (k.ele?.on) set('equipment_filters', 'edps', { min: k.ele.min });
    if (k.total?.on) set('equipment_filters', 'dps', { min: k.total.min });
  }
  for (const d of props.defence || []) if (d.on) set('equipment_filters', d.key, { min: d.min });
  if (props.corrupted === 'yes') set('misc_filters', 'corrupted', { option: 'true' });
  if (props.corrupted === 'no') set('misc_filters', 'corrupted', { option: 'false' });
  if (props.identified === 'yes') set('misc_filters', 'identified', { option: 'true' });
  if (props.identified === 'no') set('misc_filters', 'identified', { option: 'false' });
  if (props.mirrored === 'yes') set('misc_filters', 'mirrored', { option: 'true' });
  if (props.mirrored === 'no') set('misc_filters', 'mirrored', { option: 'false' });
  set('trade_filters', 'collapse', { option: 'true' });
  const and = { type: 'and', filters: [] };
  const counts = [];
  for (const m of mods) {
    if (!m.enabled || m.unmatched || !(m.ids?.length || m.id)) continue;
    const value = { ...(m.min != null ? { min: m.min } : {}), ...(m.max != null ? { max: m.max } : {}) };
    const ids = m.ids?.length ? m.ids : [m.id];
    // a stat the site lists twice (a local and a global "+# to Spirit"): either one
    if (ids.length === 1) and.filters.push({ id: ids[0], value, disabled: false });
    else counts.push({ type: 'count', value: { min: 1 }, filters: ids.map((id) => ({ id, value, disabled: false })) });
  }
  q.stats = [and, ...counts];
  return { query: q, sort: { price: 'asc' } };
}

/** The trade site's base names from GET /api/trade2/data/items (for magic items' bases) */
function baseNames(items) {
  const out = new Set();
  for (const g of items?.result || []) for (const e of g.entries || []) if (e.type && !e.name) out.add(e.type);
  return [...out];
}

module.exports = { parseItem2, prepareSearch2, buildQuery2, indexStats, matchLine, weaponDps2, baseNames, CATEGORY };

/** The cheapest listings, priced in Exalted Orbs ("chaos" in the rows, so the trade panel draws them as it does). */
function summarizeListings2(fetchJson, { divineEx = null, chaosEx = null, me = '' } = {}) {
  const rows = [];
  const vals = [];
  for (const r of fetchJson?.result || []) {
    const p = r?.listing?.price;
    if (!p) continue;
    const per = { exalted: 1, exalt: 1, divine: divineEx, chaos: chaosEx }[p.currency];
    const ex = per ? p.amount * per : null;
    const acc = r.listing.account || {};
    const status = r.listing.fee != null || /securable/.test(r.listing.method || '') ? 'merchant' : acc.online ? (acc.online.status === 'afk' ? 'afk' : 'online') : 'offline';
    const x = { amount: p.amount, currency: p.currency === 'exalted' ? 'ex' : p.currency === 'divine' ? 'div' : p.currency, chaos: ex, seller: acc.name, indexed: r.listing.indexed, status, mine: !!me && acc.name === me, times: 1, whisper: typeof r.listing.whisper === 'string' ? r.listing.whisper.slice(0, 400) : null };
    if (ex != null) vals.push(ex);
    const same = rows.findIndex((y) => y.seller === x.seller && y.amount === x.amount && y.currency === x.currency);
    if (same >= 0 && status !== 'merchant') rows[same].times += 1; else rows.push(x);
  }
  vals.sort((a, b) => a - b);
  return { prices: rows, min: vals[0] ?? null, median: vals.length ? vals[Math.floor(vals.length / 2)] : null, count: vals.length };
}

/** The bulk exchange's query and answer for PoE2: paid in exalted or divine orbs. */
function exchangeQuery2(tag, { status = 'online' } = {}) {
  return { engine: 'new', query: { status: { option: status === 'any' ? 'any' : 'online' }, have: ['exalted', 'divine'], want: [tag] }, sort: { have: 'asc' } };
}
function exchangeListings2(json, { me = '' } = {}) {
  const out = { exalted: [], divine: [] };
  for (const r of Object.values(json?.result || {})) {
    const offers = r?.listing?.offers || [];
    if (offers.length !== 1) continue;
    const o = offers[0];
    const cur = o.exchange?.currency;
    if (!out[cur] || !(o.item?.amount > 0)) continue;
    const acc = r.listing.account || {};
    if (out[cur].some((x) => x.seller === acc.name)) continue;
    out[cur].push({ each: Math.round((o.exchange.amount / o.item.amount) * 10000) / 10000, pay: o.exchange.amount, get: o.item.amount, stock: o.item.stock, seller: acc.name, status: acc.online ? (acc.online.status === 'afk' ? 'afk' : 'online') : 'offline', indexed: r.listing.indexed, mine: !!me && acc.name === me });
  }
  for (const k of Object.keys(out)) out[k] = out[k].sort((a, b) => a.each - b.each).slice(0, 20);
  return out;
}

module.exports.summarizeListings2 = summarizeListings2;
module.exports.exchangeQuery2 = exchangeQuery2;
module.exports.exchangeListings2 = exchangeListings2;
