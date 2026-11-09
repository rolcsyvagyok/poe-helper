'use strict';
/**
 * Local filter changes that survive filter updates.
 *
 * You keep using your normal filter (NeverSink, FilterBlade export, your own...).
 * The helper never edits it. Instead it writes "<name> (helper).filter" next to it:
 *
 *   [header]                                 <- what was generated and when
 *   [your override rules]                    <- Show/Hide blocks, first match wins
 *   [economy tiers from poe.ninja]           <- optional, rebuilt from cached prices
 *   [the original filter, untouched]
 *
 * When the base filter changes on disk (you re-downloaded it), the helper file is
 * rebuilt automatically, so your tweaks are never lost. Select the "(helper)" filter
 * once in Options > Game > Item Filter. After changes, the game reloads it on zone
 * change, or press the "Reload" button next to the filter dropdown.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parse, renderBlock, serialize, blocks } = require('./parser');
const { applyTierPatch, tierView, HIDDEN_TIER, HIDE } = require('./tiers');
const { BASES, GROUPS } = require('../base-data');
const cluster = require('../cluster');

// heist and ritual bases are shown by the filter's own settings, so base ranks leave them alone
const NOT_RANKED_GROUPS = new Set(['heist', 'ritual', 'flasks']); // flasks and jewels too: their own filter sections show them
const RANKED_NAMES = [...new Set([...Object.values(BASES).flatMap((o) => Object.values(o).flat()), ...GROUPS.filter((g) => !NOT_RANKED_GROUPS.has(g.id)).flatMap((g) => Object.values(g.columns).flat())])];
const MATRIX_NAMES = [...new Set([...Object.values(BASES).flatMap((o) => Object.values(o).flat()), ...GROUPS.flatMap((g) => Object.values(g.columns).flat())])];
// fractured bases have their own palette: the best bases loud, good ones clear, the rest hidden
const FRACTURED_TOP_STYLE = { fontSize: 45, text: [255, 255, 255, 255], border: [255, 214, 150, 255], background: [150, 86, 22, 255], sound: { id: 1, volume: 300 }, beam: { color: 'Orange' }, icon: { size: 0, color: 'Brown', shape: 'Star' } };
const FRACTURED_STYLE = { fontSize: 40, text: [255, 255, 255, 255], border: [210, 178, 135, 255], background: [86, 52, 20, 235], icon: { size: 1, color: 'Brown', shape: 'Diamond' } };

const HELPER_SUFFIX = ' (helper)';
const MARK = '#### POE-HELPER';

function candidateFilterDirs() {
  const home = os.homedir();
  const docs = ['Documents', path.join('OneDrive', 'Documents'), path.join('OneDrive', 'Dokumentumok'), 'Dokumentumok'];
  const dirs = docs.map((d) => path.join(home, d, 'My Games', 'Path of Exile'));
  // Steam Proton (Linux / Steam Deck)
  dirs.push(path.join(home, '.steam', 'steam', 'steamapps', 'compatdata', '238960', 'pfx', 'drive_c', 'users', 'steamuser', 'Documents', 'My Games', 'Path of Exile'));
  dirs.push(path.join(home, '.local', 'share', 'Steam', 'steamapps', 'compatdata', '238960', 'pfx', 'drive_c', 'users', 'steamuser', 'Documents', 'My Games', 'Path of Exile'));
  return dirs;
}

function detectFilterDir() {
  return candidateFilterDirs().find((d) => {
    try { return fs.statSync(d).isDirectory(); } catch { return false; }
  }) || null;
}

/** "#name:3.29 Leg Start" from the header PoE writes into synced (online) filters. */
function onlineFilterName(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(1024);
    fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf8');
    if (!head.startsWith('#Online Item Filter')) return null;
    return (/^#name:(.*)$/m.exec(head)?.[1] || 'Online filter').trim();
  } catch {
    return null;
  }
}

/**
 * Local .filter files, plus filters FilterBlade synced to your PoE account. The game keeps
 * those in "OnlineFilters/" (no extension) and overwrites them whenever they update.
 */
function listFilters(dir) {
  if (!dir) return [];
  const out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.filter') || f.includes(HELPER_SUFFIX)) continue;
      const st = fs.statSync(path.join(dir, f));
      out.push({ name: f, display: f.replace(/\.filter$/i, ''), path: path.join(dir, f), size: st.size, mtime: st.mtimeMs, online: false });
    }
  } catch { /* no folder */ }
  try {
    const od = path.join(dir, 'OnlineFilters');
    for (const f of fs.readdirSync(od)) {
      const full = path.join(od, f);
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      const nm = onlineFilterName(full);
      if (!nm) continue;
      out.push({ name: `OnlineFilters/${f}`, display: `${nm} (synced from FilterBlade)`, path: full, size: st.size, mtime: st.mtimeMs, online: true });
    }
  } catch { /* no online filters */ }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function safeFileName(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Online filter';
}

function helperPathFor(basePath) {
  // Synced filters: write the copy next to your local filters, named after the online filter.
  if (path.basename(path.dirname(basePath)) === 'OnlineFilters') {
    const nm = onlineFilterName(basePath) || path.basename(basePath);
    return path.join(path.dirname(path.dirname(basePath)), safeFileName(nm) + HELPER_SUFFIX + '.filter');
  }
  const ext = path.extname(basePath);
  return path.join(path.dirname(basePath), path.basename(basePath, ext) + HELPER_SUFFIX + ext);
}

// ---------- Drop sounds ("tinks") ----------
// Original sounds shipped with the app (src/renderer/sounds). On write they are copied to
// "<filter folder>/poehelper-sounds/" because CustomAlertSound paths are relative to that folder.
const SOUND_SUBDIR = 'poehelper-sounds';
const SOUNDS = [
  { id: 'divine-tink', name: 'Divine tink', note: 'bright bell, for top drops' },
  { id: 'chime', name: 'Chime', note: 'two rising notes' },
  { id: 'sparkle', name: 'Sparkle', note: 'quick four-note run' },
  { id: 'coin', name: 'Coin', note: 'short metallic clink' },
  { id: 'soft-bell', name: 'Soft bell', note: 'gentle, for common drops' },
  { id: 'deep-gong', name: 'Deep gong', note: 'low and heavy' },
];

