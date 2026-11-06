/* Loot filter page, laid out like FilterBlade: categories on the left, tiers on the right,
   bases as chips you select or drag between tiers, and a look editor per tier.
   Uses helpers defined in app.js (S, refreshState, pageHead, toggle, soundPicker, renderFilterExtras). */
(() => {
'use strict';
const { h, mount, ago, toast, call, dropLabel, soundButton, playSound, GAME_COLOURS } = window.UI;

const FB = { newTier: false, tab: 'tiers', priceColors: false, collapsed: new Set(), names: {}, catQuery: '', catTimer: null, openGroups: new Set(), closedGroups: new Set(), closedSections: new Set(), review: null, reviewSel: new Set(), reviewOpen: new Set(), reviewBusy: false, tab: 'tiers', type: null, selected: new Set(), search: '', editing: null, draft: null, prices: {}, showSuggestions: false };
const fmtC = (c) => (c == null || !Number.isFinite(c) ? '' : c < 0.01 ? '<0.01c' : c >= 100 ? `${Math.round(c)}c` : c >= 10 ? `${c.toFixed(0)}c` : c >= 1 ? `${c.toFixed(1).replace(/\.0$/, '')}c` : `${c.toFixed(2).replace(/0$/, '')}c`);
const HIDE = '__hide__';
const HIDDEN_TIER = window.TierNames.HIDDEN_TIER;
const COLOURS = Object.keys(GAME_COLOURS);
const SHAPES = ['Star', 'Circle', 'Diamond', 'Hexagon', 'Square', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'];

// tier names come from tier-names.js, shared with the in-game overlay
const { tierName, uniqueTier, TIER_WORDS } = window.TierNames;

const TYPE_RARITY = { currency: 'Currency', divination: 'Divination Card', uniques: 'Unique', gems: 'Gem' };
const rarityFor = (type) => TYPE_RARITY[type.split('->')[0]] || 'Normal';

// ---------------------------------------------------------------- page
let artRequested = false;
function loadArt() {
  if (artRequested) return;
  artRequested = true;
  window.poe.call('art:icons', artNames()).then((map) => {
    if (!Object.keys(map || {}).length) return;
    window.UI.setArt(map);
    if (document.querySelector('#page-filters.active')) renderFilters();
  }).catch(() => { artRequested = false; });
}

function renderFilters() {
  loadArt(); return window.UI.keepScroll(() => renderFiltersNow()); }
// Some FilterBlade tiers belong somewhere else than their category: NeverSink keeps the Heist and Ritual
// bases in "exotic bases", but you look for them under Heist and Ritual. Those tiers get their own
// subcategory (key "type#name"); everything you do there still goes to the real filter category.
const TIER_SPLITS = [
  { type: 'exoticbases', tier: 'exoticheistbases', key: 'exoticbases#heist', label: 'Heist bases' },
  { type: 'exoticbases', tier: 'exoticritualbases', key: 'exoticbases#ritual', label: 'Ritual bases' },
];
// Several filter categories shown as one subcategory, with a switch between them on its page.
const TYPE_MERGES = [
  { key: 'heist#equipment', label: 'Heist equipment', short: 'Equipment', parts: [['heist->cloak', 'Cloaks'], ['heist->brooch', 'Brooches'], ['heist->gear', 'Gear'], ['heist->tool', 'Tools']] },
];
// Some league mechanics have no category of their own in the filter: their items sit in the shared
// currency tiers. A base view shows only those items (key "type@id"); moving one still moves it in the real tiers.
const EXPEDITION = ['Astragali', 'Exotic Coinage', 'Scrap Metal', 'Burial Medallion'];
const BASE_VIEWS = [
  { type: 'currency', key: 'currency@expedition', label: 'Expedition currency', bases: EXPEDITION },
  { type: 'currency->stackedsix', key: 'currency->stackedsix@expedition', label: 'Big stacks', bases: EXPEDITION },
  { type: 'currency->stackedthree', key: 'currency->stackedthree@expedition', label: 'Small stacks', bases: EXPEDITION },
];
function baseViews(types) {
  const out = [];
  for (const bv of BASE_VIEWS) {
    const t = types.find((x) => x.key === bv.type);
    if (!t || !t.tiers.some((y) => y.bases.some((b) => bv.bases.includes(b)))) continue;
    out.push({ ...t, key: bv.key, label: bv.label, subLabel: bv.label, baseView: bv.bases, tiers: t.tiers.map((y) => ({ ...y, bases: y.bases.filter((b) => bv.bases.includes(b)) })) });
  }
  return out;
}
const mergeOf = (key) => TYPE_MERGES.find((m) => m.key === key || m.parts.some(([k]) => k === key)) || null;
function splitTypes(view) {
  if (!view?.types) return view;
  view = splitTiers(view);
  const types = view.types.map((t) => (mergeOf(t.key) ? { ...t, inMerge: true } : t));
  for (const m of TYPE_MERGES) {
    const parts = types.filter((t) => m.parts.some(([k]) => k === t.key));
    if (!parts.length) continue;
    // listed last in its category, standing for all its parts
    types.push({ ...parts[0], key: m.key, type: parts[0].type, label: m.label, subLabel: m.short || m.label, merged: true, inMerge: false, realTypes: parts.map((t) => t.type), tiers: parts.flatMap((t) => t.tiers) });
  }
  types.push(...baseViews(types));
  return { ...view, types };
}
function splitTiers(view) {
  const out = [];
  for (const t of view.types) {
    const splits = TIER_SPLITS.filter((x) => x.type === t.type && t.tiers.some((y) => y.tier === x.tier));
    const rest = t.tiers.filter((y) => !splits.some((x) => x.tier === y.tier));
    if (rest.length || !splits.length) out.push({ ...t, key: t.type, tiers: rest });
    for (const x of splits) out.push({ ...t, key: x.key, label: x.label, subLabel: x.label, tiers: t.tiers.filter((y) => y.tier === x.tier) });
  }
  return { ...view, types: out };
}

async function renderFiltersNow() {
  if (FB.tab === 'rules' || FB.tab === 'price' || FB.tab === 'file') FB.tab = 'tiers'; // tabs that moved or went away
  await refreshState();
  const el = $('page-filters');
  const info = await call('filter:list');
  let view = null;
  if (info.base) {
    try { view = splitTypes(await call('tiers:view')); } catch { view = null; }
  }
  const themes = await call('themes:list').catch(() => []);
  const edits = view ? Object.keys(S.settings.tierPatch?.moves || {}).length + (view.editedStyles || []).length : 0;

  if (info.switched) toast(`The game saved "${info.switched.to}" under a new file name; switched to it with all your changes.`);
  const baseFile = info.files.find((f) => f.name === info.base);
  const helperName = info.lastWrite?.target ? info.lastWrite.target.split(/[\\/]/).pop() : baseFile ? `${(baseFile.display || '').replace(/ \(synced from FilterBlade\)$/, '')} (helper).filter` : null;
  const fileBar = h('div', { class: 'fb-filebar' },
    h('select', { 'aria-label': 'Your FilterBlade filter', onchange: async (e) => { await call('settings:set', { baseFilter: e.target.value }); FB.type = null; renderFilters(); } },
      h('option', { value: '' }, 'Choose your FilterBlade filter'),
      info.files.map((f) => h('option', { value: f.name, selected: f.name === info.base }, f.display || f.name.replace(/\.filter$/i, '')))),
    info.missing ? h('span', { class: 'pill bad', title: info.missing.file }, `${info.missing.name ? `"${info.missing.name}"` : 'Your filter'} is no longer in the folder. Pick it again here.`) : null,
    h('span', { class: 'small muted' },
      info.missing ? '' : !info.files.length ? 'No filters found. Download your filter from FilterBlade into the folder set in Settings, Loot filter file.'
        : !info.base ? 'Pick the filter you downloaded from FilterBlade.'
          : info.lastWrite ? `Your version is "${helperName}", saved ${ago(Date.now() - info.lastWrite.at)}. Select it in game once.` : `Changes are saved to "${helperName}". Select it in game once.`),
    h('span', { class: 'spacer' }),
    view?.types?.length ? h('button', { class: 'primary sm', disabled: FB.applyingAll, title: 'Check poe.ninja for every priced category and move every item to the tier its price fits now', onclick: () => applyAllPrices() }, FB.applyingAll ? 'Applying…' : 'Apply all price changes') : null,
    edits ? h('span', { class: 'pill' }, `${edits} ${edits === 1 ? 'change' : 'changes'}`) : null,
    edits ? h('button', { class: 'quiet sm', onclick: async () => { if (confirm('Undo all tier moves and look changes?')) { await call('tiers:reset', { all: true }); toast('All changes undone'); renderFilters(); } } }, 'Undo all') : null);

  const tabs = h('div', { class: 'fb-tabs', role: 'tablist' }, [['tiers', 'Tiers'], ['review', 'Price review'], ['check', 'Check an item']].map(([id, label]) =>
    h('button', { role: 'tab', 'aria-selected': FB.tab === id ? 'true' : 'false', class: FB.tab === id ? 'active' : '', onclick: () => { FB.tab = id; renderFilters(); } }, label)));

  const body = h('div', { class: 'fb-body' });
  const show = () => mount(el, pageHead('Loot filter', 'Your FilterBlade filter, with your own tiers and looks on top. The original file is never changed.', themeMenu(themes, !!view?.types?.length)), fileBar, tabs, body);
  // the tier pages are built first and put on screen in one go: showing an empty page while the
  // cluster or base data loads made the page collapse, which threw you back to the top
  if (FB.tab === 'tiers' && info.base && !info.missing && view?.types?.length) {
    await renderTiers(body, view);
    return show();
  }
  show();

  if (FB.tab === 'review') {
    if (!info.base) return mount(body, h('div', { class: 'panel empty' }, 'Choose your FilterBlade filter above first.'));
    if (!view?.types?.length) return mount(body, h('div', { class: 'panel empty' }, 'Price review needs a FilterBlade (NeverSink-based) filter with tiers.'));
    return renderReview(body);
  }
  if (FB.tab !== 'tiers') return renderFilterExtras(body, FB.tab);
  if (!info.base || info.missing) return mount(body, h('div', { class: 'panel empty' }, info.missing ? 'The filter you had chosen is gone from the filter folder (the game may have replaced it when it synced). Choose it again above; all your tier changes are kept and are applied to it.' : 'Choose your FilterBlade filter above to see its tiers.'));
  if (!view?.types?.length) return mount(body, h('div', { class: 'panel empty' }, 'This filter has no FilterBlade tier tags, so there are no tiers to edit. Tiers work with NeverSink-based filters from FilterBlade. Extra rules still work with any filter.'));
  renderTiers(body, view);
}

// ---------------------------------------------------------------- themes
function themeMenu(themes, canSave) {
  const name = h('input', { placeholder: 'Theme name', style: { flex: 1 } });
  const only = h('input', { type: 'checkbox' });
  return h('details', { class: 'fb-pop' },
    h('summary', { class: 'fb-pop-btn' }, 'Themes'),
    h('div', { class: 'fb-pop-body stack' },
      h('h2', {}, 'Themes'),
      h('p', { class: 'small muted' }, 'A theme is a set of tier looks: colours, sizes, sounds, beams and icons. Apply it to any FilterBlade filter or strictness.'),
      themes.length ? h('div', { class: 'stack', style: { gap: '6px' } }, themes.map((t) => h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('span', { style: { flex: 1 } }, t.name, h('span', { class: 'faint small' }, ` ${Object.keys(t.styles).length} tiers`)),
        h('button', { class: 'sm', disabled: !canSave, onclick: async () => { const r = await call('themes:apply', t.id); toast(`Applied "${t.name}" to ${r.applied} of ${r.total} tiers`); renderFilters(); } }, 'Apply'),
        h('button', { class: 'quiet sm', onclick: async () => { const p = await call('themes:export', t.id); if (p) toast(`Exported to ${p.split(/[\\/]/).pop()}`); } }, 'Export'),
        h('button', { class: 'danger sm', onclick: async () => { await call('themes:delete', t.id); renderFilters(); } }, 'Delete')))) : h('p', { class: 'small faint' }, 'No saved themes yet.'),
      h('div', { class: 'stack', style: { gap: '8px', borderTop: '1px solid var(--line-soft)', paddingTop: '12px' } },
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, name, h('button', { class: 'primary sm', disabled: !canSave, onclick: async () => { const t = await call('themes:save', { name: name.value.trim() || 'My theme', onlyEdited: only.checked }); toast(`Saved "${t.name}"`); renderFilters(); } }, 'Save current look')),
        h('label', { class: 'check small' }, only, 'Only the tiers I changed'),
        h('button', { class: 'sm', onclick: async () => { const t = await call('themes:import'); if (t) { toast(`Imported "${t.name}"`); renderFilters(); } } }, 'Import a theme file'))));
}

// ---------------------------------------------------------------- tiers
function renderTiers(body, view) {
  if (FB.type === MY_BASES) return renderMyBases(body, view);
  if (FB.type === BASE_MATRIX) return renderBaseMatrix(body, view);
  if (FB.type === CLUSTER_GRID) return renderClusterGrid(body, view);
  if (!FB.type || !view.types.some((t) => t.key === FB.type)) FB.type = view.types[0].key;
  // a merged subcategory opens its last-used part (Cloaks, Brooches, ...)
  const merge = mergeOf(FB.type);
  if (merge && FB.type === merge.key) {
    FB.mergePart = FB.mergePart || {};
    const want = FB.mergePart[merge.key];
    FB.type = merge.parts.find(([k]) => k === want && view.types.some((t) => t.key === k))?.[0] || merge.parts.find(([k]) => view.types.some((t) => t.key === k))[0];
  }
  if (merge) { FB.mergePart = FB.mergePart || {}; FB.mergePart[merge.key] = FB.type; }
  const type = view.types.find((t) => t.key === FB.type);
  const partSwitch = merge ? h('div', { class: 'fb-parts', role: 'tablist', 'aria-label': merge.label },
    merge.parts.filter(([k]) => view.types.some((t) => t.key === k)).map(([k, name]) => {
      const t = view.types.find((x) => x.key === k);
      return h('button', { role: 'tab', 'aria-selected': k === FB.type ? 'true' : 'false', class: 'fb-part' + (k === FB.type ? ' on' : ''), onclick: () => { FB.type = k; FB.selected.clear(); FB.search = ''; renderFilters(); } },
        name, h('span', { class: 'c' }, String(t.tiers.reduce((a, x) => a + x.bases.length, 0) || '')));
    })) : null;
  let pricing = FB.prices[type.type] || null;
  if (!pricing) {
    call('tiers:prices', type.type).then((r) => { FB.prices[type.type] = r; pricing = r; drawList(); }).catch((e) => { pricing = { error: e.message }; drawList(); });
  }
  const moved = view.moved || {};
  const edited = new Set(view.editedStyles || []);
  const changedTypes = new Set([...Object.keys(moved).map((k) => k.split('\t')[0]), ...[...edited].map((k) => k.split('|')[0])]);

  // left: categories, sorted into sections, with pins and one search box for categories and bases
  const cats = sidebar(view, changedTypes);

  // right: tiers
  const search = h('input', { type: 'search', placeholder: `Find a base in ${type.label.toLowerCase()}`, value: FB.search, style: { width: '260px' }, oninput: (e) => { FB.search = e.target.value; drawList(); } });
  const list = h('div', { class: 'fb-tiers' });
  const targets = type.tiers.filter((t) => t.hasBaseList && !t.generated && !t.special);

  const moveTo = async (bases, to, force = false) => {
    if (!bases.length) return;
    const r = await call('tiers:move', { type: type.type, bases, to, force });
    if (r?.leftOut?.some((n) => bases.includes(n))) toast(`Left out of the filter: ${bases.join(', ')}. The game doesn't know that name, and one unknown name stops the whole filter from loading.`);
    FB.selected.clear();
    delete FB.prices[type.type];
    toast(to === HIDE ? `Hidden: ${bases.join(', ')}` : `Moved to ${tierName({ tier: to })}: ${bases.join(', ')}`);
    renderFilters();
  };

  function chip(base, tier) {
    const key = `${type.type}\t${base}`;
    // only items that belong in another tier are coloured; the rest stay plain
    const fit0 = FB.priceColors ? pricing?.fit?.[`${tier.tier}\t${base}`] : null;
    const fitInfo = fit0?.level === 'bad' ? fit0 : null;
    const price = pricing?.prices?.[base];
    const sugg = pricing?.suggestions?.find((x) => x.base === base && x.from === tier.tier);
    const from = moved[key];
    const st = tier.style || {};
    const c = (a, f) => (a ? `rgba(${a[0]},${a[1]},${a[2]},${(a[3] ?? 255) / 255})` : f);
    const selected = FB.selected.has(base);
    const el = h('button', {
      type: 'button',
      class: 'fb-chip' + (selected ? ' selected' : '') + (tier.action === 'Hide' ? ' hidden' : '') + (fitInfo ? ` fit-${fitInfo.level}` : '') + (price?.big ? ' spiked' : ''),
      draggable: 'true',
      title: fitInfo && price ? `${base}: ${fmtC(price.chaos)} now. ${({ good: 'Fits', warn: 'A bit off for', bad: 'Doesn\'t fit', none: 'No price band for' })[fitInfo.level]} ${tierName(tier)}${pricing?.tiers?.[tier.key]?.median != null ? ` (typically ${fmtC(pricing.tiers[tier.key].median)})` : ''}.${sugg ? ` Fits ${tierName({ tier: sugg.to })} better.` : ''}` : from !== undefined ? `You moved this here${from ? ` from ${tierName({ tier: from })}` : ''}. Click to select, drag to move.` : 'Click to select, drag to another tier to move',
      // plain tag, not an item lookalike: the tier header already shows the look
      onclick: () => { selected ? FB.selected.delete(base) : FB.selected.add(base); drawList(); },
      ondragstart: (e) => {
        const bases = FB.selected.has(base) ? [...FB.selected] : [base];
        e.dataTransfer.setData('text/x-poe-bases', JSON.stringify(bases));
        e.dataTransfer.effectAllowed = 'move';
      },
    }, base,
      price ? h('span', { class: 'fb-price', title: price.max && price.max > price.chaos ? `Uniques on this base: ${fmtC(price.chaos)} to ${fmtC(price.max)}` : 'Current poe.ninja price' }, price.max && price.max > price.chaos * 2 ? `${fmtC(price.chaos)}–${fmtC(price.max)}` : fmtC(price.chaos)) : null,
      price?.big ? h('span', { class: `fb-spike ${price.trend.change > 0 ? 'up' : 'down'}`, title: `${window.Farm.pct(price.trend.change)} this week: ${fmtC(price.trend.old)} → ${fmtC(price.chaos)}. See "Big price changes" above for its graph.` }, window.Farm.pct(price.trend.change)) : null,
      sugg ? h('span', { class: `fb-sugg ${sugg.direction}`, title: `Worth ${fmtC(sugg.chaos)} now. Typical for ${tierName({ tier: sugg.to })} (${fmtC(sugg.typicalTo)}), not ${tierName({ tier: sugg.from })} (${fmtC(sugg.typicalFrom)}).` }, sugg.direction === 'up' ? '▲' : '▼') : null,
      from !== undefined ? h('span', { class: 'fb-moved', 'aria-label': 'moved by you' }) : null);
    if (tier.tier === HIDDEN_TIER || from !== undefined) {
      return h('span', { class: 'fb-chip-wrap' }, el, h('button', { class: 'fb-undo', title: 'Put it back where the filter had it', 'aria-label': `Undo move of ${base}`, onclick: async () => { await call('tiers:reset', { type: type.type, base }); renderFilters(); } }, '×'));
    }
    return el;
  }

  // ---- a tier's own conditions, FilterBlade style: item level / area level / quality sliders,
  // rarity, and the bases as boxes you can untick ----
  const COND_LABEL = { ItemLevel: 'Item level', AreaLevel: 'Area level', Quality: 'Quality' };
  const COND_MAX = { ItemLevel: 86, AreaLevel: 86, Quality: 30 };
  function hasCondEditor(t) {
    if (t.generated || t.stackSize) return false;
    return !!(t.implied || (t.numbers && Object.values(t.numbers).some(Boolean)));
  }
  function condEditor(t) {
    const mine = (S.settings.tierPatch?.conditions || {})[t.key] || {};
    const setCond = async (field, value) => { await call('tiers:cond', { key: t.key, field, value }); renderFilters(); };
    const numberRow = (k) => {
      const cur = t.numbers?.[k];
      const op = cur ? (cur.op === '>' ? '>=' : cur.op === '<' ? '<=' : cur.op) : 'any';
      const max = COND_MAX[k];
      const box = h('input', { type: 'number', min: 0, max: 100, value: cur ? cur.value : '', disabled: op === 'any', class: 'il-box', 'aria-label': `${COND_LABEL[k]} value` });
      const range = h('input', { type: 'range', min: 0, max, value: cur ? Math.min(max, cur.value) : 0, disabled: op === 'any', class: 'il-range', 'aria-label': COND_LABEL[k] });
      const paint = (v) => range.style.setProperty('--il', `${(Math.min(max, v) / max) * 100}%`);
      paint(cur ? cur.value : 0);
      const sel = h('select', { 'aria-label': `${COND_LABEL[k]}: how`, onchange: (e) => {
        const o = e.target.value;
        if (o === 'any') return setCond(k, 'any');
        setCond(k, { op: o, value: Number(box.value) || (k === 'Quality' ? 20 : 68) });
      } }, [['any', 'any'], ['>=', '≥ at least'], ['<=', '≤ at most'], ['=', '= exactly']].map(([v, l]) => h('option', { value: v, selected: op === v }, l)));
      let timer = null;
      const send = (v) => { clearTimeout(timer); timer = setTimeout(() => setCond(k, { op: op === 'any' ? '>=' : op, value: v }), 400); };
      range.addEventListener('input', () => { box.value = range.value; paint(range.value); send(Number(range.value)); });
      box.addEventListener('change', () => { const v = Math.max(0, Math.min(100, Math.round(Number(box.value) || 0))); box.value = v; range.value = Math.min(max, v); paint(v); send(v); });
      const changed = mine[k] !== undefined;
      return h('div', { class: 'fb-cond' }, h('span', { class: 'fb-cond-l' }, COND_LABEL[k]), sel, box, range,
        changed ? h('button', { class: 'quiet sm', title: 'Back to the filter\'s value', onclick: () => setCond(k, null) }, 'Reset') : h('span'));
    };
    // rarity (normal / magic / rare) when the tier asks for it
    const rarRow = t.rarity ? h('div', { class: 'fb-cond' }, h('span', { class: 'fb-cond-l' }, 'Rarity'),
      h('div', { class: 'fb-rar', style: { gridColumn: '2 / 5' } }, ['Normal', 'Magic', 'Rare'].map((r) => {
        const on = t.rarity.includes(r);
        return h('button', { type: 'button', class: 'fb-check' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => {
          const next = on ? t.rarity.filter((x) => x !== r) : [...t.rarity, r];
          if (!next.length) return toast('Keep at least one rarity.', true);
          setCond('Rarity', ['Normal', 'Magic', 'Rare'].filter((x) => next.includes(x)));
        } }, (on ? '☑ ' : '☐ ') + r);
      })), mine.Rarity ? h('button', { class: 'quiet sm', onclick: () => setCond('Rarity', null) }, 'Reset') : h('span')) : null;
    // the bases: every one the tier has (or stands for), unticked = switched off for this tier
    const excluded = new Set(mine.exclude || []);
    const all = t.implied ? t.implied : [...t.bases, ...[...excluded].filter((b) => !t.bases.includes(b))];
    const baseBox = (t.implied || t.special) && all.length ? h('div', { class: 'fb-checks' }, all.map((b) => {
      const on = !excluded.has(b);
      return h('button', { type: 'button', class: 'fb-check' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', title: on ? `Switch ${b} off for this tier` : `Switch ${b} back on`, onclick: () => {
        const next = new Set(excluded);
        if (on) next.add(b); else next.delete(b);
        if (next.size >= all.length) return toast('Keep at least one base in the tier.', true);
        setCond('exclude', next.size ? [...next] : null);
      } }, (on ? '☑ ' : '☐ ') + b);
    })) : null;
    return h('div', { class: 'fb-conds' }, baseBox, ['ItemLevel', 'AreaLevel', 'Quality'].map(numberRow), rarRow);
  }

  function tierCard(t) {
    const isEditing = FB.editing === t.key;
    const q = FB.search.trim().toLowerCase();
    const bases = q ? t.bases.filter((b) => b.toLowerCase().includes(q)) : t.bases;
    if (q && !bases.length) return null;
    // the label shows the tier's most valuable item (by today's poe.ninja price), else its first one
    const priced = (list) => list.filter((b) => Number.isFinite(pricing?.prices?.[b]?.chaos)).sort((a, b) => (pricing.prices[b].max ?? pricing.prices[b].chaos) - (pricing.prices[a].max ?? pricing.prices[a].chaos));
    const sample = priced(bases)[0] || bases[0] || priced(t.bases)[0] || t.bases[0] || t.implied?.[0] || type.label;
    const preview = h('div', { class: 'fb-preview' });
    const drawPreview = () => {
      const st = isEditing ? FB.draft : t.style;
      // shrink long names so the whole name fits (the game shows the full name too)
      const size = window.UI.normalizeStyle(st).fontSize || 32;
      // one zoom per name, worked out for the biggest text (45), so a smaller text size really looks smaller
      const scale = Math.max(0.55, Math.min(1, 500 / (sample.length * 45 * 0.6 * 0.6 + 40)));
      mount(preview, dropLabel(sample, st, { rarity: rarityFor(type.type), scale, game: true, hidden: t.action === 'Hide' }), soundButton(window.UI.normalizeStyle(st).sound));
    };
    drawPreview();
    const folded = FB.collapsed.has(t.key);
    const fold = h('button', { class: 'fb-fold', 'aria-expanded': folded ? 'false' : 'true', 'aria-label': folded ? `Show the items of ${tierName(t)}` : `Fold ${tierName(t)}`, title: folded ? 'Show the items' : 'Fold this tier', onclick: () => { folded ? FB.collapsed.delete(t.key) : FB.collapsed.add(t.key); drawList(); } }, folded ? '▸' : '▾');
    const changedAction = view.editedActions && view.editedActions[t.key];
    const state = t.state || (t.off ? 'Off' : t.action);
    const hidden = state === 'Hide' || state === 'Off';
    const setAction = async (want) => {
      if (want === state) return;
      await call('tiers:action', { key: t.key, action: want });
      toast(want === 'Hide' ? `${tierName(t)} is now hidden in game` : want === 'Off' ? `${tierName(t)} is switched off: the game skips it` : `${tierName(t)} is now shown in game`);
      delete FB.prices[type.type];
      renderFilters();
    };
    const visSwitch = t.generated ? null : h('div', { class: 'fb-vis', role: 'group', 'aria-label': `${tierName(t)} in game` },
      [['Show', 'Shown', 'Items in this tier show with this look'], ['Hide', 'Hidden', 'Items in this tier are hidden'], ['Off', 'Off', 'Switched off, like FilterBlade\'s strictness does: the game skips this tier and the items fall through to the rules below it']].map(([v, label, tip]) =>
        h('button', { class: state === v ? `on${v === 'Hide' ? ' hide' : v === 'Off' ? ' off' : ''}` : '', title: tip, 'aria-pressed': state === v ? 'true' : 'false', onclick: () => setAction(v) }, label)));
    const head = h('div', { class: 'fb-tier-head ground' },
      fold,
      preview,
      h('div', { class: 'fb-tier-meta' },
        h('div', { class: 'fb-tier-name' }, tierName(t),
          t.mine ? h('span', { class: 'pill', style: { marginLeft: '8px' } }, 'Your tier') : null,
          t.mine ? h('button', { class: 'quiet sm', title: 'Rename this tier', 'aria-label': `Rename ${tierName(t)}`, onclick: async () => { const n = prompt('Name of this tier', tierName(t)); if (n && n.trim()) { await call('tiers:rename', { type: type.type, tier: t.tier, name: n }); renderFilters(); } } }, '✎') : null,
          t.mine ? h('button', { class: 'quiet sm', title: 'Delete this tier; its items go back to where the filter had them', 'aria-label': `Delete ${tierName(t)}`, onclick: async () => { if (!confirm(`Delete ${tierName(t)}? Its items go back to where your filter had them.`)) return; await call('tiers:remove', { type: type.type, tier: t.tier }); delete FB.prices[type.type]; toast(`${tierName(t)} deleted`); renderFilters(); } }, 'Delete') : null, changedAction ? h('span', { class: 'pill warn', style: { marginLeft: '8px' } }, changedAction === 'Hide' ? 'Hidden by you' : changedAction === 'Off' ? 'Off by you' : t.origState === 'Off' ? 'Switched on by you' : 'Shown by you') : !changedAction && state === 'Off' ? h('span', { class: 'pill', style: { marginLeft: '8px' }, title: 'FilterBlade switched this tier off for your strictness. Press Shown to use it.' }, 'Off in FilterBlade') : null, edited.has(t.key) ? h('span', { class: 'pill warn', style: { marginLeft: '8px' } }, 'Your look') : null),
        h('div', { class: 'small', style: { color: '#9a9f8c' } }, t.hasBaseList ? `${t.bases.length} ${t.bases.length === 1 ? 'base' : 'bases'}` : t.special ? 'Special case' : 'Catches the rest of this category',
          pricing?.tiers?.[t.key]?.median != null ? `, typically ${fmtC(pricing.tiers[t.key].median)}` : ''),
        t.stackSize ? stackBox(t) : t.special ? h('div', { class: 'small', style: { color: '#7d8272' }, title: t.conditions.join('\n') }, `Only when: ${t.conditions.filter((c) => !/^(Class|Rarity|ItemLevel|AreaLevel|Quality)\b/.test(c)).join(', ') || 'the conditions below'}`) : null),
      h('span', { class: 'spacer' }),
      visSwitch,
      t.generated ? null : h('button', { class: isEditing ? 'primary sm' : 'sm', onclick: () => { if (isEditing) { FB.editing = null; } else { FB.editing = t.key; FB.draft = structuredClone(t.style || {}); } drawList(); } }, isEditing ? 'Close' : 'Edit look'));
    const canAdd = (t.hasBaseList && !t.special) || t.generated;
    const conds = !folded && hasCondEditor(t);
    const card = h('div', { class: 'fb-tier' + (t.generated ? ' generated' : '') + (hidden ? ' is-hidden' : '') + (state === 'Off' ? ' is-off' : ''), 'data-key': t.key }, head,
      conds ? condEditor(t) : null,
      folded || (conds && (t.implied || t.special)) ? null : t.hasBaseList ? h('div', { class: 'fb-chips' }, bases.map((b) => chip(b, t)), !bases.length ? h('span', { class: 'small faint' }, 'Empty. Drag bases here or add one below.') : null) : h('div', { class: 'fb-chips small faint' }, 'Items not listed in another tier land here. Bases can\'t be moved into it.'),
      folded || !canAdd ? null : addBox(t),
      isEditing && !folded ? lookEditor(t, () => drawList(), drawPreview) : null);
    // drop a sound file anywhere on the tier: it becomes this tier's drop sound
    if (!t.generated) {
      card.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); card.classList.add('drop-sound'); } });
      card.addEventListener('dragleave', (e) => { if (!card.contains(e.relatedTarget)) card.classList.remove('drop-sound'); });
      card.addEventListener('drop', async (e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault(); e.stopPropagation();
        card.classList.remove('drop-sound');
        if (e.target.closest?.('.sound-drop')) return; // the editor's own drop area handles it
        const file = e.dataTransfer.files[0];
        if (!/\.(mp3|wav|ogg)$/i.test(file.name)) return toast('Drop an .mp3, .wav or .ogg file to use it as this tier\'s sound.', true);
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        try {
          const snd = await call('sounds:import', { name: file.name, data: btoa(bin) });
          S.sounds = [...S.sounds.filter((x) => x.id !== snd.id), snd];
          const style = { ...(t.style || {}) };
          delete style.sound; delete style.customVolume;
          style.customSound = window.UI.soundPath(snd.id);
          await call('tiers:style', { key: t.key, style });
          playSound(snd.id);
          toast(`${tierName(t)} now plays "${snd.name}"`);
          renderFilters();
        } catch { /* toast shown */ }
      });
    }
    // drag & drop target
    if ((t.hasBaseList && !t.special) || t.generated) {
      const to = t.generated ? HIDE : t.tier;
      card.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-poe-bases')) { e.preventDefault(); card.classList.add('drop-target'); } });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('drop-target'); try { moveTo(JSON.parse(e.dataTransfer.getData('text/x-poe-bases')), to); } catch { /* ignore */ } });
    }
    return card;
  }

  /** "Stacks of at least [6]": change the stack size of a stacked tier. */
  function stackBox(t) {
    const inp = h('input', { type: 'number', min: 1, max: 5000, value: t.stackSize.value, style: { width: '72px' }, 'aria-label': `${tierName(t)} stack size` });
    const save = async () => {
      const v = Math.max(1, Math.round(Number(inp.value) || 0));
      if (!v || v === t.stackSize.value) return;
      await call('tiers:stack', { key: t.key, size: v });
      toast(`${tierName(t)}: stacks of ${v} or more`);
      renderFilters();
    };
    inp.addEventListener('change', save);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    return h('label', { class: 'row small', style: { gap: '6px', color: '#9a9f8c', flexWrap: 'nowrap' } }, 'Stacks of at least', inp,
      view.conditions?.[t.key] || (S.settings.tierPatch?.conditions || {})[t.key] ? h('button', { class: 'quiet sm', title: 'Back to the filter\'s stack size', onclick: async () => { await call('tiers:stack', { key: t.key, size: null }); renderFilters(); } }, 'Reset') : null);
  }

  /** Type an item name: it goes into this tier and leaves every other tier of this category. */
  function addBox(t) {
    const to = t.generated ? HIDE : t.tier;
    const inp = h('input', { type: 'text', list: 'fb-names', placeholder: `Add an item to ${tierName(t)}`, 'aria-label': `Add an item to ${tierName(t)}`, autocomplete: 'off' });
    const msg = h('span', { class: 'small' });
    const known = () => FB.names[type.type] || [];
    const add = async (force = false) => {
      const raw = inp.value.trim();
      if (!raw) return;
      const exact = known().find((n) => n.toLowerCase() === raw.toLowerCase());
      const name = exact || raw;
      if (t.bases.some((b) => b.toLowerCase() === name.toLowerCase())) { mount(msg, h('span', { class: 'muted' }, `${name} is already in ${tierName(t)}.`)); return; }
      if (!exact && known().length && !force) {
        // only items of this category go in; the list below the box shows them as you type
        const close = known().filter((n) => n.toLowerCase().includes(raw.toLowerCase())).slice(0, 4);
        mount(msg, h('span', { class: 'warn' }, `"${raw}" isn't one of the ${type.label.toLowerCase()}. `),
          close.length ? [h('span', { class: 'muted' }, 'Did you mean '), close.map((n, i) => [i ? ', ' : '', h('button', { class: 'quiet sm', onclick: () => { inp.value = n; add(); } }, n)]), '?'] : h('span', { class: 'muted' }, 'Pick a name from the list as you type.'));
        return;
      }
      const from = type.tiers.find((x) => x.bases.includes(name));
      await moveTo([name], to, force);
      toast(from ? `${name} moved from ${tierName(from)} to ${tierName(t)}` : `${name} added to ${tierName(t)}`);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    inp.addEventListener('focus', loadNames, { once: true });
    inp.addEventListener('input', () => mount(msg));
    return h('div', { class: 'fb-add' }, inp, h('button', { class: 'sm', onclick: () => add() }, 'Add'), msg);
  }

  async function loadNames() {
    if (FB.names[type.type]) return;
    FB.names[type.type] = [];
    try { FB.names[type.type] = await call('tiers:suggest', type.type); } catch { /* typing still works */ }
    const dl = document.getElementById('fb-names');
    if (dl) mount(dl, FB.names[type.type].map((n) => h('option', { value: n })));
  }

  // a drop zone for hiding when nothing is hidden yet
  function hideZone() {
    if (type.tiers.some((t) => t.generated)) return null;
    const z = h('div', { class: 'fb-hidezone' }, 'Drop bases here to hide them');
    z.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-poe-bases')) { e.preventDefault(); z.classList.add('drop-target'); } });
    z.addEventListener('dragleave', () => z.classList.remove('drop-target'));
    z.addEventListener('drop', (e) => { e.preventDefault(); try { moveTo(JSON.parse(e.dataTransfer.getData('text/x-poe-bases')), HIDE); } catch { /* ignore */ } });
    return z;
  }

  // fractured / synthesised copies of the bases you hid (gear-like categories only)
  function fracturedBox() {
    if (/^(currency|stacked|divination|fragments|uniques|gems|maps|scarab|delirium|harvest|blight|ritual|essence|delve|heist|kingsmarch|event|gold|leveling|misc|leaguespecific)/.test(type.type)) return null;
    if (!type.tiers.some((t) => t.generated || (t.state || t.action) === 'Hide')) return null;
    const sw = (key, word) => h('label', { class: 'check small' },
      h('input', { type: 'checkbox', checked: !!S.settings[key], onchange: async (e) => {
        await call('settings:set', { [key]: e.target.checked });
        S.settings[key] = e.target.checked;
        toast(e.target.checked ? `Bases you hid are hidden when ${word} too` : `${word[0].toUpperCase() + word.slice(1)} copies of hidden bases show again`);
      } }), `Also when ${word}`);
    return h('div', { class: 'fb-fracbox' },
      h('span', { class: 'small muted' }, 'Bases you hid:'), sw('hideFractured', 'fractured'), sw('hideSynthesised', 'synthesised'),
      h('span', { class: 'small faint' }, 'The filter shows fractured and synthesised items in their own tiers above your hides. Uniques always show. Applies to every category.'));
  }

  const bar = h('div', { class: 'fb-selbar' });
  function drawBar() {
    if (!FB.selected.size) return mount(bar);
    const sel = h('select', { 'aria-label': 'Move to tier' }, targets.map((t) => h('option', { value: t.tier }, `${tierName(t)}${t.action === 'Hide' ? ' (hidden)' : ''}`)));
    mount(bar, h('div', { class: 'fb-selbar-in' },
      h('b', {}, `${FB.selected.size} selected`),
      h('span', { class: 'muted small', style: { maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [...FB.selected].join(', ')),
      h('span', { class: 'spacer' }),
      targets.length ? h('span', { class: 'small muted' }, 'Move to') : h('span', { class: 'small muted' }, 'This category only has special tiers, so bases can only be hidden'),
      targets.length ? sel : null,
      targets.length ? h('button', { class: 'primary', onclick: () => moveTo([...FB.selected], sel.value) }, 'Move') : null,
      h('button', { onclick: () => moveTo([...FB.selected], HIDE) }, 'Hide'),
      h('button', { class: 'quiet', onclick: () => { FB.selected.clear(); drawList(); } }, 'Clear')));
  }

  function addRow() {
    const q = FB.search.trim();
    if (q.length < 3) return null;
    const exists = type.tiers.some((t) => t.bases.some((b) => b.toLowerCase() === q.toLowerCase()));
    if (exists) return null;
    const sel = h('select', {}, targets.map((t) => h('option', { value: t.tier }, tierName(t))), h('option', { value: HIDE }, 'Hidden'));
    return h('div', { class: 'panel row', style: { marginBottom: '10px' } },
      h('span', { class: 'small' }, `"${q}" isn't in ${type.label.toLowerCase()} yet. Add it to`), sel,
      h('button', { class: 'primary sm', onclick: () => moveTo([q], sel.value) }, 'Add'),
      h('span', { class: 'small faint' }, 'Use the exact in-game base name.'));
  }

  function priceBanner() {
    if (!pricing) return h('div', { class: 'fb-pricebar' }, h('span', { class: 'spin' }), ' Loading current prices from poe.ninja');
    if (pricing.error) return h('div', { class: 'fb-pricebar' }, `Couldn't load prices: ${pricing.error}`);
    if (!pricing.supported) return h('div', { class: 'fb-pricebar muted' }, 'poe.ninja has no prices for this category, so it can only be tiered by hand.');
    const n = pricing.suggestions.length;
    const filterDate = pricing.filterUpdated ? new Date(pricing.filterUpdated) : null;
    const c = pricing.counts || {};
    const legend = FB.priceColors ? h('div', { class: 'fb-legend' },
      h('span', { class: 'fit-key bad' }, `${c.bad || 0} ${c.bad === 1 ? 'item belongs' : 'items belong'} in another tier`),
      h('span', { class: 'small faint' }, 'Only those are marked. Hover one to see where it fits.')) : null;
    const bar = h('div', { class: 'fb-pricebar' },
      h('div', { style: { flex: 1 } },
        h('div', {}, `Prices from poe.ninja for ${pricing.league}, updated ${ago(pricing.ageMs)}.`, filterDate ? ` Your tiers are from FilterBlade on ${filterDate.toLocaleDateString()}.` : ''),
        h('div', { class: 'small muted' }, n ? `${n} ${n === 1 ? 'item is' : 'items are'} priced like a different tier now. ▲ worth more, ▼ worth less than their tier.` : 'Every priced item still fits its tier.'),
        legend),
      n ? h('button', { class: FB.showSuggestions ? 'primary sm' : 'sm', onclick: () => { FB.showSuggestions = !FB.showSuggestions; drawList(); } }, FB.showSuggestions ? 'Hide suggestions' : 'Review suggestions') : null);
    const big = Object.entries(pricing.prices || {}).filter(([, p]) => p.big).sort((a, b) => Math.abs(b[1].trend.change) - Math.abs(a[1].trend.change));
    const bigBox = big.length ? h('div', { class: 'fb-pricebar fb-bigchanges' },
      h('div', { class: 'small' }, h('b', {}, `${big.length} big price ${big.length === 1 ? 'change' : 'changes'} this week`), h('span', { class: 'faint' }, ' (doubled or halved on poe.ninja; marked in the tiers below)')),
      h('div', { class: 'fb-bigrows' }, big.slice(0, 12).map(([name, p]) => h('span', { class: 'fb-bigrow' },
        h('span', {}, name), h('span', { class: 'small muted' }, `${fmtC(p.trend.old)} → ${fmtC(p.chaos)}`), window.Farm.trendBadge(p.trend.change),
        window.Farm.graphButton({ name, chaos: p.chaos, old: p.trend.old, change: p.trend.change, points: p.trend.points }, pricing.divine, ''))))) : null;
    if (!n || !FB.showSuggestions) return bigBox ? h('div', { class: 'stack', style: { gap: '8px' } }, bar, bigBox) : bar;
    const rows = pricing.suggestions.map((x) => h('tr', {},
      h('td', {}, h('span', { class: `fb-sugg ${x.direction}` }, x.direction === 'up' ? '▲' : '▼'), ' ', x.base),
      h('td', { class: 'r' }, fmtC(x.chaos)),
      h('td', { class: 'muted small' }, `${tierName({ tier: x.from })}, typically ${fmtC(x.typicalFrom)}`),
      h('td', { class: 'small' }, `${tierName({ tier: x.to })}${x.toAction === 'Hide' ? ' (hidden)' : ''}, typically ${fmtC(x.typicalTo)}`),
      h('td', { class: 'r' }, h('button', { class: 'sm', onclick: () => moveTo([x.base], x.to) }, 'Move'))));
    return h('div', { class: 'stack', style: { gap: '8px' } }, bar,
      h('div', { class: 'panel', style: { padding: '8px 14px' } },
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'r' }, 'Now'), h('th', {}, 'Your tier'), h('th', {}, 'Fits'), h('th', {}))), h('tbody', {}, rows)),
        h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'small faint' }, 'Suggestions compare each price with the typical price of each tier in your filter.'), h('span', { class: 'spacer' }),
          h('button', { class: 'primary sm', onclick: async () => { for (const to of [...new Set(pricing.suggestions.map((x) => x.to))]) await call('tiers:move', { type: type.type, bases: pricing.suggestions.filter((x) => x.to === to).map((x) => x.base), to }); toast(`Moved ${n} items to the tiers their prices fit`); delete FB.prices[type.type]; renderFilters(); } }, `Move all ${n}`))));
  }

  /** Make your own tier, e.g. "Giga" above Tier 1 for mirror-level items, looking like the Divine Orb's tier. */
  function newTierBar() {
    const movable = type.tiers.filter((x) => x.hasBaseList && !x.special && !x.generated);
    if (!movable.length) return null;
    if (!FB.newTier) return h('div', { class: 'fb-newtier-btn' }, h('button', { class: 'sm', onclick: () => { FB.newTier = true; drawList(); } }, '+ New tier'));
    const divTier = movable.find((x) => x.bases.includes('Divine Orb')) || movable[0];
    const name = h('input', { placeholder: type.type === 'currency' && !type.tiers.some((x) => x.customName === 'Giga') ? 'Giga' : 'Tier name', 'aria-label': 'New tier name', style: { width: '150px' } });
    const look = h('select', { 'aria-label': 'Looks like' }, movable.map((x) => h('option', { value: x.tier, selected: x === divTier }, `${tierName(x)}${x.bases.includes('Divine Orb') ? ' (Divine Orb)' : ''}`)));
    const place = h('select', { 'aria-label': 'Place it above' }, type.tiers.filter((x) => !x.generated).map((x, i) => h('option', { value: x.tier, selected: i === 0 }, tierName(x))));
    const create = async () => {
      const r = await call('tiers:add', { type: type.type, name: name.value.trim() || name.placeholder.replace('Tier name', 'My tier'), copyFrom: look.value, before: place.value });
      FB.newTier = false;
      toast('Tier added. Drag items onto it or type one into its box. Its look is a copy; change it with Edit look.');
      FB.collapsed.delete(`${type.type}|${r.tier}`);
      renderFilters();
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
    return h('div', { class: 'panel fb-newtier' },
      h('b', {}, 'New tier'), name,
      h('span', { class: 'small muted' }, 'looks like'), look,
      h('span', { class: 'small muted' }, 'above'), place,
      h('button', { class: 'primary sm', onclick: create }, 'Create'),
      h('button', { class: 'quiet sm', onclick: () => { FB.newTier = false; drawList(); } }, 'Cancel'));
  }

  /** Uniques: tier cards grouped by letter; a group with several tiers can be combined into one. */
  function letterGroups(cards) {
    if (!/^uniques/.test(type.type)) return cards;
    const ORDER = ['Yours', 'S', 'A', 'B+C', 'D', 'High variety'];
    const groups = new Map(ORDER.map((l) => [l, []]));
    const rest = [];
    type.tiers.forEach((t, i) => {
      if (!cards[i]) return;
      if (/^poehelper-/.test(t.tier) && !t.generated) return groups.get('Yours').push([t, cards[i]]);
      const u = uniqueTier(t);
      (u ? groups.get(u[0]) : rest).push([t, cards[i]]);
    });
    const out = [];
    for (const [letter, list] of groups) {
      if (!list.length) continue;
      const movable = list.filter(([t]) => t.hasBaseList && !t.special && !t.generated);
      const combine = movable.length > 1 && letter !== 'Yours' ? h('button', { class: 'quiet sm', title: `Move every base of the ${letter} tiers into ${tierName(movable[0][0])}`, onclick: async () => {
        const into = movable[0][0];
        const bases = movable.slice(1).flatMap(([t]) => t.bases);
        if (!bases.length) return toast('Nothing to combine: the other tiers are empty.');
        if (!confirm(`Combine the ${letter} tiers? ${bases.length} bases move into ${tierName(into)}; the emptied tiers stay and can be refilled.`)) return;
        await call('tiers:move', { type: type.type, bases, to: into.tier });
        toast(`${letter} tiers combined into ${tierName(into)}`);
        delete FB.prices[type.type];
        renderFilters();
      } }, `Combine into one ${letter} tier`) : null;
      out.push(h('div', { class: 'fb-lettergroup' }, h('div', { class: 'fb-letter' }, h('b', {}, letter === 'Yours' ? 'Your tiers' : letter === 'High variety' ? 'High variety tiers' : `${letter} tier${list.length > 1 ? 's' : ''}`), h('span', { class: 'spacer' }), combine), list.map(([, c]) => c)));
    }
    if (rest.length) out.push(h('div', { class: 'fb-lettergroup' }, h('div', { class: 'fb-letter' }, h('b', {}, 'Special cases')), rest.map(([, c]) => c)));
    return out;
  }

  function drawList() {
    const cards = letterGroups(type.tiers.map(tierCard)).filter(Boolean);
    mount(list, categoryOf(type.type)?.clusters ? clusterPanel() : null, priceBanner(), newTierBar(), addRow(), cards.length ? cards : h('div', { class: 'panel empty' }, 'No base matches your search.'), hideZone(), fracturedBox(),
      h('datalist', { id: 'fb-names' }, (FB.names[type.type] || []).map((n) => h('option', { value: n }))));
    drawBar();
  }
  drawList();

  mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, iconPicker(type.type), h('h2', {}, type.key === CLUSTER_SIZE_TYPE ? 'Cluster jewels: looks by size' : merge ? merge.label : type.label), h('span', { class: 'small muted' }, 'Click bases to select them, or drag them between tiers.'), h('span', { class: 'spacer' }),
        type.key === CLUSTER_SIZE_TYPE ? h('button', { class: 'sm', onclick: () => { FB.type = CLUSTER_GRID; renderFilters(); } }, '← Back to the enchantments') : null,
        h('button', { class: FB.priceColors ? 'primary sm' : 'sm', title: 'Colour every item by how well its current poe.ninja price fits its tier', onclick: () => {
          FB.priceColors = !FB.priceColors;
          // a fresh analysis when turning colours on (prices come from the 20-minute cache, so this is cheap)
          if (FB.priceColors) delete FB.prices[type.type];
          renderFilters();
        } }, FB.priceColors ? 'Hide price colours' : 'Check prices'),
        h('button', { class: 'sm', title: 'Thresholds, Include and hourly auto-update for this category', onclick: async () => {
          FB.tab = 'review'; FB.reviewOpen.add(type.type); FB.reviewOpen.delete('!' + type.type);
          renderFilters();
          if (!FB.review?.categories?.some((c) => c.type === type.type)) { try { await runReview(FB.review ? [type.type] : null); } catch { /* toast */ } renderFilters(); }
          if (FB.review && !FB.review.categories.some((c) => c.type === type.type)) toast(`poe.ninja has no prices for ${type.label}, so it can't be auto-tiered.`);
        } }, 'Auto-tier…'),
        search),
      partSwitch,
      list)),
  bar);
}

