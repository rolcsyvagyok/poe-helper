/* Loot filter page, laid out like FilterBlade: categories on the left, tiers on the right,
   bases as chips you select or drag between tiers, and a look editor per tier.
   Uses helpers defined in app.js (S, refreshState, pageHead, toggle, soundPicker, renderFilterExtras). */
(() => {
'use strict';
const { h, mount, ago, toast, call, dropLabel, soundButton, playSound, GAME_COLOURS } = window.UI;

const FB = { newTier: false, tab: 'tiers', priceColors: false, collapsed: new Set(), names: {}, catQuery: '', catTimer: null, openGroups: new Set(), closedGroups: new Set(), closedSections: new Set(), review: null, reviewSel: new Set(), reviewOpen: new Set(), reviewBusy: false, tab: 'tiers', type: null, selected: new Set(), search: '', editing: null, draft: null, prices: {}, showSuggestions: false };
// prices: chaos in PoE1, exalted in PoE2
const fmtC = (c) => {
  if (c == null || !Number.isFinite(c)) return '';
  const u = S.settings?.game === 'poe2' ? ' ex' : 'c';
  return c < 0.01 ? `<0.01${u}` : c >= 100 ? `${Math.round(c)}${u}` : c >= 10 ? `${c.toFixed(0)}${u}` : c >= 1 ? `${c.toFixed(1).replace(/\.0$/, '')}${u}` : `${c.toFixed(2).replace(/0$/, '')}${u}`;
};
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
  loadArt();
  const g = FB.goto;
  const reveal = FB.revealNav;
  FB.revealNav = false;
  const p = window.UI.keepScroll(() => renderFiltersNow());
  // opened from elsewhere (Show in app): the category list shows where you are
  if (reveal) p.then(() => setTimeout(() => {
    const nav = document.querySelector('#page-filters .fb-cats');
    const at = nav?.querySelector('.fb-row.active') || nav?.querySelector('.fb-cat.current');
    if (!at) return;
    const nr = nav.getBoundingClientRect();
    const ar = at.getBoundingClientRect();
    nav.scrollTop += ar.top - nr.top - nr.height / 2 + ar.height / 2;
    at.classList.add('fb-flash');
    setTimeout(() => at.classList.remove('fb-flash'), 2600);
  }, 80));
  if (g) p.then(() => setTimeout(() => {
    FB.goto = null;
    const card = [...document.querySelectorAll('#page-filters .fb-tier')].find((el) => el.dataset.key === g.key);
    if (!card) return;
    card.scrollIntoView({ block: 'center' });
    card.classList.add('fb-flash');
    const chip = [...card.querySelectorAll('.fb-chip')].find((c) => c.textContent.trim().startsWith(g.base));
    chip?.classList.add('fb-flash');
    setTimeout(() => card.querySelectorAll('.fb-flash').forEach((x) => x.classList.remove('fb-flash')) || card.classList.remove('fb-flash'), 2600);
  }, 60));
  return p;
}
// Some FilterBlade tiers belong somewhere else than their category: NeverSink keeps the Heist and Ritual
// bases in "exotic bases", but you look for them under Heist and Ritual. Those tiers get their own
// subcategory (key "type#name"); everything you do there still goes to the real filter category.
const TIER_SPLITS = [
  { type: 'exoticbases', tier: 'exoticheistbases', key: 'exoticbases#heist', label: 'Heist bases' },
  { type: 'exoticbases', tier: 'exoticritualbases', key: 'exoticbases#ritual', label: 'Ritual bases' },
  // cards that only matter in stacks get their own page, below the card tiers
  // abyss jewels in the same parts as normal jewels: normal, special (corrupted), levelling
  { type: 'jewels->abyss', tier: 'corruptedabyssjewel', key: 'jewels->abyss#special', label: 'Special (corrupted)' },
  { type: 'jewels->abyss', tier: 'extramodcorruptedabyssjewel', key: 'jewels->abyss#special', label: 'Special (corrupted)' },
  { type: 'jewels->leveling', tier: 'abyss', key: 'jewels->abyss#leveling', label: 'Levelling' },
  { type: 'divination', tier: 'excustomstack', key: 'divination#stacks', label: 'Stacked cards' },
  { type: 'divination', tier: 'exstack', key: 'divination#stacks', label: 'Stacked cards' },
  // 3.30 Fated items: NeverSink keeps them with the vendor recipe rares and the decorators
  ...[['rr', 't1f'], ['rr', 't2f'], ['rr', 'fatedoverride'], ['rr', 'fatedspecial']].map(([type, tier]) => ({ type, tier, key: 'rr#fated', label: 'Fated rares' })),
  ...['t1f', 't2f'].map((tier) => ({ type: 'rr->amuring', tier, key: 'rr->amuring#fated', label: 'Fated rings and amulets' })),
  ...['t1f', 't2f'].map((tier) => ({ type: 'rr->belts', tier, key: 'rr->belts#fated', label: 'Fated belts' })),
  { type: 'decorators->rareeg', tier: 'fatedgear', key: 'decorators->rareeg#fated', label: 'Fated gear look (maps)' },
  { type: 'decorators->leveling->rare', tier: 'fatedgear', key: 'decorators->leveling->rare#fated', label: 'Fated gear look (levelling)' },
];
// Several filter categories shown as one subcategory, with a switch between them on its page.
const TYPE_MERGES = [
  { key: 'heist#equipment', label: 'Heist equipment', short: 'Equipment', parts: [['heist->cloak', 'Cloaks'], ['heist->brooch', 'Brooches'], ['heist->gear', 'Gear'], ['heist->tool', 'Tools']] },
];
// Some league mechanics have no category of their own in the filter: their items sit in the shared
// currency tiers. A base view shows only those items (key "type@id"); moving one still moves it in the real tiers.
const EXPEDITION = ['Astragali', 'Exotic Coinage', 'Scrap Metal', 'Burial Medallion'];
const isThread = (b) => /\bThread$/.test(b); // 3.30 threads (Abyss Thread, Breach Thread...)
const BASE_VIEWS = [
  { type: 'fragments', key: 'fragments@threads', label: 'Threads', test: isThread },
  { type: 'currency', key: 'currency@expedition', label: 'Expedition currency', bases: EXPEDITION },
  { type: 'currency->stackedsix', key: 'currency->stackedsix@expedition', label: 'Big stacks', bases: EXPEDITION },
  { type: 'currency->stackedthree', key: 'currency->stackedthree@expedition', label: 'Small stacks', bases: EXPEDITION },
];
function baseViews(types) {
  const out = [];
  for (const bv of BASE_VIEWS) {
    const t = types.find((x) => x.key === bv.type);
    const has = bv.test || ((b) => bv.bases.includes(b));
    if (!t || !t.tiers.some((y) => y.bases.some(has))) continue;
    const bases = [...new Set(t.tiers.flatMap((y) => y.bases.filter(has)))];
    // only the tiers that hold some of these items; the others are still offered under "Move to"
    const all = t.tiers.map((y) => ({ ...y, bases: y.bases.filter(has) }));
    out.push({ ...t, key: bv.key, label: bv.label, subLabel: bv.label, baseView: bases, allTiers: all, tiers: all.filter((y) => y.bases.length) });
  }
  return out;
}
const mergeOf = (key) => TYPE_MERGES.find((m) => m.key === key || m.parts.some(([k]) => k === key)) || null;
// Scrolls: every tier that holds only scrolls, from wherever FilterBlade keeps them, listed on one page
// (the list comes from the app: core/filter/scrolls.js). Their own pages don't list them any more.
const SCROLLS_KEY = 'currency->scrolls';
function scrollsView(view) {
  const list = view.scrolls || [];
  if (!list.length) return view;
  const keys = new Set(list.map((x) => x.key));
  const found = new Map();
  const types = [];
  for (const t of view.types) {
    for (const y of t.tiers) if (keys.has(y.key)) found.set(y.key, { ...y, fromType: t.type, fromLabel: t.label });
    const rest = t.tiers.filter((y) => !keys.has(y.key));
    if (rest.length || !t.tiers.length) types.push(rest.length === t.tiers.length ? t : { ...t, tiers: rest });
  }
  const tiers = list.map((x) => found.get(x.key)).filter(Boolean).map((y) => {
    // "Wisdom scroll", "Wisdom scroll 3+"...; moving bases between these makes no sense, so they read like special tiers
    const x = list.find((z) => z.key === y.key);
    const word = ['Wisdom scroll', 'Portal scroll', 'Scroll fragment'][x.kind];
    return { ...y, customName: `${word}${x.stack ? ` ${x.stack}+` : ''}${x.empty ? ' (empty rule)' : ''}`, special: true };
  });
  const cur = view.types.find((t) => t.type === 'currency') || view.types[0];
  types.push({ ...cur, key: SCROLLS_KEY, type: SCROLLS_KEY, label: 'Scrolls', subLabel: 'Scrolls', scrollsView: true, tiers });
  return { ...view, types };
}
function splitTypes(view) {
  if (!view?.types) return view;
  // Tier 7 and lower of currency are folded into Tier 6 by the app; the emptied tiers aren't listed
  view = { ...view, types: view.types.map((t) => (t.tiers.some((x) => x.folded) ? { ...t, tiers: t.tiers.filter((x) => !x.folded) } : t)) };
  view = scrollsView(view);
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
// Regular maps: only the tiers by map tier (no highlight rules), Tier 16 first
const mapTierNo = (y) => Number((/^maps_[a-z]_t(\d+)$/.exec(y.tier) || [])[1]);
function splitTiers(view) {
  const out = [];
  for (let t of view.types) {
    if (t.type === 'maps') t = { ...t, tiers: t.tiers.filter((y) => mapTierNo(y) > 0).sort((a, b) => mapTierNo(b) - mapTierNo(a)) };
    const splits = TIER_SPLITS.filter((x) => x.type === t.type && t.tiers.some((y) => y.tier === x.tier));
    const rest = t.tiers.filter((y) => !splits.some((x) => x.tier === y.tier));
    // what's left of a split category keeps its page, under a plain name ("Normal" for abyss jewels)
    const restLabel = { 'jewels->abyss': 'Normal' }[t.type];
    if (rest.length || !splits.length) out.push({ ...t, key: t.type, tiers: rest, ...(restLabel && splits.length ? { subLabel: restLabel } : {}) });
    // several tiers can share one page (both stack tiers of divination cards)
    for (const key of [...new Set(splits.map((x) => x.key))]) {
      const x = splits.find((y) => y.key === key);
      const tiers = splits.filter((y) => y.key === key).map((y) => y.tier);
      out.push({ ...t, key, label: x.label, subLabel: x.label, tiers: t.tiers.filter((y) => tiers.includes(y.tier)) });
    }
  }
  return { ...view, types: out };
}

async function renderFiltersNow() {
  if (FB.tab === 'rules' || FB.tab === 'price' || FB.tab === 'file') FB.tab = 'tiers'; // tabs that moved or went away
  await refreshState();
  // Path of Exile 2: the tiers, strictness and chat (the price review and item check are PoE1's)
  const p2 = isP2();
  if (p2) FB.tab = 'tiers';
  const el = $('page-filters');
  const info = await call('filter:list');
  let view = null;
  if (info.base) {
    try { const raw = await call('tiers:view'); FB.alwaysShow = raw?.alwaysShow || {}; view = splitTypes(raw); } catch { view = null; }
  }
  // stacks: NeverSink shows stacks of cheap currency (3+, 5+, 10+) in their own tiers, before the single ones.
  // base -> the stack tiers that hold it, so a hidden tier can say "stacks of it still show"
  FB.stackIdx = new Map();
  for (const ty of view?.types || []) for (const x of ty.tiers || []) {
    if (!x.stackSize || !x.hasBaseList) continue;
    for (const b of x.bases || []) { if (!FB.stackIdx.has(b)) FB.stackIdx.set(b, []); FB.stackIdx.get(b).push({ t: x, label: ty.label, type: ty.type }); }
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
      info.missing ? '' : !info.files.length ? (p2 ? 'No filters found. Download a PoE2 filter from FilterBlade (or NeverSink\'s PoE2 filter) into Documents\\My Games\\Path of Exile 2, or use "Import a filter file".' : 'No filters found. Download your filter from FilterBlade into the folder set in Settings, Loot filter file.')
        : !info.base ? 'Pick the filter you downloaded from FilterBlade.'
          : info.lastWrite ? `Your version is "${helperName}", saved ${ago(Date.now() - info.lastWrite.at)}. Select it in game once.` : `Changes are saved to "${helperName}". Select it in game once.`),
    info.base ? h('button', { class: 'primary sm fchat-btn', 'aria-expanded': FC.open ? 'true' : 'false', title: 'Tell the app what to change: "Separate Stacked Decks into a new tier"', onclick: () => toggleChat() }, chatIcon(), 'Ask the filter chat') : null,
    h('button', { class: 'quiet sm', title: 'Copy a loot filter file (a friend\'s, a download, any .filter) into your filter folder and use it here', onclick: () => importFilterFile(() => { FB.type = null; renderFilters(); }) }, 'Import a filter file'),
    h('span', { class: 'spacer' }),
    view?.types?.length && !p2 ? h('button', { class: 'primary sm', disabled: FB.applyingAll, title: 'Check poe.ninja for every priced category and move every item to the tier its price fits now', onclick: () => applyAllPrices() }, FB.applyingAll ? 'Applying…' : 'Apply all price changes') : null,
    edits ? h('span', { class: 'pill' }, `${edits} ${edits === 1 ? 'change' : 'changes'}`) : null,
    edits ? h('button', { class: 'quiet sm', onclick: async () => { if (confirm('Undo all tier moves and look changes?')) { await call('tiers:reset', { all: true }); toast('All changes undone'); renderFilters(); } } }, 'Undo all') : null);

  // FilterBlade's strictness, done here: each step hides another layer of low value items
  const strictBar = (() => {
    const st = view?.strictness;
    if (!st) return null;
    const own = st.own;
    const cur = st.level ?? own;
    const apply = async (lv) => {
      const level = lv === own ? null : lv; // your download's own level: nothing to change
      FB.strictPreview = null;
      await call('filter:strictness', level);
      toast(`Strictness: ${st.levels[lv]}. Select the filter in game again`);
      renderFilters();
    };
    // first a list of what would change; the strictness is switched from there
    const pick = async (lv) => {
      if (lv === cur) { FB.strictPreview = null; renderFilters(); return; }
      try { FB.strictPreview = await call('filter:strictnessPreview', lv === own ? null : lv); } catch (e) { toast(e.message); return; }
      FB.strictPreview.lv = lv;
      renderFilters();
    };
    const P = FB.strictPreview && FB.strictPreview.lv !== cur ? FB.strictPreview : null;
    const WORD = { Show: 'Shown', Hide: 'Hidden', Off: 'Off' };
    const previewBox = P ? (() => {
      const lessShown = P.changes.filter((c) => c.before === 'Show').length;
      const moreShown = P.changes.filter((c) => c.after === 'Show').length;
      const groups = new Map();
      for (const c of P.changes) { if (!groups.has(c.label)) groups.set(c.label, []); groups.get(c.label).push(c); }
      return h('div', { class: 'panel fb-strict-prev', role: 'region', 'aria-label': `What ${P.toName} changes` },
        h('div', { class: 'row', style: { gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' } },
          h('b', {}, `${P.fromName || 'Now'} → ${P.toName}`),
          h('span', { class: 'muted small' }, !P.changes.length ? 'nothing changes in your tiers'
            : [lessShown ? `− ${lessShown} ${lessShown === 1 ? 'tier' : 'tiers'} no longer shown` : '', moreShown ? `+ ${moreShown} ${moreShown === 1 ? 'tier' : 'tiers'} shown again` : ''].filter(Boolean).join(' · ')),
          h('span', { class: 'spacer' }),
          h('button', { class: 'primary sm', onclick: () => apply(P.lv) }, `Switch to ${P.toName}`),
          h('button', { class: 'quiet sm', onclick: () => { FB.strictPreview = null; renderFilters(); } }, 'Cancel')),
        P.changes.length ? h('div', { class: 'fb-sp-list' }, (() => {
          // one fold per category (closed: its counts and first items); campaign-only categories at the end
          const lvl = (l) => /levell?ing|first levels|act \d/i.test(l);
          const fold = ([label, list]) => {
            const gone = list.filter((c) => c.before === 'Show');
            const back = list.filter((c) => c.after === 'Show');
            const items = [...new Set(gone.flatMap((c) => (c.catchAll ? [] : c.bases)))];
            return h('details', { class: 'fb-sp-group' },
              h('summary', {},
                h('span', { class: 'fb-sp-cat' }, label),
                gone.length ? h('span', { class: 'fb-sp-count gone' }, `− ${gone.length}`) : null,
                back.length ? h('span', { class: 'fb-sp-count back' }, `+ ${back.length}`) : null,
                h('span', { class: 'small muted fb-sp-items' }, items.length ? `${items.slice(0, 5).join(', ')}${items.length > 5 ? ` +${items.length - 5} more` : ''}` : gone.some((c) => c.catchAll) ? 'everything else in this category' : '')),
              list.map((c) => {
                const g = c.before === 'Show';
                return h('div', { class: `fb-sp-row ${g ? 'gone' : 'back'}` },
                  h('span', { class: 'fb-sp-sign', 'aria-hidden': 'true' }, g ? '−' : '+'),
                  h('span', { class: 'fb-sp-name' }, tierName(c)),
                  h('span', { class: 'fb-sp-move' }, `${WORD[c.before] || c.before} → ${WORD[c.after] || c.after}`),
                  h('span', { class: 'small muted fb-sp-items', title: c.bases.join(', ') }, c.catchAll ? 'everything else in this category' : `${c.bases.slice(0, 6).join(', ')}${c.count > 6 ? ` +${c.count - 6} more` : ''}`));
              }));
          };
          const all = [...groups];
          const main = all.filter(([l]) => !lvl(l));
          const camp = all.filter(([l]) => lvl(l));
          return [...main.map(fold), camp.length ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'Only while levelling (campaign):') : null, ...camp.map(fold)];
        })()) : null);
    })() : null;
    return h('div', { class: 'fb-strict' },
      h('div', { class: 'row', role: 'group', 'aria-label': 'Strictness', style: { gap: '4px', flexWrap: 'wrap' } },
        h('span', { class: 'muted', style: { marginRight: '6px' } }, 'Strictness'),
        st.levels.map((name, i) => h('button', { class: i === cur ? 'primary sm' : 'sm', 'aria-pressed': i === cur ? 'true' : 'false', title: st.notes[i], onclick: () => pick(i) }, `${i === cur ? '● ' : ''}${name}${i === own ? ' (FilterBlade)' : ''}`))),
      h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, cur != null ? `${st.levels[cur]}: ${st.notes[cur]} ` : '', 'Each step hides more low value items. Pick one to see what changes first. Your own tier changes stay on top.'),
      previewBox);
  })();

  const tabs = p2 ? null : h('div', { class: 'fb-tabs', role: 'tablist' }, [['tiers', 'Tiers'], ['review', 'Price review'], ['check', 'Check an item']].map(([id, label]) =>
    h('button', { role: 'tab', 'aria-selected': FB.tab === id ? 'true' : 'false', class: FB.tab === id ? 'active' : '', onclick: () => { FB.tab = id; renderFilters(); } }, label)),
    h('span', { class: 'spacer' }),
    view?.types?.length ? h('button', { class: 'primary sm fb-update-btn', title: 'Compare every tier with poe.ninja, see what would move, and move it', onclick: openPriceUpdate }, window.UI.icon('refresh', { size: 15 }), 'Update prices') : null);

  const body = h('div', { class: 'fb-body' });
  const movedBox = h('div');
  if (FB.tab === 'tiers') fillMoved(movedBox);
  // tier moves for items the game doesn't have any more (last league's scarabs…): offered for removal, never removed on their own
  const staleBox = h('div');
  if (!p2) call('tiers:stale').then((list) => {
    if (!list?.length) return;
    const names = list.map((m) => m.name);
    mount(staleBox, h('div', { class: 'panel fb-stale', role: 'status' },
      h('div', {}, h('b', {}, list.length === 1 ? '1 item in your tier changes isn\'t in the game any more' : `${list.length} items in your tier changes aren't in the game any more`),
        h('div', { class: 'small muted' }, `Neither your FilterBlade filter nor this league's poe.ninja prices know them, so ${list.length === 1 ? 'it\'s' : 'they\'re'} left out of every write (usually from an old league): ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}.`)),
      h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'sm', title: names.join('\n'), onclick: async () => { const r = await call('tiers:dropStale'); toast(`Removed ${r.removed} old item${r.removed === 1 ? '' : 's'} from your tier changes.`); renderFilters(); } }, list.length === 1 ? 'Remove it' : 'Remove them'),
        h('button', { class: 'quiet sm', onclick: () => staleBox.replaceChildren() }, 'Not now'))));
  }).catch(() => {});
  // a FilterBlade filter older than NeverSink's newest release: point to FilterBlade (shown until you update or hide it)
  const ageBox = h('div');
  if (!p2) call('filter:age').then((a) => {
    if (!a?.old || localStorage.getItem('fbAgeHidden') === `${info.base}|${a.version}|${a.latest || ''}`) return;
    mount(ageBox, h('div', { class: 'panel fb-stale', role: 'status' },
      h('div', {}, h('b', {}, `Your FilterBlade filter is from ${a.month || 'an old version'}: update it on FilterBlade`),
        h('div', { class: 'small muted' }, a.latest ? `You have NeverSink ${a.version}; ${a.latest} is out, with this league's new items and prices. Sync or download it on FilterBlade; your tiers and looks here stay.` : `It's NeverSink ${a.version}, ${a.days} days old. New items from this league may be missing. Your tiers and looks here stay when you update.`)),
      h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'sm', onclick: () => window.open('https://www.filterblade.xyz/?game=Poe1') }, 'Open FilterBlade'),
        h('button', { class: 'quiet sm', onclick: () => { try { localStorage.setItem('fbAgeHidden', `${info.base}|${a.version}|${a.latest || ''}`); } catch { /* */ } ageBox.replaceChildren(); } }, 'Not now'))));
  }).catch(() => {});
  const show = () => { mount(el, pageHead(p2 ? 'Loot filter (PoE2)' : 'Loot filter', p2 ? 'Your Path of Exile 2 filter (NeverSink\'s or FilterBlade\'s), with your own tiers and looks on top. The original file is never changed.' : 'Your FilterBlade filter, with your own tiers and looks on top. The original file is never changed.', themeMenu(themes, !!view?.types?.length)), fileBar, strictBar, tabs, ageBox, staleBox, movedBox, body); if (FB.reviewModal) el.append(priceUpdateModal()); };
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
  // "Show in app": the subcategory that holds the item's tier
  if (FB.goto) {
    const t = view.types.find((x) => x.type === FB.goto.type && x.tiers.some((y) => y.key === FB.goto.key)) || view.types.find((x) => x.tiers.some((y) => y.key === FB.goto.key)) || view.types.find((x) => x.type === FB.goto.type);
    if (t) { FB.type = t.key; FB.selected = new Set([FB.goto.base]); FB.collapsed.delete(FB.goto.key); FB.closedGroups?.delete(categoryOf(t.key)?.id); }
  }
  if (FB.type === MY_BASES) return renderMyBases(body, view);
  if (FB.type === BASE_MATRIX) return renderBaseMatrix(body, view);
  if (FB.type === CLUSTER_GRID) return renderClusterGrid(body, view);
  if (FB.type === CAMPAIGN_HIDE) return renderCampaignHide(body, view);
  if (FB.type === RARE_LOOKS) return renderRareLooks(body, view);
  if (FB.type === TALISMANS) return renderTalismans(body, view);
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
  let pricing = FB.prices[type.type] || (type.scrollsView ? {} : null);
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
  // stacked currency (Big stacks, Small stacks…): every tier is a "StackSize >= N" rule, so a base can move
  // between them like in any tier list (each tier keeps its own stack size: an edited filter has 5, 4, 3, 2);
  // other special tiers (a card only in stacks…) keep their bases
  const sameRules = (() => {
    const bl = (type.allTiers || type.tiers).filter((x) => x.hasBaseList && !x.generated);
    return bl.length > 1 && bl.every((x) => x.stackSize) && new Set(bl.map((x) => (x.conditions || []).filter((c) => !/^StackSize\b/i.test(String(c).trim())).join('\n'))).size === 1;
  })();
  const movableTier = (t) => t.hasBaseList && !t.generated && (!t.special || sameRules);
  const targets = (type.allTiers || type.tiers).filter(movableTier);

  const moveTo = async (bases, to, force = false) => {
    if (!bases.length) return;
    const r = await call('tiers:move', { type: type.type, bases, to, force });
    if (r?.leftOut?.some((n) => bases.includes(n))) toast(`Left out of the filter: ${bases.join(', ')}. The game doesn't know that name, and one unknown name stops the whole filter from loading.`);
    FB.selected.clear();
    delete FB.prices[type.type];
    if (FB.unlisted) delete FB.unlisted[type.type];
    toast(to === HIDE ? `Hidden: ${bases.join(', ')}` : `Moved to ${tierName({ tier: to })}: ${bases.join(', ')}`);
    renderFilters();
  };

  // the poe.ninja list a category's pictures are in (gear and unique bases: the base list)
  const picHint = (() => {
    const t = type.type;
    if (/^currency/.test(t)) return 'Currency';
    if (/^divination/.test(t)) return 'DivinationCard';
    if (/scarab/.test(t)) return 'Scarab';
    if (/^fragments/.test(t)) return 'Fragment';
    if (/essence/.test(t)) return 'Essence';
    if (/^(uniques|gear|rr|rare|exotic|crafting|influenced|jewels|flasks|chancing|exoticbases|6l|socketslinks)/.test(t)) return 'BaseType';
    return '';
  })();
  // the catch-all tier ("…land here"): the items that land in it now, which you can drag into a real tier
  function restBox(t) {
    const list = FB.unlisted?.[type.type];
    if (list === undefined) {
      FB.unlisted = FB.unlisted || {};
      FB.unlisted[type.type] = null;
      call('tiers:unlisted', type.type).then((r) => { FB.unlisted[type.type] = r || []; drawList(); }).catch(() => { FB.unlisted[type.type] = []; });
    }
    const note = h('div', { class: 'small faint' }, 'Items not listed in another tier land here. Bases can\'t be moved into it.');
    if (!list || !list.length) return h('div', { class: 'fb-chips' }, note);
    return h('div', { class: 'fb-rest' }, note,
      h('div', { class: 'small', style: { margin: '6px 0 4px' } }, h('b', {}, list.length === 1 ? '1 item lands here now' : `${list.length} items land here now`), h('span', { class: 'faint' }, type.type === 'uniques' ? ': uniques whose base is in none of your unique tiers (often new bases). Click a base, then pick a tier in the bar below.' : ': not in any tier of your filter (new items, or ones FilterBlade doesn\'t list). Drag one into a tier to give it that look.')),
      h('div', { class: 'fb-chips' }, list.map((u) => h('button', {
        type: 'button', class: 'fb-chip fb-new' + (u.known && FB.selected.has(u.name) ? ' selected' : ''), draggable: 'true',
        'aria-pressed': u.known ? (FB.selected.has(u.name) ? 'true' : 'false') : null,
        // a base the game knows (uniques): click to select, then "Move to" in the bar below, like the other chips
        onclick: u.known ? () => { if (FB.selected.has(u.name)) FB.selected.delete(u.name); else FB.selected.add(u.name); drawList(); } : null,
        title: `${u.label || u.name}${u.chaos != null ? `: ${fmtC(u.chaos)} on poe.ninja` : u.fresh ? ': new, poe.ninja has no price yet' : ''}. Drag it into a tier.${u.known ? '' : ' It\'s added to your filter as written here.'}`,
        ondragstart: (e) => { e.dataTransfer.setData('text/x-poe-bases', JSON.stringify([u.name])); if (!u.known) e.dataTransfer.setData('text/x-poe-new', '1'); e.dataTransfer.effectAllowed = 'move'; },
      }, window.UI.itemPic(u.name, { size: 20, hint: picHint }), u.label || u.name,
        u.chaos != null ? h('span', { class: 'fb-price' }, fmtC(u.chaos)) : u.fresh ? h('span', { class: 'fb-newtag' }, 'new') : null))));
  }
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
    const keptSet = new Set((FB.alwaysShow || {})[type.type] || []);
    const el = h('button', {
      type: 'button',
      class: 'fb-chip' + (selected ? ' selected' : '') + (tier.action === 'Hide' ? ' hidden' : '') + (fitInfo ? ` fit-${fitInfo.level}` : '') + (price?.big ? ' spiked' : ''),
      draggable: 'true',
      title: fitInfo && price ? `${base}: ${fmtC(price.chaos)} now. ${({ good: 'Fits', warn: 'A bit off for', bad: 'Doesn\'t fit', none: 'No price band for' })[fitInfo.level]} ${tierName(tier)}${pricing?.tiers?.[tier.key]?.median != null ? ` (typically ${fmtC(pricing.tiers[tier.key].median)})` : ''}.${sugg ? ` Fits ${tierName({ tier: sugg.to })} better.` : ''}` : from !== undefined ? `You moved this here${from ? ` from ${tierName({ tier: from })}` : ''}. Click to select, drag to move.` : 'Click to select, drag to another tier to move',
      // plain tag, not an item lookalike: the tier header already shows the look
      ...(keptSet.has(base) ? { 'data-kept': '1' } : {}),
      onclick: () => { selected ? FB.selected.delete(base) : FB.selected.add(base); drawList(); },
      ondragstart: (e) => {
        const bases = FB.selected.has(base) ? [...FB.selected] : [base];
        e.dataTransfer.setData('text/x-poe-bases', JSON.stringify(bases));
        e.dataTransfer.effectAllowed = 'move';
      },
    }, window.UI.itemPic(base, { size: 20, hint: picHint }), base,
      price && FB.priceColors ? (() => {
        // uniques: the range of its versions; prices from fewer than 5 listings don't count for the top
        const top = price.maxSure ?? price.max;
        const vers = (price.versions || []).map((v) => `${v.name}${v.variant ? ` (${v.variant})` : ''}: ${fmtC(v.chaos)}${v.listings != null && v.listings < 5 ? ` (only ${v.listings} listed)` : ''}`);
        const title = vers.length ? `Uniques on this base, most valuable first:\n${vers.join('\n')}` : price.max && price.max > price.chaos ? `Uniques on this base: ${fmtC(price.chaos)} to ${fmtC(price.max)}` : 'Current poe.ninja price';
        return h('span', { class: 'fb-price', title }, top && top > price.chaos * 2 ? `${fmtC(price.chaos)}–${fmtC(top)}` : fmtC(price.chaos));
      })() : null,
      FB.priceColors && price?.big ? h('span', { class: `fb-spike ${price.trend.change > 0 ? 'up' : 'down'}`, title: `${window.Farm.pct(price.trend.change)} this week: ${fmtC(price.trend.old)} → ${fmtC(price.chaos)}. See "Big price changes" above for its graph.` }, window.Farm.pct(price.trend.change)) : null,
      sugg && FB.priceColors ? h('span', { class: `fb-sugg ${sugg.direction}`, title: `Worth ${fmtC(sugg.chaos)} now. Typical for ${tierName({ tier: sugg.to })} (${fmtC(sugg.typicalTo)}), not ${tierName({ tier: sugg.from })} (${fmtC(sugg.typicalFrom)}).` }, sugg.direction === 'up' ? '▲' : '▼') : null,
      from !== undefined ? h('span', { class: 'fb-moved', 'aria-label': 'moved by you' }) : null,
      keptSet.has(base) ? h('span', { class: 'fb-kept', title: 'Always show: it moves with its price, but never into a hidden tier', 'aria-label': 'always shown' }, '◉') : null);
    if (tier.tier === HIDDEN_TIER || from !== undefined) {
      return h('span', { class: 'fb-chip-wrap' }, el, h('button', { class: 'fb-undo', title: 'Put it back where the filter had it', 'aria-label': `Undo move of ${base}`, onclick: async () => { await call('tiers:reset', { type: type.type, base }); renderFilters(); } }, '×'));
    }
    return el;
  }

  // ---- a tier's own conditions, FilterBlade style: item level / area level / quality sliders,
  // rarity, and the bases as boxes you can untick ----
  const COND_LABEL = { GemLevel: 'Gem level', ItemLevel: 'Item level', AreaLevel: 'Area level', Quality: 'Quality' };
  const COND_MAX = { GemLevel: 21, ItemLevel: 86, AreaLevel: 86, Quality: 30 };
  // the bases as tick boxes: for class-wide tiers and short lists; long lists (economy-built gem
  // lists) stay chips
  const checkBases = (t) => !!(t.implied || (t.special && t.bases.length + ((S.settings.tierPatch?.conditions || {})[t.key]?.exclude || []).length <= 40));
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
        setCond(k, { op: o, value: Number(box.value) || (k === 'Quality' ? 20 : k === 'GemLevel' ? 20 : 68) });
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
    const baseBox = checkBases(t) && all.length ? h('div', { class: 'fb-checks' }, all.map((b) => {
      const on = !excluded.has(b);
      return h('button', { type: 'button', class: 'fb-check' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', title: on ? `Switch ${b} off for this tier` : `Switch ${b} back on`, onclick: () => {
        const next = new Set(excluded);
        if (on) next.add(b); else next.delete(b);
        if (next.size >= all.length) return toast('Keep at least one base in the tier.', true);
        setCond('exclude', next.size ? [...next] : null);
      } }, (on ? '☑ ' : '☐ ') + b);
    })) : null;
    // gem level only where the tier uses it; the others always (any = not used)
    // what matters for this kind of item: gems by gem level, everything else by item level; area level
    // and quality only where the tier uses them (quality also for flasks, tinctures and gems)
    const qualityKind = /flask|tincture|^gems/.test(t.type);
    // jewels: item level only; area level only on campaign tiers (endgame ones are all 68+)
    const jewel = /^jewels/.test(t.type);
    const rows = [...(t.numbers?.GemLevel ? ['GemLevel'] : []), ...(/^gems/.test(t.type) ? [] : ['ItemLevel']), ...(t.numbers?.AreaLevel && t.campaign && !jewel ? ['AreaLevel'] : []), ...((t.numbers?.Quality || qualityKind) && !jewel ? ['Quality'] : [])];
    return h('div', { class: 'fb-conds' }, baseBox, rows.map(numberRow), rarRow);
  }

  // Regular maps: what the Hide white / yellow / below Tier 16 buttons do to this tier
  function mapHidePill(t) {
    const no = type.type === 'maps' ? mapTierNo(t) : 0;
    if (!no) return null;
    const mh = S.settings.mapHide || {};
    const tip = 'Set with the buttons at the top. Blighted and unique maps still show.';
    if (mh.below16 && no < 16) return h('span', { class: 'pill warn', style: { marginLeft: '8px' }, title: tip }, '✕ Hidden (below Tier 16)');
    if (mh.white && no <= 5) return h('span', { class: 'pill warn', style: { marginLeft: '8px' }, title: tip }, '✕ Hidden (white map)');
    if (mh.yellow && no >= 6 && no <= 10) return h('span', { class: 'pill warn', style: { marginLeft: '8px' }, title: tip }, '✕ Hidden (yellow map)');
    return null;
  }
  function tierCard(t) {
    const isEditing = FB.editing === t.key;
    const q = FB.search.trim().toLowerCase();
    const bases = q ? t.bases.filter((b) => b.toLowerCase().includes(q)) : t.bases;
    if (q && !bases.length) return null;
    // the label shows the tier's most valuable item (by today's poe.ninja price), else its first one
    const priced = (list) => list.filter((b) => Number.isFinite(pricing?.prices?.[b]?.chaos)).sort((a, b) => (pricing.prices[b].max ?? pricing.prices[b].chaos) - (pricing.prices[a].max ?? pricing.prices[a].chaos));
    // a gem tier without a list shows a gem, like FilterBlade (Blight)
    const sample = priced(bases)[0] || bases[0] || priced(t.bases)[0] || t.bases[0] || t.implied?.[0] || (/^gems/.test(type.type) ? 'Blight' : type.label);
    const preview = h('div', { class: 'fb-preview' });
    const drawPreview = () => {
      const st = isEditing ? FB.draft : t.style;
      // shrink long names so the whole name fits (the game shows the full name too)
      const size = window.UI.normalizeStyle(st).fontSize || 32;
      // one zoom per name, worked out for the biggest text (45), so a smaller text size really looks smaller
      const scale = Math.max(0.55, Math.min(1, 500 / (sample.length * 45 * 0.6 * 0.6 + 40)));
      mount(preview, dropLabel(sample, st, { rarity: rarityFor(type.type), scale, game: true, hidden: (t.action === 'Hide' && !t.allCurrency) || (type.type === 'maps' && mapTierNo(t) > 0 && ((S.settings.mapHide?.below16 && mapTierNo(t) < 16) || (S.settings.mapHide?.white && mapTierNo(t) <= 5) || (S.settings.mapHide?.yellow && mapTierNo(t) >= 6 && mapTierNo(t) <= 10))) }), soundButton(window.UI.normalizeStyle(st).sound));
    };
    drawPreview();
    const folded = FB.collapsed.has(t.key);
    const fold = h('button', { class: 'fb-fold', 'aria-expanded': folded ? 'false' : 'true', 'aria-label': folded ? `Show the items of ${tierName(t)}` : `Fold ${tierName(t)}`, title: folded ? 'Show the items' : 'Fold this tier', onclick: () => { folded ? FB.collapsed.delete(t.key) : FB.collapsed.add(t.key); drawList(); } }, folded ? '▸' : '▾');
    const changedAction = view.editedActions && view.editedActions[t.key];
    const state = t.state || (t.off ? 'Off' : t.action);
    const hidden = state === 'Hide' || state === 'Off';
    // a hidden tier whose items still show when stacked (a stack tier comes first in the filter)
    const stackLeaks = (() => {
      if (!hidden || t.stackSize || !t.hasBaseList) return [];
      const seen = new Map();
      for (const b of t.bases || []) for (const e of FB.stackIdx?.get(b) || []) {
        const st2 = e.t.state || (e.t.off ? 'Off' : e.t.action);
        // campaign-only stack tiers don't matter in maps
        if (st2 === 'Show' && e.t.key !== t.key && !/leveling/.test(e.type) && !seen.has(e.t.key)) seen.set(e.t.key, e);
      }
      return [...seen.values()].sort((a, b) => (a.t.stackSize.value || 0) - (b.t.stackSize.value || 0));
    })();
    const stackNote = stackLeaks.length ? h('div', { class: 'fb-stack-leak small' },
      h('span', { 'aria-hidden': 'true' }, '⚠ '),
      `Stacks still show: ${stackLeaks.map((e) => `${e.t.stackSize.value}+ (${e.label}, ${tierName(e.t)})`).join(', ')}. `,
      h('button', { class: 'quiet sm', onclick: async () => {
        const others = [...new Set(stackLeaks.flatMap((e) => e.t.bases).filter((b) => !(t.bases || []).includes(b)))];
        if (others.length && !confirm(`These stack tiers also hold ${others.slice(0, 6).join(', ')}${others.length > 6 ? ` and ${others.length - 6} more` : ''}. Hide their stacks too?`)) return;
        for (const e of stackLeaks) await call('tiers:action', { key: e.t.key, action: 'Hide' });
        toast(`Stacks hidden too: ${stackLeaks.map((e) => `${e.t.stackSize.value}+`).join(', ')}`);
        FB.prices = {}; renderFilters();
      } }, 'Hide the stacks too')) : null;
    const setAction = async (want) => {
      if (want === state) return;
      await call('tiers:action', { key: t.key, action: want });
      toast(want === 'Hide' ? `${tierName(t)} is now hidden in game` : want === 'Off' ? `${tierName(t)} is switched off: the game skips it` : `${tierName(t)} is now shown in game`);
      delete FB.prices[type.type];
      renderFilters();
    };
    const visSwitch = t.generated || /^gear->(tiered|memorystrand)$/.test(type.type) ? null : h('div', { class: 'fb-vis', role: 'group', 'aria-label': `${tierName(t)} in game` },
      [['Show', 'Shown', 'Items in this tier show with this look'], ['Hide', 'Hidden', 'Items in this tier are hidden'], ['Off', 'Off', 'Switched off, like FilterBlade\'s strictness does: the game skips this tier and the items fall through to the rules below it']]
        // Off only where the filter switched the tier off (or it is off now): elsewhere Shown and Hidden are all you need
        .filter(([v]) => v !== 'Off' || state === 'Off' || t.origState === 'Off').map(([v, label, tip]) =>
        h('button', { class: state === v ? `on${v === 'Hide' ? ' hide' : v === 'Off' ? ' off' : ''}` : '', title: tip, 'aria-pressed': state === v ? 'true' : 'false', onclick: () => setAction(v) }, label)));
    const head = h('div', { class: 'fb-tier-head ground' },
      fold,
      preview,
      h('div', { class: 'fb-tier-meta' },
        h('div', { class: 'fb-tier-name' }, tierName(t),
          t.mine ? h('span', { class: 'pill', style: { marginLeft: '8px' } }, 'Your tier') : null,
          t.allCurrency ? h('span', { class: 'pill', style: { marginLeft: '8px' }, title: 'Your filter hides this tier, but "Show all currency" (Loot filter → Currency) shows it. Press Hidden to keep it hidden anyway.' }, 'Shown by "Show all currency"') : null,
          t.mine ? h('button', { class: 'quiet sm', title: 'Rename this tier', 'aria-label': `Rename ${tierName(t)}`, onclick: async () => { const n = prompt('Name of this tier', tierName(t)); if (n && n.trim()) { await call('tiers:rename', { type: type.type, tier: t.tier, name: n }); renderFilters(); } } }, '✎') : null,
          t.mine ? h('button', { class: 'quiet sm', title: 'Delete this tier; its items go back to where the filter had them', 'aria-label': `Delete ${tierName(t)}`, onclick: async () => { if (!confirm(`Delete ${tierName(t)}? Its items go back to where your filter had them.`)) return; await call('tiers:remove', { type: type.type, tier: t.tier }); delete FB.prices[type.type]; toast(`${tierName(t)} deleted`); renderFilters(); } }, 'Delete') : null, changedAction ? h('span', { class: 'pill warn', style: { marginLeft: '8px' } }, changedAction === 'Hide' ? 'Hidden by you' : changedAction === 'Off' ? 'Off by you' : t.origState === 'Off' ? 'Switched on by you' : 'Shown by you') : !changedAction && state === 'Off' ? h('span', { class: 'pill', style: { marginLeft: '8px' }, title: 'FilterBlade switched this tier off for your strictness. Press Shown to use it.' }, 'Off in FilterBlade') : null, edited.has(t.key) ? h('span', { class: 'pill warn', style: { marginLeft: '8px' } }, 'Your look') : null, mapHidePill(t)),
        h('div', { class: 'small', style: { color: '#9a9f8c' } }, t.hasBaseList ? `${t.bases.length} ${t.bases.length === 1 ? 'base' : 'bases'}` : t.special ? 'Special case' : 'Catches the rest of this category',
          (() => {
            // the price you set for this tier (Set category prices) wins over the typical price
            const set = S.settings.priceReview?.categories?.[type.type]?.thresholds?.[t.tier];
            if (set != null && set !== '') return `, ${typeof set === 'number' ? `${set}c` : String(set).replace(/\s*div$/i, 'd').replace(/\s*c$/i, 'c')}+`;
            return pricing?.tiers?.[t.key]?.median != null ? `, typically ${fmtC(pricing.tiers[t.key].median)}` : '';
          })()),
        stackNote,
        t.stackSize ? stackBox(t) : t.special ? h('div', { class: 'small', style: { color: '#7d8272' }, title: t.conditions.join('\n') }, `Only when: ${t.conditions.filter((c) => !/^(Class|Rarity|ItemLevel|AreaLevel|Quality|GemLevel)\b/.test(c)).join(', ') || 'the conditions below'}`) : null),
      h('span', { class: 'spacer' }),
      visSwitch,
      t.generated || isEditing ? null : h('div', { class: 'fb-lookclip', role: 'group', 'aria-label': `Copy or paste the look of ${tierName(t)}` },
        h('button', { class: 'quiet sm', title: `Copy the look of ${tierName(t)}`, onclick: () => { copyLook(t.style, `${type.label}, ${tierName(t)}`); drawList(); } }, 'Copy look'),
        copiedLook() ? h('button', { class: 'quiet sm', title: `Give ${tierName(t)} the look of ${copiedLook().from}`, onclick: () => pasteLook(t) }, 'Paste look') : null),
      t.generated ? null : h('button', { class: isEditing ? 'primary sm' : 'sm', onclick: () => { if (isEditing) { FB.editing = null; } else { FB.editing = t.key; FB.draft = structuredClone(t.style || {}); } drawList(); } }, isEditing ? 'Close' : 'Edit look'));
    // unidentified item tiers and Memory Strand gear: Base ranks decides the bases and what shows; here only the look
    const lookOnly = /^gear->(tiered|memorystrand)$/.test(type.type);
    const canAdd = !lookOnly && (movableTier(t) || t.generated);
    const conds = !folded && !lookOnly && hasCondEditor(t);
    const card = h('div', { class: 'fb-tier' + (t.generated ? ' generated' : '') + (hidden ? ' is-hidden' : '') + (state === 'Off' ? ' is-off' : ''), 'data-key': t.key }, head,
      conds ? condEditor(t) : null,
      lookOnly && !folded ? h('div', { class: 'fb-chips small faint' }, 'Which bases and tiers show is set on Base ranks (Unid item tier, Memory Strands). Here you change the look. ',
        h('button', { class: 'quiet sm', onclick: () => { window.showInFilter({ special: 'basematrix' }); renderFilters(); } }, 'Open Base ranks')) :
      folded || (conds && checkBases(t)) ? null : t.hasBaseList ? h('div', { class: 'fb-chips' }, bases.map((b) => chip(b, t)), !bases.length ? h('span', { class: 'small faint' }, t.stackSize ? 'Empty: your filter has no cards here right now. (Items can\'t be moved in: they would leave their own tier.)' : canAdd ? 'Empty. Drag bases here or add one below.' : 'Empty.') : null) : (/rest/i.test(t.tier) ? restBox(t) : h('div', { class: 'fb-chips small faint' }, 'Items not listed in another tier land here. Bases can\'t be moved into it.')),
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
    if (movableTier(t) || t.generated) {
      const to = t.generated ? HIDE : t.tier;
      card.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-poe-bases')) { e.preventDefault(); card.classList.add('drop-target'); } });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('drop-target'); try { moveTo(JSON.parse(e.dataTransfer.getData('text/x-poe-bases')), to, e.dataTransfer.types.includes('text/x-poe-new')); } catch { /* ignore */ } });
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
    z.addEventListener('drop', (e) => { e.preventDefault(); try { moveTo(JSON.parse(e.dataTransfer.getData('text/x-poe-bases')), HIDE, e.dataTransfer.types.includes('text/x-poe-new')); } catch { /* ignore */ } });
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
    // Unique items: one button per row of the page (no list of FilterBlade's extra tiers)
    if (type.type === 'uniques') {
      const has = new Set(targets.map((t) => t.tier));
      const own = targets.filter((t) => /^poehelper-/.test(t.tier)).map((t) => [t.tier, tierName(t)]);
      const rows = [...own, ...UQ_ROWS.flatMap(([, r]) => r.map(([name, ids]) => [ids.find((id) => has.has(id)), name]))].filter(([id]) => id);
      return mount(bar, h('div', { class: 'fb-selbar-in' },
        h('b', {}, `${FB.selected.size} selected`),
        h('span', { class: 'muted small', style: { maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [...FB.selected].join(', ')),
        h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, 'Move to'),
        rows.map(([id, name]) => h('button', { class: 'sm', onclick: () => moveTo([...FB.selected], id) }, name.replace(/ tier$/, ''))),
        h('button', { class: 'sm', title: 'Always show: these keep moving with their price, but never into a hidden tier (the lowest shown tier at most). Hidden ones move to the lowest shown tier now.', onclick: async () => {
        const kept = new Set((FB.alwaysShow || {})[type.type] || []);
        const on = ![...FB.selected].every((b) => kept.has(b));
        await call('tiers:alwaysShow', { type: type.type, bases: [...FB.selected], on });
        toast(on ? `Always shown: ${FB.selected.size} item${FB.selected.size === 1 ? '' : 's'}` : 'Back to normal: prices may hide them again');
        FB.selected.clear(); renderFilters();
      } }, [...FB.selected].every((b) => ((FB.alwaysShow || {})[type.type] || []).includes(b)) ? '◉ Not always shown' : '◉ Always show'),
      h('button', { class: 'quiet', onclick: () => { FB.selected.clear(); drawList(); } }, 'Clear')));
    }
    const sel = h('select', { 'aria-label': 'Move to tier' }, targets.map((t) => h('option', { value: t.tier }, `${tierName(t)}${t.action === 'Hide' ? ' (hidden)' : ''}`)));
    mount(bar, h('div', { class: 'fb-selbar-in' },
      h('b', {}, `${FB.selected.size} selected`),
      h('span', { class: 'muted small', style: { maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [...FB.selected].join(', ')),
      h('span', { class: 'spacer' }),
      targets.length ? h('span', { class: 'small muted' }, 'Move to') : h('span', { class: 'small muted' }, 'This category only has special tiers, so bases can only be hidden'),
      targets.length ? sel : null,
      targets.length ? h('button', { class: 'primary', onclick: () => moveTo([...FB.selected], sel.value) }, 'Move') : null,
      // uniques: one click to the main tiers
      /^uniques$/.test(type.type) ? h('span', { class: 'row', style: { gap: '4px' } }, [['t1', 'S'], ['t2', 'A'], ['multispecialhigh', 'High variety'], ['t3', 'B+C'], ['hideable', 'D (hidden)']]
        .filter(([tr]) => targets.some((t) => t.tier === tr)).map(([tr, l]) => h('button', { class: 'sm', title: `Move to ${tierName(targets.find((t) => t.tier === tr))}`, onclick: () => moveTo([...FB.selected], tr) }, l))) : null,
      h('button', { onclick: () => moveTo([...FB.selected], HIDE) }, 'Hide'),
      h('button', { class: 'sm', title: 'Always show: these keep moving with their price, but never into a hidden tier (the lowest shown tier at most). Hidden ones move to the lowest shown tier now.', onclick: async () => {
        const kept = new Set((FB.alwaysShow || {})[type.type] || []);
        const on = ![...FB.selected].every((b) => kept.has(b));
        await call('tiers:alwaysShow', { type: type.type, bases: [...FB.selected], on });
        toast(on ? `Always shown: ${FB.selected.size} item${FB.selected.size === 1 ? '' : 's'}` : 'Back to normal: prices may hide them again');
        FB.selected.clear(); renderFilters();
      } }, [...FB.selected].every((b) => ((FB.alwaysShow || {})[type.type] || []).includes(b)) ? '◉ Not always shown' : '◉ Always show'),
      h('button', { class: 'quiet', onclick: () => { FB.selected.clear(); drawList(); } }, 'Clear')));
  }

  function addRow() {
    if (type.scrollsView) return null;
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
    // prices only show when you ask for them (Check prices / Review suggestions): the tiers stay clean otherwise
    if (!FB.priceColors && !FB.showSuggestions) return null;
    // a view of some items (Threads): only their prices and suggestions
    if (pricing && !pricing.error && type.baseView) {
      const inView = new Set(type.baseView);
      pricing = { ...pricing, suggestions: (pricing.suggestions || []).filter((x) => inView.has(x.base)), prices: Object.fromEntries(Object.entries(pricing.prices || {}).filter(([n]) => inView.has(n))) };
    }
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
    // the week's big price changes aren't listed here: the tiers follow prices anyway (Price review, auto-tier)
    const bigBox = false && big.length ? h('div', { class: 'fb-pricebar fb-bigchanges' },
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
    if (type.baseView) return null; // a view of some items: new tiers belong to the whole category
    const movable = type.tiers.filter(movableTier);
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
  // FilterBlade's sections for gems (shown grouped; the filter still checks them in its own order)
  const GEM_SECTIONS = {
    'gems->generic': [['Gems with gem levels', /^lt\d/], ['Gems with quality', /^qt/], ['+1 gems', /^plusonegem/], ['Gems during the campaign', /^(firstzone|leveling|levelingvaal)$/], ['Other gems', /./]],
    'gems->special': [['Top gems, high level and quality', /^(2023|2120|2123any|21xx|xx23|2020z|xx20z|vaal20)$/], ['Transfigured and special cases', /./]],
    'gems->exceptional': [['Exceptional gems tier list', /^t[1-4]$/], ['Transfigured and special cases', /./]],
  };
  function sectionGroups(cards) {
    const secs = GEM_SECTIONS[type.type];
    if (!secs) return null;
    const groups = secs.map(([title]) => ({ title, list: [] }));
    type.tiers.forEach((t, i) => {
      if (!cards[i]) return;
      const at = secs.findIndex(([, re]) => re.test(t.tier));
      groups[at < 0 ? groups.length - 1 : at].list.push(cards[i]);
    });
    return groups.filter((g) => g.list.length).map((g) => h('div', { class: 'fb-lettergroup' }, h('div', { class: 'fb-letter' }, h('b', {}, g.title)), g.list));
  }
  function letterGroups(cards) {
    const secs = sectionGroups(cards);
    if (secs) return secs;
    if (!/^uniques/.test(type.type)) return cards;
    // by value: your tiers, S, A, High variety, B+C, D; FilterBlade's special cases folded away at the bottom
    const ORDER = ['Yours', 'S', 'A', 'High variety', 'B+C', 'D'];
    const groups = new Map(ORDER.map((l) => [l, []]));
    const rest = [];
    type.tiers.forEach((t, i) => {
      if (!cards[i]) return;
      if (/^poehelper-/.test(t.tier) && !t.generated) return groups.get('Yours').push([t, cards[i]]);
      const u = uniqueTier(t);
      (u ? groups.get(u[0]) : rest).push([t, cards[i]]);
    });
    const out = [];
    const anchor = (l) => `fb-uq-${l.replace(/[^a-z]/gi, '')}`;
    const present = [...groups].filter(([, list]) => list.length).map(([l]) => l);
    // jump links: the page is long
    out.push(h('div', { class: 'fb-uq-jump row small' }, h('span', { class: 'muted' }, 'Jump to'),
      [...present, ...(rest.length ? ['Special cases'] : [])].map((l) => h('button', { class: 'quiet sm', onclick: () => {
        if (l === 'Special cases' && !FB.uqSpecialOpen) { FB.uqSpecialOpen = true; drawList(); }
        setTimeout(() => document.getElementById(anchor(l))?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
      } }, l === 'Yours' ? 'Your tiers' : l))));
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
      // like FilterBlade: one tier per letter in view (S, A, High variety, B+C, D); FilterBlade's extra tiers of
      // the same letter (A - jewels, D - early league, boss drops…) fold under it
      const MAIN = { S: 't1', A: 't2', 'High variety': 'multispecialhigh', 'B+C': 't3', D: 'hideable' };
      const mainOne = letter === 'Yours' ? null : list.find(([t]) => t.tier === MAIN[letter]) || list[0];
      const extra = mainOne ? list.filter((x) => x !== mainOne) : [];
      const moreOpen = !!FB.uqMore?.[letter] || extra.some(([t]) => FB.goto?.key === t.key || (FB.search.trim() && t.bases.some((b) => b.toLowerCase().includes(FB.search.trim().toLowerCase()))));
      const more = extra.length ? h('div', { class: 'fb-letter', style: { borderBottom: 0, paddingTop: 0 } },
        h('span', { class: 'small faint', style: { textTransform: 'none', letterSpacing: 0 } }, `Also ${letter}: ${extra.map(([t]) => `${tierName(t)} (${t.bases.length})`).join(', ')}`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'quiet sm', onclick: () => { FB.uqMore = { ...(FB.uqMore || {}), [letter]: !moreOpen }; drawList(); } }, moreOpen ? 'Fold' : 'Show')) : null;
      const shown = mainOne ? [mainOne, ...(moreOpen ? extra : [])] : list;
      out.push(h('div', { class: 'fb-lettergroup', id: anchor(letter) }, h('div', { class: 'fb-letter' }, h('b', {}, letter === 'Yours' ? 'Your tiers' : letter === 'High variety' ? 'High variety' : `${letter} tier`), h('span', { class: 'spacer' }), combine), shown.map(([, c]) => c), more));
    }
    if (rest.length) {
      // special cases (6-links, corrupted, Kaom's…): rules by property, mostly nothing to move. Folded; the
      // ones that are switched off at your strictness and list nothing are in a second fold
      const unused = rest.filter(([t]) => (t.off || t.state === 'Off') && !t.bases.length);
      const used = rest.filter((x) => !unused.includes(x));
      const open = !!FB.uqSpecialOpen || !!FB.search.trim() || rest.some(([t]) => FB.goto?.key === t.key || [...FB.selected].some((b) => t.bases.includes(b)));
      const head = h('div', { class: 'fb-letter' }, h('b', {}, 'Special cases'),
        h('span', { class: 'small faint', style: { textTransform: 'none', letterSpacing: 0 } }, `${used.length} in use${unused.length ? `, ${unused.length} switched off` : ''}`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'quiet sm', 'aria-expanded': String(open), onclick: () => { FB.uqSpecialOpen = !open; drawList(); } }, open ? 'Fold' : 'Show'));
      const inner = !open ? null : [
        used.map(([, c]) => c),
        unused.length ? h('div', { class: 'fb-letter', style: { borderBottom: 0 } }, h('span', { class: 'small faint', style: { textTransform: 'none', letterSpacing: 0 } }, `Switched off at your strictness: ${unused.map(([t]) => tierName(t)).join(', ')}`), h('span', { class: 'spacer' }),
          h('button', { class: 'quiet sm', onclick: () => { FB.uqUnusedOpen = !FB.uqUnusedOpen; drawList(); } }, FB.uqUnusedOpen ? 'Hide them' : 'Show them')) : null,
        FB.uqUnusedOpen ? unused.map(([, c]) => c) : null];
      out.push(h('div', { class: 'fb-lettergroup', id: anchor('Special cases') }, head, inner));
    }
    return out;
  }

  // ---------- Unique items, like FilterBlade's page: compact tier rows in two groups ----------
  // Predictable tiers (S, A, B+C, D) and High variety tiers (jewels, top multi-bases, multi-bases, boss drops).
  // A row: shown or not, the name, the look (click to edit). Open a row for its bases. FilterBlade's three D
  // tiers are one row (D tier); special cases (6-links, Kaom's…) are one folded line at the bottom.
  const UQ_ROWS = [
    ['Predictable tiers', [['S tier', ['t1']], ['A tier', ['t2']], ['B+C tier', ['t3']], ['D tier', ['hideable', 'hideable2', 'earlyleague']]]],
    ['High variety tiers', [['Jewels', ['exjewels']], ['Top multi-bases', ['multispecialhigh']], ['Multi-bases', ['multispecial', 'multi']], ['Boss drops', ['t3boss']]]],
  ];
  function uniqueRows() {
    const byTier = new Map(type.tiers.map((t) => [t.tier, t]));
    const used = new Set();
    const row = (name, tiersOf, { own = false } = {}) => {
      const list = tiersOf.filter(Boolean);
      if (!list.length) return null;
      list.forEach((t) => used.add(t.tier));
      const main = list[0];
      const key = `uq|${main.key}`;
      const states = list.map((t) => t.state || (t.off ? 'Off' : t.action));
      const allShown = states.every((x) => x === 'Show');
      const noneShown = states.every((x) => x !== 'Show');
      const bases = list.flatMap((t) => t.bases.map((b) => [b, t]));
      const q = FB.search.trim().toLowerCase();
      const hits = q ? bases.filter(([b]) => b.toLowerCase().includes(q)) : bases;
      if (q && !hits.length) return null;
      const open = FB.uqOpen?.[key] || (!!q) || list.some((t) => FB.goto?.key === t.key) || [...FB.selected].some((b) => bases.some(([x]) => x === b));
      const editing = FB.editing === key;
      const cb = h('input', { type: 'checkbox', checked: allShown, 'aria-label': `${name}: shown in game` });
      cb.indeterminate = !allShown && !noneShown;
      cb.addEventListener('change', async () => {
        const want = cb.checked ? 'Show' : 'Hide';
        for (const t of list) if ((t.state || t.action) !== want) await call('tiers:action', { key: t.key, action: want });
        toast(`${name} ${want === 'Show' ? 'shown' : 'hidden'} in game`);
        delete FB.prices[type.type];
        renderFilters();
      });
      const look = h('button', { class: 'uq-look', title: `Change the look of ${name}`, onclick: () => { if (editing) FB.editing = null; else { FB.editing = key; FB.draft = structuredClone(main.style || {}); } drawList(); } });
      const drawLook = () => mount(look, dropLabel(hits[0]?.[0] || main.bases[0] || 'Unique', editing ? FB.draft : main.style, { rarity: 'Unique', game: true, scale: 0.62, hidden: noneShown }));
      drawLook();
      const head = h('div', { class: 'uq-row-head' },
        h('label', { class: 'uq-check' }, cb),
        h('button', { class: 'uq-name', 'aria-expanded': String(open), onclick: () => { FB.uqOpen = { ...(FB.uqOpen || {}), [key]: !open }; drawList(); } },
          h('span', { class: 'uq-caret' }, open ? '▾' : '▸'), name,
          h('span', { class: 'uq-count' }, `${bases.length}`),
          own ? h('span', { class: 'pill', style: { marginLeft: '8px' } }, 'Your tier') : null,
          list.some((t) => edited.has(t.key)) ? h('span', { class: 'pill warn', style: { marginLeft: '8px' } }, 'Your look') : null),
        h('span', { class: 'spacer' }), look);
      const box = h('div', { class: 'uq-row' + (noneShown ? ' is-hidden' : ''), 'data-key': main.key }, head,
        editing ? lookEditor({ ...main, customName: name }, () => drawList(), drawLook, list.length > 1 ? {
          onSave: async (d) => { await call('tiers:styles', { keys: list.map((t) => t.key), style: d }); },
          onReset: async () => { await call('tiers:styles', { keys: list.map((t) => t.key), style: null }); },
        } : {}) : null,
        open ? h('div', { class: 'fb-chips uq-chips' }, hits.length ? hits.map(([b, t]) => chip(b, t)) : h('span', { class: 'small faint' }, 'Empty. Drag uniques here, or select some and use the bar below.')) : null);
      // drop bases on the row: they go to its main tier
      if (main.hasBaseList) {
        box.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-poe-bases')) { e.preventDefault(); box.classList.add('drop-target'); } });
        box.addEventListener('dragleave', () => box.classList.remove('drop-target'));
        box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('drop-target'); try { moveTo(JSON.parse(e.dataTransfer.getData('text/x-poe-bases')), main.tier, e.dataTransfer.types.includes('text/x-poe-new')); } catch { /* ignore */ } });
      }
      return box;
    };
    const own = type.tiers.filter((t) => /^poehelper-/.test(t.tier) && !t.generated);
    const out = [];
    // My collection: ticked in the price check; a base where you have every unique and all are cheap is hidden
    {
      const have = Object.keys(S.settings.uniqueCollection || {}).length;
      const hiddenB = S.settings.collectedHideBases || [];
      const max = h('input', { type: 'number', min: 0, step: 1, value: S.settings.collectHideBelow ?? 5, style: { width: '64px' }, 'aria-label': 'Hide collected bases when every unique is worth at most' });
      max.addEventListener('change', async () => { const r = await call('collection:set', { max: max.value }); S.settings.collectHideBelow = r.max; S.settings.collectedHideBases = r.hidden; toast(`${r.hidden.length} collected bases hidden`); drawList(); });
      out.push(h('div', { class: 'panel row small', style: { gap: '10px', marginBottom: '12px' } },
        h('b', {}, 'My collection'),
        h('span', { class: 'muted' }, have ? `${have} unique${have === 1 ? '' : 's'} ticked` : 'Price check a unique and tick the ones you own.'),
        h('span', { class: 'spacer' }),
        h('span', {}, 'Hide a base when I have every unique on it and none is worth more than'), max, h('span', {}, 'c'),
        h('span', { class: 'faint', title: hiddenB.join('\n') }, hiddenB.length ? `${hiddenB.length} base${hiddenB.length === 1 ? '' : 's'} hidden now` : 'none hidden yet')));
    }
    if (own.length) out.push(h('div', { class: 'uq-sec' }, h('div', { class: 'uq-sec-title' }, 'Your tiers'), own.map((t) => row(tierName(t), [t], { own: true }))));
    for (const [title, rows] of UQ_ROWS) {
      const r = rows.map(([name, ids]) => row(name, ids.map((id) => byTier.get(id)))).filter(Boolean);
      if (r.length) out.push(h('div', { class: 'uq-sec' }, h('div', { class: 'uq-sec-title' }, title), r));
    }
    const rest = type.tiers.filter((t) => !used.has(t.tier) && !t.generated && !/^poehelper-/.test(t.tier) && t.tier !== 'restex');
    if (rest.length) {
      const open = !!FB.uqSpecialOpen || !!FB.search.trim();
      const r = open ? rest.map((t) => row(tierName(t), [t])).filter(Boolean) : [];
      out.push(h('div', { class: 'uq-sec' }, h('div', { class: 'uq-sec-title row' }, 'Special cases', h('span', { class: 'small faint', style: { textTransform: 'none', letterSpacing: 0 } }, '6-links, Kaom\'s Heart, synthesised, corrupted… shown by their own rules'), h('span', { class: 'spacer' }),
        h('button', { class: 'quiet sm', onclick: () => { FB.uqSpecialOpen = !open; drawList(); } }, open ? 'Fold' : `Show ${rest.length}`)), r));
    }
    return out;
  }

  // uniques on a base none of the rows above has: they get the filter's catch-all look; drag a base up into a row
  function uniqueRestPanel() {
    const rest = type.tiers.find((t) => /rest/i.test(t.tier));
    if (!rest) return null;
    const box = restBox(rest);
    if (!FB.unlisted?.[type.type]?.length) return null;
    return h('div', { class: 'panel fb-uqrest' }, h('h3', {}, 'Uniques with the catch-all look'), box);
  }

  function drawList() {
    if (type.type === 'uniques') {
      mount(list, priceBanner(), addRow(), uniqueRows(), uniqueRestPanel(), h('datalist', { id: 'fb-names' }, (FB.names[type.type] || []).map((n) => h('option', { value: n }))));
      drawBar();
      return;
    }
    const cards = letterGroups(type.tiers.map(tierCard)).filter(Boolean);
    mount(list, categoryOf(type.type)?.clusters ? clusterPanel() : null, priceBanner(), newTierBar(), addRow(), cards.length ? cards : h('div', { class: 'panel empty' }, 'No base matches your search.'), hideZone(), fracturedBox(),
      h('datalist', { id: 'fb-names' }, (FB.names[type.type] || []).map((n) => h('option', { value: n }))));
    drawBar();
  }
  drawList();

  mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, iconPicker(type.type), h('h2', {}, type.key === CLUSTER_SIZE_TYPE ? 'Cluster jewels: looks by size' : merge ? merge.label : type.label), type.scrollsView ? h('span', { class: 'small muted' }, 'Every scroll rule of your filter in one list, from the stacked, campaign and currency sections, biggest stacks first. Each keeps FilterBlade\'s look; change a look or show or hide it here.') : h('span', { class: 'small muted' }, 'Click bases to select them, or drag them between tiers.'), h('span', { class: 'spacer' }),
        // league start: every currency tier shows (hidden and switched-off ones too), each with its own look
        /^currency(->|$)/.test(type.type) ? (() => { const on = !!S.settings.showAllCurrency; return h('button', { class: on ? 'primary sm' : 'sm', 'aria-pressed': on ? 'true' : 'false',
          title: on ? 'Every currency tier shows, hidden ones too. Click to go back to your filter\'s choices' : 'League start: show every currency, also the tiers your filter hides or switched off',
          onclick: async () => { S.settings.showAllCurrency = await call('currency:showAll', !on); toast(!on ? 'All currency shows now (hidden tiers too). Select the filter in game again' : 'Currency follows your filter again'); renderFilters(); } }, on ? 'All currency shown ✓' : 'Show all currency'); })() : null,
        type.key === CLUSTER_SIZE_TYPE ? h('button', { class: 'sm', onclick: () => { FB.type = CLUSTER_GRID; renderFilters(); } }, '← Back to the enchantments') : null,
        // regular maps: quick hides (blighted maps and uniques are never touched)
        type.key === 'maps' ? (() => {
          const mh = S.settings.mapHide || {};
          const btn = (k, label) => h('button', { class: mh[k] ? 'primary sm' : 'sm', 'aria-pressed': mh[k] ? 'true' : 'false', onclick: async () => {
            S.settings.mapHide = await call('maps:hide', { [k]: !mh[k] });
            toast(`${label}: ${!mh[k] ? 'on' : 'off'}. Select the filter in game again`); renderFilters();
          } }, `${mh[k] ? '✓ ' : ''}${label}`);
          return h('span', { class: 'row', style: { gap: '6px' } }, btn('white', 'Hide white maps (T1–5)'), btn('yellow', 'Hide yellow maps (T6–10)'), btn('below16', 'Hide below Tier 16'));
        })() : null,
        type.scrollsView || !pricedGroup(type.type) ? null : h('button', { class: FB.priceColors ? 'primary sm' : 'sm', title: 'Colour every item by how well its current poe.ninja price fits its tier', onclick: () => {
          FB.priceColors = !FB.priceColors;
          // a fresh analysis when turning colours on (prices come from the 20-minute cache, so this is cheap)
          if (FB.priceColors) delete FB.prices[type.type];
          renderFilters();
        } }, FB.priceColors ? 'Hide price colours' : 'Check prices'),
        type.scrollsView || !pricedGroup(type.type) ? null : h('button', { class: FB.catPrices === type.type ? 'primary sm' : 'sm', title: 'Set the price of each tier and move items to the tier their price fits, for this category only (like Price review)', onclick: async () => {
          if (FB.catPrices === type.type) { FB.catPrices = null; return renderFilters(); }
          FB.catPrices = type.type;
          renderFilters();
          if (!FB.review?.categories?.some((c) => c.type === type.type)) {
            try { await runReview([type.type]); } catch { /* toast */ }
            if (!FB.review?.categories?.some((c) => c.type === type.type)) { FB.catPrices = null; toast(`poe.ninja has no prices for ${type.label}, so its tiers can't be set by price.`); }
            renderFilters();
          }
        } }, FB.catPrices === type.type ? 'Close prices' : 'Set category prices'),
        search),
      partSwitch,
      FB.catPrices === type.type ? (() => { const box = h('div', { class: 'fb-catprices' }); renderReview(box, { only: type.type }); return box; })() : null,
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
const CAMPAIGN_HIDE = '__campaignhide__';
const RARE_LOOKS = '__rarelooks__';
const TALISMANS = '__talismans__';
// Loot filter → Talismans: your own tier for each beast talisman base
async function renderTalismans(body, view) {
  const cats = sidebar(view, new Set());
  let data = await call('talisman:get');
  const T = [['top', 'S tier'], ['good', 'A tier'], [null, 'Filter'], ['hide', 'Hide']];
  const set = async (bases, value, extra = {}) => { data = await call('talisman:set', { bases, value, ...extra }); S.settings.talismans = data.state; S.settings.talismanRest = data.rest; draw(); drawList(); };
  const sample = (look, name) => dropLabel(name, look, { rarity: 'Rare', scale: 0.55, game: true });
  const find = h('input', { type: 'search', placeholder: 'Find a talisman', value: FB.talFind || '', style: { width: '220px' }, oninput: (e) => { FB.talFind = e.target.value; drawList(); } });
  const list = h('div', { class: 'tal-list' });
  const drawList = () => {
    const q = (FB.talFind || '').toLowerCase();
    const shown = data.bases.filter((b) => !q || b.toLowerCase().includes(q));
    mount(list, shown.length ? shown.map((b) => {
      const v = data.state[b] || null;
      return h('div', { class: 'tal-row' + (v ? ` tal-${v}` : data.rest ? ' tal-hide tal-rest' : '') },
        window.UI.itemPic(b, { size: 28 }),
        h('span', { class: 'n' }, b),
        h('div', { class: 'fb-parts', role: 'radiogroup', 'aria-label': b, style: { margin: 0 } }, T.map(([id, label]) => h('button', {
          class: 'fb-part' + (v === id ? ' on' : ''), role: 'radio', 'aria-checked': v === id ? 'true' : 'false',
          title: id === null ? (data.rest ? 'Not picked: hidden (Hide the rest is on)' : 'Your filter decides') : label,
          onclick: () => set([b], id),
        }, label))));
    }) : h('div', { class: 'small muted' }, data.bases.length ? 'No talisman matches.' : 'Your filter has no talismans (pick a filter first).'));
  };
  const count = () => { const v = Object.values(data.state); return `${v.filter((x) => x === 'top').length} S, ${v.filter((x) => x === 'good').length} A, ${v.filter((x) => x === 'hide').length} hidden`; };
  const draw = () => mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, h('span', { class: 'fb-iconbtn' }, window.UI.icon('ring', { size: 22 })), h('h2', {}, 'Talismans'),
        h('span', { class: 'small muted' }, 'Beast talisman amulets. FilterBlade shows them in its special bases; give each one your own tier here.')),
      h('div', { class: 'panel bm-tools' },
        h('div', { class: 'row small', style: { gap: '10px', flexWrap: 'wrap' } },
          h('span', { class: 'cj-cell cj-top' }, 'S tier'), sample(data.looks?.t1, 'Flame Hellion Talisman'),
          h('span', { class: 'cj-cell cj-good' }, 'A tier'), sample(data.looks?.t2, 'Flame Hellion Talisman'),
          h('span', { class: 'faint' }, 'Filter: FilterBlade\'s own look. Hide: not shown (normal, magic and rare; uniques always show).')),
        h('div', { class: 'row small', style: { gap: '10px' } },
          toggle(!!data.rest, (v) => set([], undefined, { rest: v }), 'Hide every talisman I haven\'t picked'),
          h('span', { class: 'spacer' }), find,
          h('span', { class: 'small muted' }, count()),
          h('button', { class: 'quiet sm', onclick: () => { const ks = Object.keys(data.state); if (ks.length && confirm(`Clear your ${ks.length} talisman choices?`)) set(ks, null); } }, 'Reset'))),
      list)));
  draw(); drawList();
}
// Loot filter → Rare looks: one look per kind of rare / gear drop, set on every FilterBlade rule of that kind
// (the base lists stay FilterBlade's and Base ranks'). [id, name, about, [[type regex, tier regex], ...]]
const RARE_LOOK_GROUPS = [
  ['Unidentified (item tier)', [
    ['unid5', 'Item tier 5', 'Unidentified gear of item tier 5, any rank you show', [[/^gear->tiered$/, /^t5r\d$/]]],
    ['unid4', 'Item tier 4', 'Unidentified gear of item tier 4', [[/^gear->tiered$/, /^t4r\d$/]]],
    ['unid3', 'Item tier 3', 'Unidentified gear of item tier 3', [[/^gear->tiered$/, /^t3r\d$/]]],
    ['unid2', 'Item tier 2 (and 1)', 'Unidentified gear of item tier 2, and Tier 1 if you show it', [[/^gear->tiered$/, /^t2r\d$/]]],
    ['unidany', 'Any base', 'FilterBlade\'s "any base" item tier rules', [[/^gear->tiered$/, /^(any\d|specialclasses)$/]]],
  ]],
  ['Rares without an item tier (Untiered)', [
    ['rr1', 'Rares by base: Tier 1', 'Your rank S bases (Fated ones too)', [[/^rr(->|$)/, /^t1f?$/]]],
    ['rr2', 'Rares by base: Tier 2', 'Your rank A bases', [[/^rr(->|$)/, /^t2f?$/]]],
    ['rr3', 'Rares by base: Tier 3', 'Your rank B bases', [[/^rr(->|$)/, /^t3$/]]],
    ['rr4', 'Rares by base: Tier 4', 'Your rank C bases', [[/^rr(->|$)/, /^t[45]$/]]],
  ]],
  ['Special kinds', [
    ['strands', 'Memory Strands', 'Gear with Memory Strands', [[/^gear->memorystrand$/, /^(t\d|any)$/]]],
    ['strandshigh', 'Memory Strands: many', 'Gear with a lot of Memory Strands', [[/^gear->memorystrand$/, /^(t\dhigh|anyhigh)$/]]],
    ['strandedspecial', 'Fractured or veiled, with strands', '', [[/^gear->(memorystrand|tiered)$/, /^stranded/]]],
    ['influenced', 'Influenced', 'Shaper, Elder and Conqueror bases', [[/^influenced/, /./]]],
    ['fractured', 'Fractured', 'Fractured bases', [[/^exotic->fractured$/, /./]]],
    ['veiled', 'Veiled', 'Veiled rares', [[/^rare->exotic->veiled$/, /./]]],
    ['exarch', 'Searing Exarch / Eater of Worlds', 'Eldritch implicits', [[/^rare->(exarch|eater)$/, /./]]],
    ['quality', 'Quality and overquality', 'Crafting bases with quality, overquality', [[/^crafting->qualityperfection$/, /./]]],
    ['craftilvl', 'Crafting bases by item level', 'FilterBlade\'s high item level crafting bases', [[/^crafting->generalgear$/, /./]]],
    ['special', 'Special bases', 'Exotic and special bases', [[/^exoticbases$/, /./]]],
    ['corrupted', 'Corrupted and enchanted', '', [[/^exotic->(corruptions|enchanted|crucible|sockets)$/, /./]]],
    ['idmods', 'Identified with good mods', 'Rares and magic items FilterBlade keeps for their mods', [[/^(rareid|rareblendid|corruptedid|magicid)$/, /./]]],
    ['links', '6-links and sockets', '', [[/^(6l|socketslinks)$/, /./]]],
    ['chancing', 'Chancing bases', 'Bases worth an Orb of Chance', [[/^chancing$/, /./]]],
    ['fated', 'Fated gear highlight', 'The extra look Fated gear gets', [[/^decorators->(rareeg|leveling->rare)$/, /^fatedgear$/]]],
    ['highlight', 'Highlights: big and small rares', 'FilterBlade\'s size highlights for rares (large, medium, tiny, 4-links, item level 83+)', [[/^decorators->(rareeg|leveling->rare|leveling->magic)$/, /^(?!fatedgear)/]]],
  ]],
];
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
const CJ_NAME = { top: 'S tier', good: 'A tier', basic: 'basic look', hide: 'hidden' };
const CJ_BRUSHES = [
  { id: 'top', label: 'S tier', title: 'Show with your design\'s Tier 1 look (big, loud)' },
  { id: 'good', label: 'A tier', title: 'Show with your design\'s Tier 2 look' },
  { id: 'basic', label: 'Basic', title: 'Show with FilterBlade\'s plain cluster jewel look' },
  { id: 'hide', label: 'Hide', title: 'Hide these jewels' },
  { id: null, label: 'Filter decides', title: 'Back to what your filter does' },
];
// ---------------------------------------------------------------- Campaign: hide item types while levelling
const CAMPAIGN_SETS = [
  ['One-handed weapons', ['Claws', 'Daggers', 'Rune Daggers', 'Wands', 'One Hand Swords', 'One Hand Axes', 'One Hand Maces', 'Sceptres']],
  ['Two-handed weapons', ['Bows', 'Staves', 'Warstaves', 'Two Hand Swords', 'Two Hand Axes', 'Two Hand Maces']],
  ['Off-hand', ['Shields', 'Quivers']],
  ['Armour', ['Body Armours', 'Helmets', 'Gloves', 'Boots']],
  ['Jewellery', ['Rings', 'Amulets', 'Belts']],
];
const CAMPAIGN_LABELS = { 'One Hand Swords': 'One Hand Swords & Rapiers' };
// what each type looks like in game, so it's clear which button an item is under
const CAMPAIGN_EXAMPLES = { 'One Hand Swords': 'Rusted Sword, Cutlass… and the rapiers: Rusted Spike, Estoc…', Claws: 'Nailed Fist, Sharktooth Claw…', Daggers: 'Glass Shank, Skinning Knife…', 'Rune Daggers': 'Carving Knife, Boot Knife…', Staves: 'Gnarled Branch, Quarterstaff…', Warstaves: 'Long Staff, Iron Staff…' };
function renderRareLooks(body, view) {
  const cats = sidebar(view, new Set());
  const edited = new Set(Object.keys(S.settings.tierPatch?.styles || {}));
  const SAMPLE = { unid5: 'Vaal Regalia', unid4: 'Vaal Regalia', unid3: 'Vaal Regalia', unid2: 'Vaal Regalia', unidany: 'Vaal Regalia', quality: 'Titan Plate', craftilvl: 'Titan Plate', special: 'Stygian Vise', links: 'Vaal Regalia' };
  const sections = RARE_LOOK_GROUPS.map(([title, groups]) => {
    const cards = groups.map(([id, name, about, sel]) => {
      // every FilterBlade rule of this kind (switched off ones too: they get the look when you show them)
      const tiersOf = view.types.flatMap((ty) => ty.tiers.filter((t) => !t.generated && sel.some(([tr, xr]) => tr.test(ty.type) && xr.test(t.tier))).map((t) => ({ ...t, typeKey: ty.type })));
      if (!tiersOf.length) return null;
      const first = tiersOf.find((t) => !t.off) || tiersOf[0];
      const looks = new Set(tiersOf.map((t) => JSON.stringify(t.style || {})));
      const mine = tiersOf.some((t) => edited.has(t.key));
      const key = `rarelooks|${id}`;
      const isEditing = FB.editing === key;
      const fake = { key, tier: id, type: 'rarelooks', customName: name, style: first.style };
      const preview = h('div', { class: 'fb-preview' });
      const draw = () => mount(preview, dropLabel(SAMPLE[id] || 'Vaal Regalia', isEditing ? FB.draft : first.style, { rarity: id === 'craftilvl' || id === 'quality' ? 'Normal' : 'Rare', game: true, scale: 0.8 }), soundButton(window.UI.normalizeStyle(isEditing ? FB.draft : first.style).sound));
      draw();
      const keys = tiersOf.map((t) => t.key);
      return h('div', { class: 'fb-tier rl-card' },
        h('div', { class: 'fb-tier-head ground' }, preview,
          h('div', { class: 'fb-tier-meta' },
            h('div', { class: 'fb-tier-name' }, name, mine ? h('span', { class: 'pill warn', style: { marginLeft: '8px' } }, 'Your look') : null,
              looks.size > 1 ? h('span', { class: 'pill', style: { marginLeft: '8px' }, title: 'FilterBlade gives these rules different looks; saving a look here gives them all the same one' }, `${looks.size} looks now`) : null),
            h('div', { class: 'small', style: { color: '#9a9f8c' } }, `${about ? `${about}. ` : ''}${keys.length} rule${keys.length === 1 ? '' : 's'} in your filter`)),
          h('span', { class: 'spacer' }),
          h('button', { class: isEditing ? 'primary sm' : 'sm', onclick: () => { if (isEditing) FB.editing = null; else { FB.editing = key; FB.draft = structuredClone(first.style || {}); } renderFilters(); } }, isEditing ? 'Close' : 'Edit look')),
        isEditing ? lookEditor(fake, () => renderFilters(), draw, {
          onSave: async (d) => { await call('tiers:styles', { keys, style: d }); },
          onReset: async () => { await call('tiers:styles', { keys, style: null }); },
        }) : null);
    }).filter(Boolean);
    return cards.length ? h('div', {}, h('h3', { class: 'fb-sec-title', style: { margin: '18px 0 8px' } }, title), cards) : null;
  });
  mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, h('span', { class: 'fb-iconbtn' }, window.UI.icon('sparkle', { size: 22 })), h('h2', {}, 'Rare looks'),
        h('span', { class: 'small muted' }, 'One look for each kind of rare and gear drop. A look here goes on every FilterBlade rule of that kind; which bases show stays with Base ranks and your filter.'),
        h('span', { class: 'spacer' }),
        // plain rares (tiered and untiered): the game's rare yellow, or the theme's colours
        h('label', { class: 'row small', style: { gap: '6px' }, title: 'Game rare yellow: plain rares (with or without an item tier) in yellow, stronger for better ranks and higher tiers, so they never look like currency. Influenced, fractured and other rares keep your theme.' },
          h('span', { class: 'muted' }, 'Rares'),
          h('select', { 'aria-label': 'Rare colours', onchange: async (e) => { const r = await call('rarelooks:theme', { style: e.target.value }); S.settings.rareStyle = e.target.value; toast(`${r.count} rare rules updated. Select the filter in game again`); renderFilters(); } },
            [['yellow', 'Game rare yellow'], ['theme', 'My theme\'s colours']].map(([v, l]) => h('option', { value: v, selected: (S.settings.rareStyle || 'yellow') === v }, l)))),
        h('button', { class: 'sm', title: 'Give every card here the colours of your Tier designer theme again (plain rares follow the Rares choice). Applying a theme in the Tier designer does this too.',
          onclick: async () => { const r = await call('rarelooks:theme'); toast(`${r.count} rare rules use your theme's colours now. Select the filter in game again`); renderFilters(); } }, 'Use my theme\'s colours')),
      sections)));
}

