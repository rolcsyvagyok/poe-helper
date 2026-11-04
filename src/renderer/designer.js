/* Tier designer: design Tier 1-6 once, preview them as a loot pile, apply to every category.
   Uses app.js helpers (S, refreshState, pageHead, toggle). */
(() => {
'use strict';
const { h, mount, toast, call, dropLabel, soundButton, playSound, GAME_COLOURS } = window.UI;

const COLOURS = Object.keys(GAME_COLOURS);
const SHAPES = ['Star', 'Circle', 'Diamond', 'Hexagon', 'Square', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'];
const SAMPLE = { 1: 'Mirror of Kalandra', 2: 'Divine Orb', 3: 'Exalted Orb', 4: 'Chaos Orb', 5: 'Orb of Alchemy', 6: 'Orb of Transmutation' };
const LEVEL_NOTE = { 1: 'Best drops', 2: 'Very valuable', 3: 'Valuable', 4: 'Worth picking up', 5: 'Low value', 6: 'Lowest shown' };
// where each sample sits in the loot pile preview (percent of the stage)
const PILE = { 1: [38, 12], 2: [8, 34], 3: [56, 40], 4: [22, 62], 5: [62, 72], 6: [10, 84] };

const D = { state: null, levels: null, level: 1, presetId: null, lock: true, groups: null, saveTimer: null };
const clone = (o) => JSON.parse(JSON.stringify(o || {}));

function persist() {
  clearTimeout(D.saveTimer);
  D.saveTimer = setTimeout(() => call('designer:draft', { levels: D.levels, presetId: D.presetId, lockTier1: D.lock, groups: D.groups }).catch(() => {}), 400);
}

function soundOf(st) {
  const id = window.UI.soundIdFromPath(st?.customSound);
  if (id) return id;
  if (st?.sound?.id) return `game:${st.sound.id}`;
  return 'none';
}

/** Tier 1 lock: white label, white beam, white star, Divine tink (text colour and size stay yours). */
function lockT1() {
  const t1 = D.levels[1] || {};
  D.levels[1] = { ...t1, background: [255, 255, 255, 255], border: [255, 255, 255, 255], customSound: 'poehelper-sounds/divine-tink.mp3', beam: { color: 'White' }, icon: { size: 0, color: 'White', shape: 'Star' } };
  delete D.levels[1].sound;
}

function renderDesigner() { return window.UI.keepScroll(() => renderDesignerNow()); }
async function renderDesignerNow() {
  await refreshState();
  D.state = await call('designer:state');
  if (!D.levels) {
    D.levels = clone(D.state.draft.levels);
    D.presetId = D.state.draft.presetId;
    D.lock = D.state.draft.lockTier1;
    D.groups = D.state.draft.groups;
  }
  draw();
}

function draw() {
  const el = document.getElementById('page-designer');
  if (D.lock) lockT1();
  mount(el,
    pageHead('Tier designer', 'Design how Tier 1 to Tier 6 look, then apply it to every category in your filter at once.'),
    gallery(),
    h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Design'), h('p', {}, 'Click a drop in the preview or a tier below to edit it.')),
      h('div', { class: 'dz' }, pile(), editor())),
    applyBar());
}

// ---------------------------------------------------------------- theme gallery
function miniPreview(levels) {
  return h('div', { class: 'ground dz-mini' }, [1, 2, 3, 4].map((lv) => dropLabel(SAMPLE[lv], levels[lv], { scale: 0.52, rarity: 'Currency' })));
}

function gallery() {
  const card = (t, own) => h('div', { class: 'dz-card' + (D.presetId === t.id ? ' active' : '') },
    miniPreview(t.levels),
    h('div', { class: 'dz-card-body' },
      h('div', { class: 'row', style: { gap: '8px' } }, h('b', {}, t.name), D.presetId === t.id ? h('span', { class: 'pill good' }, 'In use') : null),
      t.description ? h('p', { class: 'small muted' }, t.description) : null,
      h('div', { class: 'row', style: { marginTop: '6px' } },
        h('button', { class: D.presetId === t.id ? 'sm' : 'primary sm', onclick: () => { D.levels = clone(t.levels); D.presetId = t.id; D.level = 1; persist(); draw(); toast(`Loaded "${t.name}". Press Apply to use it in your filter.`); } }, D.presetId === t.id ? 'Reload' : 'Use this theme'),
        own ? h('button', { class: 'danger sm', onclick: async () => { await call('designer:deleteTheme', t.id); D.state = await call('designer:state'); draw(); } }, 'Delete') : null)));
  return h('section', { class: 'section', style: { marginTop: 0 } },
    h('div', { class: 'section-head' }, h('h2', {}, 'Themes'), h('p', {}, 'Every theme keeps Tier 1 as a white label with the Divine tink.')),
    h('div', { class: 'dz-gallery' }, D.state.presets.map((t) => card(t, false)), D.state.themes.map((t) => card(t, true))));
}

// ---------------------------------------------------------------- loot pile preview
function pile() {
  const stage = h('div', { class: 'ground dz-pile', role: 'group', 'aria-label': 'Preview of all tiers on the ground' },
    [6, 5, 4, 3, 2, 1].map((lv) => {
      const [x, y] = PILE[lv];
      const st = D.levels[lv] || {};
      return h('button', {
        class: 'dz-drop' + (D.level === lv ? ' selected' : ''),
        style: { left: x + '%', top: y + '%' },
        title: `Tier ${lv}: click to edit`,
        onclick: () => { D.level = lv; draw(); if (soundOf(st) !== 'none') playSound(soundOf(st)); },
      }, dropLabel(SAMPLE[lv], st, { rarity: 'Currency', scale: 0.82 }));
    }));
  const tabs = h('div', { class: 'dz-levels' }, [1, 2, 3, 4, 5, 6].map((lv) => h('button', {
    class: D.level === lv ? 'active' : '',
    onclick: () => { D.level = lv; draw(); },
  }, h('span', { class: 'n' }, `Tier ${lv}`), h('span', { class: 'd' }, LEVEL_NOTE[lv]))));
  return h('div', { class: 'stack', style: { gap: '10px' } }, stage, tabs);
}

// ---------------------------------------------------------------- level editor
function editor() {
  const lv = D.level;
  const st = D.levels[lv] = D.levels[lv] || { fontSize: 32, text: [200, 200, 200, 255] };
  const locked = D.lock && lv === 1;
  const changed = () => { D.presetId = null; persist(); draw(); };
  const hex = (a) => '#' + (a || [0, 0, 0]).slice(0, 3).map((n) => Math.max(0, Math.min(255, +n || 0)).toString(16).padStart(2, '0')).join('');
  const fromHex = (v, alpha) => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), alpha];

  function colour(label, key, optional, disabled) {
    const on = h('input', { type: 'checkbox', checked: !!st[key], disabled: disabled || !optional, onchange: (e) => { if (e.target.checked) st[key] = st[key] || [255, 255, 255, 255]; else delete st[key]; changed(); } });
    const col = h('input', { type: 'color', value: hex(st[key] || [255, 255, 255]), disabled, 'aria-label': `${label} colour`, onchange: (e) => { st[key] = fromHex(e.target.value, st[key]?.[3] ?? 255); changed(); } });
    const alpha = h('input', { type: 'range', min: 0, max: 255, value: st[key]?.[3] ?? 255, disabled, 'aria-label': `${label} opacity`, style: { width: '110px' }, onchange: (e) => { st[key] = [...(st[key] || [255, 255, 255]).slice(0, 3), +e.target.value]; changed(); } });
    // quick swatches for fast picking
    const sw = ['#ffffff', '#000000', '#ff2a2a', '#ff9a1f', '#ffd426', '#3ddc6b', '#38d6f2', '#4f7dff', '#b062ff', '#ff79b8'].map((c) => h('button', { class: 'dz-sw', disabled, title: c, style: { background: c }, 'aria-label': `${label} ${c}`, onclick: () => { st[key] = fromHex(c, st[key]?.[3] ?? 255); changed(); } }));
    return h('div', { class: 'dz-row' + (disabled ? ' locked' : '') },
      h('label', { class: 'check' }, optional ? on : null, h('span', {}, label)),
      h('div', { class: 'stack', style: { gap: '6px' } }, h('div', { class: 'row', style: { gap: '8px' } }, col, h('span', { class: 'small faint' }, 'Opacity'), alpha), h('div', { class: 'row', style: { gap: '4px' } }, sw)));
  }

  const size = h('input', { type: 'range', min: 18, max: 45, value: st.fontSize || 32, style: { width: '200px' }, 'aria-label': 'Text size', onchange: (e) => { st.fontSize = +e.target.value; changed(); }, oninput: (e) => { out.textContent = e.target.value; } });
  const out = h('span', { class: 'small' }, String(st.fontSize || 32));

  const cur = soundOf(st);
  const soundSel = h('select', { disabled: locked, 'aria-label': 'Drop sound', onchange: (e) => {
    delete st.customSound; delete st.customVolume; delete st.sound;
    const v = e.target.value;
    if (v.startsWith('game:')) st.sound = { id: +v.slice(5), volume: 300 };
    else if (v !== 'none') st.customSound = window.UI.soundPath(v);
    playSound(v);
    changed();
  } },
  h('option', { value: 'none', selected: cur === 'none' }, 'No sound'),
  h('optgroup', { label: 'PoE Helper tinks' }, (S.sounds || []).filter((x) => !x.user).map((x) => h('option', { value: x.id, selected: cur === x.id }, `${x.name}, ${x.note}`))),
  (S.sounds || []).some((x) => x.user) ? h('optgroup', { label: 'Your sounds' }, S.sounds.filter((x) => x.user).map((x) => h('option', { value: x.id, selected: cur === x.id }, x.name))) : null,
  h('optgroup', { label: 'Game sounds (heard in game only)' }, Array.from({ length: 16 }, (_, i) => h('option', { value: `game:${i + 1}`, selected: cur === `game:${i + 1}` }, `Game sound ${i + 1}`))));
  const vol = h('input', { type: 'range', min: 0, max: 300, value: st.sound?.volume ?? st.customVolume ?? 300, style: { width: '140px' }, 'aria-label': 'Volume', onchange: (e) => { if (st.sound) st.sound.volume = +e.target.value; else if (st.customSound) st.customVolume = +e.target.value; persist(); } });

  const beam = h('select', { disabled: locked, 'aria-label': 'Light beam', onchange: (e) => { if (e.target.value) st.beam = { color: e.target.value, temp: !!st.beam?.temp }; else delete st.beam; changed(); } },
    h('option', { value: '' }, 'No beam'), COLOURS.map((c) => h('option', { value: c, selected: st.beam?.color === c }, `${c} beam`)));
  const temp = h('input', { type: 'checkbox', checked: !!st.beam?.temp, disabled: locked || !st.beam, onchange: (e) => { if (st.beam) { st.beam.temp = e.target.checked; changed(); } } });
  const iconC = h('select', { disabled: locked, 'aria-label': 'Minimap icon colour', onchange: (e) => { if (e.target.value) st.icon = { size: st.icon?.size ?? 1, shape: st.icon?.shape || 'Circle', color: e.target.value }; else delete st.icon; changed(); } },
    h('option', { value: '' }, 'No minimap icon'), COLOURS.map((c) => h('option', { value: c, selected: st.icon?.color === c }, c)));
  const iconS = h('select', { disabled: locked || !st.icon, 'aria-label': 'Minimap icon shape', onchange: (e) => { st.icon.shape = e.target.value; changed(); } },
    SHAPES.map((x) => h('option', { value: x, selected: st.icon?.shape === x }, x === 'UpsideDownHouse' ? 'House' : x)));
  const iconZ = h('select', { disabled: locked || !st.icon, 'aria-label': 'Minimap icon size', onchange: (e) => { st.icon.size = +e.target.value; changed(); } },
    [[0, 'Large'], [1, 'Medium'], [2, 'Small']].map(([v, l]) => h('option', { value: v, selected: (st.icon?.size ?? 1) === v }, l)));

  return h('div', { class: 'panel dz-editor' },
    h('div', { class: 'row' },
      h('h2', { style: { margin: 0 } }, `Tier ${lv}`), h('span', { class: 'small muted' }, LEVEL_NOTE[lv]),
      h('span', { class: 'spacer' }),
      lv === 1 ? toggle(D.lock, (v) => { D.lock = v; persist(); draw(); }, 'Keep white with the tink') : null),
    locked ? h('p', { class: 'small muted' }, 'Tier 1 stays a white label with a white beam, a white star and the Divine tink. You can still change its text colour and size, or switch the lock off.') : null,
    h('div', { class: 'ground stage', style: { minHeight: '110px', padding: '22px' } },
      h('div', { class: 'row', style: { gap: '10px' } }, dropLabel(SAMPLE[lv], st, { rarity: 'Currency' }), soundButton(soundOf(st)))),
    colour('Text', 'text', false, false),
    colour('Border', 'border', true, locked),
    colour('Background', 'background', true, locked),
    h('div', { class: 'dz-row' }, h('span', {}, 'Size'), h('div', { class: 'row' }, size, out, h('span', { class: 'small faint' }, 'The game uses one font; filters can change its size only.'))),
    h('div', { class: 'dz-row' + (locked ? ' locked' : '') }, h('span', {}, 'Sound'), h('div', { class: 'stack', style: { gap: '6px' } }, h('div', { class: 'row' }, soundSel, soundButton(cur !== 'none' && !cur.startsWith('game:') ? cur : null)),
      locked ? null : window.UI.soundDropZone((snd) => {
        S.sounds = [...(S.sounds || []).filter((x) => x.id !== snd.id), snd];
        delete st.sound; delete st.customVolume;
        st.customSound = window.UI.soundPath(snd.id);
        playSound(snd.id);
        changed();
      }))),
    h('div', { class: 'dz-row' }, h('span', {}, 'Volume'), h('div', { class: 'row' }, vol)),
    h('div', { class: 'dz-row' + (locked ? ' locked' : '') }, h('span', {}, 'Beam'), h('div', { class: 'row' }, beam, h('label', { class: 'check small' }, temp, 'Only when it drops'))),
    h('div', { class: 'dz-row' + (locked ? ' locked' : '') }, h('span', {}, 'Minimap'), h('div', { class: 'row' }, iconC, iconS, iconZ)),
    h('div', { class: 'row', style: { marginTop: '6px' } },
      lv > 1 ? h('button', { class: 'quiet sm', onclick: () => { D.levels[lv] = clone(D.levels[lv - 1]); D.levels[lv].fontSize = Math.max(18, (D.levels[lv].fontSize || 32) - 3); changed(); } }, `Copy Tier ${lv - 1}, a bit smaller`) : null,
      h('span', { class: 'spacer' }),
      lv < 6 ? h('button', { class: 'sm', onclick: () => { D.level = lv + 1; draw(); } }, `Next: Tier ${lv + 1}`) : null));
}

