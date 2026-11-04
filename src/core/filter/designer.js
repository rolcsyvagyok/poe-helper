'use strict';
/**
 * Tier designer: one look per tier *level* (Tier 1..6), applied to every category's tiers.
 *
 * FilterBlade/NeverSink tier names carry the level: "t1", "t1exalted", "t2divine", "t3boss", "t4c".
 * A design maps level -> style; applying it writes those styles into the tier patch for every
 * matching tier (normal tiers only; special cases, "new" tiers and your hidden-by-you tier keep
 * their own look). Tier 1 is locked to a white label with the Divine tink unless you unlock it.
 */

const LEVELS = [1, 2, 3, 4, 5, 6];
const TINK = 'poehelper-sounds/divine-tink.mp3';
const sound = (id) => ({ customSound: `poehelper-sounds/${id}.mp3` });
const game = (id, volume = 300) => ({ sound: { id, volume } });

/** Tier 1 in every theme: white label, white beam, white star, Divine tink. Only the text colour varies. */
function tier1(textRgb, size = 45) {
  return { fontSize: size, text: [...textRgb, 255], border: [255, 255, 255, 255], background: [255, 255, 255, 255], customSound: TINK, beam: { color: 'White' }, icon: { size: 0, color: 'White', shape: 'Star' } };
}

const PRESETS = [
  {
    id: 'classic', name: 'Classic', description: 'Warm reds and oranges, close to NeverSink\'s default.',
    levels: {
      1: tier1([220, 0, 0]),
      2: { fontSize: 44, text: [255, 255, 255, 255], border: [255, 255, 255, 255], background: [220, 40, 20, 255], ...sound('chime'), beam: { color: 'Red' }, icon: { size: 0, color: 'Red', shape: 'Diamond' } },
      3: { fontSize: 42, text: [0, 0, 0, 255], border: [0, 0, 0, 255], background: [250, 150, 30, 255], ...sound('sparkle'), beam: { color: 'Orange' }, icon: { size: 1, color: 'Orange', shape: 'Circle' } },
      4: { fontSize: 38, text: [0, 0, 0, 255], border: [0, 0, 0, 255], background: [235, 200, 120, 240], ...sound('soft-bell'), beam: { color: 'Yellow', temp: true }, icon: { size: 2, color: 'Yellow', shape: 'Circle' } },
      5: { fontSize: 34, text: [230, 200, 140, 255], border: [120, 90, 50, 255], background: [30, 22, 14, 230] },
      6: { fontSize: 30, text: [170, 150, 120, 255], background: [0, 0, 0, 180] },
    },
  },
  {
    id: 'violet', name: 'Midnight violet', description: 'Royal purples with lavender borders.',
    levels: {
      1: tier1([112, 52, 180]),
      2: { fontSize: 45, text: [255, 255, 255, 255], border: [250, 198, 255, 255], background: [112, 52, 180, 255], ...sound('chime'), beam: { color: 'Purple' }, icon: { size: 0, color: 'Purple', shape: 'Star' } },
      3: { fontSize: 42, text: [250, 198, 255, 255], border: [190, 120, 255, 255], background: [60, 20, 100, 255], ...sound('sparkle'), beam: { color: 'Purple', temp: true }, icon: { size: 1, color: 'Purple', shape: 'Diamond' } },
      4: { fontSize: 38, text: [220, 190, 255, 255], border: [110, 70, 160, 255], background: [35, 15, 60, 240], ...sound('soft-bell'), icon: { size: 2, color: 'Pink', shape: 'Circle' } },
      5: { fontSize: 34, text: [190, 170, 220, 255], border: [70, 50, 100, 255], background: [20, 10, 35, 220] },
      6: { fontSize: 30, text: [150, 140, 170, 255], background: [0, 0, 0, 170] },
    },
  },
  {
    id: 'ocean', name: 'Deep ocean', description: 'Cool blues and teals, easy on the eyes.',
    levels: {
      1: tier1([0, 90, 200]),
      2: { fontSize: 44, text: [255, 255, 255, 255], border: [150, 230, 255, 255], background: [0, 110, 210, 255], ...sound('chime'), beam: { color: 'Blue' }, icon: { size: 0, color: 'Blue', shape: 'Raindrop' } },
      3: { fontSize: 42, text: [0, 30, 40, 255], border: [0, 60, 80, 255], background: [60, 210, 230, 255], ...sound('sparkle'), beam: { color: 'Cyan', temp: true }, icon: { size: 1, color: 'Cyan', shape: 'Hexagon' } },
      4: { fontSize: 38, text: [170, 235, 255, 255], border: [40, 120, 160, 255], background: [10, 40, 70, 240], ...sound('soft-bell'), icon: { size: 2, color: 'Cyan', shape: 'Circle' } },
      5: { fontSize: 34, text: [150, 200, 220, 255], border: [30, 70, 90, 255], background: [5, 20, 35, 220] },
      6: { fontSize: 30, text: [130, 160, 175, 255], background: [0, 0, 0, 170] },
    },
  },
  {
    id: 'ember', name: 'Ember', description: 'Fire and gold, loud and unmissable.',
    levels: {
      1: tier1([200, 60, 0]),
      2: { fontSize: 45, text: [255, 240, 200, 255], border: [255, 200, 0, 255], background: [170, 20, 0, 255], ...sound('chime'), beam: { color: 'Orange' }, icon: { size: 0, color: 'Orange', shape: 'Star' } },
      3: { fontSize: 42, text: [40, 10, 0, 255], border: [120, 40, 0, 255], background: [255, 190, 0, 255], ...sound('coin'), beam: { color: 'Yellow', temp: true }, icon: { size: 1, color: 'Yellow', shape: 'Triangle' } },
      4: { fontSize: 38, text: [255, 210, 150, 255], border: [180, 80, 20, 255], background: [70, 20, 5, 240], ...sound('soft-bell'), icon: { size: 2, color: 'Orange', shape: 'Circle' } },
      5: { fontSize: 34, text: [230, 170, 120, 255], border: [110, 50, 20, 255], background: [35, 12, 5, 220] },
      6: { fontSize: 30, text: [170, 130, 100, 255], background: [0, 0, 0, 170] },
    },
  },
  {
    id: 'verdant', name: 'Verdant', description: 'Fresh greens with gold accents.',
    levels: {
      1: tier1([0, 130, 50]),
      2: { fontSize: 44, text: [255, 255, 255, 255], border: [200, 255, 170, 255], background: [20, 140, 60, 255], ...sound('chime'), beam: { color: 'Green' }, icon: { size: 0, color: 'Green', shape: 'Kite' } },
      3: { fontSize: 42, text: [10, 40, 10, 255], border: [30, 80, 20, 255], background: [150, 230, 90, 255], ...sound('sparkle'), beam: { color: 'Green', temp: true }, icon: { size: 1, color: 'Green', shape: 'Pentagon' } },
      4: { fontSize: 38, text: [200, 240, 170, 255], border: [70, 130, 50, 255], background: [20, 50, 20, 240], ...sound('soft-bell'), icon: { size: 2, color: 'Yellow', shape: 'Circle' } },
      5: { fontSize: 34, text: [170, 210, 150, 255], border: [50, 90, 40, 255], background: [10, 28, 10, 220] },
      6: { fontSize: 30, text: [140, 165, 130, 255], background: [0, 0, 0, 170] },
    },
  },
  {
    id: 'mono', name: 'Monochrome', description: 'Black, white and greys. Maximum contrast, minimum noise.',
    levels: {
      1: tier1([0, 0, 0]),
      2: { fontSize: 44, text: [0, 0, 0, 255], border: [0, 0, 0, 255], background: [200, 200, 200, 255], ...sound('chime'), beam: { color: 'Grey' }, icon: { size: 0, color: 'Grey', shape: 'Diamond' } },
      3: { fontSize: 42, text: [255, 255, 255, 255], border: [255, 255, 255, 255], background: [80, 80, 80, 255], ...sound('coin'), icon: { size: 1, color: 'Grey', shape: 'Square' } },
      4: { fontSize: 38, text: [230, 230, 230, 255], border: [120, 120, 120, 255], background: [30, 30, 30, 240], ...game(2, 150) },
      5: { fontSize: 34, text: [180, 180, 180, 255], border: [60, 60, 60, 255], background: [15, 15, 15, 220] },
      6: { fontSize: 30, text: [140, 140, 140, 255], background: [0, 0, 0, 170] },
    },
  },
];

