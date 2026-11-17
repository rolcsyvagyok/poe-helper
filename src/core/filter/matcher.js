'use strict';
const DROP_LEVELS = require('./drop-levels.json'); // base name -> drop level, from RePoE (game data)
/**
 * "Why is this item shown/hidden?" — evaluates a parsed filter against a parsed
 * clipboard item and returns the block the game would apply.
 *
 * Some conditions can't be known from the clipboard (AreaLevel, DropLevel, Width...).
 * Those are treated as matching and listed in `unknown` so the UI can say so.
 */

const { blocks } = require('./parser');

const RARITY_ORDER = { Normal: 0, Magic: 1, Rare: 2, Unique: 3 };

function cmp(op, a, b) {
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '!=': return a !== b;
    case '==':
    case '=':
    case null:
    case undefined:
      return a === b;
    default: return false;
  }
}

function numCond(op, values, actual) {
  if (actual == null) return false;
  const n = Number(values[0]);
  if (!Number.isFinite(n)) return null;
  return cmp(op, actual, n);
}

function boolCond(values, actual) {
  const want = String(values[0]).toLowerCase() === 'true';
  return !!actual === want;
}

function stringList(op, values, actual) {
  if (actual == null) return false;
  const a = String(actual).toLowerCase();
  const vs = values.map((v) => v.toLowerCase());
  if (op === '==') return vs.includes(a);
  if (op === '!=') return !vs.some((v) => a.includes(v));
  return vs.some((v) => a.includes(v));
}

function rarityOf(item) {
  return RARITY_ORDER[item.rarity] != null ? item.rarity : 'Normal';
}

/** Returns true/false. Conditions the clipboard can't show are pushed onto `assumed`. */
/**
 * The game's name for a cluster jewel's small passives (what EnchantmentPassiveNode compares), from the enchant:
 * "15% increased Critical Strike Chance" is "Critical Chance", "Claw… / Dagger…" is "Dagger and Claw Damage".
 */
const CLUSTER_NODES = [
  [/Claw Attacks|Dagger Attacks/i, 'Dagger and Claw Damage'], [/Axe Attacks|Sword Attacks/i, 'Axe and Sword Damage'],
  [/Mace or Sceptre Attacks|Staff Attacks/i, 'Mace and Staff Damage'], [/Wand Attacks/i, 'Wand Damage'],
  [/Damage with Bows|with Bow Skills/i, 'Bow Damage'], [/Trap Damage|Mine Damage/i, 'Trap and Mine Damage'],
  [/Minions deal .*while you are affected by a Herald/i, 'Minion Damage while you have a Herald'],
  [/Damage while affected by a Herald/i, 'Damage while you have a Herald'],
  [/^Minions deal/i, 'Minion Damage'], [/Minions have .*maximum Life/i, 'Minion Life'],
  [/Critical Strike Chance/i, 'Critical Chance'], [/Attack Damage while holding a Shield/i, 'Attack Damage while holding a Shield'],
  [/Attack Damage while Dual Wielding/i, 'Attack Damage while Dual Wielding'], [/Damage with Two Handed Weapons/i, 'Damage with Two Handed Weapons'],
  [/Chaos Damage over Time/i, 'Chaos Damage over Time'], [/Physical Damage over Time/i, 'Physical Damage over Time'],
  [/Cold Damage over Time/i, 'Cold Damage over Time'], [/Burning Damage/i, 'Fire Damage over Time'], [/Damage over Time/i, 'Damage over Time'],
  [/Exerted Attacks/i, 'Exerted Attack Damage'], [/Reservation Efficiency/i, 'Reservation Efficiency'], [/Flask Effect Duration/i, 'Flask Duration'],
  [/Recovery from Flasks/i, 'Flask Recovery'], [/Non-Damaging Ailments/i, 'Effect of Non-Damaging Ailments'], [/Non-Curse Auras/i, 'Aura Effect'],
  [/Effect of your Curses/i, 'Curse Effect'], [/Block Spell Damage/i, 'Chance to Block Spell Damage'], [/Block Attack Damage/i, 'Chance to Block Attack Damage'],
  [/Suppress Spell Damage/i, 'Chance to Suppress Spell Damage'], [/Channelling Skills/i, 'Channelling Skill Damage'],
  [/(\w+) Resistance/i, (m) => `${m[1]} Resistance`], [/maximum Energy Shield/i, 'Energy Shield'], [/maximum Mana/i, 'Mana'], [/maximum Life/i, 'Life'],
  [/Evasion Rating/i, 'Evasion'],
];
function clusterNode(grant) {
  for (const [re, name] of CLUSTER_NODES) { const m = re.exec(grant); if (m) return (typeof name === 'function' ? name(m) : name).toLowerCase(); }
  // the rest read as the node: "10% increased Projectile Damage" -> "projectile damage"
  return (/increased (.+?)$/im.exec(grant)?.[1] || grant).toLowerCase();
}

