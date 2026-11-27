'use strict';
/* The Loot filter chat: set phrases (no AI) turned into tier changes.
   read(text) -> what was asked; resolve(ask, view) -> the exact change (types, tiers, bases) or a question back.
   services.filterChat runs the change. Everything here is pure, so it's unit-tested. */

const { tierName, uniqueTier } = require('../../renderer/tier-names');

const HIDE = '__hide__';

const HELP = [
  'I know these (one at a time):',
  '• Separate Stacked Decks into a new tier (… called Decks)',
  '• Move Chaos Orb and Vaal Orb to tier 2   (or: to S tier, to hidden)',
  '• Hide Scroll of Wisdom   /   Show Scroll of Wisdom (back to the filter\'s own tier)',
  '• Hide tier 7 in Currency   /   Show tier 7 in Currency   /   Turn off tier 6 in Small stacks',
  '• Set the stack size of tier 2 in Small stacks to 5',
  '• Rename My tier in Currency to Decks',
  '• Looks: Make Stacked Deck red   /   Set the text colour of tier 2 in Currency to white   /   Set the border of Decks in Currency to 255 128 0',
  '   Give Stacked Deck a red beam   /   Give Stacked Deck a big blue star icon   /   Give Stacked Deck sound 6   /   Set the font size of Stacked Deck to 45',
  '   Remove the beam (icon, sound) from Stacked Deck   /   Make Stacked Deck look like Divine Orb',
  '• Where is Stacked Deck?   /   Is Stacked Deck visible?   /   How does Stacked Deck look?',
  '• Make a new tier called Decks in Currency   /   Make Orb of Transmutation visible',
  '• Undo',
  'Add "in <category>" when an item is in more than one (Currency, Small stacks, Divination cards…).',
].join('\n');

const clean = (s) => String(s || '').trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
  .replace(/\s+(in|for|of) (this|my|the) (loot )?filter$/i, '').replace(/^(please|pls|can you|could you)\s+/i, '').replace(/\s+please$/i, '').trim();

