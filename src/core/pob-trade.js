'use strict';
/**
 * "Find the best item for me" on the trade site, the way Path of Building's trade search does it:
 *
 *  1. PoB swaps your item for a blank one of the same base and adds one mod at a time
 *     (src/pob/host.lua, op "weights"): what each mod is worth to your DPS and effective HP.
 *  2. That worth per point of the stat becomes the stat's weight in a weighted-sum trade search
 *     (the trade site's "Weighted Sum" stat group), sorted by the sum, with your level and price limits.
 *  3. The top listings come back as item text and PoB tests each one in that slot.
 *
 * Nothing here talks to the network.
 */
const { indexStats } = require('./trade');

// The mods tried. `line` is how PoB reads it (with a typical value); `value` is that value in trade terms
// (the average for "Adds # to #"); `trade` lists [stat type, trade text] to look up, first found wins;
// `kinds` are the item kinds that can have it. `local` mods count only on that item (weapon, armour piece).
const ARMOUR = ['helmet', 'body', 'gloves', 'boots', 'shield'];
const JEWELLERY = ['amulet', 'ring', 'belt'];
const GEAR = [...ARMOUR, ...JEWELLERY];
const CANDIDATES = [
  { line: '+100 to maximum Life', value: 100, trade: [['pseudo', '+# total maximum Life'], ['explicit', '+# to maximum Life']], kinds: GEAR },
  { line: '+60 to maximum Mana', value: 60, trade: [['pseudo', '+# total maximum Mana'], ['explicit', '+# to maximum Mana']], kinds: [...GEAR, 'weapon'] },
  { line: '+50 to maximum Energy Shield', value: 50, trade: [['explicit', '+# to maximum Energy Shield']], kinds: JEWELLERY },
  { line: '+60 to maximum Energy Shield', value: 60, trade: [['explicit', '+# to maximum Energy Shield']], kinds: ARMOUR, local: true },
  { line: '100% increased Energy Shield', value: 100, trade: [['explicit', '#% increased Energy Shield']], kinds: ARMOUR, local: true },
  { line: '+200 to Armour', value: 200, trade: [['explicit', '+# to Armour']], kinds: ARMOUR, local: true },
  { line: '100% increased Armour', value: 100, trade: [['explicit', '#% increased Armour']], kinds: ARMOUR, local: true },
  { line: '+200 to Evasion Rating', value: 200, trade: [['explicit', '+# to Evasion Rating']], kinds: ARMOUR, local: true },
  { line: '100% increased Evasion Rating', value: 100, trade: [['explicit', '#% increased Evasion Rating']], kinds: ARMOUR, local: true },
  { line: '+20% chance to Suppress Spell Damage', value: 20, trade: [['pseudo', '+#% chance to Suppress Spell Damage'], ['explicit', '+#% chance to Suppress Spell Damage']], kinds: ['body', 'gloves', 'boots', 'shield', 'helmet'] },
  { line: '+40% to Fire Resistance', value: 40, trade: [['pseudo', '+#% total to Fire Resistance'], ['explicit', '+#% to Fire Resistance']], kinds: GEAR },
  { line: '+40% to Cold Resistance', value: 40, trade: [['pseudo', '+#% total to Cold Resistance'], ['explicit', '+#% to Cold Resistance']], kinds: GEAR },
  { line: '+40% to Lightning Resistance', value: 40, trade: [['pseudo', '+#% total to Lightning Resistance'], ['explicit', '+#% to Lightning Resistance']], kinds: GEAR },
  { line: '+30% to Chaos Resistance', value: 30, trade: [['pseudo', '+#% total to Chaos Resistance'], ['explicit', '+#% to Chaos Resistance']], kinds: GEAR },
  { line: '+50 to Strength', value: 50, trade: [['pseudo', '+# total to Strength'], ['explicit', '+# to Strength']], kinds: [...GEAR, 'weapon'] },
  { line: '+50 to Dexterity', value: 50, trade: [['pseudo', '+# total to Dexterity'], ['explicit', '+# to Dexterity']], kinds: [...GEAR, 'weapon'] },
  { line: '+50 to Intelligence', value: 50, trade: [['pseudo', '+# total to Intelligence'], ['explicit', '+# to Intelligence']], kinds: [...GEAR, 'weapon'] },
  { line: '30% increased Movement Speed', value: 30, trade: [['pseudo', '#% increased Movement Speed'], ['explicit', '#% increased Movement Speed']], kinds: ['boots'] },
  { line: '12% increased Attack Speed', value: 12, trade: [['pseudo', '+#% total Attack Speed'], ['explicit', '#% increased Attack Speed']], kinds: ['gloves', 'amulet', 'ring', 'shield', 'quiver'] },
  { line: '12% increased Cast Speed', value: 12, trade: [['pseudo', '+#% total Cast Speed'], ['explicit', '#% increased Cast Speed']], kinds: ['amulet', 'ring', 'shield', 'weapon'] },
  { line: '35% increased Global Critical Strike Chance', value: 35, trade: [['explicit', '#% increased Global Critical Strike Chance']], kinds: ['amulet', 'ring', 'quiver', 'helmet'] },
  { line: '+35% to Global Critical Strike Multiplier', value: 35, trade: [['explicit', '+#% to Global Critical Strike Multiplier']], kinds: ['amulet', 'ring', 'gloves', 'quiver', 'weapon'] },
  { line: 'Adds 10 to 20 Physical Damage to Attacks', value: 15, trade: [['pseudo', 'Adds # to # Physical Damage to Attacks'], ['explicit', 'Adds # to # Physical Damage to Attacks']], kinds: ['gloves', 'amulet', 'ring', 'quiver'] },
  { line: 'Adds 20 to 40 Fire Damage to Attacks', value: 30, trade: [['pseudo', 'Adds # to # Fire Damage to Attacks'], ['explicit', 'Adds # to # Fire Damage to Attacks']], kinds: ['gloves', 'amulet', 'ring', 'quiver'] },
  { line: 'Adds 20 to 40 Cold Damage to Attacks', value: 30, trade: [['pseudo', 'Adds # to # Cold Damage to Attacks'], ['explicit', 'Adds # to # Cold Damage to Attacks']], kinds: ['gloves', 'amulet', 'ring', 'quiver'] },
  { line: 'Adds 5 to 55 Lightning Damage to Attacks', value: 30, trade: [['pseudo', 'Adds # to # Lightning Damage to Attacks'], ['explicit', 'Adds # to # Lightning Damage to Attacks']], kinds: ['gloves', 'amulet', 'ring', 'quiver'] },
  { line: '35% increased Elemental Damage with Attack Skills', value: 35, trade: [['pseudo', '#% increased Elemental Damage with Attack Skills'], ['explicit', '#% increased Elemental Damage with Attack Skills']], kinds: ['amulet', 'ring', 'belt', 'quiver'] },
  { line: '30% increased Spell Damage', value: 30, trade: [['pseudo', '#% increased Spell Damage'], ['explicit', '#% increased Spell Damage']], kinds: ['amulet', 'ring', 'shield', 'weapon'] },
  { line: '+1 to Level of all Skill Gems', value: 1, trade: [['explicit', '+# to Level of all Skill Gems']], kinds: ['amulet'] },
  { line: '+1 to Level of all Minion Skill Gems', value: 1, trade: [['explicit', '+# to Level of all Minion Skill Gems']], kinds: ['helmet', 'amulet', 'weapon'] },
  { line: '+1 to Level of all Spell Skill Gems', value: 1, trade: [['explicit', '+# to Level of all Spell Skill Gems']], kinds: ['amulet', 'weapon'] },
  // weapons: their own damage
  { line: '150% increased Physical Damage', value: 150, trade: [['explicit', '#% increased Physical Damage']], kinds: ['weapon'], local: true },
  { line: 'Adds 20 to 40 Physical Damage', value: 30, trade: [['explicit', 'Adds # to # Physical Damage']], kinds: ['weapon'], local: true },
  { line: 'Adds 50 to 100 Fire Damage', value: 75, trade: [['explicit', 'Adds # to # Fire Damage']], kinds: ['weapon'], local: true },
  { line: 'Adds 50 to 100 Cold Damage', value: 75, trade: [['explicit', 'Adds # to # Cold Damage']], kinds: ['weapon'], local: true },
  { line: 'Adds 10 to 140 Lightning Damage', value: 75, trade: [['explicit', 'Adds # to # Lightning Damage']], kinds: ['weapon'], local: true },
  { line: '25% increased Attack Speed', value: 25, trade: [['explicit', '#% increased Attack Speed']], kinds: ['weapon'], local: true },
  { line: '35% increased Critical Strike Chance', value: 35, trade: [['explicit', '#% increased Critical Strike Chance']], kinds: ['weapon'], local: true },
];

