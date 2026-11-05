'use strict';
/**
 * Cluster jewels: which enchantment, how many passives and what item level make one valuable.
 *
 * NeverSink tiers them in "jewels->clustereco" with tiers named n<passives>_i<itemlevel>_t<1|2>
 * (n4 means 4-5 passives), each listing the enchantments (EnchantmentPassiveNode) worth showing.
 * This module reads those tiers into a grid (size x enchantment x passives x item level band),
 * prices the grid with poe.ninja's ClusterJewel list, and writes your own choices as rules above
 * the filter: "top" and "good" use NeverSink's own T1 / T2 look for that jewel size, "hide" hides.
 */

const SIZES = [
  { id: 'Large', base: 'Large Cluster Jewel', passives: [8, 9, 10, 11, 12] },
  { id: 'Medium', base: 'Medium Cluster Jewel', passives: [4, 5, 6] },
  { id: 'Small', base: 'Small Cluster Jewel', passives: [2, 3] },
];
const BANDS = [
  { id: '84', name: 'Item level 84+', min: 84, max: null },
  { id: '75', name: 'Item level 75-83', min: 75, max: 83 },
  { id: '68', name: 'Item level 68-74', min: 68, max: 74 },
];

const s = (t) => t.split('|');
// Enchantment names exactly as the game writes them in EnchantmentPassiveNode (FilterBlade's list).
const ENCHANTS = {
  Large: s('Attack Damage|Attack Damage while Dual Wielding|Attack Damage while holding a Shield|Axe and Sword Damage|Bow Damage|Chaos Damage|Cold Damage|Dagger and Claw Damage|Damage with Two Handed Weapons|Elemental Damage|Fire Damage|Lightning Damage|Mace and Staff Damage|Minion Damage|Physical Damage|Spell Damage|Wand Damage'),
  Medium: s('Area Damage|Brand Damage|Channelling Skill Damage|Chaos Damage over Time|Cold Damage over Time|Critical Chance|Damage over Time|Damage while you have a Herald|Effect of Non-Damaging Ailments|Exerted Attack Damage|Fire Damage over Time|Flask Duration|Minion Damage while you have a Herald|Minion Life|Physical Damage over Time|Projectile Damage|Totem Damage|Trap and Mine Damage'),
  Small: s('Armour|Chance to Block Attack Damage|Chance to Block Spell Damage|Chance to Suppress Spell Damage|Chaos Resistance|Cold Resistance|Curse Effect|Energy Shield|Evasion|Fire Resistance|Flask Duration|Life|Life and Mana recovery from Flasks|Lightning Resistance|Mana|Reservation Efficiency'),
};
const ALL_ENCHANTS = [...new Set(Object.values(ENCHANTS).flat())];

const sizeOfBase = (b) => SIZES.find((x) => x.base === b) || null;
const bandOf = (ilvl) => (ilvl >= 84 ? '84' : ilvl >= 75 ? '75' : ilvl >= 68 ? '68' : null);
const cellKey = (size, enchant, passives, band) => `${size}|${enchant}|${passives}|${band}`;
const quoted = (line) => [...String(line).matchAll(/"([^"]+)"/g)].map((m) => m[1]);

/** NeverSink's clustereco tiers -> { cells: {key: 't1'|'t2'}, looks: {Large: {t1, t2}}, extra: {Large: [names]} } */
function readFilter(typeView) {
  const cells = {};
  const looks = {};
  const extra = { Large: [], Medium: [], Small: [] };
  for (const tier of typeView?.tiers || []) {
    const m = /^n(\d+)_i(\d+)_(t[12])$/.exec(tier.tier);
    const size = sizeOfBase(tier.bases[0]);
    if (!m || !size) continue;
    const n = Number(m[1]);
    const band = String(m[2]);
    const t = m[3];
    if (band === '84' && tier.style && !looks[size.id]?.[t]) looks[size.id] = { ...(looks[size.id] || {}), [t]: tier.style };
    if (tier.off || tier.state === 'Off' || (tier.state || tier.action) === 'Hide') continue;
    const enchants = (tier.conditions || []).filter((c) => /^EnchantmentPassiveNode\b/.test(c)).flatMap(quoted);
    // "n4" is NeverSink's "4 or 5 passives" (EnchantmentPassiveNum <= 5)
    const counts = size.id === 'Medium' && n === 4 ? [4, 5] : [n];
    for (const e of enchants) {
      if (!ENCHANTS[size.id].includes(e) && !extra[size.id].includes(e)) extra[size.id].push(e);
      for (const p of counts) {
        const k = cellKey(size.id, e, p, band);
        if (!cells[k] || t === 't1') cells[k] = t;
      }
    }
  }
  return { cells, looks, extra };
}