function renderCampaignHide(body, view) {
  const cats = sidebar(view, new Set());
  const o = { classes: [], rares: false, untilLevel: 67, keepLinks: 4, ...(S.settings.campaignHide || {}) };
  const save = async (patch, msg) => {
    S.settings.campaignHide = await call('campaignHide:set', { ...o, ...patch });
    if (msg) toast(msg);
    renderFilters();
  };
  const on = new Set(o.classes);
  const flip = (c) => { const next = new Set(on); if (next.has(c)) next.delete(c); else next.add(c); save({ classes: [...next] }, `${CAMPAIGN_LABELS[c] || c}: ${next.has(c) ? 'hidden in the campaign' : 'shown again'}`); };
  const until = h('input', { type: 'number', min: 1, max: 83, value: o.untilLevel, style: { width: '64px' }, 'aria-label': 'Up to area level' });
  until.addEventListener('change', () => save({ untilLevel: until.value }, `Hidden up to area level ${Math.round(+until.value) || 67}`));
  const links = h('select', { 'aria-label': 'Keep linked items', onchange: (e) => save({ keepLinks: Number(e.target.value) }) },
    [[0, 'No, hide them too'], [3, '3-links and more'], [4, '4-links and more'], [5, '5-links and more'], [6, '6-links']].map(([v, l]) => h('option', { value: v, selected: (o.keepLinks || 0) === v }, l)));
  mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, h('span', { class: 'fb-iconbtn' }, window.UI.icon('eye', { size: 22 })), h('h2', {}, 'Hide item types'),
        h('span', { class: 'small muted' }, 'Item types your build doesn\'t use, hidden while you level. Endgame (maps) is left to Base ranks.')),
      h('div', { class: 'panel bm-groups' },
        CAMPAIGN_SETS.map(([title, list]) => h('div', { class: 'bm-groupset' }, h('span', { class: 'small muted' }, title),
          h('div', { class: 'row', style: { gap: '5px' } }, list.map((c) => h('button', { class: 'sm bm-group' + (on.has(c) ? ' off' : ''), 'aria-pressed': on.has(c) ? 'true' : 'false',
            title: `${c}${CAMPAIGN_EXAMPLES[c] ? `: ${CAMPAIGN_EXAMPLES[c]}` : ''}\n${on.has(c) ? 'Hidden in the campaign. Click to show it again' : 'Hide this item type in the campaign'}`, onclick: () => flip(c) }, CAMPAIGN_LABELS[c] || c))))),
        h('div', { class: 'row small', style: { gap: '8px', marginTop: '4px' } },
          h('button', { class: 'sm quiet', disabled: !on.size, onclick: () => save({ classes: [] }, 'Every item type shows again') }, 'Show all'),
          h('span', { class: 'faint' }, on.size ? `${on.size} item type${on.size === 1 ? '' : 's'} hidden (greyed out)` : 'Click an item type to hide it; greyed out = hidden.'))),
      h('div', { class: 'panel stack', style: { gap: '10px' } },
        h('div', { class: 'row small', style: { gap: '14px' } },
          h('label', { class: 'row', style: { gap: '6px' } }, 'Up to area level', until),
          h('span', { class: 'faint' }, '67 is the whole campaign; maps start at 68.')),
        h('div', { class: 'row small', style: { gap: '14px' } },
          h('label', { class: 'row', style: { gap: '6px' } }, 'Keep linked items', links),
          h('span', { class: 'faint' }, 'Handy for a chest or a weapon with links you can use.')),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!o.rares, onchange: (e) => save({ rares: e.target.checked }, e.target.checked ? 'Rares of these types are hidden too' : 'Rares of these types show') }), 'Hide rares of these types too (normal and magic ones are always hidden)'),
        h('div', { class: 'small faint' }, 'Uniques, My bases and your own rules still show.')))));
}

