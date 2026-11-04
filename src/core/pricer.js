'use strict';
/**
 * Maps a parsed clipboard item to poe.ninja categories and finds the best price.
 * Only the categories an item could belong to are loaded (and they are cached),
 * so a typical session makes a handful of poe.ninja requests and zero GGG requests.
 */

const { classify } = require('./item-parser');
const { norm, slugify } = require('./ninja');

const WEAPON_CLASSES = ['claws', 'daggers', 'wands', 'one hand swords', 'thrusting one hand swords', 'one hand axes', 'one hand maces', 'sceptres', 'rune daggers', 'bows', 'staves', 'warstaves', 'two hand swords', 'two hand axes', 'two hand maces', 'fishing rods'];
const ARMOUR_CLASSES = ['body armours', 'helmets', 'gloves', 'boots', 'shields', 'quivers'];
const ACCESSORY_CLASSES = ['rings', 'amulets', 'belts'];

/** Name-based routing for stackable things. First match wins; order matters. */
const NAME_ROUTES = [
  [/Crystallised Lifeforce$/, 'Currency'],
  [/ Oil$/, 'Oil'],
  [/ Fossil$/, 'Fossil'],
  [/ Resonator$/, 'Resonator'],
  [/^(Deafening|Shrieking|Screaming|Wailing|Weeping|Muttering|Whispering)? ?Essence of |^Remnant of Corruption$/, 'Essence'],
  [/ Delirium Orb$/, 'DeliriumOrb'],
  [/^Omen of /, 'Omen'],
  [/^Tattoo of /, 'Tattoo'],
  [/^Runegraft of /, 'Runegraft'],
  [/ Scarab( of .+)?$/, 'Scarab'],
  [/ Incubator$/, 'Incubator'],
  [/^Vial of /, 'Vial'],
  [/ Astrolabe$/, 'Astrolabe'],
  [/Allflame Ember|Ember of /, 'AllflameEmber'],
  [/ Coin$|^Djinn/, 'DjinnCoin'],
  [/ Ducat$|Ducats?$/, 'Ducat'],
  [/Enshrouding|Crystallised/, 'EnshroudingCrystal'],
  [/^(Exotic Coinage|Scrap Metal|Astragali|Burial Medallion)$/, 'Artifact'],
  [/ Invitation$|Maven's Invitation|^Writ of /, 'Invitation'],
  [/'s Memory of |Memory of /, 'Memory'],
];

const CURRENCY_FALLBACK = ['Currency', 'Fragment', 'Scarab', 'Oil', 'Fossil', 'Essence', 'Resonator', 'DeliriumOrb', 'Omen', 'Tattoo', 'Runegraft', 'AllflameEmber', 'DjinnCoin', 'Ducat', 'EnshroudingCrystal', 'Artifact', 'Astrolabe'];

function uniqueCategories(item) {
  const cls = norm(item.itemClass);
  if (WEAPON_CLASSES.includes(cls)) return ['UniqueWeapon'];
  if (ARMOUR_CLASSES.includes(cls)) return ['UniqueArmour'];
  if (ACCESSORY_CLASSES.includes(cls)) return ['UniqueAccessory'];
  if (cls.includes('flask')) return ['UniqueFlask'];
  if (cls.includes('jewel')) return ['UniqueJewel', 'ForbiddenJewel'];
  if (cls.includes('relic')) return ['UniqueRelic'];
  if (cls.includes('tincture')) return ['UniqueTincture'];
  return ['UniqueArmour', 'UniqueWeapon', 'UniqueAccessory', 'UniqueJewel', 'UniqueFlask'];
}

function categoriesFor(item) {
  const kind = classify(item);
  const name = item.typeLine || item.baseType || '';
  switch (kind) {
    case 'divination': return ['DivinationCard'];
    case 'gem': return ['SkillGem', 'ImbuedGem'];
    case 'unique-map': return ['UniqueMap'];
    case 'map': {
      if (/^Blight-ravaged /.test(name)) return ['BlightRavagedMap'];
      if (/^Blighted /.test(name)) return ['BlightedMap'];
      if (/^Valdo's/.test(name)) return ['ValdoMap'];
      return ['Map'];
    }
    case 'unique': return uniqueCategories(item);
    case 'currency':
    case 'fragment': {
      const route = NAME_ROUTES.find(([re]) => re.test(name));
      const first = route ? [route[1]] : [];
      const base = kind === 'fragment' ? ['Fragment', 'Scarab', 'Invitation', 'Memory'] : ['Currency'];
      return [...new Set([...first, ...base, ...CURRENCY_FALLBACK])];
    }
    case 'normal':
    case 'magic':
    case 'rare': {
      const route = NAME_ROUTES.find(([re]) => re.test(name));
      if (route) return [route[1]];
      if (/Cluster Jewel$/.test(item.baseType || '')) return ['ClusterJewel'];
      if (norm(item.itemClass) === 'incubators') return ['Incubator'];
      return ['BaseType'];
    }
    default:
      return [];
  }
}

function pickGem(lines, item) {
  const name = norm(item.typeLine);
  const vaal = name.startsWith('vaal ');
  const cands = lines.filter((l) => norm(l.name) === name);
  if (!cands.length) return { best: null, cands };
  const lvl = item.gemLevel ?? 1;
  const q = item.quality ?? 0;
  const corrupted = !!item.flags.corrupted;
  const score = (l) => {
    let s = 0;
    s += Math.abs((l.gemLevel ?? 1) - lvl) * 10;
    s += Math.abs((l.gemQuality ?? 0) - q) / 2;
    if (l.corrupted !== corrupted && !vaal) s += 25;
    if ((l.gemLevel ?? 1) > lvl) s += 40; // never price a 20 as a 21
    if (l.listingCount < 5) s += 5;
    return s;
  };
  const sorted = [...cands].sort((a, b) => score(a) - score(b));
  return { best: sorted[0], cands: sorted.slice(0, 6) };
}

function pickUnique(lines, item) {
  const name = norm(item.name);
  const base = norm(item.baseType);
  const unid = !!item.flags.unidentified;
  let cands = unid ? lines.filter((l) => norm(l.baseType) === base) : lines.filter((l) => norm(l.name) === name);
  if (!cands.length && !unid) cands = lines.filter((l) => norm(l.baseType) === base && norm(l.name) === name);
  if (!cands.length) return { best: null, cands: [] };
  const links = item.sockets?.links || 0;
  const linkTier = links >= 6 ? 6 : links === 5 ? 5 : 0;
  const sameLinks = cands.filter((l) => (l.links || 0) === linkTier);
  const pool = sameLinks.length ? sameLinks : cands.filter((l) => !l.links);
  const usable = (pool.length ? pool : cands).sort((a, b) => a.chaos - b.chaos);
  // Prefer the variant whose name hints match explicit mods (e.g. "1 Jewel", "Vaal Pact")
  const modsText = item.mods.explicit.join('\n').toLowerCase();
  const variantHit = usable.find((l) => l.variant && modsText.includes(String(l.variant).toLowerCase()));
  const best = variantHit || (usable.length > 1 ? null : usable[0]);
  return { best, cands: usable.slice(0, 8), range: usable.length > 1 ? [usable[0].chaos, usable[usable.length - 1].chaos] : null };
}

function pickMap(lines, item) {
  const base = norm(item.baseType || item.typeLine).replace(/^(blighted|blight-ravaged) /, '');
  const tier = item.mapTier;
  const cands = lines.filter((l) => norm(l.baseType || l.name).replace(/^(blighted|blight-ravaged) /, '') === base || norm(l.name) === norm(item.typeLine));
  const exact = cands.filter((l) => tier == null || l.mapTier == null || l.mapTier === tier);
  const pool = exact.length ? exact : cands;
  return { best: pool.sort((a, b) => b.listingCount - a.listingCount)[0] || null, cands: pool.slice(0, 5) };
}

function pickBase(lines, item) {
  const base = norm(item.baseType);
  const ilvl = item.itemLevel || 0;
  const inf = (item.influences[0] || '').toLowerCase();
  const cands = lines.filter((l) => norm(l.baseType || l.name) === base);
  const wantVariant = (l) => (inf ? norm(l.variant) === inf : !l.variant);
  // levelRequired on BaseType lines is the item level bracket (82, 83, 84, 85, 86)
  const ok = cands.filter((l) => wantVariant(l) && (l.levelRequired ?? 0) <= ilvl).sort((a, b) => (b.levelRequired ?? 0) - (a.levelRequired ?? 0));
  return { best: ok[0] || null, cands: ok.slice(0, 5) };
}

function pickByName(lines, item) {
  const raw = item.typeLine || item.baseType || item.name;
  const name = norm(raw);
  const slug = slugify(raw);
  const best = lines.find((l) => norm(l.name) === name) || lines.find((l) => l.slug && l.slug === slug) || null;
  return { best, cands: best ? [best] : [] };
}

class Pricer {
  constructor({ ninja, getLeague }) {
    this.ninja = ninja;
    this.getLeague = getLeague;
  }

  async price(item) {
    const league = await this.getLeague();
    const kind = classify(item);
    const cats = categoriesFor(item);
    const divine = await this.ninja.divinePrice(league).catch(() => null);
    const result = { league, kind, categories: cats, found: false, chaos: null, divine, stackSize: item.stack?.current || 1, matches: [], confidence: null, range: null, category: null, ageMs: null };

    let uncachedFetches = 0;
    for (const cat of cats) {
      let lines;
      if (this.ninja.cachedAge(league, cat) == null) {
        if (uncachedFetches >= 4) { result.note = 'Stopped looking after 4 categories to save requests.'; break; }
        uncachedFetches++;
      }
      try {
        lines = await this.ninja.category(league, cat);
      } catch (e) {
        result.error = e.message;
        continue;
      }
      let pick;
      if (kind === 'gem') pick = pickGem(lines, item);
      else if (kind === 'unique') pick = pickUnique(lines, item);
      else if (kind === 'map' || kind === 'unique-map') pick = kind === 'map' ? pickMap(lines, item) : pickByName(lines, { typeLine: item.name });
      else if (cat === 'BaseType') pick = pickBase(lines, item);
      else pick = pickByName(lines, item);

      if (pick.best || pick.cands.length) {
        result.category = cat;
        result.ageMs = this.ninja.cachedAge(league, cat);
        result.matches = pick.cands.map(slim);
        result.range = pick.range || null;
        if (pick.best) {
          result.found = true;
          result.chaos = pick.best.chaos;
          const listings = pick.best.listingCount ?? pick.best.volume ?? null;
          result.confidence = listings == null ? 'medium' : listings < 5 ? 'low' : listings < 20 ? 'medium' : 'high';
        } else if (pick.range) {
          result.found = true;
          result.chaos = pick.range[0];
          result.confidence = 'range';
        }
        break;
      }
    }
    if (result.chaos != null) result.totalChaos = result.chaos * result.stackSize;
    return result;
  }
}

function slim(l) {
  const o = { name: l.name, chaos: l.chaos };
  for (const k of ['variant', 'links', 'gemLevel', 'gemQuality', 'corrupted', 'mapTier', 'levelRequired', 'listingCount', 'icon', 'baseType']) {
    if (l[k] != null && l[k] !== false && l[k] !== 0) o[k] = l[k];
  }
  return o;
}

module.exports = { Pricer, categoriesFor, pickGem, pickUnique, pickMap, pickBase, uniqueCategories };