/**
 * poe.ninja ClusterJewel lines -> { key: chaos }. The list names each jewel by its enchantment and gives the
 * passives in "variant" and the item level in "levelRequired"; matching is loose so a renamed field
 * only means fewer prices, never wrong ones (the longest enchantment name that fits wins).
 */
// How the game (and so poe.ninja, which names cluster jewels by their stat text) words each enchantment.
// Checked first; anything not listed falls back to "all the words of the name appear in the text".
const STAT_TEXT = {
  'Axe and Sword Damage': /axe attacks deal|sword attacks deal/,
  'Mace and Staff Damage': /mace or sceptre attacks deal|staff attacks deal/,
  'Dagger and Claw Damage': /claw attacks deal|dagger attacks deal/,
  'Wand Damage': /wand attacks deal/,
  'Bow Damage': /damage with bows|with bow skills/,
  'Damage with Two Handed Weapons': /two handed weapons/,
  'Attack Damage while Dual Wielding': /attack damage while dual wielding/,
  'Attack Damage while holding a Shield': /attack damage while holding a shield/,
  'Minion Damage while you have a Herald': /minions deal .*while you are affected by a herald/,
  'Damage while you have a Herald': /^(?!.*minion).*damage while affected by a herald/,
  'Minion Damage': /^(?!.*herald).*minions deal .*increased damage/,
  'Minion Life': /minions have .*maximum life/,
  'Fire Damage over Time': /burning damage|fire damage over time/,
  'Effect of Non-Damaging Ailments': /non-damaging ailments/,
  'Exerted Attack Damage': /exerted attacks/,
  'Trap and Mine Damage': /trap damage|mine damage/,
  'Channelling Skill Damage': /channelling skills deal/,
  'Critical Chance': /critical strike chance/,
  'Curse Effect': /effect of your curses/,
  'Reservation Efficiency': /reservation efficiency|non-curse auras/,
  'Flask Duration': /flask effect duration/,
  'Life and Mana recovery from Flasks': /recovery from flasks/,
  'Chance to Suppress Spell Damage': /suppress spell damage/,
  'Chance to Block Attack Damage': /block attack damage/,
  'Chance to Block Spell Damage': /block spell damage/,
  'Energy Shield': /maximum energy shield/,
  'Evasion': /evasion rating/,
};