function evalCondition(c, item, assumed) {
  const v = c.values || [];
  const mods = [...(item.mods?.explicit || []), ...(item.mods?.crafted || []), ...(item.mods?.fractured || [])];
  switch (c.keyword) {
    case 'Class': return stringList(c.op, v, item.itemClass);
    case 'BaseType': return stringList(c.op, v, item.baseType || item.typeLine);
    case 'Rarity': {
      if (v.length > 1 || !c.op || c.op === '==' || c.op === '=') return v.includes(rarityOf(item));
      return cmp(c.op, RARITY_ORDER[rarityOf(item)], RARITY_ORDER[v[0]] ?? -1);
    }
    case 'ItemLevel': return numCond(c.op, v, item.itemLevel);
    // 3.30: only on unidentified items; when the copy doesn't show the tier, the filter's choice is assumed
    case 'UnidentifiedItemTier': {
      // normal items have an item tier too (FilterBlade's tier rules take "Rarity Normal Magic Rare"), but their
      // copy never says it: decided per tier like an unidentified item whose copy doesn't show it
      if (rarityOf(item) === 'Normal' && item.unidTier == null) return 'tier';
      if (!item.flags?.unidentified) return false;
      if (item.unidTier == null) return 'tier'; // the copy doesn't say the tier: explain() reports both ways
      return numCond(c.op, v, item.unidTier);
    }
    // where it dropped isn't on the item: an item level is close to the area level it dropped in; without
    // one (currency, cards) assume maps (83), where price checks are made
    case 'AreaLevel': return numCond(c.op, v, Number(item.areaLevel) || Math.min(83, Number(item.itemLevel) || 83));
    // the base's drop level (game data); unknown bases are left to the context rule
    case 'DropLevel': { const d = DROP_LEVELS[item.baseType || item.typeLine]; return d == null ? null : numCond(c.op, v, d); }
    case 'Quality': return numCond(c.op, v, item.quality ?? 0);
    case 'MemoryStrands': return numCond(c.op, v, item.memoryStrands ?? 0);
    case 'Sockets': return socketsCond(c.op, v[0], item.sockets);
    case 'LinkedSockets': return numCond(c.op, v, item.sockets?.links ?? 0);
    case 'StackSize': return numCond(c.op, v, item.stack?.current ?? 1);
    case 'GemLevel': return numCond(c.op, v, item.gemLevel);
    case 'MapTier': return numCond(c.op, v, item.mapTier);
    case 'Corrupted': return boolCond(v, item.flags?.corrupted);
    // 3.30: normal items have an unidentified item tier, and the game doesn't count them as identified
    case 'Identified': return boolCond(v, !item.flags?.unidentified && rarityOf(item) !== 'Normal');
    case 'Mirrored': return boolCond(v, item.flags?.mirrored);
    case 'FracturedItem': return boolCond(v, item.flags?.fractured);
    case 'SynthesisedItem': return boolCond(v, item.flags?.synthesised);
    case 'AnyEnchantment': return boolCond(v, (item.mods?.enchant || []).length > 0);
    case 'TransfiguredGem': return boolCond(v, item.transfigured);
    case 'Replica': return boolCond(v, /^Replica /.test(item.name || ''));
    case 'BlightedMap': return boolCond(v, /^Blighted /.test(item.typeLine || ''));
    case 'UberBlightedMap': return boolCond(v, /^Blight-ravaged /.test(item.typeLine || ''));
    case 'ShaperItem': return boolCond(v, item.influences?.includes('Shaper'));
    case 'ElderItem': return boolCond(v, item.influences?.includes('Elder'));
    case 'HasInfluence': {
      if (v[0] === 'None') return (item.influences || []).length === 0;
      const have = (item.influences || []).map((i) => i.toLowerCase());
      return v.some((x) => have.includes(x.toLowerCase()));
    }
    case 'HasExplicitMod': {
      // Filters list mod *names* ("Veiled", "of the Polymath"). Ctrl+Alt+C copies include them;
      // plain Ctrl+C doesn't, so without names we assume the item doesn't have the mod.
      const names = (item.modNames || []).map((n) => n.toLowerCase());
      const texts = mods.map((m) => m.toLowerCase());
      // the count is how many of the item's mods match any of the listed names (NeverSink's
      // HasExplicitMod >=8 "a" "e" "i" "o" "u" "y" means "8 or more mods"); without mod names, each
      // mod line stands for one mod
      const want = v.map((x) => x.toLowerCase());
      const pool = names.length ? names : texts;
      const hits = pool.filter((x) => want.some((n) => x === n || x.includes(n))).length;
      if (!names.length) assumed?.push(c.keyword);
      if (c.count != null) return cmp(c.op || '>=', hits, c.count);
      return hits > 0;
    }
    // cluster jewels: "Adds 8 Passive Skills" and the small passives' kind ("…grant: 12% increased Attack Damage while Dual Wielding")
    case 'EnchantmentPassiveNum': {
      const n = (item.mods?.enchant || []).map((t) => /^Adds (\d+) Passive Skills?/i.exec(t)).find(Boolean);
      return n ? numCond(c.op, v, Number(n[1])) : unknownCondition(c, assumed);
    }
    case 'EnchantmentPassiveNode': {
      const grants = (item.mods?.enchant || []).filter((t) => /^Added Small Passive Skills grant:/i.test(t)).map((t) => t.replace(/^Added Small Passive Skills grant:\s*/i, ''));
      if (!grants.length) return unknownCondition(c, assumed);
      const node = clusterNode(grants.join('\n'));
      return v.some((x) => (c.op === '==' ? x.toLowerCase() === node : node.includes(x.toLowerCase())));
    }
    case 'HasEnchantment': return stringList(null, v, (item.mods?.enchant || []).join('\n'));
    case 'HasImplicitMod': return boolCond(v, (item.mods?.implicit || []).length > 0);
    case 'Foulborn': return boolCond(v, item.flags?.foulborn);
    case 'Fated': return boolCond(v, item.flags?.fated);
    case 'Scourged': return boolCond(v, (item.mods?.scourge || []).length > 0);
    case 'CorruptedMods': {
      // Corrupted implicits aren't labelled on the clipboard; uncorrupted items have none.
      if (item.flags?.corrupted) assumed?.push(c.keyword);
      return numCond(c.op, v, item.flags?.corrupted ? Math.min(2, (item.mods?.implicit || []).length) : 0);
    }
    case 'HasSearingExarchImplicit': return numCond(c.op, v, item.influences?.includes('Searing Exarch') || item.flags?.searing ? 1 : 0);
    case 'HasEaterOfWorldsImplicit': return numCond(c.op, v, item.flags?.eater ? 1 : 0);
    case 'SocketGroup': {
      const want = String(v[0] || '').toUpperCase().replace(/^\d+/, '');
      const groups = (item.sockets?.raw || '').split(/\s+/).map((g) => g.replace(/-/g, ''));
      return groups.some((g) => [...want].every((ch) => (g.match(new RegExp(ch, 'g')) || []).length >= (want.match(new RegExp(ch, 'g')) || []).length));
    }
    default:
      return unknownCondition(c, assumed);
  }
}