/**
 * Sound choice -> style fields.
 *   'none' | '' -> no sound
 *   'game:6'    -> PlayAlertSound 6 (built-in game sound, can only be heard in game)
 *   'chime'     -> CustomAlertSound "poehelper-sounds/chime.mp3"
 */
function soundStyle(choice, volume = 300) {
  if (!choice || choice === 'none') return {};
  const m = /^game:(\d{1,2})$/.exec(choice);
  if (m) return { sound: { id: Number(m[1]), volume } };
  if (SOUNDS.some((s) => s.id === choice)) return { customSound: `${SOUND_SUBDIR}/${choice}.mp3`, ...(volume !== 300 ? { customVolume: volume } : {}) };
  return {};
}

/** Inverse of soundStyle, for the UI. */
function soundChoiceOf(style = {}) {
  if (style.customSound) {
    const m = new RegExp(`^${SOUND_SUBDIR}/(.+)\\.mp3$`).exec(style.customSound);
    return m ? m[1] : 'custom';
  }
  if (style.sound?.id) return `game:${style.sound.id}`;
  return 'none';
}

// ---------- Economy tiers ----------

const TIER_LOOKS = {
  top: { fontSize: 45, text: [255, 0, 0, 255], border: [255, 0, 0, 255], background: [255, 255, 255, 255], beam: { color: 'Red' }, icon: { size: 0, color: 'Red', shape: 'Star' } },
  high: { fontSize: 42, text: [0, 0, 0, 255], border: [0, 0, 0, 255], background: [240, 140, 0, 255], beam: { color: 'Orange' }, icon: { size: 1, color: 'Orange', shape: 'Diamond' } },
  mid: { fontSize: 38, text: [0, 0, 0, 255], border: [0, 0, 0, 255], background: [255, 220, 120, 230], beam: { color: 'Yellow', temp: true }, icon: { size: 2, color: 'Yellow', shape: 'Circle' } },
  multi: { fontSize: 40, text: [175, 96, 37, 255], border: [175, 96, 37, 255], background: [60, 30, 10, 255], beam: { color: 'Brown', temp: true }, icon: { size: 1, color: 'Brown', shape: 'Pentagon' } },
};
// the game's own alert sounds, as FilterBlade uses them: 6 the Divine sound, 1 and 2 for good drops, 4 a lighter one
const DEFAULT_TIER_SOUNDS = { top: 'game:6', high: 'game:1', mid: 'game:2', multi: 'game:4' };

function tierStyle(tier, sounds = {}) {
  return { ...TIER_LOOKS[tier], ...soundStyle(sounds[tier] ?? DEFAULT_TIER_SOUNDS[tier]) };
}
// Back-compat export used by quickRule and tests
const TIER_STYLES = Object.fromEntries(Object.keys(TIER_LOOKS).map((k) => [k, tierStyle(k)]));

/**
 * @param prices { DivinationCard:[{name,chaos}], Currency:[...], Scarab:[...], unique lines by category... }
 * @param t thresholds { top:100, high:20, mid:5, hideDivBelow:null, sounds:{top,high,mid,multi} }
 */
function economyRules(prices, t = {}) {
  const top = t.top ?? 100;
  const high = t.high ?? 20;
  const mid = t.mid ?? 5;
  const TS = { top: tierStyle('top', t.sounds), high: tierStyle('high', t.sounds), mid: tierStyle('mid', t.sounds), multi: tierStyle('multi', t.sounds) };
  const rules = [];
  const bucket = (lines, minV, maxV) => [...new Set(lines.filter((l) => l.chaos >= minV && (maxV == null || l.chaos < maxV)).map((l) => l.name))].sort();

  const add = (label, action, conds, style) => {
    if (conds.some((c) => c.values && !c.values.length)) return;
    const tier = style === TS.top ? 'top' : style === TS.high ? 'high' : style === TS.mid ? 'mid' : style === TS.multi ? 'multi' : 'hide';
    rules.push({ action, label, conditions: conds, style, generated: true, tier });
  };

  // Divination cards
  const div = prices.DivinationCard || [];
  add(`Economy: divination cards >= ${top}c`, 'Show', [{ keyword: 'Class', op: '==', values: ['Divination Cards'] }, { keyword: 'BaseType', op: '==', values: bucket(div, top) }], TS.top);
  add(`Economy: divination cards ${high}-${top}c`, 'Show', [{ keyword: 'Class', op: '==', values: ['Divination Cards'] }, { keyword: 'BaseType', op: '==', values: bucket(div, high, top) }], TS.high);
  add(`Economy: divination cards ${mid}-${high}c`, 'Show', [{ keyword: 'Class', op: '==', values: ['Divination Cards'] }, { keyword: 'BaseType', op: '==', values: bucket(div, mid, high) }], TS.mid);
  if (t.hideDivBelow) {
    add(`Economy: hide divination cards < ${t.hideDivBelow}c`, 'Hide', [{ keyword: 'Class', op: '==', values: ['Divination Cards'] }, { keyword: 'BaseType', op: '==', values: bucket(div, 0, t.hideDivBelow) }], { disableDropSound: true });
  }

  // Stackable currency-like things
  const stack = ['Currency', 'Fragment', 'Scarab', 'Fossil', 'Oil', 'Essence', 'Resonator', 'DeliriumOrb', 'Omen', 'Tattoo', 'Runegraft']
    .flatMap((k) => prices[k] || [])
    .filter((l) => l.name !== 'Chaos Orb');
  add(`Economy: currency-like >= ${top}c`, 'Show', [{ keyword: 'BaseType', op: '==', values: bucket(stack, top) }], TS.top);
  add(`Economy: currency-like ${high}-${top}c`, 'Show', [{ keyword: 'BaseType', op: '==', values: bucket(stack, high, top) }], TS.high);

  // Uniques by base: if EVERY unique on a base is valuable, highlight hard;
  // if only SOME are, use the "multi" style (worth picking up and identifying).
  const uniques = ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueJewel', 'UniqueFlask'].flatMap((k) => prices[k] || []).filter((l) => !l.links && l.baseType && (l.listingCount ?? 10) >= 3);
  const byBase = new Map();
  for (const u of uniques) {
    const e = byBase.get(u.baseType) || { min: Infinity, max: 0 };
    e.min = Math.min(e.min, u.chaos);
    e.max = Math.max(e.max, u.chaos);
    byBase.set(u.baseType, e);
  }
  const allTop = [...byBase].filter(([, e]) => e.min >= top).map(([b]) => b).sort();
  const allHigh = [...byBase].filter(([, e]) => e.min >= high && e.min < top).map(([b]) => b).sort();
  const someTop = [...byBase].filter(([, e]) => e.min < high && e.max >= top).map(([b]) => b).sort();
  const uniq = { keyword: 'Rarity', op: '==', values: ['Unique'] };
  add(`Economy: uniques (every unique on base >= ${top}c)`, 'Show', [uniq, { keyword: 'BaseType', op: '==', values: allTop }], TS.top);
  add(`Economy: uniques (every unique on base >= ${high}c)`, 'Show', [uniq, { keyword: 'BaseType', op: '==', values: allHigh }], TS.high);
  add(`Economy: uniques (some unique on base >= ${top}c)`, 'Show', [uniq, { keyword: 'BaseType', op: '==', values: someTop }], TS.multi);

  return rules;
}

