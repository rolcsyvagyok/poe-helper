/* Tiny DOM helpers shared by both windows. No framework, no remote scripts.
   Wrapped in an IIFE so nothing leaks into the global scope that app.js/overlay.js share. */
(() => {
'use strict';

function h(tag, attrs, ...children) {
  const el = tag === 'svg' || tag === 'path' || tag === 'polygon' || tag === 'circle' || tag === 'rect' ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'checked' || k === 'value' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function mount(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false).map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
}

function fmt(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  if (abs >= 100000) return (n / 1000).toFixed(0) + 'k';
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (abs >= 100) return n.toFixed(0);
  return n.toFixed(abs < 1 ? 2 : digits).replace(/\.0+$/, '');
}

function chaosDiv(chaos, divine) {
  if (chaos == null) return '–';
  if (divine && Math.abs(chaos) >= divine) return `${fmt(chaos / divine, 2)} div`;
  return `${fmt(chaos)}c`;
}

function ago(ms) {
  if (ms == null) return 'never';
  const s = Math.round(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hh = Math.round(m / 60);
  if (hh < 48) return `${hh} h ago`;
  return `${Math.round(hh / 24)} days ago`;
}

function rarityClass(item) {
  if (!item) return '';
  if (item.rarity === 'Divination Card') return 'r-Divination';
  return 'r-' + (item.rarity || 'Normal');
}

// ---------- drop labels: how an item looks on the ground with a given filter style ----------

const RARITY_TEXT = { Normal: [200, 200, 200], Magic: [136, 136, 255], Rare: [255, 255, 119], Unique: [175, 96, 37], Currency: [170, 158, 130], Gem: [27, 162, 155], 'Divination Card': [14, 186, 255], Quest: [74, 230, 58] };
const GAME_COLOURS = { Red: '#ff4136', Green: '#3ddc6b', Blue: '#4f7dff', Brown: '#b5703a', White: '#f4f4f4', Yellow: '#ffd426', Cyan: '#38d6f2', Grey: '#9a9aa0', Orange: '#ff9a1f', Pink: '#ff79b8', Purple: '#b062ff' };
const SHAPES = {
  Circle: 'M6 1a5 5 0 1 0 0 10A5 5 0 0 0 6 1z',
  Diamond: 'M6 0.5 11.5 6 6 11.5 0.5 6z',
  Hexagon: 'M3 1h6l3 5-3 5H3L0 6z',
  Square: 'M1.5 1.5h9v9h-9z',
  Star: 'M6 0.6l1.6 3.6 3.9.4-2.9 2.6.8 3.9L6 9.1 2.6 11.1l.8-3.9L.5 4.6l3.9-.4z',
  Triangle: 'M6 1 11.5 11h-11z',
  Cross: 'M4 0.5h4v3.5h3.5v4H8v3.5H4V8H0.5V4H4z',
  Moon: 'M8.5 1.2A5 5 0 1 0 10.8 8 4 4 0 0 1 8.5 1.2z',
  Raindrop: 'M6 0.5C8 4 10 6 10 8a4 4 0 0 1-8 0c0-2 2-4 4-7.5z',
  Kite: 'M6 0.5 10.5 4.5 6 11.5 1.5 4.5z',
  Pentagon: 'M6 0.6 11.4 4.5 9.3 11H2.7L.6 4.5z',
  UpsideDownHouse: 'M1 1h10v6L6 11 1 7z',
};

const rgba = (a, fallbackAlpha = 255) => (a ? `rgba(${+a[0] || 0},${+a[1] || 0},${+a[2] || 0},${((a[3] == null ? fallbackAlpha : +a[3]) / 255).toFixed(3)})` : null);

/** Accepts a rule style ({text:[r,g,b,a], ...}) or an explainer style map ({SetTextColor:['255',...], ...}). */
function normalizeStyle(style = {}, rarity) {
  const s = style || {};
  const out = {
    text: s.text || s.SetTextColor || null,
    border: s.border || s.SetBorderColor || null,
    background: s.background || s.SetBackgroundColor || null,
    fontSize: s.fontSize || (s.SetFontSize ? +s.SetFontSize[0] : null),
    beam: s.beam?.color || (s.PlayEffect && s.PlayEffect[0] !== 'None' ? s.PlayEffect[0] : null),
    icon: s.icon || (s.MinimapIcon ? { size: +s.MinimapIcon[0], color: s.MinimapIcon[1], shape: s.MinimapIcon[2] } : null),
    sound: null,
  };
  if (s.customSound) out.sound = soundIdFromPath(s.customSound) || 'custom';
  else if (s.CustomAlertSound) out.sound = soundIdFromPath(s.CustomAlertSound[0]) || 'custom';
  else if (s.sound?.id) out.sound = `game:${s.sound.id}`;
  else if (s.PlayAlertSound) out.sound = `game:${s.PlayAlertSound[0]}`;
  if (!out.text) out.text = [...(RARITY_TEXT[rarity] || RARITY_TEXT.Normal), 255];
  return out;
}

// Built-in tinks are "chime" (-> poehelper-sounds/chime.mp3); sounds you add keep their file
// name, "my-loud-drop.wav" (-> poehelper-sounds/my-loud-drop.wav).
const isUserSound = (id) => /^my-/.test(String(id || ''));
function soundIdFromPath(p) {
  const m = /poehelper-sounds\/(.+)$/.exec(String(p || ''));
  if (!m) return null;
  return isUserSound(m[1]) ? m[1] : m[1].replace(/\.mp3$/, '');
}
function soundPath(id) {
  return `poehelper-sounds/${isUserSound(id) ? id : `${id}.mp3`}`;
}
const userSoundUrls = new Map();
async function soundUrl(id) {
  if (!isUserSound(id) && !/^game-[A-Za-z0-9]+\.ogg$/.test(String(id))) return `sounds/${id}.mp3`;
  if (!userSoundUrls.has(id)) userSoundUrls.set(id, await window.poe.call('sounds:data', id));
  return userSoundUrls.get(id);
}

/** Reads a dropped or chosen file as base64 for the main process. */
async function fileToBase64(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A generic drop area: drop a file or click to choose. accept like ".png,.svg". */
function fileDropZone(label, accept, onFile) {
  const input = h('input', { type: 'file', accept, style: { display: 'none' } });
  const zone = h('div', { class: 'sound-drop', tabindex: '0', role: 'button', 'aria-label': label }, h('span', {}, label), input);
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => input.files[0] && onFile(input.files[0]));
  zone.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); zone.classList.add('over'); } });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
  return zone;
}