// ---------------------------------------------------------------- cluster jewels
const CLUSTER_BASES = ['Large Cluster Jewel', 'Medium Cluster Jewel', 'Small Cluster Jewel'];
/** Cluster jewel rules: base, item level and number of passives; shown or hidden above your tiers. */
function clusterPanel() {
  const rules = (S.settings.myBases || []).filter((e) => e.group === 'cluster');
  const num = (v) => (v === '' ? null : +v);
  const upd = async (id, patch) => { await call('bases:update', { id, patch }); renderFilters(); };
  const numIn = (val, label, onchange, max = 100) => h('input', { type: 'number', min: 1, max, value: val ?? '', placeholder: 'any', style: { width: '62px' }, 'aria-label': label, onchange });
  const row = (e) => h('tr', { class: e.enabled === false ? 'rv-excluded' : '' },
    h('td', {}, h('input', { type: 'checkbox', checked: e.enabled !== false, 'aria-label': `Use ${e.base} rule`, onchange: (ev) => upd(e.id, { enabled: ev.target.checked }) })),
    h('td', {}, h('select', { 'aria-label': 'Show or hide', onchange: (ev) => upd(e.id, { action: ev.target.value }) }, ['Show', 'Hide'].map((a) => h('option', { value: a, selected: (e.action || 'Show') === a }, a === 'Show' ? 'Highlight' : 'Hide')))),
    h('td', {}, h('select', { 'aria-label': 'Cluster jewel base', onchange: (ev) => upd(e.id, { base: ev.target.value }) }, CLUSTER_BASES.map((b) => h('option', { value: b, selected: e.base === b }, b)))),
    h('td', {}, h('span', { class: 'row small', style: { gap: '4px', flexWrap: 'nowrap' } }, numIn(e.ilvlMin, 'Lowest item level', (ev) => upd(e.id, { ilvlMin: num(ev.target.value) })), h('span', { class: 'muted' }, 'to'), numIn(e.ilvlMax, 'Highest item level', (ev) => upd(e.id, { ilvlMax: num(ev.target.value) })))),
    h('td', {}, h('span', { class: 'row small', style: { gap: '4px', flexWrap: 'nowrap' } }, numIn(e.passivesMin, 'Fewest passives', (ev) => upd(e.id, { passivesMin: num(ev.target.value) }), 12), h('span', { class: 'muted' }, 'to'), numIn(e.passivesMax, 'Most passives', (ev) => upd(e.id, { passivesMax: num(ev.target.value) }), 12))),
    h('td', { class: 'r' }, h('button', { class: 'quiet sm', onclick: async () => { await call('bases:remove', e.id); renderFilters(); } }, 'Remove')));
  const base = h('select', { 'aria-label': 'New rule base' }, CLUSTER_BASES.map((b) => h('option', { value: b }, b)));
  const lo = h('input', { type: 'number', min: 1, max: 100, value: 84, style: { width: '62px' }, 'aria-label': 'New rule lowest item level' });
  const pLo = h('input', { type: 'number', min: 1, max: 12, placeholder: 'any', style: { width: '62px' }, 'aria-label': 'New rule fewest passives' });
  const pHi = h('input', { type: 'number', min: 1, max: 12, placeholder: 'any', style: { width: '62px' }, 'aria-label': 'New rule most passives' });
  const act = h('select', { 'aria-label': 'New rule show or hide' }, h('option', { value: 'Show' }, 'Highlight'), h('option', { value: 'Hide' }, 'Hide'));
  const add = async () => {
    try { await call('bases:add', { group: 'cluster', base: base.value, ilvlMin: lo.value || null, passivesMin: pLo.value || null, passivesMax: pHi.value || null, action: act.value }); toast('Cluster jewel rule added'); renderFilters(); } catch { /* toast */ }
  };
  return h('div', { class: 'panel', style: { marginBottom: '12px' } },
    h('div', { class: 'row', style: { marginBottom: '6px' } }, h('b', {}, 'Cluster jewel rules'), h('span', { class: 'small muted' }, 'By base, item level and number of passives. Placed above your tiers; highlighted ones use the My bases look.')),
    rules.length ? h('table', { class: 'rv-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'On'), h('th', {}), h('th', {}, 'Base'), h('th', {}, 'Item level'), h('th', {}, 'Passives'), h('th', {}))), h('tbody', {}, rules.map(row))) : null,
    h('div', { class: 'row small', style: { marginTop: '8px' } }, act, base, h('span', { class: 'muted' }, 'item level from'), lo, h('span', { class: 'muted' }, 'passives'), pLo, h('span', { class: 'muted' }, 'to'), pHi, h('button', { class: 'primary sm', onclick: add }, 'Add rule')));
}

// ---------------------------------------------------------------- My bases
const MY_BASES = '__mybases__';
const BASE_MATRIX = '__basematrix__';
const CLUSTER_GRID = '__clustergrid__';
/** Rules from the price check's "Hide…" (and older extra rules), with on/off and delete. */
async function extraRulesPanel() {
  const rules = await call('filter:overrides').catch(() => []);
  if (!rules.length) return null;
  const save = async (next) => { await call('filter:saveOverrides', next); await call('filter:write').catch(() => {}); renderFilters(); };
  return h('div', { class: 'panel', style: { padding: '6px 14px', marginBottom: '12px' } },
    h('div', { class: 'row', style: { margin: '6px 0' } }, h('b', {}, 'Rules from the price check'), h('span', { class: 'small muted' }, 'Made with "Hide…" in the popup. They sit above your tiers.')),
    h('table', { class: 'rv-table' }, h('tbody', {}, rules.map((r, i) => h('tr', { class: r.enabled === false ? 'rv-excluded' : '' },
      h('td', { style: { width: '28px' } }, h('input', { type: 'checkbox', checked: r.enabled !== false, 'aria-label': `Use ${r.label}`, onchange: (e) => save(rules.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x))) })),
      h('td', {}, h('span', { class: r.action === 'Hide' ? 'pill bad' : 'pill' }, r.action === 'Hide' ? 'Hide' : 'Show'), ' ', r.label),
      h('td', { class: 'r' }, h('button', { class: 'quiet sm', onclick: () => save(rules.filter((_, j) => j !== i)) }, 'Delete')))))));
}

