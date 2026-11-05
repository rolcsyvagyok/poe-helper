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
    const rows = mods.filter((m) => m.group === g);
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
        l?.prices?.length ? h('div', { class: 'ov-list', style: { marginTop: '6px' } }, l.prices.slice(0, 8).map((x) => h('div', { class: 'li' },
          h('span', {}, `${x.amount} ${x.currency}`), h('span', { class: 'spacer' }), h('span', { class: 'faint' }, x.seller || '')))) : null,
        !r.total ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Nothing listed. Untick a mod or lower a min value and search again.') : null);
    } catch {
      mount(results, h('span', { class: 'small muted' }, 'The search failed. Your GGG request budget or rate limit may be used up; try again in a minute.'));
    }
    go.disabled = false;
    onFit();
  }

  mount(box,
    h('div', { class: 'tp' },
      h('div', { class: 'row tp-top' },
        h('span', { class: 't' }, prep.kind === 'gem' ? 'Searches this gem by level, quality and whether it is corrupted.' : prep.kind === 'unique' ? 'Searches this unique by name. Tick mods to narrow it down.' : 'Tick the mods to search for. Values are min and max.'),
        h('span', { class: 'spacer' }),
        mods.length ? h('button', { class: 'quiet sm', onclick: () => { const on = !mods.some((m) => m.enabled && m.id); mods.forEach((m) => { if (m.id) m.enabled = on; }); mountAgain(); } }, 'All / none') : null),
      groups,
      propRows.length || infl.length ? h('div', { class: 'tp-group' }, h('div', { class: 'tp-ghead' }, 'Item'), propRows, h('div', { class: 'row', style: { gap: '10px', padding: '3px 0', flexWrap: 'wrap' } }, corr, ident, infl)) : null,
      h('div', { class: 'row tp-go' }, go, statusSel, countEl),
      h('div', { class: 'small faint' }, 'Uses 1 to 2 GGG requests per search.'),
      results));
  onFit();

  function mountAgain() {
    renderPanel(box, prep, { text, divine, onFit });
  }
}

window.TradePanel = { mount: mountTradePanel };
})();