/** PoB item type -> trade category (the same as Path of Building's TradeHelpers.getTradeCategory). */
const CATEGORY = {
  Helmet: 'armour.helmet', 'Body Armour': 'armour.chest', Gloves: 'armour.gloves', Boots: 'armour.boots', Shield: 'armour.shield', Quiver: 'armour.quiver',
  Amulet: 'accessory.amulet', Ring: 'accessory.ring', Belt: 'accessory.belt',
  'One Handed Sword': 'weapon.onesword', 'Thrusting One Handed Sword': 'weapon.onesword', 'Two Handed Sword': 'weapon.twosword',
  'One Handed Axe': 'weapon.oneaxe', 'Two Handed Axe': 'weapon.twoaxe', 'One Handed Mace': 'weapon.onemace', Sceptre: 'weapon.onemace', 'Two Handed Mace': 'weapon.twomace',
  Bow: 'weapon.bow', Claw: 'weapon.claw', Dagger: 'weapon.dagger', 'Rune Dagger': 'weapon.dagger',
  Staff: 'weapon.staff', Warstaff: 'weapon.staff', Wand: 'weapon.wand', 'Fishing Rod': 'weapon.rod',
};
/** Item kind for the candidate list, from the PoB item type. */
function kindOf(type) {
  const t = String(type || '');
  if (t === 'Helmet') return 'helmet';
  if (t === 'Body Armour') return 'body';
  if (t === 'Gloves') return 'gloves';
  if (t === 'Boots') return 'boots';
  if (t === 'Shield') return 'shield';
  if (t === 'Quiver') return 'quiver';
  if (t === 'Amulet') return 'amulet';
  if (t === 'Ring') return 'ring';
  if (t === 'Belt') return 'belt';
  return CATEGORY[t] ? 'weapon' : null;
}
function candidatesFor(type) {
  const kind = kindOf(type);
  return kind ? CANDIDATES.filter((c) => c.kinds.includes(kind)) : [];
}