function priceCells(lines = [], stats = null) {
  const out = {};
  const miss = (l, why) => { if (stats) { stats.missed.push({ name: l.name || '', variant: l.variant || '', base: l.baseType || '', ilvl: l.levelRequired ?? null, why }); } };
  if (stats) { stats.total = lines.length; stats.missed = []; }
  // poe.ninja may name a jewel "Minion Damage" or by its stat text ("Minions deal 10% increased Damage"),
  // so an enchantment matches when all its meaningful words are in the text; the most specific one wins.
  const STOP = new Set(['and', 'a', 'you', 'have', 'while', 'with', 'to', 'from', 'of', 'over']);
  const words = (e) => e.toLowerCase().split(/[\s-]+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/s$/, ''));
  const keyed = ALL_ENCHANTS.map((e) => ({ e, w: words(e) }));
  for (const l of lines) {
    const text = `${l.name || ''} ${l.variant || ''}`.toLowerCase();
    const size = SIZES.find((x) => `${l.baseType || ''} ${l.name || ''}`.toLowerCase().includes(x.id.toLowerCase()));
    const p = Number(/(\d+)\s*passive/.exec(text)?.[1]);
    const band = bandOf(Number(l.levelRequired ?? l.itemLevel ?? 0));
    if (!size || !p || !band || !(l.chaos > 0)) { miss(l, !size ? 'size' : !p ? 'passives' : !band ? 'item level' : 'price'); continue; }
    // the name exactly ("Minion Damage"), then the game's stat text, then the words of the name
    const own = ENCHANTS[size.id];
    const name = String(l.name || '').trim().toLowerCase();
    let e = own.find((x) => x.toLowerCase() === name);
    if (!e) e = own.find((x) => STAT_TEXT[x] && STAT_TEXT[x].test(text));
    if (!e) {
      const fits = keyed.filter((x) => own.includes(x.e) && !STAT_TEXT[x.e] && x.w.every((w) => text.includes(w)));
      if (fits.length) e = fits.sort((a, b) => b.w.length - a.w.length || b.e.length - a.e.length)[0].e;
    }
    if (!e) { miss(l, 'enchantment'); continue; }
    const k = cellKey(size.id, e, p, band);
    out[k] = Math.max(out[k] || 0, l.chaos);
  }
  return out;
}

const DEFAULT_LOOKS = {
  t1: { fontSize: 45, text: [255, 0, 0, 255], border: [255, 0, 0, 255], background: [255, 255, 255, 255], sound: { id: '6', volume: 300 }, beam: { color: 'Red' }, icon: { size: 0, color: 'Red', shape: 'Star' } },
  t2: { fontSize: 45, text: [255, 255, 255, 255], border: [255, 255, 255, 255], background: [240, 100, 0, 255], sound: { id: '2', volume: 300 }, beam: { color: 'Yellow' }, icon: { size: 1, color: 'Yellow', shape: 'Pentagon' } },
};

/** Your choices -> filter rules, one per size / passives / item level band / choice. state: {key: 'top'|'good'|'hide'} */
function clusterRules(state = {}, looks = {}) {
  const groups = new Map();
  for (const [k, v] of Object.entries(state || {})) {
    if (!['top', 'good', 'hide'].includes(v)) continue;
    const [size, enchant, p, band] = k.split('|');
    if (!SIZES.some((x) => x.id === size) || !ALL_ENCHANTS.includes(enchant) || !BANDS.some((b) => b.id === band)) continue;
    const g = `${size}|${p}|${band}|${v}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(enchant);
  }
  const order = { top: 0, good: 1, hide: 2 };
  return [...groups].sort(([a], [b]) => order[a.split('|')[3]] - order[b.split('|')[3]]).map(([g, enchants]) => {
    const [size, p, band, v] = g.split('|');
    const sz = SIZES.find((x) => x.id === size);
    const b = BANDS.find((x) => x.id === band);
    const conditions = [
      { keyword: 'Rarity', values: ['Normal', 'Magic', 'Rare'] },
      { keyword: 'BaseType', op: '==', values: [sz.base] },
      { keyword: 'EnchantmentPassiveNum', values: [p] },
      { keyword: 'ItemLevel', op: '>=', values: [String(b.min)] },
      ...(b.max ? [{ keyword: 'ItemLevel', op: '<=', values: [String(b.max)] }] : []),
      { keyword: 'EnchantmentPassiveNode', values: enchants.sort() },
    ];
    const t = v === 'top' ? 't1' : 't2';
    const label = `Cluster jewels: ${v === 'hide' ? 'hide' : v} ${size.toLowerCase()} ${p} passives, ${b.name.toLowerCase()}`;
    return {
      id: `cluster-${g}`, enabled: true, group: 'clustergrid', label, conditions,
      action: v === 'hide' ? 'Hide' : 'Show',
      style: v === 'hide' ? { disableDropSound: true } : (looks[size]?.[t] || DEFAULT_LOOKS[t]),
    };
  });
}

module.exports = { STAT_TEXT, SIZES, BANDS, ENCHANTS, ALL_ENCHANTS, cellKey, readFilter, priceCells, clusterRules, DEFAULT_LOOKS };
