'use strict';
/**
 * Tier designer: one look per tier *level* (Tier 1..6), applied to every category's tiers.
 *
 * FilterBlade/NeverSink tier names carry the level: "t1", "t1exalted", "t2divine", "t3boss", "t4c".
 * A design maps level -> style; applying it writes those styles into the tier patch for every
 * matching tier (normal tiers only; special cases, "new" tiers and your hidden-by-you tier keep
 * their own look). Tier 1 is locked to a white label with FilterBlade's Divine sound (game sound 6) unless you unlock it.
 */

const LEVELS = [1, 2, 3, 4, 5, 6];
const TINK = 'poehelper-sounds/divine-tink.mp3';
// the designs keep each tier's own FilterBlade sound (the game's alert sounds); the app adds none of its own
const sound = () => ({ keepSound: true });
const game = (id, volume = 300) => ({ sound: { id, volume } });

// Tier 1 keeps FilterBlade's own top-currency sound: the game's alert sound 6 (the Divine drop sound).
// It is part of the game, so the filter only names its number; there is no file to copy.
const TIER1_SOUND = { id: 6, volume: 300 };
/** Tier 1 in every theme: white label, white beam, white star, FilterBlade's Divine sound. Only the text colour varies. */
function tier1(textRgb, size = 45) {
  return { fontSize: size, text: [...textRgb, 255], border: [...textRgb, 255], background: [255, 255, 255, 255], sound: { ...TIER1_SOUND }, beam: { color: 'White' }, icon: { size: 0, color: 'White', shape: 'Star' } };
}

/**
 * The Giga tier (mirror-level items, above Tier 1): the reverse of Tier 1, so a Mirror never looks like a
 * Divine. The theme's Tier 1 text colour becomes the background, with gold text and border, the biggest
 * text, a beam and star in that colour and its own sound.
 */
const BEAM_OF = (rgb) => {
  const [r, g, b] = rgb;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 40) return 'White';
  if (r > 150 && g > 150) return 'Yellow';
  if (r >= g && r >= b) return g > 90 ? 'Orange' : b > 100 ? 'Pink' : 'Red';
  if (g >= r && g >= b) return b > 150 ? 'Cyan' : 'Green';
  return r > 80 ? 'Purple' : 'Blue';
};
function gigaLook(t1 = {}) {
  const base = (t1.text || [220, 0, 0]).slice(0, 3);
  const beam = BEAM_OF(base);
  return { fontSize: 45, text: [255, 215, 0, 255], border: [255, 215, 0, 255], background: [...base, 255], sound: { id: 6, volume: 300 }, beam: { color: beam }, icon: { size: 0, color: beam, shape: 'Star' } };
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

/**
 * Every tier keeps FilterBlade's own sound for it (Currency Tier 1 the Divine sound 6, uniques 3, maps 4 and 5,
 * and so on): a design changes the look, not the sound. A sound file you added yourself stays.
 */
function withFilterSound(st) {
  if (!st) return st;
  const own = st.customSound && !/^poehelper-sounds\//.test(st.customSound);
  if (own) return st;
  const { sound: _s, customSound: _c, customVolume: _v, ...rest } = st;
  return { ...rest, keepSound: true };
}

/**
 * The sound every theme gives each tier level: Tier 1 keeps FilterBlade's own (the Divine sound 6),
 * Tier 2 the game's alert sound 1, Tiers 3 to 6 sound 2. A sound you picked for a tier yourself stays.
 */
const LEVEL_SOUNDS = { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2 };
function withLevelSound(st, level) {
  if (!st) return st;
  const id = LEVEL_SOUNDS[level];
  if (!id) return withFilterSound(st);
  const own = st.customSound && !/^poehelper-sounds\//.test(st.customSound);
  if (own || st.noSound || (st.sound?.id && !st.keepSound)) return st; // a sound you picked (or "No sound") stays
  const { sound: _s, customSound: _c, customVolume: _v, keepSound: _k, ...rest } = st;
  return { ...rest, sound: { id, volume: 300 } };
}

/** "t1", "t1exalted", "t3boss", "t4c" -> number; "restex", "tnew", "twisdom" -> null */
function tierLevel(tierName) {
  const m = /^t(\d)(?!\d)/i.exec(String(tierName || ''));
  return m ? Number(m[1]) : null;
}

/** Tier 1 is always the white look with FilterBlade's Divine sound; its text colour (the border too) and size are yours. */
function lockTier1(levels) {
  const t1 = levels?.[1] || {};
  // Tiers 2-6 without a sound of their own get the theme sounds (Tier 2: game sound 1, Tiers 3-6: 2)
  levels = Object.fromEntries(Object.entries(levels || {}).map(([k, st]) => [k, LEVEL_SOUNDS[k] ? withLevelSound(st, Number(k)) : st]));
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
    styles[t.key] = withLevelSound(JSON.parse(JSON.stringify(st)), t.level);
    count++;
  }
  return { patch: { ...patch, moves: { ...(patch.moves || {}) }, styles }, count, categories: new Set(targets.map((t) => t.type)).size };
}