/** Override rule made from a price-check click ("hide this base", "highlight this"). */
/**
 * Rule made from a price-check click.
 * opts.rarities: ['Normal','Magic','Rare'] to cover (default: Highlight = this rarity, Hide = this rarity and below)
 * opts.ilvlMin / opts.ilvlMax: item level range (optional)
 */
function quickRule(kind, item, opts = {}) {
  const base = item.baseType || item.typeLine;
  const conds = [];
  if (item.itemClass) conds.push({ keyword: 'Class', op: '==', values: [item.itemClass] });
  if (base) conds.push({ keyword: 'BaseType', op: '==', values: [base] });
  const ORDER = ['Normal', 'Magic', 'Rare'];
  const plain = ORDER.includes(item.rarity);
  let rarities = Array.isArray(opts.rarities) ? opts.rarities.filter((r) => [...ORDER, 'Unique'].includes(r)) : null;
  if (!rarities) {
    if (item.rarity === 'Unique') rarities = ['Unique'];
    else if (plain) rarities = kind === 'hide' ? ORDER.slice(0, ORDER.indexOf(item.rarity) + 1) : [item.rarity];
    else rarities = [];
  }
  if (rarities.length && rarities.length < 4) conds.push({ keyword: 'Rarity', op: '==', values: rarities });
  const min = Number(opts.ilvlMin) || null;
  const max = Number(opts.ilvlMax) || null;
  if (min) conds.push({ keyword: 'ItemLevel', op: '>=', values: [String(min)] });
  if (max) conds.push({ keyword: 'ItemLevel', op: '<=', values: [String(max)] });
  const rw = rarities.length && rarities.length < 4 && item.rarity !== 'Unique' && plain ? rarities.map((r) => r.toLowerCase()).join('/') + ' ' : '';
  const lv = min && max ? `, ilvl ${min}-${max}` : min ? `, ilvl ${min}+` : max ? `, ilvl up to ${max}` : '';
  const id = `r_${Date.now()}`;
  if (kind === 'hide') return { id, enabled: true, action: 'Hide', label: `Hide ${rw}${base}${lv}`, conditions: conds, style: { disableDropSound: true } };
  return { id, enabled: true, action: 'Show', label: `Highlight ${rw}${base}${lv}`, conditions: conds, style: { ...TIER_STYLES.high } };
}

function buildHelperFilter({ baseText, overrides = [], economy = [], header = {} }) {
  const eol = baseText.includes('\r\n') ? '\r\n' : '\n';
  // If the base is itself a helper output (user selected wrong file), strip our section.
  const startIdx = baseText.indexOf(`${MARK} START`);
  const endIdx = baseText.indexOf(`${MARK} END`);
  let original = baseText;
  if (startIdx >= 0 && endIdx > startIdx) original = baseText.slice(baseText.indexOf('\n', endIdx) + 1);

  const parts = [];
  parts.push(`${MARK} START — generated ${new Date(header.at || Date.now()).toISOString()}`);
  parts.push(`# Base filter: ${header.baseName || 'unknown'}`);
  parts.push(`# ${overrides.filter((r) => r.enabled !== false).length} local override(s), ${economy.length} economy rule(s). Edit them in PoE Helper, not here.`);
  parts.push('');
  for (const r of overrides) {
    if (r.enabled === false) continue;
    parts.push(renderBlock(r, eol), '');
  }
  for (const r of economy) parts.push(renderBlock(r, eol), '');
  parts.push(`${MARK} END`);
  return parts.join(eol) + eol + original;
}