// ---------------------------------------------------------------- base visibility matrix
// Like FilterBlade's matrix: pick a brush, then click or drag over bases. Each base has two settings:
// whether you see it at all (in maps), and what happens when it drops fractured.
const BRUSHES = [
  { id: 'S', label: 'S', rank: 'S', title: 'Paint rank S, the best' },
  { id: 'A', label: 'A', rank: 'A', title: 'Paint rank A' },
  { id: 'B', label: 'B', rank: 'B', title: 'Paint rank B' },
  { id: 'C', label: 'C', rank: 'C', title: 'Paint rank C' },
  { id: 'D', label: 'D', rank: 'D', title: 'Paint rank D: untiered, the lowest' },
  { id: 'hide', label: 'Hide plain drops', vis: 'hide', title: 'Hide plain (normal, magic, rare) copies of this base, whatever the rank' },
  { id: 'show', label: 'Unhide', vis: null, title: 'Plain copies back to your filter and the ranks' },
];

// ---------------------------------------------------------------- cluster jewels
// One grid per jewel size: enchantments down, passives across, for one item level band at a time.
// Each cell shows poe.ninja's price and what your filter does; paint cells to show them with the
// filter's top (T1) or good (T2) look, or hide them.
const CJ_BRUSHES = [
  { id: 'top', label: 'Top look', title: 'Show with the T1 cluster look (big, loud)' },
  { id: 'good', label: 'Good look', title: 'Show with the T2 cluster look' },
  { id: 'hide', label: 'Hide', title: 'Hide these jewels' },
  { id: null, label: 'Filter decides', title: 'Back to what your filter does' },
];
async function renderClusterGrid(body, view) {
  const data = await call('cluster:get');
  const cats = sidebar(view, new Set());
  FB.cjBand = FB.cjBand || '84';
  if (FB.cjBrush === undefined) FB.cjBrush = 'top';
  let state = data.state || {};
  const d = data.divine;
  const fmtP = (c) => (c == null ? '' : d && c >= d * 0.95 ? `${+(c / d).toFixed(c >= d * 10 ? 0 : 1)} div` : `${c >= 10 ? Math.round(c) : +c.toFixed(1)}c`);
  const eff = (k) => state[k] || (data.filter[k] === 't1' ? 'top' : data.filter[k] === 't2' ? 'good' : null);
  // cells no economy tier or choice of yours covers fall back to the filter's "by size" tiers
  const sizeTier = (k) => { const [sz, , p, b] = k.split('|'); return data.bySize?.[`${sz}|*|${p}|${b}`] || null; };
  const col = (a) => (a ? `rgba(${+a[0] || 0},${+a[1] || 0},${+a[2] || 0},${((a[3] == null ? 255 : +a[3]) / 255).toFixed(3)})` : '');
  const cellCls = (k) => {
    const e = eff(k);
    const st = e ? null : sizeTier(k);
    const fall = st ? (st.action === 'Hide' ? ' cj-fhide' : ' cj-size') : '';
    return 'cj-cell' + (e ? ` cj-${e}` : fall) + (state[k] ? ' mine' : '') + ((data.prices[k] || 0) >= (d || 200) ? ' rich' : '');
  };
  const cellLook = (el, k) => {
    el.className = cellCls(k);
    const st = eff(k) ? null : sizeTier(k);
    const look = st && st.action !== 'Hide' && st.style ? window.UI.normalizeStyle(st.style, 'Rare') : null;
    el.style.color = look ? col(look.text) : '';
    el.style.background = look ? (col(look.background) || 'rgba(0,0,0,0.72)') : '';
    el.style.borderColor = look ? (col(look.border) || 'transparent') : '';
    return el;
  };
  const sizeTierName = (st) => (st ? tierName({ tier: st.tier, type: 'jewels->cluster' }) : '');
  const cellTitle = (size, e, p, k) => {
    const own = state[k];
    const ns = data.filter[k];
    return `${size} cluster, ${p} passives, ${e}, ${data.bands.find((b) => b.id === FB.cjBand).name.toLowerCase()}.\n` +
      `${data.prices[k] ? `poe.ninja: ${fmtP(data.prices[k])}. ` : 'No poe.ninja price. '}` +
      `Your filter: ${ns === 't1' ? 'top look' : ns === 't2' ? 'good look' : sizeTier(k) ? `${sizeTier(k).action === 'Hide' ? 'hidden by' : 'shown by'} the "${sizeTierName(sizeTier(k))}" tier` : 'no special tier'}.${own ? ` You set: ${own === 'top' ? 'top look' : own === 'good' ? 'good look' : 'hidden'}.` : ''}`;
  };

  const els = new Map();
  const paint = (keys) => {
    for (const k of keys) {
      if (FB.cjBrush) state[k] = FB.cjBrush; else delete state[k];
      for (const el of els.get(k) || []) cellLook(el, k);
    }
  };
  const commit = async (keys) => {
    if (!keys.length) return;
    const r = await call('cluster:set', { keys: [...new Set(keys)], value: FB.cjBrush });
    state = r.state; S.settings.clusterGrid = r.state;
    drawCount();
  };
  // left click steps a cell up the ladder, right click steps it down: hidden, filter decides (cheap,
  // by size), good look, top look. Dragging over cells still paints them with the brush.
  const LADDER = ['hide', null, 'good', 'top'];
  const filterOwn = (k) => (data.filter[k] === 't1' ? 'top' : data.filter[k] === 't2' ? 'good' : null);
  const step = async (keys, dir) => {
    const byValue = new Map();
    for (const k of keys) {
      const cur = state[k] || filterOwn(k);
      const i = Math.max(0, Math.min(LADDER.length - 1, LADDER.indexOf(cur) + dir));
      let v = LADDER[i];
      if (v === filterOwn(k)) v = null; // that's what the filter does anyway
      if (v) state[k] = v; else delete state[k];
      for (const el of els.get(k) || []) cellLook(el, k);
      if (!byValue.has(v)) byValue.set(v, []);
      byValue.get(v).push(k);
    }
    for (const [v, ks] of byValue) { const r = await call('cluster:set', { keys: ks, value: v }); state = r.state; }
    S.settings.clusterGrid = state;
    drawCount();
  };
  let painting = null;
  let moved = false;
  if (!window.cjMouseUp) window.addEventListener('mouseup', () => window.cjMouseUp?.());
  window.cjMouseUp = () => {
    if (!painting) return;
    const ks = painting; painting = null;
    if (moved) commit(ks); else step(ks, +1);
  };

  const grid = (size) => {
    const keyOf = (e, p) => `${size.id}|${e}|${p}|${FB.cjBand}`;
    const cell = (e, p) => {
      const k = keyOf(e, p);
      const el = h('button', {
        type: 'button', class: cellCls(k), title: cellTitle(size.id, e, p, k),
        onmousedown: (ev) => { if (ev.button !== 0) return; ev.preventDefault(); painting = [k]; moved = false; },
        onmouseenter: () => { if (painting && !painting.includes(k)) { if (!moved) { moved = true; paint(painting); } painting.push(k); paint([k]); } },
        oncontextmenu: (ev) => { ev.preventDefault(); step([k], -1); },
        onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowUp' || ev.key === '+') { ev.preventDefault(); step([k], +1); } else if (ev.key === 'ArrowDown' || ev.key === '-' || ev.key === 'Delete') { ev.preventDefault(); step([k], -1); } },
      }, data.prices[k] ? fmtP(data.prices[k]) : '·');
      cellLook(el, k);
      if (!els.has(k)) els.set(k, []);
      els.get(k).push(el);
      return h('td', {}, el);
    };
    const rowAll = (e) => size.passives.map((p) => keyOf(e, p));
    return h('div', { class: 'panel cj-panel' },
      h('div', { class: 'cj-title' }, h('b', {}, `${size.id} cluster jewels`), h('span', { class: 'small faint' }, `${size.passives[0]}-${size.passives.at(-1)} passives`)),
      h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'cj-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Enchantment'), size.passives.map((p) => h('th', {},
          h('button', { class: 'cj-colhead', title: `Left click: every ${p}-passive ${size.id.toLowerCase()} jewel one step up. Right click: one step down.`, onclick: () => step(data.enchants[size.id].map((e) => keyOf(e, p)), +1), oncontextmenu: (ev) => { ev.preventDefault(); step(data.enchants[size.id].map((e) => keyOf(e, p)), -1); } }, `${p}`))))),
        h('tbody', {}, data.enchants[size.id].map((e) => h('tr', {},
          h('th', {}, h('button', { class: 'cj-rowhead', title: `Left click: every ${e} jewel one step up. Right click: one step down.`, onclick: () => step(rowAll(e), +1), oncontextmenu: (ev) => { ev.preventDefault(); step(rowAll(e), -1); } }, e)),
          size.passives.map((p) => cell(e, p))))))));
  };

  const count = h('span', { class: 'small muted' });
  function drawCount() {
    const v = Object.values(state);
    mount(count, `You set ${v.length}: ${v.filter((x) => x === 'top').length} top, ${v.filter((x) => x === 'good').length} good, ${v.filter((x) => x === 'hide').length} hidden`);
  }
  drawCount();

  // mark by price: every priced cell in this item level band
  const topIn = h('input', { type: 'text', value: FB.cjTop ?? (d ? '1 div' : '150c'), style: { width: '76px' }, 'aria-label': 'Top look from this price' });
  const goodIn = h('input', { type: 'text', value: FB.cjGood ?? '20c', style: { width: '76px' }, 'aria-label': 'Good look from this price' });
  const toChaos = (v) => { const m = /^\s*(\d+(?:[.,]\d+)?)\s*(c|chaos|d|div|divine)?\s*$/i.exec(v || ''); if (!m) return null; const n = Number(m[1].replace(',', '.')); return /^d/i.test(m[2] || '') ? (d ? n * d : null) : n; };
  const byPrice = async () => {
    FB.cjTop = topIn.value; FB.cjGood = goodIn.value;
    const top = toChaos(topIn.value); const good = toChaos(goodIn.value);
    if (top == null || good == null) return toast('Type prices like 1 div or 20c.', true);
    const tops = []; const goods = [];
    for (const size of data.sizes) for (const e of data.enchants[size.id]) for (const p of size.passives) {
      const k = `${size.id}|${e}|${p}|${FB.cjBand}`;
      const c = data.prices[k];
      if (c >= top) tops.push(k); else if (c >= good) goods.push(k);
    }
    if (!tops.length && !goods.length) return toast('No priced jewels over those prices in this item level band.');
    if (tops.length) await call('cluster:set', { keys: tops, value: 'top' });
    if (goods.length) await call('cluster:set', { keys: goods, value: 'good' });
    toast(`${tops.length} set to the top look, ${goods.length} to the good look`);
    renderFilters();
  };

  const sample = (look, name) => dropLabel(name, look, { rarity: 'Rare', scale: 0.55, game: true });
  mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, h('span', { class: 'fb-iconbtn' }, window.UI.icon('hex', { size: 22 })), h('h2', {}, 'Cluster jewels'),
        h('span', { class: 'small muted' }, 'The enchantment, the number of passives and the item level decide what a cluster jewel is worth.'),
        h('span', { class: 'spacer' }),
        view.types.some((t) => t.key === CLUSTER_SIZE_TYPE) ? h('button', { class: 'sm', title: 'The looks of the filter\'s size tiers, used for jewels without an economy tier or a choice of yours', onclick: () => { FB.type = CLUSTER_SIZE_TYPE; FB.selected.clear(); renderFilters(); } }, 'Edit the size looks') : null),
      h('div', { class: 'panel bm-tools' },
        h('div', { class: 'row', style: { gap: '10px' } },
          h('div', { class: 'fb-parts', role: 'tablist', 'aria-label': 'Item level', style: { margin: 0 } }, data.bands.map((b) => h('button', { role: 'tab', 'aria-selected': FB.cjBand === b.id ? 'true' : 'false', class: 'fb-part' + (FB.cjBand === b.id ? ' on' : ''), onclick: () => { FB.cjBand = b.id; renderFilters(); } }, b.name))),
          h('span', { class: 'spacer' }),
          h('div', { class: 'bm-brushes', role: 'radiogroup', 'aria-label': 'Brush' }, CJ_BRUSHES.map((b) => h('button', { class: `bm-brush cj-b-${b.id || 'none'}` + (FB.cjBrush === b.id ? ' on' : ''), role: 'radio', 'aria-checked': FB.cjBrush === b.id ? 'true' : 'false', title: b.title, onclick: () => { FB.cjBrush = b.id; renderFilters(); } }, b.label)))),
        h('div', { class: 'row small', style: { gap: '10px' } },
          h('b', {}, 'By price:'), 'top look from', topIn, 'good look from', goodIn,
          h('button', { class: 'sm', onclick: byPrice, title: 'Uses poe.ninja prices for the item level band you are looking at' }, 'Apply to this item level'),
          h('span', { class: 'spacer' }), count,
          h('button', { class: 'quiet sm', onclick: async () => { const ks = Object.keys(state); if (!ks.length || !confirm(`Clear all ${ks.length} cluster jewel choices? Your filter decides again.`)) return; await call('cluster:set', { keys: ks, value: null }); renderFilters(); } }, 'Reset all'))),
      h('div', { class: 'cj-legend small' },
        h('span', { class: 'cj-cell cj-top' }, 'Top'), sample(data.sizeLooks?.Large?.t1 || data.looks.t1, 'Large Cluster Jewel'),
        h('span', { class: 'cj-cell cj-good' }, 'Good'), sample(data.sizeLooks?.Large?.t2 || data.looks.t2, 'Large Cluster Jewel'),
        h('span', { class: 'cj-cell cj-hide' }, 'Hidden'),
        (() => { const st = Object.values(data.bySize || {}).find((x) => x.action !== 'Hide' && x.style); const el = h('span', { class: 'cj-cell cj-size' }, 'By size'); if (st) { const lk = window.UI.normalizeStyle(st.style, 'Rare'); el.style.color = col(lk.text); el.style.background = col(lk.background) || 'rgba(0,0,0,0.72)'; el.style.borderColor = col(lk.border) || 'transparent'; } return el; })(),
        h('span', { class: 'faint' }, 'filter\'s size tiers (e.g. Large: 12 passives, item level 84+)'),
        h('span', { class: 'cj-cell cj-fhide' }, 'hidden by size'),
        h('span', { class: 'cj-cell' }, '·'), h('span', { class: 'faint' }, 'no tier'),
        h('span', { class: 'cj-cell cj-top mine' }, 'set by you'),
        h('div', { class: 'faint', style: { flexBasis: '100%' } }, `Numbers are poe.ninja prices${data.ageMs != null ? `, updated ${ago(data.ageMs)}` : ''}; a dot means no price. Left click a cell to move it one step up (hidden → filter decides → good → top), right click one step down; an enchantment or a passive count does the same for its whole row or column. Drag over cells to paint them with the brush. Uniques are never affected.`)),
      data.hasFilterTiers ? null : h('div', { class: 'panel small muted' }, 'Your filter has no economy cluster tiers, so only your own choices are shown.'),
      data.priceStats ? h('details', { class: 'small muted cj-stats' },
        h('summary', {}, data.priceStats.total ? `poe.ninja lists ${data.priceStats.total} cluster jewels; ${data.priceStats.matched} matched a cell${data.priceStats.missed.length ? ` (${data.priceStats.total - data.priceStats.matched} didn't — open to see them)` : '.'}` : 'poe.ninja sent no cluster jewel prices.'),
        data.priceStats.missed.length ? h('table', { class: 'rv-table' }, h('tbody', {}, data.priceStats.missed.map((m) => h('tr', {}, h('td', {}, m.name), h('td', {}, m.variant), h('td', {}, m.base), h('td', {}, m.ilvl == null ? '' : `ilvl ${m.ilvl}`), h('td', { class: 'faint' }, `no ${m.why}`))))) : null) : null,
      h('div', { class: 'cj-grids' }, data.sizes.map(grid)))));
}