// ---------- themes made from two hues (the extra presets and "Random") ----------
function hsl(h, sat, lig, a = 255) {
  const S = sat / 100, L = lig / 100;
  const k = (n) => (n + h / 30) % 12;
  const f = (n) => L - S * Math.min(L, 1 - L) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), a];
}
/** The game's beam / minimap colour closest to a hue. */
function gameColour(h, sat = 80) {
  if (sat < 15) return 'White';
  const x = ((h % 360) + 360) % 360;
  return x < 15 ? 'Red' : x < 40 ? 'Orange' : x < 65 ? 'Yellow' : x < 160 ? 'Green' : x < 200 ? 'Cyan' : x < 255 ? 'Blue' : x < 300 ? 'Purple' : x < 340 ? 'Pink' : 'Red';
}
const SHAPES = ['Star', 'Diamond', 'Hexagon', 'Circle', 'Triangle', 'Square', 'Pentagon', 'Moon', 'Raindrop', 'Kite', 'Cross'];
/**
 * A full theme from a main hue and an accent hue: Tier 1 white (as every theme), Tier 2 the main colour,
 * Tier 3 the accent, then darker and quieter steps of the main colour.
 */
function paletteTheme({ id, name, description, hue, accent = hue + 30, sat = 85, shapes = ['Star', 'Diamond', 'Circle'] }) {
  const c1 = gameColour(hue, sat), c2 = gameColour(accent, sat);
  return {
    id, name, description,
    levels: {
      1: tier1(hsl(hue, Math.min(100, sat + 10), 38).slice(0, 3)),
      2: { fontSize: 45, text: [255, 255, 255, 255], border: hsl(hue, 100, 86), background: hsl(hue, sat, 42), ...sound('chime'), beam: { color: c1 }, icon: { size: 0, color: c1, shape: shapes[0] } },
      3: { fontSize: 42, text: hsl(accent, 80, 10), border: hsl(accent, 90, 22), background: hsl(accent, sat, 58), ...sound('sparkle'), beam: { color: c2, temp: true }, icon: { size: 1, color: c2, shape: shapes[1] } },
      4: { fontSize: 38, text: hsl(hue, 80, 82), border: hsl(hue, 55, 40), background: hsl(hue, 60, 14, 240), ...sound('soft-bell'), icon: { size: 2, color: c1, shape: shapes[2] } },
      5: { fontSize: 34, text: hsl(hue, 35, 72), border: hsl(hue, 30, 26), background: hsl(hue, 40, 8, 220) },
      6: { fontSize: 30, text: hsl(hue, 10, 62), background: [0, 0, 0, 170] },
    },
  };
}
PRESETS.push(
  paletteTheme({ id: 'rose', name: 'Rose gold', description: 'Soft pinks with warm gold.', hue: 335, accent: 40, sat: 70, shapes: ['Kite', 'Star', 'Circle'] }),
  paletteTheme({ id: 'emerald', name: 'Emerald', description: 'Deep greens and jade.', hue: 145, accent: 170, sat: 75, shapes: ['Diamond', 'Hexagon', 'Circle'] }),
  paletteTheme({ id: 'arctic', name: 'Arctic', description: 'Ice blue and frost white, very clean.', hue: 198, accent: 185, sat: 60, shapes: ['Raindrop', 'Diamond', 'Circle'] }),
  paletteTheme({ id: 'toxic', name: 'Toxic', description: 'Acid green and yellow, impossible to miss.', hue: 95, accent: 60, sat: 95, shapes: ['Cross', 'Triangle', 'Circle'] }),
  paletteTheme({ id: 'royal', name: 'Royal gold', description: 'Gold and amber, rich and warm.', hue: 42, accent: 25, sat: 90, shapes: ['Star', 'Pentagon', 'Circle'] }),
  paletteTheme({ id: 'crimson', name: 'Crimson night', description: 'Blood red with dusky purple.', hue: 355, accent: 285, sat: 80, shapes: ['Moon', 'Diamond', 'Circle'] }),
  paletteTheme({ id: 'sunset', name: 'Sunset', description: 'Orange to magenta, like the evening sky.', hue: 18, accent: 320, sat: 85, shapes: ['Star', 'Kite', 'Circle'] }),
  paletteTheme({ id: 'cyber', name: 'Cyber', description: 'Electric cyan with hot pink.', hue: 185, accent: 315, sat: 95, shapes: ['Hexagon', 'Square', 'Circle'] }),
);

/** "Random": a fresh pair of hues and shapes each time. rnd lets tests pick the numbers. */
function randomTheme(rnd = Math.random) {
  const hue = Math.floor(rnd() * 360);
  const accent = (hue + 30 + Math.floor(rnd() * 300)) % 360;
  const pick = () => SHAPES[Math.floor(rnd() * SHAPES.length)];
  const t = paletteTheme({ id: 'random', name: 'Random', description: 'A random colour palette.', hue, accent, sat: 65 + Math.floor(rnd() * 35), shapes: [pick(), pick(), 'Circle'] });
  t.levels.giga = gigaLook(t.levels[1]);
  return t;
}

for (const p of PRESETS) p.levels.giga = gigaLook(p.levels[1]);

module.exports = { withLevelSound, LEVEL_SOUNDS, withFilterSound, randomTheme, paletteTheme, gameColour, gigaLook, PRESETS, LEVELS, TINK, TIER1_SOUND, tierLevel, lockTier1, targetsFor, applyDesign, tier1 };