// ---- My bases: bases you collect (from the price check or typed in), with item level ranges ----
const MY_BASES_STYLE = { fontSize: 40, text: [255, 255, 255, 255], border: [90, 220, 255, 255], background: [20, 85, 105, 255], sound: { id: 2, volume: 300 }, beam: { color: 'Cyan', temp: true }, icon: { size: 1, color: 'Cyan', shape: 'Diamond' } };
const RARITY_ORDER = ['Normal', 'Magic', 'Rare'];
/** One "My bases" entry -> a Show block placed above everything else in the (helper) filter. */
function myBaseRule(e, style = MY_BASES_STYLE) {
  const rarities = RARITY_ORDER.filter((r) => (e.rarities || RARITY_ORDER).includes(r));
  const lo = Number(e.ilvlMin) || null;
  const hi = Number(e.ilvlMax) || null;
  const lv = lo && hi ? ` ilvl ${lo}-${hi}` : lo ? ` ilvl ${lo}+` : hi ? ` ilvl up to ${hi}` : '';
  const conditions = [
    // never catches uniques: only the rarities you picked
    { keyword: 'Rarity', values: rarities.length ? rarities : RARITY_ORDER },
    ...(lo ? [{ keyword: 'ItemLevel', op: '>=', values: [String(lo)] }] : []),
    ...(hi ? [{ keyword: 'ItemLevel', op: '<=', values: [String(hi)] }] : []),
    { keyword: 'BaseType', op: '==', values: [e.base] },
  ];
  // cluster jewels: how many passives the enchant adds
  const pLo = Number(e.passivesMin) || null;
  const pHi = Number(e.passivesMax) || null;
  if (pLo) conditions.push({ keyword: 'EnchantmentPassiveNum', op: '>=', values: [String(pLo)] });
  if (pHi) conditions.push({ keyword: 'EnchantmentPassiveNum', op: '<=', values: [String(pHi)] });
  const pv = pLo && pHi ? (pLo === pHi ? `, ${pLo} passives` : `, ${pLo}-${pHi} passives`) : pLo ? `, ${pLo}+ passives` : pHi ? `, up to ${pHi} passives` : '';
  const hide = e.action === 'Hide';
  const label = `${e.group === 'cluster' ? 'Cluster jewels' : 'My bases'}: ${hide ? 'hide ' : ''}${e.base}${lv}${pv}`;
  return { id: e.id, enabled: e.enabled !== false, action: hide ? 'Hide' : 'Show', label, conditions, style: hide ? { disableDropSound: true } : e.style || style, group: e.group || 'mybases' };
}

/**
 * NeverSink shows fractured (and synthesised) items in their own tiers near the top of the filter,
 * so a base you hid still drops with a label when it's fractured. With the switch on, the bases you
 * hid yourself (moved to your hidden tier, or in a tier you switched to Hide) get a Hide block for
 * their fractured / synthesised copies above the whole filter. Never uniques.
 */
function hiddenBaseRules(baseText, patch, { fractured = false, synthesised = false } = {}) {
  if (!fractured && !synthesised) return [];
  const bases = new Set();
  for (const [k, to] of Object.entries(patch.moves || {})) if (to === HIDE || to === HIDDEN_TIER) bases.add(k.split('\t')[1]);
  const hiddenTiers = Object.entries(patch.actions || {}).filter(([, a]) => a === 'Hide').map(([k]) => k);
  if (hiddenTiers.length) {
    let view = null;
    try { view = tierView(baseText, patch); } catch { view = null; }
    for (const t of view?.types || []) for (const tier of t.tiers) {
      if (hiddenTiers.includes(`${t.type}|${tier.tier}`) && !/^uniques/.test(t.type)) for (const b of tier.bases) bases.add(b);
    }
  }
  if (!bases.size) return [];
  const list = [...bases].sort();
  const rule = (kw, word) => ({
    id: `hidden-${word}`, enabled: true, action: 'Hide', group: 'hiddenbases',
    label: `Bases you hid: also when ${word}`,
    conditions: [{ keyword: 'Rarity', values: ['Normal', 'Magic', 'Rare'] }, { keyword: kw, values: ['True'] }, { keyword: 'BaseType', op: '==', values: list }],
    style: { disableDropSound: true },
  });
  return [...(fractured ? [rule('FracturedItem', 'fractured')] : []), ...(synthesised ? [rule('SynthesisedItem', 'synthesised')] : [])];
}

/**
 * The base visibility matrix ("which bases do I want to see"), written above the whole filter:
 *  - fractured: "show" highlights fractured copies of the base, "hide" hides them
 *  - visible:   "hide" hides plain copies (not fractured, synthesised, influenced, mirrored,
 *               corrupted or 6-socket ones, and never uniques), by default only in maps
 * state: { "Vaal Regalia": { vis: 'hide', frac: 'show' } }
 */
// ---------- base ranks: one rank per base (S best, C lowest and the default), and per kind of drop
// the lowest rank you still want to see. "Rares: S only, Fractured: B and up" hides a B-rank Vaal
// Regalia as a plain rare but shows it fractured.
const RANKS = ['S', 'A', 'B', 'C', 'D']; // D: untiered, the lowest and the default
const RANK_LOOKS = {
  S: { fontSize: 45, text: [255, 255, 255, 255], border: [255, 255, 255, 255], background: [30, 110, 200, 255], sound: { id: 1, volume: 300 }, beam: { color: 'Blue' }, icon: { size: 0, color: 'Blue', shape: 'Star' } },
  A: { fontSize: 42, text: [20, 30, 10, 255], border: [20, 30, 10, 255], background: [140, 200, 40, 255], sound: { id: 2, volume: 300 }, beam: { color: 'Green', temp: true }, icon: { size: 1, color: 'Green', shape: 'Diamond' } },
  B: { fontSize: 38, text: [40, 30, 0, 255], border: [40, 30, 0, 255], background: [250, 200, 60, 240], icon: { size: 2, color: 'Yellow', shape: 'Circle' } },
  C: { fontSize: 36, text: [30, 15, 0, 255], border: [30, 15, 0, 255], background: [230, 130, 40, 230], icon: { size: 2, color: 'Orange', shape: 'Triangle' } },
  D: { fontSize: 32, text: [255, 220, 210, 255], border: [180, 40, 40, 255], background: [120, 25, 25, 220] },
};
const NO_FLAGS = [{ keyword: 'Mirrored', values: ['False'] }, { keyword: 'Corrupted', values: ['False'] }];
const RANK_KINDS = [ // in the order the page lists them; synthesised items are left to the filter
  { id: 'rares', name: 'Rares', about: 'Plain rares (not fractured, synthesised or influenced)', conditions: [{ keyword: 'Rarity', values: ['Rare'] }, { keyword: 'FracturedItem', values: ['False'] }, { keyword: 'SynthesisedItem', values: ['False'] }, { keyword: 'HasInfluence', values: ['None'] }, ...NO_FLAGS] },
  { id: 'crafting', name: 'High ilvl bases', about: 'Normal and magic items of a high item level', ilvl: true, conditions: [{ keyword: 'Rarity', values: ['Normal', 'Magic'] }, { keyword: 'FracturedItem', values: ['False'] }, { keyword: 'SynthesisedItem', values: ['False'] }, { keyword: 'HasInfluence', values: ['None'] }, ...NO_FLAGS] },
  { id: 'fractured', name: 'Fractured', about: 'Any fractured item of the base', conditions: [{ keyword: 'Rarity', values: ['Normal', 'Magic', 'Rare'] }, { keyword: 'FracturedItem', values: ['True'] }] },
  { id: 'influenced', name: 'Influenced', about: 'Shaper, Elder and Conqueror bases', conditions: [{ keyword: 'Rarity', values: ['Normal', 'Magic', 'Rare'] }, { keyword: 'HasInfluence', values: ['Shaper', 'Elder', 'Crusader', 'Hunter', 'Redeemer', 'Warlord'] }, { keyword: 'FracturedItem', values: ['False'] }, { keyword: 'SynthesisedItem', values: ['False'] }] },
];
const rankOf = (ranks, base) => (RANKS.includes(ranks?.[base]) ? ranks[base] : 'D');