async function renderBaseMatrix(body, view) {
  const data = await call('matrix:get');
  const cats = sidebar(view, new Set());
  FB.matrixView = FB.matrixView || 'd:es';
  if (!BRUSHES.some((b) => b.id === FB.brush)) FB.brush = 'S';
  let state = data.state || {};
  let ranks = data.ranks || {};
  let kinds = data.kinds || {};
  const RANKS = data.rankList || ['S', 'A', 'B', 'C', 'D'];
  const LOW = RANKS[RANKS.length - 1]; // D: untiered, the default
  const rankOf = (n) => (RANKS.includes(ranks[n]) ? ranks[n] : LOW);
  const col = (a) => (a ? `rgba(${+a[0] || 0},${+a[1] || 0},${+a[2] || 0},${((a[3] == null ? 255 : +a[3]) / 255).toFixed(3)})` : '');
  // three parts: armours and weapons, jewellery, and the minion bases (a view: they keep their one rank)
  const SECTIONS = [['gear', 'Armours and Weapons'], ['jewellery', 'Jewellery']]; // minion bases sit in these; Hide whole groups has a button for all of them
  FB.rankSection = SECTIONS.some(([id]) => id === FB.rankSection) ? FB.rankSection : 'gear';
  const part = FB.rankSection;
  const gearGroups = (data.groups || []).filter((g) => g.id !== 'jewellery');
  const jewelGroup = (data.groups || []).find((g) => g.id === 'jewellery');
  if (part === 'gear' && FB.matrixView === 'g:jewellery') FB.matrixView = 'd:es';
  const [mode, key] = part === 'gear' ? FB.matrixView.split(':') : [part, ''];
  const byRank = FB.matrixByRank || mode === 'a' || mode === 'minion';

  // every base once, in class / defence order (for "All bases")
  const everything = () => {
    const seen = new Set(); const out = [];
    const add = (b) => { if (!seen.has(b.name)) { seen.add(b.name); out.push(b); } };
    for (const c of data.classes) for (const d of data.defences) (data.bases[c][d.id] || []).forEach(add);
    for (const g of gearGroups) for (const c of g.columns) c.list.forEach(add);
    return out;
  };
  const findBase = (n) => {
    for (const c of data.classes) for (const d of data.defences) { const b = (data.bases[c][d.id] || []).find((x) => x.name === n); if (b) return b; }
    for (const g of data.groups || []) for (const c of g.columns) { const b = c.list.find((x) => x.name === n); if (b) return b; }
    return { name: n };
  };
  // a defence type shows every class side by side; a class shows every defence type side by side
  let columns = mode === 'jewellery' ? (jewelGroup?.columns || [])
    : mode === 'minion' ? [{ title: 'Minion bases', list: (data.minionBases || []).map(findBase) }]
      : mode === 'd'
        ? data.classes.map((c) => ({ title: c, list: data.bases[c][key] || [] }))
        : mode === 'g'
          ? (gearGroups.find((g) => g.id === key) || gearGroups[0]).columns
          : mode === 'a' ? [{ title: 'All', list: everything() }]
            : data.defences.map((d) => ({ title: d.name, list: data.bases[key]?.[d.id] || [] }));
  const scope = (() => { const seen = new Set(); return columns.flatMap((c) => c.list).filter((b) => !seen.has(b.name) && seen.add(b.name)); })();
  // "Show by rank": the same bases, one column per rank, so you can see what's in and what's out
  const rankColumns = () => RANKS.map((r) => ({ title: r === LOW ? `${r} · untiered` : `Rank ${r}`, rank: r, list: scope.filter((b) => rankOf(b.name) === r) }));
  if (byRank) columns = rankColumns();
  // every column best rank first (S at the top, D at the bottom); the base order stays within a rank
  else columns = columns.map((c) => ({ ...c, list: c.list.map((b, i) => [b, i]).sort((x, y) => RANKS.indexOf(rankOf(x[0].name)) - RANKS.indexOf(rankOf(y[0].name)) || x[1] - y[1]).map(([b]) => b) }));

  const pick = h('select', { 'aria-label': 'Show bases by', onchange: (e) => { FB.matrixView = e.target.value; renderFilters(); } },
    h('option', { value: 'a:all', selected: mode === 'a' }, 'All bases'),
    h('optgroup', { label: 'Armour types' }, data.defences.map((d) => h('option', { value: `d:${d.id}`, selected: FB.matrixView === `d:${d.id}` }, d.name))),
    h('optgroup', { label: 'Armour classes' }, data.classes.map((c) => h('option', { value: `c:${c}`, selected: FB.matrixView === `c:${c}` }, c))),
    h('optgroup', { label: 'Weapons' }, gearGroups.map((g) => h('option', { value: `g:${g.id}`, selected: FB.matrixView === `g:${g.id}` }, g.name))));
  const sectionTabs = h('div', { class: 'fb-tabs bm-sections', role: 'tablist', 'aria-label': 'Which bases' }, SECTIONS.map(([id, label]) =>
    h('button', { role: 'tab', 'aria-selected': part === id ? 'true' : 'false', class: part === id ? 'active' : '', onclick: () => { FB.rankSection = id; renderFilters(); } }, label)));
  const rankToggle = h('label', { class: 'check small', title: mode === 'a' || mode === 'minion' ? 'These are always shown by rank' : 'One column per rank instead of per item type' },
    h('input', { type: 'checkbox', checked: byRank, disabled: mode === 'a' || mode === 'minion', onchange: (e) => { FB.matrixByRank = e.target.checked; renderFilters(); } }), 'Show by rank');

  const lookOf = (r) => window.UI.normalizeStyle(data.rankLooks?.[r] || {}, 'Rare');
  const dressRank = (el, r) => { const lk = lookOf(r); el.style.color = col(lk.text); el.style.background = col(lk.background) || 'rgba(0,0,0,0.72)'; el.style.borderColor = col(lk.border) || 'transparent'; return el; };

  const brushBar = h('div', { class: 'bm-brushes', role: 'radiogroup', 'aria-label': 'Brush for dragging' }, BRUSHES.map((b) => {
    const el = h('button', {
      class: `bm-brush bm-b-${b.id}` + (FB.brush === b.id ? ' on' : ''), role: 'radio', 'aria-checked': FB.brush === b.id ? 'true' : 'false', title: b.title,
      onclick: () => { FB.brush = b.id; renderFilters(); },
    }, b.label);
    return b.rank ? dressRank(el, b.rank) : el;
  }));

  const cellClass = (n) => 'bm-cell bm-rank' + ((state[n] || {}).vis === 'hide' ? ' hidden' : '') + (rankOf(n) === LOW ? ' rank-low' : '');
  const shownFor = (n) => (data.rankKinds || []).filter((k) => { const m = kinds[k.id]; return m && m !== 'off' && m !== 'none' && RANKS.indexOf(rankOf(n)) <= RANKS.indexOf(m); }).map((k) => k.name.toLowerCase());
  const cellTitle = (b) => {
    const r = rankOf(b.name);
    const on = shownFor(b.name);
    return `${b.name}: rank ${r}.${on.length ? ` Shown as ${on.join(', ')}.` : ''}${(state[b.name] || {}).vis === 'hide' ? ' Plain drops hidden.' : ''}` +
      `\nLeft click: a rank up. Right click: a rank down. Drag: paint with the brush.${b.inFilter === false ? '\n(Your filter doesn\'t list this base.)' : ''}`;
  };
  const cells = new Map();
  const redraw = (n) => { for (const el of cells.get(n) || []) { el.className = cellClass(n); dressRank(el, rankOf(n)); el.title = cellTitle({ name: n }); el.querySelector('.bm-f').textContent = rankOf(n); } };
  const brush = () => BRUSHES.find((b) => b.id === FB.brush);
  const paintLocal = (names) => {
    const b = brush();
    for (const n of names) {
      if (b.rank) { if (b.rank === LOW) delete ranks[n]; else ranks[n] = b.rank; }
      if ('vis' in b) { const e = { ...(state[n] || {}) }; if (b.vis) e.vis = b.vis; else delete e.vis; if (Object.keys(e).length) state[n] = e; else delete state[n]; }
      redraw(n);
    }
  };
  const after = () => { S.settings.baseRanks = ranks; S.settings.baseMatrix = state; drawSummary(); if (byRank) renderFilters(); };
  const commit = async (names) => {
    if (!names.length) return;
    const b = brush();
    const list = [...new Set(names)];
    if (b.rank) ranks = (await call('ranks:set', { bases: list, rank: b.rank })).ranks;
    else state = (await call('matrix:set', { bases: list, vis: b.vis })).state;
    after();
  };
  // left click: a rank up, right click: a rank down (D is the floor, S the top), like the cluster grid
  const step = async (names, dir) => {
    const list = [...new Set(names)];
    for (const n of list) { const i = Math.max(0, Math.min(RANKS.length - 1, RANKS.indexOf(rankOf(n)) - dir)); if (RANKS[i] === LOW) delete ranks[n]; else ranks[n] = RANKS[i]; redraw(n); }
    ranks = (await call('ranks:set', { bases: list, dir })).ranks;
    after();
  };

  let painting = null;
  let moved = false;
  // one window listener for every render: it ends whichever drag is going on
  if (!window.bmMouseUp) window.addEventListener('mouseup', () => window.bmMouseUp?.());
  window.bmMouseUp = () => { if (!painting) return; const names = painting; painting = null; if (moved) commit(names); else step(names, +1); };
  const cellOf = (b) => {
    const el = h('button', {
      type: 'button', class: cellClass(b.name), title: cellTitle(b),
      onmousedown: (e) => { if (e.button !== 0) return; e.preventDefault(); painting = [b.name]; moved = false; },
      onmouseenter: () => { if (painting && !painting.includes(b.name)) { if (!moved) { moved = true; paintLocal(painting); } painting.push(b.name); paintLocal([b.name]); } },
      oncontextmenu: (e) => { e.preventDefault(); step([b.name], -1); },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); step([b.name], +1); } else if (e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); step([b.name], -1); } },
    }, h('span', { class: 'bm-n' }, b.name), h('span', { class: 'bm-f', 'aria-hidden': 'true' }, rankOf(b.name)));
    dressRank(el, rankOf(b.name));
    if (!cells.has(b.name)) cells.set(b.name, []);
    cells.get(b.name).push(el);
    return el;
  };
  const grid = h('div', { class: 'bm-grid', style: { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` } },
    columns.map((c) => h('div', { class: 'bm-col' },
      c.rank
        ? h('div', { class: 'bm-head' }, `${c.title} (${c.list.length})`)
        : h('button', { class: 'bm-head', title: `Left click: every base in ${c.title} a rank up. Right click: a rank down.`, onclick: () => step(c.list.map((b) => b.name), +1), oncontextmenu: (e) => { e.preventDefault(); step(c.list.map((b) => b.name), -1); } }, c.title),
      c.list.length ? c.list.map(cellOf) : h('div', { class: 'small faint', style: { padding: '6px' } }, 'None'))));

  // item level: "at least" with a slider and a box, like FilterBlade (1 = any)
  function ilvlSlider(value, label, onSet) {
    const MAXL = 86;
    const box = h('input', { type: 'number', min: 1, max: 100, value, 'aria-label': label, class: 'il-box' });
    const range = h('input', { type: 'range', min: 1, max: MAXL, value: Math.min(MAXL, value), 'aria-label': label, class: 'il-range' });
    const tag = h('span', { class: 'il-tag' });
    const paint = (v) => {
      const pct = ((Math.min(MAXL, v) - 1) / (MAXL - 1)) * 100;
      range.style.setProperty('--il', `${pct}%`);
      tag.textContent = v > 1 ? `${v}+` : 'any';
      tag.classList.toggle('any', v <= 1);
    };
    let t = null;
    const set = (v, fromBox) => {
      v = Math.max(1, Math.min(100, Math.round(Number(v) || 1)));
      if (!fromBox) box.value = v;
      range.value = Math.min(MAXL, v);
      paint(v);
      clearTimeout(t);
      t = setTimeout(() => onSet(v), 350); // write the filter once you stop dragging
    };
    range.addEventListener('input', () => set(range.value));
    box.addEventListener('change', () => set(box.value, true));
    paint(value);
    return h('div', { class: 'il', title: 'Only items of at least this item level count (1 = any)' }, h('span', { class: 'il-l small muted' }, 'Item level ≥'), box, range, tag);
  }

  // per kind of drop: the lowest rank you still want to see
  const MIN_OPTS = [['off', 'Filter decides'], ['S', 'S only'], ['A', 'A and up'], ['B', 'B and up'], ['C', 'C and up'], ['D', 'All ranks'], ['none', 'Hide all']];
  const kindCount = (k) => { const m = kinds[k.id]; if (!m || m === 'off') return ''; if (m === 'none') return 'all hidden'; const n = scope.filter((b) => RANKS.indexOf(rankOf(b.name)) <= RANKS.indexOf(m)).length; return `${n} of ${scope.length} here shown`; };
  const kindRows = (data.rankKinds || []).map((k) => {
    const note = h('span', { class: 'small faint' }, kindCount(k));
    const sel = h('select', { 'aria-label': `${k.name}: lowest rank shown`, onchange: async (e) => {
      const r = await call('ranks:kind', { kind: k.id, min: e.target.value });
      kinds = r.kinds; S.settings.rankKinds = kinds; mount(note, kindCount(k)); drawSummary();
      grid.querySelectorAll('.bm-cell').forEach((el) => { const n = el.querySelector('.bm-n')?.textContent; if (n) el.title = cellTitle({ name: n }); });
    } }, MIN_OPTS.map(([v, l]) => h('option', { value: v, selected: (kinds[k.id] || 'off') === v }, l)));
    const ilvl = ilvlSlider(k.id === 'crafting' ? (data.craftIlvl || 82) : (data.ilvls?.[k.id] || 1), `${k.name}: lowest item level`, async (v) => {
      await call('ranks:kind', { kind: k.id, ilvl: v });
      toast(v > 1 ? `${k.name}: item level ${v} and up` : `${k.name}: any item level`);
    });
    return h('div', { class: 'bm-kind' }, h('b', {}, k.name), h('span', { class: 'small muted' }, k.about), sel, ilvl, note);
  });

  // ---------- a whole group at once: every shield, every staff, every pure armour base… ----------
  const namesOf = (list) => [...new Set(list.map((b) => b.name))];
  // shields and weapon types, then the armour defences; body armours, boots, gloves, helmets and
  // jewellery are never hidden as a whole
  const colOf = (gid, title) => (data.groups || []).find((g) => g.id === gid)?.columns.find((c) => c.title === title);
  const GROUP_SETS = [
    { title: 'Off-hand', items: [
      ...(data.classes.includes('Shields') ? [{ label: 'Shields', names: () => namesOf(data.defences.flatMap((d) => data.bases.Shields[d.id] || [])) }] : []),
      ...(colOf('weapons2', 'Quivers') ? [{ label: 'Quivers', names: () => namesOf(colOf('weapons2', 'Quivers').list) }] : []),
    ] },
    ...(data.groups || []).filter((g) => ['weapons1', 'weapons2'].includes(g.id)).map((g) => ({ title: g.name, items: g.columns.filter((col) => col.title !== 'Quivers').map((col) => ({ label: col.title, names: () => namesOf(col.list) })) })),
    { title: 'Minion', items: [{ label: 'All minion bases', names: () => [...(data.minionBases || [])] }] },
    { title: 'Armour bases', items: data.defences.map((d) => ({ label: d.name, names: () => namesOf(data.classes.flatMap((c) => data.bases[c][d.id] || [])) })) },
  ].filter((set) => set.items.length);
  // only ever down to D (untiered): a whole group is pushed out of the ranks, never all made S
  const setWholeGroup = async (label, names) => {
    const r = LOW;
    // remember where they were, for Undo
    const before = {};
    for (const n of names) before[n] = rankOf(n);
    FB.groupUndo = { label, before };
    ranks = (await call('ranks:set', { bases: names, rank: r })).ranks;
    S.settings.baseRanks = ranks;
    toast(`${label}: ${names.length} bases moved to D (untiered)`);
    renderFilters();
  };
  const undoGroup = async () => {
    const u = FB.groupUndo;
    if (!u) return;
    const byRank = {};
    for (const [n, r] of Object.entries(u.before)) (byRank[r] = byRank[r] || []).push(n);
    for (const [r, names] of Object.entries(byRank)) ranks = (await call('ranks:set', { bases: names, rank: r })).ranks;
    S.settings.baseRanks = ranks;
    FB.groupUndo = null;
    toast(`${u.label}: back as it was`);
    renderFilters();
  };
  const groupPanel = h('details', { class: 'panel bm-groups', open: FB.groupsOpen || null, ontoggle: (e) => { FB.groupsOpen = e.target.open; } },
    h('summary', {}, h('b', {}, 'Hide whole groups'), h('span', { class: 'small faint' }, ' Move all shields, a weapon type or the armour bases of one defence to D (untiered).')),
    FB.groupUndo ? h('div', { class: 'row small', style: { gap: '8px', margin: '8px 0' } }, h('button', { class: 'sm', onclick: undoGroup }, `Undo "${FB.groupUndo.label}"`)) : null,
    GROUP_SETS.map((set) => h('div', { class: 'bm-groupset' }, h('span', { class: 'small muted' }, set.title),
      h('div', { class: 'row', style: { gap: '5px' } }, set.items.map((it) => h('button', { class: 'sm', title: `Every ${it.label.toLowerCase()} base to D (untiered)`, onclick: () => setWholeGroup(it.label, it.names()) }, it.label))))));

  const summary = h('div', { class: 'small muted' });
  function drawSummary() {
    const n = Object.fromEntries(RANKS.map((r) => [r, 0]));
    for (const b of scope) n[rankOf(b.name)]++;
    const hid = Object.values(state).filter((e) => e.vis === 'hide').length;
    mount(summary, `Here: ${RANKS.map((r) => `${n[r]} ${r}`).join(' · ')}${hid ? ` · ${hid} plain drops hidden` : ''}`);
  }
  drawSummary();

  const opts = data.opts || {};
  const mapsOnly = h('input', { type: 'checkbox', checked: opts.mapsOnly !== false, onchange: async (e) => { await call('matrix:opts', { mapsOnly: e.target.checked }); toast(e.target.checked ? 'Bases below the rank are hidden in maps only' : 'Bases below the rank are hidden everywhere, campaign too'); } });
  const keep = h('input', { type: 'number', min: 1, max: 100, placeholder: 'off', value: opts.keepIlvl ?? '', style: { width: '64px' }, 'aria-label': 'Keep this item level and above visible' });
  keep.addEventListener('change', async () => { const r = await call('matrix:opts', { keepIlvl: keep.value || null }); toast(r.keepIlvl ? `Item level ${r.keepIlvl} and above always show` : 'Hidden bases are hidden at every item level'); });

  mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, h('span', { class: 'fb-iconbtn' }, window.UI.icon('eye', { size: 22 })), h('h2', {}, 'Base ranks'),
        h('span', { class: 'small muted' }, 'Every base has a rank, S best to D (untiered, the lowest). Left click a base for a rank up, right click for a rank down, or drag to paint with the brush.')),
      h('div', { class: 'panel bm-kinds' },
        h('div', { class: 'row', style: { gap: '8px' } }, h('b', {}, 'Lowest rank shown'), h('span', { class: 'small faint' }, 'For each kind of drop. "Rares: S only" and "Fractured: B and up" hide a B rank rare but show it fractured. Uniques are never touched.')),
        kindRows,
        h('div', { class: 'row small', style: { gap: '8px' } }, h('span', { class: 'muted' }, 'Looks:'), RANKS.map((r) => dressRank(h('span', { class: 'bm-cell sample' }, `Rank ${r}`), r)))),
      groupPanel,
      sectionTabs,
      h('div', { class: 'panel bm-tools' },
        h('div', { class: 'row', style: { gap: '10px' } }, part === 'gear' ? pick : null, rankToggle, h('span', { class: 'small muted' }, 'Brush:'), brushBar),
        h('div', { class: 'row small', style: { gap: '14px' } },
          h('label', { class: 'check' }, mapsOnly, 'Hide only in maps (area level 68+)'),
          h('label', { class: 'row', style: { gap: '6px' } }, 'Keep item level', keep, 'and above'),
          h('button', { class: 'sm', title: 'In every column: the best base gets S, the next 2 A, the next 2 B, the next 2 C, the rest D', onclick: async () => {
            if (Object.keys(ranks).length && !confirm('Rank every base again from the base order? Your own ranks are replaced.')) return;
            const r = await call('ranks:auto', { s: 1, a: 2, b: 2, c: 2 });
            toast(`Ranked: ${r.S} S, ${r.A} A, ${r.B} B, ${r.C} C, ${r.D} D`);
            renderFilters();
          } }, 'Rank by base order'),
          h('span', { class: 'spacer' }), summary,
          h('button', { class: 'quiet sm', title: 'Back to the usual ranking, and unhide every base', onclick: async () => {
            if (!confirm('Put every base back to the usual ranking and unhide them? Your own ranks are replaced.')) return;
            await call('ranks:default');
            if (Object.keys(state).length) await call('matrix:set', { bases: Object.keys(state), vis: null, frac: null });
            renderFilters();
          } }, 'Reset all'))),
      grid)));
}

async function renderMyBases(body, view) {
  const data = await call('bases:list');
  const list = data.list.filter((e) => (e.group || 'mybases') === 'mybases');
  const cats = sidebar(view, new Set());
  const known = [...new Set(view.types.flatMap((t) => t.tiers.flatMap((x) => x.bases)))].sort();
  const ORDER = ['Normal', 'Magic', 'Rare'];
  const num = (v) => (v === '' ? null : +v);
  const update = async (id, patch) => { await call('bases:update', { id, patch }); renderFilters(); };

  const rowOf = (e) => h('tr', { class: e.enabled === false ? 'rv-excluded' : '' },
    h('td', {}, h('input', { type: 'checkbox', checked: e.enabled !== false, 'aria-label': `Use ${e.base}`, onchange: (ev) => update(e.id, { enabled: ev.target.checked }) })),
    h('td', {}, h('b', {}, e.base), e.itemClass ? h('div', { class: 'small faint' }, e.itemClass) : null),
    h('td', {}, h('span', { class: 'row small', style: { gap: '6px', flexWrap: 'nowrap' } },
      h('input', { type: 'number', min: 1, max: 100, value: e.ilvlMin ?? '', placeholder: 'any', style: { width: '64px' }, 'aria-label': `${e.base} lowest item level`, onchange: (ev) => update(e.id, { ilvlMin: num(ev.target.value) }) }),
      h('span', { class: 'muted' }, 'to'),
      h('input', { type: 'number', min: 1, max: 100, value: e.ilvlMax ?? '', placeholder: 'any', style: { width: '64px' }, 'aria-label': `${e.base} highest item level`, onchange: (ev) => update(e.id, { ilvlMax: num(ev.target.value) }) }))),
    h('td', {}, h('span', { class: 'row', style: { gap: '10px' } }, ORDER.map((r) => h('label', { class: `check small r-${r}` },
      h('input', { type: 'checkbox', checked: (e.rarities || ORDER).includes(r), onchange: (ev) => { const next = ORDER.filter((x) => (x === r ? ev.target.checked : (e.rarities || ORDER).includes(x))); if (!next.length) { ev.target.checked = true; return toast('Keep at least one rarity.'); } update(e.id, { rarities: next }); } }), r)))),
    h('td', { class: 'r' }, h('button', { class: 'quiet sm', 'aria-label': `Remove ${e.base}`, onclick: async () => { await call('bases:remove', e.id); toast(`${e.base} removed from My bases`); renderFilters(); } }, 'Remove')));

  const name = h('input', { list: 'mb-names', placeholder: 'Base name, e.g. Goliath Greaves', style: { width: '240px' }, 'aria-label': 'Base to add' });
  const min = h('input', { type: 'number', min: 1, max: 100, placeholder: 'any', style: { width: '64px' }, 'aria-label': 'Lowest item level', value: 82 });
  const max = h('input', { type: 'number', min: 1, max: 100, placeholder: 'any', style: { width: '64px' }, 'aria-label': 'Highest item level' });
  const add = async () => {
    const b = name.value.trim();
    if (!b) return;
    const exact = known.find((k) => k.toLowerCase() === b.toLowerCase());
    if (!exact && !confirm(`"${b}" isn't a base your filter lists. Check the spelling: it must match the game exactly, or the name is left out. Add it anyway?`)) return;
    try { await call('bases:add', { base: exact || b, ilvlMin: min.value || null, ilvlMax: max.value || null }); toast(`${exact || b} added`); renderFilters(); } catch { /* toast */ }
  };
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  const look = { key: 'mybases', tier: 'mybases', customName: 'My bases', style: data.style };
  const editing = FB.editing === 'mybases';
  const preview = h('div', { class: 'fb-preview' });
  const drawPreview = () => mount(preview, dropLabel(list[0]?.base || 'Goliath Greaves', editing ? FB.draft : data.style, { rarity: 'Rare', game: true }), soundButton(window.UI.normalizeStyle(editing ? FB.draft : data.style).sound));
  drawPreview();

  mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, h('span', { class: 'fb-iconbtn' }, window.UI.icon('hammer', { size: 22 })), h('h2', {}, 'My bases'),
        h('span', { class: 'small muted' }, 'Bases you collect, shown above all your other tiers.')),
      h('div', { class: 'fb-tier' },
        h('div', { class: 'fb-tier-head ground' }, preview,
          h('div', { class: 'fb-tier-meta' }, h('div', { class: 'fb-tier-name' }, 'Look for all My bases'), h('div', { class: 'small', style: { color: '#9a9f8c' } }, `${list.filter((e) => e.enabled !== false).length} active`)),
          h('span', { class: 'spacer' }),
          h('button', { class: editing ? 'primary sm' : 'sm', onclick: () => { if (editing) FB.editing = null; else { FB.editing = 'mybases'; FB.draft = structuredClone(data.style); } renderFilters(); } }, editing ? 'Close' : 'Edit look')),
        editing ? lookEditor(look, () => renderFilters(), drawPreview, { onSave: (st) => call('bases:style', st), onReset: () => call('bases:style', null), resetLabel: 'Use the default look' }) : null),
      h('div', { class: 'panel row', style: { margin: '12px 0' } },
        h('b', {}, 'Add a base'), name, h('span', { class: 'small muted' }, 'item level'), min, h('span', { class: 'small muted' }, 'to'), max,
        h('button', { class: 'primary sm', onclick: add }, 'Add'),
        h('span', { class: 'small faint' }, 'Or press "+ My bases…" in the price check popup on an item you found.'),
        h('datalist', { id: 'mb-names' }, known.map((n) => h('option', { value: n })))),
      await extraRulesPanel(),
      list.length ? h('div', { class: 'panel', style: { padding: '6px 14px' } },
        h('table', { class: 'rv-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'On'), h('th', {}, 'Base'), h('th', {}, 'Item level'), h('th', {}, 'Rarity'), h('th', {}))), h('tbody', {}, list.map(rowOf))))
        : h('div', { class: 'panel empty' }, 'No bases yet. Add one above, or from the price check popup.'))));
}

