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
  // league mods the trade site lists on their own (they start ticked)
  ['veiled', 'Veiled'],
  ['mercenary', 'Mercenary'],
  ['imbued', 'Imbued support'],
  ['delve', 'Delve'],
  // a Chronicle of Atzoatl's rooms
  ['temple', 'Open rooms'],
  ['temple-closed', 'Obstructed rooms'],
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
  // the mod's tier (T1 is the best) as a small badge: blue for the top tiers, orange for low ones, the number says it too
  function tierBadge(m) {
    const t = m.meta?.tier;
    if (t == null || !['explicit', 'crafted', 'fractured', 'implicit'].includes(m.group)) return null;
    const cls = t <= 2 ? 'top' : t <= 4 ? 'mid' : 'low';
    return h('span', { class: `tp-tier ${cls}`, title: `Tier ${t} of this mod (T1 is the best)` }, `T${t}`);
  }
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
    // a fractured mod in the game's fractured colour, with a mark so it doesn't rest on colour alone
    const frac = m.group === 'fractured';
    const row = h('div', { class: 'tp-mod' + (m.enabled ? ' on' : '') + (m.unmatched ? ' unmatched' : '') + (frac ? ' fractured' : '') + (m.mercSupport ? ' tp-sub' : ''), title: m.unmatched ? 'This mod can\'t be searched on the trade site' : frac ? `Fractured mod: ${m.statText || m.text}` : m.statText || '' },
      h('label', { class: 'tp-mod-main' }, cb, tierBadge(m), h('span', { class: 'tp-text' }, m.text, frac ? h('span', { class: 'tp-frac' }, 'fractured') : null)),
      field('min', 'min'),
      h('span', { class: 'tp-dash' }, m.unmatched || m.display == null ? '' : '–'),
      field('max', 'max'));
    return row;
  }

  // hidden mods (counted in a total, the DPS or the defences): shown on request, to tick one yourself
  let showHidden = mods.some((m) => m.hidden && m.enabled);
  let hiddenCount = mods.filter((m) => m.hidden && !m.unmatched).length;
  const groupsBox = h('div', {});
  // with the Ctrl+Alt+C copy every mod says whether it is a prefix or a suffix: the item's own mods
  // (explicit, crafted, fractured) are listed that way, with how many of the 3 each side uses
  const AFFIX = ['fractured', 'explicit', 'crafted'];
  const own = mods.filter((m) => AFFIX.includes(m.group));
  const byGen = own.some((m) => m.meta?.gen) && own.every((m) => m.meta?.gen || m.unmatched);
  const cap = props.maxAffix || 3;
  const used = (gen) => new Set(own.filter((m) => m.meta?.gen === gen).map((m) => m.meta.n)).size;
  const tagOf = (m) => (m.group === 'crafted' ? 'crafted' : null); // fractured rows carry their own mark
  const drawGroups = () => mount(groupsBox, GROUPS.flatMap(([g, label]) => {
    if (byGen && AFFIX.includes(g)) {
      if (g !== 'explicit') return [];
      return [['prefix', 'Prefixes'], ['suffix', 'Suffixes']].map(([gen, title]) => {
        const rows = own.filter((m) => m.meta?.gen === gen);
        const n = used(gen);
        // a mod already counted in a total is listed for the overview, without its own tick box
        return h('div', { class: 'tp-group' },
          h('div', { class: 'tp-ghead' }, title, h('span', { class: 'faint' }, ` (${n} of ${cap}${n < cap ? `, ${cap - n} open` : ''})`)),
          rows.length ? rows.map((m) => { const r = modRow(m); const t = tagOf(m); if (t) { const tx = r.querySelector('.tp-text'); tx?.append(h('span', { class: 'faint' }, ` (${t})`)); } return r; })
            : h('div', { class: 'small faint', style: { padding: '2px 4px' } }, 'None'));
      });
    }
    const rows = mods.filter((m) => m.group === g && (!m.hidden || showHidden));
    if (!rows.length) return [];
    return [h('div', { class: 'tp-group' },
      h('div', { class: 'tp-ghead' }, label, g === 'pseudo' ? h('span', { class: 'faint' }, ' (summed from all mods)') : null),
      rows.map(modRow))];
  }));
  drawGroups();
  if (byGen) hiddenCount = mods.filter((m) => m.hidden && !AFFIX.includes(m.group)).length;
  const hiddenToggle = hiddenCount ? h('button', { class: 'quiet sm', style: { margin: '2px 0 6px' }, 'aria-expanded': String(showHidden), onclick: (e) => { showHidden = !showHidden; e.target.setAttribute('aria-expanded', String(showHidden)); e.target.textContent = toggleText(); drawGroups(); } }, '') : null;
  const toggleText = () => (showHidden ? `− Hide the ${hiddenCount} counted-in mods` : `+ Show ${hiddenCount} more mod${hiddenCount === 1 ? '' : 's'} (counted in the totals, DPS or defences)`);
  if (hiddenToggle) hiddenToggle.textContent = toggleText();
  const groups = [groupsBox, hiddenToggle];

  // ---------- item properties ----------
  const propRows = [];
  const topRows = []; // the item's own DPS or defences: first in the list
  const rangeRow = (key, label, { maxToo = true, top = false } = {}) => {
    const p = props[key];
    if (!p || p.show === false) return;
    const cb = h('input', { type: 'checkbox', checked: !!p.on, onchange: (e) => { p.on = e.target.checked; } });
    const mk = (k, ph) => {
      const inp = h('input', { type: 'number', step: 'any', value: p[k] ?? '', placeholder: ph, 'aria-label': `${label} ${ph}` });
      inp.addEventListener('input', () => { p[k] = num(inp.value); if (!p.on) { p.on = true; cb.checked = true; } });
      return inp;
    };
    const cbOn = cb; cbOn.addEventListener('change', () => cbOn.closest('.tp-mod')?.classList.toggle('on', p.on));
    (top ? topRows : propRows).push(h('div', { class: 'tp-mod' + (p.on ? ' on' : ''), 'data-k': key }, h('label', { class: 'tp-mod-main' }, cb, h('span', { class: 'tp-text' }, label)), mk('min', 'min'), h('span', { class: 'tp-dash' }, maxToo ? '–' : ''), maxToo ? mk('max', 'max') : h('span', { class: 'tp-num-empty' })));
  };
  // the base and the item level first, with the item's own DPS or defences: what the item is
  if (props.base?.canChange) {
    topRows.push(h('div', { class: 'tp-mod' + (props.base.on ? ' on' : ''), 'data-k': 'base' }, h('label', { class: 'tp-mod-main' },
      h('input', { type: 'checkbox', checked: props.base.on, onchange: (e) => { props.base.on = e.target.checked; e.target.closest('.tp-mod').classList.toggle('on', props.base.on); } }),
      h('span', { class: 'tp-text' }, `Same base: ${props.base.value}`, h('span', { class: 'faint' }, ' (untick for any base of this kind)')))));
  }
  rangeRow('ilvl', 'Item level', { top: true });
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
    topRows.push(row);
  }
  // armour / evasion / energy shield at 20% quality (their local mods are counted in, so they aren't listed)
  for (const d of props.defence || []) {
    const cb = h('input', { type: 'checkbox', checked: !!d.on, 'aria-label': `Search by ${d.label}`, onchange: (e) => { d.on = e.target.checked; row.classList.toggle('on', d.on); } });
    const minIn = h('input', { type: 'number', step: 'any', value: d.min ?? '', placeholder: 'min', 'aria-label': `Lowest ${d.label}` });
    minIn.addEventListener('input', () => { d.min = num(minIn.value); if (!d.on) { d.on = true; cb.checked = true; row.classList.add('on'); } });
    const row = h('div', { class: 'tp-mod' + (d.on ? ' on' : ''), title: `${d.label} at 20% quality: ${d.value}. Its armour mods are counted in this number.` },
      h('label', { class: 'tp-mod-main' }, cb, h('span', { class: 'tp-text' }, `${d.label} ${d.value}`, h('span', { class: 'faint' }, ' at 20% quality'))), minIn, h('span', { class: 'tp-dash' }), h('span', { class: 'tp-num-empty' }));
    topRows.push(row);
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
  rangeRow('links', 'Linked sockets');
  rangeRow('quality', 'Quality');
  rangeRow('gemLevel', 'Gem level');
  rangeRow('storedExp', 'Stored experience (million)');
  rangeRow('mapTier', 'Map tier');
  // "rare" in the header: only rares (else rares and magic items of the base)
  if (props.rareOnly?.show) {
    const cb = h('input', { type: 'checkbox', checked: !!props.rareOnly.on, onchange: (e) => { props.rareOnly.on = e.target.checked; e.target.closest('.tp-mod').classList.toggle('on', props.rareOnly.on); } });
    propRows.push(h('div', { class: 'tp-mod' + (props.rareOnly.on ? ' on' : ''), 'data-k': 'rareOnly' }, h('label', { class: 'tp-mod-main' }, cb, h('span', { class: 'tp-text' }, 'Rare items only', h('span', { class: 'faint' }, ' (else magic ones too)')))));
  }
  const corr = h('select', { 'data-k': 'corrupted', 'aria-label': 'Corrupted', onchange: (e) => { props.corrupted = e.target.value; } }, [['any', 'Corrupted or not'], ['yes', props.twiceCorrupted ? 'Twice corrupted only' : 'Corrupted only'], ['no', 'Not corrupted']].map(([v, l]) => h('option', { value: v, selected: props.corrupted === v }, l)));
  const ident = h('select', { 'data-k': 'unid', 'aria-label': 'Identified', onchange: (e) => { props.identified = e.target.value; } }, [['any', 'Identified or not'], ['yes', 'Identified only'], ['no', 'Unidentified only']].map(([v, l]) => h('option', { value: v, selected: (props.identified || 'any') === v }, l)));
  const infl = Object.keys(props.influences || {}).map((inf) => h('label', { class: 'check small', 'data-k': `infl:${inf}` }, h('input', { type: 'checkbox', checked: props.influences[inf], onchange: (e) => { props.influences[inf] = e.target.checked; } }), `${inf} item`));

  // the overlay header's facts (item level 85, 5-link, Shaper…) tick these lines when clicked
  box._isOn = (k) => {
    if (k === 'base') return props.base?.canChange ? !!props.base.on : null;
    if (k === 'rareOnly') return props.rareOnly?.show ? !!props.rareOnly.on : null;
    if (k === 'corrupted') return props.corrupted === 'yes';
    if (k === 'unid') return (props.identified || 'any') === 'no';
    if (k.startsWith('infl:')) { const i = k.slice(5); return props.influences && i in props.influences ? !!props.influences[i] : null; }
    return props[k] && props[k].show !== false ? !!props[k].on : null;
  };
  box._tick = (k) => {
    const el = box.querySelector(`[data-k="${CSS.escape(k)}"]`);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = k === 'corrupted' ? (props.corrupted === 'yes' ? 'any' : 'yes') : ((props.identified || 'any') === 'no' ? 'any' : 'no');
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const cb = el.querySelector('input[type=checkbox]');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.scrollIntoView({ block: 'nearest' });
    el.classList.remove('tp-flash'); void el.offsetWidth; el.classList.add('tp-flash');
  };

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
    const showResults = () => requestAnimationFrame(() => {
      onFit();
      // scroll only the list (not the whole window): the results come to the top
      const sc = results.closest('.ov-body');
      if (sc) sc.scrollTo({ top: sc.scrollTop + results.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8, behavior: 'smooth' });
      else results.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    try {
      prep.status = status;
      const r = await window.poe.call('trade:search', { text, mods, props, opts: { status } }); // errors shown below, not as a toast over the buttons
      const l = r.listings;
      // an unidentified unique: the price top right is what unidentified ones are listed for
      // a search that ends after you checked another item doesn't touch that item's window
      if (!box.isConnected) return;
      if (prep.uniqueChoices?.length && (prep.uniqueChoices.length === 1 || props.uniqueName)) window.OverlayTradePrice?.({ ...(l || {}), total: r.total }, divine);
      mount(results,
        h('div', { class: 'row', style: { gap: '8px' } },
          h('b', {}, `${r.total} ${r.total === 1 ? 'listing' : 'listings'}`),
          l?.min != null ? h('span', {}, 'from ', window.UI.money(l.min, divine)) : null,
          l?.median != null && l.prices.length > 2 ? h('span', { class: 'muted' }, `typical ${chaosDiv(l.median, divine)}`) : null,
          h('span', { class: 'spacer' }),
          h('button', { class: 'sm', onclick: () => call('shell:open', r.url) }, 'Open on trade site')),
        l?.prices?.length ? h('div', { class: 'tp-listings', style: { marginTop: '6px' } }, l.prices.map((x, i) => h('div', { class: 'tp-li' + (x.mine ? ' mine' : '') + (i >= 3 ? ' more' : '') },
          h('span', { class: 'tp-price money' }, h('b', {}, String(x.amount)), h('small', {}, x.currency), x.times > 1 ? h('span', { class: 'tp-times', title: `${x.times} listings from this seller` }, `×${x.times}`) : null),
          h('span', { class: 'faint tp-ago' }, ago(x.indexed)),
          h('span', { class: 'spacer' }),
          x.mine ? h('span', { class: 'tp-you' }, 'You') : h('span', { class: 'faint tp-seller', title: x.seller || '' }, x.seller || ''),
          h('span', { class: `tp-st ${x.status}`, title: { online: 'Online', afk: 'AFK', offline: 'Offline', merchant: 'Merchant tab (instant buyout)' }[x.status] || '' }, { online: '● online', afk: '◑ AFK', offline: '○ offline', merchant: '◆ instant' }[x.status] || ''),
          x.whisper && !x.mine && x.status !== 'merchant' ? h('button', { class: 'quiet sm tp-whisper', title: 'Copy the whisper to the seller; paste it in game chat', onclick: async (e) => { await window.poe.call('clipboard:write', x.whisper).catch(() => {}); e.currentTarget.textContent = 'Copied'; } }, 'Whisper') : null))) : null,
        l?.prices?.length > 3 ? h('button', { class: 'quiet sm tp-more-btn', onclick: (e) => { const box = e.currentTarget.previousElementSibling; const open = box.classList.toggle('all'); e.currentTarget.textContent = open ? 'Show fewer' : `Show ${l.prices.length - 3} more`; onFit(); } }, `Show ${l.prices.length - 3} more`) : null,
        !r.total ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Nothing listed. Untick a mod or lower a min value and search again.') : null);
    } catch (e) {
      const why = String(e?.message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      // the app can't search now: the same search still opens on the trade site (your browser, not the app's limit)
      mount(results, h('div', { class: 'stack', style: { gap: '6px' } },
        h('span', { class: 'small muted' }, /wait \d+ seconds|doesn't list/.test(why) ? why : 'The search failed. The trade site may be busy; try again in a minute.'),
        h('div', {}, h('button', { class: 'sm', onclick: () => window.poe.call('trade:openSite', { text, mods, props, opts: { status } }).catch(() => {}) }, 'Open on trade site'))));
    }
    go.disabled = false;
    showResults();
  }

  // an unidentified unique: which one it is (as Awakened PoE Trade asks). One possible (Voices): said, and searched.
  // More: pick one, and it's searched as that unique, unidentified ones only
  const choices = prep.uniqueChoices || [];
  // once it's known which unique it is, the window's picture is that unique's
  const chosen = choices.length === 1 ? choices[0] : props.uniqueName || null;
  // (only while this panel is still the one on screen: a newer price check has its own picture)
  if (chosen && box.isConnected) {
    const head = document.querySelector('.ov-pic');
    if (head && head.dataset.unique !== chosen) {
      const pic = window.UI.itemPic(chosen, { size: 48, hint: 'Unique' });
      pic.classList.add('ov-pic'); pic.dataset.unique = chosen;
      head.replaceWith(pic);
    }
  }
  const pick = (n) => { props.uniqueName = n; mountAgain(); if (n) setTimeout(() => box.querySelector('.tp-go button.primary')?.click(), 0); };
  const which = choices.length === 1
    ? h('div', { class: 'tp-which one' }, window.UI.itemPic(choices[0], { size: 34, hint: 'Unique' }), h('div', {}, h('b', {}, choices[0]), h('div', { class: 'small muted' }, 'The only unique on this base. Searched as unidentified ones.')))
    // picked: just that one (and a way back); the prices follow
    : choices.length > 1 && props.uniqueName ? h('div', { class: 'tp-which one' }, window.UI.itemPic(props.uniqueName, { size: 34, hint: 'Unique' }),
      h('div', { class: 'row', style: { gap: '10px' } }, h('div', {}, h('b', {}, props.uniqueName), h('div', { class: 'small muted' }, 'Searched as unidentified ones.')),
        h('span', { class: 'spacer' }), h('button', { class: 'quiet sm', onclick: () => pick(null) }, 'Change')))
    : choices.length > 1 ? (() => {
      // a search over the names: the grid shows only the matching ones (Enter picks the first)
      const grid = h('div', { class: 'tp-which-grid' }, choices.map((n) => h('button', { class: 'tp-which-btn', 'data-n': n.toLowerCase(), onclick: () => pick(n) },
        window.UI.itemPic(n, { size: 30, hint: 'Unique' }), h('span', {}, n))));
      const none = h('div', { class: 'small muted', hidden: true }, 'No unique on this base has that name.');
      const find = h('input', { type: 'search', class: 'tp-which-find', placeholder: `Find among ${choices.length} uniques…`, 'aria-label': 'Find a unique',
        oninput: (e) => {
          const q = e.target.value.trim().toLowerCase();
          let shown = 0;
          for (const b of grid.children) { const on = !q || b.dataset.n.includes(q); b.hidden = !on; if (on) shown++; }
          none.hidden = shown > 0;
        },
        onkeydown: (e) => { if (e.key === 'Enter') { const first = [...grid.children].find((b) => !b.hidden); if (first) first.click(); } } });
      return h('div', { class: 'tp-which' }, h('div', { class: 'tp-ghead' }, 'Which unique is it?'), find, grid, none,
        h('div', { class: 'small faint' }, 'Pick one to see its prices.'));
    })()
    : null;
  // (the "Search as: finished item / crafting base" choice is gone: the price check searches the finished item)
  mount(box,
    h('div', { class: 'tp' },
      which,
      // the results first: they are what you search for, seen without scrolling past the mods
      results,
      topRows.length ? h('div', { class: 'tp-group tp-top' }, topRows) : null,
      groups,
      propRows.length || infl.length ? h('div', { class: 'tp-group' }, h('div', { class: 'tp-ghead' }, 'More'), propRows, h('div', { class: 'row', style: { gap: '10px', padding: '3px 0', flexWrap: 'wrap' } }, corr, ident, infl)) : null,
      h('div', { class: 'row tp-go' }, go, statusSel, countEl, mods.length ? h('button', { class: 'quiet sm', title: 'Tick or untick every mod', onclick: () => { const on = !mods.some((m) => m.enabled && m.id); mods.forEach((m) => { if (m.id && (!m.hidden || showHidden || (byGen && AFFIX.includes(m.group)))) m.enabled = on; }); mountAgain(); } }, 'All / none') : null)));
  onFit();

  function mountAgain() {
    renderPanel(box, prep, { text, divine, onFit });
  }
}

window.TradePanel = { mount: mountTradePanel };
})();