/** "t1", "t1exalted", "t3boss", "t4c" -> number; "restex", "tnew", "twisdom" -> null */
function tierLevel(tierName) {
  const m = /^t(\d)(?!\d)/i.exec(String(tierName || ''));
  return m ? Number(m[1]) : null;
}

/** Force Tier 1 to the white look with the Divine tink, keeping its text colour and size. */
function lockTier1(levels) {
  const t1 = levels?.[1] || {};
  return { ...levels, 1: { ...tier1((t1.text || [220, 0, 0]).slice(0, 3), t1.fontSize || 45), ...(t1.customVolume ? { customVolume: t1.customVolume } : {}) } };
}

/**
 * Which tiers a design applies to.
 * @param view    tierView() result
 * @param groups  top-level category names to include (e.g. ['currency','divination']); null = all
 */
function targetsFor(view, groups = null) {
  const out = [];
  for (const t of view.types) {
    const g = t.type.split('->')[0];
    if (groups && !groups.includes(g)) continue;
    for (const tier of t.tiers) {
      if (tier.special || tier.generated) continue;
      const level = tierLevel(tier.tier);
      if (!level || !LEVELS.includes(level)) continue;
      out.push({ key: tier.key, type: t.type, tier: tier.tier, level });
    }
  }
  return out;
}

/** Returns a new patch with the design's styles written into every target tier. */
function applyDesign(view, patch, levels, { groups = null } = {}) {
  const styles = { ...(patch.styles || {}) };
  const targets = targetsFor(view, groups);
  let count = 0;
  for (const t of targets) {
    const st = levels[t.level];
    if (!st) continue;
    styles[t.key] = JSON.parse(JSON.stringify(st));
    count++;
  }
  return { patch: { ...patch, moves: { ...(patch.moves || {}) }, styles }, count, categories: new Set(targets.map((t) => t.type)).size };
}

module.exports = { PRESETS, LEVELS, TINK, tierLevel, lockTier1, targetsFor, applyDesign, tier1 };