/** What was asked, from the words only. */
function read(text) {
  const t = clean(text);
  let m;
  if (!t || /^(help|\?|what can you do|commands)$/i.test(t)) return { kind: 'help' };
  if (/^undo( that| it| the last( change)?)?$/i.test(t)) return { kind: 'undo' };
  if ((m = /^(?:where is|where are|find|which tier is|which tier are)\s+(.+?)(?:\s+in)?$/i.exec(t))) return { kind: 'where', items: m[1] };
  // just answers: is it shown, how does it look
  if ((m = /^(?:is|are|do i see|will i see|can i see)\s+(.+?)\s*(?:visible|shown|hidden|showing)?$/i.exec(t)) && !/^(?:it|that)$/i.test(m[1])) return { kind: 'visible', ...where(m[1]) };
  if ((m = /^(?:how (?:does|do|will)|what (?:does|do))\s+(.+?)\s+look(?:\s+like)?$/i.exec(t)) || (m = /^(?:show me how|preview|look of|show me the look of|show the look of)\s+(.+?)(?:\s+looks?)?$/i.exec(t))) return { kind: 'look', ...where(m[1]) };
  // an empty new tier: "make a new tier called Decks in Currency"
  if ((m = /^(?:make|add|create)\s+(?:a\s+)?new\s+(?:tier|group)\s+(?:called|named)\s+["']?(.+?)["']?\s+in\s+(?:the\s+)?(.+?)(?:\s+category)?$/i.exec(t))) return { kind: 'emptyTier', name: m[1], type: m[2] };
  if ((m = /^(?:make|add|create)\s+(?:a\s+)?new\s+(?:tier|group)\s+in\s+(?:the\s+)?(.+?)(?:\s+category)?\s+(?:called|named)\s+["']?(.+?)["']?$/i.exec(t))) return { kind: 'emptyTier', name: m[2], type: m[1] };
  if ((m = /^make\s+(.+?)\s+(?:visible|show(?:n)?|show up)(?:\s+again)?$/i.exec(t))) return { kind: 'unhide', ...where(m[1]) };
  // a new tier for something: "separate X into a new category", "give X its own tier", "new tier for X"
  const called = (s) => { const c = /^(.*?)\s+(?:called|named)\s+["']?(.+?)["']?$/i.exec(s); return c ? [c[1], c[2]] : [s, null]; };
  if ((m = /^(?:separate|seperate|seprate|split|pull|take|put|move|make)\s+(.+?)\s+(?:out\s+)?(?:into|in|to|as)\s+(?:a|an|its|their)?\s*(?:own|new|separate|seperate)\s+(?:own\s+)?(?:category|tier|group|section)(.*)$/i.exec(t))) {
    const [, name] = called(`x${m[2]}`);
    return { kind: 'newTier', ...where(m[1]), name: name || null };
  }
  if ((m = /^give\s+(.+?)\s+(?:its|their|a)\s+own\s+(?:category|tier|group)(.*)$/i.exec(t))) {
    const [, name] = called(`x${m[2]}`);
    return { kind: 'newTier', ...where(m[1]), name };
  }
  if ((m = /^(?:make|add|create)?\s*(?:a\s+)?new\s+(?:category|tier|group)\s+(?:for|with)\s+(.+)$/i.exec(t))) {
    const [what, name] = called(m[1]);
    return { kind: 'newTier', ...where(what), name };
  }
  if ((m = /^rename\s+(.+?)\s+to\s+["']?(.+?)["']?$/i.exec(t))) return { kind: 'rename', ...whereTier(m[1]), name: m[2] };
  const look = readLook(t);
  if (look) return look;
  if ((m = /^(?:set\s+)?(?:the\s+)?stack\s*size\s+(?:of|for|in)\s+(.+?)\s+(?:to|=)\s*(\d+)$/i.exec(t))) return { kind: 'stack', ...whereTier(m[1]), size: Number(m[2]) };
  // a whole tier: "hide tier 7 in currency", "turn off the wisdom scrolls tier"
  if ((m = /^(hide|show|turn off|switch off|disable|turn on|enable)\s+(?:the\s+)?(tier\s*\S+|t\d+\b.*|.+?\s+tier)(?:\s+(?:in|of)\s+(.+))?$/i.exec(t))) {
    const act = /hide/i.test(m[1]) ? 'Hide' : /off|disable/i.test(m[1]) ? 'Off' : 'Show';
    return { kind: 'tierAction', action: act, tier: m[2].replace(/\s+tier$/i, '').trim(), type: m[3] || null };
  }
  if ((m = /^(hide|show|unhide)\s+(.+)$/i.exec(t))) return { kind: /hide/i.test(m[1]) && !/unhide/i.test(m[1]) ? 'hide' : 'unhide', ...where(m[2]) };
  if ((m = /^(?:move|put|send)\s+(.+?)\s+(?:to|into|in)\s+(.+)$/i.exec(t))) {
    const w = where(m[1]);
    const to = m[2].replace(/\s+(?:in|of)\s+(.+)$/i, (_, ty) => { w.type = w.type || ty; return ''; });
    return { kind: 'move', ...w, to: to.trim() };
  }
  return { kind: 'unknown' };
}
// "X and Y in Currency" -> items + category
function where(s) {
  const m = /^(.+?)\s+(?:in|from)\s+(?:the\s+)?(.+?)(?:\s+category)?$/i.exec(s);
  return m && !/^(a|an|its|their|own|new)\b/i.test(m[2]) ? { items: m[1], type: m[2] } : { items: s, type: null };
}
function whereTier(s) {
  const m = /^(?:the\s+)?(.+?)\s+(?:in|of)\s+(?:the\s+)?(.+?)(?:\s+category)?$/i.exec(s);
  return m ? { tier: m[1].replace(/\s+tier$/i, ''), type: m[2] } : { tier: s.replace(/\s+tier$/i, ''), type: null };
}


// ---- looks ----
const RGB = {
  red: [255, 0, 0], white: [255, 255, 255], black: [0, 0, 0], yellow: [255, 255, 0], gold: [255, 215, 0], orange: [255, 128, 0], blue: [0, 110, 255],
  'light blue': [100, 180, 255], 'dark blue': [0, 40, 160], green: [0, 200, 0], 'light green': [120, 255, 120], 'dark green': [0, 100, 0], purple: [160, 40, 240], pink: [255, 105, 180],
  cyan: [0, 255, 255], grey: [128, 128, 128], gray: [128, 128, 128], 'dark grey': [60, 60, 60], 'dark gray': [60, 60, 60], brown: [140, 80, 30], 'dark red': [130, 0, 0], magenta: [255, 0, 255], teal: [0, 150, 150],
};
// beams and map icons only come in the game's colours
const GAME_COL = { red: 'Red', green: 'Green', blue: 'Blue', brown: 'Brown', white: 'White', yellow: 'Yellow', gold: 'Yellow', cyan: 'Cyan', grey: 'Grey', gray: 'Grey', orange: 'Orange', pink: 'Pink', purple: 'Purple', 'light blue': 'Cyan', magenta: 'Pink' };
const SHAPES = ['Circle', 'Diamond', 'Hexagon', 'Square', 'Star', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'];
function colourOf(s) {
  const v = String(s || '').trim().toLowerCase();
  let m;
  if ((m = /^#?([0-9a-f]{6})$/.exec(v))) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  if ((m = /^(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})$/.exec(v))) return [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)));
  return RGB[v] || null;
}
const light = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11 > 150;
function lookTarget(s) {
  const x = String(s).trim().replace(/^the\s+/i, '');
  // a tier ("tier 2 in Currency", "the Decks tier in Currency") or items ("Stacked Deck", "… in Small stacks")
  if (/^(tier\s*\S+|t\d+\w*)(\s+(in|of)\s+.+)?$/i.test(x) || /\btier(\s+(in|of)\s+.+)?$/i.test(x)) {
    const w = whereTier(x.replace(/\s+tier(?=\s+(in|of)\s|$)/i, ''));
    return { target: 'tier', tier: w.tier, type: w.type };
  }
  // "Decks in Currency" can be your own tier's name: tried as a tier when it isn't an item
  return { target: 'items', ...where(x), orTier: whereTier(x) };
}
function readLook(t) {
  let m;
  const P = '(background|text|border|font|label)';
  if ((m = /^make\s+(.+?)\s+look\s+like\s+(.+)$/i.exec(t))) return { kind: 'look:set', ...lookTarget(m[1]), change: { likeItems: m[2] } };
  if ((m = new RegExp(`^(?:set|change|make)\\s+(?:the\\s+)?${P}(?:\\s+colou?r)?\\s+(?:of|for|on)\\s+(.+?)\\s+(?:to|=)\\s+(.+)$`, 'i').exec(t))) {
    const c = colourOf(m[3]);
    return c ? { kind: 'look:set', ...lookTarget(m[2]), change: { part: /label/i.test(m[1]) ? 'background' : m[1].toLowerCase().replace('font', 'text'), rgb: c } } : { kind: 'look:bad', what: m[3] };
  }
  if ((m = /^(?:set|change)\s+(?:the\s+)?(?:font|text)\s+size\s+(?:of|for)\s+(.+?)\s+(?:to|=)\s*(\d+)$/i.exec(t))) return { kind: 'look:set', ...lookTarget(m[1]), change: { fontSize: Math.max(18, Math.min(45, Number(m[2]))) } };
  if ((m = /^make\s+(.+?)\s+(bigger|larger|smaller|biggest|largest|smallest)$/i.exec(t))) return { kind: 'look:set', ...lookTarget(m[1]), change: { fontSize: /est$/i.test(m[2]) ? (/small/i.test(m[2]) ? 18 : 45) : /small/i.test(m[2]) ? -6 : 6, relative: !/est$/i.test(m[2]) } };
  if ((m = /^(?:remove|turn off|disable)\s+(?:the\s+)?(beam|light beam|icon|map icon|minimap icon|sound|drop sound)\s+(?:from|of|for|on)\s+(.+)$/i.exec(t)) || (m = /^(?:no|mute)\s+(beam|icon|sound)?\s*(?:for|on)?\s*(.+)$/i.exec(t))) {
    const what = /beam/i.test(m[1] || '') ? 'beam' : /icon/i.test(m[1] || '') ? 'icon' : 'sound';
    return { kind: 'look:set', ...lookTarget(m[2]), change: { remove: what } };
  }
  if ((m = /^(?:give|add)\s+(.+?)\s+(?:a|an)\s+(.+?)\s+(?:light\s+)?beam$/i.exec(t)) || (m = /^(?:give|add)\s+(?:a|an)\s+(.+?)\s+beam\s+(?:to|for)\s+(.+)$/i.exec(t)) && (m = [m[0], m[2], m[1]])) {
    const c = GAME_COL[String(m[2]).toLowerCase()];
    return c ? { kind: 'look:set', ...lookTarget(m[1]), change: { beam: c } } : { kind: 'look:bad', what: m[2], game: true };
  }
  if ((m = /^(?:give|add)\s+(.+?)\s+(?:a|an)\s+(.+?)\s+(?:map\s+|minimap\s+)?icon$/i.exec(t))) {
    const words = m[2].toLowerCase().split(/\s+/);
    const size = words.some((w) => /^(big|large|huge)$/.test(w)) ? 0 : words.some((w) => /^(small|tiny)$/.test(w)) ? 2 : 1;
    const colWord = Object.keys(GAME_COL).sort((a, b) => b.length - a.length).find((c) => m[2].toLowerCase().includes(c));
    const shape = SHAPES.find((sh) => words.includes(sh.toLowerCase()) || (sh === 'UpsideDownHouse' && /house/.test(m[2]))) || 'Star';
    return { kind: 'look:set', ...lookTarget(m[1]), change: { icon: { size, color: colWord ? GAME_COL[colWord] : 'White', shape } } };
  }
  if ((m = /^(?:give|add|set)\s+(.+?)\s+(?:alert\s+)?sound\s+(\d{1,2})$/i.exec(t)) || (m = /^(?:play|use)\s+sound\s+(\d{1,2})\s+(?:for|on)\s+(.+)$/i.exec(t)) && (m = [m[0], m[2], m[1]])) {
    const id = Number(m[2]);
    return id >= 1 && id <= 16 ? { kind: 'look:set', ...lookTarget(m[1]), change: { sound: { id, volume: 300 } } } : { kind: 'look:bad', what: `sound ${id} (the game has 1 to 16)` };
  }
  // "make Stacked Deck red": a red label, readable text on it
  if ((m = /^(?:make|colou?r|paint)\s+(.+)$/i.exec(t))) {
    const words = m[1].replace(/\s+look$/i, '').split(/\s+/);
    // the colour is the last word or two ("dark red"), or "255 128 0", or "#ff8000"
    for (const n of [3, 2, 1]) {
      if (words.length <= n) continue;
      const c = colourOf(words.slice(-n).join(' '));
      if (c) return { kind: 'look:set', ...lookTarget(words.slice(0, -n).join(' ').replace(/\s+look$/i, '')), change: { preset: c } };
    }
  }
  return null;
}
// the change on top of the look a tier has now
function applyLook(style, change, likeStyle = null) {
  const st = JSON.parse(JSON.stringify(style || {}));
  if (change.likeItems) return JSON.parse(JSON.stringify(likeStyle || st));
  if (change.preset) { const c = change.preset; st.background = [...c, 255]; st.text = light(c) ? [0, 0, 0, 255] : [255, 255, 255, 255]; st.border = [...st.text]; }
  if (change.part) st[change.part] = [...change.rgb, 255];
  if (change.fontSize != null) st.fontSize = change.relative ? Math.max(18, Math.min(45, (st.fontSize || 32) + change.fontSize)) : change.fontSize;
  if (change.beam) st.beam = { color: change.beam };
  if (change.icon) st.icon = change.icon;
  if (change.sound) st.sound = change.sound;
  if (change.remove) { delete st[change.remove]; if (change.remove === 'sound') { delete st.customSound; } }
  return st;
}
const lookWords = (c) => c.likeItems ? `the look of ${c.likeItems}` : c.preset ? 'a new label colour' : c.part ? `${c.part} colour` : c.fontSize != null ? 'text size' : c.beam ? `a ${c.beam.toLowerCase()} beam` : c.icon ? `a ${c.icon.color.toLowerCase()} ${c.icon.shape.toLowerCase()} icon` : c.sound ? `sound ${c.sound.id}` : c.remove ? `no ${c.remove}` : 'a new look';

const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// "Stacked Decks" -> "stacked deck", "Orbs of Alchemy" -> "orb of alchemy"
const singulars = (s) => {
  const n = norm(s);
  const one = (w) => (/ies$/.test(w) ? [w.replace(/ies$/, 'y')] : /(ches|shes|sses|xes)$/.test(w) ? [w.replace(/es$/, '')] : /s$/.test(w) && !/ss$/.test(w) ? [w.replace(/s$/, '')] : []);
  const words = n.split(' ');
  const out = new Set([n]);
  for (let i = 0; i < words.length; i++) for (const w of one(words[i])) out.add([...words.slice(0, i), w, ...words.slice(i + 1)].join(' '));
  for (const w of one(words[words.length - 1] || '')) { const first = one(words[0] || ''); for (const f of first) out.add([f, ...words.slice(1, -1), w].join(' ')); }
  return [...out];
};

const typeName = (t) => t.label || t.type;
function findType(view, q) {
  if (!q) return null;
  const n = norm(q).replace(/ (category|tiers?)$/, '');
  const list = view.types;
  // "Currency: Small stacks" is found by "small stacks" too
  const tail = (t) => norm(typeName(t).split(':').pop());
  return list.find((t) => norm(typeName(t)) === n || norm(t.type) === n)
    || list.find((t) => tail(t) === n || singulars(tail(t)).includes(n) || singulars(n).includes(tail(t)))
    || list.find((t) => singulars(typeName(t)).includes(n) || singulars(n).includes(norm(typeName(t))))
    || list.find((t) => norm(typeName(t)).startsWith(n) || norm(t.type.replace(/->/g, ' ')).includes(n));
}
const tiersOf = (t) => t.allTiers || t.tiers || [];
const labelOf = (t, x) => x.customName || x.name || uniqueTier({ ...x, type: t.type })?.[1] || tierName(x);

function findTier(t, q) {
  const n = norm(q).replace(/^the /, '');
  if (/^(hidden|hide|hidden tier)$/.test(n)) return { tier: HIDE };
  const num = /^(?:tier |t)?(\d+)$/.exec(n)?.[1];
  const xs = tiersOf(t);
  // "tier 4" is t4, or NeverSink's t4chaos
  return (num && (xs.find((x) => x.tier === `t${num}`) || xs.find((x) => new RegExp(`^t${num}(?!\\d)[a-z]`).test(x.tier) && x.hasBaseList)))
    || xs.find((x) => norm(x.tier) === n || norm(x.customName) === n || norm(x.name) === n || norm(labelOf(t, x)) === n)
    || xs.find((x) => uniqueTier({ ...x, type: t.type })?.[0]?.toLowerCase() === n.replace(/ tier$/, ''))
    || xs.find((x) => n.length >= 3 && (norm(x.customName).includes(n) || norm(labelOf(t, x)).includes(n)))
    || null;
}

/** every base the filter tiers, by its plain name */
function baseIndex(view) {
  const idx = new Map();
  for (const t of view.types) for (const x of tiersOf(t)) for (const b of x.bases || []) {
    const k = norm(b);
    if (!idx.has(k)) idx.set(k, { name: b, at: [] });
    idx.get(k).at.push({ type: t, tier: x });
  }
  return idx;
}
// uniques: a Map of unique name (norm) -> its base, as the filter tiers uniques by base
function findBases(view, text, uniques = null) {
  const idx = baseIndex(view);
  const parts = String(text).split(/\s*,\s*|\s+and\s+|\s*&\s*/i).map((s) => s.trim()).filter(Boolean);
  const found = [], missing = [], viaUnique = [];
  const look = (p) => singulars(p).map((k) => idx.get(k)).find(Boolean);
  for (const p of parts) {
    let hit = look(p) || look(p.replace(/^(all|the|every)\s+/i, ''));
    if (!hit && uniques) {
      const base = singulars(p).map((k) => uniques.get(k)).find(Boolean);
      if (base && (hit = idx.get(norm(base)))) viaUnique.push(`${p} is a ${base}`);
    }
    if (hit && !found.includes(hit)) found.push(hit); else if (!hit) missing.push(p);
  }
  return { found, missing, viaUnique };
}
// where a base is tiered, and which of those places a change goes to: the one asked for, else the plain one
// (not a stack or levelling tier list)
function pickType(view, bases, typeQ) {
  if (typeQ) {
    const t = findType(view, typeQ);
    if (!t) return { error: `I don't know a category called "${typeQ}".` };
    // not in it yet: it's added there (stacks of Orb of Alchemy in Small stacks)
    return { type: t, added: bases.filter((b) => !b.at.some((a) => a.type.type === t.type)) };
  }
  const shared = view.types.filter((t) => bases.every((b) => b.at.some((a) => a.type.type === t.type)));
  if (!shared.length) return { error: `Those aren't in one category together. Do them one by one, or add "in <category>".` };
  const plain = shared.filter((t) => !/stacked|leveling|levelling|splinter->/.test(t.type));
  const t = (plain.length ? plain : shared)[0];
  return { type: t, others: shared.filter((x) => x !== t) };
}

/** The exact change for what was asked, or { reply } when there's nothing to change. */
function resolve(ask, view, { uniques = null, newTiers = [] } = {}) {
  if (!view) return { reply: 'Choose your filter first (the box at the top of the Loot filter page).' };
  // your own tiers that are still empty aren't in the view: added so items can be moved into them
  if (newTiers.length) {
    view = { ...view, types: view.types.map((t) => {
      const mine = newTiers.filter((nt) => nt.type === t.type && !tiersOf(t).some((x) => x.tier === nt.tier));
      return mine.length ? { ...t, allTiers: [...tiersOf(t), ...mine.map((nt) => ({ type: t.type, tier: nt.tier, key: `${t.type}|${nt.tier}`, customName: nt.name, bases: [], hasBaseList: true, mine: true, state: 'Show' }))] } : t;
    }) };
  }
  if (ask.kind === 'help') return { reply: HELP };
  if (ask.kind === 'unknown') return { reply: `I didn't understand that. ${HELP}` };
  if (ask.kind === 'undo') return { op: 'undo' };
  if (ask.kind === 'where') {
    const { found, missing, viaUnique } = findBases(view, ask.items, uniques);
    const lines = found.map((b) => `${b.name}: ${b.at.map((a) => `${typeName(a.type)} › ${labelOf(a.type, a.tier)}${a.tier.state === 'Hide' ? ' (hidden)' : a.tier.state === 'Off' ? ' (off)' : ''}`).join('; ')}`);
    if (missing.length) lines.push(`Not in your filter's tier lists: ${missing.join(', ')}.`);
    return { reply: [...viaUnique.map((x) => `${x}: uniques are tiered by their base.`), ...lines].join('\n') };
  }
  if (ask.kind === 'look:bad') return { reply: `I don't know the colour "${ask.what}".${ask.game ? ' Beams and map icons: Red, Green, Blue, Brown, White, Yellow, Cyan, Grey, Orange, Pink, Purple.' : ' Use a name (red, white, gold…), "255 128 0" or "#ff8000".'}` };
  if (ask.kind === 'look:set') {
    let like = null;
    if (ask.change.likeItems) {
      const lf = findBases(view, ask.change.likeItems, uniques);
      const a = lf.found[0]?.at.find((x) => !x.tier.stackSize) || lf.found[0]?.at[0];
      if (!a) return { reply: `I can't find "${ask.change.likeItems}" in your filter's tier lists.` };
      like = a.tier.style || {};
    }
    // a tier: its look changes
    const tierHit = (q, typeQ) => {
      const t = typeQ ? findType(view, typeQ) : null;
      const hits = (t ? [t] : view.types).flatMap((ty) => { const x = findTier(ty, q); return x && x.tier !== HIDE ? [{ t: ty, x }] : []; });
      return hits.length === 1 ? hits[0] : hits.length ? { many: hits } : null;
    };
    if (ask.target === 'tier') {
      const hit = tierHit(ask.tier, ask.type);
      if (!hit) return { reply: `I can't find the tier "${ask.tier}"${ask.type ? ` in ${ask.type}` : ''}.` };
      if (hit.many) return { reply: `"${ask.tier}" is in ${hit.many.length} categories. Add "in <category>".` };
      return { op: 'style', key: hit.x.key || `${hit.t.type}|${hit.x.tier}`, style: applyLook(hit.x.style, ask.change, like), label: `${typeName(hit.t)} › ${labelOf(hit.t, hit.x)}`, words: lookWords(ask.change) };
    }
    const { found, missing, viaUnique } = findBases(view, ask.items, uniques);
    if (!found.length) {
      // not an item: maybe your own tier's name ("Decks in Currency")
      const hit = ask.orTier && tierHit(ask.orTier.tier, ask.orTier.type);
      if (hit && !hit.many) return { op: 'style', key: hit.x.key || `${hit.t.type}|${hit.x.tier}`, style: applyLook(hit.x.style, ask.change, like), label: `${typeName(hit.t)} › ${labelOf(hit.t, hit.x)}`, words: lookWords(ask.change) };
      return { reply: `I can't find ${missing.map((m) => `"${m}"`).join(', ')} in your filter's tier lists.` };
    }
    const pt = pickType(view, found, ask.type);
    if (pt.error) return { reply: pt.error };
    const t = pt.type;
    const bases = found.map((b) => b.name);
    const at = found.map((b) => b.at.find((a) => a.type.type === t.type)?.tier).filter(Boolean);
    if (!at.length) return { reply: `${bases.join(', ')} ${bases.length === 1 ? 'isn\'t' : 'aren\'t'} in ${typeName(t)}.` };
    const x = at[0];
    const note = (viaUnique.length ? ` ${viaUnique.join(', ')}: every unique on that base gets it.` : '') + (pt.others?.length ? ` Its stacks (${pt.others.map(typeName).join(', ')}) keep their look: add "in <category>" for those.` : '');
    // alone in its tier (or all of the tier's items): that tier's look; else its own tier first, so the rest keep theirs
    const sameTier = at.every((y) => y === x);
    if (sameTier && (x.bases || []).every((b) => bases.includes(b))) return { op: 'style', key: x.key || `${t.type}|${x.tier}`, style: applyLook(x.style, ask.change, like), label: `${typeName(t)} › ${labelOf(t, x)}`, words: lookWords(ask.change), note };
    return { op: 'styleNew', type: t.type, typeLabel: typeName(t), bases, name: bases.length === 1 ? bases[0].slice(0, 40) : 'My tier', copyFrom: /^poehelper-/.test(x.tier) ? null : x.tier, style: applyLook(x.style, ask.change, like), words: lookWords(ask.change), note };
  }
  if (ask.kind === 'emptyTier') {
    const t = findType(view, ask.type);
    if (!t) return { reply: `I don't know a category called "${ask.type}".` };
    // a copy of one of the filter's own tiers (not one you made: those can't be copied)
    const own = tiersOf(t).filter((y) => y.hasBaseList && !y.generated && !/^poehelper-/.test(y.tier));
    const from = own.find((y) => !y.special) || own[0];
    if (!from) return { reply: `${typeName(t)} has no tier list to add a tier to.` };
    return { op: 'newTier', type: t.type, typeLabel: typeName(t), bases: [], name: String(ask.name).slice(0, 40), copyFrom: from.tier, note: ' It\'s empty: "Move <item> to ' + String(ask.name).slice(0, 40) + ' in ' + typeName(t) + '" puts items in.' };
  }
  if (ask.kind === 'visible' || ask.kind === 'look') {
    const { found, missing, viaUnique } = findBases(view, ask.items, uniques);
    if (!found.length) return { reply: `I can't find ${missing.map((m) => `"${m}"`).join(', ')} in your filter's tier lists.` };
    const t = ask.type ? findType(view, ask.type) : null;
    const rows = [];
    for (const b of found) for (const a of b.at) {
      if (t && a.type.type !== t.type) continue;
      const shown = a.tier.state === 'Show' || (!a.tier.state && a.tier.action !== 'Hide');
      const stack = a.tier.stackSize ? ` (stacks of ${a.tier.stackSize.op === '>' ? a.tier.stackSize.value + 1 : a.tier.stackSize.value}+)` : '';
      rows.push({ base: b.name, where: `${typeName(a.type)} › ${labelOf(a.type, a.tier)}${stack}`, shown, state: a.tier.state || a.tier.action, style: a.tier.style || null, type: a.type.type });
    }
    const pre = viaUnique.map((x) => `${x} (uniques are tiered by base).`);
    if (ask.kind === 'visible') {
      return { reply: [...pre, ...found.map((b) => {
        const mine = rows.filter((r) => r.base === b.name);
        const any = mine.some((r) => r.shown);
        return `${b.name}: ${any ? 'shown' : 'hidden'}${mine.length > 1 || !any ? '\n' + mine.map((r) => `  ${r.shown ? '+ shown' : r.state === 'Off' ? '− off' : '− hidden'}: ${r.where}`).join('\n') : ` (${mine[0].where})`}`;
      })].join('\n') };
    }
    return { reply: [...pre, `How ${found.map((b) => b.name).join(', ')} ${found.length === 1 ? 'looks' : 'look'} now:`].join('\n'), looks: rows };
  }
  if (['newTier', 'move', 'hide', 'unhide'].includes(ask.kind)) {
    const { found, missing, viaUnique } = findBases(view, ask.items, uniques);
    if (missing.length) return { reply: `I can't find ${missing.map((m) => `"${m}"`).join(', ')} in your filter's tier lists. Check the spelling (the item's own name, like "Stacked Deck").` };
    const pt = pickType(view, found, ask.type);
    if (pt.error) return { reply: pt.error };
    const t = pt.type;
    const bases = found.map((b) => b.name);
    const note = (viaUnique.length ? ` ${viaUnique.join(', ')}: uniques are tiered by base, so every unique on it moves too.` : '')
      + (pt.others?.length ? ` Also in ${pt.others.map(typeName).join(', ')}: add "in <category>" for those.` : '');
    const now = (b) => found.find((f) => f.name === b).at.find((a) => a.type.type === t.type)?.tier;
    if (pt.added?.length && ask.kind !== 'newTier' && ask.kind !== 'move') return { reply: `${pt.added.map((b) => b.name).join(', ')} ${pt.added.length === 1 ? 'isn\'t' : 'aren\'t'} in ${typeName(t)}.` };
    if (ask.kind === 'newTier') {
      const from = bases.map(now).find((y) => y && !/^poehelper-/.test(y.tier)) || tiersOf(t).find((y) => y.hasBaseList && !y.special && !y.generated && !/^poehelper-/.test(y.tier));
      const name = (ask.name || (bases.length === 1 ? bases[0] : 'My tier')).slice(0, 40);
      return { op: 'newTier', type: t.type, typeLabel: typeName(t), bases, name, copyFrom: !from || from.generated ? null : from.tier, note };
    }
    // hide: everywhere it's tiered (Currency, its stacks, levelling…), unless a category was named
    if (ask.kind === 'hide' && !ask.type) {
      const moves = view.types.map((ty) => ({ type: ty.type, label: typeName(ty), bases: found.filter((b) => b.at.some((a) => a.type.type === ty.type && a.tier.hasBaseList && !a.tier.generated)).map((b) => b.name) })).filter((m) => m.bases.length);
      return { op: 'hideAll', moves, bases, note: viaUnique.length ? ` ${viaUnique.join(', ')}: uniques are tiered by base, so every unique on it is hidden too.` : '' };
    }
    if (ask.kind === 'hide') return { op: 'move', type: t.type, typeLabel: typeName(t), bases, to: HIDE, toLabel: 'hidden', note };
    // show: back where the filter had it, everywhere you hid it (or in the category named)
    if (ask.kind === 'unhide') return { op: 'unmove', type: ask.type ? t.type : null, typeLabel: ask.type ? typeName(t) : 'every category', bases, note: '' };
    const x = findTier(t, ask.to);
    if (!x) return { reply: `${typeName(t)} has no tier "${ask.to}". Its tiers: ${tiersOf(t).filter((y) => y.hasBaseList && !y.generated).map((y) => labelOf(t, y)).join(', ')}.` };
    return { op: 'move', type: t.type, typeLabel: typeName(t), bases, to: x.tier, toLabel: x.tier === HIDE ? 'hidden' : labelOf(t, x), note };
  }
  // a whole tier
  const t = ask.type ? findType(view, ask.type) : null;
  if (ask.type && !t) return { reply: `I don't know a category called "${ask.type}".` };
  const scope = t ? [t] : view.types;
  const hits = scope.flatMap((ty) => { const x = findTier(ty, ask.tier); return x && x.tier !== HIDE ? [{ t: ty, x }] : []; });
  if (!hits.length) return { reply: `I can't find the tier "${ask.tier}"${t ? ` in ${typeName(t)}` : ''}.` };
  if (hits.length > 1) return { reply: `"${ask.tier}" is in ${hits.length} categories (${hits.slice(0, 6).map((h) => typeName(h.t)).join(', ')}…). Add "in <category>".` };
  const [{ t: ty, x }] = hits;
  const key = x.key || `${ty.type}|${x.tier}`;
  const label = `${typeName(ty)} › ${labelOf(ty, x)}`;
  if (ask.kind === 'tierAction') return { op: 'action', key, action: ask.action, label };
  if (ask.kind === 'stack') {
    if (!x.stackSize) return { reply: `${label} has no stack size.` };
    if (!(ask.size >= 1 && ask.size <= 5000)) return { reply: 'A stack size is a whole number from 1.' };
    return { op: 'stack', key, size: ask.size, label };
  }
  if (ask.kind === 'rename') {
    if (!/^poehelper-/.test(x.tier)) return { reply: `Only tiers you made can be renamed; ${label} is the filter's own.` };
    return { op: 'rename', type: ty.type, tier: x.tier, name: String(ask.name).slice(0, 40), label };
  }
  return { reply: HELP };
}

// a category's tiers, as the chat names them (for Claude's list)
const tierLabels = (t) => [...new Set(tiersOf(t).filter((x) => x.hasBaseList && !x.generated).map((x) => labelOf(t, x)))];

module.exports = { read, resolve, HELP, singulars, findBases, tierLabels };