const FOCUS = { damage: { dps: 1, ehp: 0 }, balanced: { dps: 0.5, ehp: 0.5 }, defence: { dps: 0, ehp: 1 } };

/**
 * PoB's answer (one entry per candidate: dpsPct / ehpPct with that mod on a blank item, compared to the blank item)
 * -> trade weights. A weight is worth per point: what the mod does to your build, divided by its value.
 */
function weightsFrom(results, cands, statsJson, { focus = 'balanced' } = {}) {
  const f = FOCUS[focus] || FOCUS.balanced;
  const idx = indexStats(statsJson);
  const norm = (t) => t.replace(/\+#/g, '#').replace(/[+-]?\d+(?:\.\d+)?/g, '#').replace(/\s+\(Local\)$/i, '').replace(/\s+/g, ' ').toLowerCase().trim();
  const byId = new Map();
  const missing = [];
  cands.forEach((c, i) => {
    const r = results[i];
    if (!r) return;
    const worth = f.dps * (r.dpsPct || 0) + f.ehp * (r.ehpPct || 0);
    if (!(worth > 0.01)) return;
    let hit = null;
    for (const [type, text] of c.trade) {
      const list = idx[type]?.[norm(text)];
      if (!list?.length) continue;
      // local mods (weapon damage, armour on that piece) have their own trade stat
      hit = (c.local ? list.find((e) => e.local) : list.find((e) => !e.local)) || list[0];
      if (hit) break;
    }
    if (!hit) { missing.push(c.line); return; }
    const weight = worth / c.value;
    const had = byId.get(hit.id);
    if (!had || had.weight < weight) byId.set(hit.id, { id: hit.id, text: hit.text, weight, worth, line: c.line });
  });
  // nicer numbers: the best stat gets 100
  const list = [...byId.values()].sort((a, b) => b.weight - a.weight);
  const top = list[0]?.weight || 1;
  for (const w of list) w.tradeWeight = Math.max(0.01, Math.round((w.weight / top) * 10000) / 100);
  return { weights: list, missing, scale: 100 / top };
}

/** The weighted-sum search: best items first, your level and price limits. */
function buildWeightedQuery({ weights, category, maxLevel, maxPriceChaos, minSum, status = 'securable' }) {
  const query = {
    status: { option: status },
    stats: [{ type: 'weight', filters: weights.map((w) => ({ id: w.id, value: { weight: w.tradeWeight } })), ...(minSum > 0 ? { value: { min: Math.round(minSum * 100) / 100 } } : {}) }],
    filters: { type_filters: { filters: { ...(category ? { category: { option: category } } : {}), rarity: { option: 'nonunique' } } } },
  };
  if (maxLevel) query.filters.req_filters = { filters: { lvl: { max: Math.round(maxLevel) } } };
  if (maxPriceChaos) query.filters.trade_filters = { filters: { price: { max: Math.round(maxPriceChaos * 100) / 100 } } };
  return { query, sort: { 'statgroup.0': 'desc' }, engine: 'new' };
}

/** A fetched trade listing -> the text the game copies, which PoB reads. */
function itemTextFromTrade(item) {
  if (!item) return '';
  const rarity = { 0: 'Normal', 1: 'Magic', 2: 'Rare', 3: 'Unique', 9: 'Relic' }[item.frameType] || item.rarity || 'Rare';
  const out = [`Rarity: ${rarity}`];
  if (item.name) out.push(item.name.replace(/<<[^>]*>>/g, ''));
  out.push((item.typeLine || item.baseType || '').replace(/<<[^>]*>>/g, ''));
  out.push('--------');
  const q = (item.properties || []).find((p) => p.name === 'Quality');
  if (q?.values?.[0]?.[0]) { out.push(`Quality: ${q.values[0][0]}`); out.push('--------'); }
  if (item.sockets?.length) {
    const groups = [];
    for (const s of item.sockets) (groups[s.group] = groups[s.group] || []).push(s.sColour || 'W');
    out.push(`Sockets: ${groups.filter(Boolean).map((g) => g.join('-')).join(' ')}`);
    out.push('--------');
  }
  out.push(`Item Level: ${item.ilvl || 1}`);
  const sec = (lines, tag) => { if (lines?.length) { out.push('--------'); for (const l of lines) for (const p of String(l).split('\n')) out.push(tag ? `${p} (${tag})` : p); } };
  sec(item.enchantMods, 'enchant');
  sec(item.implicitMods, 'implicit');
  const mods = [...(item.fracturedMods || []).map((m) => `${m} (fractured)`), ...(item.explicitMods || []), ...(item.craftedMods || []).map((m) => `${m} (crafted)`)];
  if (mods.length) { out.push('--------'); for (const m of mods) for (const p of String(m).split('\n')) out.push(p); }
  if (item.corrupted) { out.push('--------'); out.push('Corrupted'); }
  return out.join('\n');
}

module.exports = { CANDIDATES, CATEGORY, candidatesFor, kindOf, weightsFrom, buildWeightedQuery, itemTextFromTrade, FOCUS };
