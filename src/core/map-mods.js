'use strict';
/**
 * Map mod danger check. Fully offline. Users toggle which mods are deadly for
 * their build in Settings; defaults cover the classic build-bricking mods.
 */

const DEFAULT_RULES = [
  { id: 'reflect-phys', label: 'Physical reflect', pattern: 'reflect #% of Physical Damage', severity: 'deadly', enabled: true },
  { id: 'reflect-ele', label: 'Elemental reflect', pattern: 'reflect #% of Elemental Damage', severity: 'deadly', enabled: true },
  { id: 'no-regen', label: 'No regeneration', pattern: 'cannot Regenerate Life, Mana or Energy Shield', severity: 'deadly', enabled: true },
  { id: 'no-leech', label: 'Cannot leech', pattern: 'Cannot Leech', severity: 'danger', enabled: true },
  { id: 'less-recovery', label: 'Less recovery', pattern: 'less Recovery Rate of Life and Energy Shield', severity: 'danger', enabled: true },
  { id: 'reduced-leech', label: 'Reduced leech', pattern: 'reduced Maximum total Life, Mana and Energy Shield Recovery per second from Leech', severity: 'warn', enabled: true },
  { id: 'temp-chains', label: 'Temporal Chains', pattern: 'Cursed with Temporal Chains', severity: 'warn', enabled: true },
  { id: 'ele-weak', label: 'Elemental Weakness', pattern: 'Cursed with Elemental Weakness', severity: 'warn', enabled: true },
  { id: 'vuln', label: 'Vulnerability', pattern: 'Cursed with Vulnerability', severity: 'warn', enabled: true },
  { id: 'enfeeble', label: 'Enfeeble', pattern: 'Cursed with Enfeeble', severity: 'warn', enabled: true },
  { id: 'less-aoe', label: 'Less AoE', pattern: 'less Area of Effect', severity: 'warn', enabled: false },
  { id: 'less-max-res', label: 'Lower max resists', pattern: 'Player Resistances|-#% maximum Player Resistances', severity: 'danger', enabled: true },
  { id: 'avoid-ailments', label: 'Monsters avoid ailments', pattern: 'chance to Avoid (Elemental Ailments|being Ignited|being Shocked|being Frozen)', severity: 'warn', enabled: false },
  { id: 'no-stun', label: 'Monsters cannot be stunned', pattern: 'cannot be Stunned', severity: 'info', enabled: false },
  { id: 'extra-proj', label: 'Extra projectiles', pattern: 'fire # additional Projectiles', severity: 'warn', enabled: true },
  { id: 'point-blank', label: 'Players have Point Blank', pattern: 'Players have Point Blank', severity: 'warn', enabled: false },
  { id: 'crit-monsters', label: 'Monster crits', pattern: 'Critical Strike Multiplier', severity: 'warn', enabled: true },
  { id: 'hexproof', label: 'Hexproof monsters', pattern: 'Monsters are Hexproof', severity: 'warn', enabled: false },
  { id: 'action-speed', label: 'Action speed floor', pattern: "Action Speed cannot be modified to below Base Value", severity: 'warn', enabled: false },
  { id: 'block', label: 'Monsters block', pattern: 'chance to Block', severity: 'info', enabled: false },
];

function toRegex(pattern) {
  // Users write plain text; "#" means any number, "(a|b)" and "a|b" are alternations.
  const escaped = pattern
    .replace(/[.*+?^${}[\]\\]/g, '\\$&')
    .replace(/#/g, '[+-]?\\d+(?:\\.\\d+)?');
  return new RegExp(escaped, 'i');
}

function checkMap(item, rules = DEFAULT_RULES) {
  const mods = [...(item.mods.explicit || []), ...(item.mods.implicit || []), ...(item.mods.enchant || [])];
  const hits = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    let re;
    try { re = toRegex(r.pattern); } catch { continue; }
    const mod = mods.find((m) => re.test(m));
    if (mod) hits.push({ id: r.id, label: r.label, severity: r.severity, mod });
  }
  const order = { deadly: 0, danger: 1, warn: 2, info: 3 };
  hits.sort((a, b) => order[a.severity] - order[b.severity]);
  const p = item.properties || {};
  const pick = (k) => (p[k] != null ? parseFloat(String(p[k]).replace(/[^\d.-]/g, '')) : null);
  return {
    verdict: hits.some((h) => h.severity === 'deadly') ? 'skip' : hits.some((h) => h.severity === 'danger') ? 'careful' : 'ok',
    hits,
    stats: {
      quantity: pick('Item Quantity'),
      rarity: pick('Item Rarity'),
      packSize: pick('Monster Pack Size'),
      moreCurrency: pick('More Currency'),
      moreScarabs: pick('More Scarabs'),
      moreMaps: pick('More Maps'),
      moreDivCards: pick('More Divination Cards'),
    },
  };
}

module.exports = { checkMap, DEFAULT_RULES, toRegex };
