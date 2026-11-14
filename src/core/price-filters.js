'use strict';
/**
 * How the price check picks its search, after Awakened PoE Trade (github.com/SnosMe/awakened-poe-trade, MIT):
 *  - totals ("pseudo" stats) instead of the single mods that add up to them: elemental and chaos resistance,
 *    life (counting Strength / 2), mana (Intelligence / 2), attributes, speeds, crit, damage; those mods leave the list
 *  - armour, evasion, energy shield and weapon DPS as the item's own numbers at 20% quality, with the local mods
 *    that make them up folded in
 *  - what is ticked to start: on a rare only the life and resistance totals and the defences / DPS; on a unique only
 *    the rolls that vary (all of them when there are 3 or fewer), with a min from the roll's range
 *  - a "crafting base" search for an unfinished item worth crafting on: exact base, item level, influences, implicits
 * Pure functions on the parsed item and the matched trade stats (see trade.js).
 */
const { modTemplate, modValues } = require('./item-parser');

// "+45% to Fire Resistance" -> "#% to fire resistance" (sign dropped, lower case), to match the rules below
const tplOf = (text) => modTemplate(String(text || '')).replace(/^\+?#/, '#').replace(/\s+/g, ' ').toLowerCase();
const T = (s) => s.replace(/^\+?#/, '#').toLowerCase();

const RES = [
  { t: '#% to all elemental resistances', el: 3 },
  { t: '#% to fire resistance', el: 1 }, { t: '#% to cold resistance', el: 1 }, { t: '#% to lightning resistance', el: 1 },
  { t: '#% to fire and lightning resistances', el: 2 }, { t: '#% to fire and cold resistances', el: 2 }, { t: '#% to cold and lightning resistances', el: 2 },
  { t: '#% to chaos resistance', el: 0, chaos: true },
  { t: '#% to fire and chaos resistances', el: 1, chaos: true }, { t: '#% to cold and chaos resistances', el: 1, chaos: true }, { t: '#% to lightning and chaos resistances', el: 1, chaos: true },
  { t: '#% to all resistances', el: 3, chaos: true },
];
const ATTR = [
  { t: '# to all attributes', a: ['str', 'dex', 'int'] },
  { t: '# to strength', a: ['str'] }, { t: '# to dexterity', a: ['dex'] }, { t: '# to intelligence', a: ['int'] },
  { t: '# to strength and intelligence', a: ['str', 'int'] }, { t: '# to strength and dexterity', a: ['str', 'dex'] }, { t: '# to dexterity and intelligence', a: ['dex', 'int'] },
];

// rule: pseudo = the trade site's pseudo stat text; stats: [{ t, mult, required, keep }]; on: ticked to start
const RULES = [
  { pseudo: '+#% total Elemental Resistance', on: true, stats: RES.filter((r) => r.el).map((r) => ({ t: r.t, mult: r.el, keep: r.chaos })) },
  { pseudo: '+#% total to Chaos Resistance', on: 'chaos', stats: RES.filter((r) => r.chaos).map((r) => ({ t: r.t, keep: r.el > 0 })) },
  { pseudo: '+# total to all Attributes', group: 'to_all_attrs', stats: [{ t: '# to all attributes' }] },
  ...['str', 'dex', 'int'].map((a) => ({ pseudo: `+# total to ${{ str: 'Strength', dex: 'Dexterity', int: 'Intelligence' }[a]}`, group: 'to_x_attr', attr: a, stats: ATTR.filter((x) => x.a.includes(a)).map((x) => ({ t: x.t, keep: x.a.length > 1 })) })),
  { pseudo: '+# total maximum Life', on: true, stats: [{ t: '# to maximum life', required: true }, ...ATTR.filter((x) => x.a.includes('str')).map((x) => ({ t: x.t, mult: 0.5, keep: true }))] },
  { pseudo: '+# total maximum Mana', stats: [{ t: '# to maximum mana', required: true }, ...ATTR.filter((x) => x.a.includes('int')).map((x) => ({ t: x.t, mult: 0.5, keep: true }))] },
  { pseudo: '#% total increased maximum Energy Shield', stats: [{ t: '#% increased maximum energy shield' }] },
  { pseudo: '+# total maximum Energy Shield', stats: [{ t: '# to maximum energy shield' }] },
  { pseudo: '+#% total Attack Speed', stats: [{ t: '#% increased attack speed' }] },
  { pseudo: '+#% total Cast Speed', stats: [{ t: '#% increased cast speed' }] },
  { pseudo: '#% increased Movement Speed', stats: [{ t: '#% increased movement speed' }] },
  { pseudo: '#% total increased Physical Damage', stats: [{ t: '#% increased global physical damage' }] },
  { pseudo: '+#% Global Critical Strike Chance', group: 'gcc', stats: [{ t: '#% increased global critical strike chance' }] },
  { pseudo: '+#% total Critical Strike Chance for Spells', replaces: 'gcc', stats: [{ t: '#% increased spell critical strike chance', required: true }, { t: '#% increased global critical strike chance' }] },
  { pseudo: '+#% Global Critical Strike Multiplier', stats: [{ t: '#% to global critical strike multiplier' }] },
  { pseudo: '#% increased Elemental Damage', group: 'ied', stats: [{ t: '#% increased elemental damage' }] },
  ...['Lightning', 'Cold'].map((e) => ({ pseudo: `#% increased ${e} Damage`, replaces: 'ied', stats: [{ t: `#% increased ${e.toLowerCase()} damage`, required: true }, { t: '#% increased elemental damage' }] })),
  { pseudo: '#% increased Fire Damage', group: 'ifd', replaces: 'ied', stats: [{ t: '#% increased fire damage', required: true }, { t: '#% increased elemental damage' }] },
  { pseudo: '#% increased Spell Damage', group: 'isd', stats: [{ t: '#% increased spell damage' }] },
  ...['Lightning', 'Cold', 'Fire'].map((e) => ({ pseudo: `#% increased ${e} Spell Damage`, replaces: 'isd', stats: [{ t: `#% increased ${e.toLowerCase()} spell damage`, required: true }, { t: '#% increased spell damage' }] })),
  { pseudo: '#% increased Elemental Damage with Attack Skills', replaces: 'ied', stats: [{ t: '#% increased elemental damage with attack skills', required: true }, { t: '#% increased elemental damage' }] },
  { pseudo: '#% increased Burning Damage', replaces: 'ifd', stats: [{ t: '#% increased burning damage', required: true }, { t: '#% increased fire damage' }, { t: '#% increased elemental damage' }] },
  { pseudo: '# Life Regenerated per Second', stats: [{ t: 'regenerate # life per second' }] },
  { pseudo: '#% of Life Regenerated per Second', stats: [{ t: 'regenerate #% of life per second' }] },
  { pseudo: '#% of Physical Attack Damage Leeched as Life', stats: [{ t: '#% of physical attack damage leeched as life' }] },
  { pseudo: '#% of Physical Attack Damage Leeched as Mana', stats: [{ t: '#% of physical attack damage leeched as mana' }] },
  { pseudo: '#% increased Mana Regeneration Rate', stats: [{ t: '#% increased mana regeneration rate' }] },
];

const SOURCE_GROUPS = ['implicit', 'explicit', 'crafted', 'fractured', 'enchant'];

/** A bit under the value, floored (45 -> 40 at 10%); one decimal for small numbers. */
function minOf(v, tol) {
  const lo = v >= 0 ? v * (1 - tol) : v * (1 + tol);
  return Math.abs(v) < 10 && !Number.isInteger(v) ? Math.floor(lo * 10) / 10 : Math.floor(lo);
}

/**
 * The totals for an item. rows: matched mods ({ text, group, ... }); idxPseudo: the trade site's pseudo stats by
 * normTemplate text; norm: that normaliser. Returns { pseudo: [rows], consumed: Set of rows the totals replace }.
 */
function pseudoTotals(rows, item, idxPseudo, norm, tol = 0.1) {
  const unique = item.rarity === 'Unique';
  const corrupted = !!item.flags?.corrupted;
  const src = rows.filter((r) => SOURCE_GROUPS.includes(r.group) && !r.unmatched && !r.folded);
  const byGroup = new Map();
  const applied = [];
  let out = [];
  rules:
  for (const rule of RULES) {
    const parts = [];
    for (const r of src) {
      const info = rule.stats.find((s) => s.t === r.tpl);
      if (!info) continue;
      const v = modValues(r.text)[0];
      if (v == null) continue;
      parts.push({ row: r, info, v: v * (info.mult ?? 1) * (/\breduced\b/i.test(r.text) ? -1 : 1) });
    }
    if (!parts.length) continue;
    for (const s of rule.stats) if (s.required && !parts.some((p) => p.info.t === s.t)) continue rules;
    // on a unique a total is only worth it when two of its own mods add up to it
    if (unique && (corrupted ? parts.length < 2 : parts.filter((p) => p.row.group === 'explicit').length < 2)) continue;
    const value = Math.round(parts.reduce((a, p) => a + p.v, 0) * 100) / 100;
    if (!value) continue;
    const hit = idxPseudo[norm(rule.pseudo)]?.[0];
    if (!hit) continue;
    let on = rule.on === true;
    if (rule.on === 'chaos') on = !(parts.length === 1 && parts[0].row.group === 'crafted'); // a crafted chaos res alone isn't worth ticking
    const row = { id: hit.id, text: rule.pseudo.replace('#', String(value)), statText: rule.pseudo, value, display: value, negate: false, type: 'pseudo', group: 'pseudo', enabled: on, min: minOf(value, tol), max: null, sources: parts.map((p) => p.row), rule };
    out.push(row);
    applied.push(rule);
    if (rule.replaces && byGroup.has(rule.replaces)) { const gone = byGroup.get(rule.replaces); out = out.filter((x) => !gone.includes(x)); }
    if (rule.group) { if (!byGroup.has(rule.group)) byGroup.set(rule.group, []); byGroup.get(rule.group).push(row); }
  }
  // the single mods the totals stand for leave the list (on a unique, the ones that also count elsewhere stay)
  const consumed = new Set();
  for (const r of src) {
    if (applied.some((rule) => rule.stats.some((s) => s.t === r.tpl && (!s.keep || !unique)))) consumed.add(r);
  }
  // attributes: Strength, Dexterity and Intelligence all the same -> "all Attributes" only; else the three, and
  // the smallest dropped when it's under a third of the biggest
  const attrs = (byGroup.get('to_x_attr') || []).filter((x) => out.includes(x)).sort((a, b) => b.value - a.value);
  const toAll = (byGroup.get('to_all_attrs') || []).filter((x) => out.includes(x));
  if (attrs.length === 3) {
    if (attrs.every((x) => x.value === attrs[0].value) && toAll.length) out = out.filter((x) => !attrs.includes(x));
    else {
      out = out.filter((x) => !toAll.includes(x));
      if (attrs[2].value / attrs[0].value < 0.3) out = out.filter((x) => x !== attrs[2] && (attrs[1].value !== attrs[2].value || x !== attrs[1]));
    }
  }
  return { pseudo: out, consumed };
}

// ---------- the item's own numbers at 20% quality ----------
const DEF = [
  { key: 'ar', prop: 'Armour', words: ['armour'] },
  { key: 'ev', prop: 'Evasion Rating', words: ['evasion'] },
  { key: 'es', prop: 'Energy Shield', words: ['energy shield'] },
  { key: 'ward', prop: 'Ward', words: ['ward'] },
];
const num = (s) => { const m = /(\d+(?:\.\d+)?)/.exec(String(s || '').replace(/,/g, '')); return m ? Number(m[1]) : null; };
const q20 = (value, incr, q) => (q >= 20 ? value : (value * (100 + incr + 20)) / (100 + incr + (q || 0)));
// local "increased" defence mods: "#% increased Armour", "#% increased Armour and Energy Shield", "... Armour, Evasion and Energy Shield"
const DEF_INCR = /^#% increased (armour|evasion rating|energy shield|ward|armour and evasion|armour and energy shield|evasion and energy shield|armour, evasion and energy shield)$/;
const DEF_FLAT = /^# to (armour|evasion rating|maximum energy shield|ward)$/;
const WEAPON_TPL = /^(#% increased physical damage|adds # to # (physical|fire|cold|lightning) damage|#% increased attack speed|#% increased critical strike chance)$/;

/**
 * Armour / evasion / energy shield / ward at 20% quality; rows of local defence mods are marked folded.
 * Returns [{ key, label, value, on }] (on when the base has only that one defence).
 */
function defenceProps(item, rows) {
  const p = item.properties || {};
  const present = DEF.filter((d) => num(p[d.prop]) != null);
  if (!present.length) return [];
  const local = rows.filter((r) => ['explicit', 'crafted', 'fractured', 'implicit'].includes(r.group) && (DEF_INCR.test(r.tpl) || DEF_FLAT.test(r.tpl) || r.tpl === '#% chance to block'));
  for (const r of local) r.folded = true;
  return present.map((d) => {
    const incr = local.filter((r) => DEF_INCR.test(r.tpl) && d.words.some((w) => r.tpl.includes(w))).reduce((a, r) => a + (modValues(r.text)[0] || 0), 0);
    const value = Math.round(q20(num(p[d.prop]), incr, item.quality || 0));
    return { key: d.key, label: d.prop, value, on: present.length === 1, min: Math.floor(value * 0.9) };
  });
}

/** Weapon DPS with physical at 20% quality; rows of the weapon's damage, speed and crit mods are marked folded. */
function weaponProps(item, rows, base) {
  if (!base) return null;
  const local = rows.filter((r) => ['explicit', 'crafted', 'fractured'].includes(r.group) && WEAPON_TPL.test(r.tpl));
  for (const r of local) r.folded = true;
  const incr = local.filter((r) => r.tpl === '#% increased physical damage').reduce((a, r) => a + (modValues(r.text)[0] || 0), 0);
  const phys = Math.round(q20(base.phys, incr, item.quality || 0) * 10) / 10;
  const total = Math.round((phys + base.ele + base.chaos) * 10) / 10;
  return { ...base, phys, total, physNow: base.phys };
}

// ---------- what is ticked to start ----------

/** Unique rolls: only the ones that vary are shown; a perfect roll is searched at its value. */
function uniqueRolls(rows, item, tol) {
  const corrupted = !!item.flags?.corrupted;
  for (const r of rows) {
    if (r.unmatched || r.group === 'pseudo') continue;
    if (r.group === 'implicit' && !corrupted && !/jewel/i.test(item.itemClass || '')) { r.hidden = true; r.enabled = false; continue; }
    if (r.group !== 'explicit') continue;
    const rolls = r.meta?.rolls || [];
    if (!item.advanced) continue; // a plain copy has no ranges: everything stays shown
    const varies = rolls.some((x) => x.min !== x.max);
    if (!varies) { if (!corrupted) { r.hidden = true; r.enabled = false; } continue; }
    // the min: a tenth of the roll's range under the value; a perfect roll exactly
    const x = rolls.length > 1 ? { value: rolls.reduce((a, b) => a + b.value, 0) / rolls.length, min: rolls.reduce((a, b) => a + b.min, 0) / rolls.length, max: rolls.reduce((a, b) => a + b.max, 0) / rolls.length } : rolls[0];
    const sign = r.negate ? -1 : 1;
    const perfect = sign > 0 ? x.value >= x.max : x.value <= x.min;
    if (r.display != null) r.min = perfect ? r.display : Math.floor((r.display - Math.abs(x.max - x.min) * tol) * 100) / 100;
    r.goodness = x.max === x.min ? 1 : (x.value - x.min) / (x.max - x.min);
  }
  const visible = rows.filter((r) => !r.hidden && !r.unmatched && r.id);
  if (item.advanced && visible.length && visible.length <= 3) for (const r of visible) r.enabled = true;
}

/** An open prefix or suffix on a rare with five mods (six with a crafted one): 'prefix' | 'suffix' | null. */
function emptyAffix(item) {
  if (item.rarity !== 'Rare' || item.flags?.corrupted || item.flags?.mirrored || !item.advanced) return null;
  const metas = ['explicit', 'fractured', 'crafted'].flatMap((k) => (item.modMeta?.[k] || []).map((m) => (m ? { ...m, crafted: k === 'crafted' } : null))).filter(Boolean);
  const mods = [...new Map(metas.map((m) => [m.n, m])).values()]; // one per header (a hybrid mod has two lines)
  const crafted = mods.find((m) => m.crafted);
  if (!((mods.length === 5 && !crafted) || (mods.length === 6 && crafted))) return null;
  let pre = mods.filter((m) => m.gen === 'prefix').length;
  let suf = mods.filter((m) => m.gen === 'suffix').length;
  if (crafted) { if (crafted.gen === 'prefix') pre -= 1; else suf -= 1; }
  return pre === 2 ? 'prefix' : suf === 2 ? 'suffix' : null;
}

/** Worth offering a "crafting base" search: an unfinished item with crafting value. */
function craftingBase(item) {
  if (item.rarity !== 'Rare' && item.rarity !== 'Magic') return false;
  const finished = item.mods?.crafted?.length || item.quality === 20 || item.flags?.corrupted || item.flags?.mirrored;
  const value = item.flags?.synthesised || item.flags?.fractured || (item.influences || []).length
    || /cluster jewel/i.test(item.baseType || '') || (!/jewel/i.test(item.itemClass || '') && (item.itemLevel || 0) >= 82);
  return !finished && !!value;
}

module.exports = { RULES, tplOf, T, pseudoTotals, defenceProps, weaponProps, uniqueRolls, emptyAffix, craftingBase, minOf };

// ---------- bulk exchange (currency, fragments, scarabs, cards…), as Awakened's "bulk" search ----------

/** "Chaos Orb" -> "chaos": the trade site's exchange tag for an item name, from /api/trade/data/static. */
function exchangeTag(staticJson, name) {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  for (const g of staticJson?.result || []) for (const e of g.entries || []) if (String(e.text || '').toLowerCase() === want) return e.id;
  return null;
}

/** The exchange query: what sellers want for the item, paid in chaos or divines, cheapest first. */
function exchangeQuery(tag, { status = 'online', minimum = null } = {}) {
  return { engine: 'new', query: { status: { option: status === 'any' ? 'any' : 'online' }, have: ['chaos', 'divine'], want: [tag], ...(minimum ? { minimum } : {}) }, sort: { have: 'asc' } };
}

/**
 * Exchange answer -> { chaos: [rows], divine: [rows] }, each row { each, pay, get, stock, seller, status, indexed,
 * mine }: "each" is the price of one item in that currency. The same seller is one row (cheapest), 20 at most.
 */
function exchangeListings(json, { me = '' } = {}) {
  const out = { chaos: [], divine: [] };
  for (const r of Object.values(json?.result || {})) {
    const offers = r?.listing?.offers || [];
    if (offers.length !== 1) continue;
    const o = offers[0];
    const cur = o.exchange?.currency;
    if (!out[cur] || !(o.item?.amount > 0)) continue;
    const acc = r.listing.account || {};
    const each = o.exchange.amount / o.item.amount;
    if (out[cur].some((x) => x.seller === acc.name)) continue;
    out[cur].push({ each: Math.round(each * 10000) / 10000, pay: o.exchange.amount, get: o.item.amount, stock: o.item.stock, seller: acc.name, status: acc.online ? (acc.online.status === 'afk' ? 'afk' : 'online') : 'offline', indexed: r.listing.indexed, mine: !!me && acc.name === me });
  }
  for (const k of Object.keys(out)) out[k] = out[k].sort((a, b) => a.each - b.each).slice(0, 20);
  return out;
}

// ---------- poeprices.info price guess for rares ----------

/** The query string for poeprices.info: the plain item text in base64, the league, and who asks. */
function poepricesQuery(plainText, league) {
  const i = Buffer.from(String(plainText || ''), 'utf8').toString('base64');
  return `i=${encodeURIComponent(i)}&l=${encodeURIComponent(league)}&s=poe-helper`;
}

/** poeprices.info's answer -> { min, max, currency: 'chaos' | 'divine', confidence, why: [{ name, pct }] } or throws. */
function poepricesResult(json, { exaltChaos = null, divineChaos = null } = {}) {
  if (!json || json.error !== 0) throw new Error(json?.error_msg || 'poeprices.info gave no price for this item.');
  let { min, max, currency } = json;
  if (currency === 'exalt') {
    if (!exaltChaos) throw new Error('poeprices.info gave the price in Exalted Orbs.');
    min *= exaltChaos; max *= exaltChaos; currency = 'chaos';
    if (divineChaos && min >= divineChaos) { min /= divineChaos; max /= divineChaos; currency = 'divine'; }
  } else if (currency !== 'chaos' && currency !== 'divine') throw new Error('poeprices.info gave the price in an unknown currency.');
  const r = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
  return { min: r(min), max: r(max), currency, confidence: Math.round(json.pred_confidence_score || 0), why: (json.pred_explanation || []).slice(0, 5).map(([name, c]) => ({ name, pct: Math.round(c * 100) })) };
}

module.exports.exchangeTag = exchangeTag;
module.exports.exchangeQuery = exchangeQuery;
module.exports.exchangeListings = exchangeListings;
module.exports.poepricesQuery = poepricesQuery;
module.exports.poepricesResult = poepricesResult;