// Conditions about the drop context or base stats that the clipboard can't show: assume they match.
const CONTEXT_KEYWORDS = new Set(['AreaLevel', 'DropLevel', 'Width', 'Height', 'BaseArmour', 'BaseEvasion', 'BaseEnergyShield', 'BaseWard', 'BaseDefencePercentile', 'GemQualityType', 'HasSearingExarchImplicit', 'HasEaterOfWorldsImplicit']);

/**
 * Anything else is a rare item property (MemoryStrands, Imbued, ZanaMemory, Vestigial,
 * HasCruciblePassiveTree, EnchantmentPassiveNum, ...). Assuming they're absent is right for
 * almost every item; assuming they're present made unrelated blocks "match" everything.
 */
function unknownCondition(c, assumed) {
  assumed?.push(c.keyword);
  if (CONTEXT_KEYWORDS.has(c.keyword)) return true;
  const v = c.values || [];
  if (/^(true|false)$/i.test(v[0] || '')) return String(v[0]).toLowerCase() === 'false';
  if (v.length && /^-?\d+$/.test(v[v.length - 1])) return cmp(c.op || '=', 0, Number(v[v.length - 1]));
  return false;
}

/** Sockets syntax: "5", ">= 6", "AAA" (abyss), "5RGB", "W". */
function socketsCond(op, value, sockets) {
  const m = /^(\d*)([RGBWAD]*)$/i.exec(String(value || ''));
  if (!m) return false;
  const total = sockets?.sockets ?? 0;
  const colors = sockets?.colors || {};
  const effOp = op || '=';
  let ok = true;
  if (m[1]) ok = cmp(effOp, total, Number(m[1]));
  if (m[2]) {
    const need = {};
    for (const ch of m[2].toUpperCase()) need[ch] = (need[ch] || 0) + 1;
    // For letters, "=", ">=" and ">" all mean "at least this many of each colour"
    ok = ok && Object.entries(need).every(([ch, n]) => (effOp === '<' || effOp === '<=' ? (colors[ch] || 0) <= n : (colors[ch] || 0) >= n));
  }
  return ok;
}

