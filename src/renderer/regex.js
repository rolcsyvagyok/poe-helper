'use strict';
/* Regex: search strings to paste in the game's stash (or map device) search box. Categories on the
   left; for now "Map mods": skip maps with mods you can't run, keep ones with mods you like, and ask
   for quantity, pack size and the rest. The string is built in the main process (core/regex/maps.js). */
(() => {
  const { h, mount, toast, call } = window.UI;
  const R = { cat: 'maps', view: null, viewKey: '', filter: '', show: 'all' };

  const CATS = [
    { id: 'maps', name: 'Map mods', art: '*Map16', icon: 'map' }, // a tier 16 map's picture
    { id: 'items', name: 'Magic item mods', art: 'Orb of Alteration', icon: 'drop' },
    { id: 'beasts', name: 'Beasts', art: 'Bestiary Orb', icon: 'leaf' },
  ];
  // the category pictures come from poe.ninja's item art (web.poecdn.com), loaded once
  let artAsked = false;
  function loadArt() {
    if (artAsked) return;
    artAsked = true;
    call('art:icons', CATS.map((c) => c.art)).then((map) => {
      if (!map || !Object.keys(map).length) return;
      window.UI.setArt(map);
      document.querySelectorAll('#page-regex .rx-cat').forEach((b) => {
        const cat = CATS.find((c) => c.id === b.dataset.cat);
        if (cat) b.querySelector('.fb-cat-ic')?.replaceChildren(window.UI.icon(`art:${cat.art}`, { size: 26, fallback: cat.icon }));
      });
    }).catch(() => { artAsked = false; });
  }

  // influenced and blighted maps are skipped unless you say otherwise
  const SKIP_TYPES = { shaper: 'avoid', elder: 'avoid', conqueror: 'avoid', originator: 'avoid', blighted: 'avoid', ravaged: 'avoid' };
  const blank = () => ({ kind: 'regular', nightmare: false, avoid: [], want: [], numbers: {}, mapTypes: { ...SKIP_TYPES }, rarity: {}, corrupted: null, unidentified: null, custom: '' });
  // the search is always what you set up: every wanted mod and every number must be there
  const choices = () => ({ ...blank(), ...(S.settings?.regexMaps || {}), wantAll: true, numbersAny: false });

  let saveTimer = null;
  async function update(c, { redraw = false } = {}) {
    S.settings.regexMaps = c;
    clearTimeout(saveTimer);
    const r = await call('regex:mapBuild', c);
    drawOutput(r);
    if (redraw) renderRegexPage();
  }

  // ---------- the output bar ----------
  const out = { box: null, count: null, notes: null, parts: null, last: null };
  function drawOutput(r) {
    out.last = r;
    if (!out.box) return;
    out.box.textContent = r.regex || 'Pick mods or numbers below.';
    out.box.classList.toggle('empty', !r.regex);
    out.count.textContent = `${r.length} / ${r.max}`;
    out.count.className = 'rx-count' + (r.length > r.max ? ' over' : r.length > r.max * 0.85 ? ' near' : '');
    mount(out.notes, r.notes.map((n) => h('div', { class: 'small warn' }, n)));
    mount(out.parts, r.parts.map((p) => h('span', { class: 'rx-part', title: p.text }, h('b', {}, p.label), ' ', h('code', {}, p.text))));
  }
  async function copy() {
    const t = out.last?.regex;
    if (!t) return toast('Nothing to copy yet.', true);
    await call('clipboard:write', t);
    toast(out.last.length > out.last.max ? `Copied, but it's ${out.last.length} characters: the game cuts it at ${out.last.max}` : 'Copied. Paste it in the stash search with Ctrl+V');
  }

  // three-way choice: either / want / skip
  function tri(label, value, onPick, { want = 'Want', avoid = 'Skip' } = {}) {
    const opt = (v, text) => h('button', { type: 'button', class: 'rx-tri-b' + ((value || null) === v ? ' on' : '') + (v ? ` ${v}` : ''), 'aria-pressed': (value || null) === v ? 'true' : 'false', onclick: () => onPick(v) }, text);
    return h('div', { class: 'rx-tri', role: 'group', 'aria-label': label }, h('span', { class: 'rx-tri-l' }, label), opt(null, 'Either'), opt('want', want), opt('avoid', avoid));
  }
  const num = (label, value, onSet) => {
    const i = h('input', { type: 'number', min: 0, max: 999, value: value ?? '', placeholder: '–', 'aria-label': `${label}, at least` });
    i.addEventListener('input', () => onSet(i.value === '' ? null : Math.max(0, Math.min(999, Math.round(+i.value)))));
    return h('label', { class: 'rx-num' }, h('span', {}, label), h('span', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } }, i, h('span', { class: 'faint' }, '%+')));
  };

  async function renderMaps(main) {
    const c = choices();
    const key = `${c.kind}|${c.nightmare ? 1 : 0}`;
    if (R.viewKey !== key) { R.view = await call('regex:mapView', { kind: c.kind, nightmare: c.nightmare }); R.viewKey = key; }
    const v = R.view;
    const presets = (S.settings.regexPresets || []).filter((p) => p.kind === 'maps');

    out.box = h('code', { class: 'rx-out', tabindex: 0, title: 'Click to copy', onclick: copy });
    out.count = h('span', { class: 'rx-count' });
    out.notes = h('div', { class: 'stack', style: { gap: '2px' } });
    out.parts = h('div', { class: 'rx-parts' });

    // the saved search you loaded stays picked, so you can change it and save it again under its name
    if (R.preset && !presets.some((p) => p.name === R.preset)) R.preset = null;
    const presetSel = h('select', { 'aria-label': 'Saved searches', onchange: (e) => {
      const p = presets.find((x) => x.name === e.target.value);
      R.preset = p ? p.name : null;
      if (p) { update({ ...blank(), ...p.choices }, { redraw: true }); toast(`"${p.name}" loaded`); } else renderRegexPage();
    } }, h('option', { value: '' }, presets.length ? 'Saved searches…' : 'No saved searches yet'), presets.map((p) => h('option', { value: p.name, selected: R.preset === p.name }, p.name)));
    // the app's windows have no prompt() box, so a new name is typed in a field next to the button
    const nameIn = h('input', { placeholder: 'New name, e.g. Juicy T16 no reflect', style: { width: '220px' }, 'aria-label': 'Name for a new saved search', onkeydown: (e) => { if (e.key === 'Enter') saveNew(); } });
    const save = async (name) => {
      S.settings.regexPresets = await call('regex:savePreset', { name, kind: 'maps', choices: choices() });
      R.preset = name;
      renderRegexPage();
    };
    const saveNew = async () => {
      const name = nameIn.value.trim();
      if (!name) { nameIn.focus(); return toast('Type a name for the new search first.', true); }
      if (presets.some((p) => p.name === name) && !confirm(`"${name}" exists. Replace it with these choices?`)) return;
      await save(name);
      toast(`Saved as "${name}"`);
    };
    const updatePreset = async () => {
      if (!R.preset) return;
      await save(R.preset);
      toast(`"${R.preset}" updated`);
    };
    const delPreset = async () => {
      const name = R.preset;
      if (!name) return toast('Pick a saved search first.', true);
      if (!confirm(`Delete the saved search "${name}"?`)) return;
      S.settings.regexPresets = await call('regex:deletePreset', { name, kind: 'maps' });
      R.preset = null;
      renderRegexPage();
    };

    const set = (patch, redraw = false) => update({ ...choices(), ...patch }, { redraw });
    const setIn = (k, sub, val, redraw = false) => { const cur = choices(); set({ [k]: { ...(cur[k] || {}), [sub]: val } }, redraw); };

    // ---------- mods ----------
    // choices for mods this kind of map doesn't have are kept (for when you switch back) but not counted
    const listed = new Set(v.mods.map((m) => m.id));
    const avoid = new Set(c.avoid);
    const want = new Set(c.want);
    const stateOf = (id) => (avoid.has(id) ? 'avoid' : want.has(id) ? 'want' : null);
    const put = (id, s) => {
      avoid.delete(id); want.delete(id);
      if (s === 'avoid') avoid.add(id); else if (s === 'want') want.add(id);
    };
    const commit = () => set({ avoid: [...avoid], want: [...want] });
    const rows = new Map();
    const rowClass = (id) => 'rx-mod' + (stateOf(id) ? ` ${stateOf(id)}` : '');
    const redrawRow = (id) => { const el = rows.get(id); if (el) { el.className = rowClass(id); el.querySelector('.rx-mod-s').textContent = stateOf(id) === 'avoid' ? 'Skip' : stateOf(id) === 'want' ? 'Want' : ''; } drawCounts(); };
    const flip = (id, s) => { put(id, stateOf(id) === s ? null : s); redrawRow(id); commit(); };

    const q = R.filter.trim().toLowerCase();
    const shown = v.mods.filter((m) => (!q || m.lines.join(' ').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q))
      && (R.show === 'all' || stateOf(m.id) === R.show || (R.show === 'none' && !stateOf(m.id))));
    // favourites: only a place at the top of the list (they're not skipped or wanted by it)
    const favs = new Set(S.settings.regexFavMods || []);
    const toggleFav = async (id) => {
      if (favs.has(id)) favs.delete(id); else favs.add(id);
      S.settings.regexFavMods = [...favs];
      await call('settings:set', { regexFavMods: S.settings.regexFavMods }).catch(() => {});
      renderRegexPage();
    };
    const favShown = shown.filter((m) => favs.has(m.id));
    const restShown = shown.filter((m) => !favs.has(m.id));
    const modRow = (m) => {
      const star = h('button', { type: 'button', class: 'rx-star' + (favs.has(m.id) ? ' on' : ''), 'aria-pressed': favs.has(m.id) ? 'true' : 'false', title: favs.has(m.id) ? 'Remove from favourites' : 'Favourite: keep it at the top of the list', 'aria-label': 'Favourite', onclick: () => toggleFav(m.id) }, favs.has(m.id) ? '★' : '☆');
      const el = h('button', {
        type: 'button', class: rowClass(m.id),
        title: `Left click: skip maps with this mod. Right click: want it.${m.piece ? `\nSearch piece: "${m.piece}"` : '\nThis mod\'s text is part of another mod, so the search also matches that one.'}`,
        onclick: () => flip(m.id, 'avoid'),
        oncontextmenu: (e) => { e.preventDefault(); flip(m.id, 'want'); },
      },
      h('span', { class: 'rx-mod-t' }, m.lines.map((l) => h('span', {}, l.replace(/#/g, '#')))),
      h('span', { class: 'rx-mod-m' },
        m.nightmareOnly ? h('span', { class: 'rx-badge nm', title: 'Originator mod (Originator-influenced maps)' }, 'Orig') : null,
        h('span', { class: 'rx-mod-s' }, stateOf(m.id) === 'avoid' ? 'Skip' : stateOf(m.id) === 'want' ? 'Want' : '')));
      rows.set(m.id, el);
      return h('div', { class: 'rx-mod-row' }, star, el);
    };
    const counts = h('span', { class: 'small muted' });
    function drawCounts() { mount(counts, `${[...avoid].filter((id) => listed.has(id)).length} skipped · ${[...want].filter((id) => listed.has(id)).length} wanted`); }
    drawCounts();
    const search = h('input', { type: 'search', placeholder: 'Find a mod, e.g. reflect, curse, regenerate', value: R.filter, style: { flex: 1, minWidth: '220px' }, 'aria-label': 'Find a mod' });
    search.addEventListener('input', () => { R.filter = search.value; const pos = search.selectionStart; renderRegexPage().then(() => { const s = document.querySelector('#page-regex input[type=search]'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }); });
    const showSel = h('select', { 'aria-label': 'Show', onchange: (e) => { R.show = e.target.value; renderRegexPage(); } },
      [['all', 'All mods'], ['avoid', 'Skipped'], ['want', 'Wanted'], ['none', 'Not picked']].map(([val, l]) => h('option', { value: val, selected: R.show === val }, l)));

    // ---------- buy them: the same choices as a trade site search ----------
    const tr = { tier16: true, eightMods: false, ...(S.settings.regexTrade || {}) };
    const flag = (key, label, title, disabled) => h('button', {
      type: 'button', class: 'rx-flag' + (tr[key] && !disabled ? ' on' : ''), 'aria-pressed': tr[key] && !disabled ? 'true' : 'false', title, disabled,
      onclick: () => { S.settings.regexTrade = { ...tr, [key]: !tr[key] }; call('settings:set', { regexTrade: S.settings.regexTrade }).catch(() => {}); renderRegexPage(); },
    }, label);
    const tradeNote = h('div', { class: 'stack', style: { gap: '2px' } });
    const tradeBtn = h('button', { class: 'primary sm', onclick: async () => {
      tradeBtn.disabled = true;
      try {
        const r = await call('regex:mapTrade', { choices: choices(), tier16: !!tr.tier16, eightMods: !!tr.eightMods });
        toast(`${r.total} maps found. The trade site opened in your browser.`);
        mount(tradeNote, r.notes.map((n) => h('div', { class: 'small muted' }, n)));
      } catch { /* toast shown */ } finally { tradeBtn.disabled = false; }
    } }, 'Search the trade site');
    const tradeBox = h('div', { class: 'panel rx-trade' },
      h('div', { class: 'row', style: { gap: '10px' } },
        h('b', {}, 'Buy maps like these'),
        c.kind === 't17' ? h('span', { class: 'rx-flag on', title: 'Nightmare maps are tier 17 on the trade site' }, 'Nightmare (tier 17)') : flag('tier16', 'Tier 16', 'Only tier 16 maps (off: any tier)'),
        flag('eightMods', '8 mods', 'Only maps with 8 mods (fully rolled). The trade site counts mods; the stash search can\'t, so this is for the trade search only'),
        tradeBtn,
        h('span', { class: 'small faint' }, `${({ securable: 'Instant buyout', online: 'Sellers online', onlineleague: 'Sellers online in the league', any: 'Every listing' })[S.settings.tradeStatus || 'securable'] || 'Instant buyout'}, cheapest first. Uses your skipped and wanted mods, ${c.kind === 't17' ? '' : 'map type, '}item quantity, item rarity, pack size, more maps / currency / scarabs / divination cards, ${c.kind === 't17' ? '' : 'the map\'s rarity, '}corrupted and identified.`)),
      tradeNote);

    mount(main,
      h('div', { class: 'panel rx-outbar' },
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'nowrap', alignItems: 'stretch' } },
          out.box,
          h('div', { class: 'stack', style: { gap: '6px', alignItems: 'flex-end' } }, h('button', { class: 'primary', onclick: copy }, 'Copy'), out.count)),
        out.parts, out.notes,
        h('div', { class: 'row small', style: { gap: '8px', marginTop: '4px' } },
          presetSel,
          R.preset ? h('button', { class: 'sm primary', title: `Save the choices on this page into "${R.preset}"`, onclick: updatePreset }, `Update "${R.preset}"`) : null,
          R.preset ? h('button', { class: 'sm quiet', onclick: delPreset }, 'Delete') : null,
          h('span', { class: 'faint' }, '·'), nameIn, h('button', { class: 'sm', onclick: saveNew }, 'Save as new'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'sm quiet', onclick: () => { if (confirm('Clear every choice on this page?')) update({ ...blank(), kind: c.kind, nightmare: c.nightmare }, { redraw: true }); } }, 'Clear all'))),

      tradeBox,
      h('div', { class: 'panel rx-opts' },
        h('div', { class: 'row', style: { gap: '14px' } },
          h('div', { class: 'rx-seg', role: 'radiogroup', 'aria-label': 'Maps' },
            [['regular', 'Regular maps'], ['t17', 'Nightmare maps']].map(([val, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': c.kind === val ? 'true' : 'false', class: c.kind === val ? 'on' : '', onclick: () => set({ kind: val }, true) }, l))),
          c.kind === 'regular' ? toggle(!!c.nightmare, (val) => set({ nightmare: val }, true), 'Show Originator mods') : null,
          h('span', { class: 'small faint' }, 'The search only knows the mods of the maps you pick here, so the pieces stay short.')),
        h('div', { class: 'rx-grid' },
          h('div', { class: 'rx-box' }, h('div', { class: 'rx-box-h' }, h('b', {}, 'Numbers'), h('span', { class: 'small faint' }, 'at least')),
            h('div', { class: 'rx-nums' }, v.numbers.map((n) => num(n.label, c.numbers?.[n.id], (val) => setIn('numbers', n.id, val))))),
          h('div', { class: 'rx-box' }, h('div', { class: 'rx-box-h' }, h('b', {}, 'Map')),
            c.kind === 't17' ? null : h('div', { class: 'small faint' }, 'Map types are for the trade search; the map stash already keeps them apart.'),
            // nightmare maps are always rare and never influenced: only corrupted and identified apply
            c.kind === 't17' ? null : v.mapTypes.map((t) => tri(t.label, c.mapTypes?.[t.id], (val) => setIn('mapTypes', t.id, val, true))),
            c.kind === 't17' ? null : h('div', { class: 'rx-sep', role: 'separator' }),
            c.kind === 't17' ? null : ['normal', 'magic', 'rare'].map((r) => tri(r[0].toUpperCase() + r.slice(1), c.rarity?.[r], (val) => setIn('rarity', r, val, true))),
            tri('Corrupted', c.corrupted, (val) => set({ corrupted: val }, true)),
            tri('Unidentified', c.unidentified, (val) => set({ unidentified: val }, true))),
        ),
        h('div', { class: 'row small', style: { gap: '10px' } },
          h('label', { class: 'row', style: { gap: '6px', flex: 1 } }, 'Your own text', (() => { const i = h('input', { value: c.custom || '', placeholder: 'added as it is, e.g. "!delirium"', style: { flex: 1 } }); i.addEventListener('input', () => set({ custom: i.value })); return i; })()))),

      h('div', { class: 'row', style: { gap: '10px', margin: '14px 0 8px' } },
        h('h2', { style: { margin: 0 } }, 'Map mods'), counts,
        h('span', { class: 'small faint' }, 'Left click: skip maps with it. Right click: want it. Click again to undo.'),
        h('span', { class: 'spacer' }), search, showSel),
      favShown.length ? h('div', { class: 'rx-list-h' }, `Favourites (${favShown.length})`) : null,
      favShown.length ? h('div', { class: 'rx-list' }, favShown.map(modRow)) : null,
      favShown.length && restShown.length ? h('div', { class: 'rx-list-h' }, 'All the others') : null,
      restShown.length ? h('div', { class: 'rx-list' }, restShown.map(modRow)) : (favShown.length ? null : h('div', { class: 'panel small muted' }, 'No mod matches that.')));

    drawOutput(await call('regex:mapBuild', c));
  }

  // ---------- item mods: magic items by their mod names ("Searing … of Success"), for rolling with alterations ----------
  const itemDefaults = { type: '', variant: null, picks: {} };
  const itemChoices = () => { const c = { ...itemDefaults, ...(S.settings?.regexItems || {}) }; if (c.picks && Object.values(c.picks).some((v) => !Array.isArray(v))) c.picks = {}; return c; };
  async function setItems(patch, redraw = true) {
    S.settings.regexItems = { ...itemChoices(), ...patch };
    R.itemOut = await call('regex:itemBuild', S.settings.regexItems);
    if (redraw) renderRegexPage(); else drawItemOut();
  }
  const io = { box: null, count: null, parts: null, notes: null };
  function drawItemOut() {
    const r = R.itemOut;
    if (!r || !io.box) return;
    io.box.textContent = r.regex || 'Tick the mods you want below.';
    io.box.classList.toggle('empty', !r.regex);
    io.count.textContent = `${r.length} / ${r.max}`;
    io.count.className = 'rx-count' + (r.length > r.max ? ' over' : r.length > r.max * 0.85 ? ' near' : '');
    mount(io.parts, r.parts.map((p) => h('span', { class: 'rx-part', title: p.names.join(', ') }, h('b', {}, p.label), ' ', h('code', {}, p.text))));
    mount(io.notes, r.notes.map((n) => h('div', { class: 'small warn' }, n)));
  }
  async function renderItems(main) {
    if (!R.itemTypes) R.itemTypes = await call('regex:itemBases');
    const c = itemChoices();
    const type = R.itemTypes.find((t) => t.id === c.type) || null;
    const variant = type?.variants ? (type.variants.find((v) => v.id === c.variant) || type.variants[0]) : null;
    const viewKey = JSON.stringify([c.type, variant?.id || null]);
    if (type && R.itemViewKey !== viewKey) { R.itemView = await call('regex:itemView', { type: c.type, variant: variant?.id || null }); R.itemViewKey = viewKey; R.itemOut = null; }
    const v = type ? R.itemView : null;
    if (!R.itemOut) R.itemOut = await call('regex:itemBuild', c);
    const presets = (S.settings.regexPresets || []).filter((p) => p.kind === 'items');

    const typeSel = h('select', { 'aria-label': 'Item type', onchange: (e) => setItems({ type: e.target.value, variant: null, picks: {} }) },
      h('option', { value: '' }, 'Pick an item type…'), R.itemTypes.map((t) => h('option', { value: t.id, selected: t.id === c.type }, t.name)));
    const varSel = type?.variants ? h('select', { 'aria-label': type.variants[0].id.endsWith('_armour') ? 'Defence' : 'Base', onchange: (e) => setItems({ variant: e.target.value, picks: {} }) },
      type.variants.map((x) => h('option', { value: x.id, selected: x.id === variant.id }, x.name))) : null;

    io.box = h('code', { class: 'rx-out', tabindex: 0, title: 'Click to copy', onclick: () => copyItem() });
    io.count = h('span', { class: 'rx-count' });
    io.parts = h('div', { class: 'rx-parts' });
    io.notes = h('div', { class: 'stack', style: { gap: '2px' } });
    const copyItem = async () => {
      const t = R.itemOut?.regex;
      if (!t) return toast('Nothing to copy yet.', true);
      await call('clipboard:write', t);
      toast('Copied. Paste it in the stash search: the item lights up when it rolls what you ticked');
    };

    // saved searches (favourites), like the map ones
    if (R.itemPreset && !presets.some((p) => p.name === R.itemPreset)) R.itemPreset = null;
    const presetSel = h('select', { 'aria-label': 'Saved searches', onchange: (e) => {
      const p = presets.find((x) => x.name === e.target.value);
      R.itemPreset = p ? p.name : null;
      if (p) { setItems({ ...itemDefaults, ...p.choices }); toast(`"${p.name}" loaded`); } else renderRegexPage();
    } }, h('option', { value: '' }, presets.length ? 'Saved searches…' : 'No saved searches yet'), presets.map((p) => h('option', { value: p.name, selected: R.itemPreset === p.name }, p.name)));
    const nameIn = h('input', { placeholder: 'New name, e.g. Spell wand T1', style: { width: '200px' }, 'aria-label': 'Name for a new saved search', onkeydown: (e) => { if (e.key === 'Enter') saveNew(); } });
    const save = async (name) => { S.settings.regexPresets = await call('regex:savePreset', { name, kind: 'items', choices: itemChoices() }); R.itemPreset = name; renderRegexPage(); };
    const saveNew = async () => {
      const name = nameIn.value.trim();
      if (!name) { nameIn.focus(); return toast('Type a name for the new search first.', true); }
      if (presets.some((p) => p.name === name) && !confirm(`"${name}" exists. Replace it with these choices?`)) return;
      await save(name); toast(`Saved as "${name}"`);
    };
    const delPreset = async () => {
      const name = R.itemPreset;
      if (!name || !confirm(`Delete the saved search "${name}"?`)) return;
      S.settings.regexPresets = await call('regex:deletePreset', { name, kind: 'items' });
      R.itemPreset = null; renderRegexPage();
    };

    const picks = c.picks || {};
    const q = (R.itemFilter || '').trim().toLowerCase();
    const flipTier = (f, tier) => {
      const cur = new Set(picks[f.key] || []);
      if (cur.has(tier)) cur.delete(tier); else cur.add(tier);
      const np = { ...picks };
      if (cur.size) np[f.key] = [...cur].sort(); else delete np[f.key];
      setItems({ picks: np });
    };
    const famRow = (f) => {
      const on = new Set(picks[f.key] || []);
      return h('div', { class: 'rx-mod rx-imod' + (on.size ? ' want' : '') },
        h('span', { class: 'rx-mod-t' }, f.text.map((l) => h('span', {}, l))),
        h('span', { class: 'rx-tiers' }, f.tiers.map((t) => h('label', { class: 'rx-tick' + (on.has(t.tier) ? ' on' : ''), title: `${t.name}: ${t.text} · level ${t.lvl}` },
          h('input', { type: 'checkbox', checked: on.has(t.tier), onchange: () => flipTier(f, t.tier) }),
          h('b', {}, `T${t.tier}`), h('span', { class: 'rx-tick-n' }, t.name)))));
    };
    const shown = (v?.families || []).filter((f) => !q || f.text.join(' ').toLowerCase().includes(q) || f.tiers.some((t) => (t.name || '').toLowerCase().includes(q)));
    const col = (aff, title) => { const l = shown.filter((f) => f.aff === aff); return h('div', { class: 'rx-col' }, h('div', { class: 'rx-col-h' }, `${title} (${l.length})`), l.map(famRow)); };
    const search = h('input', { type: 'search', placeholder: 'Find a mod or a name, e.g. life, Searing', value: R.itemFilter || '', style: { flex: 1, minWidth: '220px' }, 'aria-label': 'Find a mod' });
    search.addEventListener('input', () => { R.itemFilter = search.value; const pos = search.selectionStart; renderRegexPage().then(() => { const s = document.querySelector('#page-regex input[type=search]'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }); });

    mount(main,
      h('div', { class: 'panel rx-outbar' },
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'nowrap', alignItems: 'stretch' } }, io.box,
          h('div', { class: 'stack', style: { gap: '6px', alignItems: 'flex-end' } }, h('button', { class: 'primary', onclick: copyItem }, 'Copy'), io.count)),
        io.parts, io.notes,
        h('div', { class: 'row small', style: { gap: '8px', marginTop: '4px' } },
          presetSel,
          R.itemPreset ? h('button', { class: 'sm primary', onclick: async () => { await save(R.itemPreset); toast(`"${R.itemPreset}" updated`); } }, `Update "${R.itemPreset}"`) : null,
          R.itemPreset ? h('button', { class: 'sm quiet', onclick: delPreset }, 'Delete') : null,
          h('span', { class: 'faint' }, '·'), nameIn, h('button', { class: 'sm', onclick: saveNew }, 'Save as new'),
          h('span', { class: 'spacer' }),
          Object.keys(picks).length ? h('button', { class: 'sm quiet', onclick: () => setItems({ picks: {} }) }, 'Clear mods') : null)),
      h('div', { class: 'panel rx-opts' },
        h('div', { class: 'row', style: { gap: '12px' } }, typeSel, varSel,
          v ? h('span', { class: 'small faint' }, `Mods of ${type.name.toLowerCase()}${variant && type.variants[0].id.endsWith('_armour') ? ` (${variant.name.toLowerCase()})` : ''}, like ${v.base}.`) : null),
        h('div', { class: 'small faint' }, 'For magic items: a magic item\'s name has its mods\' names in it ("Searing Goat\'s Horn of Success"), so the search looks for those. Tick the tiers of each mod you want (T1 to T4); the item must have every mod you tick.')),
      v ? h('div', { class: 'row', style: { gap: '10px', margin: '14px 0 8px' } },
        h('h2', { style: { margin: 0 } }, 'Mods'),
        h('span', { class: 'small muted' }, `${Object.keys(picks).length} ticked`),
        h('span', { class: 'spacer' }), search) : h('div', { class: 'panel small muted', style: { marginTop: '14px' } }, 'Pick an item type to see its mods.'),
      v ? h('div', { class: 'rx-cols' }, col('prefix', 'Prefixes'), col('suffix', 'Suffixes')) : null);
    drawItemOut();
  }

  // ---------- beasts: which captured beasts to find in the Bestiary or the stash ----------
  const beastDefaults = { harvest: true, minChaos: 10, maxChaos: null, family: '', group: '', skip: [], pick: [] };
  const beastChoices = () => ({ ...beastDefaults, ...(S.settings?.regexBeasts || {}) });
  async function setBeasts(patch) {
    S.settings.regexBeasts = { ...beastChoices(), ...patch };
    R.beastOut = await call('regex:beastBuild', S.settings.regexBeasts);
    renderRegexPage();
  }
  async function renderBeasts(main) {
    if (!R.beastView || Date.now() - (R.beastAt || 0) > 15 * 60 * 1000) {
      mount(main, h('div', { class: 'panel small muted' }, 'Loading beast prices from poe.ninja…'));
      R.beastView = await call('regex:beastView');
      R.beastAt = Date.now();
      R.beastOut = null;
    }
    const v = R.beastView;
    const c = beastChoices();
    if (!R.beastOut) R.beastOut = await call('regex:beastBuild', c);
    const o = R.beastOut;
    const inSearch = new Set(o.chosen);
    const skip = new Set(c.skip || []);
    const pick = new Set(c.pick || []);

    const copyStr = async (s, i) => {
      await call('clipboard:write', s.text);
      toast(o.strings.length > 1 ? `Copied search ${i + 1} of ${o.strings.length}. Paste it with Ctrl+V` : 'Copied. Paste it in the Bestiary or stash search with Ctrl+V');
    };
    const outs = o.strings.length
      ? o.strings.map((s, i) => h('div', { class: 'row', style: { gap: '10px', flexWrap: 'nowrap', alignItems: 'stretch' } },
        h('code', { class: 'rx-out', tabindex: 0, title: 'Click to copy', onclick: () => copyStr(s, i) }, s.text),
        h('div', { class: 'stack', style: { gap: '6px', alignItems: 'flex-end' } },
          h('button', { class: 'primary', onclick: () => copyStr(s, i) }, o.strings.length > 1 ? `Copy ${i + 1}` : 'Copy'),
          h('span', { class: 'rx-count' }, `${s.text.length} / ${o.max} · ${s.count} beasts`))))
      : [h('code', { class: 'rx-out empty' }, 'No beast fits these choices.')];

    const num = (label, key) => {
      const i = h('input', { type: 'number', min: 0, max: 99999, value: c[key] ?? '', placeholder: '–', style: { width: '72px' }, 'aria-label': label });
      i.addEventListener('change', () => setBeasts({ [key]: i.value === '' ? null : Math.max(0, Number(i.value)) }));
      return h('label', { class: 'row', style: { gap: '6px' } }, label, i, h('span', { class: 'faint' }, 'c'));
    };
    const sel = (label, key, list) => h('select', { 'aria-label': label, onchange: (e) => setBeasts({ [key]: e.target.value }) },
      h('option', { value: '' }, `Every ${label.toLowerCase()}`), list.map((x) => h('option', { value: x, selected: c[key] === x }, x)));

    const q = (R.beastFilter || '').trim().toLowerCase();
    const shown = v.beasts.filter((b) => !q || `${b.name} ${b.family} ${b.group} ${b.recipe}`.toLowerCase().includes(q))
      .filter((b) => R.beastShow !== 'in' || inSearch.has(b.name));
    const flip = (b) => {
      const sk = new Set(skip); const pk = new Set(pick);
      if (inSearch.has(b.name)) { if (pk.has(b.name)) pk.delete(b.name); else sk.add(b.name); }
      else if (sk.has(b.name)) sk.delete(b.name);
      else pk.add(b.name);
      setBeasts({ skip: [...sk], pick: [...pk] });
    };
    const row = (b) => h('button', {
      type: 'button', class: 'rx-beast' + (inSearch.has(b.name) ? ' on' : '') + (skip.has(b.name) ? ' off' : ''),
      title: `${inSearch.has(b.name) ? 'In the search. Click to leave it out.' : skip.has(b.name) ? 'Left out by you. Click to let your choices decide again.' : 'Click to add it to the search.'}\nSearch piece: ${b.piece}${b.recipe ? `\n\n${b.recipe.split('; ').join('\n')}` : ''}`,
      onclick: () => flip(b),
    },
    h('span', { class: 'rx-beast-n red' }, b.name, b.harvest ? h('span', { class: 'rx-badge', title: 'Harvest beast' }, 'Harvest') : null),
    h('span', { class: 'small faint rx-beast-f' }, `${b.family} · ${b.group}`),
    h('code', { class: 'rx-beast-p' }, b.piece),
    h('span', { class: 'rx-beast-c' }, b.chaos != null ? `${b.chaos}c` : '–'),
    h('span', { class: 'rx-mod-s' }, pick.has(b.name) ? 'Added' : skip.has(b.name) ? 'Left out' : inSearch.has(b.name) ? 'In' : ''));

    const search = h('input', { type: 'search', placeholder: 'Find a beast, family or recipe, e.g. Fenumal, imprint', value: R.beastFilter || '', style: { flex: 1, minWidth: '240px' }, 'aria-label': 'Find a beast' });
    search.addEventListener('input', () => { R.beastFilter = search.value; const pos = search.selectionStart; renderRegexPage().then(() => { const s = document.querySelector('#page-regex input[type=search]'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } }); });

    mount(main,
      h('div', { class: 'panel rx-outbar' }, outs,
        h('div', { class: 'small muted' }, `${o.count} beasts, most valuable first.${o.strings.length > 1 ? ' They don\'t fit in one search, so copy them one after another.' : ''} Works in the Bestiary's captured beasts and on itemised beasts in your stash.`),
        v.note ? h('div', { class: 'small warn' }, v.note) : null),
      h('div', { class: 'panel rx-opts' },
        h('div', { class: 'row', style: { gap: '16px' } },
          toggle(!!c.harvest, (val) => setBeasts({ harvest: val }), 'Harvest beasts')),
        h('div', { class: 'row', style: { gap: '16px' } },
          num('Worth at least', 'minChaos'), num('at most', 'maxChaos'),
          sel('Family', 'family', v.families), sel('Group', 'group', v.groups),
          h('span', { class: 'spacer' }),
          (skip.size || pick.size) ? h('button', { class: 'sm quiet', onclick: () => setBeasts({ skip: [], pick: [] }) }, `Undo ${skip.size + pick.size} hand pick${skip.size + pick.size === 1 ? '' : 's'}`) : null,
          h('button', { class: 'sm quiet', onclick: () => { if (confirm('Go back to the default beast choices?')) setBeasts({ ...beastDefaults }); } }, 'Reset')),
        h('div', { class: 'small faint' }, v.priced ? 'Prices from poe.ninja. A price limit leaves out beasts with 5 or fewer listings (price fixing) and beasts without a price.' : 'No prices yet, so price limits leave every beast out; empty them to search by family or group.')),
      h('div', { class: 'row', style: { gap: '10px', margin: '14px 0 8px' } },
        h('h2', { style: { margin: 0 } }, 'Beasts'),
        h('span', { class: 'small faint' }, 'Click a beast to add it or leave it out, whatever the choices above say.'),
        h('span', { class: 'spacer' }), search,
        h('select', { 'aria-label': 'Show', onchange: (e) => { R.beastShow = e.target.value; renderRegexPage(); } },
          [['all', 'All beasts'], ['in', 'In the search']].map(([val, l]) => h('option', { value: val, selected: (R.beastShow || 'all') === val }, l)))),
      shown.length ? h('div', { class: 'rx-beasts' }, shown.map(row)) : h('div', { class: 'panel small muted' }, 'No beast matches that.'));
  }

  async function renderRegexPageNow() {
    loadArt();
    const el = document.getElementById('page-regex');
    const main = h('div', { class: 'rx-main' });
    const nav = h('aside', { class: 'rx-nav' }, CATS.map((cat) => h('button', { class: 'fb-cat-main rx-cat' + (R.cat === cat.id ? ' current' : ''), 'data-cat': cat.id, onclick: () => { R.cat = cat.id; renderRegexPage(); } },
      h('span', { class: 'fb-cat-ic' }, window.UI.icon(`art:${cat.art}`, { size: 26, fallback: cat.icon })), h('span', { class: 'n' }, cat.name))));
    if (R.cat === 'maps') await renderMaps(main);
    else if (R.cat === 'beasts') await renderBeasts(main);
    else if (R.cat === 'items') await renderItems(main);
    mount(el,
      pageHead('Regex', 'Search strings for the game\'s search boxes (stash, map device, vendors). Pick what you want, copy, and paste it in game with Ctrl+V.'),
      h('div', { class: 'rx' }, nav, main));
  }
  function renderRegexPage() { return window.UI.keepScroll(() => renderRegexPageNow()); }

  window.RegexView = { renderRegexPage };
})();
