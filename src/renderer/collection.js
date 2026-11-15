'use strict';
/* My collection: every unique that drops, with its picture. Click one to mark that you have it.
   When you have every unique on a base and none is worth much, your filter hides that base
   (the same list as the price check's "My collection"). */
(function () {
  const { h, mount, toast, call } = window.UI;
  const C = { show: 'all', q: '', sort: 'group', data: null, open: {} };

  const fmt = (c) => (c >= 100 ? `${Math.round(c)}c` : c >= 10 ? `${Math.round(c)}c` : `${Math.round(c * 10) / 10}c`);

  async function render() {
    const el = document.getElementById('page-collection');
    if (!C.data) mount(el, h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Loading the uniques from poe.ninja'));
    try { C.data = await call('collection:list'); } catch { mount(el, h('div', { class: 'panel' }, 'Could not load the uniques. Check your connection and try again.')); return; }
    draw();
  }

  async function toggle(u) {
    const r = await call('collection:set', { name: u.name, have: !u.have });
    u.have = !u.have;
    const hidden = new Set(r.hidden || []);
    for (const x of C.data.uniques) x.hiddenBase = hidden.has(x.base);
    C.data.hiddenBases = r.hidden || [];
    draw();
  }

  function draw() {
    const el = document.getElementById('page-collection');
    const d = C.data;
    const all = d.uniques;
    const have = all.filter((u) => u.have).length;
    const q = C.q.trim().toLowerCase();
    const list = all.filter((u) => (C.show === 'all' || (C.show === 'have' ? u.have : !u.have)) && (!q || u.name.toLowerCase().includes(q) || u.base.toLowerCase().includes(q)));
    const groups = new Map();
    for (const u of list) { if (!groups.has(u.group)) groups.set(u.group, []); groups.get(u.group).push(u); }
    const sorter = C.sort === 'price' ? (a, b) => b.chaos - a.chaos : C.sort === 'base' ? (a, b) => a.base.localeCompare(b.base) || a.name.localeCompare(b.name) : (a, b) => a.name.localeCompare(b.name);
    const seg = (key, opts) => h('div', { class: 'fb-vis', role: 'group' }, opts.map(([v, l]) => h('button', { class: C[key] === v ? 'on' : '', 'aria-pressed': C[key] === v ? 'true' : 'false', onclick: () => { C[key] = v; draw(); } }, l)));
    const search = h('input', { type: 'search', placeholder: 'Find a unique or base', value: C.q, style: { width: '240px' } });
    search.addEventListener('input', () => { C.q = search.value; clearTimeout(C.t); C.t = setTimeout(() => { draw(); const s = document.querySelector('#page-collection input[type=search]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 200); });
    const max = h('input', { type: 'number', min: 0, step: 1, value: d.max, style: { width: '64px' }, 'aria-label': 'Hide a fully collected base when every unique on it is worth at most' });
    max.addEventListener('change', async () => { const r = await call('collection:set', { max: max.value }); d.max = r.max; const hid = new Set(r.hidden); for (const x of all) x.hiddenBase = hid.has(x.base); d.hiddenBases = r.hidden; toast(`${r.hidden.length} collected bases hidden`); draw(); });
    const pct = all.length ? Math.round((have / all.length) * 100) : 0;

    const card = (u) => h('button', { class: 'col-card' + (u.have ? ' have' : ''), 'aria-pressed': u.have ? 'true' : 'false', title: `${u.name} (${u.base})\n${fmt(u.chaos)} on poe.ninja\n${u.have ? 'You have it. Click if you don\'t.' : 'Click when you have it.'}${u.hiddenBase ? `\nEvery unique on ${u.base} is collected and cheap: hidden in your filter.` : ''}`, onclick: () => toggle(u) },
      h('span', { class: 'col-check', 'aria-hidden': 'true' }, u.have ? '☑' : '☐'),
      h('span', { class: 'col-pic' }, u.icon ? h('img', { src: u.icon, alt: '', loading: 'lazy' }) : null, u.have ? h('span', { class: 'col-tick', 'aria-hidden': 'true' }, '✓') : null),
      h('span', { class: 'col-name' }, u.name),
      h('span', { class: 'col-base' }, u.base, u.hiddenBase ? h('span', { class: 'col-hid', title: 'Hidden in your filter' }, ' · hidden') : null),
      h('span', { class: 'col-price' }, fmt(u.chaos)));

    mount(el,
      window.pageHead ? window.pageHead('My collection', 'Every unique that drops. Click the ones you have. When you have every unique on a base and none is worth much, your filter hides that base (Foulborn and Replica ones still show).') : h('h1', {}, 'My collection'),
      h('div', { class: 'panel col-top' },
        h('div', { class: 'col-progress' }, h('b', {}, `${have} of ${all.length}`), h('span', { class: 'muted' }, ` uniques (${pct}%)`),
          h('div', { class: 'col-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: { width: `${pct}%` } }))),
        h('div', { class: 'row small', style: { gap: '10px', flexWrap: 'wrap' } },
          seg('show', [['all', 'All'], ['missing', 'Missing'], ['have', 'Have']]),
          h('span', { class: 'muted' }, 'Sort'), seg('sort', [['group', 'Name'], ['base', 'Base'], ['price', 'Price']]),
          search,
          h('span', { class: 'spacer' }),
          h('label', { class: 'check', title: 'A base where you have every unique and none is worth more than the limit is hidden in your filter' },
            h('input', { type: 'checkbox', checked: d.on, onchange: async (e) => { const r = await call('collection:set', { on: e.target.checked }); d.on = r.on; const hid = new Set(r.hidden); for (const x of all) x.hiddenBase = hid.has(x.base); d.hiddenBases = r.hidden; toast(r.on ? `Collected cheap bases are removed from your filter (${r.hidden.length})` : 'Collected bases show again'); draw(); } }),
            h('b', {}, 'Remove not valuable from loot filter')),
          d.on ? [h('span', {}, 'when every unique on the base is worth at most'), max, h('span', {}, 'c')] : null,
          !d.on ? null : h('span', { class: 'faint', title: d.hiddenBases.join('\n') }, d.hiddenBases.length ? `${d.hiddenBases.length} base${d.hiddenBases.length === 1 ? '' : 's'} hidden` : 'none hidden yet'))),
      list.length ? [...groups].map(([g, us]) => {
        const got = all.filter((u) => u.group === g && u.have).length;
        const tot = all.filter((u) => u.group === g).length;
        const LIMIT = 120;
        const open = C.open[g] || !!q;
        const shown = us.sort(sorter);
        return h('section', { class: 'section' },
          h('div', { class: 'section-head' }, h('h2', {}, g), h('span', { class: 'muted small' }, `${got} of ${tot}`)),
          h('div', { class: 'col-grid' }, (open ? shown : shown.slice(0, LIMIT)).map(card)),
          !open && shown.length > LIMIT ? h('button', { class: 'quiet sm', style: { marginTop: '8px' }, onclick: () => { C.open[g] = true; draw(); } }, `Show all ${shown.length}`) : null);
      }) : h('div', { class: 'panel empty' }, C.show === 'have' ? 'Nothing ticked yet. Click a unique when you have it.' : 'No unique matches.'));
  }

  window.CollectionView = { render };
})();