const STYLE_KEYWORDS = new Set(['SetTextColor', 'SetBorderColor', 'SetBackgroundColor', 'SetFontSize', 'PlayAlertSound', 'PlayAlertSoundPositional', 'CustomAlertSound', 'PlayEffect', 'MinimapIcon', 'DisableDropSound', 'EnableDropSound', 'DisableDropSoundIfAlertSound']);

/**
 * @returns {{action, block, line, comment, style:object, unknown:string[], chain:[]} | null}
 */
function explain(doc, item) {
  const chain = [];
  const style = {};
  const unknown = new Set();
  const tierRules = [];
  // per item tier (5 down to 1): which rule takes it, when the copy doesn't say the tier
  const byTier = (fallback) => (tierRules.length ? [5, 4, 3, 2, 1].map((t) => {
    const r = tierRules.find((x) => x.fits(t)) || fallback;
    return { tier: t, action: r.action, line: r.line, comment: r.comment, style: r.style };
  }) : null);
  for (const b of blocks(doc)) {
    if (b.disabled) continue; // switched off in FilterBlade: the game reads it as a comment
    let ok = true;
    const blockUnknown = [];
    let isContinue = false;
    let needsTier = null;
    for (const l of b.lines) {
      if (!l.keyword) continue;
      if (l.keyword === 'Continue') { isContinue = true; continue; }
      if (STYLE_KEYWORDS.has(l.keyword)) continue;
      const r = evalCondition(l, item, blockUnknown);
      if (r === 'tier') { needsTier = l; continue; }
      if (r === null) blockUnknown.push(l.keyword);
      else if (!r) { ok = false; break; }
    }
    // an unidentified item whose tier the copy doesn't show: the first rule that would take it at some
    // tier is kept as "if its item tier is N or higher", and the search goes on as if it didn't match
    if (ok && needsTier) {
      if (!isContinue) {
        const st = { ...style };
        for (const l of b.lines) if (STYLE_KEYWORDS.has(l.keyword)) st[l.keyword] = l.values;
        const n = Number((needsTier.values || [])[needsTier.values.length - 1]);
        const op = needsTier.op || '=';
        tierRules.push({ fits: (t) => numCond(op, [String(n)], t), action: b.action, line: b.startLine, comment: b.headerComment, style: st });
      }
      continue;
    }
    if (!ok) continue;
    blockUnknown.forEach((u) => unknown.add(u));
    for (const l of b.lines) if (STYLE_KEYWORDS.has(l.keyword)) style[l.keyword] = l.values;
    chain.push({ action: b.action, line: b.startLine, comment: b.headerComment, unknown: blockUnknown });
    if (!isContinue) {
      return { action: b.action, line: b.startLine, comment: b.headerComment, style, unknown: [...unknown], chain, byTier: byTier({ action: b.action, line: b.startLine, comment: b.headerComment, style }) };
    }
  }
  if (chain.length) {
    const last = chain[chain.length - 1];
    return { action: last.action, line: last.line, comment: last.comment, style, unknown: [...unknown], chain, byTier: byTier({ ...last, style }) };
  }
  return { action: 'Show', line: null, comment: 'No block matched (game default: shown)', style: {}, unknown: [], chain };
}

module.exports = { explain, evalCondition, clusterNode };