/**
 * A drop area for .mp3 / .wav / .ogg files. The file is copied into the app's own sounds
 * folder and next to your filter when it is used. Calls onAdded(sound) with {id, name}.
 */
function soundDropZone(onAdded) {
  const input = h('input', { type: 'file', accept: '.mp3,.wav,.ogg,audio/*', style: { display: 'none' } });
  const zone = h('div', { class: 'sound-drop', tabindex: '0', role: 'button', 'aria-label': 'Add your own sound: drop a file or click to choose one' },
    h('span', {}, 'Drop an .mp3, .wav or .ogg here'), h('span', { class: 'faint' }, ' or click to choose'), input);
  const add = async (file) => {
    if (!file) return;
    if (!/\.(mp3|wav|ogg)$/i.test(file.name)) return toast('Use an .mp3, .wav or .ogg file', true);
    if (file.size > 5 * 1024 * 1024) return toast('That sound is over 5 MB. Use a short clip.', true);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    try {
      const snd = await window.poe.call('sounds:import', { name: file.name, data: btoa(bin) });
      toast(`Added "${snd.name}"`);
      onAdded(snd);
    } catch (e) { toast(e.message, true); }
  };
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => add(input.files[0]));
  zone.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); zone.classList.add('over'); } });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); add(e.dataTransfer.files[0]); });
  return zone;
}