// ---------------------------------------------------------------- sidebar
// Categories the way FilterBlade groups them. Each one holds one or more of the filter's own
// $type groups; anything not listed lands in Miscellaneous. `art` is the item whose in-game
// picture is the icon (loaded from GGG's image server via poe.ninja); `icon` is the fallback.
const CATEGORIES = [
  ['Currency', [
    { id: 'currency', name: 'Currency', match: ['currency', 'incubator'], art: 'Divine Orb', icon: 'coin' },
    { id: 'stacked', name: 'Stacked', match: ['currency->stackedsix', 'currency->stackedthree', 'currency->stackedsuppliesportal', 'currency->stackedsupplieswisdom', 'currency->stackedsupplieshigh', 'currency->stackedsupplieslow'], order: ['currency->stackedsix', 'currency->stackedthree', 'currency->stackedsupplieshigh', 'currency->stackedsupplieslow', 'currency->stackedsuppliesportal', 'currency->stackedsupplieswisdom'], art: ['Chaos Orb'], icon: 'coins' },
    { id: 'levelingcurrency', name: 'Levelling currency', match: ['currency->leveling', 'currency->levelingstacked'], art: ['Orb of Transmutation'], icon: 'leaf' },
  ]],
  ['Fragments', [
    { id: 'scarab', name: 'Scarab', match: ['fragments->scarabs', 'scarabs'], art: ['Delirium Scarab of Paranoia', '*Scarab'], icon: 'scarab' },
    { id: 'fragments', name: 'Other fragments', match: ['fragments', 'currency->splinter', 'currency->stackedsplintershigh', 'currency->stackedsplinterslow'], art: ['Fragment of Shape', '*Fragment'], icon: 'shard' },
  ]],
  ['League mechanics', [
    { id: 'league', name: 'Current league', match: ['event', 'currency->ducats', 'currency->deadmansulphur', 'currency->leagueexclusive'], art: null, icon: 'star' },
    { id: 'delirium', name: 'Delirium', match: ['currency->deliriumorbs', 'delirium'], art: ['Fine Delirium Orb', '*DeliriumOrb'], icon: 'orb' },
    { id: 'harvest', name: 'Harvest', match: ['currency->harvest', 'harvest'], art: ['Vivid Crystallised Lifeforce', 'Primal Crystallised Lifeforce'], icon: 'leaf' },
    { id: 'blight', name: 'Blight', match: ['currency->oil', 'oil'], art: ['Golden Oil', '*Oil'], icon: 'drop' },
    { id: 'ritual', name: 'Ritual', match: ['corpses', 'currency->trial->omen', 'omen', 'exoticbases#ritual'], art: ['Ritual Vessel', '*Omen'], icon: 'eye' },
    { id: 'essence', name: 'Essence', match: ['currency->essence', 'essence'], art: ['Deafening Essence of Dread', '*Essence'], icon: 'flame' },
    { id: 'kingsmarch', name: 'Kingsmarch', match: ['currency->trial->tattoo', 'runesgrafts', 'tattoo'], art: ['Tattoo of the Kitava Blood Drinker', '*Tattoo'], icon: 'heart' },
    { id: 'delve', name: 'Delve', match: ['currency->fossil', 'fossil'], art: ['Aetheric Fossil', '*Fossil'], icon: 'rock' },
    { id: 'expedition', name: 'Expedition', match: ['currency@expedition', 'currency->stackedsix@expedition', 'currency->stackedthree@expedition', 'expedition'], order: ['currency@expedition', 'currency->stackedsix@expedition', 'currency->stackedthree@expedition', 'expedition->logbook'], art: ['Expedition Logbook'], icon: 'book' },
    { id: 'heist', name: 'Heist', match: ['heist', 'currency->heist', 'heist#equipment', 'exoticbases#heist'], order: ['heist->blueprint', 'heist->contract', 'currency->heist', 'heist#equipment', 'exoticbases#heist'], art: ["Rogue's Marker"], icon: 'key' },
  ]],
  ['Maps', [
    { id: 'maps', name: 'Regular maps', match: ['maps'], art: ['Map (Tier 16)', '*Map16'], icon: 'map' },
    { id: 'influencedmaps', name: 'Influenced maps', match: ['maps->influenced'], art: ['The Enslaver Map (Tier 16)', 'The Eradicator Map (Tier 16)', '*Map16'], icon: 'map' },
    { id: 'nightmaremaps', name: 'Nightmare maps', match: ['maps->nightmare'], art: ['Nightmare Map', '*Map16'], icon: 'map' },
    { id: 'blightedmaps', name: 'Blighted maps', match: ['maps->blighted'], art: ['*BlightedMap', '*Map16'], icon: 'map' },
    { id: 'specialmaps', name: 'Special maps', match: ['maps->enchanted', 'maps->corruptedspecial', 'maps->corruptedimplicit', 'maps->implicitmod', 'maps->vaaltemple'], art: ['*Map16'], icon: 'map' },
    { id: 'mapitems', name: 'Other map items', match: ['exoticmap', 'charts', 'miscmapitems', 'miscmapitemsextra', 'maphiders'], art: ["Cartographer's Chisel", 'Orb of Horizons'], icon: 'book' },
  ]],
  ['Cards & gems', [
    { id: 'divination', name: 'Divination Cards', match: ['divination'], art: ['Stacked Deck', 'The Doctor'], icon: 'card' },
    { id: 'gems', name: 'Gems', match: ['gems'], art: "Gemcutter's Prism", icon: 'gem' },
  ]],
  ['Rare items', [
    { id: 'mybases', name: 'My bases', match: [], special: 'mybases', art: null, icon: 'hammer' },
    { id: 'basevis', name: 'Base ranks', match: [], special: 'matrix', art: 'Fracturing Orb', icon: 'eye' },
    { id: 'rares', name: 'Rares', match: ['rare', 'rareid', 'rareblendid', 'rareoptional', 'corruptedid', 'influenced', 'animatedweapons'], art: 'Orb of Alchemy', icon: 'sword' },
    { id: 'crafting', name: 'Crafting bases', match: ['crafting', 'normalcraft', 'gear', 'magicid'], art: 'Orb of Fusing', icon: 'hammer' },
    { id: 'special', name: 'Special bases', match: ['exoticbases', 'exoticbaseslower', 'exotic', 'exoticmods'], art: 'Fracturing Orb', icon: 'bolt' },
    { id: 'chancing', name: 'Chancing bases', match: ['chancing'], art: 'Orb of Chance', icon: 'ring' },
    { id: 'recipes', name: 'Vendor recipes', match: ['rr', '6l', 'socketslinks', 'endgamergb'], art: 'Chromatic Orb', icon: 'link' },
    { id: 'flasks', name: 'Flasks & tinctures', match: ['endgameflasks', 'endgametinctures', 'flasks'], art: "Glassblower's Bauble", icon: 'flask' },
    { id: 'highlight', name: 'Highlight specific bases', match: ['decorators'], art: 'Orb of Annulment', icon: 'sparkle' },
  ]],
  ['Jewels', [
    { id: 'jewels', name: 'Normal jewels', match: ['jewels', 'jewels->generic', 'jewels->special', 'jewels->leveling'], order: ['jewels->generic', 'jewels->special', 'jewels->leveling'], art: ['Cobalt Jewel', 'Crimson Jewel'], icon: 'hex' },
    { id: 'abyssjewels', name: 'Abyss jewels', match: ['jewels->abyss'], art: ['Hypnotic Eye Jewel', 'Searching Eye Jewel'], icon: 'eye' },
    { id: 'clusterjewels', name: 'Cluster jewels', match: ['jewels->cluster', 'jewels->clustereco'], art: ['Large Cluster Jewel'], icon: 'hex', clusters: true },
    { id: 'clustergrid', name: 'Cluster jewels', match: [], special: 'clustergrid', art: ['Large Cluster Jewel'], icon: 'hex' },
  ]],
  ['Uniques & more', [
    { id: 'uniques', name: 'Unique items', match: ['uniques'], art: ['Headhunter', 'Mageblood', '*UniqueAccessory'], icon: 'crown' },
    { id: 'gold', name: 'Gold', match: ['gold'], art: null, icon: 'coins' },
  ]],
  ['Campaign (level 1-67)', [
    { id: 'leveling', name: 'Campaign & Leveling', match: ['leveling'], art: 'Scroll of Wisdom', icon: 'leaf' },
  ]],
  ['Miscellaneous', [
    { id: 'leaguespecific', name: 'League-specific items and mods', match: ['vials', 'enshrouded', 'artefact'], art: 'Vaal Orb', icon: 'bolt' },
    { id: 'quest', name: 'Quest items', match: ['questlike', 'questlikeexception', 'heisttarget'], art: null, icon: 'book' },
    { id: 'misc', name: 'Miscellaneous', match: [], art: 'Orb of Scouring', icon: 'box' },
  ]],
];