/**
 * ranks: { base: 'S' | 'A' | 'B' | 'C' | 'D' } (missing = D); kinds: { fractured: 'B', rares: 'S', ... } where the
 * value is the lowest rank still shown, 'none' hides them all, and 'off' (or missing) leaves the kind to
 * your filter. bases: every base the ranking covers.
 */
function rankRules(ranks = {}, kinds = {}, bases = [], { mapsOnly = true, craftIlvl = 82, ilvls = {} } = {}) {
  const out = [];
  const area = mapsOnly ? [{ keyword: 'AreaLevel', op: '>=', values: ['68'] }] : [];
  const sockets = [{ keyword: 'Sockets', op: '<', values: ['6'] }];
  for (const k of RANK_KINDS) {
    const min = kinds?.[k.id];
    if (!min || min === 'off') continue;
    // the item level a kind starts at (crafting bases: 82 unless you change it; others: any)
    const lv = Math.round(Number(ilvls?.[k.id] ?? (k.ilvl ? craftIlvl || 82 : 1)));
    const conds = [...k.conditions, ...(lv > 1 ? [{ keyword: 'ItemLevel', op: '>=', values: [String(Math.min(100, lv))] }] : [])];
    const keep = min === 'none' ? [] : RANKS.slice(0, RANKS.indexOf(min) + 1);
    for (const r of keep) {
      const list = bases.filter((b) => rankOf(ranks, b) === r).sort();
      if (list.length) out.push({ id: `rank-${k.id}-${r}`, enabled: true, action: 'Show', group: 'ranks', label: `Base ranks: ${k.name.toLowerCase()}, rank ${r}`, conditions: [...conds, { keyword: 'BaseType', op: '==', values: list }], style: RANK_LOOKS[r] });
    }
    const drop = bases.filter((b) => !keep.includes(rankOf(ranks, b))).sort();
    if (drop.length) out.push({ id: `rank-${k.id}-hide`, enabled: true, action: 'Hide', group: 'ranks', label: `Base ranks: ${k.name.toLowerCase()} below ${min === 'none' ? 'any rank' : `rank ${min}`}`, conditions: [...conds, ...area, ...sockets, { keyword: 'BaseType', op: '==', values: drop }], style: { disableDropSound: true } });
  }
  return out;
}

/**
 * Item types you don't want while levelling: their normal and magic drops (and rares, if you say so)
 * are hidden in the campaign (area level up to `untilLevel`, 67 by default). Linked items can stay.
 * o: { classes: ['Claws', ...], rares: false, untilLevel: 67, keepLinks: 4 }
 */
const CAMPAIGN_CLASSES = ['Claws', 'Daggers', 'Rune Daggers', 'Wands', 'One Hand Swords', 'Thrusting One Hand Swords', 'One Hand Axes', 'One Hand Maces', 'Sceptres',
  'Bows', 'Staves', 'Warstaves', 'Two Hand Swords', 'Two Hand Axes', 'Two Hand Maces', 'Quivers', 'Shields', 'Body Armours', 'Helmets', 'Gloves', 'Boots', 'Rings', 'Amulets', 'Belts'];
/**
 * "Show all currency" (league start): every currency rule of the filter shows, with its own look. Hidden
 * tiers become Show and tiers FilterBlade switched off for your strictness are switched on.
 */