/** The item label as it appears on the ground. `size` scales in-game font sizes (18–45). */
function dropLabel(name, style, { rarity, scale = 1, hidden = false, game = false } = {}) {
  const st = normalizeStyle(style, rarity);
  // game: close to the size the label has in game at 1080p, like FilterBlade's preview (size 45 is about 27 px)
  const px = Math.round((game ? (st.fontSize || 32) * 0.6 : 7 + (st.fontSize || 32) * 0.33) * scale);
  const label = h('span', {
    class: 'drop-label',
    style: {
      color: rgba(st.text),
      background: rgba(st.background) || 'rgba(0,0,0,0.72)',
      borderColor: rgba(st.border) || 'transparent',
      fontSize: px + 'px',
    },
  }, name);
  const beam = st.beam ? h('span', { class: 'drop-beam', title: `${st.beam} beam`, style: { '--beam': GAME_COLOURS[st.beam] || '#fff' } }) : null;
  const icon = st.icon && SHAPES[st.icon.shape] ? h('svg', { class: 'drop-icon', viewBox: '0 0 12 12', width: 14 - (st.icon.size || 0) * 2, height: 14 - (st.icon.size || 0) * 2 },
    h('title', {}, `Minimap: ${st.icon.color} ${st.icon.shape}`),
    h('path', { d: SHAPES[st.icon.shape], fill: GAME_COLOURS[st.icon.color] || '#fff' })) : null;
  return h('span', { class: 'drop' + (hidden ? ' is-hidden' : '') }, beam, label, icon);
}

// ---------- tinks ----------

let playing = null;
// Your own recordings of the game's built-in drop sounds, for previews only: { "1": "my-game-sound-1.mp3" }.
// The filter still uses the real in-game sound (PlayAlertSound N); nothing from the game is shipped.
const gameSoundFiles = {};
function setGameSounds(map) { for (const k of Object.keys(gameSoundFiles)) delete gameSoundFiles[k]; Object.assign(gameSoundFiles, map || {}); }
// the copies made from your game (game-6.ogg), with your own recordings taking over where you added one
const gameSoundMap = (settings) => ({ ...(settings?.gameSounds?.files || {}), ...(settings?.gameSoundFiles || {}) });
const gameSoundFile = (id) => (String(id).startsWith('game:') ? gameSoundFiles[String(id).slice(5)] || null : null);

