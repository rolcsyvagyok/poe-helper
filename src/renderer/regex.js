'use strict';
/* Regex: search strings to paste in the game's stash (or map device) search box. Categories on the
   left; for now "Map mods": skip maps with mods you can't run, keep ones with mods you like, and ask
   for quantity, pack size and the rest. The string is built in the main process (core/regex/maps.js). */
(() => {
  const { h, mount, toast, call } = window.UI;
  const R = { cat: 'maps', view: null, viewKey: '', filter: '', show: 'all' };

  const CATS = [
    { id: 'maps', name: 'Map mods', art: '*Map16', icon: 'map' }, // a tier 16 map's picture
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

  const blank = () => ({ kind: 'regular', nightmare: false, avoid: [], want: [], wantAll: false, numbers: {}, numbersAny: false, quality: {}, qualityAny: false, mapTypes: {}, rarity: {}, corrupted: null, unidentified: null, custom: '' });
  const choices = () => ({ ...blank(), ...(S.settings?.regexMaps || {}) });

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
    const modRow = (m) => {
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
      return el;
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
          h('div', { class: 'rx-box' }, h('div', { class: 'rx-box-h' }, h('b', {}, 'Numbers'), h('div', { class: 'rx-seg', role: 'radiogroup', 'aria-label': 'The map must reach' }, [[false, 'Reach all'], [true, 'Any one']].map(([val, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': !!c.numbersAny === val ? 'true' : 'false', class: !!c.numbersAny === val ? 'on' : '', title: val ? 'Reaching any one of these minimums is enough' : 'The map must reach every minimum you fill in', onclick: () => set({ numbersAny: val }, true) }, l)))),
            h('div', { class: 'rx-nums' }, v.numbers.map((n) => num(n.label, c.numbers?.[n.id], (val) => setIn('numbers', n.id, val))))),
          h('div', { class: 'rx-box' }, h('div', { class: 'rx-box-h' }, h('b', {}, 'Map')),
            // nightmare maps are always rare and never influenced: only corrupted and identified apply
            c.kind === 't17' ? null : v.mapTypes.map((t) => tri(t.label, c.mapTypes?.[t.id], (val) => setIn('mapTypes', t.id, val, true))),
            c.kind === 't17' ? null : ['normal', 'magic', 'rare'].map((r) => tri(r[0].toUpperCase() + r.slice(1), c.rarity?.[r], (val) => setIn('rarity', r, val, true))),
            tri('Corrupted', c.corrupted, (val) => set({ corrupted: val }, true)),
            tri('Unidentified', c.unidentified, (val) => set({ unidentified: val }, true))),
        ),
        h('div', { class: 'row small', style: { gap: '10px' } },
          h('span', { class: 'muted' }, 'Wanted mods:'),
          h('div', { class: 'rx-seg' }, [[false, 'Any one of them'], [true, 'All of them']].map(([val, l]) => h('button', { type: 'button', class: !!c.wantAll === val ? 'on' : '', onclick: () => set({ wantAll: val }, true) }, l))),
          h('label', { class: 'row', style: { gap: '6px', flex: 1 } }, 'Your own text', (() => { const i = h('input', { value: c.custom || '', placeholder: 'added as it is, e.g. "!delirium"', style: { flex: 1 } }); i.addEventListener('input', () => set({ custom: i.value })); return i; })()))),

      h('div', { class: 'row', style: { gap: '10px', margin: '14px 0 8px' } },
        h('h2', { style: { margin: 0 } }, 'Map mods'), counts,
        h('span', { class: 'small faint' }, 'Left click: skip maps with it. Right click: want it. Click again to undo.'),
        h('span', { class: 'spacer' }), search, showSel),
      shown.length ? h('div', { class: 'rx-list' }, shown.map(modRow)) : h('div', { class: 'panel small muted' }, 'No mod matches that.'));

    drawOutput(await call('regex:mapBuild', c));
  }

  async function renderRegexPageNow() {
    loadArt();
    const el = document.getElementById('page-regex');
    const main = h('div', { class: 'rx-main' });
    const nav = h('aside', { class: 'rx-nav' }, CATS.map((cat) => h('button', { class: 'fb-cat-main rx-cat' + (R.cat === cat.id ? ' current' : ''), 'data-cat': cat.id, onclick: () => { R.cat = cat.id; renderRegexPage(); } },
      h('span', { class: 'fb-cat-ic' }, window.UI.icon(`art:${cat.art}`, { size: 26, fallback: cat.icon })), h('span', { class: 'n' }, cat.name))));
    if (R.cat === 'maps') await renderMaps(main);
    mount(el,
      pageHead('Regex', 'Search strings for the game\'s search boxes (stash, map device, vendors). Pick what you want, copy, and paste it in game with Ctrl+V.'),
      h('div', { class: 'rx' }, nav, main));
  }
  function renderRegexPage() { return window.UI.keepScroll(() => renderRegexPageNow()); }

  window.RegexView = { renderRegexPage };
})();
