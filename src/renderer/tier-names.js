'use strict';
/* Readable names for NeverSink's tier ids ("fourlinkedrares" -> "4-link rares"), shared by the
   Loot filter page and the in-game overlay so a tier is called the same everywhere.
   Works in the app's pages (window.TierNames) and in Node (tests). */
(function (root) {
  const HIDDEN_TIER = 'poehelper-hidden';

  // Uniques tiered like FilterBlade: S, A, B+C, D and High variety
  const UNIQUE_TIERS = {
    t1: ['S', 'S tier'], t2: ['A', 'A tier'], exjewels: ['A', 'A tier - jewels'], t3: ['B+C', 'B+C tier'],
    earlyleague: ['D', 'D tier - early league uniques'], hideable2: ['D', 'D tier - low value + non-drops'], hideable: ['D', 'D tier - low value'],
    multispecialhigh: ['High variety', 'High variety - top multi-bases'], multispecial: ['High variety', 'High variety - multi-bases'], multi: ['High variety', 'High variety - multi-bases'], t3boss: ['High variety', 'High variety - boss drops'],
  };
  const uniqueTier = (t) => (t?.type && /^uniques/.test(t.type) ? UNIQUE_TIERS[t.tier] || null : null);

  // NeverSink's own names for one-off tiers
  const TIER_WORDS = {
    // cluster jewels by size
    optimal1highlarge: 'Large: 12 passives, item level 84+', optimalhighlarge: 'Large: 8 passives, item level 84+', highlarge: 'Large: 8 passives', large: 'Large: the rest',
    optimalhighmedium: 'Medium: 4-5 passives, item level 84+', highmedium: 'Medium: 4-5 passives', medium: 'Medium: the rest', highsmall: 'Small: item level 84+', small: 'Small: the rest',
    // shared
    t1highlevel: 'Tier 1, item level 83+', t3any: 'Tier 3', enchanted: 'Enchanted', handpicked: 'Handpicked', any: 'Any', anyhigh: 'Any, high item level', general: 'General', generic: 'Generic',
    others: 'Others', high: 'High quality', max: 'Quality 20%', rest: 'Everything else', restex: 'Everything else', exhide: 'Hidden extras', hide: 'Hidden', final: 'Everything left',
    tnew: 'New items', abyss: 'Abyss', leveling: 'Levelling', crafting: 'Crafted mods', essence: 'Essence mods', foulborn: 'Foulborn', uber: 'Uber blighted',
    // currency
    tportal: 'Portal scrolls', twisdom: 'Wisdom scrolls', portal: 'Portal scrolls', wisdom: 'Wisdom scrolls', tscroll: 'Scrolls', tscrollfragments: 'Scroll fragments', scrollfragments: 'Scroll fragments',
    untiereditems: 'Untiered currency', essences: 'Essences', highstack: 'Big stacks (400+)', silvercoin: 'Silver Coins', mischigh: 'Miscellaneous: valuable', misclow: 'Miscellaneous: cheap',
    // divination cards
    excustomstack: 'Stacks of 3+ (handpicked)', exstack: 'Stacks of 3+',
    // uniques
    exuberimpresence: 'Shaper and Elder amulets', exkaom: 'No sockets (Kaom\'s Heart)', extabula: '6-link robes (Tabula Rasa)', exforgesword: 'Shaper and Elder swords',
    exrationaljewel: 'Synthesised jewels', exsynth: 'Synthesised rings', ex6link: '6-links', '4xabysshelmet': 'Helmets with 4 abyssal sockets', '3xabyss': '3 abyssal sockets', '2xabyss': '2 abyssal sockets',
    vestige: 'Vestigial', exuniqueidols: 'Unique idols', '2xcorrupteduniques': 'Double corrupted', excrucibleunique: 'With a crucible passive tree',
    exdust1: 'Good for dust: high', exdust2: 'Good for dust: medium', exdust3: 'Good for dust: low', overqual: 'Quality 27%+', '5link': '5-links', '6s': '6 sockets',
    recipeuniquerings: 'Rings for the vendor recipe', exjewelscorrupted: 'Corrupted jewels without corrupted mods', highvinktar: 'Item level 82+', corrupteduniques: 'Corrupted',
    // gems
    highexceptionalbadcorrupt: 'Exceptional, corrupted at low level', anyexceptionallvl: 'Exceptional, level 2+', anyexceptionalqual: 'Exceptional, with quality', altany: 'Transfigured',
    '2020z': 'Level 20, quality 20%', xx20z: 'Quality 19%+', '2120': 'Level 21, quality 20%', '2023': 'Level 20, quality 23%', '2123any': 'Level 21, quality 23%', xx23: 'Quality 23%', '21xx': 'Level 21',
    vaal20: 'Vaal gems, quality 20%', qt4lvl: 'Quality 1%+ (levelling)', ex6lvlgems: 'Level 6+', decogemsvaalbgdrop: 'Vaal gems', firstzone: 'First zone', levelingvaal: 'Vaal gems while levelling', corruptedvaalany: 'Corrupted Vaal gems',
    // maps
    decor_implicit: 'With implicit mods', deco_corruptedmod: 'With corrupted mods', zanacorrupthider: 'Corrupted memories (hidden)', zanamap: 'Memories, tier 14+', zanamaplow: 'Memories',
    infelder: 'Elder influenced', infconquerors: 'Conqueror influenced', valdomaps: 'Valdo\'s maps', nightmaremaps: 'Nightmare maps', shaperguardianmaps: 'Shaper guardian maps', mod8: '8 or more mods',
    // jewels
    '1modcorrupted': 'With a corrupted mod', '1moduncorrupted': 'With a special mod', extramodcorruptedabyssjewel: 'Corrupted with 5+ mods', corruptedabyssjewel: 'Corrupted',
    veryhighrare: 'Rare, item level 86+', veryhighmagic: 'Magic, item level 86+', highrare: 'Rare, high item level', highmagic: 'Magic, high item level', anyrare: 'Any rare', anymagic: 'Any magic',
    // crafting bases
    qualchancing: 'Quality 26%+ for chancing', armors1q1: 'Armour, best quality', armors1q2: 'Armour, high quality', weapont1q1: 'Top weapons, best quality', weapont1q2: 'Top weapons, high quality',
    weapont2q1: 'Good weapons, best quality', weapont2q2: 'Good weapons, high quality', anyoverqualityperf: 'Quality 30%+', anyoverqualityhigh: 'Very high quality', anyoverquality: 'Over 20% quality',
    perfectioncrafting: 'Perfect defences, item level 84+',
    // exotic bases
    ecotinkbases84: 'Valuable bases, item level 84+', ecotinkbases: 'Valuable bases', exoticheistbases: 'Heist bases', exoticritualbases: 'Ritual bases', exoticlakekala: 'Lake of Kalandra bases',
    exoticexpeditionbases: 'Expedition bases', exotictalismanbases: 'Talismans', exoticbasesmisc: 'Other exotic bases', exoticuniquebases: 'Bases for uniques', exoticmiragebases: 'Mirage bases',
    stygianmirage: 'Stygian Vise (Mirage)', stygian86: 'Stygian Vise, item level 86+', stygian: 'Stygian Vise', exoticsacrificial: 'Sacrificial bases', exoticpearl: 'Pearl bases',
    // rares worth identifying
    weapon_phys: 'Physical weapons', weapon_physpure: 'Pure physical weapons', weapon_ele: 'Elemental weapons', weapon_elepure: 'Pure elemental weapons', bladeblast_2core: 'Blade Blast daggers',
    gem_bow: 'Bows with + gem levels', gem_caster: 'Caster weapons with + gem levels', gem_staves: 'Staves with + gem levels',
    caster_fireweapont2: 'Caster weapons: fire', caster_coldweapont2: 'Caster weapons: cold', caster_lightweapont2: 'Caster weapons: lightning', caster_physweapont2: 'Caster weapons: physical',
    caster_chaosweapont2: 'Caster weapons: chaos', caster_slingert2: 'Spell damage wands', minionwand: 'Minion wands',
    helmet_life_based: 'Life helmets', helmet_es_based: 'Energy shield helmets', boots_life_based: 'Life boots', boots_es_based: 'Energy shield boots', gloves_life_based: 'Life gloves', gloves_es_based: 'Energy shield gloves',
    shield_esfocus: 'Energy shield shields', shield_defensefocus: 'Defence shields', shield_casterfocus: 'Caster shields', shield_lifefocus: 'Life shields',
    amu_exalter: 'Exalter\'s amulets', amu_1corecaster: 'Caster amulets, 1 key mod', amu_2corecaster: 'Caster amulets, 2 key mods', amu_1coredot: 'Damage over time amulets, 1 key mod',
    amu_2coredot: 'Damage over time amulets, 2 key mods', amu_1coreattack: 'Attack amulets, 1 key mod', amu_2coreattack: 'Attack amulets, 2 key mods',
    ring_caster: 'Caster rings', ring_attack: 'Attack rings', ring_light: 'Lightning rings', ring_minion: 'Minion rings', quiv_hit: 'Hit quivers', quiv_dot: 'Damage over time quivers',
    body_life: 'Life body armours', body_defense: 'Defence body armours', body_lifedefense: 'Life and defence body armours', body_es: 'Energy shield body armours', belt_general: 'Belts',
    idjewel_minion: 'Minion jewels', idjewel_dot: 'Damage over time jewels', idjewel_critattack: 'Attack critical strike jewels', idjewel_critspell: 'Spell critical strike jewels',
    idaj_attack: 'Attack abyss jewels', idaj_caster: 'Caster abyss jewels', idaj_minion: 'Minion abyss jewels', idaj_mixer: 'Defensive abyss jewels',
    wcastermin: 'Caster and minion weapons', wsmallarmorsblend: 'Small armour pieces', wringsblend: 'Rings', wamuletsblend: 'Amulets', wbeltsblend: 'Belts', weleattackblend: 'Elemental attack weapons',
    hightier: 'Item level 75+',
    // gold
    stacklvl1: 'Stacks of 50+ while levelling', anyother: 'Any other',
    // levelling
    quicksilver: 'Quicksilver Flasks', asortedutility: 'Other utility flasks', '4linkrares': '4-link rares', movementbootshigh: 'Movement speed boots (high)', movementbootslow: 'Movement speed boots',
    anyveiled: 'Veiled', jewellery: 'Jewellery', bootsfocus: 'Boots', bodyarmours: 'Body armours', shields: 'Shields', quivers: 'Quivers', earlylevels: 'First levels', chromaticrares: 'R-G-B rares',
    rgbsmall1: 'R-G-B, small (2x2)', rgbsmall2: 'R-G-B, small (1x4)', rgblarge: 'R-G-B, large', rgbmedium: 'R-G-B, medium', earlythreelinks: 'Early 3-links', casterweapons: 'Caster weapons',
    castercraftrings: 'Rings for caster crafting', boots: 'Boots', physical: 'Physical weapons', highphysquivers: 'High physical damage quivers', fireresistgear: 'Fire resistance gear',
    generalcrafting: 'General crafting', miniongear: 'Minion gear', minionshields: 'Minion shields', earlybodyarmours: 'Early body armours', threesocketedgear: '3-socket gear', firstareas: 'First areas',
    largemagicblocker: 'Large magic items (hidden)', mediummagicblocker: 'Medium magic items (hidden)', act1: 'Act 1', act2: 'Act 2', untilmudflats: 'Until the Mud Flats', firstlevels: 'First levels',
    // magic and corrupted items worth identifying
    bleedlifeflask: 'Life flasks against bleeding', doublemodutilflask: 'Utility flasks with 2 mods', singlemodutilflask: 'Utility flasks with 1 mod', doublemodtincture: 'Tinctures with 2 mods', singlemodtincture: 'Tinctures with 1 mod',
    // exotic mods
    fracturedveiled: 'Fractured and veiled', fracturedincursion: 'Fractured with Incursion mods', duoveil: 'Two veiled mods', incursionspeedtraps: 'Incursion mods: speed and traps',
    incursioncaster: 'Incursion mods: caster', incursionelemental: 'Incursion mods: elemental', incursionjwlry: 'Incursion mods: jewellery', incursionglovehelm: 'Incursion mods: gloves and helmets',
    incursionattack: 'Incursion mods: attack', incursionlifechest: 'Incursion mods: life body armours', incursionminion: 'Incursion mods: minion', incursionmagic: 'Incursion mods: magic items',
    incursionrandom: 'Incursion mods: other', necropoliscraft: 'Necropolis crafting mods', bestiaryvaluable: 'Bestiary mods (valuable)', bestiaryother: 'Bestiary mods', delvefractured: 'Delve mods, fractured',
    delve: 'Delve mods', mercenaryweapons: 'Mercenary weapons', mercenaryothers: 'Mercenary items', warband: 'Warband mods',
    // quest items, sockets, hiding
    questheist: 'Heist quest items', questitems: 'Quest items', '5linksleveling': '5-links while levelling', '5link6sockets': '5-link with 6 sockets', '5links': '5-links', '6sockets4h': '6 sockets (tall items)',
    '6sockets': '6 sockets', idhider: 'Identified rares (hidden)', corruptedrares: 'Corrupted rares', mirroredrares: 'Mirrored rares', normalmagicendgame: 'Normal and magic items in maps', raresendgame: 'Rares in maps',
    identifieditemhandling: 'Identified items', hh: 'Heavy and Leather Belts',
    // endgame flasks and tinctures
    overqualcorrupted: 'Corrupted, quality 30%', overqualutil1: 'Utility, best quality', overqualutil2: 'Utility, high quality', overquallife1: 'Life, best quality', overquallife2: 'Life, high quality',
    lifemana82: 'Life and mana, item level 82+', any20qualflask: 'Any, quality 20%', qualityhigh: 'High quality', qualitylow: 'Low quality', earlymappingflasks: 'Early maps: utility flasks',
    anyutility: 'Any utility flask', earlymappinglifemana: 'Early maps: life and mana flasks',
    // misc
    normalmelee: 'Normal melee', normalranged: 'Normal ranged', magicmelee: 'Magic melee', magicranged: 'Magic ranged', corruptedmaphider: 'Corrupted maps', mirroredmaphider: 'Mirrored maps',
    relickeys: 'Reliquary keys', relickeyssafe: 'Vault keys', itemizedleaguesincursion: 'Chronicle of Atzoatl', itemizedleaguesultimatum: 'Inscribed Ultimatums', enshroudedgear: 'Enshrouded gear',
    invitations: 'Invitations', labyrinthconsumable: 'Labyrinth items', incursionconsumable: 'Incursion items', strandedfractured: 'Fractured', strandedveiled: 'Veiled',
    anyimbued: 'Imbued', anysynth: 'Synthesised', voidstones: 'Voidstones', anytrinket: 'Trinkets', fishingrods: 'Fishing rods', pieces: 'Unique pieces', selectedrelics: 'Selected relics', anyrelic: 'Any relic',
    doublecorruptedjwlry: 'Double corrupted jewellery', doublecorruptedany: 'Double corrupted', singlecorruptedquivers: 'Corrupted quivers', singlecorrupteditems: 'Corrupted items', anynonbelt: 'Abyssal sockets',
    fractspecial: 'Fractured, special', fractothers: 'Fractured, others', exotic: 'Enchanted gear', anointedamulets: 'Anointed amulets', anointedrings: 'Anointed rings', crucibleany: 'Any crucible item',
    largerares: 'Large rares', mediumrares1: 'Medium rares (1x3)', mediumrares2: 'Medium rares', tinyrares: 'Small rares', fourlinkedrares: '4-link rares', corruptedraresimplicit: 'Corrupted rares with implicits',
    earlycraftoptional: 'Early crafting (optional)', earlyendgame4link: 'Early maps: 4-links', exgiftshigh: 'Item level 82+', normalidols: 'Normal idols', noticeearly: 'First levels',
    medium1: 'Medium (1x3)', medium2: 'Medium', tiny: 'Small',
  };
  for (const [k, v] of [['minor', 'Minor'], ['kamasan', 'Kamasan'], ['totemic', 'Totemic'], ['noble', 'Noble'], ['burial', 'Burial'], ['conqueror', 'Conqueror']]) {
    TIER_WORDS[`${k}rare`] = `${v} Idols, rare`;
    TIER_WORDS[`${k}magic`] = `${v} Idols, magic`;
  }

  const BANDS = { 68: '68-74', 75: '75-83', 84: '84+' };
  const cap = (s) => s.replace(/^\w/, (c) => c.toUpperCase());
  const ELEMENTS = { cold: 'cold', fire: 'fire', light: 'lightning', chaos: 'chaos', phys: 'physical', minion: 'minion' };

  /** Patterns NeverSink uses for families of tiers. */
  function fromPattern(tier, type = '') {
    let m;
    // exceptional gems are a tier list, like FilterBlade shows it
    if (type === 'gems->exceptional' && (m = /^t([1-4])$/.exec(tier))) return `${'SABC'[m[1] - 1]} tier`;
    if ((m = /^t(\d+)[a-z]*$/i.exec(tier))) return `Tier ${m[1]}`; // "t2divine": Tier 2 (the word is NeverSink's price hint)
    if ((m = /^n(\d+)_i(\d+)_t([12])$/.exec(tier))) return `${m[1]} passives, item level ${BANDS[m[2]] || `${m[2]}+`}: ${m[3] === '1' ? 'top' : 'good'}`;
    if ((m = /^t(\d)_(\d\d)$/.exec(tier))) return `Tier ${m[1]}, item level ${m[2]}+`;
    if ((m = /^(?:any|ilvl|topilvl|tinc|utility|ecotinkbases)(\d\d)$/.exec(tier))) {
      const what = { tinc: 'Tinctures, item level', utility: 'Utility, item level', topilvl: 'Top weapons, item level' }[tier.replace(/\d+$/, '')] || 'Item level';
      return `${what} ${m[1]}+`;
    }
    if ((m = /^maps_[a-d]_t(\d+)$/.exec(tier))) return `Tier ${m[1]}`;
    if ((m = /^deco_mapup_t(\d+)$/.exec(tier))) return `Highlight: tier ${m[1]}+ maps`;
    if ((m = /^deco_zone(\d)general$/.exec(tier))) return `Highlight: map group ${m[1]}`;
    if ((m = /^lt(\d)$/.exec(tier))) return ['Level 21+', 'Level 20', 'Level 18-19', 'Level 2-17'][m[1] - 1] || `Level tier ${m[1]}`;
    if ((m = /^qt(\d)$/.exec(tier))) return ['Quality 23%+', 'Quality 17%+', 'Quality 13%+', 'Quality 1%+'][m[1] - 1] || `Quality tier ${m[1]}`;
    if ((m = /^plusonegem(\w+)$/.exec(tier))) return `+1 ${ELEMENTS[m[1]] || m[1]} gems`;
    if ((m = /^l(\d)$/.exec(tier))) return `Stage ${m[1]}`;
    if ((m = /^r(\d\d)(?:bas)?$/.exec(tier))) return `Step ${Number(m[1])}`;
    if ((m = /^w(\d)$/.exec(tier))) return `Step ${m[1]}`;
    if ((m = /^stack(\d)$/.exec(tier))) return ['Big stacks', 'Medium stacks', 'Small stacks'][m[1] - 1] || `Stacks ${m[1]}`;
    if ((m = /^rrihide(\d)$/.exec(tier))) return `Hidden rares, step ${m[1]}`;
    if ((m = /^outdatedlevelflask([a-d])$/.exec(tier))) return `Outdated levelling flasks ${'abcd'.indexOf(m[1]) + 1}`;
    if ((m = /^underlevel(\d+)$/.exec(tier))) return `Up to item level ${m[1]}`;
    if ((m = /^overqual(\d)$/.exec(tier))) return m[1] === '1' ? 'Best quality' : 'High quality';
    if ((m = /^fractt(\d)$/.exec(tier))) return `Fractured, tier ${m[1]}`;
    if ((m = /^mediumrares(\d)$/.exec(tier))) return m[1] === '1' ? 'Medium rares (1x3)' : 'Medium rares';
    if (/^exotic/.test(tier) && /^exotic/.test(type)) return cap(tier.slice(6).replace(/bases$/, ' bases'));
    return null;
  }

  // last resort for ids nobody named yet: split known words, never show a glued id
  const WORDS = ['corrupted', 'uncorrupted', 'fractured', 'synthesised', 'enchanted', 'influenced', 'special', 'quality', 'utility', 'leveling', 'levelling', 'magic', 'rare', 'rares', 'unique', 'uniques',
    'normal', 'high', 'low', 'medium', 'large', 'small', 'tiny', 'top', 'early', 'late', 'endgame', 'any', 'other', 'others', 'items', 'item', 'gear', 'bases', 'base', 'maps', 'map', 'gems', 'gem', 'flasks', 'flask',
    'jewels', 'jewel', 'abyss', 'rings', 'ring', 'amulets', 'amulet', 'belts', 'belt', 'boots', 'gloves', 'helmets', 'helmet', 'shields', 'shield', 'weapons', 'weapon', 'caster', 'attack', 'minion', 'life', 'mana',
    'stack', 'stacks', 'stacked', 'linked', 'link', 'links', 'sockets', 'socket', 'four', 'five', 'six', 'three', 'two', 'one', 'double', 'single', 'mod', 'mods', 'veiled', 'hider', 'hide', 'show', 'extra', 'misc', 'general', 'level'];
  const NUM = { four: '4', five: '5', six: '6', three: '3', two: '2', one: '1' };
  function splitWords(id) {
    const out = [];
    let rest = String(id).toLowerCase().replace(/[-_]+/g, ' ').trim();
    while (rest) {
      if (rest[0] === ' ') { rest = rest.slice(1); continue; }
      const num = /^\d+/.exec(rest);
      if (num) { out.push(num[0]); rest = rest.slice(num[0].length); continue; }
      const w = WORDS.filter((x) => rest.startsWith(x)).sort((a, b) => b.length - a.length)[0];
      if (!w) return null;
      out.push(NUM[w] || w);
      rest = rest.slice(w.length);
    }
    return cap(out.join(' ').replace(/(\d) linked\b/g, '$1-link').replace(/(\d) link\b/g, '$1-link'));
  }

  /** The name a tier is shown with: t = { tier, type?, customName? }. */
  function tierName(t) {
    if (!t) return '';
    if (t.customName) return t.customName;
    const u = uniqueTier(t);
    if (u) return u[1];
    const tier = String(t.tier || '');
    if (tier === HIDDEN_TIER) return 'Hidden by you';
    if (/^poehelper-/.test(tier)) return cap(tier.slice(10).replace(/\d+$/, '')) || 'Your tier';
    if (TIER_WORDS[tier]) return TIER_WORDS[tier];
    const p = fromPattern(tier, t.type);
    if (p) return p;
    if (/^ex/.test(tier) && tier.length > 2) return `Special: ${splitWords(tier.slice(2)) || tier.slice(2)}`;
    return splitWords(tier) || cap(tier.replace(/[-_]+/g, ' ').replace(/([a-z])(\d)/g, '$1 $2'));
  }

  const api = { tierName, uniqueTier, UNIQUE_TIERS, TIER_WORDS, HIDDEN_TIER, splitWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TierNames = api;
})(typeof window !== 'undefined' ? window : globalThis);