// ---- your own layout on top of the defaults (Edit categories) ----
// categoryLayout = { names: {catId: name}, assign: {type: catId}, custom: [{id, name, section}], order: {section: [catId]} }
const layout = () => S.settings.categoryLayout || {};
const SECTION_TITLES = CATEGORIES.map(([t]) => t);
/** Sections with your names, your new categories and your order applied. */
function effectiveCategories() {
  const L = layout();
  return CATEGORIES.map(([title, cats]) => {
    const mine = (L.custom || []).filter((c) => c.section === title).map((c) => ({ id: c.id, name: c.name, match: [], art: null, icon: 'box', custom: true }));
    let list = [...cats, ...mine].map((c) => ({ ...c, name: L.names?.[c.id] || c.name, defaultName: c.name }));
    const order = L.order?.[title];
    if (order) list = list.sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
    return [title, list];
  });
}
const allCats = () => effectiveCategories().flatMap(([, cats]) => cats);
const ALL_CATS = CATEGORIES.flatMap(([, cats]) => cats); // the defaults (for pictures)
/** Where a subcategory lives: your own placement (also covers its children), else the most specific default match. */
function categoryOf(type) {
  const cats = allCats();
  const assign = layout().assign || {};
  const parts = type.split('->');
  for (let i = parts.length; i > (type.includes('@') ? parts.length - 1 : 0); i--) {
    const id = assign[parts.slice(0, i).join('->')];
    const c = id && cats.find((x) => x.id === id);
    if (c) return c;
  }
  let best = null;
  let len = -1;
  for (const c of cats) for (const m of c.match) {
    if ((type === m || type.startsWith(m + '->')) && m.length > len) { best = c; len = m.length; }
  }
  return best || cats.find((c) => c.id === 'misc');
}
async function saveLayout(next) {
  await call('settings:set', { categoryLayout: next });
  S.settings.categoryLayout = next;
  renderFilters();
}
/** Name of a subcategory inside its category: "currency->trial->omen" in Trial is just "Omens". */
// Shown another way: NeverSink's economy cluster tiers are the Cluster enchantments grid.
// Cluster jewels opens the enchantment grid; the size tiers ("Large: the rest", ...) are edited from there
const HIDDEN_TYPES = new Set(['jewels->clustereco', 'jewels->cluster']);
const CLUSTER_SIZE_TYPE = 'jewels->cluster';
const SUB_LABELS = {
  'currency->heist': "Rogue's Markers",
  'jewels->generic': 'Normal', 'jewels->special': 'Special (one-mod, corrupted)', 'jewels->leveling': 'Levelling',
  'jewels->clustereco': 'By enchantment (economy)', 'jewels->cluster': 'By size',
};
function subLabel(t, cat) {
  if (t.subLabel) return t.subLabel;
  if (SUB_LABELS[t.key || t.type]) return SUB_LABELS[t.key || t.type];
  const m = cat.match.filter((x) => t.type === x || t.type.startsWith(x + '->')).sort((a, b) => b.length - a.length)[0];
  const segs = t.label.includes(': ') ? t.label.split(': ').slice(1).join(': ').split(', ') : [];
  if (!m) return t.label;
  if (t.type === m) return segs.join(', ') || (t.label.toLowerCase() === cat.name.toLowerCase() ? 'General' : t.label);
  return segs.slice(m.split('->').length - 1).join(', ') || t.label;
}
const artNames = () => [...new Set(ALL_CATS.flatMap((c) => [].concat(c.art || [])))];
/** Icon for a FilterBlade category: yours, else the game picture, else a line icon. */
function catIconId(cat) {
  const own = S.settings.categoryIcons?.[`cat:${cat.id}`];
  if (own) return own;
  const art = [].concat(cat.art || []).find((n) => window.UI.hasArt(n));
  return art ? `art:${art}` : cat.icon;
}
const DEFAULT_PINS = []; // nothing pinned until you pin it
// Line icon per filter subcategory, used where no picture is set; the most specific part of the type wins.
const ICON_FOR = {
  currency: 'coin', gold: 'coins', divination: 'card', uniques: 'crown', fragments: 'shard', scarabs: 'scarab', scarab: 'scarab',
  gems: 'gem', maps: 'map', exoticmap: 'map', charts: 'map', blighted: 'map', nightmare: 'map', endgameflasks: 'flask', flasks: 'flask', vials: 'flask',
  endgametinctures: 'drop', tincture: 'drop', oil: 'drop', essence: 'flame', fossil: 'rock', delirium: 'orb', deliriumorbs: 'orb', jewels: 'hex', cluster: 'hex', clustereco: 'hex', abyss: 'hex',
  crafting: 'hammer', exoticbases: 'sword', exoticbaseslower: 'sword', rareid: 'sword', rare: 'sword', rr: 'sword', magicid: 'sparkle', gear: 'shield', armours: 'helmet',
  '6l': 'link', socketslinks: 'link', sockets: 'link', influenced: 'bolt', exotic: 'bolt', exoticmods: 'bolt', corruptions: 'skull', heist: 'key', heisttarget: 'key', contract: 'key', blueprint: 'key',
  leveling: 'leaf', hidelayer: 'eyeoff', decorators: 'eye', questlike: 'book', logbook: 'book', expedition: 'book', sanctum: 'book', runesgrafts: 'sparkle', corpses: 'skull',
  omen: 'eye', tattoo: 'heart', splinter: 'shard', stackedsplintershigh: 'shard', stackedsplinterslow: 'shard', breachrings: 'ring', talisman: 'ring', event: 'star', anyremaining: 'box',
};
function iconIdFor(type) {
  const own = S.settings.categoryIcons?.[type];
  if (own) return own;
  const cat = categoryOf(type);
  if (cat) return catIconId(cat);
  const parts = type.split('->');
  for (let i = parts.length - 1; i >= 0; i--) if (ICON_FOR[parts[i]]) return ICON_FOR[parts[i]];
  return 'box';
}
const catIcon = (type, size = 16) => window.UI.icon(iconIdFor(type), { size, fallback: categoryOf(type)?.icon || 'box' });

/** Click the icon next to a category's name to pick another one, or use your own image. */
function iconPicker(type) {
  const cat = categoryOf(type);
  const key = cat ? `cat:${cat.id}` : type;
  const chosen = S.settings.categoryIcons?.[key];
  const save = async (id) => {
    const next = { ...(S.settings.categoryIcons || {}) };
    delete next[type];
    if (id) next[key] = id; else delete next[key];
    await call('settings:set', { categoryIcons: next });
    S.settings.categoryIcons = next;
    renderFilters();
  };
  const current = iconIdFor(type);
  return h('details', { class: 'fb-pop fb-iconpick' },
    h('summary', { class: 'fb-iconbtn', title: 'Change this category\'s icon', 'aria-label': 'Change icon' }, catIcon(type, 24)),
    h('div', { class: 'fb-pop-body' },
      h('div', { class: 'small muted', style: { marginBottom: '8px' } }, cat ? `Icon for ${cat.name}` : 'Icon for this category'),
      h('div', { class: 'fb-icongrid' }, window.UI.ICON_NAMES.map((id) => h('button', { class: id === current ? 'on' : '', title: id, 'aria-label': id, onclick: () => save(id) }, window.UI.icon(id, { size: 18 })))),
      h('div', { class: 'small muted', style: { margin: '12px 0 6px' } }, 'Your images'),
      (S.userIcons || []).length ? h('div', { class: 'fb-icongrid' }, S.userIcons.map((x) => h('span', { class: 'fb-myicon' },
        h('button', { class: x.id === current ? 'on' : '', title: x.name, 'aria-label': x.name, onclick: () => save(x.id) }, window.UI.icon(x.id, { size: 18 })),
        h('button', { class: 'fb-myicon-x', title: `Delete ${x.name}`, 'aria-label': `Delete ${x.name}`, onclick: async () => {
          await call('icons:delete', x.id);
          S.userIcons = S.userIcons.filter((y) => y.id !== x.id); window.UI.setUserIcons(S.userIcons);
          S.settings.categoryIcons = Object.fromEntries(Object.entries(S.settings.categoryIcons || {}).filter(([, v]) => v !== x.id));
          renderFilters();
        } }, '×')))) : null,
      window.UI.fileDropZone('Drop a .png, .svg or .jpg here, or click to choose', '.png,.jpg,.jpeg,.webp,.gif,.svg', async (file) => {
        try {
          const ic = await call('icons:import', { name: file.name, data: await window.UI.fileToBase64(file) });
          S.userIcons = [...(S.userIcons || []).filter((y) => y.id !== ic.id), ic];
          window.UI.setUserIcons(S.userIcons);
          await save(ic.id);
        } catch { /* toast shown */ }
      }),
      chosen ? h('button', { class: 'quiet sm', style: { marginTop: '8px' }, onclick: () => save(null) }, cat?.art ? 'Use the game picture' : 'Use the default icon') : null));
}

function swatchOf(t) {
  // colour of the category's first normal tier, so rows are recognisable at a glance
  const tier = t.tiers.find((x) => !x.special && !x.generated && x.action === 'Show') || t.tiers[0];
  const st = tier?.style || {};
  const c = (a) => (a ? `rgb(${a[0]},${a[1]},${a[2]})` : null);
  return { bg: c(st.background) || '#222', fg: c(st.text) || '#ddd', bd: c(st.border) || 'transparent', border: c(st.border) };
}

// The category list can be dragged wider (its right edge), up to most of the window; double-click resets it.
const SIDE_MIN = 240;
const SIDE_DEFAULT = 300;
function applySideWidth(w) {
  const max = Math.max(SIDE_MIN, Math.round(window.innerWidth * 0.6));
  const v = Math.min(max, Math.max(SIDE_MIN, Math.round(Number(w) || SIDE_DEFAULT)));
  document.documentElement.style.setProperty('--fb-side', `${v}px`);
  return v;
}
function withResizer(nav) {
  applySideWidth(S.settings.fbSideWidth || SIDE_DEFAULT);
  const handle = h('div', {
    class: 'fb-resize', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Drag to make the category list wider or narrower', tabindex: '0',
    title: 'Drag to resize the list. Double-click to reset.',
    ondblclick: () => { applySideWidth(SIDE_DEFAULT); call('settings:set', { fbSideWidth: SIDE_DEFAULT }); S.settings.fbSideWidth = SIDE_DEFAULT; },
    onkeydown: (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const v = applySideWidth((S.settings.fbSideWidth || SIDE_DEFAULT) + (e.key === 'ArrowRight' ? 30 : -30));
      S.settings.fbSideWidth = v; call('settings:set', { fbSideWidth: v });
    },
    onmousedown: (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const start = S.settings.fbSideWidth || SIDE_DEFAULT;
      let v = start;
      document.body.classList.add('resizing');
      const move = (ev) => { v = applySideWidth(start + ev.clientX - startX); };
      const up = () => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing');
        S.settings.fbSideWidth = v; call('settings:set', { fbSideWidth: v });
      };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    },
  });
  return h('div', { class: 'fb-side-wrap' }, nav, handle);
}