function playSound(id) {
  if (gameSoundFile(id)) id = gameSoundFile(id);
  if (!id || id === 'none' || id === 'keep' || id.startsWith('game:') || id === 'custom') return false;
  try {
    playing?.pause();
    soundUrl(id).then((url) => {
      playing = new Audio(url);
      playing.volume = 0.8;
      playing.play().catch(() => {});
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Small button that plays a tink, or a note for built-in game sounds (we can't ship those). */
function soundButton(id) {
  if (!id || id === 'none') return null;
  if (id.startsWith('game:')) {
    const n = id.slice(5);
    if (gameSoundFile(id)) return h('span', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, h('span', { class: 'sound-chip' }, `Game sound ${n}`), h('button', { class: 'play', type: 'button', title: `Play game sound ${n}`, 'aria-label': `Play game sound ${n}`, onclick: (e) => { e.stopPropagation(); playSound(id); } }, '▶'));
    return h('span', { class: 'sound-chip', title: `Built-in game sound ${n}. To preview it here, let PoE Helper find your game in Tier designer → Game sound previews.` }, `Game sound ${n}`);
  }
  if (id === 'custom') return h('span', { class: 'sound-chip' }, 'Custom sound');
  return h('button', { class: 'play', type: 'button', title: 'Play this sound', 'aria-label': 'Play sound', onclick: (e) => { e.stopPropagation(); playSound(id); } }, '▶');
}

function toast(msg, err) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = h('div', { class: 'toast-wrap', role: 'status' });
    document.body.append(wrap);
  }
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
  wrap.append(t);
  setTimeout(() => t.remove(), err ? 7000 : 3500);
}

async function call(channel, ...args) {
  try {
    return await window.poe.call(channel, ...args);
  } catch (e) {
    toast(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
    throw e;
  }
}

/** Load the user's own Fontin file (if they chose one) as "PoE Label User", the first item font. */
async function loadUserFont() {
  try {
    const f = await window.poe.call('font:get');
    if (!f?.data) return false;
    const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    const face = new FontFace('PoE Label User', bytes.buffer);
    await face.load();
    document.fonts.add(face);
    return true;
  } catch {
    return false;
  }
}
if (window.poe) loadUserFont();

// ---------------------------------------------------------------- category icons
// Small line icons (24x24, drawn with currentColor) for the loot filter categories.
const ICONS = {
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>',
  coins: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3 3 7 3s7-1.3 7-3v-5"/>',
  card: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8.5 7h7M8.5 11h7M8.5 15h4"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  star: '<path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"/>',
  shard: '<path d="M12 2l7 7-4 13H9L5 9z"/><path d="M5 9h14M12 2v20"/>',
  scarab: '<ellipse cx="12" cy="13.5" rx="5" ry="7"/><path d="M12 7v13.5M7.2 10.5H3.5M7 15.5H3.5M16.8 10.5h3.7M17 15.5h3.5M9.5 6.5L8 3M14.5 6.5L16 3"/>',
  gem: '<path d="M6.5 3h11l4 6L12 21 2.5 9z"/><path d="M2.5 9h19M9 3l3 6 3-6M12 9v12"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  flask: '<path d="M9 2.5h6M10 2.5v6l-5 8.5a3 3 0 0 0 2.6 4.5h8.8a3 3 0 0 0 2.6-4.5L14 8.5v-6"/><path d="M7 15h10"/>',
  drop: '<path d="M12 2.5s7 7.8 7 12.5a7 7 0 0 1-14 0c0-4.7 7-12.5 7-12.5z"/>',
  hex: '<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z"/><path d="M12 7l4.3 2.5v5L12 17l-4.3-2.5v-5z"/>',
  sword: '<path d="M14.5 3H21v6.5L9.5 21 3 14.5z"/><path d="M3 21l3.5-3.5M7 13l4 4"/>',
  shield: '<path d="M12 2.5l8 3v6c0 5-3.5 8.8-8 10.5-4.5-1.7-8-5.5-8-10.5v-6z"/>',
  helmet: '<path d="M4 15a8 8 0 0 1 16 0v4H4zM12 7v8M4 15h16"/>',
  ring: '<circle cx="12" cy="14.5" r="6.5"/><path d="M9 3.5h6L12 8z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  hammer: '<path d="M13 3l8 8-3 3-8-8z"/><path d="M11.5 9.5L3 18l3 3 8.5-8.5"/>',
  key: '<circle cx="8" cy="15.5" r="4.5"/><path d="M11.2 12.3L20 3.5M16.5 7l3 3M14.5 9l2 2"/>',
  leaf: '<path d="M4 20C4 11 10 4 20 4c0 10-7 16-16 16z"/><path d="M4 20l9-9"/>',
  eyeoff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
  flame: '<path d="M12 2.5c1 4 6 6 6 11.5a6 6 0 0 1-12 0c0-3 2-5 3-6.5 0 2.5 1.5 3.5 3 3.5 0-3-1-6 0-8.5z"/>',
  rock: '<path d="M4 15l3-8 6-3.5 7 5-1 9-9 3z"/><path d="M7 7l4 6 9-4M11 13l-2 8.5"/>',
  bolt: '<path d="M13.5 2L4 14h7l-1 8 9.5-12h-7z"/>',
  orb: '<circle cx="12" cy="12" r="9"/><path d="M7 12a5 5 0 0 1 10 0M9.5 8.5l.01 0"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5M8 7.5h8"/>',
  skull: '<path d="M12 2.5a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3.5h10V16.5c1.5-1 3-3 3-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10.5 20v-2.5M13.5 20v-2.5"/>',
  heart: '<path d="M12 20.5s-8-5-8-11a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 6-8 11-8 11z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sparkle: '<path d="M12 3l1.8 5.7L19.5 10l-5.7 1.8L12 17.5l-1.8-5.7L4.5 10l5.7-1.3zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
};
const ICON_NAMES = Object.keys(ICONS);
// images you uploaded, id "img:<file>" -> data URL (filled in by the app at start)
const userIcons = new Map();
function setUserIcons(list) {
  userIcons.clear();
  for (const x of list || []) userIcons.set(x.id, x.url);
}
// in-game item pictures: item name -> image URL on GGG's server (from poe.ninja's data)
const artUrls = new Map();
function setArt(map) { for (const [k, v] of Object.entries(map || {})) artUrls.set(k, v); }
const hasArt = (name) => artUrls.has(name);
function icon(id, { size = 16, title = null, fallback = 'box' } = {}) {
  const span = document.createElement('span');
  span.className = 'ico';
  if (String(id).startsWith('art:')) {
    const url = artUrls.get(String(id).slice(4));
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.width = size; img.height = size; img.alt = ''; img.loading = 'lazy';
      img.style.objectFit = 'contain';
      img.className = 'art';
      // offline or blocked: show the line icon instead
      img.onerror = () => span.replaceChildren(icon(fallback, { size }));
      span.append(img);
      if (title) span.title = title;
      return span;
    }
    id = fallback;
  }
  if (String(id).startsWith('img:')) {
    const img = document.createElement('img');
    img.src = userIcons.get(id) || '';
    img.width = size; img.height = size; img.alt = '';
    img.style.objectFit = 'contain';
    span.append(img);
    if (title) span.title = title;
    if (userIcons.has(id)) return span;
    id = 'box'; span.replaceChildren(); // image was deleted: fall back
  }
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ICONS.box}</svg>`;
  if (title) span.title = title;
  return span;
}

/**
 * Re-render without jumping: keeps the window's and the category list's scroll position, and holds
 * the page's height while it is rebuilt so the scrollbar can't snap back to the top.
 */
let keeping = 0;
async function keepScroll(fn) {
  if (keeping) return fn(); // already inside one
  const main = document.querySelector('.main');
  const page = document.querySelector('.page.active');
  const top = main ? main.scrollTop : 0;
  const inner = [...document.querySelectorAll('[data-keep-scroll]')].map((el) => [el.dataset.keepScroll, el.scrollTop]);
  if (page) page.style.minHeight = `${page.offsetHeight}px`;
  keeping++;
  try {
    return await fn();
  } finally {
    keeping--;
    if (main) main.scrollTop = top;
    for (const [id, t] of inner) { const el = document.querySelector(`[data-keep-scroll="${id}"]`); if (el) el.scrollTop = t; }
    requestAnimationFrame(() => { if (page) page.style.minHeight = ''; if (main && main.scrollTop !== top) main.scrollTop = top; });
  }
}

// ---------------- the app's look (Settings → Appearance); kept in localStorage too so windows open in it without a flash
const UI_THEMES = [
  { id: 'atlas', name: 'Atlas', note: 'Night blue and silver (default)', sw: ['#070a0f', '#0f1720', '#d9ecfb', '#2c6c9a'] },
  { id: 'hideout', name: 'Hideout', note: 'Stone, bronze and gold', sw: ['#080706', '#15110d', '#e2c48e', '#6b4a1c'] },
  { id: 'dark', name: 'Dark', note: 'The quiet slate look', sw: ['#181a20', '#1e2027', '#ece9e2', '#9db8e8'] },
];
function applyTheme(t) {
  const id = UI_THEMES.some((x) => x.id === t) ? t : 'atlas';
  if (id === 'dark') delete document.documentElement.dataset.uiTheme;
  else document.documentElement.dataset.uiTheme = id;
  try { localStorage.setItem('uiTheme', id); } catch { /* no storage */ }
  return id;
}
try { applyTheme(localStorage.getItem('uiTheme')); } catch { /* no storage */ }
if (window.poe) window.poe.on('uiTheme:changed', (t) => { applyTheme(t); document.dispatchEvent(new CustomEvent('uitheme', { detail: t })); });

window.UI = { UI_THEMES, applyTheme, gameSoundMap, setGameSounds, setArt, hasArt, setUserIcons, fileToBase64, fileDropZone, soundPath, soundIdFromPath, soundDropZone, isUserSound, icon, ICON_NAMES, keepScroll, loadUserFont, h, mount, fmt, chaosDiv, ago, rarityClass, toast, call, dropLabel, normalizeStyle, playSound, soundButton, GAME_COLOURS };
})();