// ---------------------------------------------------------------- apply
function applyBar() {
  const groups = D.state.groups;
  const chosen = new Set(D.groups || groups.map((g) => g.id));
  const name = h('input', { placeholder: 'Name your design', style: { width: '200px' } });
  const affected = groups.filter((g) => chosen.has(g.id)).reduce((a, g) => a + g.tiers, 0);
  return h('section', { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', {}, 'Use it in your filter'), h('p', {}, 'Restyles every Tier 1 to Tier 6 in the categories you tick. Special cases and catch-all tiers keep their look.')),
    h('div', { class: 'panel stack' },
      !D.state.hasFilter ? h('p', { class: 'small muted' }, 'Choose your filter on the Loot filter page first.') : h('div', { class: 'dz-groups' }, groups.map((g) => h('label', { class: 'check small' },
        h('input', { type: 'checkbox', checked: chosen.has(g.id), onchange: (e) => { e.target.checked ? chosen.add(g.id) : chosen.delete(g.id); D.groups = chosen.size === groups.length ? null : [...chosen]; persist(); draw(); } }),
        `${g.label}`, h('span', { class: 'faint' }, ` ${g.tiers}`)))),
      h('div', { class: 'row' },
        h('button', { class: 'primary', disabled: !D.state.hasFilter || !chosen.size, onclick: async () => {
          const r = await call('designer:apply', { levels: D.levels, groups: D.groups, lockTier1: D.lock });
          toast(`Restyled ${r.count} tiers in ${r.categories} categories. Zone or reload the filter in game.`);
          D.state = await call('designer:state');
          draw();
        } }, `Apply to ${affected} tiers`),
        D.state.canUndo ? h('button', { onclick: async () => { await call('designer:undo'); toast('Put the previous looks back'); D.state = await call('designer:state'); draw(); } }, 'Undo last apply') : null,
        h('span', { class: 'spacer' }),
        name,
        h('button', { onclick: async () => { const t = await call('designer:saveTheme', { name: name.value.trim() || 'My design', levels: D.levels }); D.presetId = t.id; toast(`Saved "${t.name}"`); D.state = await call('designer:state'); persist(); draw(); } }, 'Save as theme'))));
}

window.renderDesigner = renderDesigner;
})();