function sidebar(view, changedTypes) {
  const pins = S.settings.filterPins || DEFAULT_PINS;
  const q = (FB.catQuery || '').trim().toLowerCase();
  const select = (type) => {
    FB.type = type; FB.selected.clear(); FB.editing = null; FB.search = '';
    // the category list stays put (it sticks to the top of the window, scrolled where you left it);
    // the new category's tiers start at their top instead of halfway down the old category
    const main = document.querySelector('.main');
    const cats = document.querySelector('[data-keep-scroll="cats"]');
    const catsTop = cats ? cats.scrollTop : 0;
    const was = main ? main.scrollTop : 0;
    loadArt();
    renderFiltersNow().then(() => {
      const fb = document.querySelector('#page-filters .fb');
      const nav = document.querySelector('[data-keep-scroll="cats"]');
      if (nav) nav.scrollTop = catsTop;
      if (!main || !fb) return;
      const fbTop = fb.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      main.scrollTop = Math.min(was, fbTop);
    });
  };
  const togglePin = async (type) => {
    const next = pins.includes(type) ? pins.filter((x) => x !== type) : [...pins, type];
    await call('settings:set', { filterPins: next });
    S.settings.filterPins = next;
    renderFilters();
  };
  const baseCount = (t) => t.tiers.reduce((a, x) => a + x.bases.length, 0);

  const row = (t, { sub = false, label = null } = {}) => {
    const sw = swatchOf(t);
    const pinned = pins.includes(t.key);
    const on = t.key === FB.type || (t.merged && mergeOf(FB.type)?.key === t.key);
    return h('div', { class: 'fb-row' + (on ? ' active' : '') + (sub ? ' sub' : '') },
      h('button', { class: 'fb-row-main', onclick: () => select(t.key), title: t.label },
        h('span', { class: 'fb-ic', style: { color: sw.border || sw.fg } }, catIcon(t.key || t.type)),
        h('span', { class: 'n' }, label || t.label),
        (t.realTypes || [t.type]).some((x) => changedTypes.has(x)) ? h('span', { class: 'dot', title: 'You changed this category' }) : null,
        h('span', { class: 'c' }, baseCount(t) || '')),
      h('button', { class: 'fb-pin' + (pinned ? ' on' : ''), title: pinned ? 'Unpin' : 'Pin to the top', 'aria-label': pinned ? `Unpin ${t.label}` : `Pin ${t.label}`, onclick: () => togglePin(t.key) }, pinned ? '★' : '☆'));
  };

  // search: categories by name, then bases
  if (q.length >= 2) {
    const catHits = view.types.filter((t) => !t.inMerge && t.label.toLowerCase().includes(q));
    const baseHits = [];
    for (const t of view.types) if (!t.merged && !t.baseView) for (const tier of t.tiers) for (const b of tier.bases) if (b.toLowerCase().includes(q)) baseHits.push({ b, t, tier });
    return withResizer(h('nav', { class: 'fb-cats', 'data-keep-scroll': 'cats', 'aria-label': 'Categories' }, searchBox(),
      catHits.length ? h('div', { class: 'fb-sec' }, h('div', { class: 'fb-sec-h' }, 'Categories'), catHits.slice(0, 15).map((t) => row(t))) : null,
      h('div', { class: 'fb-sec' }, h('div', { class: 'fb-sec-h' }, `Bases (${baseHits.length})`),
        h('div', { class: 'fb-gresults' }, baseHits.slice(0, 40).map(({ b, t, tier }) => h('button', { onclick: () => { FB.type = t.key; FB.search = b; FB.catQuery = ''; FB.selected.clear(); renderFilters(); } }, h('span', { class: 'b', title: `${t.label}, ${tierName(tier)}` }, b), h('span', { class: 'w' }, tierName(tier).replace(/ \(.*\)$/, ''))))),
        !baseHits.length ? h('div', { class: 'small faint', style: { padding: '4px 8px' } }, 'Not in this filter. Uniques are listed by base type, for example Heavy Belt instead of Mageblood.') : null)));
  }

  // FilterBlade-style categories, each holding the filter's own subcategories
  const byCat = new Map();
  for (const t of view.types) {
    if (t.inMerge || HIDDEN_TYPES.has(t.key)) continue;
    const c = categoryOf(t.key);
    if (!c) continue;
    if (!byCat.has(c.id)) byCat.set(c.id, []);
    byCat.get(c.id).push(t);
  }
  // a category can fix the order of its subcategories; anything else follows in filter order
  for (const [id, list] of byCat) {
    const order = allCats().find((c) => c.id === id)?.order;
    if (order) list.sort((a, b) => (order.indexOf(a.key) + 1 || 999) - (order.indexOf(b.key) + 1 || 999));
  }
  const activeCat = categoryOf(mergeOf(FB.type)?.key || FB.type)?.id;

  const resetCat = async (cat, list) => {
    const types = list.flatMap((t) => t.realTypes || [t.type]).filter((t) => changedTypes.has(t));
    if (!types.length) return;
    if (!confirm(`Undo every change you made in ${cat.name}? Moves, looks and Shown/Hidden/Off go back to what FilterBlade has.`)) return;
    await call('tiers:reset', { types });
    toast(`${cat.name} is back to the FilterBlade version`);
    FB.prices = {};
    renderFilters();
  };

  const catRow = (cat, list) => {
    const single = list.length === 1;
    const open = !single && (FB.openGroups.has(cat.id) || (cat.id === activeCat && !FB.closedGroups.has(cat.id)));
    const changed = list.some((t) => (t.realTypes || [t.type]).some((x) => changedTypes.has(x)));
    const active = single && list[0].key === FB.type;
    const toggleOpen = () => { if (open) { FB.openGroups.delete(cat.id); FB.closedGroups.add(cat.id); } else { FB.openGroups.add(cat.id); FB.closedGroups.delete(cat.id); } renderFilters(); };
    return h('div', { class: 'fb-cat' + (open ? ' open' : '') + (cat.id === activeCat ? ' current' : '') },
      h('div', { class: 'fb-cat-bar' + (active ? ' active' : '') },
        h('button', { class: 'fb-cat-main', title: cat.name, 'aria-expanded': single ? null : open ? 'true' : 'false', onclick: () => (single ? select(list[0].key) : toggleOpen()) },
          h('span', { class: 'fb-cat-ic' }, window.UI.icon(catIconId(cat), { size: 26, fallback: cat.icon })),
          h('span', { class: 'n' }, cat.name),
          changed ? h('span', { class: 'dot', title: 'You changed something here' }) : null,
          single ? null : h('span', { class: 'chev' }, open ? '▾' : '▸')),
        h('button', { class: 'fb-reset', disabled: !changed, title: changed ? `Undo your changes in ${cat.name}` : 'Nothing changed here', onclick: () => resetCat(cat, list) }, 'Reset')),
      open ? h('div', { class: 'fb-cat-subs' }, list.map((t) => row(t, { sub: true, label: subLabel(t, cat) }))) : null);
  };

  // My bases: your own list, opens its own page
  const myBasesRow = (cat) => h('div', { class: 'fb-cat' + (FB.type === MY_BASES ? ' current' : '') },
    h('div', { class: 'fb-cat-bar' + (FB.type === MY_BASES ? ' active' : '') },
      h('button', { class: 'fb-cat-main', onclick: () => select(MY_BASES) },
        h('span', { class: 'fb-cat-ic' }, window.UI.icon(catIconId(cat), { size: 26, fallback: cat.icon })),
        h('span', { class: 'n' }, cat.name),
        h('span', { class: 'c small faint' }, String((S.settings.myBases || []).filter((e) => e.enabled !== false).length || '')))));

  // Base visibility: the matrix of armour bases, opens its own page
  const matrixRow = (cat) => h('div', { class: 'fb-cat' + (FB.type === BASE_MATRIX ? ' current' : '') },
    h('div', { class: 'fb-cat-bar' + (FB.type === BASE_MATRIX ? ' active' : '') },
      h('button', { class: 'fb-cat-main', onclick: () => select(BASE_MATRIX) },
        h('span', { class: 'fb-cat-ic' }, window.UI.icon(catIconId(cat), { size: 26, fallback: cat.icon })),
        h('span', { class: 'n' }, cat.name),
        h('span', { class: 'c small faint' }, String(Object.keys(S.settings.baseRanks || {}).length || '')))));

  const clusterOn = FB.type === CLUSTER_GRID || FB.type === CLUSTER_SIZE_TYPE;
  const clusterRow = (cat) => h('div', { class: 'fb-cat' + (clusterOn ? ' current' : '') },
    h('div', { class: 'fb-cat-bar' + (clusterOn ? ' active' : '') },
      h('button', { class: 'fb-cat-main', onclick: () => select(CLUSTER_GRID) },
        h('span', { class: 'fb-cat-ic' }, window.UI.icon(catIconId(cat), { size: 26, fallback: cat.icon })),
        h('span', { class: 'n' }, cat.name),
        h('span', { class: 'c small faint' }, String(Object.keys(S.settings.clusterGrid || {}).length || '')))));

  // ---- edit mode: rename, add, reorder, and move subcategories ----
  const sections = effectiveCategories();
  const L = layout();
  const editRow = (cat, list, section, idx, count) => {
    const name = h('input', { value: cat.name, 'aria-label': `Name of ${cat.name}`, class: 'fb-cat-name' });
    name.addEventListener('change', () => {
      const v = name.value.trim();
      const names = { ...(L.names || {}) };
      if (!v || v === cat.defaultName) delete names[cat.id]; else names[cat.id] = v.slice(0, 60);
      saveLayout({ ...L, names });
    });
    const move = (dir) => {
      const ids = sections.find(([t]) => t === section)[1].map((c) => c.id);
      const j = idx + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[idx], ids[j]] = [ids[j], ids[idx]];
      saveLayout({ ...L, order: { ...(L.order || {}), [section]: ids } });
    };
    const remove = () => {
      if (list.length && !confirm(`Delete ${cat.name}? Its ${list.length} subcategories go back to where they were.`)) return;
      const assign = Object.fromEntries(Object.entries(L.assign || {}).filter(([, v]) => v !== cat.id));
      saveLayout({ ...L, assign, custom: (L.custom || []).filter((c) => c.id !== cat.id) });
    };
    const box = h('div', { class: 'fb-cat editing' },
      h('div', { class: 'fb-cat-bar' },
        h('span', { class: 'fb-cat-ic' }, window.UI.icon(catIconId(cat), { size: 22, fallback: cat.icon })),
        name,
        h('button', { class: 'fb-mini', title: 'Move up', 'aria-label': `Move ${cat.name} up`, disabled: idx === 0, onclick: () => move(-1) }, '↑'),
        h('button', { class: 'fb-mini', title: 'Move down', 'aria-label': `Move ${cat.name} down`, disabled: idx === count - 1, onclick: () => move(1) }, '↓'),
        cat.custom ? h('button', { class: 'fb-mini danger', title: 'Delete this category', 'aria-label': `Delete ${cat.name}`, onclick: remove }, '×') : null),
      cat.special ? null : h('div', { class: 'fb-cat-subs' },
        list.length ? list.map((t) => {
          const sel = h('select', { 'aria-label': `Move ${t.label} to`, onchange: (e) => {
            const to = e.target.value;
            const assign = { ...(L.assign || {}), [t.type]: to };
            saveLayout({ ...L, assign });
          } }, sections.map(([sec, cats]) => h('optgroup', { label: sec }, cats.filter((c) => !c.special).map((c) => h('option', { value: c.id, selected: c.id === cat.id }, c.name)))));
          const r = h('div', { class: 'fb-editsub', draggable: 'true', title: 'Drag onto another category, or pick one' },
            h('span', { class: 'grip', 'aria-hidden': 'true' }, '⠿'), h('span', { class: 'n' }, t.label), sel);
          r.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-poe-type', t.type); e.dataTransfer.effectAllowed = 'move'; });
          return r;
        }) : h('div', { class: 'small faint', style: { padding: '6px 8px' } }, 'Empty. Drag subcategories here.')));
    if (!cat.special) box.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-poe-type')) { e.preventDefault(); box.classList.add('drop-target'); } });
    box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove('drop-target'); });
    box.addEventListener('drop', (e) => {
      const type = e.dataTransfer.getData('text/x-poe-type');
      box.classList.remove('drop-target');
      if (!type) return;
      e.preventDefault();
      saveLayout({ ...L, assign: { ...(L.assign || {}), [type]: cat.id } });
    });
    return box;
  };
  const addBox = (section) => {
    const inp = h('input', { placeholder: 'New category name', 'aria-label': `New category in ${section}` });
    const add = () => {
      const v = inp.value.trim();
      if (!v) return;
      const id = `c_${Date.now().toString(36)}`;
      saveLayout({ ...L, custom: [...(L.custom || []), { id, name: v.slice(0, 60), section }] });
      toast(`Added "${v}". Drag subcategories onto it.`);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return h('div', { class: 'fb-addcat' }, inp, h('button', { class: 'sm', onclick: add }, '+ Add'));
  };
  const editing = FB.editCats;
  const editBar = h('div', { class: 'fb-editbar' },
    h('button', { class: editing ? 'primary sm' : 'sm', onclick: () => { FB.editCats = !FB.editCats; renderFilters(); } }, editing ? 'Done' : 'Edit categories'),
    editing && Object.keys(L).some((k) => Object.keys(L[k] || {}).length) ? h('button', { class: 'quiet sm', onclick: () => { if (confirm('Go back to the default categories? Your names, new categories and moves are removed.')) saveLayout({}); } }, 'Reset layout') : null);

  const pinned = pins.map((p) => view.types.find((t) => t.key === p)).filter(Boolean);
  return withResizer(h('nav', { class: 'fb-cats fb-cats-v2' + (editing ? ' edit' : ''), 'data-keep-scroll': 'cats', 'aria-label': 'Categories' }, searchBox(), editBar,
    editing ? h('p', { class: 'small muted', style: { margin: 0 } }, 'Rename categories, reorder them, add your own, and drag subcategories between them. This only changes how the list is organised, not your filter.') : null,
    !editing && pinned.length ? h('div', { class: 'fb-sec pinned' }, h('div', { class: 'fb-sec-title' }, 'Pinned'), h('div', { class: 'fb-sec-body' }, pinned.map((t) => row(t)))) : null,
    sections.map(([title, cats]) => {
      const present = editing ? cats : cats.filter((c) => byCat.has(c.id) || c.special);
      if (!present.length) return null;
      return h('div', { class: 'fb-sec' }, h('div', { class: 'fb-sec-title' }, title),
        h('div', { class: 'fb-sec-body' }, present.map((c, i) => (editing ? editRow(c, byCat.get(c.id) || [], title, i, present.length) : c.special === 'mybases' ? myBasesRow(c) : c.special === 'matrix' ? matrixRow(c) : c.special === 'clustergrid' ? clusterRow(c) : catRow(c, byCat.get(c.id))))),
        editing ? addBox(title) : null);
    })));

  function searchBox() {
    const inp = h('input', { type: 'search', placeholder: 'Find a category or base', value: FB.catQuery || '', 'aria-label': 'Find a category or base' });
    inp.addEventListener('input', () => {
      FB.catQuery = inp.value;
      clearTimeout(FB.catTimer);
      FB.catTimer = setTimeout(() => { renderFilters().then(() => { const n = document.querySelector('.fb-cats input[type=search]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 180);
    });
    return inp;
  }
}

// ---------------------------------------------------------------- look editor
function lookEditor(tier, redraw, onPreview, opts = {}) {
  const d = FB.draft;
  const hex = (a) => '#' + (a || [0, 0, 0]).slice(0, 3).map((n) => Math.max(0, Math.min(255, +n || 0)).toString(16).padStart(2, '0')).join('');
  const fromHex = (v, alpha) => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), alpha];
  const changed = () => onPreview();

  function colourRow(label, key, optional) {
    const on = h('input', { type: 'checkbox', checked: !!d[key], disabled: !optional, onchange: (e) => { d[key] = e.target.checked ? (d[key] || [255, 255, 255, 255]) : undefined; if (!e.target.checked) delete d[key]; changed(); } });
    const col = h('input', { type: 'color', value: hex(d[key] || [255, 255, 255]), 'aria-label': `${label} colour`, oninput: (e) => { d[key] = fromHex(e.target.value, d[key]?.[3] ?? 255); changed(); } });
    const alpha = h('input', { type: 'range', min: 0, max: 255, value: d[key]?.[3] ?? 255, 'aria-label': `${label} opacity`, style: { width: '90px' }, oninput: (e) => { d[key] = [...(d[key] || [255, 255, 255]).slice(0, 3), +e.target.value]; changed(); } });
    return h('div', { class: 'fb-ed-row' }, h('label', { class: 'check' }, optional ? on : null, h('span', {}, label)), col, h('span', { class: 'small faint' }, 'Opacity'), alpha);
  }

  // sound: keep the filter's own sound, one of our tinks, a game sound, or none
  const ownCustom = tier.style?.customSound && !/^poehelper-sounds\//.test(tier.style.customSound) ? tier.style.customSound : null;
  const current = d.customSound ? (window.UI.soundIdFromPath(d.customSound) || 'own') : d.sound?.id ? `game:${d.sound.id}` : 'none';
  const soundSel = h('select', { 'aria-label': 'Drop sound', onchange: (e) => {
    const v = e.target.value;
    delete d.customSound; delete d.customVolume; delete d.sound;
    if (v === 'own' && ownCustom) d.customSound = ownCustom;
    else if (v.startsWith('game:')) d.sound = { id: Number(v.slice(5)), volume: Number(vol.value) || 300 };
    else if (v !== 'none') d.customSound = window.UI.soundPath(v);
    playSound(v);
    changed();
    redraw();
  } },
  ownCustom ? h('option', { value: 'own', selected: current === 'own' }, `Filter's sound (${ownCustom})`) : null,
  h('option', { value: 'none', selected: current === 'none' }, 'No sound'),
  h('optgroup', { label: 'PoE Helper tinks' }, S.sounds.filter((s) => !s.user).map((s) => h('option', { value: s.id, selected: current === s.id }, `${s.name}, ${s.note}`))),
  S.sounds.some((s) => s.user) ? h('optgroup', { label: 'Your sounds' }, S.sounds.filter((s) => s.user).map((s) => h('option', { value: s.id, selected: current === s.id }, s.name))) : null,
  h('optgroup', { label: 'Game sounds (heard in game only)' }, Array.from({ length: 16 }, (_, i) => h('option', { value: `game:${i + 1}`, selected: current === `game:${i + 1}` }, `Game sound ${i + 1}`))));
  const vol = h('input', { type: 'range', min: 0, max: 300, value: d.sound?.volume ?? d.customVolume ?? 300, style: { width: '100px' }, 'aria-label': 'Volume', oninput: (e) => { if (d.sound) d.sound.volume = +e.target.value; else if (d.customSound) d.customVolume = +e.target.value; } });

  const beamSel = h('select', { 'aria-label': 'Light beam', onchange: (e) => { d.beam = e.target.value ? { color: e.target.value, temp: beamTemp.checked } : null; if (!e.target.value) delete d.beam; changed(); } },
    h('option', { value: '' }, 'No beam'), COLOURS.map((c) => h('option', { value: c, selected: d.beam?.color === c }, `${c} beam`)));
  const beamTemp = h('input', { type: 'checkbox', checked: !!d.beam?.temp, onchange: (e) => { if (d.beam) d.beam.temp = e.target.checked; } });

  const iconColour = h('select', { 'aria-label': 'Minimap icon colour', onchange: (e) => { if (!e.target.value) delete d.icon; else d.icon = { size: d.icon?.size ?? 1, shape: d.icon?.shape || 'Circle', color: e.target.value }; changed(); } },
    h('option', { value: '' }, 'No minimap icon'), COLOURS.map((c) => h('option', { value: c, selected: d.icon?.color === c }, c)));
  const iconShape = h('select', { 'aria-label': 'Minimap icon shape', onchange: (e) => { if (d.icon) { d.icon.shape = e.target.value; changed(); } } },
    SHAPES.map((s) => h('option', { value: s, selected: d.icon?.shape === s }, s === 'UpsideDownHouse' ? 'House' : s)));
  const iconSize = h('select', { 'aria-label': 'Minimap icon size', onchange: (e) => { if (d.icon) { d.icon.size = +e.target.value; changed(); } } },
    [[0, 'Large'], [1, 'Medium'], [2, 'Small']].map(([v, l]) => h('option', { value: v, selected: (d.icon?.size ?? 1) === v }, l)));

  const size = h('input', { type: 'range', min: 18, max: 45, value: d.fontSize || 32, style: { width: '160px' }, 'aria-label': 'Text size', oninput: (e) => { d.fontSize = +e.target.value; sizeOut.textContent = e.target.value; changed(); } });
  const sizeOut = h('span', { class: 'small muted' }, String(d.fontSize || 32));

  // the sound sits at the bottom as one line; the full picker opens when you ask for it
  const soundName = (() => {
    const v = current;
    if (v === 'none') return 'No sound';
    if (v === 'own') return `Filter's sound (${ownCustom})`;
    if (v.startsWith('game:')) return `Game sound ${v.slice(5)}`;
    return S.sounds.find((x) => x.id === v)?.name || v;
  })();
  const soundOpen = FB.soundOpen === tier.key;
  const soundBox = h('div', { class: 'fb-ed-sound' },
    h('div', { class: 'fb-ed-row' }, h('span', {}, 'Sound'),
      h('b', { class: 'small' }, soundName), window.UI.soundButton(window.UI.normalizeStyle(d).sound),
      h('button', { class: 'quiet sm', 'aria-expanded': soundOpen ? 'true' : 'false', onclick: () => { FB.soundOpen = soundOpen ? null : tier.key; redraw(); } }, soundOpen ? 'Done' : 'Change')),
    soundOpen ? h('div', { class: 'stack', style: { gap: '8px', marginTop: '8px' } },
      h('div', { class: 'fb-ed-row' }, h('span', {}, ''), soundSel),
      h('div', { class: 'fb-ed-row' }, h('span', {}, 'Volume'), vol),
      h('div', { class: 'fb-ed-row' }, h('span', {}, ''), window.UI.soundDropZone((snd) => {
        S.sounds = [...S.sounds.filter((x) => x.id !== snd.id), snd];
        delete d.sound; delete d.customVolume;
        d.customSound = window.UI.soundPath(snd.id);
        playSound(snd.id);
        redraw();
      }))) : null);

  return h('div', { class: 'fb-editor' },
    h('div', { class: 'fb-ed-grid' },
      h('div', { class: 'stack', style: { gap: '10px' } },
        colourRow('Text', 'text', false),
        colourRow('Border', 'border', true),
        colourRow('Background', 'background', true),
        h('div', { class: 'fb-ed-row' }, h('span', {}, 'Size'), size, sizeOut)),
      h('div', { class: 'stack', style: { gap: '10px' } },
        h('div', { class: 'fb-ed-row' }, h('span', {}, 'Beam'), beamSel, h('label', { class: 'check small' }, beamTemp, 'Only when it drops')),
        h('div', { class: 'fb-ed-row' }, h('span', {}, 'Minimap'), iconColour, iconShape, iconSize))),
    soundBox,
    h('div', { class: 'row', style: { marginTop: '14px' } },
      h('button', { class: 'primary', onclick: async () => { if (!d.text) d.text = [200, 200, 200, 255]; if (opts.onSave) await opts.onSave(d); else await call('tiers:style', { key: tier.key, style: d }); FB.editing = null; toast(`Saved the look of ${tierName(tier)}`); renderFilters(); } }, 'Save look'),
      h('button', { class: 'quiet', onclick: () => { FB.editing = null; redraw(); } }, 'Cancel'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'quiet', onclick: async () => { if (opts.onReset) await opts.onReset(); else await call('tiers:style', { key: tier.key, style: null }); FB.editing = null; toast(opts.onReset ? 'Back to the default look' : 'Back to the FilterBlade look'); renderFilters(); } }, opts.resetLabel || 'Use the FilterBlade look')));
}

// ---------------------------------------------------------------- price review (auto-tiering)
const MARGINS = [[1, 'At the exact price boundary'], [1.5, 'Only clearly misplaced items (1.5× past the boundary)'], [2, 'Very conservative (2× past the boundary)']];
const selKey = (type, base) => `${type}\t${base}`;

/** Every price move in every category at once (same rules as Price review). Undo it on Price review. */
async function applyAllPrices() {
  FB.applyingAll = true;
  renderFilters();
  try {
    const r = await call('review:run', {});
    const moves = r.categories.flatMap((c) => c.moves.map(({ base, from, to, chaos }) => ({ type: c.type, base, from, to, chaos })));
    if (!moves.length) toast(`Every priced item already fits its tier at today's ${r.league} prices.`);
    else {
      const res = await call('review:apply', moves);
      const cats = new Set(moves.map((m) => m.type)).size;
      toast(`Moved ${res.count} items in ${cats} ${cats === 1 ? 'category' : 'categories'} to the tiers their prices fit. Zone or reload the filter in game. Undo: Price review → Undo last run.`);
    }
    FB.prices = {};
    FB.review = null;
  } catch { /* toast shown */ }
  FB.applyingAll = false;
  renderFilters();
}

async function runReview(types = null) {
  {
    const r = await call('review:run', types ? { types } : {});
    if (types && FB.review) {
      const map = new Map(r.categories.map((c) => [c.type, c]));
      FB.review.categories = FB.review.categories.map((c) => map.get(c.type) || c);
      FB.review.cfg = r.cfg;
    } else {
      FB.review = r;
      FB.reviewSel = new Set(r.categories.filter((c) => c.enabled).flatMap((c) => c.moves.map((m) => selKey(c.type, m.base))));
    }
    for (const c of r.categories) {
      for (const m of c.moves) if (c.enabled && types) FB.reviewSel.add(selKey(c.type, m.base));
    }
  }
}

async function renderReview(body) {
  const log = await call('review:log').catch(() => []);
  const cfg = FB.review?.cfg || S.settings.priceReview || {};
  const saveCfg = async (patch) => { const next = await call('review:config', patch); if (FB.review) FB.review.cfg = next; };

  const minL = h('input', { type: 'number', min: 0, value: cfg.minListings ?? 5, style: { width: '70px' }, onchange: async (e) => { await saveCfg({ minListings: Math.max(0, +e.target.value || 0) }); if (FB.review) { await runReview(); renderFilters(); } } });
  const marginSel = h('select', { onchange: async (e) => { await saveCfg({ margin: +e.target.value }); if (FB.review) { await runReview(); renderFilters(); } } }, MARGINS.map(([v, l]) => h('option', { value: v, selected: Number(cfg.margin ?? 1.5) === v }, l)));
  const last = log[0];

  const head = h('div', { class: 'panel stack' },
    h('div', { class: 'row' },
      h('div', { style: { flex: 1 } },
        h('h2', {}, 'Auto-tier by current prices'),
        h('p', { class: 'small muted' }, 'Checks poe.ninja for every category it prices and moves items to the tier their price fits now. Uses the same 20-minute price cache as price checks, so no requests to GGG.')),
      h('button', { class: 'primary', disabled: FB.reviewBusy, onclick: async () => { FB.reviewBusy = true; renderFilters(); try { await runReview(); } catch { /* toast */ } FB.reviewBusy = false; renderFilters(); } }, FB.reviewBusy ? 'Checking…' : FB.review ? 'Check again' : 'Check prices')),
    h('div', { class: 'row small' },
      h('span', { class: 'muted' }, 'Move'), marginSel,
      h('span', { class: 'muted' }, 'Ignore prices with fewer than'), minL, h('span', { class: 'muted' }, 'listings')),
    h('div', { class: 'row small' },
      toggle(!!cfg.includeNew, async (v) => { await saveCfg({ includeNew: v }); if (FB.review) { await runReview(); renderFilters(); } }, 'Also tier items your filter doesn\'t list yet (new league items)'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'small muted' }, 'Tick "Auto-update" on a category to re-tier it every hour.')),
    last ? h('div', { class: 'row small', style: { borderTop: '1px solid var(--line-soft)', paddingTop: '10px' } },
      h('span', { class: 'muted', style: { flex: 1 } }, `Last run ${ago(Date.now() - last.at)}${last.auto ? ' (automatic)' : ''}: moved ${last.moves.length} ${last.moves.length === 1 ? 'item' : 'items'}${last.moves.length ? ', for example ' + last.moves.slice(0, 3).map((m) => m.base).join(', ') : ''}.`),
      h('button', { class: 'sm', onclick: async () => { const r = await call('review:undo'); toast(`Put back ${r.undone} items`); FB.prices = {}; if (FB.review) await runReview(); renderFilters(); } }, 'Undo last run')) : null);

  if (FB.reviewBusy) {
    mount(body, head, h('div', { class: 'panel empty', style: { marginTop: '14px' } }, h('span', { class: 'spin' }), ' Checking poe.ninja prices for every category. The first check takes a few seconds; after that prices come from the cache.'));
    return;
  }
  if (!FB.review) {
    mount(body, head, h('div', { class: 'panel empty', style: { marginTop: '14px' } }, 'Press "Check prices" to compare your tiers with poe.ninja.'));
    return;
  }

  const r = FB.review;
  const total = r.categories.reduce((a, c) => a + c.moves.length, 0);
  const selected = r.categories.flatMap((c) => c.moves.filter((m) => FB.reviewSel.has(selKey(c.type, m.base))).map((m) => ({ ...m, type: c.type })));
  const skipped = r.categories.reduce((a, c) => a + c.skipped.fewListings, 0);
  const filterDate = r.filterUpdated ? new Date(r.filterUpdated).toLocaleDateString() : null;

  const summary = h('div', { class: 'fb-pricebar', style: { marginTop: '14px' } },
    h('div', { style: { flex: 1 } },
      h('div', {}, total ? `${total} ${total === 1 ? 'item belongs' : 'items belong'} in a different tier at today's ${r.league} prices.` : `Every priced item already fits its tier at today's ${r.league} prices.`),
      h('div', { class: 'small muted' }, [filterDate ? `Your tiers are from FilterBlade on ${filterDate}.` : null, skipped ? `${skipped} skipped for having few listings.` : null, `${r.categories.length} categories checked.`].filter(Boolean).join(' '))));

  const cards = r.categories.map((c) => categoryCard(c));
  const bar = h('div', { class: 'fb-selbar' }, selected.length ? h('div', { class: 'fb-selbar-in' },
    h('b', {}, `${selected.length} of ${total} moves selected`),
    h('span', { class: 'spacer' }),
    h('button', { class: 'quiet', onclick: () => { FB.reviewSel.clear(); renderFilters(); } }, 'Select none'),
    h('button', { class: 'primary', onclick: async () => {
      const res = await call('review:apply', selected.map(({ type, base, from, to, chaos }) => ({ type, base, from, to, chaos })));
      toast(`Moved ${res.count} items. Your "(helper)" filter is updated; zone or reload it in game.`);
      FB.prices = {};
      await runReview();
      renderFilters();
    } }, `Apply ${selected.length} ${selected.length === 1 ? 'move' : 'moves'}`)) : null);

  mount(body, head, summary, h('div', { class: 'stack', style: { marginTop: '14px', gap: '10px', paddingBottom: '80px' } }, cards), bar);

  function categoryCard(c) {
    const open = FB.reviewOpen.has(c.type) || (c.moves.length > 0 && c.moves.length <= 12 && !FB.reviewOpen.has('!' + c.type));
    const allSel = c.moves.length && c.moves.every((m) => FB.reviewSel.has(selKey(c.type, m.base)));
    const look = (tier) => c.tierLooks?.[tier] || {};
    const tname = (tier) => tierName({ tier });

    // FilterBlade-style table: one row per tier, Include, and "Over [ ] c or [ ] div". Saved as "200c" or
    // "1 div"; older values like "0.5 ex" or a bare number (the unit this category used before) still work.
    const units = r.units || { chaos: 1 };
    const oldUnit = units[c.unit] ? c.unit : 'chaos';
    const short = (n) => (n >= 100 ? Math.round(n) : n >= 10 ? +n.toFixed(1) : n >= 1 ? +n.toFixed(2) : +n.toPrecision(2));
    /** chaos -> "1.2 div" from a divine up, else "34c" */
    const fmtU = (chaos) => {
      if (chaos == null) return '';
      if (units.divine && chaos >= units.divine * 0.95) return `${short(chaos / units.divine)} div`;
      return `${short(chaos)}c`;
    };
    /** what you typed, shown back with its unit */
    const shownRaw = (v) => (v == null || v === '' ? '' : typeof v === 'number' ? (oldUnit === 'chaos' ? `${v}c` : `${v} ${oldUnit === 'divine' ? 'div' : 'ex'}`) : String(v));
    const PRICE = /^\s*(\d+(?:[.,]\d+)?)\s*(c|ch|chaos|d|div|divs|divine|divines|e|ex|exa|exalt|exalted|exalts)?\s*$/i;
    const catCfg = () => r.cfg.categories?.[c.type] || {};
    const saveCat = async (patch) => {
      const next = { ...catCfg(), ...patch };
      const cfgNext = await call('review:config', { categories: { [c.type]: next } });
      r.cfg = cfgNext;
      await runReview([c.type]);
      renderFilters();
    };
    const countOf = (tier) => c.tierCounts?.[tier];
    const tierRows = c.tiers.map((t) => {
      // two boxes, "Over [ ] c" and "[ ] div": the one you typed in last is used, the other shows the same price converted
      const raw = shownRaw(c.raw?.[t.tier]);
      const m = PRICE.exec(raw || '');
      const rawNum = m ? Number(m[1].replace(',', '.')) : null;
      const rawUnit = !m ? null : !m[2] || /^c/i.test(m[2]) ? 'chaos' : /^d/i.test(m[2]) ? 'divine' : 'exalted';
      const rawChaos = rawNum == null ? null : rawNum * (units[rawUnit] || 1);
      const box = (unit) => {
        const typed = rawUnit === unit;
        const conv = rawChaos == null || typed ? null : unit === 'chaos' ? short(rawChaos) : units.divine ? short(rawChaos / units.divine) : null;
        const sugg = t.suggested == null ? '' : unit === 'chaos' ? String(short(t.suggested)) : units.divine ? String(short(t.suggested / units.divine)) : '';
        const inp = h('input', {
          type: 'text', inputmode: 'decimal', class: 'rv-th' + (typed ? ' typed' : conv != null ? ' derived' : ''),
          value: typed ? String(rawNum) : conv != null ? String(conv) : '', placeholder: sugg,
          disabled: !t.included || (unit === 'divine' && !units.divine),
          'aria-label': `${tname(t.tier)}: worth over, in ${unit === 'chaos' ? 'chaos' : 'divines'}`,
          title: unit === 'chaos' ? 'Price in chaos. Leave both boxes empty to use the suggestion.' : units.divine ? `Price in divines (1 div is ${Math.round(units.divine)}c today).` : 'No Divine Orb price from poe.ninja yet.',
          style: { width: '64px' },
        });
        const save = () => {
          const v = inp.value.trim().replace(',', '.');
          const th = { ...(catCfg().thresholds || {}) };
          if (!v) delete th[t.tier];
          else if (!/^\d+(\.\d+)?$/.test(v)) { inp.classList.add('bad-input'); return toast('Type a number, like 200 or 1.5.', true); }
          else th[t.tier] = unit === 'chaos' ? `${v}c` : `${v} div`;
          inp.classList.remove('bad-input');
          saveCat({ thresholds: th });
        };
        // saves on Enter or when you leave the box; no extra click needed
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
        inp.addEventListener('change', save);
        return inp;
      };
      const thBoxes = h('span', { class: 'row small rv-ths', style: { gap: '5px', flexWrap: 'nowrap' } },
        h('span', { class: 'muted' }, 'Over'), box('chaos'), h('span', { class: 'muted' }, 'c'), h('span', { class: 'faint' }, 'or'), box('divine'), h('span', { class: 'muted' }, 'div'));
      const inc = h('input', { type: 'checkbox', checked: t.included, 'aria-label': `Include ${tname(t.tier)}`, onchange: (e) => saveCat({ include: { ...(catCfg().include || {}), [t.tier]: e.target.checked } }) });
      return h('tr', { class: t.included ? '' : 'rv-excluded' },
        h('td', {}, dropLabel(tname(t.tier), look(t.tier), { scale: 0.6, hidden: t.action === 'Hide' })),
        h('td', {}, h('label', { class: 'check small' }, inc, t.included ? 'Included' : 'Excluded')),
        h('td', {}, t.included ? thBoxes : h('span', { class: 'small faint' }, 'Never filled; its items stay where they are')),
        h('td', { class: 'small muted' }, t.median != null ? `typically ${fmtU(t.median)}` : 'no prices yet'),
        h('td', { class: 'small faint r' }, t.included && t.min != null && !c.raw?.[t.tier] ? `using ${fmtU(t.min)}` : ''));
    });
    const restInc = h('input', { type: 'checkbox', checked: c.rest === 'hide', 'aria-label': 'Hide anything less valuable', onchange: (e) => saveCat({ rest: e.target.checked ? 'hide' : 'keep' }) });
    tierRows.push(h('tr', { class: c.rest === 'hide' ? '' : 'rv-excluded' },
      h('td', {}, h('span', { class: 'rv-rest' }, 'Anything less valuable')),
      h('td', {}, h('label', { class: 'check small' }, restInc, c.rest === 'hide' ? 'Included' : 'Excluded')),
      h('td', { colspan: 3, class: 'small muted' }, c.rest === 'hide' ? 'Hidden in game (moved to your hidden tier)' : 'Left in whatever tier it is in now')));
    const thresholds = h('div', {},
      h('div', { class: 'row small', style: { marginBottom: '6px' } },
        h('span', { class: 'muted' }, 'Type each price in chaos or in divines; the box you typed in last counts.'),
        units.divine ? h('span', { class: 'faint' }, `poe.ninja now: 1 divine = ${Math.round(units.divine)}c${units.exalted ? `, 1 exalted = ${+units.exalted.toFixed(1)}c` : ''}`) : null),
      h('table', { class: 'rv-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Tier'), h('th', {}, 'Include'), h('th', {}, 'Threshold'), h('th', {}), h('th', {}))), h('tbody', {}, tierRows)),
      h('div', { class: 'small faint', style: { marginTop: '6px' } }, 'Each item goes to the highest included tier it is worth. Leave a threshold empty to use the suggested value, halfway between neighbouring tiers.'));

    const rows = c.moves.map((m) => {
      const k = selKey(c.type, m.base);
      return h('tr', {},
        h('td', { style: { width: '28px' } }, h('input', { type: 'checkbox', checked: FB.reviewSel.has(k), 'aria-label': `Move ${m.base}`, onchange: (e) => { e.target.checked ? FB.reviewSel.add(k) : FB.reviewSel.delete(k); renderFilters(); } })),
        h('td', {}, h('span', { class: `fb-sugg ${m.direction === 'down' ? 'down' : 'up'}` }, m.direction === 'down' ? '▼' : m.direction === 'new' ? '+' : '▲'), ' ', m.base),
        h('td', { class: 'r' }, m.big ? h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap', justifyContent: 'flex-end' } },
          h('span', { class: 'small muted', title: 'A week ago on poe.ninja' }, `${fmtC(m.trend.old)} →`), fmtC(m.chaos), window.Farm.trendBadge(m.trend.change),
          window.Farm.graphButton({ name: m.base, chaos: m.chaos, old: m.trend.old, change: m.trend.change, points: m.trend.points }, units.divine, '')) : fmtC(m.chaos)),
        h('td', {}, m.from ? dropLabel(tname(m.from), look(m.from), { scale: 0.55, hidden: c.tiers.find((t) => t.tier === m.from)?.action === 'Hide' }) : h('span', { class: 'small muted' }, 'not in filter')),
        h('td', { class: 'muted' }, '→'),
        h('td', {}, dropLabel(tname(m.to), look(m.to), { scale: 0.55, hidden: m.toAction === 'Hide' })));
    });

    return h('div', { class: 'rv-card' },
      h('div', { class: 'rv-head' },
        h('label', { class: 'check', title: 'Re-check this category every hour and move items automatically' },
          h('input', { type: 'checkbox', checked: !!c.auto, onchange: async (e) => { r.cfg = await call('review:config', { categories: { [c.type]: { ...(r.cfg.categories?.[c.type] || {}), auto: e.target.checked } } }); c.auto = e.target.checked; toast(e.target.checked ? `${c.label} is re-tiered every hour` : `${c.label} is only re-tiered when you apply it`); renderFilters(); } }),
          h('span', { class: 'small muted' }, 'Auto-update')),
        h('button', { class: 'rv-title', onclick: () => { if (open) { FB.reviewOpen.delete(c.type); FB.reviewOpen.add('!' + c.type); } else { FB.reviewOpen.add(c.type); FB.reviewOpen.delete('!' + c.type); } renderFilters(); } },
          h('span', {}, open ? '▾ ' : '▸ '), catIcon(c.type), h('span', {}, c.label),
          h('span', { class: c.moves.length ? 'pill warn' : 'pill' }, c.moves.length ? `${c.moves.length} ${c.moves.length === 1 ? 'move' : 'moves'}` : 'fits')),
        h('span', { class: 'spacer' }),
        c.moves.length ? h('button', { class: 'quiet sm', onclick: () => { for (const m of c.moves) { const k = selKey(c.type, m.base); allSel ? FB.reviewSel.delete(k) : FB.reviewSel.add(k); } renderFilters(); } }, allSel ? 'Select none' : 'Select all') : null,
        c.moves.length ? h('button', { class: 'primary sm', title: `Move the ticked items of ${c.label} now`, onclick: async () => {
          const mine = c.moves.filter((m) => FB.reviewSel.has(selKey(c.type, m.base))).map(({ base, from, to, chaos }) => ({ type: c.type, base, from, to, chaos }));
          if (!mine.length) return toast('Tick the moves to apply first.');
          const res = await call('review:apply', mine);
          toast(`${c.label}: moved ${res.count} items. Zone or reload the filter in game.`);
          FB.prices = {};
          await runReview([c.type]);
          renderFilters();
        } }, `Apply ${c.label.replace(/^[^:]+:\s*/, '')}`) : null),
      open ? h('div', { class: 'rv-body' },
        thresholds,
        c.moves.length ? h('table', { class: 'rv-moves' }, h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, 'Item'), h('th', { class: 'r' }, 'Now'), h('th', {}, 'From'), h('th', {}), h('th', {}, 'To'))), h('tbody', {}, rows)) : h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Everything here fits its tier.'),
        c.skipped.fewListings ? h('p', { class: 'small faint', style: { marginTop: '6px' } }, `Skipped (few listings): ${c.skipped.fewListingsNames.join(', ')}${c.skipped.fewListings > c.skipped.fewListingsNames.length ? '…' : ''}`) : null) : null);
  }
}

window.renderFilters = renderFilters;
})();

