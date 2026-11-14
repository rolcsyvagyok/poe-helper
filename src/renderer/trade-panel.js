/* Trade search panel: every mod on the item with a tick box and min/max, the item's properties,
   and the search itself. Used by the in-game popup and by the app's Price check page.
   Only "Search" talks to GGG (1 search + 1 listings request). */
(() => {
'use strict';
const { h, mount, chaosDiv, toast, call } = window.UI;

const GROUPS = [
  ['pseudo', 'Totals'],
  ['enchant', 'Enchant'],
  ['implicit', 'Implicit'],
  ['fractured', 'Fractured'],
  ['explicit', 'Explicit'],
  ['crafted', 'Crafted'],
  ['scourge', 'Scourge'],
  ['crucible', 'Crucible'],
];
const STATUSES = [['securable', 'Instant buyout'], ['available', 'Instant buyout + in person'], ['online', 'In person, online'], ['any', 'Any']];

// "3m", "2h", "5d": how long ago it was listed
function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

function num(v) {
  return v === '' || v == null || !Number.isFinite(+v) ? null : +v;
}

/**
 * mount(box, { text, kind, divine, onFit })
 */
async function mountTradePanel(box, { text, divine = null, onFit = () => {} }) {
  mount(box, h('div', { class: 'muted small' }, h('span', { class: 'spin' }), ' Reading the mods'));
  onFit();
  let prep;
  try {
    prep = await call('trade:prepare', text);
  } catch {
    mount(box, h('div', { class: 'muted small' }, 'Could not load the trade site\'s mod list. Check your connection and try again.'));
    onFit();
    return;
  }
  renderPanel(box, prep, { text, divine, onFit });
  // uniques and unidentified items: searched at once; rares wait for you to press Search
  if (prep.autoSearch) box.querySelector('.tp-go button.primary')?.click();
}

/** Draws the panel from prepared data. Redrawing keeps ticks and typed values (they live on prep). */
function renderPanel(box, prep, { text, divine, onFit }) {
  const mods = prep.mods;
  const props = prep.props;
  let status = prep.status || 'securable';
  const results = h('div', { class: 'tp-results' });

  // ---------- mods ----------
  function modRow(m) {
    const cb = h('input', { type: 'checkbox', checked: !!m.enabled && !m.unmatched, disabled: !!m.unmatched, 'aria-label': `Search for ${m.text}`, onchange: (e) => { m.enabled = e.target.checked; row.classList.toggle('on', m.enabled); updateCount(); } });
    const field = (key, placeholder) => {
      if (m.unmatched || m.display == null) return h('span', { class: 'tp-num-empty' });
      const inp = h('input', { type: 'number', step: 'any', value: m[key] ?? '', placeholder, 'aria-label': `${placeholder} for ${m.text}` });
      inp.addEventListener('input', () => {
        m[key] = num(inp.value);
        // typing a value means you want the mod
        if (!m.enabled) { m.enabled = true; cb.checked = true; row.classList.add('on'); updateCount(); }
      });
      return inp;
    };
    const row = h('div', { class: 'tp-mod' + (m.enabled ? ' on' : '') + (m.unmatched ? ' unmatched' : ''), title: m.unmatched ? 'This mod can\'t be searched on the trade site' : m.statText || '' },
      h('label', { class: 'tp-mod-main' }, cb, h('span', { class: 'tp-text' }, m.text)),
      field('min', 'min'),
      h('span', { class: 'tp-dash' }, m.unmatched || m.display == null ? '' : '–'),
      field('max', 'max'));
    return row;
  }

  const groups = GROUPS.map(([g, label]) => {
    const rows = mods.filter((m) => m.group === g && !m.hidden);
    if (!rows.length) return null;
    return h('div', { class: 'tp-group' },
      h('div', { class: 'tp-ghead' }, label, g === 'pseudo' ? h('span', { class: 'faint' }, ' (summed from all mods)') : null),
      rows.map(modRow));
  });

  // ---------- item properties ----------
  const propRows = [];
  const rangeRow = (key, label, { maxToo = true } = {}) => {
    const p = props[key];
    if (!p || p.show === false) return;
    const cb = h('input', { type: 'checkbox', checked: !!p.on, onchange: (e) => { p.on = e.target.checked; } });
    const mk = (k, ph) => {
      const inp = h('input', { type: 'number', step: 'any', value: p[k] ?? '', placeholder: ph, 'aria-label': `${label} ${ph}` });
      inp.addEventListener('input', () => { p[k] = num(inp.value); if (!p.on) { p.on = true; cb.checked = true; } });
      return inp;
    };
    propRows.push(h('div', { class: 'tp-mod' + (p.on ? ' on' : '') }, h('label', { class: 'tp-mod-main' }, cb, h('span', { class: 'tp-text' }, label)), mk('min', 'min'), h('span', { class: 'tp-dash' }, maxToo ? '–' : ''), maxToo ? mk('max', 'max') : h('span', { class: 'tp-num-empty' })));
  };
  if (props.base?.canChange) {
    propRows.push(h('div', { class: 'tp-mod on' }, h('label', { class: 'tp-mod-main' },
      h('input', { type: 'checkbox', checked: props.base.on, onchange: (e) => { props.base.on = e.target.checked; } }),
      h('span', { class: 'tp-text' }, `Same base: ${props.base.value}`, h('span', { class: 'faint' }, ' (untick for any base of this kind)')))));
  }
  // weapons: search by its own DPS (physical, elemental or all)
  if (props.dps?.show) {
    const d = props.dps;
    const cb = h('input', { type: 'checkbox', checked: !!d.on, 'aria-label': 'Search by weapon DPS', onchange: (e) => { d.on = e.target.checked; row.classList.toggle('on', d.on); } });
    const minIn = h('input', { type: 'number', step: 'any', value: d.min ?? '', placeholder: 'min', 'aria-label': 'Lowest DPS' });
    minIn.addEventListener('input', () => { d.min = num(minIn.value); if (!d.on) { d.on = true; cb.checked = true; row.classList.add('on'); } });
    const which = h('select', { 'aria-label': 'Which DPS', onchange: (e) => { d.mode = e.target.value; d.min = Math.floor((d.values?.[d.mode] || 0) * 0.9); minIn.value = d.min; } },
      [['phys', `Physical DPS (${d.values.phys}${d.values.physNow != null && d.values.physNow !== d.values.phys ? ' at 20% quality' : ''})`], ['ele', `Elemental DPS (${d.values.ele})`], ['total', `Total DPS (${d.values.total})`]].map(([v, l]) => h('option', { value: v, selected: d.mode === v }, l)));
    const row = h('div', { class: 'tp-mod' + (d.on ? ' on' : ''), title: 'The weapon\'s own DPS. Its damage and attack speed mods are left unticked: this number already counts them.' },
      h('label', { class: 'tp-mod-main' }, cb, which), minIn, h('span', { class: 'tp-dash' }), h('span', { class: 'tp-num-empty' }));
    propRows.push(row);
  }
  // armour / evasion / energy shield at 20% quality (their local mods are counted in, so they aren't listed)
  for (const d of props.defence || []) {
    const cb = h('input', { type: 'checkbox', checked: !!d.on, 'aria-label': `Search by ${d.label}`, onchange: (e) => { d.on = e.target.checked; row.classList.toggle('on', d.on); } });
    const minIn = h('input', { type: 'number', step: 'any', value: d.min ?? '', placeholder: 'min', 'aria-label': `Lowest ${d.label}` });
    minIn.addEventListener('input', () => { d.min = num(minIn.value); if (!d.on) { d.on = true; cb.checked = true; row.classList.add('on'); } });
    const row = h('div', { class: 'tp-mod' + (d.on ? ' on' : ''), title: `${d.label} at 20% quality: ${d.value}. Its armour mods are counted in this number.` },
      h('label', { class: 'tp-mod-main' }, cb, h('span', { class: 'tp-text' }, `${d.label} ${d.value}`, h('span', { class: 'faint' }, ' at 20% quality'))), minIn, h('span', { class: 'tp-dash' }), h('span', { class: 'tp-num-empty' }));
    propRows.push(row);
  }
  // maps: quantity, rarity, pack size
  for (const d of props.mapStats || []) {
    const cb = h('input', { type: 'checkbox', checked: !!d.on, 'aria-label': `Search by ${d.label}`, onchange: (e) => { d.on = e.target.checked; row.classList.toggle('on', d.on); } });
    const minIn = h('input', { type: 'number', step: 'any', value: d.min ?? '', placeholder: 'min', 'aria-label': `Lowest ${d.label}` });
    minIn.addEventListener('input', () => { d.min = num(minIn.value); if (!d.on) { d.on = true; cb.checked = true; row.classList.add('on'); } });
    const row = h('div', { class: 'tp-mod' + (d.on ? ' on' : '') }, h('label', { class: 'tp-mod-main' }, cb, h('span', { class: 'tp-text' }, `${d.label} +${d.value}%`)), minIn, h('span', { class: 'tp-dash' }), h('span', { class: 'tp-num-empty' }));
    propRows.push(row);
  }
  // heist contracts: the job level, and a priceless target
  if (props.heist) {
    const d = props.heist;
    const cb = h('input', { type: 'checkbox', checked: !!d.on, onchange: (e) => { d.on = e.target.checked; } });
    const minIn = h('input', { type: 'number', min: 1, max: 5, value: d.min ?? '', placeholder: 'min', 'aria-label': d.label, oninput: (e) => { d.min = num(e.target.value); } });
    propRows.push(h('div', { class: 'tp-mod' + (d.on ? ' on' : '') }, h('label', { class: 'tp-mod-main' }, cb, h('span', { class: 'tp-text' }, d.label)), minIn, h('span', { class: 'tp-dash' }), h('span', { class: 'tp-num-empty' })));
  }
  if (props.priceless !== undefined && props.heist !== undefined || props.priceless) {
    propRows.push(h('div', { class: 'tp-mod' + (props.priceless ? ' on' : '') }, h('label', { class: 'tp-mod-main' }, h('input', { type: 'checkbox', checked: !!props.priceless, onchange: (e) => { props.priceless = e.target.checked; } }), h('span', { class: 'tp-text' }, 'Priceless target'))));
  }
  rangeRow('ilvl', 'Item level');
  rangeRow('links', 'Linked sockets');
  rangeRow('quality', 'Quality');
  rangeRow('gemLevel', 'Gem level');
  rangeRow('mapTier', 'Map tier');
  const corr = h('select', { 'aria-label': 'Corrupted', onchange: (e) => { props.corrupted = e.target.value; } }, [['any', 'Corrupted or not'], ['yes', 'Corrupted only'], ['no', 'Not corrupted']].map(([v, l]) => h('option', { value: v, selected: props.corrupted === v }, l)));
  const ident = h('select', { 'aria-label': 'Identified', onchange: (e) => { props.identified = e.target.value; } }, [['any', 'Identified or not'], ['yes', 'Identified only'], ['no', 'Unidentified only']].map(([v, l]) => h('option', { value: v, selected: (props.identified || 'any') === v }, l)));
  const infl = Object.keys(props.influences || {}).map((inf) => h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: props.influences[inf], onchange: (e) => { props.influences[inf] = e.target.checked; } }), `${inf} item`));

  // ---------- search ----------
  const countEl = h('span', { class: 'small faint' });
  function updateCount() {
    const n = mods.filter((m) => m.enabled && m.id).length;
    countEl.textContent = prep.kind === 'gem' ? '' : n ? `${n} ${n === 1 ? 'mod' : 'mods'} ticked` : 'No mods ticked: searches by base and properties';
  }
  updateCount();

  const statusSel = h('select', { 'aria-label': 'Which listings', onchange: (e) => { status = e.target.value; prep.status = status; } }, STATUSES.map(([v, l]) => h('option', { value: v, selected: status === v }, l)));
  const go = h('button', { class: 'primary', onclick: search }, 'Search');

  async function search() {
    go.disabled = true;
    mount(results, h('div', { class: 'small muted' }, h('span', { class: 'spin' }), ' Searching'));
    onFit();
    try {
      prep.status = status;
      const r = await call('trade:search', { text, mods, props, opts: { status } });
      const l = r.listings;
      mount(results,
        h('div', { class: 'row', style: { gap: '8px' } },
          h('b', {}, `${r.total} ${r.total === 1 ? 'listing' : 'listings'}`),
          l?.min != null ? h('span', {}, 'from ', h('b', {}, chaosDiv(l.min, divine))) : null,
          l?.median != null && l.prices.length > 2 ? h('span', { class: 'muted' }, `typical ${chaosDiv(l.median, divine)}`) : null,
          h('span', { class: 'spacer' }),
          h('button', { class: 'sm', onclick: () => call('shell:open', r.url) }, 'Open on trade site')),
        l?.prices?.length ? h('div', { class: 'tp-listings', style: { marginTop: '6px' } }, l.prices.map((x) => h('div', { class: 'tp-li' + (x.mine ? ' mine' : '') },
          h('span', { class: 'tp-price' }, `${x.amount} ${x.currency}`, x.times > 1 ? h('span', { class: 'tp-times', title: `${x.times} listings from this seller` }, `×${x.times}`) : null),
          h('span', { class: 'faint tp-ago' }, ago(x.indexed)),
          h('span', { class: 'spacer' }),
          x.mine ? h('span', { class: 'tp-you' }, 'You') : h('span', { class: 'faint tp-seller' }, x.seller || ''),
          h('span', { class: `tp-st ${x.status}`, title: { online: 'Online', afk: 'AFK', offline: 'Offline', merchant: 'Merchant tab (instant buyout)' }[x.status] || '' }, { online: '● online', afk: '◑ AFK', offline: '○ offline', merchant: '◆ instant' }[x.status] || '')))) : null,
        !r.total ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Nothing listed. Untick a mod or lower a min value and search again.') : null);
    } catch (e) {
      const why = String(e?.message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      mount(results, h('span', { class: 'small muted' }, /wait \d+ seconds/.test(why) ? why : 'The search failed. Your GGG request budget or rate limit may be used up; try again in a minute.'));
    }
    go.disabled = false;
    onFit();
  }

  // an unfinished item worth crafting on: search it as a finished item, or as a crafting base
  let presetSel = null;
  if (prep.presets?.base) {
    presetSel = h('select', { 'aria-label': 'Search as', onchange: (e) => {
      const want = e.target.value;
      if (want === prep.presets.active) return;
      prep.presets[prep.presets.active] = { mods: prep.mods, props: prep.props };
      const next = prep.presets[want];
      prep.mods = next.mods; prep.props = next.props; prep.presets.active = want;
      mountAgain();
    } }, h('option', { value: 'finished', selected: prep.presets.active === 'finished' }, 'Finished item'),
    h('option', { value: 'base', selected: prep.presets.active === 'base' }, 'Crafting base'));
  }
  mount(box,
    h('div', { class: 'tp' },
      presetSel ? h('div', { class: 'row small', style: { marginBottom: '6px', gap: '8px' }, title: 'Crafting base: the exact base, item level, influences, implicits and fractured or top-tier mods, for an item you would craft on' }, h('span', { class: 'muted' }, 'Search as'), presetSel) : null,
      h('div', { class: 'row tp-top' },
        h('span', { class: 't' }, prep.kind === 'gem' ? 'Searches this gem by level, quality and whether it is corrupted.' : prep.kind === 'unique' ? 'Searches this unique by name. Tick mods to narrow it down.' : 'Tick the mods to search for. Values are min and max.'),
        h('span', { class: 'spacer' }),
        mods.length ? h('button', { class: 'quiet sm', onclick: () => { const on = !mods.some((m) => m.enabled && m.id); mods.forEach((m) => { if (m.id) m.enabled = on; }); mountAgain(); } }, 'All / none') : null),
      groups,
      propRows.length || infl.length ? h('div', { class: 'tp-group' }, h('div', { class: 'tp-ghead' }, 'Item'), propRows, h('div', { class: 'row', style: { gap: '10px', padding: '3px 0', flexWrap: 'wrap' } }, corr, ident, infl)) : null,
      h('div', { class: 'row tp-go' }, go, statusSel, countEl),
      h('div', { class: 'small faint' }, 'Uses 1 to 3 GGG requests per search; the same search again within 3 minutes uses none.'),
      results));
  onFit();

  function mountAgain() {
    renderPanel(box, prep, { text, divine, onFit });
  }
}

window.TradePanel = { mount: mountTradePanel };
})();