function showAllCurrency(text) {
  const lines = text.split(/\r?\n/);
  const isHead = (l) => /^#?\s*(Show|Hide|Minimal)\b/.test(l);
  const currency = (l) => /\$type->currency(->|\s|$)/.test(l) || /\$type->currency\b/.test(l);
  for (let i = 0; i < lines.length; i += 1) {
    if (!isHead(lines[i]) || !currency(lines[i])) continue;
    const off = /^#/.test(lines[i]);
    let k = i;
    for (; k < lines.length && lines[k].trim() !== ''; k += 1) {
      if (k > i && isHead(lines[k])) break;
      if (off) lines[k] = lines[k].replace(/^#/, '');
    }
    lines[i] = lines[i].replace(/^(\s*)Hide\b/, '$1Show').replace(/^(\s*)Minimal\b/, '$1Show');
    i = k - 1;
  }
  return lines.join('\n');
}

function campaignHideRules(o = {}) {
  const until = Math.max(1, Math.min(83, Math.round(Number(o.untilLevel) || 67)));
  const out = [];
  const classes = (o.classes || []).filter((c) => CAMPAIGN_CLASSES.includes(c));
  // rapiers (thrusting swords) go with one-hand swords
  if (classes.includes('One Hand Swords') && !classes.includes('Thrusting One Hand Swords')) classes.push('Thrusting One Hand Swords');
  if (!classes.length) return out;
  const links = Math.round(Number(o.keepLinks));
  const conds = [{ keyword: 'Rarity', values: o.rares ? ['Normal', 'Magic', 'Rare'] : ['Normal', 'Magic'] },
    { keyword: 'AreaLevel', op: '<=', values: [String(until)] },
    ...(links >= 2 && links <= 6 ? [{ keyword: 'LinkedSockets', op: '<', values: [String(links)] }] : []),
    { keyword: 'Class', op: '==', values: classes }];
  out.push({ id: 'campaign-hide', enabled: true, action: 'Hide', group: 'campaign', label: 'Campaign: item types you hid', conditions: conds, style: { disableDropSound: true } });
  return out;
}

function matrixRules(state = {}, { mapsOnly = true, keepIlvl = null } = {}) {
  const ranked = new Set(RANKED_NAMES); // heist and ritual bases: left to the filter
  const pick = (f) => Object.entries(state || {}).filter(([n, v]) => n && v && ranked.has(n) && f(v)).map(([n]) => n).sort();
  const fracTop = pick((v) => v.frac === 'top');
  const fracShow = pick((v) => v.frac === 'show');
  const fracHide = pick((v) => v.frac === 'hide');
  const hide = pick((v) => v.vis === 'hide');
  const plain = { keyword: 'Rarity', values: ['Normal', 'Magic', 'Rare'] };
  const out = [];
  if (fracTop.length) out.push({ id: 'matrix-frac-top', enabled: true, action: 'Show', group: 'matrix', label: 'Base visibility: the best fractured bases', conditions: [plain, { keyword: 'FracturedItem', values: ['True'] }, { keyword: 'BaseType', op: '==', values: fracTop }], style: FRACTURED_TOP_STYLE });
  if (fracShow.length) out.push({ id: 'matrix-frac-show', enabled: true, action: 'Show', group: 'matrix', label: 'Base visibility: fractured bases you want', conditions: [plain, { keyword: 'FracturedItem', values: ['True'] }, { keyword: 'BaseType', op: '==', values: fracShow }], style: FRACTURED_STYLE });
  if (fracHide.length) out.push({ id: 'matrix-frac-hide', enabled: true, action: 'Hide', group: 'matrix', label: 'Base visibility: hide fractured', conditions: [plain, { keyword: 'FracturedItem', values: ['True'] }, { keyword: 'BaseType', op: '==', values: fracHide }], style: { disableDropSound: true } });
  if (hide.length) {
    const conds = [plain,
      { keyword: 'FracturedItem', values: ['False'] }, { keyword: 'SynthesisedItem', values: ['False'] },
      { keyword: 'HasInfluence', values: ['None'] }, { keyword: 'Mirrored', values: ['False'] }, { keyword: 'Corrupted', values: ['False'] },
      { keyword: 'Sockets', op: '<', values: ['6'] }];
    if (mapsOnly) conds.push({ keyword: 'AreaLevel', op: '>=', values: ['68'] });
    if (Number(keepIlvl) > 0) conds.push({ keyword: 'ItemLevel', op: '<', values: [String(Math.round(Number(keepIlvl)))] });
    conds.push({ keyword: 'BaseType', op: '==', values: hide });
    out.push({ id: 'matrix-hide', enabled: true, action: 'Hide', group: 'matrix', label: 'Base visibility: bases you hid', conditions: conds, style: { disableDropSound: true } });
  }
  return out;
}

/** Lower-case letters and digits only: "Gemcutters Mercy" and "Gemcutter's Mercy" compare equal. */
const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The game refuses to load a filter if a single BaseType value matches no item
 * ("No base types found exactly matching ..."). Every name we write therefore has to be
 * one the game knows: anything in your FilterBlade filter (switched-off tiers included),
 * or a name poe.ninja gave us verbatim. A near miss ("Gemcutters Mercy") is corrected
 * to the real spelling; anything else is left out instead of breaking the filter.
 */
function nameChecker(baseText, verified = []) {
  const exact = new Set();
  for (const m of baseText.matchAll(/^#?[ \t]*BaseType\b[^"\r\n]*(.*)$/gm)) for (const q of m[1].matchAll(/"([^"]+)"/g)) exact.add(q[1]);
  for (const n of verified) if (n) exact.add(n);
  const byKey = new Map([...exact].map((n) => [nameKey(n), n]));
  const dropped = new Set();
  const fix = (v) => {
    if (exact.has(v)) return v;
    const hit = byKey.get(nameKey(v));
    if (hit) return hit;
    dropped.add(v);
    return null;
  };
  return { fix, dropped, known: exact };
}

/** Copy of a rule with every BaseType value checked; null when nothing valid is left to match. */
function cleanRule(rule, fix) {
  let empty = false;
  const conditions = (rule.conditions || []).map((c) => {
    if (c.keyword !== 'BaseType') return c;
    const values = [...new Set((c.values || []).map(fix).filter(Boolean))];
    if (!values.length) empty = true;
    return { ...c, values };
  });
  return empty ? null : { ...rule, conditions };
}

/**
 * Last line of defence before the file reaches the game: every active BaseType value must be a
 * name the game knows. Unknown values are removed; a block left with none is commented out.
 */
function finalCheck(text, fix, log = () => {}) {
  const doc = parse(text);
  let changed = 0;
  for (const b of blocks(doc)) {
    if (b.disabled) continue;
    for (const l of b.lines) {
      if (l.keyword !== 'BaseType' || !l.values?.length) continue;
      const ok = l.values.filter((v) => fix(v) === v);
      if (ok.length === l.values.length) continue;
      changed++;
      if (!ok.length) { b.disabled = true; break; }
      const ind = /^[ \t]*/.exec(l.raw)[0];
      const cr = l.raw.endsWith('\r') ? '\r' : '';
      l.values = ok;
      l.raw = `${ind}BaseType${l.op ? ' ' + l.op : ''} ${ok.map((v) => `"${v}"`).join(' ')}${cr}`;
    }
  }
  if (!changed) return text;
  log('final check fixed BaseType lines', changed);
  return serialize(doc);
}

class FilterManager {
  constructor({ store, soundsDir = null, userSoundsDir = null, log = () => {} }) {
    this.store = store; // JsonStore: filterDir, baseFilter, overrides[], economy{enabled, thresholds}
    this.soundsDir = soundsDir;
    this.userSoundsDir = userSoundsDir; // sounds you dropped into the app ("my-*.mp3|wav|ogg")
    this.log = log;
    this.watcher = null;
    this.lastEconomy = [];
    this.verifiedNames = new Set(); // exact names from poe.ninja, filled in by the services
    this.lastDropped = [];
  }

  dir() {
    return this.store.get('filterDir') || detectFilterDir();
  }

  list() {
    return listFilters(this.dir());
  }

  /** Where the chosen filter should be, whether or not the file is still there. */
  chosenPath() {
    const name = this.store.get('baseFilter');
    if (!name) return null;
    return path.isAbsolute(name) ? name : path.join(this.dir() || '', name);
  }

  /**
   * The chosen filter's path, or null if none is chosen or the file is gone.
   * When the game re-downloads a synced filter it can get a new file name in OnlineFilters;
   * then the filter with the same name (as FilterBlade calls it) is picked up automatically.
   */
  basePath() {
    const p = this.chosenPath();
    if (!p) return null;
    if (fs.existsSync(p)) {
      if (!this._nameNoted || this._nameNoted !== p) {
        const nm = onlineFilterName(p) || path.basename(p).replace(/\.filter$/i, '');
        if (nm && nm !== this.store.get('baseFilterName')) this.store.set('baseFilterName', nm);
        this._nameNoted = p;
      }
      return p;
    }
    const found = this.findReplacement();
    if (!found) return null;
    this.log('chosen filter moved', this.store.get('baseFilter'), '->', found.name);
    this.store.set('baseFilter', found.name);
    this.store.set('baseFilterName', String(found.display).replace(/ \(synced from FilterBlade\)$/, ''));
    this._nameNoted = found.path;
    this.lastSwitch = { from: path.basename(p), to: found.display, at: Date.now() };
    return found.path;
  }

  /** A filter in the folder with the same name as the one that disappeared. */
  findReplacement() {
    const helper = this.store.get('lastWrite')?.target;
    const wanted = this.store.get('baseFilterName') || (helper ? path.basename(helper).replace(new RegExp(`${HELPER_SUFFIX.replace(/[()]/g, '\\$&')}\\.filter$`), '') : null);
    const key = (x) => String(x).toLowerCase().replace(/ \(synced from filterblade\)$/, '').trim();
    const all = this.list();
    const byName = wanted ? all.find((f) => key(f.display) === key(wanted)) : null;
    if (byName) return byName;
    // renamed on FilterBlade too: if the old one was synced and there is exactly one synced filter now, it's that one
    const wasOnline = /^OnlineFilters[\\/]/.test(String(this.store.get('baseFilter') || ''));
    const online = all.filter((f) => f.online);
    return wasOnline && online.length === 1 ? online[0] : null;
  }

  /** Name of the chosen filter if its file is gone and nothing could replace it. */
  missing() {
    const p = this.chosenPath();
    if (!p || this.basePath()) return null;
    return { file: path.basename(p), name: this.store.get('baseFilterName') || null };
  }

  readBase() {
    const p = this.basePath();
    if (!p) {
      const m = this.chosenPath() ? this.missing() : null;
      throw new Error(m ? `Your filter${m.name ? ` "${m.name}"` : ''} isn't in the filter folder any more. Choose it again on the Loot filter page.` : 'Choose your base filter on the Loot filter page first.');
    }
    return fs.readFileSync(p, 'utf8');
  }

  overrides() {
    return this.store.get('overrides') || [];
  }

  saveOverrides(list) {
    this.store.set('overrides', list);
  }

  addOverride(rule) {
    const list = this.overrides();
    list.unshift(rule);
    this.saveOverrides(list);
    return rule;
  }

  setEconomy(rules) {
    this.lastEconomy = rules;
  }

  /** Writes "<base> (helper).filter". Returns its path. */
  write() {
    const base = this.basePath();
    const patch0 = this.store.get('tierPatch') || {};
    const baseText = this.readBase();
    const check = nameChecker(baseText, [...this.verifiedNames, ...MATRIX_NAMES, ...cluster.SIZES.map((z) => z.base)]);
    // names you added with "Add anyway" are written as typed: you asked for exactly that
    const forced = new Set(this.store.get('forcedNames') || []);
    const fix = (v) => (forced.has(v) ? v : check.fix(v));
    const moves = {};
    for (const [k, to] of Object.entries(patch0.moves || {})) {
      const [type, b] = k.split('\t');
      const ok = fix(b);
      if (ok) moves[`${type}\t${ok}`] = to;
    }
    const patch = { ...patch0, moves };
    // Your tier moves and tier looks are applied to a fresh copy of the base filter every time.
    let text = applyTierPatch(baseText, patch);
    if (this.store.get('showAllCurrency')) text = showAllCurrency(text);
    // Synced filters start with metadata the game keeps for online filters; the local copy doesn't need it.
    if (text.startsWith('#Online Item Filter')) text = text.replace(/^(#(Online Item Filter|[a-zA-Z]+:[^\n]*)\r?\n)+/, '');
    const eco = (this.store.get('economy')?.enabled ? this.lastEconomy : []).map((r) => cleanRule(r, fix)).filter(Boolean);
    const myBases = (this.store.get('myBases') || []).filter((e) => e.enabled !== false && e.base).map((e) => myBaseRule(e, this.store.get('myBasesStyle') || MY_BASES_STYLE));
    const hidden = hiddenBaseRules(baseText, patch, { fractured: !!this.store.get('hideFractured'), synthesised: !!this.store.get('hideSynthesised') });
    // My bases first (what you collect always shows), then your rules, then hiding fractured copies of hidden bases
    const matrix = matrixRules(this.store.get('baseMatrix') || {}, this.store.get('baseMatrixOpts') || {});
    const ranked = rankRules(this.store.get('baseRanks') || {}, this.store.get('rankKinds') || {}, RANKED_NAMES, { mapsOnly: (this.store.get('baseMatrixOpts') || {}).mapsOnly !== false, craftIlvl: this.store.get('rankCraftIlvl') || 82, ilvls: this.store.get('rankIlvl') || {} });
    const clusterState = this.store.get('clusterGrid') || {};
    let clusterBlocks = [];
    if (Object.keys(clusterState).length) {
      let looks = {};
      try { looks = cluster.readFilter(tierView(baseText, patch).types.find((t) => t.type === 'jewels->clustereco')).looks; } catch { looks = {}; }
      clusterBlocks = cluster.clusterRules(clusterState, looks);
    }
    // cluster jewel choices first: they're the most specific (enchantment + passives + item level)
    // base ranks come before base visibility: they're the finer choice (per kind of drop)
    const campaign = campaignHideRules(this.store.get('campaignHide') || {});
    const overrides = [...clusterBlocks, ...myBases, ...this.overrides(), ...campaign, ...hidden, ...ranked, ...matrix].map((r) => cleanRule(r, fix)).filter(Boolean);
    this.lastDropped = [...check.dropped].filter((v) => !forced.has(v));
    if (this.lastDropped.length) this.log('left out unknown item names', this.lastDropped.join(', '));
    const out = finalCheck(buildHelperFilter({ baseText: text, overrides, economy: eco, header: { baseName: onlineFilterName(base) || path.basename(base) } }), fix, this.log);
    const target = helperPathFor(base);
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, out, 'utf8');
    fs.renameSync(tmp, target);
    this.copySounds(path.dirname(target), [...overrides, ...eco, ...Object.values(patch.styles || {}).map((style) => ({ style }))]);
    this.store.set('lastWrite', { at: Date.now(), target, leftOut: this.lastDropped.slice(0, 50) });
    return target;
  }

  /** Copy the app's tink files the rules use into "<filter folder>/poehelper-sounds/". */
  copySounds(filterDir, rules) {
    if (!this.soundsDir) return;
    const used = new Set(rules.filter((r) => r.enabled !== false).map((r) => r.style?.customSound).filter((s) => s && s.startsWith(SOUND_SUBDIR + '/')));
    if (!used.size) return;
    const dest = path.join(filterDir, SOUND_SUBDIR);
    fs.mkdirSync(dest, { recursive: true });
    for (const rel of used) {
      const file = path.basename(rel);
      const src = /^my-/.test(file) && this.userSoundsDir ? path.join(this.userSoundsDir, file) : path.join(this.soundsDir, file);
      const dst = path.join(dest, file);
      try {
        if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) fs.copyFileSync(src, dst);
      } catch (e) {
        this.log('sound copy failed', file, e.message);
      }
    }
  }

  parsedBase() {
    return parse(this.readBase());
  }

  /** Parsed helper output if it exists, else the base. Used by the explainer. */
  /** The text of the filter the game reads (your helper version, else the FilterBlade file). */
  activeText() {
    const base = this.basePath();
    if (!base) return null;
    const helper = helperPathFor(base);
    return fs.readFileSync(fs.existsSync(helper) ? helper : base, 'utf8');
  }

  parsedActive() {
    const text = this.activeText();
    return text == null ? null : parse(text);
  }

  /** Rebuild the helper filter whenever the base file changes (e.g. FilterBlade re-download). */
  /**
   * Rebuild the "(helper)" copy when your filter changes. The folder is watched rather than the
   * file, because the game replaces synced filters (sometimes under a new file name).
   */
  watch(onRebuilt) {
    this.unwatch();
    const base = this.basePath();
    if (!base) return;
    const dir = path.dirname(base);
    let t = null;
    let lastMtime = (() => { try { return fs.statSync(base).mtimeMs; } catch { return 0; } })();
    try {
      this.watcher = fs.watch(dir, () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const now = this.basePath(); // may switch to the new file of the same filter
          if (!now) return;
          let m = 0;
          try { m = fs.statSync(now).mtimeMs; } catch { return; }
          if (m === lastMtime && now === base) return; // something else in the folder changed
          lastMtime = m;
          try { onRebuilt?.(this.write()); } catch (e) { this.log('rebuild failed', e.message); }
          if (now !== base) this.watch(onRebuilt);
        }, 1500);
      });
    } catch (e) { this.log('watch failed', e.message); }
  }

  unwatch() {
    this.watcher?.close();
    this.watcher = null;
  }
}

module.exports = { showAllCurrency, campaignHideRules, CAMPAIGN_CLASSES, matrixRules, MATRIX_NAMES, RANKED_NAMES, NOT_RANKED_GROUPS, FRACTURED_STYLE, FRACTURED_TOP_STYLE, hiddenBaseRules, rankRules, RANKS, RANK_LOOKS, RANK_KINDS, myBaseRule, MY_BASES_STYLE, nameChecker, cleanRule, nameKey, onlineFilterName, FilterManager, buildHelperFilter, economyRules, quickRule, detectFilterDir, listFilters, helperPathFor, TIER_STYLES, TIER_LOOKS, DEFAULT_TIER_SOUNDS, SOUNDS, SOUND_SUBDIR, soundStyle, soundChoiceOf, MARK };