async function renderClusterGrid(body, view) {
  const data = await call('cluster:get');
  const cats = sidebar(view, new Set());
  FB.cjBand = FB.cjBand || '84';
  // opened from a price check: the jewel's item level band, and its row scrolled into view
  if (FB.cjFocus?.ilvl && !FB.cjFocus.done) { const il = FB.cjFocus.ilvl; FB.cjBand = il >= 84 ? '84' : il >= 75 ? '75' : '68'; }
  if (FB.cjFocus && !FB.cjFocus.done) { FB.cjFocus.done = true; setTimeout(() => document.querySelector('tr.cj-focus')?.scrollIntoView({ block: 'center' }), 60); }
  if (FB.cjBrush === undefined) FB.cjBrush = 'top';
  let state = data.state || {};
  const d = data.divine;
  const fmtP = (c) => (c == null ? '' : d && c >= d * 0.95 ? `${+(c / d).toFixed(c >= d * 10 ? 0 : 1)} div` : `${c >= 10 ? Math.round(c) : +c.toFixed(1)}c`);
  // the price rule (poe.ninja prices, kept up to date), under your own clicks
  const auto = data.auto?.on ? data.autoCells || {} : {};
  const eff = (k) => state[k] || auto[k] || (data.filter[k] === 't1' ? 'top' : data.filter[k] === 't2' ? 'good' : null);
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
  // Top and Good in your Tier designer design's looks (Tier 1, Tier 2)
  const lk = (l) => (l ? window.UI.normalizeStyle(l, 'Rare') : null);
  const T1 = lk(data.looks?.t1);
  const T2 = lk(data.looks?.t2);
  const TB = lk(data.looks?.basic);
  if (body?.style) for (const [n, l] of [['top', T1], ['good', T2], ['basic', TB]]) if (l) {
    body.style.setProperty(`--cj-${n}-bg`, col(l.background) || 'transparent');
    body.style.setProperty(`--cj-${n}-tx`, col(l.text) || '#fff');
    body.style.setProperty(`--cj-${n}-bd`, col(l.border) || 'transparent');
  }
  const sizeTierName = (st) => (st ? tierName({ tier: st.tier, type: 'jewels->cluster' }) : '');
  const cellTitle = (size, e, p, k) => {
    const own = state[k];
    const ns = data.filter[k];
    return `${size} cluster, ${p} passives, ${e}, ${data.bands.find((b) => b.id === FB.cjBand).name.toLowerCase()}.\n` +
      `${data.prices[k] ? `poe.ninja: ${fmtP(data.prices[k])}. ` : 'No poe.ninja price. '}` +
      `${auto[k] ? `Price rule: ${CJ_NAME[auto[k]]}. ` : ''}Your filter: ${ns === 't1' ? 'S tier' : ns === 't2' ? 'A tier' : sizeTier(k) ? `${sizeTier(k).action === 'Hide' ? 'hidden by' : 'shown by'} the "${sizeTierName(sizeTier(k))}" tier` : 'no special tier'}.${own ? ` You set: ${CJ_NAME[own]}.` : ''}`;
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
  const LADDER = ['hide', null, 'basic', 'good', 'top'];
  const filterOwn = (k) => auto[k] || (data.filter[k] === 't1' ? 'top' : data.filter[k] === 't2' ? 'good' : null);
  const step = async (keys, dir) => {
    const byValue = new Map();
    for (const k of keys) {
      const lad = auto[k] ? ['hide', 'basic', 'good', 'top'] : LADDER; // the price rule already decides: no "filter decides" step
      const cur = state[k] || filterOwn(k);
      const i = Math.max(0, Math.min(lad.length - 1, lad.indexOf(cur) + dir));
      let v = lad[i];
      if (v === filterOwn(k)) v = null; // that's what the price rule or the filter does anyway
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
      // the price-checked jewel's own cell (its passives)
      const here = FB.cjFocus && FB.cjFocus.size === size.id && String(e).toLowerCase() === FB.cjFocus.node && Number(p) === FB.cjFocus.passives;
      return h('td', { class: here ? 'cj-here' : '', title: here ? 'Your jewel' : undefined }, el);
    };
    const rowAll = (e) => size.passives.map((p) => keyOf(e, p));
    return h('div', { class: 'panel cj-panel' },
      h('div', { class: 'cj-title' }, h('b', {}, `${size.id} cluster jewels`), h('span', { class: 'small faint' }, `${size.passives[0]}-${size.passives.at(-1)} passives`)),
      h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'cj-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Enchantment'), size.passives.map((p) => h('th', {},
          h('button', { class: 'cj-colhead', title: `Left click: every ${p}-passive ${size.id.toLowerCase()} jewel one step up. Right click: one step down.`, onclick: () => step(data.enchants[size.id].map((e) => keyOf(e, p)), +1), oncontextmenu: (ev) => { ev.preventDefault(); step(data.enchants[size.id].map((e) => keyOf(e, p)), -1); } }, `${p}`))))),
        h('tbody', {}, data.enchants[size.id].map((e) => h('tr', { class: FB.cjFocus && FB.cjFocus.size === size.id && String(e).toLowerCase() === FB.cjFocus.node ? 'cj-focus' : '' },
          h('th', {}, h('button', { class: 'cj-rowhead', title: `Left click: every ${e} jewel one step up. Right click: one step down.`, onclick: () => step(rowAll(e), +1), oncontextmenu: (ev) => { ev.preventDefault(); step(rowAll(e), -1); } }, e)),
          size.passives.map((p) => cell(e, p))))))));
  };

  const count = h('span', { class: 'small muted' });
  function drawCount() {
    const v = Object.values(state);
    mount(count, `You set ${v.length}: ${v.filter((x) => x === 'top').length} S, ${v.filter((x) => x === 'good').length} A, ${v.filter((x) => x === 'basic').length} basic, ${v.filter((x) => x === 'hide').length} hidden`);
  }
  drawCount();

  // the price rule: every priced jewel (all item levels) by its poe.ninja price, kept up to date
  const A = data.auto || {};
  const topIn = h('input', { type: 'text', value: A.top ?? (d ? '1 div' : '150c'), style: { width: '76px' }, 'aria-label': 'S tier from this price' });
  const goodIn = h('input', { type: 'text', value: A.good ?? '20c', style: { width: '76px' }, 'aria-label': 'A tier from this price' });
  const basicIn = h('input', { type: 'text', value: A.basic ?? '5c', placeholder: 'off', style: { width: '76px' }, 'aria-label': 'Basic look from this price' });
  const onBox = h('input', { type: 'checkbox', checked: !!A.on });
  const hideBox = h('input', { type: 'checkbox', checked: A.hide !== false });
  const saveAuto = async () => {
    try {
      const r = await call('cluster:auto', { on: onBox.checked, hide: hideBox.checked, top: topIn.value, good: goodIn.value, basic: basicIn.value });
      S.settings.clusterAuto = r.auto;
      const n = Object.values(r.autoCells || {});
      toast(r.auto.on ? `By price: ${n.filter((x) => x === 'top').length} S, ${n.filter((x) => x === 'good').length} A, ${n.filter((x) => x === 'basic').length} basic, ${n.filter((x) => x === 'hide').length} hidden` : 'By price is off: your filter decides again');
      renderFilters();
    } catch (e) { toast(e.message, true); }
  };
  for (const el of [onBox, hideBox, topIn, goodIn, basicIn]) el.addEventListener('change', saveAuto);

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
          h('label', { class: 'row', style: { gap: '5px' }, title: 'Every jewel poe.ninja has a price for, at every item level. Re-tiered every hour with your other auto-tiers (Price review shows what moved, and can undo it). Your own clicks win.' }, onBox, h('b', {}, 'Auto-tier by price')),
          'S tier from', topIn, 'A tier from', goodIn, 'basic look from', basicIn,
          h('label', { class: 'row', style: { gap: '5px' } }, hideBox, 'hide cheaper ones'),
          h('span', { class: 'spacer' }), count,
          h('button', { class: 'quiet sm', onclick: async () => { const ks = Object.keys(state); if (!ks.length || !confirm(`Clear all ${ks.length} cluster jewel choices? Your filter decides again.`)) return; await call('cluster:set', { keys: ks, value: null }); renderFilters(); } }, 'Reset all'))),
      h('div', { class: 'cj-legend small' },
        h('span', { class: 'cj-cell cj-top' }, 'S tier'), sample(data.looks.t1, 'Large Cluster Jewel'),
        h('span', { class: 'cj-cell cj-good' }, 'A tier'), sample(data.looks.t2, 'Large Cluster Jewel'),
        h('span', { class: 'cj-cell cj-basic' }, 'Basic'), sample(data.looks.basic, 'Large Cluster Jewel'),
        h('span', { class: 'cj-cell cj-hide' }, 'Hidden'),
        (() => { const st = Object.values(data.bySize || {}).find((x) => x.action !== 'Hide' && x.style); const el = h('span', { class: 'cj-cell cj-size' }, 'Size rule'); if (st) { const lk = window.UI.normalizeStyle(st.style, 'Rare'); el.style.color = col(lk.text); el.style.background = col(lk.background) || 'rgba(0,0,0,0.72)'; el.style.borderColor = col(lk.border) || 'transparent'; } return el; })(),
        h('span', { class: 'faint' }, 'no price: your filter\'s own rule by size (e.g. Large with 12 passives, item level 84+)'),
        h('span', { class: 'cj-cell cj-fhide' }, 'hidden by size'),
        h('span', { class: 'cj-cell' }, '·'), h('span', { class: 'faint' }, 'no tier'),
        h('span', { class: 'cj-cell cj-top mine' }, 'set by you'),
        h('div', { class: 'faint', style: { flexBasis: '100%' } }, `Numbers are poe.ninja prices${data.ageMs != null ? `, updated ${ago(data.ageMs)}` : ''}; a dot means no price. With By price on, priced jewels get their look from the price; the rest follow your filter's size rule. Left click a cell to move it one step up (hidden → filter decides → basic → A → S), right click one step down; an enchantment or a passive count does the same for its whole row or column. Drag over cells to paint them with the brush. Uniques are never affected.`)),
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
  // views across both weapon groups (for looking only: every base keeps its one rank)
  const MIXES = {
    caster: ['Wands', 'Sceptres', 'Staves'],
    melee: ['Claws', 'Daggers', 'One Hand Swords', 'One Hand Axes', 'One Hand Maces', 'Two Hand Swords', 'Two Hand Axes', 'Two Hand Maces'],
    bows: ['Bows', 'Quivers'],
  };
  // three parts: armours and weapons, jewellery, and the minion bases (a view: they keep their one rank)
  const SECTIONS = [['gear', 'Armours and Weapons'], ['jewellery', 'Jewellery']]; // minion bases sit in these; Hide whole groups has a button for all of them
  FB.rankSection = SECTIONS.some(([id]) => id === FB.rankSection) ? FB.rankSection : 'gear';
  const gearGroups = (data.groups || []).filter((g) => g.id !== 'jewellery');
  const jewelGroup = (data.groups || []).find((g) => g.id === 'jewellery');
  // "Show in app" from the price check: open the part and view that hold the base (unless the view already shows it)
  const focus = FB.matrixFocus;
  if (focus && FB.focusPlaced !== focus) {
    FB.focusPlaced = focus;
    if (jewelGroup?.columns.some((c) => c.list.some((b) => b.name === focus))) FB.rankSection = 'jewellery';
    else {
      FB.rankSection = 'gear';
      const d = data.defences.find((x) => data.classes.some((c) => (data.bases[c][x.id] || []).some((b) => b.name === focus)));
      const g = gearGroups.find((x) => x.columns.some((c) => c.list.some((b) => b.name === focus)));
      if (d) FB.matrixView = `d:${d.id}`; else if (g) FB.matrixView = `g:${g.id}`;
    }
  }
  const part = FB.rankSection;
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
      : mode === 'x' ? (MIXES[key] || []).map((title) => gearGroups.flatMap((g) => g.columns).find((c) => c.title === title)).filter(Boolean)
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
    h('optgroup', { label: 'Weapons' }, gearGroups.map((g) => h('option', { value: `g:${g.id}`, selected: FB.matrixView === `g:${g.id}` }, g.name))),
    h('optgroup', { label: 'More' },
      h('option', { value: 'x:caster', selected: FB.matrixView === 'x:caster' }, 'Caster weapons (wands, sceptres, staves)'),
      h('option', { value: 'x:melee', selected: FB.matrixView === 'x:melee' }, 'Melee weapons (axes, swords, claws, rapiers, maces, daggers)'),
      h('option', { value: 'x:bows', selected: FB.matrixView === 'x:bows' }, 'Bows (bows and quivers)'),
      h('option', { value: 'minion:all', selected: FB.matrixView === 'minion:all' }, 'Minion')));
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

  const cellClass = (n) => (n === focus ? 'bm-focus ' : '') + 'bm-cell bm-rank' + ((state[n] || {}).vis === 'hide' ? ' hidden' : '') + (rankOf(n) === LOW ? ' rank-low' : '');
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
    }, window.UI.itemPic(b.name, { size: 22, hint: 'BaseType' }), h('span', { class: 'bm-n' }, b.name), h('span', { class: 'bm-f', 'aria-hidden': 'true' }, rankOf(b.name)));
    dressRank(el, rankOf(b.name));
    if (b.name === focus) { el.classList.add('bm-focus'); el.title = `The item you price checked. ${el.title}`; }
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
  const kindRows = (data.rankKinds || []).filter((k) => !(k.id === 'rares' && (data.hasUnidTiers || data.unidTiers))).map((k) => {
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

  // 3.30: unidentified items show their item tier. FilterBlade's own rules (and looks) with your ranks:
  // for each item tier, which bases you want to see ("Tier 4+: every base", "Tier 2: only S").
  // Saved per rank as the lowest tier that shows it ({ S: 2, A: 3, B: 4, C: 5 }; C stands for C and D).
  let unidTiers = data.unidTiers || null;
  const unidRow = (data.hasUnidTiers || unidTiers) ? (() => {
    const DEFAULT_UNID = { S: 2, A: 2, B: 2, C: 3 }; // what FilterBlade shows at Semi-Strict
    const TIERS = [5, 4, 3, 2, 1];
    const WHO = [['S', 'Only S bases'], ['A', 'A and up'], ['B', 'B and up'], ['C', 'Every base'], ['', 'Nothing']];
    const order = ['S', 'A', 'B', 'C'];
    // per tier: the broadest rank shown at that tier
    const byTier = (u) => Object.fromEntries(TIERS.map((t) => [t, [...order].reverse().find((r) => u?.[r] && u[r] <= t) || '']));
    const toRanks = (bt) => {
      const out = {};
      for (const r of order) { const t = [...TIERS].reverse().find((x) => bt[x] && order.indexOf(r) <= order.indexOf(bt[x])); if (t) out[r] = t; }
      return out;
    };
    const save = async (v) => { const r = await call('ranks:kind', { unidTiers: v }); unidTiers = r.unidTiers; S.settings.rankUnidTier = unidTiers; renderFilters(); };
    const mode = null; // always your choice (no "Filter decides")
    const bt = byTier(unidTiers || DEFAULT_UNID);
    // a lower tier never shows more than a higher one: a choice narrows the lower tiers that show more (one set to
    // Nothing stays Nothing), and a higher tier still shows at least what a lower one does. Tier 1 narrows Untiered.
    const wide = (w) => (w ? order.indexOf(w) + 1 : 0); // Nothing 0, S 1 … every base 4
    const set = async (tier, who) => {
      const next = { ...bt, [tier]: who };
      for (const t of TIERS) if (t < tier && wide(next[t]) > wide(who)) next[t] = who;
      for (const t of [2, 3, 4, 5]) { const lower = next[t - 1]; if (lower && (!next[t] || order.indexOf(next[t]) < order.indexOf(lower))) next[t] = lower; }
      const cur0 = (!kinds.rares || kinds.rares === 'off') ? 'D' : kinds.rares;
      const wide0 = { S: 1, A: 2, B: 3, D: 4, none: 0 };
      const r0 = { S: 'S', A: 'A', B: 'B', C: 'D', '': 'none' }[next[1]];
      if (r0 && wide0[cur0] > wide0[r0]) {
        const r = await call('ranks:kind', { kind: 'rares', min: r0 }); kinds = r.kinds; S.settings.rankKinds = kinds;
      }
      toast(`Tier ${tier}: ${WHO.find(([v]) => v === who)[1].toLowerCase()}`);
      save(toRanks(next));
    };
    // Tier 0: plain rares without an item tier (identified, or from before 3.30): the "Rares" rank choice
    // the same order as the item tiers (best first); "Every base" is what FilterBlade does on its own
    const R0 = [['S', 'Only S bases'], ['A', 'A and up'], ['B', 'B and up'], ['C', 'C and up'], ['D', 'Every base'], ['none', 'Nothing']];
    const tier0 = h('label', { class: 'row small', style: { gap: '8px', flexWrap: 'nowrap' } }, h('span', { title: 'Plain rares without an item tier: identified ones, and any the item tier rules don\'t take' }, 'Untiered'),
      h('select', { 'aria-label': 'Untiered, plain rares without an item tier: which bases are shown', onchange: async (e) => { const r = await call('ranks:kind', { kind: 'rares', min: e.target.value }); kinds = r.kinds; S.settings.rankKinds = kinds; toast('Untiered rares saved'); } },
        R0.map(([v, l]) => h('option', { value: v, selected: ((!kinds.rares || kinds.rares === 'off') ? 'D' : kinds.rares) === v }, l))));
    const per = h('div', { class: 'row', style: { gap: '10px 22px', flexWrap: 'wrap', gridColumn: '1 / -1' } }, TIERS.map((t) => h('label', { class: 'row small', style: { gap: '8px', flexWrap: 'nowrap' } },
      h('span', {}, t === 5 ? 'Tier 5' : `Tier ${t}`),
      h('select', { 'aria-label': `Unidentified item tier ${t}: which bases are shown`, onchange: (e) => set(t, e.target.value) },
        WHO.map(([v, l]) => h('option', { value: v, selected: bt[t] === v }, l))),
      )), tier0);
    return h('div', { class: 'bm-kind' }, h('b', {}, 'Unid item tier'),
      h('span', { class: 'small muted' }, 'Unidentified items of item level 68+ show their item tier (the "(Tier 3)" on the label). For each tier, pick which bases you want to see; FilterBlade\'s looks stay. A lower tier never shows more than a higher one: a choice narrows the lower tiers (and Untiered, from Tier 1) that show more. Untiered is plain rares without a tier (identified ones): lower ranks are hidden, the look stays FilterBlade\'s.'), mode, per);
  })() : null;

  // 3.30 Memory Strand gear: FilterBlade's rows with your ranks. Per rank the fewest strands that show it
  // ("Every base" is the rest); the louder "high" look stays FilterBlade's.
  let strands = data.strands || null;
  const strandRow = (data.hasStrands || strands) ? (() => {
    const DEFAULT = { S: 15, A: 20, B: 60, C: 'off' }; // FilterBlade at Semi-Strict
    const OPTS = [['off', 'Hidden'], ...[1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80].map((n) => [String(n), `${n}+ strands`])];
    const save = async (v) => { const r = await call('ranks:kind', { strands: v }); strands = r.strands; S.settings.rankStrands = strands; renderFilters(); };
    const mode = null; // always your choice
    if (!strands) strands = { ...DEFAULT };
    const per = h('div', { class: 'row', style: { gap: '10px 22px', flexWrap: 'wrap', gridColumn: '1 / -1' } },
      [['S', 'Rank S'], ['A', 'Rank A'], ['B', 'Rank B'], ['C', 'Every other base']].map(([r, label]) => h('label', { class: 'row small', style: { gap: '8px', flexWrap: 'nowrap' } },
        h('span', {}, label),
        h('select', { 'aria-label': `Memory Strands, ${label}: fewest strands shown`, onchange: (e) => save({ ...strands, [r]: e.target.value }) },
          OPTS.map(([v, l]) => h('option', { value: v, selected: String(strands[r] ?? 'off') === v }, l))))));
    return h('div', { class: 'bm-kind' }, h('b', {}, 'Memory Strands'),
      h('span', { class: 'small muted' }, 'Gear with Memory Strands. For each rank, the fewest strands you want to see; FilterBlade\'s looks stay (many strands get the louder look). Fractured and veiled stranded items always show.'), mode, per);
  })() : null;

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
    // a group hidden under a name that's gone (Rapiers are One Hand Swords now) can still be brought back
    ...(() => { const known = new Set(['Shields', 'Quivers', 'All minion bases', ...(data.groups || []).flatMap((g) => g.columns.map((c) => c.title)), ...data.defences.map((d) => d.name)]);
      const left = Object.keys(S.settings.hiddenGroups || {}).filter((l) => !known.has(l));
      return left.length ? [{ title: 'Hidden earlier', items: left.map((l) => ({ label: l, names: () => Object.keys(S.settings.hiddenGroups[l]?.before || {}) })) }] : []; })(),
    { title: 'Armour bases', items: data.defences.map((d) => ({ label: d.name, names: () => namesOf(data.classes.flatMap((c) => data.bases[c][d.id] || [])) })) },
  ].filter((set) => set.items.length);
  // only ever down to D (untiered): a whole group is pushed out of the ranks, never all made S.
  // The ranks the bases had are kept, so a second click brings the group back exactly as it was.
  const hiddenGroups = () => ({ ...(S.settings.hiddenGroups || {}) });
  const saveHidden = async (hg) => { S.settings.hiddenGroups = hg; await call('settings:set', { hiddenGroups: hg }).catch(() => {}); };
  const setRanks = async (byRank) => {
    for (const [r, list] of Object.entries(byRank)) if (list.length) ranks = (await call('ranks:set', { bases: list, rank: r })).ranks;
    S.settings.baseRanks = ranks;
  };
  const setWholeGroup = async (label, names) => {
    const hg = hiddenGroups();
    // a base another hidden group already holds keeps the rank that group remembered
    const held = (n) => Object.entries(hg).find(([l, g]) => l !== label && g.before && n in g.before)?.[1].before[n];
    const before = {};
    for (const n of names) before[n] = held(n) || rankOf(n);
    hg[label] = { before };
    await setRanks({ [LOW]: names });
    await saveHidden(hg);
    toast(`${label}: ${names.length} bases moved to D (untiered). Click it again to bring them back`);
    renderFilters();
  };
  const showGroup = async (label) => {
    const hg = hiddenGroups();
    const g = hg[label];
    if (!g) return;
    delete hg[label];
    // bases that are also in another hidden group stay hidden with it
    const stillHidden = new Set(Object.values(hg).flatMap((x) => Object.keys(x.before || {})));
    const byRank = {};
    for (const [n, r] of Object.entries(g.before || {})) if (!stillHidden.has(n)) (byRank[r] = byRank[r] || []).push(n);
    await setRanks(byRank);
    await saveHidden(hg);
    toast(`${label}: back with the ranks they had`);
    renderFilters();
  };
  const groupPanel = h('details', { class: 'panel bm-groups', open: FB.groupsOpen || null, ontoggle: (e) => { FB.groupsOpen = e.target.open; } },
    h('summary', {}, h('b', {}, 'Hide whole groups'), h('span', { class: 'small faint' }, ' Move all shields, a weapon type or the armour bases of one defence to D (untiered). Greyed out = hidden; click again to bring them back with their ranks.')),
    GROUP_SETS.map((set) => h('div', { class: 'bm-groupset' }, h('span', { class: 'small muted' }, set.title),
      h('div', { class: 'row', style: { gap: '5px' } }, set.items.map((it) => {
        const off = !!(S.settings.hiddenGroups || {})[it.label];
        return h('button', { class: 'sm bm-group' + (off ? ' off' : ''), 'aria-pressed': off ? 'true' : 'false',
          title: off ? `Hidden. Click to bring every ${it.label.toLowerCase()} base back with the rank it had` : `Every ${it.label.toLowerCase()} base to D (untiered)`,
          onclick: () => (off ? showGroup(it.label) : setWholeGroup(it.label, it.names())) }, it.label);
      })))));

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

  if (focus && FB.focusScrolled !== focus) {
    FB.focusScrolled = focus;
    setTimeout(() => {
      const el = document.querySelector('#page-filters .bm-cell.bm-focus');
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      el.classList.add('bm-pulse');
      setTimeout(() => el.classList.remove('bm-pulse'), 3200);
    }, 120);
  }
  // white and blue drops: FilterBlade shows them by item tier and rank like rares; one switch to keep them off
  const whiteBlueRow = (data.hasUnidTiers || data.unidTiers) ? (() => {
    const rar = data.unidRarity || ['Normal', 'Magic', 'Rare'];
    const cur = rar.includes('Normal') && rar.includes('Magic') ? 'all' : rar.includes('Magic') ? 'magic' : 'rares';
    const set = async (v) => {
      const want = v === 'all' ? null : v === 'magic' ? ['Magic', 'Rare'] : ['Rare'];
      const r = await call('ranks:kind', { unidRarity: want });
      S.settings.rankUnidRarity = r.unidRarity;
      toast(v === 'all' ? 'White and blue items show by rank again (FilterBlade)' : v === 'magic' ? 'White items no longer show by rank' : 'Only rares show by rank now; white and blue items are left to your filter');
      renderFilters();
    };
    const opt = (v, label, tip) => h('button', { class: cur === v ? 'on' : '', 'aria-pressed': cur === v ? 'true' : 'false', title: tip, onclick: () => cur !== v && set(v) }, label);
    return h('div', { class: 'row small', style: { gap: '10px' } },
      h('span', { class: 'muted' }, 'Ranked bases show as'),
      h('div', { class: 'fb-vis', role: 'group', 'aria-label': 'Which rarities your ranks show' },
        opt('rares', 'Rares only', 'White and blue items of your ranked bases aren\'t shown by rank; your filter decides (it hides most in maps)'),
        opt('magic', 'Rares and magic', 'No white items by rank'),
        opt('all', 'White, magic and rare', 'FilterBlade\'s way: every rarity shows by item tier and rank')),
      h('span', { class: 'faint' }, cur === 'all' ? 'S tier white bases show too.' : cur === 'magic' ? 'White bases are left to your filter.' : 'White and blue bases are left to your filter.'));
  })() : null;

  mount(body, h('div', { class: 'fb' },
    h('aside', {}, cats),
    h('div', {},
      h('div', { class: 'fb-typehead' }, h('span', { class: 'fb-iconbtn' }, window.UI.icon('eye', { size: 22 })), h('h2', {}, 'Base ranks'),
        h('span', { class: 'small muted' }, 'Every base has a rank, S best to D (untiered, the lowest). Left click a base for a rank up, right click for a rank down, or drag to paint with the brush.')),
      h('div', { class: 'panel bm-kinds' },
        h('div', { class: 'row', style: { gap: '8px' } }, h('b', {}, 'Lowest rank shown'), h('span', { class: 'small faint' }, 'For each kind of drop. "Rares: S only" and "Fractured: B and up" hide a B rank rare but show it fractured. Uniques are never touched.')),
        kindRows,
        unidRow,
        strandRow,
        h('div', { class: 'row small', style: { gap: '8px' } }, h('span', { class: 'muted' }, 'Looks:'), RANKS.map((r) => dressRank(h('span', { class: 'bm-cell sample' }, `Rank ${r}`), r)))),
      groupPanel,
      sectionTabs,
      h('div', { class: 'panel bm-tools' },
        h('div', { class: 'row', style: { gap: '10px' } }, part === 'gear' ? pick : null, rankToggle, h('span', { class: 'small muted' }, 'Brush:'), brushBar),
        whiteBlueRow,
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
          editing ? null : h('div', { class: 'fb-lookclip' },
            h('button', { class: 'quiet sm', onclick: () => { copyLook(data.style, 'My bases'); renderFilters(); } }, 'Copy look'),
            copiedLook() ? h('button', { class: 'quiet sm', title: `Give My bases the look of ${copiedLook().from}`, onclick: async () => { await call('bases:style', structuredClone(copiedLook().style)); toast(`My bases now have the look of ${copiedLook().from}`); renderFilters(); } }, 'Paste look') : null),
          h('button', { class: editing ? 'primary sm' : 'sm', onclick: () => { if (editing) FB.editing = null; else { FB.editing = 'mybases'; FB.draft = structuredClone(data.style); } renderFilters(); } }, editing ? 'Close' : 'Edit look')),
        editing ? lookEditor(look, () => renderFilters(), drawPreview, { name: 'My bases', onSave: (st) => call('bases:style', st), onReset: () => call('bases:style', null), resetLabel: 'Use the default look' }) : null),
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

// The price buttons (Check prices, Set category prices) only where items have a market price of their own:
// the Currency, Fragments and League mechanics groups, not gear bases.
const PRICED_GROUPS = new Set(['Currency', 'Fragments', 'League mechanics']);
function pricedGroup(type) {
  const cat = categoryOf(type);
  const group = baseCats().find(([, cats]) => cats.some((c) => c.id === cat?.id))?.[0];
  // divination cards have a market price of their own too (gems don't: their tiers go by level and quality)
  return PRICED_GROUPS.has(group) || cat?.id === 'divination';
}

// ---------------------------------------------------------------- sidebar
// Categories the way FilterBlade groups them. Each one holds one or more of the filter's own
// $type groups; anything not listed lands in Miscellaneous. `art` is the item whose in-game
// picture is the icon (loaded from GGG's image server via poe.ninja); `icon` is the fallback.
const CATEGORIES = [
  ['Currency', [
    { id: 'currency', name: 'Currency', match: ['currency', 'incubator'], order: ['currency', SCROLLS_KEY], art: 'Divine Orb', icon: 'coin' },
    { id: 'stacked', name: 'Stacked', match: ['currency->stackedthree', 'currency->stackedsix', 'currency->stackedsuppliesportal', 'currency->stackedsupplieswisdom', 'currency->stackedsupplieshigh', 'currency->stackedsupplieslow'], order: ['currency->stackedthree', 'currency->stackedsix', 'currency->stackedsuppliesportal', 'currency->stackedsupplieswisdom'], art: ['Chaos Orb'], icon: 'coins' },
  ]],
  ['Fragments', [
    { id: 'fragments', name: 'Fragments', match: ['fragments', 'fragments@threads', 'currency->splinter', 'currency->stackedsplintershigh', 'currency->stackedsplinterslow'], order: ['fragments@threads', 'fragments', 'currency->splinter', 'currency->splinter->simulacrum', 'currency->stackedsplintershigh', 'currency->stackedsplinterslow'], art: ['Fragment of Shape', '*Fragment'], icon: 'shard' },
  ]],
  ['Cards & gems', [
    { id: 'divination', name: 'Divination Cards', match: ['divination'], art: ['Stacked Deck', 'The Doctor'], icon: 'card' },
    { id: 'gems', name: 'Gems', match: ['gems'], order: ['gems->generic', 'gems->special', 'gems->exceptional'], art: "Gemcutter's Prism", icon: 'gem' },
  ]],
  ['Current league: Covens of Umbra', [
    { id: 'viscera', name: 'Viscera', match: ['viscera'], art: null, icon: 'skull' },
    { id: 'allflames', name: 'Allflame embers & map enchant currency', match: ['mapenchantments'], art: ['Allflame Ember of Kulemak'], icon: 'flame' },
    { id: 'fated', name: 'Fated items', match: ['rr#fated', 'rr->amuring#fated', 'rr->belts#fated', 'decorators->rareeg#fated', 'decorators->leveling->rare#fated'], order: ['rr#fated', 'rr->amuring#fated', 'rr->belts#fated', 'decorators->rareeg#fated', 'decorators->leveling->rare#fated'], art: null, icon: 'star' },
  ]],
  ['League mechanics', [
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
    { id: 'specialmaps', name: 'Special maps', match: ['maps->specialmods', 'maps->enchanted', 'maps->corruptedspecial', 'maps->corruptedimplicit', 'maps->implicitmod', 'maps->vaaltemple'], art: ['*Map16'], icon: 'map' },
    { id: 'mapitems', name: 'Other map items', match: ['exoticmap', 'charts', 'miscmapitems', 'miscmapitemsextra', 'maphiders'], art: ["Cartographer's Chisel", 'Orb of Horizons'], icon: 'book' },
  ]],
  ['Rare items', [
    { id: 'mybases', name: 'My bases', match: [], special: 'mybases', art: null, icon: 'hammer' },
    { id: 'basevis', name: 'Base ranks', match: [], special: 'matrix', art: 'Fracturing Orb', icon: 'eye' },
    { id: 'chancing', inTable: true, name: 'Chancing bases', match: ['chancing'], art: 'Orb of Chance', icon: 'ring' },
    { id: 'raretiers', inTable: true, name: 'Rares by base', match: ['rr'], art: 'Chaos Orb', icon: 'sword' },
    { id: 'rarelooks', name: 'Rare looks', match: [], special: 'rarelooks', art: 'Orb of Alchemy', icon: 'sparkle' },
    { id: 'talismans', name: 'Talismans', match: [], special: 'talismans', art: ['Flame Hellion Talisman'], icon: 'ring' },
    { id: 'unidgear', inTable: true, name: 'Unidentified & stranded gear', match: ['gear->tiered', 'gear->memorystrand'], art: 'Scroll of Wisdom', icon: 'sword' },
    { id: 'recipes', name: 'Vendor recipes', match: ['6l', 'socketslinks', 'endgamergb'], art: 'Chromatic Orb', icon: 'link' },
    { id: 'flasks', name: 'Flasks & tinctures', match: ['endgameflasks', 'endgametinctures', 'flasks'], art: "Glassblower's Bauble", icon: 'flask' },
    { id: 'highlight', inTable: true, name: 'Highlight specific bases', match: ['decorators'], art: 'Orb of Annulment', icon: 'sparkle' },
  ]],
  ['Jewels', [
    { id: 'jewels', name: 'Normal jewels', match: ['jewels', 'jewels->generic', 'jewels->special', 'jewels->leveling'], order: ['jewels->generic', 'jewels->special', 'jewels->leveling'], art: ['Cobalt Jewel', 'Crimson Jewel'], icon: 'hex' },
    { id: 'abyssjewels', name: 'Abyss jewels', match: ['jewels->abyss'], order: ['jewels->abyss', 'jewels->abyss#special', 'jewels->abyss#leveling'], art: ['Hypnotic Eye Jewel', 'Searching Eye Jewel'], icon: 'eye' },
    { id: 'clusterjewels', name: 'Cluster jewels', match: ['jewels->cluster', 'jewels->clustereco'], art: ['Large Cluster Jewel'], icon: 'hex', clusters: true },
    { id: 'clustergrid', name: 'Cluster jewels', match: [], special: 'clustergrid', art: ['Large Cluster Jewel'], icon: 'hex' },
  ]],
  ['Uniques & more', [
    { id: 'uniques', name: 'Unique items', match: ['uniques'], art: ['Headhunter', 'Mageblood', '*UniqueAccessory'], icon: 'crown' },
    { id: 'gold', name: 'Gold', match: ['gold'], art: null, icon: 'coins' },
  ]],
  ['Campaign (level 1-67)', [
    { id: 'leveling', name: 'Campaign & Leveling', match: ['leveling'], art: 'Scroll of Wisdom', icon: 'leaf' },
    { id: 'levelingcurrency', name: 'Levelling currency', match: ['currency->leveling', 'currency->levelingstacked'], art: ['Orb of Transmutation'], icon: 'leaf' },
    { id: 'campaignhide', name: 'Hide item types', match: [], special: 'campaignhide', art: 'Scroll of Wisdom', icon: 'eye' },
  ]],
  ['Miscellaneous', [
    { id: 'league', name: 'Earlier leagues: idols, coins, sulphur, ducats', match: ['event', 'currency->ducats', 'currency->deadmansulphur', 'currency->leagueexclusive'], art: null, icon: 'star' },
    { id: 'leaguespecific', name: 'League-specific items and mods', match: ['vials', 'enshrouded', 'artefact'], art: 'Vaal Orb', icon: 'bolt' },
    { id: 'quest', name: 'Quest items', match: ['questlike', 'questlikeexception', 'heisttarget'], art: null, icon: 'book' },
    { id: 'rares', name: 'Rares', match: ['rare', 'rareid', 'rareblendid', 'rareoptional', 'corruptedid', 'influenced', 'animatedweapons'], art: 'Orb of Alchemy', icon: 'sword' },
    { id: 'crafting', name: 'Crafting bases', match: ['crafting', 'normalcraft', 'gear', 'magicid'], art: 'Orb of Fusing', icon: 'hammer' },
    { id: 'special', name: 'Special bases', match: ['exoticbases', 'exoticbaseslower', 'exotic', 'exoticmods'], art: 'Fracturing Orb', icon: 'bolt' },
    { id: 'misc', name: 'Miscellaneous', match: [], art: 'Orb of Scouring', icon: 'box' },
  ]],
];

// Path of Exile 2: NeverSink's PoE2 filter has its own categories (pictures from PoE2's poe.ninja lists)
const CATEGORIES2 = [
  ['Currency', [
    { id: 'currency', name: 'Currency', match: ['currency'], art: 'Divine Orb', icon: 'coin' },
    { id: 'splinters', name: 'Splinters', match: ['currency->splinter'], icon: 'shard' },
    { id: 'fragments', name: 'Fragments & tablets', match: ['fragments'], icon: 'shard' },
    { id: 'sockets', name: 'Runes, soul cores & idols', match: ['sockets'], icon: 'gem' },
    { id: 'xeno', name: 'Alloys, fluxes & wombgifts', match: ['xenotiering', 'legacytemp'], icon: 'star' },
    { id: 'verisium', name: 'Verisium', match: ['verisium'], icon: 'rock' },
  ]],
  ['League mechanics', [
    { id: 'delirium', name: 'Distilled emotions', match: ['currency->emotions'], icon: 'orb' },
    { id: 'breach', name: 'Catalysts', match: ['currency->catalysts'], icon: 'bolt' },
    { id: 'essence', name: 'Essences', match: ['currency->essence'], icon: 'flame' },
    { id: 'ritual', name: 'Omens', match: ['currency->omen'], icon: 'eye' },
    { id: 'relics', name: 'Relics', match: ['relics'], icon: 'key' },
  ]],
  ['Gems', [
    { id: 'gems', name: 'Gems', match: ['gems'], order: ['gems->uncut', 'gems->lineage', 'gems'], icon: 'gem' },
  ]],
  ['Waystones', [
    { id: 'waystones', name: 'Waystones', match: ['waystones', 'waystone'], icon: 'map' },
    { id: 'mapitems', name: 'Keys & other map items', match: ['miscmapitemsextra', 'maplike'], icon: 'key' },
  ]],
  ['Rare items', [
    { id: 'raretiers', name: 'Rares by base', match: ['rr', 'ut->rare'], icon: 'sword' },
    { id: 'magic', name: 'Magic by base', match: ['ut->magic'], icon: 'sparkle' },
    { id: 'crafting', name: 'Crafting bases', match: ['endgame->normalcraft', 'endgame->jewellery', 'endgame->salvagable', 'rare->salvagable'], icon: 'hammer' },
    { id: 'special', name: 'Special bases', match: ['exoticbases', 'exotic', 'exoticmods', 'chancing'], icon: 'bolt' },
    { id: 'highlight', name: 'Highlight rares', match: ['decorators'], icon: 'sparkle' },
    { id: 'hiders', name: 'Hiding rules', match: ['hidelayer', 'conditionalhide', 'lowstrictnessshowlayer', 'endgame->conditionalhiders', 'waystone->hiders'], icon: 'eye' },
  ]],
  ['Jewels, flasks & charms', [
    { id: 'jewels', name: 'Jewels', match: ['jewels'], icon: 'hex' },
    { id: 'flasks', name: 'Flasks', match: ['endgame->flasks'], icon: 'flask' },
    { id: 'charms', name: 'Charms', match: ['endgame->charms'], icon: 'flask' },
  ]],
  ['Uniques & more', [
    { id: 'uniques', name: 'Unique items', match: ['uniques'], icon: 'crown' },
    { id: 'gold', name: 'Gold', match: ['gold'], icon: 'coins' },
  ]],
  ['Campaign', [
    { id: 'leveling', name: 'Campaign & Leveling', match: ['leveling'], icon: 'leaf' },
    { id: 'levelingcurrency', name: 'Levelling currency', match: ['currency->leveling'], icon: 'leaf' },
  ]],
  ['Miscellaneous', [
    { id: 'quest', name: 'Quest items', match: ['questlikeexception', 'questlike'], icon: 'book' },
    { id: 'misc', name: 'Miscellaneous', match: [], icon: 'box' },
  ]],
];
const isP2 = () => S.settings?.game === 'poe2';
const baseCats = () => (isP2() ? CATEGORIES2 : CATEGORIES);

// ---- your own layout on top of the defaults (Edit categories) ----
// categoryLayout = { names: {catId: name}, assign: {type: catId}, custom: [{id, name, section}], order: {section: [catId]} }
const layout = () => S.settings.categoryLayout || {};
/** Sections with your names, your new categories and your order applied. */
function effectiveCategories() {
  const L = layout();
  return baseCats().map(([title, cats]) => {
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
  // a page split off a category ("divination#stacks") lives with that category unless you moved it
  if (type.includes('#') && assign[type]) { const c = cats.find((x) => x.id === assign[type]); if (c) return c; }
  // a split page a category names itself ("rr#fated" under Fated items)
  if (type.includes('#')) { const c = cats.find((x) => x.match.includes(type)); if (c) return c; }
  type = type.split('#')[0];
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
// stackedsupplies high/low (Transmutes, Augmentations): folded into Small stacks when the filter is written
const HIDDEN_TYPES = new Set(['jewels->clustereco', 'jewels->cluster', 'exotic->fractured', 'currency->stackedsupplieshigh', 'currency->stackedsupplieslow']); // fractured and unid item tiers: Base ranks decides those
// scarabs leave the game, so their pages aren't listed (the filter's own scarab rules stay as FilterBlade wrote them)
const GONE = (key) => /^(fragments->scarabs|scarabs)(->|#|@|$)/.test(String(key));
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
const artNames = () => [...new Set((isP2() ? baseCats().flatMap(([, cats]) => cats) : ALL_CATS).flatMap((c) => [].concat(c.art || [])))];
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
  viscera: 'skull', mapenchantments: 'flame', leveling: 'leaf', hidelayer: 'eyeoff', decorators: 'eye', questlike: 'book', logbook: 'book', expedition: 'book', sanctum: 'book', runesgrafts: 'sparkle', corpses: 'skull',
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
const SIDE_MINI = 66;
function closeFlyout() { document.querySelectorAll('.fb-fly').forEach((m) => { m._off?.(); m.remove(); }); }
function withResizer(nav) {
  closeFlyout();
  const mini = !!S.settings.fbSideMini;
  document.documentElement.classList.toggle('fb-mini', mini);
  if (mini) { document.documentElement.style.setProperty('--fb-side', `${SIDE_MINI}px`); return h('div', { class: 'fb-side-wrap' }, nav); }
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
    FB.type = type; FB.matrixFocus = null; FB.focusPlaced = FB.focusScrolled = null; FB.selected.clear(); FB.editing = null; FB.search = '';
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
    const catHits = view.types.filter((t) => !t.inMerge && !GONE(t.key) && t.label.toLowerCase().includes(q));
    const baseHits = [];
    for (const t of view.types) if (!t.merged && !t.baseView && !GONE(t.key)) for (const tier of t.tiers) for (const b of tier.bases) if (b.toLowerCase().includes(q)) baseHits.push({ b, t, tier });
    return withResizer(h('nav', { class: 'fb-cats', 'data-keep-scroll': 'cats', 'aria-label': 'Categories' }, searchBox(),
      catHits.length ? h('div', { class: 'fb-sec' }, h('div', { class: 'fb-sec-h' }, 'Categories'), catHits.slice(0, 15).map((t) => row(t))) : null,
      h('div', { class: 'fb-sec' }, h('div', { class: 'fb-sec-h' }, `Bases (${baseHits.length})`),
        h('div', { class: 'fb-gresults' }, baseHits.slice(0, 40).map(({ b, t, tier }) => h('button', { onclick: () => { FB.type = t.key; FB.search = b; FB.catQuery = ''; FB.selected.clear(); renderFilters(); } }, h('span', { class: 'b', title: `${t.label}, ${tierName(tier)}` }, b), h('span', { class: 'w' }, tierName(tier).replace(/ \(.*\)$/, '')), h('span', { class: 'cat' }, t.label)))),
        !baseHits.length ? h('div', { class: 'small faint', style: { padding: '4px 8px' } }, 'Not in this filter. Uniques are listed by base type, for example Heavy Belt instead of Mageblood.') : null)));
  }

  // FilterBlade-style categories, each holding the filter's own subcategories
  const byCat = new Map();
  for (const t of view.types) {
    if (t.inMerge || HIDDEN_TYPES.has(t.key) || GONE(t.key)) continue;
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
  const mini = !!S.settings.fbSideMini;

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
    const open = !single && !mini && (FB.openGroups.has(cat.id) || (cat.id === activeCat && !FB.closedGroups.has(cat.id)));
    const changed = list.some((t) => (t.realTypes || [t.type]).some((x) => changedTypes.has(x)));
    const active = (single || mini) ? (single ? list[0].key === FB.type : cat.id === activeCat) : false;
    // folded list: a click opens the subcategory you were on, else the first one
    const pick = () => select((list.find((t) => t.key === FB.type) || list[0]).key);
    // folded list: a category with subcategories opens a small menu of them next to its icon
    const flyout = (btn) => {
      closeFlyout();
      const r = btn.getBoundingClientRect();
      const menu = h('div', { class: 'fb-fly', role: 'menu', 'aria-label': cat.name },
        h('div', { class: 'fb-fly-h' }, cat.name),
        list.map((t) => row(t, { sub: true, label: subLabel(t, cat) })));
      menu.style.left = `${Math.round(r.right + 8)}px`;
      menu.style.top = `${Math.round(r.top)}px`;
      document.body.appendChild(menu);
      // keep it on screen
      const mr = menu.getBoundingClientRect();
      if (mr.bottom > window.innerHeight - 8) menu.style.top = `${Math.max(8, window.innerHeight - 8 - mr.height)}px`;
      menu.addEventListener('click', (e) => { if (e.target.closest('.fb-row-main')) closeFlyout(); });
      setTimeout(() => {
        const away = (e) => { if (!menu.contains(e.target) && e.target !== btn) closeFlyout(); };
        const esc = (e) => { if (e.key === 'Escape') { closeFlyout(); btn.focus(); } };
        document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
        menu._off = () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
      });
      menu.querySelector('.fb-row-main')?.focus();
    };
    const toggleOpen = () => { if (open) { FB.openGroups.delete(cat.id); FB.closedGroups.add(cat.id); } else { FB.openGroups.add(cat.id); FB.closedGroups.delete(cat.id); } renderFilters(); };
    return h('div', { class: 'fb-cat' + (open ? ' open' : '') + (single ? ' single' : '') + (cat.id === activeCat ? ' current' : '') },
      h('div', { class: 'fb-cat-bar' + (active ? ' active' : '') },
        h('button', { class: 'fb-cat-main', title: cat.name, 'aria-expanded': single ? null : open ? 'true' : 'false', onclick: (e) => (single ? pick() : mini ? flyout(e.currentTarget) : toggleOpen()) },
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

  const rareLooksRow = (cat) => h('div', { class: 'fb-cat' + (FB.type === RARE_LOOKS ? ' current' : '') },
    h('div', { class: 'fb-cat-bar' + (FB.type === RARE_LOOKS ? ' active' : '') },
      h('button', { class: 'fb-cat-main', title: cat.name, onclick: () => select(RARE_LOOKS) },
        h('span', { class: 'fb-cat-ic' }, window.UI.icon(catIconId(cat), { size: 26, fallback: cat.icon })),
        h('span', { class: 'n' }, cat.name))));

  const talismanRow = (cat) => h('div', { class: 'fb-cat' + (FB.type === TALISMANS ? ' current' : '') },
    h('div', { class: 'fb-cat-bar' + (FB.type === TALISMANS ? ' active' : '') },
      h('button', { class: 'fb-cat-main', title: cat.name, onclick: () => select(TALISMANS) },
        h('span', { class: 'fb-cat-ic' }, window.UI.icon(catIconId(cat), { size: 26, fallback: cat.icon })),
        h('span', { class: 'n' }, cat.name),
        h('span', { class: 'c small faint' }, String(Object.keys(S.settings.talismans || {}).length || '')))));

  const campaignRow = (cat) => h('div', { class: 'fb-cat' + (FB.type === CAMPAIGN_HIDE ? ' current' : '') },
    h('div', { class: 'fb-cat-bar' + (FB.type === CAMPAIGN_HIDE ? ' active' : '') },
      h('button', { class: 'fb-cat-main', title: cat.name, onclick: () => select(CAMPAIGN_HIDE) },
        h('span', { class: 'fb-cat-ic' }, window.UI.icon(catIconId(cat), { size: 26, fallback: cat.icon })),
        h('span', { class: 'n' }, cat.name),
        h('span', { class: 'c small faint' }, String((S.settings.campaignHide?.classes || []).length || '')))));

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

  const pinned = pins.filter((p) => !GONE(p)).map((p) => view.types.find((t) => t.key === p)).filter(Boolean);
  const miniBtn = h('button', { class: 'fb-mini-toggle', title: mini ? 'Show the category names' : 'Fold the list down to its icons', 'aria-label': mini ? 'Show the category names' : 'Fold the list down to its icons', 'aria-pressed': mini ? 'true' : 'false',
    onclick: async () => { S.settings.fbSideMini = !mini; FB.editCats = false; await call('settings:set', { fbSideMini: !mini }).catch(() => {}); renderFilters(); } }, mini ? '»' : '«');
  if (mini) {
    return withResizer(h('nav', { class: 'fb-cats fb-cats-v2 mini', 'data-keep-scroll': 'cats', 'aria-label': 'Categories' }, miniBtn,
      sections.map(([title, cats]) => {
        // categories Base ranks and Rare looks cover aren't listed (Rares by base, Unidentified & stranded gear,
        // Chancing bases, Highlight specific bases): their bases come from Base ranks, their looks from Rare looks
        const present = cats.filter((c) => (byCat.has(c.id) || c.special) && !c.inTable);
        if (!present.length) return null;
        return h('div', { class: 'fb-sec', title }, h('div', { class: 'fb-sec-title' }),
          h('div', { class: 'fb-sec-body' }, present.map((c) => (c.special === 'mybases' ? myBasesRow(c) : c.special === 'matrix' ? matrixRow(c) : c.special === 'clustergrid' ? clusterRow(c) : c.special === 'campaignhide' ? campaignRow(c) : c.special === 'rarelooks' ? rareLooksRow(c) : c.special === 'talismans' ? talismanRow(c) : catRow(c, byCat.get(c.id))))));
      })));
  }
  return withResizer(h('nav', { class: 'fb-cats fb-cats-v2' + (editing ? ' edit' : ''), 'data-keep-scroll': 'cats', 'aria-label': 'Categories' }, h('div', { class: 'fb-search-row' }, searchBox(), miniBtn), editBar,
    editing ? h('p', { class: 'small muted', style: { margin: 0 } }, 'Rename categories, reorder them, add your own, and drag subcategories between them. This only changes how the list is organised, not your filter.') : null,
    !editing && pinned.length ? h('div', { class: 'fb-sec pinned' }, h('div', { class: 'fb-sec-title' }, 'Pinned'), h('div', { class: 'fb-sec-body' }, pinned.map((t) => row(t)))) : null,
    sections.map(([title, cats]) => {
      const present = editing ? cats : cats.filter((c) => (byCat.has(c.id) || c.special) && !c.inTable);
      if (!present.length) return null;
      return h('div', { class: 'fb-sec' }, h('div', { class: 'fb-sec-title' }, title),
        h('div', { class: 'fb-sec-body' }, present.map((c, i) => (editing ? editRow(c, byCat.get(c.id) || [], title, i, present.length) : c.special === 'mybases' ? myBasesRow(c) : c.special === 'matrix' ? matrixRow(c) : c.special === 'clustergrid' ? clusterRow(c) : c.special === 'campaignhide' ? campaignRow(c) : c.special === 'rarelooks' ? rareLooksRow(c) : c.special === 'talismans' ? talismanRow(c) : catRow(c, byCat.get(c.id))))),
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
// ---------------------------------------------------------------- copy and paste a look
// One look on a clipboard of its own (colours, size, sound, beam, icon), kept between sessions.
const LOOK_KEY = 'poehelper.copiedLook';
function copiedLook() {
  try { return JSON.parse(localStorage.getItem(LOOK_KEY) || 'null') || FB.lookClip || null; } catch { return FB.lookClip || null; }
}
function copyLook(style, from) {
  FB.lookClip = { style: structuredClone(style || {}), from };
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(FB.lookClip)); } catch { /* the copy still works this session */ }
  toast(`Copied the look of ${from}. Paste it on any tier with Paste look.`);
}
async function pasteLook(t) {
  const clip = copiedLook();
  if (!clip) return;
  await call('tiers:style', { key: t.key, style: structuredClone(clip.style) });
  toast(`${tierName(t)} now has the look of ${clip.from}`);
  renderFilters();
}

// what FilterBlade's filters use each of the game's alert sounds for
const GAME_SOUND_USE = { 1: 'high value: Tier 2 currency, top gems', 2: 'good value: currency, cards, jewels', 3: 'uniques and special items', 4: 'maps up to tier 10', 5: 'maps tier 11 and up', 6: 'Tier 1: Divine and better' };
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
  // a new sound (or volume) is saved straight away, with the look as it is in the editor: no Done, no Save look
  const saveSound = async (msg) => {
    try {
      if (!d.text) d.text = [200, 200, 200, 255];
      if (opts.onSave) await opts.onSave(d); else await call('tiers:style', { key: tier.key, style: d });
      toast(msg || `Saved the sound of ${opts.name || tierName(tier)}`);
    } catch (err) { toast(err.message, true); }
  };
  const soundSel = h('select', { 'aria-label': 'Drop sound', onchange: (e) => {
    const v = e.target.value;
    delete d.customSound; delete d.customVolume; delete d.sound; delete d.keepSound;
    if (v === 'keep') d.keepSound = true;
    else if (v === 'own' && ownCustom) d.customSound = ownCustom;
    else if (v.startsWith('game:')) d.sound = { id: Number(v.slice(5)), volume: Number(vol.value) || 300 };
    else if (v !== 'none') d.customSound = window.UI.soundPath(v);
    playSound(v);
    changed();
    FB.soundOpen = null;
    saveSound();
    redraw();
  } },
  ownCustom ? h('option', { value: 'own', selected: current === 'own' }, `Filter's sound (${ownCustom})`) : null,
  h('option', { value: 'keep', selected: current === 'none' && !!d.keepSound }, 'The filter\'s own sound (FilterBlade)'),
  h('option', { value: 'none', selected: current === 'none' && !d.keepSound }, 'No sound'),
  h('optgroup', { label: 'PoE Helper tinks' }, S.sounds.filter((s) => !s.user).map((s) => h('option', { value: s.id, selected: current === s.id }, `${s.name}, ${s.note}`))),
  S.sounds.some((s) => s.user) ? h('optgroup', { label: 'Your sounds' }, S.sounds.filter((s) => s.user).map((s) => h('option', { value: s.id, selected: current === s.id }, s.name))) : null,
  h('optgroup', { label: 'Game sounds (heard in game only)' }, Array.from({ length: 16 }, (_, i) => h('option', { value: `game:${i + 1}`, selected: current === `game:${i + 1}` }, `Game sound ${i + 1}${GAME_SOUND_USE[i + 1] ? ` (FilterBlade: ${GAME_SOUND_USE[i + 1]})` : ''}`))));
  const vol = h('input', { type: 'range', min: 0, max: 300, value: d.sound?.volume ?? d.customVolume ?? 300, style: { width: '100px' }, 'aria-label': 'Volume', oninput: (e) => { if (d.sound) d.sound.volume = +e.target.value; else if (d.customSound) d.customVolume = +e.target.value; },
    onchange: () => { if (d.sound || d.customSound) saveSound(`Volume saved: ${vol.value}`); } });

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
    if (v.startsWith('game:')) return `Game sound ${v.slice(5)}${GAME_SOUND_USE[v.slice(5)] ? ` (${GAME_SOUND_USE[v.slice(5)]})` : ''}`;
    return S.sounds.find((x) => x.id === v)?.name || v;
  })();
  const soundOpen = FB.soundOpen === tier.key;
  const soundBox = h('div', { class: 'fb-ed-sound' },
    h('div', { class: 'fb-ed-row' }, h('span', {}, 'Sound'),
      h('b', { class: 'small' }, soundName), window.UI.soundButton(window.UI.normalizeStyle(d).sound),
      h('button', { class: 'quiet sm', 'aria-expanded': soundOpen ? 'true' : 'false', onclick: () => { FB.soundOpen = soundOpen ? null : tier.key; redraw(); } }, soundOpen ? 'Close' : 'Change')),
    soundOpen ? h('div', { class: 'stack', style: { gap: '8px', marginTop: '8px' } },
      h('div', { class: 'fb-ed-row' }, h('span', {}, ''), soundSel),
      h('div', { class: 'fb-ed-row' }, h('span', {}, 'Volume'), vol),
      h('div', { class: 'fb-ed-row' }, h('span', {}, ''), window.UI.soundDropZone((snd) => {
        S.sounds = [...S.sounds.filter((x) => x.id !== snd.id), snd];
        delete d.sound; delete d.customVolume;
        d.customSound = window.UI.soundPath(snd.id);
        playSound(snd.id);
        FB.soundOpen = null;
        saveSound(`Saved your sound ${snd.name || ''} on ${opts.name || tierName(tier)}`);
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
      h('button', { class: 'quiet', title: 'Copy this look (as it is in the editor now) to paste on another tier', onclick: () => copyLook(d, opts.name || tierName(tier)) }, 'Copy look'),
      copiedLook() ? h('button', { class: 'quiet', title: `Put the look of ${copiedLook().from} in the editor; Save look keeps it`, onclick: () => {
        for (const k of Object.keys(d)) delete d[k];
        Object.assign(d, structuredClone(copiedLook().style));
        redraw(); toast(`The look of ${copiedLook().from} is in the editor. Press Save look to keep it.`);
      } }, `Paste look of ${copiedLook().from}`) : null,
      h('button', { class: 'quiet', onclick: async () => { if (opts.onReset) await opts.onReset(); else await call('tiers:style', { key: tier.key, style: null }); FB.editing = null; toast(opts.onReset ? 'Back to the default look' : 'Back to the FilterBlade look'); renderFilters(); } }, opts.resetLabel || 'Use the FilterBlade look')));
}

// ---------------------------------------------------------------- price review (auto-tiering)
const MARGINS = [[1, 'At the exact price boundary'], [1.5, 'Only clearly misplaced items (1.5× past the boundary)'], [2, 'Very conservative (2× past the boundary)']];
const selKey = (type, base) => `${type}\t${base}`;

/** Every price move in every category at once (same rules as Price review). Undo it on Price review. */
/** "Update prices": a popup with what would move at today's prices, category by category, and Apply. */
async function openPriceUpdate() {
  FB.reviewModal = true;
  if (!FB.review && !FB.reviewBusy) {
    FB.reviewBusy = true; renderFilters();
    try { await runReview(); } catch { /* toast */ }
    FB.reviewBusy = false;
  }
  renderFilters();
}
function priceUpdateModal() {
  const close = () => { FB.reviewModal = false; renderFilters(); };
  if (!window.fbModalKey) { window.fbModalKey = true; document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && FB.reviewModal) { FB.reviewModal = false; renderFilters(); } }); }
  const inner = h('div', { class: 'fb-modal-body' });
  renderReview(inner, { popup: true });
  return h('div', { class: 'fb-modal', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'fb-modal-in', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Update prices' },
      h('div', { class: 'fb-modal-head' }, h('h2', {}, 'Update prices'), h('span', { class: 'small faint' }, 'What would move at today\'s poe.ninja prices. Pick a category to see only its changes.'), h('span', { class: 'spacer' }),
        h('button', { class: 'quiet sm', disabled: FB.reviewBusy, onclick: async () => { FB.reviewBusy = true; renderFilters(); try { await runReview(); } catch { /* toast */ } FB.reviewBusy = false; renderFilters(); } }, window.UI.icon('refresh', { size: 14 }), 'Check again'),
        h('button', { class: 'quiet sm', 'aria-label': 'Close', onclick: close }, '✕')),
      inner));
}

/** What the last price update moved (yours or the automatic one), once: a short list you can undo or dismiss. */
async function fillMoved(box) {
  let log = [];
  try { log = await call('review:log'); } catch { return; }
  const last = log?.[0];
  let seen = 0;
  try { seen = Number(localStorage.getItem('priceLogSeen')) || 0; } catch { /* no storage */ }
  if (!last?.moves?.length || last.at <= seen) return mount(box);
  const tierNo = (t) => { const m = /(\d+)/.exec(String(t || '')); return m ? Number(m[1]) : 99; };
  const moves = [...last.moves].sort((a, b) => (b.chaos || 0) - (a.chaos || 0));
  const LIMIT = 8;
  let all = false;
  const draw = () => mount(box, h('div', { class: 'fb-moved-card' },
    h('div', { class: 'fb-moved-head' },
      window.UI.icon('refresh', { size: 16 }),
      h('b', {}, `${last.auto ? 'Automatic price update' : 'Price update'}: ${moves.length} ${moves.length === 1 ? 'item' : 'items'} moved`),
      h('span', { class: 'small faint' }, ago(Date.now() - last.at)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'quiet sm', title: 'Put every item back where it was', onclick: async () => { try { const r = await call('review:undo'); toast(`Put back ${r.undone} items`); } catch { /* toast */ } try { localStorage.setItem('priceLogSeen', String(Date.now())); } catch { /* none */ } renderFilters(); } }, 'Undo'),
      h('button', { class: 'quiet sm', 'aria-label': 'Dismiss', title: 'Got it', onclick: () => { try { localStorage.setItem('priceLogSeen', String(last.at)); } catch { /* none */ } mount(box); } }, '✕')),
    h('div', { class: 'fb-moved-list' }, (all ? moves : moves.slice(0, LIMIT)).map((m) => {
      const CJ = { top: ['S tier', 1], good: ['A tier', 2], basic: ['basic look', 3], hide: ['hidden', 5] };
      const cj = m.type === 'cluster';
      const up = cj ? (CJ[m.to]?.[1] ?? 4) < (CJ[m.from]?.[1] ?? 4) : m.from && tierNo(m.to) < tierNo(m.from);
      const hide = cj ? m.to === 'hide' : /hide/i.test(String(m.to));
      const nm = (t) => (cj ? CJ[t]?.[0] || 'size rule' : t ? tierName({ tier: t }) : 'new');
      return h('div', { class: 'fb-moved-row' },
        window.UI.itemPic(cj ? m.base.split(':')[0] : m.base, { size: 20 }),
        h('span', { class: 'n' }, m.base),
        h('span', { class: 'small muted' }, nm(m.from), ' → ', h('b', {}, hide ? 'hidden' : nm(m.to))),
        h('span', { class: `fb-moved-dir ${hide ? 'down' : up ? 'up' : 'down'}`, 'aria-label': up ? 'worth more' : 'worth less' }, hide ? '▼' : up ? '▲' : '▼'),
        m.chaos != null ? h('span', { class: 'small faint r' }, fmtC(m.chaos)) : h('span'));
    })),
    moves.length > LIMIT && !all ? h('button', { class: 'quiet sm', onclick: () => { all = true; draw(); } }, `Show all ${moves.length}`) : null));
  draw();
}

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
      for (const c of r.categories) if (!FB.review.categories.some((x) => x.type === c.type)) FB.review.categories.push(c);
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

async function renderReview(body, { only = null, popup = false } = {}) {
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
    (() => {
      const ca = S.settings.clusterAuto || {};
      return h('div', { class: 'row small' },
        toggle(!!ca.on, async (v) => { try { const r = await call('cluster:auto', { on: v }); S.settings.clusterAuto = r.auto; toast(v ? 'Cluster jewels are re-tiered every hour' : 'Cluster jewels: your filter decides again'); } catch (e) { toast(e.message, true); } renderFilters(); },
          `Auto-update cluster jewels: S tier from ${ca.top || '1 div'}, A tier from ${ca.good || '20c'}${ca.basic !== '' ? `, basic look from ${ca.basic || '5c'}` : ''}${ca.hide !== false ? ', cheaper ones hidden' : ''}`),
        h('span', { class: 'spacer' }),
        h('button', { class: 'quiet sm', onclick: () => { window.showInFilter({ special: 'clustergrid' }); renderFilters(); } }, 'Change'));
    })(),
    last ? h('div', { class: 'row small', style: { borderTop: '1px solid var(--line-soft)', paddingTop: '10px' } },
      h('span', { class: 'muted', style: { flex: 1 } }, `Last run ${ago(Date.now() - last.at)}${last.auto ? ' (automatic)' : ''}: moved ${last.moves.length} ${last.moves.length === 1 ? 'item' : 'items'}${last.moves.length ? ', for example ' + last.moves.slice(0, 3).map((m) => m.base).join(', ') : ''}.`),
      h('button', { class: 'sm', onclick: async () => { const r = await call('review:undo'); toast(`Put back ${r.undone} items`); FB.prices = {}; if (FB.review) await runReview(); renderFilters(); } }, 'Undo last run')) : null);

  if (only && (FB.reviewBusy || !FB.review?.categories?.some((c) => c.type === only))) {
    return mount(body, h('div', { class: 'panel empty' }, h('span', { class: 'spin' }), ' Checking poe.ninja prices for this category…'));
  }
  if (FB.reviewBusy) {
    mount(body, popup ? null : head, h('div', { class: 'panel empty', style: { marginTop: '14px' } }, h('span', { class: 'spin' }), ' Checking poe.ninja prices for every category. The first check takes a few seconds; after that prices come from the cache.'));
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

  // on a category's own page: just that category's prices table and moves
  if (only) {
    const c = r.categories.find((x) => x.type === only);
    if (!c) return mount(body, h('div', { class: 'panel small muted' }, 'poe.ninja has no prices for this category, so it can\'t be tiered by price.'));
    FB.reviewOpen.add(only); FB.reviewOpen.delete('!' + only);
    const mine = c.moves.filter((m) => FB.reviewSel.has(selKey(c.type, m.base)));
    return mount(body, categoryCard(c), mine.length ? h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: async () => {
        const res = await call('review:apply', mine.map((m) => ({ type: c.type, base: m.base, from: m.from, to: m.to, chaos: m.chaos })));
        toast(`Moved ${res.count} items. Zone or reload the filter in game.`);
        FB.prices = {};
        await runReview([c.type]);
        renderFilters();
      } }, `Apply ${mine.length} ${mine.length === 1 ? 'move' : 'moves'}`)) : null);
  }
  // one category at a time: a chip per category with changes; "All" shows them all
  if (FB.reviewCat && !r.categories.some((c) => c.type === FB.reviewCat && c.moves.length)) FB.reviewCat = null;
  const withMoves = r.categories.filter((c) => c.moves.length).sort((a, b) => b.moves.length - a.moves.length);
  const chips = withMoves.length > 1 ? h('div', { class: 'rv-cats', role: 'tablist', 'aria-label': 'Category' },
    h('button', { role: 'tab', class: 'rv-cat' + (!FB.reviewCat ? ' on' : ''), 'aria-selected': !FB.reviewCat ? 'true' : 'false', onclick: () => { FB.reviewCat = null; renderFilters(); } }, 'All', h('span', { class: 'n' }, String(total))),
    withMoves.map((c) => h('button', { role: 'tab', class: 'rv-cat' + (FB.reviewCat === c.type ? ' on' : ''), 'aria-selected': FB.reviewCat === c.type ? 'true' : 'false', onclick: () => { FB.reviewCat = c.type; FB.reviewOpen.add(c.type); FB.reviewOpen.delete('!' + c.type); renderFilters(); } }, catIcon(c.type), c.label, h('span', { class: 'n' }, String(c.moves.length))))) : null;
  const shownCats = FB.reviewCat ? r.categories.filter((c) => c.type === FB.reviewCat) : r.categories;
  const cards = shownCats.map((c) => categoryCard(c));
  const selectedHere = FB.reviewCat ? selected.filter((m) => m.type === FB.reviewCat) : selected;
  const catLabel = FB.reviewCat ? r.categories.find((c) => c.type === FB.reviewCat)?.label : null;
  const bar = h('div', { class: 'fb-selbar' }, selectedHere.length ? h('div', { class: 'fb-selbar-in' },
    h('b', {}, catLabel ? `${selectedHere.length} ${selectedHere.length === 1 ? 'move' : 'moves'} selected in ${catLabel}` : `${selected.length} of ${total} moves selected`),
    h('span', { class: 'spacer' }),
    h('button', { class: 'quiet', onclick: () => { FB.reviewSel.clear(); renderFilters(); } }, 'Select none'),
    h('button', { class: 'primary', onclick: async () => {
      const res = await call('review:apply', selectedHere.map(({ type, base, from, to, chaos }) => ({ type, base, from, to, chaos })));
      toast(`Moved ${res.count} items. Your "(helper)" filter is updated; zone or reload it in game.`);
      FB.prices = {};
      await runReview();
      renderFilters();
    } }, `Apply ${selectedHere.length} ${selectedHere.length === 1 ? 'move' : 'moves'}`)) : null);

  mount(body, popup ? null : head, summary, chips, h('div', { class: 'stack', style: { marginTop: '14px', gap: '10px', paddingBottom: '80px' } }, cards), bar);

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
// the other game: another filter, so nothing picked or priced carries over
window.resetFilterPage = () => { artRequested = false; FB.type = null; FB.prices = {}; FB.selected.clear(); FB.search = ''; FB.strictPreview = null; FB.unlisted = null; FB.goto = null; };
// from the price check: open the tier an item is in, with the item picked and the tier in view
window.showInFilter = (g) => {
  FB.tab = 'tiers';
  FB.revealNav = true;
  // PoE Helper's own pages (My bases, Base ranks, Cluster jewels, Campaign)
  const special = { mybases: MY_BASES, basematrix: BASE_MATRIX, clustergrid: CLUSTER_GRID, campaignhide: CAMPAIGN_HIDE, rarelooks: RARE_LOOKS, talismans: TALISMANS }[g.special];
  if (special) { FB.goto = null; FB.type = special; FB.matrixFocus = special === BASE_MATRIX && g.base ? g.base : null; FB.cjFocus = special === CLUSTER_GRID ? g.cluster || null : null; return; }
  // the cluster jewel rules aren't shown as tiers: their price table instead
  if (/^jewels->cluster/.test(g.type || '')) { FB.goto = null; FB.type = CLUSTER_GRID; FB.cjFocus = null; return; }
  FB.goto = { type: g.type, key: g.key || `${g.type}|${g.tier}`, base: g.base };
};


// a loot filter file from anywhere: copied into the filter folder and picked
async function importFilterFile(done) {
  try {
    const r = await call('filter:importFile');
    if (!r) return;
    toast(`Imported "${r.name.replace(/\.filter$/i, '')}" and picked it as your filter.`);
    done();
  } catch { /* toast */ }
}
window.importFilterFile = importFilterFile;

// ---------- Chat: tell the app what to change ----------
// Set phrases always work; with Claude Code installed (your own Claude subscription) anything you type does.
const FC = { open: false, log: [], busy: false, state: null, el: null, fab: null };
// a speech bubble
function chatIcon(size = 16) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="currentColor"/><circle cx="8" cy="11" r="1.5" fill="var(--surface,#1e2027)"/><circle cx="12" cy="11" r="1.5" fill="var(--surface,#1e2027)"/><circle cx="16" cy="11" r="1.5" fill="var(--surface,#1e2027)"/>';
  return svg;
}
// the round chat button in the corner of the Loot filter page
function drawChatFab() {
  if (!FC.fab) { FC.fab = h('button', { class: 'fchat-fab', 'aria-label': 'Open the filter chat', title: 'Filter chat: tell the app what to change', onclick: () => toggleChat(true) }, chatIcon(26)); document.body.append(FC.fab); }
  const page = document.getElementById('page-filters');
  FC.fab.hidden = FC.open || !(page && page.offsetParent);
}
setInterval(() => { try { drawChatFab(); } catch { /* not ready */ } }, 700);
async function toggleChat(force) {
  FC.open = force ?? !FC.open;
  if (FC.open && !FC.state) FC.state = await call('filter:chatState').catch(() => ({ claude: false, on: false }));
  drawChat();
}
function drawChat() {
  if (!FC.el) { FC.el = h('div', { class: 'fchat', role: 'dialog', 'aria-label': 'Loot filter chat' }); document.body.append(FC.el); }
  FC.el.hidden = !FC.open;
  drawChatFab();
  if (!FC.open) return;
  const st = FC.state || {};
  const input = h('textarea', { rows: 2, placeholder: st.claude && st.on ? 'Separate Stacked Decks into a new tier…' : 'e.g. Separate Stacked Decks into a new tier', 'aria-label': 'What to change',
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  const send = async () => {
    const text = input.value.trim();
    if (!text || FC.busy) return;
    FC.log.push({ me: true, text });
    FC.busy = true; drawChat();
    try {
      const r = await call('filter:chat', text);
      FC.log.push({ text: r.reply, via: r.via, looks: r.looks || null });
      if (r.via === 'claude') FC.state = await call('filter:chatState').catch(() => FC.state);
      if (r.changed) { FB.type = FB.type || null; renderFilters(); }
    } catch (e) { FC.log.push({ text: e.message || 'That didn\'t work.' }); }
    FC.busy = false; drawChat();
    setTimeout(() => FC.el.querySelector('textarea')?.focus(), 0);
  };
  const list = h('div', { class: 'fchat-log', 'aria-live': 'polite' },
    FC.log.length ? FC.log.map((m) => h('div', { class: 'fchat-msg' + (m.me ? ' me' : '') }, m.text,
      // how it drops: the label as in game, each place it's tiered (single and stacks)
      m.looks?.length ? h('div', { class: 'fchat-looks' }, m.looks.slice(0, 12).map((l) => h('div', { class: 'fchat-look' },
        dropLabel(l.base, l.style || {}, { rarity: rarityFor(l.type), game: true, scale: 0.8, hidden: !l.shown }),
        h('span', { class: 'small muted' }, `${l.shown ? '' : '− hidden · '}${l.where}`),
        // what the label alone doesn't show: beam, map icon, sound
        (() => {
          const st = l.style || {};
          const bits = [st.beam?.color ? `${st.beam.color.toLowerCase()} beam` : null, st.icon ? `${['big', 'medium', 'small'][st.icon.size] || ''} ${String(st.icon.color || '').toLowerCase()} ${String(st.icon.shape || '').toLowerCase()} icon`.trim() : null,
            st.sound?.id ? `sound ${st.sound.id}` : st.customSound ? 'your own sound' : null, st.fontSize ? `size ${st.fontSize}` : null].filter(Boolean);
          return bits.length ? h('span', { class: 'small faint' }, bits.join(' · ')) : null;
        })()))) : null)) :
      h('div', { class: 'fchat-msg' }, 'Tell me what to change in this filter. Type "help" for what I know.'),
    FC.busy ? h('div', { class: 'fchat-msg faint' }, 'Working…') : null,
    // not installed or not signed in: what to do, with buttons
    (!st.claude || st.signedIn === false) && window.claudeHelp ? window.claudeHelp(st, async (recheck, test) => {
      if (test) { const t = await call('filter:chatTest').catch((e) => ({ ok: false, text: e.message })); FC.log.push({ text: t.ok ? '✓ Claude answers. Type anything.' : `✕ ${t.text}` }); }
      FC.state = await call('filter:chatState', { recheck: !!recheck }); drawChat();
    }) : null);
  mount(FC.el,
    h('div', { class: 'fchat-head' }, h('b', {}, 'Filter chat'),
      h('span', { class: 'small muted', title: st.claude ? 'Free text goes to Claude Code on this PC, signed in with your own Claude subscription. Set phrases run without it.' : 'Install Claude Code and sign in with your Claude subscription to type anything; set phrases work without it.' },
        st.claude ? (!st.on ? 'Claude off' : st.signedIn === false ? 'Claude not signed in: set phrases only' : 'Using your Claude') : 'Set phrases only (Claude Code not found)'),
      st.claude ? null : h('button', { class: 'quiet sm', title: 'Look for Claude Code again (after installing it)', onclick: async () => { FC.state = await call('filter:chatState', { recheck: true }); drawChat(); } }, 'Check again'),
      st.claude ? h('button', { class: 'quiet sm', onclick: async () => { await call('settings:set', { chatAi: !st.on }); FC.state = await call('filter:chatState'); drawChat(); } }, st.on ? 'Turn Claude off' : 'Use Claude') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'quiet sm', 'aria-label': 'Close the chat', onclick: () => toggleChat(false) }, '×')),
    list,
    h('div', { class: 'fchat-in' }, input, h('button', { class: 'primary sm', disabled: FC.busy, onclick: send }, 'Send')));
  list.scrollTop = list.scrollHeight;
  if (!FC.busy) setTimeout(() => FC.el.querySelector('textarea')?.focus(), 0);
}
})();
