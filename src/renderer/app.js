'use strict';
const { h, mount, fmt, chaosDiv, ago, rarityClass, toast, call, dropLabel, soundButton, playSound } = window.UI;

const S = { settings: {}, league: '', divine: null, usage: null, history: [], sounds: [] };
const $ = (id) => document.getElementById(id);

// ---------------- navigation ----------------
const pages = { dashboard: renderOverview, price: renderPrice, networth: renderNetworth, filters: renderFilters, designer: renderDesigner, settings: renderSettings };
let currentPage = 'dashboard';

$('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-page]');
  if (b) go(b.dataset.page);
});

// a new version finished downloading: say so once, with a restart button
window.poe.on('update:status', (u) => {
  if (u?.state !== 'ready' || document.querySelector('.update-banner')) return;
  const bar = h('div', { class: 'update-banner', role: 'status' },
    h('span', {}, `PoE Helper ${u.latest} is ready.`),
    h('button', { class: 'primary sm', onclick: () => call('update:install') }, 'Restart to update'),
    h('button', { class: 'quiet sm', onclick: () => bar.remove() }, 'Later'));
  document.body.append(bar);
});

function go(page) {
  currentPage = page;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${page}`));
  pages[page]().catch((e) => console.error(e));
}

async function refreshState() {
  Object.assign(S, await call('state:get'));
  if (!S.sounds.length) S.sounds = await call('sounds:list').catch(() => []);
  window.UI.setGameSounds(S.settings.gameSoundFiles || {});
  if (!S.iconsLoaded) { S.userIcons = await call('icons:list').catch(() => []); UI.setUserIcons(S.userIcons); S.iconsLoaded = true; }
  const u = S.usage?.ggg?.today;
  mount($('sideFoot'),
    h('div', {}, h('span', { class: 'league-chip' }, S.league), S.settings.leagueOverride ? '' : h('span', { class: 'faint' }, ' (auto)')),
    h('div', {}, `${u?.total ?? 0} of ${S.usage?.ggg?.dailyBudget ?? '–'} GGG requests today`),
    versionLine());
  if (!S.ver) {
    S.ver = await call('app:version').catch(() => null);
    if (S.ver) {
      mount($('sideFoot').lastChild, versionLine());
      // just updated: point at the patch notes once
      if (S.ver.justUpdated && !S.ver.notesShown) whatsNewBanner();
    }
  }
}

// ---------------- version and patch notes ----------------
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
function versionLine() {
  const v = S.ver;
  return h('button', { class: 'version-line', title: 'Read the patch notes', onclick: () => openNotes() },
    h('span', {}, `Version ${v?.version || S.settings.version}`),
    v?.releasedAt ? h('span', { class: 'faint' }, ` · released ${fmtDate(v.releasedAt)}`) : null,
    v?.updatedAt ? h('div', { class: 'faint' }, v.updatedFrom ? `Updated from ${v.updatedFrom} on ${fmtDate(v.updatedAt)}` : `Installed ${fmtDate(v.updatedAt)}`) : null);
}
function openNotes() {
  go('settings');
  // the settings page builds asynchronously; scroll once the notes are there
  let tries = 0;
  const jump = () => { const n = document.getElementById('patch-notes'); if (n) n.scrollIntoView({ block: 'start', behavior: 'smooth' }); else if (tries++ < 20) setTimeout(jump, 100); };
  setTimeout(jump, 50);
  call('app:notesSeen').catch(() => {});
  document.querySelector('.whatsnew-banner')?.remove();
}
function whatsNewBanner() {
  const bar = h('div', { class: 'update-banner whatsnew-banner', role: 'status' },
    h('span', {}, `Updated to ${S.ver.version}.`),
    h('button', { class: 'primary sm', onclick: () => openNotes() }, "See what's new"),
    h('button', { class: 'quiet sm', onclick: () => { call('app:notesSeen').catch(() => {}); bar.remove(); } }, 'Close'));
  document.body.append(bar);
}
/** Tiny, safe markdown: "- " bullets, **bold**, `code`. Built from DOM nodes, never innerHTML. */
function mdInline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] != null ? h('b', {}, m[1]) : h('code', {}, m[2]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function mdBlock(md) {
  const nodes = [];
  let list = null;
  for (const line of String(md || '').split('\n')) {
    const t = line.trim();
    if (!t) { list = null; continue; }
    if (/^[-*] /.test(t)) {
      if (!list) { list = h('ul', { class: 'notes-list' }); nodes.push(list); }
      list.append(h('li', {}, mdInline(t.slice(2))));
    } else { list = null; nodes.push(h('p', {}, mdInline(t))); }
  }
  return nodes;
}
function notesSection(entries) {
  const open = new Set([entries[0]?.version]);
  return section('Patch notes', 'What changed in each version. The newest is on top.',
    h('div', { class: 'panel stack notes', id: 'patch-notes' },
      entries.length ? entries.map((e, i) => h('details', { open: open.has(e.version) || null, class: 'notes-entry' },
        h('summary', {}, h('b', {}, `Version ${e.version}`), e.date ? h('span', { class: 'faint' }, ` · ${fmtDate(e.date)}`) : null, e.version === S.ver?.version ? h('span', { class: 'pill', style: { marginLeft: '8px' } }, 'yours') : null),
        h('div', { class: 'notes-body' }, mdBlock(e.notes)))) : h('p', { class: 'small muted' }, 'No patch notes in this copy.')));
}

// ---------------- shared bits ----------------
function pageHead(title, desc, ...right) {
  return h('div', { class: 'page-head' }, h('div', { class: 'stack', style: { gap: '4px' } }, h('h1', {}, title), desc ? h('p', {}, desc) : null), h('span', { class: 'spacer' }), ...right);
}
function section(title, desc, ...content) {
  return h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, title), desc ? h('p', {}, desc) : null), ...content);
}
function sectionWith(title, desc, right, ...content) {
  return h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, title), desc ? h('p', {}, desc) : null, h('span', { class: 'spacer' }), right), ...content);
}
function figure(value, label, cls) {
  return h('div', { class: 'figure' }, h('div', { class: 'v ' + (cls || '') }, value), h('div', { class: 'l' }, label));
}
function toggle(checked, onchange, label) {
  const sw = h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked), 'aria-label': label || 'Toggle' }), h('i'));
  return label ? h('label', { class: 'check' }, sw, h('span', {}, label)) : sw;
}
function itemName(name, rarityCls) {
  return h('span', { class: `item-name ${rarityCls || ''}` }, name);
}

/** Sound picker with grouped options and a play button that follows the selection. */
function soundPicker(value, onchange) {
  const slot = h('span');
  const sel = h('select', { 'aria-label': 'Drop sound', onchange: (e) => { update(); onchange(e.target.value); playSound(e.target.value); } },
    h('option', { value: 'none', selected: !value || value === 'none' }, 'No sound'),
    h('optgroup', { label: 'PoE Helper tinks (play here and in game)' }, S.sounds.filter((s) => !s.user).map((s) => h('option', { value: s.id, selected: value === s.id }, s.name))),
    S.sounds.some((s) => s.user) ? h('optgroup', { label: 'Your sounds' }, S.sounds.filter((s) => s.user).map((s) => h('option', { value: s.id, selected: value === s.id }, s.name))) : null,
    h('optgroup', { label: 'Built-in game sounds (in game only)' }, Array.from({ length: 16 }, (_, i) => h('option', { value: `game:${i + 1}`, selected: value === `game:${i + 1}` }, `Game sound ${i + 1}`))));
  function update() { mount(slot, sel.value.startsWith('game:') || sel.value === 'none' ? null : soundButton(sel.value)); }
  update();
  return h('span', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } }, sel, slot);
}

function soundToStyle(choice) {
  if (!choice || choice === 'none') return {};
  if (choice.startsWith('game:')) return { sound: { id: Number(choice.slice(5)), volume: 300 } };
  return { customSound: UI.soundPath(choice) };
}
function styleSound(style = {}) {
  const id = UI.soundIdFromPath(style.customSound);
  if (id) return id;
  if (style.sound?.id) return `game:${style.sound.id}`;
  return 'none';
}

const CLASS_RARITY = { 'divination cards': 'Divination Card', 'stackable currency': 'Currency', 'skill gems': 'Gem', 'support gems': 'Gem' };
function ruleRarity(rule) {
  const r = (rule.conditions || []).find((c) => c.keyword === 'Rarity');
  if (r) return r.values[0];
  const c = (rule.conditions || []).find((x) => x.keyword === 'Class');
  return c ? CLASS_RARITY[String(c.values[0]).toLowerCase()] : (rule.conditions || []).some((x) => x.keyword === 'BaseType') ? 'Currency' : 'Normal';
}
function exampleName(rule) {
  const b = (rule.conditions || []).find((c) => c.keyword === 'BaseType');
  if (b?.values?.length) return b.values[0];
  const c = (rule.conditions || []).find((x) => x.keyword === 'Class');
  if (c?.values?.length) return c.values[0];
  return rule.label && !/^(Show|Hide) items$/.test(rule.label) ? rule.label : 'Example item';
}
const OP_WORDS = { '>=': 'at least', '<=': 'up to', '>': 'above', '<': 'below', '==': '', '=': '', '!=': 'not' };
function describe(rule) {
  const parts = [];
  const lvMin = (rule.conditions || []).find((c) => c.keyword === 'ItemLevel' && c.op === '>=')?.values[0];
  const lvMax = (rule.conditions || []).find((c) => c.keyword === 'ItemLevel' && c.op === '<=')?.values[0];
  let lvDone = false;
  for (const c of rule.conditions || []) {
    if (c.keyword === 'ItemLevel' && lvMin && lvMax) {
      if (!lvDone) parts.push(`item level ${lvMin} to ${lvMax}`);
      lvDone = true;
      continue;
    }
    const v = c.values || [];
    const list = v.length > 3 ? `${v.slice(0, 3).join(', ')} and ${v.length - 3} more` : v.join(', ');
    const op = OP_WORDS[c.op] ?? '';
    switch (c.keyword) {
      case 'Class': parts.push(h('span', {}, h('b', {}, list))); break;
      case 'BaseType': parts.push(h('span', {}, v.length > 1 ? `${v.length} bases: ` : 'base ', h('b', {}, list))); break;
      case 'Rarity': parts.push(v.length > 1 ? `${v.slice(0, -1).join(', ').toLowerCase()} or ${v[v.length - 1].toLowerCase()}` : `rarity ${op ? op + ' ' : ''}${v[0]}`); break;
      case 'ItemLevel': parts.push(`item level ${op} ${v[0]}`); break;
      case 'Rarity': break;
      case 'LinkedSockets': parts.push(`${op} ${v[0]} links`); break;
      case 'StackSize': parts.push(`stacks of ${op} ${v[0]}`); break;
      default: parts.push(`${c.keyword} ${c.op || ''} ${list}`.trim());
    }
  }
  if (!parts.length) return h('span', { class: 'muted' }, 'Every item');
  return h('span', {}, parts.flatMap((p, i) => (i ? [', ', p] : [p])));
}

// ---------------- overview ----------------
function renderOverview() { return window.UI.keepScroll(() => renderOverviewNow()); }
async function renderOverviewNow() {
  await refreshState();
  const el = $('page-dashboard');
  const g = S.usage.ggg;
  const n = S.usage.ninja;
  let report = null;
  try { report = await call('networth:report', 24 * 3600 * 1000); } catch { /* none yet */ }
  const latest = report?.latest;

  mount(el,
    pageHead('Overview', `Playing ${S.league}${S.divine ? `. A Divine Orb is worth ${fmt(S.divine)} chaos right now.` : '.'}`),
    h('div', { class: 'panel' }, h('div', { class: 'figures' },
      figure(latest ? chaosDiv(latest.totalChaos, latest.divine) : 'No snapshot', latest ? `Net worth, updated ${ago(Date.now() - latest.ts)}` : 'Net worth: take a snapshot on the Net worth page'),
      figure(report?.perHourChaos != null ? `${report.perHourChaos >= 0 ? '+' : ''}${fmt(report.perHourChaos)}c` : '–', 'Per hour over the last day', report?.perHourChaos >= 0 ? 'good' : report?.perHourChaos < 0 ? 'bad' : ''),
      figure(`${g.today.total} of ${g.dailyBudget}`, 'GGG requests used today'))),
    h('div', { class: 'cols', style: { marginTop: '28px', alignItems: 'start' } },
      h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Recent price checks'), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, `${window.Hotkey ? window.Hotkey.label(S.settings.hotkeyPrice) : S.settings.hotkeyPrice} over an item`)),
        historyList(S.history.slice(0, 10))),
      h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Requests today')),
        h('div', { class: 'panel stack' },
          h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, (100 * g.today.total) / g.dailyBudget) + '%' } })),
          Object.keys(g.today.byKey || {}).length
            ? h('table', {}, h('tbody', {}, Object.entries(g.today.byKey).map(([k, v]) => h('tr', {}, h('td', {}, { stash: 'Stash tabs', 'trade-search': 'Trade searches', 'trade-fetch': 'Trade listings', 'trade-data': 'Trade mod list' }[k] || k), h('td', { class: 'r' }, v)))))
            : h('p', { class: 'small muted' }, 'None yet. Price checks only use poe.ninja, so they never count here.'),
          h('p', { class: 'small faint' }, `poe.ninja this session: ${n.requests} downloads, ${n.notModified} unchanged, ${n.cacheHits} answered from cache.`)),
        h('details', { style: { marginTop: '12px' } }, h('summary', {}, 'How requests are kept low'),
          h('ul', { class: 'small muted', style: { margin: '8px 0 0', paddingLeft: '18px', lineHeight: 1.7 } },
            h('li', {}, `Prices are cached for ${S.settings.ninjaTtlMin} minutes and only re-downloaded when they changed.`),
            h('li', {}, 'A price check loads only the price list it needs, for example just divination cards.'),
            h('li', {}, 'Trade searches run only when you press Search.'),
            h('li', {}, 'Snapshots fetch only the tabs you pick, and pause while you are not playing.'),
            h('li', {}, `GGG limits are followed at ${Math.round(S.settings.rateSafety * 100)}% of the allowed rate, with a daily cap.`))))));
}

function historyList(rows) {
  if (!rows.length) return h('div', { class: 'panel empty' }, 'Hover an item in game and press the hotkey. Checks show up here.');
  return h('div', { class: 'panel', style: { padding: '6px 18px' } }, h('table', {}, h('tbody', {}, rows.map((r, i) => h('tr', {},
    h('td', { style: i === 0 ? { borderTop: 0 } : null }, itemName(r.name, { divination: 'r-Divination', currency: 'r-Currency', gem: 'r-Gem', unique: 'r-Unique', 'unique-map': 'r-Unique', rare: 'r-Rare', magic: 'r-Magic' }[r.kind] || 'r-Normal')),
    h('td', { class: 'r', style: i === 0 ? { borderTop: 0 } : null }, r.total && r.total !== r.chaos ? h('span', {}, chaosDiv(r.total, S.divine), h('span', { class: 'faint' }, ` (${chaosDiv(r.chaos, S.divine)} each)`)) : chaosDiv(r.chaos, S.divine)),
    h('td', { class: 'r faint small', style: i === 0 ? { borderTop: 0 } : null }, ago(Date.now() - r.at)))))));
}

// ---------------- price check (manual) ----------------
function renderPrice() { return window.UI.keepScroll(() => renderPriceNow()); }
async function renderPriceNow() {
  await refreshState();
  const el = $('page-price');
  const ta = h('textarea', { placeholder: 'Paste an item you copied in game with Ctrl+C', 'aria-label': 'Item text' });
  const out = h('div');
  const run = async () => {
    mount(out, h('div', { class: 'panel', style: { marginTop: '16px' } }, h('span', { class: 'spin' }), ' Pricing'));
    try {
      const r = await call('price:text', ta.value);
      if (r.error) return mount(out, h('div', { class: 'panel muted', style: { marginTop: '16px' } }, r.error));
      r.text = ta.value;
      mount(out, priceResult(r));
      refreshState();
    } catch { mount(out); }
  };
  mount(el,
    pageHead('Price check', 'In game the overlay does this for you. Paste an item here to test or look something up later.'),
    h('div', { class: 'panel stack' }, ta, h('div', { class: 'row' }, h('button', { class: 'primary', onclick: run }, 'Check price'), h('span', { class: 'small faint' }, 'Uses cached poe.ninja prices.'))),
    out,
    section('History', null, historyList(S.history)));
}

function priceResult(r) {
  const { item, price, map, filterHit } = r;
  const hidden = filterHit?.action === 'Hide';
  const tradeBox = h('div', { class: 'panel', style: { marginTop: '12px', display: 'none' } });
  const tradeBtn = r.tradeable ? h('button', { class: 'primary', onclick: () => { tradeBox.style.display = ''; tradeBtn.remove(); window.TradePanel.mount(tradeBox, { text: r.text, divine: price?.divine }); } }, 'Search trade') : null;
  return h('div', { style: { marginTop: '16px' } },
    h('div', { class: 'ground stage' },
      dropLabel(item.typeLine !== item.name && item.rarity === 'Unique' ? item.name : item.name || item.typeLine, filterHit?.style, { rarity: item.rarity, hidden }),
      filterHit ? h('div', { class: 'row', style: { gap: '8px' } }, soundButton(window.UI.normalizeStyle(filterHit.style).sound), h('span', { class: 'small', style: { color: '#a9ad9c' } }, hidden ? 'Your filter hides this item' : 'How your filter shows it')) : h('span', { class: 'small', style: { color: '#a9ad9c' } }, 'Pick a filter on the Loot filter page to see how it looks')),
    h('div', { class: 'panel', style: { marginTop: '12px' } },
      h('div', { class: 'figures' },
        figure(price?.found ? chaosDiv(price.chaos, price.divine) : r.kind === 'rare' ? 'Use trade search' : 'Not listed', price?.found ? `Each, ${({ high: 'plenty of listings', medium: 'some listings', low: 'few listings, be careful', range: 'variants differ' })[price.confidence] || ''}` : 'poe.ninja has no price for this'),
        price?.stackSize > 1 ? figure(chaosDiv(price.totalChaos, price.divine), `For your stack of ${price.stackSize}`) : null,
        filterHit?.line ? figure(`Line ${filterHit.line}`, 'Filter rule that applies') : null),
      map ? h('div', { style: { marginTop: '14px' } }, h('h2', {}, map.verdict === 'skip' ? 'Map: skip or reroll' : map.verdict === 'careful' ? 'Map: be careful' : 'Map: looks fine'),
        map.hits.map((x) => h('div', { class: `small sev-${x.severity}` }, `${x.label}: `, h('span', { class: 'muted' }, x.mod)))) : null,
      tradeBtn ? h('div', { class: 'row', style: { marginTop: '14px' } }, tradeBtn, h('span', { class: 'small faint' }, 'Pick mods and min/max values, then search instant buyout listings.')) : null,
      price?.matches?.length > 1 ? h('table', { style: { marginTop: '16px' } },
        h('thead', {}, h('tr', {}, h('th', {}, 'Close matches on poe.ninja'), h('th', { class: 'r' }, 'Listings'), h('th', { class: 'r' }, 'Price'))),
        h('tbody', {}, price.matches.map((m) => h('tr', {}, h('td', {}, [m.name, m.variant, m.links && `${m.links}-link`, m.gemLevel && `level ${m.gemLevel}/${m.gemQuality || 0}%`, m.corrupted && 'corrupted', m.levelRequired && `ilvl ${m.levelRequired}+`].filter(Boolean).join(', ')), h('td', { class: 'r muted' }, m.listingCount ?? ''), h('td', { class: 'r' }, chaosDiv(m.chaos, price.divine)))))) : null),
    tradeBox);
}

// ---------------- net worth ----------------
let nwWindow = 24 * 3600 * 1000;
let nwTabs = null;

function renderNetworth() { return window.UI.keepScroll(() => renderNetworthNow()); }
async function renderNetworthNow() {
  await refreshState();
  const el = $('page-networth');
  const st = S.settings;
  const ready = st.accountName && st.sessionSet;
  let report = null;
  try { report = await call('networth:report', nwWindow); } catch { /* none */ }
  const selected = new Set(st.selectedTabs || []);
  const latest = report?.latest;

  const tabsBox = !nwTabs
    ? h('p', { class: 'small muted' }, ready ? 'Load your tab list, then tick the tabs to track. Loading costs 1 request and is remembered for 6 hours.' : 'Add your account name and POESESSID in Settings first.')
    : h('div', { class: 'tabs-pick' }, nwTabs.filter((t) => !t.hidden).map((t) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: selected.has(t.index), onchange: (e) => { e.target.checked ? selected.add(t.index) : selected.delete(t.index); } }),
      t.colour ? h('span', { class: 'swatch', style: { background: '#' + t.colour } }) : null, t.name)));

  const snapBtn = h('button', { class: 'primary', disabled: !ready || !selected.size, onclick: async () => {
    snapBtn.disabled = true;
    snapBtn.textContent = 'Taking snapshot';
    try { await call('networth:snapshot'); toast('Snapshot taken'); } catch { /* toast */ }
    renderNetworth();
  } }, `Take snapshot (${selected.size} ${selected.size === 1 ? 'request' : 'requests'})`);

  const perHourReq = st.autoSnapshotMin ? Math.round((60 / Math.max(15, st.autoSnapshotMin)) * selected.size * 10) / 10 : 0;
  const rowsOf = (obj) => h('table', {}, h('tbody', {}, Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).map(([k, v], i) => h('tr', {}, h('td', { style: i ? null : { borderTop: 0 } }, k.replace(/([a-z])([A-Z])/g, '$1 $2')), h('td', { class: 'r', style: i ? null : { borderTop: 0 } }, chaosDiv(v, latest?.divine))))));

  mount(el,
    pageHead('Net worth', `What your tracked tabs are worth in ${S.league}.`,
      h('select', { 'aria-label': 'Time range', onchange: (e) => { nwWindow = Number(e.target.value); renderNetworth(); } },
        [[6, 'Last 6 hours'], [24, 'Last 24 hours'], [168, 'Last 7 days'], [24 * 365, 'Whole league']].map(([hr, l]) => h('option', { value: hr * 3600000, selected: nwWindow === hr * 3600000 }, l)))),
    h('div', { class: 'panel' },
      h('div', { class: 'figures' },
        figure(latest ? chaosDiv(latest.totalChaos, latest.divine) : 'No snapshot yet', latest ? `${fmt(latest.totalChaos)} chaos, ${ago(Date.now() - latest.ts)}` : 'Pick tabs below and take one'),
        figure(report?.gainChaos != null ? `${report.gainChaos >= 0 ? '+' : ''}${chaosDiv(report.gainChaos, latest?.divine)}` : '–', report?.hours ? `Change over ${fmt(report.hours)} hours` : 'Change', report?.gainChaos > 0 ? 'good' : report?.gainChaos < 0 ? 'bad' : ''),
        figure(report?.perHourChaos != null ? `${fmt(report.perHourChaos)}c` : '–', 'Per hour')),
      h('div', { style: { marginTop: '14px' } }, window.lineChart((report?.series || []).filter((p) => p.ts >= (latest?.ts || 0) - nwWindow), { divine: latest?.divine }))),
    h('div', { class: 'cols', style: { marginTop: '28px', alignItems: 'start' } },
      h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Tracked tabs'), h('span', { class: 'spacer' }),
          h('button', { class: 'quiet sm', disabled: !ready, onclick: async () => { nwTabs = await call('networth:tabs', !!nwTabs); renderNetworth(); } }, nwTabs ? 'Reload tab list' : 'Load tab list')),
        h('div', { class: 'panel stack' },
          tabsBox,
          h('div', { class: 'row' },
            nwTabs ? h('button', { onclick: async () => { await call('networth:select', [...selected]); toast(`Tracking ${selected.size} tabs`); renderNetworth(); } }, 'Save selection') : null,
            h('span', { class: 'spacer' }), snapBtn),
          h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'Automatic snapshots'),
            h('select', { onchange: async (e) => { await call('settings:set', { autoSnapshotMin: Number(e.target.value) }); renderNetworth(); } },
              [0, 15, 30, 60, 120].map((m) => h('option', { value: m, selected: Number(st.autoSnapshotMin) === m }, m ? `Every ${m} minutes` : 'Off'))),
            st.autoSnapshotMin ? h('span', { class: 'faint' }, `About ${perHourReq} requests an hour while you play`) : null))),
      h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Where it is')),
        h('div', { class: 'panel' }, latest ? h('div', { class: 'cols' }, rowsOf(latest.byTab), rowsOf(latest.byCategory)) : h('p', { class: 'small muted' }, 'Shows up after your first snapshot.')))),
    h('div', { class: 'cols', style: { marginTop: '28px', alignItems: 'start' } },
      h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Most valuable')),
        h('div', { class: 'panel' }, latest ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'r' }, 'Amount'), h('th', { class: 'r' }, 'Value'))),
          h('tbody', {}, latest.items.slice(0, 20).map((i) => h('tr', {}, h('td', {}, i.n), h('td', { class: 'r muted' }, i.q), h('td', { class: 'r' }, chaosDiv(i.q * i.e, latest.divine)))))) : h('p', { class: 'small muted' }, 'Shows up after your first snapshot.'))),
      h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'What changed'), h('span', { class: 'spacer' }),
          h('button', { class: 'danger sm', onclick: async () => { if (confirm(`Delete all snapshots for ${S.league}?`)) { await call('networth:clear'); renderNetworth(); } } }, 'Delete history')),
        h('div', { class: 'panel' }, report?.diff?.length ? h('table', {}, h('tbody', {}, report.diff.map((d, i) => h('tr', {}, h('td', { style: i ? null : { borderTop: 0 } }, d.name), h('td', { class: 'r muted', style: i ? null : { borderTop: 0 } }, `${d.deltaQty > 0 ? '+' : ''}${d.deltaQty}`), h('td', { class: 'r ' + (d.deltaChaos >= 0 ? 'good' : 'bad'), style: i ? null : { borderTop: 0 } }, `${d.deltaChaos > 0 ? '+' : ''}${fmt(d.deltaChaos)}c`))))) : h('p', { class: 'small muted' }, 'Needs two snapshots in the selected time range.')))));
}

// ---------------- loot filter ----------------
let ecoRules = null;

/** The original filter sections, now shown inside tabs of the FilterBlade-style page (filters.js). */
async function renderFilterExtras(el, which) {
  const info = await call('filter:list');
  const overrides = await call('filter:overrides');
  const st = S.settings;
  const eco = st.economy || { enabled: false, thresholds: {} };
  const loadTiersLater = eco.enabled && !ecoRules;

  // Saving a rule also rewrites your filter copy right away, like tier changes do.
  const save = async (list) => {
    await call('filter:saveOverrides', list);
    if (info.base) await call('filter:write').catch(() => {});
  };
  let editing = null;
  const writeNow = async () => {
    try {
      const p = await call('filter:write');
      toast(`Written to ${p.split(/[\\/]/).pop()}. Zone or reload the filter in game.`);
      renderFilters();
    } catch { /* toast */ }
  };

  // --- filter file ---
  const helperName = info.base ? info.base.replace(/\.filter$/i, ' (helper).filter') : null;
  const fileBox = h('div', { class: 'panel stack' },
    h('div', { class: 'row' },
      h('select', { 'aria-label': 'Base filter', onchange: async (e) => { await call('settings:set', { baseFilter: e.target.value }); renderFilters(); } },
        h('option', { value: '' }, 'Choose your filter'),
        info.files.map((f) => h('option', { value: f.name, selected: f.name === info.base }, f.name.replace(/\.filter$/i, '')))),
      h('span', { class: 'small muted' }, !info.files.length ? 'No .filter files found in the folder below.' : info.base ? (info.lastWrite ? `Written to "${helperName}" ${ago(Date.now() - info.lastWrite.at)}.` : `Will be written to "${helperName}".`) : 'Pick the filter you normally use.'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: writeNow, disabled: !info.base }, 'Write filter')),
    h('div', { class: 'row' },
      toggle(st.autoWatchFilter, (v) => call('settings:set', { autoWatchFilter: v }), 'Rewrite automatically when you download a new version of the filter')),
    (() => {
      const dirInput = h('input', { value: st.filterDir || info.dir || '', style: { flex: 1, minWidth: '300px' }, 'aria-label': 'Filter folder' });
      return h('details', {}, h('summary', {}, `Filter folder: ${info.dir || 'not found'}`),
        h('div', { class: 'row', style: { marginTop: '8px' } }, dirInput, h('button', { onclick: async () => { await call('settings:set', { filterDir: dirInput.value.trim() }); renderFilters(); } }, 'Use this folder')));
    })());

  // --- rules on the ground ---
  const rulesBox = h('div', { class: 'ground rules' });
  const drawRules = async () => {
    if (!overrides.length) return mount(rulesBox, h('div', { class: 'empty', style: { color: '#a9ad9c' } }, 'No rules yet. Make one below, or press Hide or Highlight in the price check overlay.'));
    const code = await Promise.all(overrides.map((r) => call('filter:render', r)));
    mount(rulesBox, overrides.map((r, i) => h('div', { class: 'rule' + (r.enabled === false ? ' off' : '') },
      h('div', { class: 'row', style: { gap: '10px', flexWrap: 'nowrap', minWidth: 0 } }, dropLabel(exampleName(r), r.style, { rarity: ruleRarity(r), scale: 0.85, hidden: r.action === 'Hide' }), soundButton(styleSound(r.style))),
      h('div', { class: 'what' }, h('div', {}, r.action === 'Hide' ? 'Hides ' : 'Shows ', describe(r)), h('div', { class: 'small', style: { color: '#7d8272' } }, r.label)),
      h('div', { class: 'tools' },
        toggle(r.enabled !== false, async (v) => { r.enabled = v; await save(overrides); drawRules(); }),
        h('button', { class: 'quiet', disabled: i === 0, title: 'Move up', 'aria-label': 'Move up', onclick: async () => { [overrides[i - 1], overrides[i]] = [overrides[i], overrides[i - 1]]; await save(overrides); drawRules(); } }, '↑'),
        h('button', { class: 'quiet', disabled: i === overrides.length - 1, title: 'Move down', 'aria-label': 'Move down', onclick: async () => { [overrides[i + 1], overrides[i]] = [overrides[i], overrides[i + 1]]; await save(overrides); drawRules(); } }, '↓'),
        h('button', { class: editing === r.id ? 'primary sm' : 'sm', onclick: () => { editing = editing === r.id ? null : r.id; drawRules(); } }, editing === r.id ? 'Close' : 'Edit'),
        h('button', { class: 'danger sm', onclick: async () => { overrides.splice(i, 1); await save(overrides); drawRules(); } }, 'Delete')),
      editing === r.id
        ? h('div', { class: 'rule-edit' }, ruleForm(r, { saveLabel: 'Save changes', onCancel: () => { editing = null; drawRules(); }, onSave: async (upd) => { overrides[i] = { ...upd, id: r.id, enabled: r.enabled }; await save(overrides); editing = null; toast(`Saved "${upd.label}"`); drawRules(); } }))
        : h('details', {}, h('summary', { style: { color: '#7d8272' } }, 'Filter code'), h('pre', { class: 'code' }, code[i])))));
  };
  drawRules();

  // --- new rule ---
  const newRule = ruleForm(null, { saveLabel: 'Add rule', onSave: async (rule) => { overrides.unshift(rule); await save(overrides); toast(`Added "${rule.label}"`); renderFilters(); } });

  // --- value tiers ---
  const th = { top: 100, high: 20, mid: 5, hideDivBelow: 0, unit: 'chaos', ...(eco.thresholds || {}) };
  let unit = th.unit === 'divine' ? 'divine' : 'chaos';
  const tierSounds = { top: 'divine-tink', high: 'chime', mid: 'soft-bell', multi: 'coin', ...(th.sounds || {}) };
  const inputs = { top: h('input', { type: 'number', min: 0, step: 'any', value: th.top }), high: h('input', { type: 'number', min: 0, step: 'any', value: th.high }), mid: h('input', { type: 'number', min: 0, step: 'any', value: th.mid }), hide: h('input', { type: 'number', min: 0, step: 'any', value: th.hideDivBelow || '', placeholder: 'Off' }) };
  const saveEco = async (enabled = eco.enabled) => {
    const d = (k, fb) => (inputs[k].value === '' ? fb : Number(inputs[k].value));
    await call('settings:set', { economy: { enabled, thresholds: { unit, top: d('top', unit === 'divine' ? 1 : 100), high: d('high', unit === 'divine' ? 0.2 : 20), mid: d('mid', unit === 'divine' ? 0.05 : 5), hideDivBelow: d('hide', 0), sounds: tierSounds } } });
  };
  // chaos or divine thresholds; switching converts the numbers at poe.ninja's current divine price
  const unitLabels = [];
  const divNote = h('span', { class: 'small muted' }, 'Getting the Divine Orb price from poe.ninja…');
  let divine = null;
  call('prices:units').then((u) => { divine = u?.divine || null; divNote.textContent = divine ? `1 Divine Orb = ${Math.round(divine)} chaos on poe.ninja now` : 'poe.ninja has no Divine Orb price right now'; }).catch(() => { divNote.textContent = 'Could not reach poe.ninja'; });
  const unitSel = h('select', { 'aria-label': 'Price unit', onchange: (e) => {
    const to = e.target.value;
    if (to === unit) return;
    if (!divine) { e.target.value = unit; return toast('No Divine Orb price from poe.ninja yet, try again in a moment.'); }
    for (const k of ['top', 'high', 'mid', 'hide']) {
      if (inputs[k].value === '') continue;
      const v = Number(inputs[k].value);
      inputs[k].value = String(to === 'divine' ? +(v / divine).toFixed(3) : Math.round(v * divine * 10) / 10);
    }
    unit = to;
    for (const l of unitLabels) l.textContent = unit === 'divine' ? 'divine' : 'chaos';
  } }, h('option', { value: 'chaos', selected: unit === 'chaos' }, 'Chaos'), h('option', { value: 'divine', selected: unit === 'divine' }, 'Divine'));
  const unitLabel = () => { const l = h('span', {}, unit === 'divine' ? 'divine' : 'chaos'); unitLabels.push(l); return l; };
  const byTier = {};
  for (const r of ecoRules || []) {
    const names = (r.conditions.find((c) => c.keyword === 'BaseType')?.values) || [];
    (byTier[r.tier] = byTier[r.tier] || []).push(...names);
  }
  const TIERS = [
    ['top', 'Top', 'TIER_TOP', 'The Apothecary'],
    ['high', 'High', 'TIER_HIGH', 'The Wolf'],
    ['mid', 'Mid', 'TIER_MID', 'The Gambler'],
    ['multi', 'Maybe valuable', null, 'Glorious Plate'],
  ];
  const LOOKS = {
    top: { fontSize: 45, text: [255, 0, 0, 255], border: [255, 0, 0, 255], background: [255, 255, 255, 255], beam: { color: 'Red' }, icon: { size: 0, color: 'Red', shape: 'Star' } },
    high: { fontSize: 42, text: [0, 0, 0, 255], border: [0, 0, 0, 255], background: [240, 140, 0, 255], beam: { color: 'Orange' }, icon: { size: 1, color: 'Orange', shape: 'Diamond' } },
    mid: { fontSize: 38, text: [0, 0, 0, 255], border: [0, 0, 0, 255], background: [255, 220, 120, 230], beam: { color: 'Yellow' }, icon: { size: 2, color: 'Yellow', shape: 'Circle' } },
    multi: { fontSize: 40, text: [175, 96, 37, 255], border: [175, 96, 37, 255], background: [60, 30, 10, 255], beam: { color: 'Brown' }, icon: { size: 1, color: 'Brown', shape: 'Pentagon' } },
  };
  const tiersBox = h('div', { class: 'ground tiers' }, TIERS.map(([key, name, , fallback]) => {
    const names = byTier[key] || [];
    const sample = names[0] || fallback;
    return h('div', { class: 'tier' },
      h('div', {}, h('div', { class: 'name', style: { color: '#e6e3d6' } }, name), h('div', { class: 'count', style: { color: '#8d927f' } }, ecoRules ? `${names.length} items` : loadTiersLater ? h('span', {}, h('span', { class: 'spin' }), ' Loading prices') : '')),
      dropLabel(sample, LOOKS[key], { rarity: key === 'multi' ? 'Unique' : 'Divination Card', scale: 0.8 }),
      key === 'multi' ? h('span', { class: 'small', style: { color: '#a9ad9c' } }, 'Bases where some uniques pass Top') : h('label', { class: 'row small', style: { color: '#a9ad9c', flexWrap: 'nowrap' } }, 'At least', inputs[key], unitLabel()),
      soundPicker(tierSounds[key], (v) => { tierSounds[key] = v; }));
  }), h('div', { class: 'tier' },
    h('div', {}, h('div', { class: 'name', style: { color: '#e6e3d6' } }, 'Hide cheap cards')),
    dropLabel(byTier.hide?.[0] || 'Rain of Chaos', { fontSize: 32 }, { rarity: 'Divination Card', scale: 0.8, hidden: true }),
    h('label', { class: 'row small', style: { color: '#a9ad9c', flexWrap: 'nowrap' } }, 'Below', inputs.hide, unitLabel()),
    h('span')));

  // --- check an item ---
  const exTa = h('textarea', { placeholder: 'Paste an item to see how your filter shows it', style: { minHeight: '96px' }, 'aria-label': 'Item text' });
  const exOut = h('div');

  const parts = {
    file: [fileBox],
    rules: [section('Your rules', 'Extra rules placed above everything else. The first rule that matches an item wins.', rulesBox), section('New rule', null, newRule)],
    price: [sectionWith('Value tiers', 'Highlights valuable drops using current poe.ninja prices.',
      toggle(!!eco.enabled, async (v) => { await saveEco(v); if (v) ecoRules = await call('filter:economyRules'); renderFilters(); }, 'Use in my filter'),
      h('div', { class: 'row small', style: { marginBottom: '10px' } }, h('span', { class: 'muted' }, 'Prices in'), unitSel, divNote),
      tiersBox,
      h('div', { class: 'row', style: { marginTop: '10px' } },
        h('span', { class: 'small faint' }, 'Prices refresh at most every ', `${st.ninjaTtlMin} minutes. Writing the filter uses the latest prices.`),
        h('span', { class: 'spacer' }),
        h('button', { onclick: async () => { await saveEco(); ecoRules = await call('filter:economyRules'); toast('Tiers updated'); renderFilters(); } }, ecoRules ? 'Save and refresh' : 'Preview with current prices')))],
    check: [section('Check an item', 'See which rule hits an item and how it looks.',
      h('div', { class: 'panel stack' }, exTa,
        h('div', { class: 'row' }, h('button', { onclick: async () => {
          const r = await call('filter:explain', exTa.value);
          if (!r) return mount(exOut, h('p', { class: 'small muted' }, 'Choose your filter first, or paste a full item copied with Ctrl+C.'));
          const firstLine = exTa.value.split('\n').map((l) => l.trim());
          const nameIdx = firstLine.findIndex((l) => l.startsWith('Rarity:'));
          const rarity = nameIdx >= 0 ? firstLine[nameIdx].slice(7).trim() : 'Normal';
          const name = firstLine[nameIdx + 1] || 'Item';
          mount(exOut, h('div', { class: 'ground stage', style: { marginTop: '4px' } },
            dropLabel(name, r.style, { rarity, hidden: r.action === 'Hide' }),
            h('div', { class: 'small', style: { color: '#a9ad9c', textAlign: 'center' } },
              r.line ? `${r.action === 'Hide' ? 'Hidden' : 'Shown'} by the rule at line ${r.line}${r.comment ? ` (${r.comment})` : ''}.` : 'No rule matched, so the game shows it normally.',
              r.chain.length > 1 ? ` Styled by ${r.chain.length} rules in a row.` : '',
              r.unknown.length ? h('div', {}, `Assumed to match because the copied text doesn't include: ${r.unknown.join(', ')}.`) : null)));
        } }, 'Check')), exOut))],
  };
  mount(el, ...parts[which]);
  if (loadTiersLater) {
    ecoRules = await call('filter:economyRules').catch(() => []);
    if (currentPage === 'filters') renderFilters();
  }
}


// ---------------- rule form (new rule, edit rule) ----------------
const RARITIES = ['Normal', 'Magic', 'Rare', 'Unique'];

/** Which rarities a rule's Rarity condition allows, as a set. */
function raritiesOf(rule) {
  const c = (rule?.conditions || []).find((x) => x.keyword === 'Rarity');
  if (!c) return new Set();
  const idx = (v) => RARITIES.indexOf(v);
  const v = c.values || [];
  if (c.op === '<=' || c.op === '<') return new Set(RARITIES.filter((r) => (c.op === '<' ? idx(r) < idx(v[0]) : idx(r) <= idx(v[0]))));
  if (c.op === '>=' || c.op === '>') return new Set(RARITIES.filter((r) => (c.op === '>' ? idx(r) > idx(v[0]) : idx(r) >= idx(v[0]))));
  return new Set(v.filter((r) => RARITIES.includes(r)));
}
function condValue(rule, keyword, ops) {
  const c = (rule?.conditions || []).find((x) => x.keyword === keyword && ops.includes(x.op || '='));
  return c ? c.values[0] : '';
}

function ruleForm(initial, { onSave, onCancel, saveLabel = 'Save' }) {
  const r0 = initial || { action: 'Show', label: '', conditions: [], style: { fontSize: 42, text: [255, 42, 42, 255], border: [255, 42, 42, 255], background: [255, 255, 255, 255], customSound: 'poehelper-sounds/divine-tink.mp3', beam: { color: 'Red' }, icon: { size: 0, color: 'Red', shape: 'Star' } } };
  const st0 = r0.style || {};
  const hexOf = (a, d) => (a ? '#' + a.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('') : d);
  const cls0 = (r0.conditions || []).find((c) => c.keyword === 'Class');
  const bases0 = (r0.conditions || []).find((c) => c.keyword === 'BaseType');
  const rar0 = raritiesOf(r0);

  const f = {
    action: h('select', { 'aria-label': 'Show or hide' }, ['Show', 'Hide'].map((a) => h('option', { value: a, selected: r0.action === a }, a))),
    label: h('input', { placeholder: 'Name, for example "Rare Vaal Axe 84+"', value: r0.label || '', style: { flex: 1 } }),
    cls: h('input', { placeholder: 'Two Hand Axes', value: cls0 ? cls0.values.join(', ') : '' }),
    bases: h('textarea', { placeholder: 'Vaal Axe\nDespot Axe', style: { minHeight: '70px', fontFamily: 'var(--ui)', fontSize: '13.5px' } }, bases0 ? bases0.values.join('\n') : ''),
    exact: h('input', { type: 'checkbox', checked: !bases0 || bases0.op === '==' }),
    ilvlMin: h('input', { type: 'number', min: 1, max: 100, placeholder: 'Any', value: condValue(r0, 'ItemLevel', ['>=']) || (condValue(r0, 'ItemLevel', ['>']) ? +condValue(r0, 'ItemLevel', ['>']) + 1 : '') }),
    ilvlMax: h('input', { type: 'number', min: 1, max: 100, placeholder: 'Any', value: condValue(r0, 'ItemLevel', ['<=']) || (condValue(r0, 'ItemLevel', ['<']) ? +condValue(r0, 'ItemLevel', ['<']) - 1 : '') }),
    links: h('input', { type: 'number', min: 1, max: 6, placeholder: 'Any', value: condValue(r0, 'LinkedSockets', ['>=']) }),
    stack: h('input', { type: 'number', min: 1, placeholder: 'Any', value: condValue(r0, 'StackSize', ['>=']) }),
    useText: h('input', { type: 'checkbox', checked: !!st0.text || !initial }), text: h('input', { type: 'color', value: hexOf(st0.text, '#ff2a2a') }),
    useBorder: h('input', { type: 'checkbox', checked: !!st0.border }), border: h('input', { type: 'color', value: hexOf(st0.border, '#ff2a2a') }),
    useBg: h('input', { type: 'checkbox', checked: !!st0.background }), bg: h('input', { type: 'color', value: hexOf(st0.background, '#ffffff') }),
    size: h('input', { type: 'range', min: 18, max: 45, value: st0.fontSize || 32, style: { width: '140px' } }),
    beam: h('select', {}, h('option', { value: '' }, 'No beam'), Object.keys(window.UI.GAME_COLOURS).map((c) => h('option', { value: c, selected: st0.beam?.color === c }, `${c} beam`))),
    iconColor: h('select', {}, h('option', { value: '' }, 'No minimap icon'), Object.keys(window.UI.GAME_COLOURS).map((c) => h('option', { value: c, selected: st0.icon?.color === c }, `${c} icon`))),
    iconShape: h('select', {}, ['Star', 'Circle', 'Diamond', 'Hexagon', 'Square', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'].map((c) => h('option', { value: c, selected: st0.icon?.shape === c }, c === 'UpsideDownHouse' ? 'House' : c))),
  };
  const rar = Object.fromEntries(RARITIES.map((r) => [r, h('input', { type: 'checkbox', checked: rar0.has(r) })]));
  let sound = styleSound(st0);
  const hex = (v) => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 255];

  const build = () => {
    const conds = [];
    if (f.cls.value.trim()) conds.push({ keyword: 'Class', op: f.exact.checked ? '==' : null, values: f.cls.value.split(',').map((x) => x.trim()).filter(Boolean) });
    const bases = f.bases.value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (bases.length) conds.push({ keyword: 'BaseType', op: f.exact.checked ? '==' : null, values: bases });
    const picked = RARITIES.filter((r) => rar[r].checked);
    if (picked.length && picked.length < RARITIES.length) conds.push({ keyword: 'Rarity', op: '==', values: picked });
    if (f.ilvlMin.value) conds.push({ keyword: 'ItemLevel', op: '>=', values: [String(f.ilvlMin.value)] });
    if (f.ilvlMax.value) conds.push({ keyword: 'ItemLevel', op: '<=', values: [String(f.ilvlMax.value)] });
    if (f.links.value) conds.push({ keyword: 'LinkedSockets', op: '>=', values: [String(f.links.value)] });
    if (f.stack.value) conds.push({ keyword: 'StackSize', op: '>=', values: [String(f.stack.value)] });
    // keep conditions this form doesn't edit (e.g. HasInfluence from an imported rule)
    const handled = new Set(['Class', 'BaseType', 'Rarity', 'ItemLevel', 'LinkedSockets', 'StackSize']);
    for (const c of r0.conditions || []) if (!handled.has(c.keyword)) conds.push(c);
    const style = {};
    if (f.action.value === 'Show') {
      if (f.useText.checked) style.text = hex(f.text.value);
      if (f.useBorder.checked) style.border = hex(f.border.value);
      if (f.useBg.checked) style.background = hex(f.bg.value);
      style.fontSize = Number(f.size.value);
      Object.assign(style, soundToStyle(sound));
      if (f.beam.value) style.beam = { color: f.beam.value };
      if (f.iconColor.value) style.icon = { size: st0.icon?.size ?? 0, color: f.iconColor.value, shape: f.iconShape.value };
    } else style.disableDropSound = true;
    return { id: r0.id || `r_${Date.now()}`, enabled: true, action: f.action.value, label: f.label.value.trim() || autoLabel(f.action.value, picked, bases[0] || f.cls.value.trim(), f.ilvlMin.value, f.ilvlMax.value), conditions: conds, style };
  };

  const stage = h('div', { class: 'ground stage', style: { minHeight: '190px' } });
  const code = h('pre', { class: 'code' });
  const summary = h('div', { class: 'small', style: { color: '#a9ad9c', textAlign: 'center' } });
  const update = async () => {
    const r = build();
    const picked = RARITIES.filter((x) => rar[x].checked);
    mount(stage, dropLabel(exampleName(r), r.style, { rarity: picked.length === 1 ? picked[0] : ruleRarity(r), hidden: r.action === 'Hide' }), summary);
    mount(summary, r.action === 'Hide' ? 'Hidden: ' : 'Shown: ', describe(r));
    code.textContent = await call('filter:render', r);
  };
  [...Object.values(f), ...Object.values(rar)].forEach((x) => x.addEventListener('input', update));
  update();

  const styleFields = h('div', { class: 'stack', style: { display: r0.action === 'Hide' ? 'none' : '' } },
    h('div', { class: 'row' }, h('label', { class: 'check small' }, f.useText, 'Text'), f.text, h('label', { class: 'check small' }, f.useBorder, 'Border'), f.border, h('label', { class: 'check small' }, f.useBg, 'Background'), f.bg),
    h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'Size'), f.size),
    h('div', { class: 'row' }, soundPicker(sound, (v) => { sound = v; update(); })),
    h('div', { class: 'row' }, f.beam, f.iconColor, f.iconShape));
  f.action.addEventListener('input', () => { styleFields.style.display = f.action.value === 'Hide' ? 'none' : ''; });

  return h('div', { class: 'cols' },
    h('div', { class: 'panel stack' },
      h('div', { class: 'row' }, f.action, f.label),
      h('label', { class: 'field' }, 'Item class (comma separated)', f.cls),
      h('label', { class: 'field' }, 'Base types, one per line', f.bases),
      h('label', { class: 'check small' }, f.exact, 'Match names exactly'),
      h('div', { class: 'field' }, 'Rarity (none ticked means any)', h('div', { class: 'row' }, RARITIES.map((r) => h('label', { class: `check small r-${r}` }, rar[r], r)))),
      h('div', { class: 'row small' },
        h('label', { class: 'field' }, 'Item level from', f.ilvlMin),
        h('label', { class: 'field' }, 'to', f.ilvlMax),
        h('label', { class: 'field' }, 'Min links', f.links),
        h('label', { class: 'field' }, 'Min stack', f.stack)),
      styleFields),
    h('div', { class: 'stack', style: { alignContent: 'start' } }, stage,
      h('div', { class: 'row' }, h('span', { class: 'spacer' }),
        onCancel ? h('button', { class: 'quiet', onclick: onCancel }, 'Cancel') : null,
        h('button', { class: 'primary', onclick: () => onSave(build()) }, saveLabel)),
      h('details', {}, h('summary', {}, 'Filter code'), code)));
}

function autoLabel(action, rarities, what, min, max) {
  const verb = action === 'Hide' ? 'Hide' : 'Highlight';
  const rw = rarities.length && rarities.length < 4 ? rarities.map((r) => r.toLowerCase()).join('/') + ' ' : '';
  const lv = min && max ? `, ilvl ${min}-${max}` : min ? `, ilvl ${min}+` : max ? `, ilvl up to ${max}` : '';
  return `${verb} ${rw}${what || 'items'}${lv}`;
}


// ---------------- hotkey recorder ----------------
/** A field you click, then press the key combination you want. */
function hotkeyField(name, label, st, help, fallback) {
  const H = window.Hotkey;
  const status = st.hotkeyStatus?.[name];
  const statusText = { ok: ['good', 'Active'], taken: ['bad', 'Used by another app'], invalid: ['bad', 'Can\'t be used'], off: ['', 'Off'] }[status] || null;
  const btn = h('button', { class: 'hk', type: 'button', 'aria-label': `${label}: ${H.label(st[name])}. Click to change.` }, H.label(st[name]));
  const msg = h('div', { class: 'small' });
  let recording = false;

  const stop = async (save) => {
    recording = false;
    btn.classList.remove('rec');
    window.removeEventListener('keydown', onKey, true);
    if (save !== undefined) {
      await call('settings:set', { [name]: save });
      const fresh = (await call('state:get')).settings;
      const r = fresh.hotkeyStatus?.[name];
      if (r === 'taken') toast(`${H.label(save)} is already used by another app. Try another combination.`, true);
      else toast(save ? `Price check is now ${H.label(save)}` : 'Hotkey switched off');
      renderSettings();
    } else {
      await call('hotkeys:resume');
      btn.textContent = H.label(st[name]);
      mount(msg);
    }
  };

  const onKey = (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return stop();
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey) return stop('');
    const r = H.fromEvent(e);
    if (r.pending) { btn.textContent = r.mods.length ? `${r.mods.join(' + ')} + …` : 'Press keys…'; return; }
    if (r.error) { mount(msg, h('span', { class: 'bad' }, r.error)); btn.textContent = 'Press keys…'; return; }
    stop(r.accelerator);
  };

  btn.addEventListener('click', async () => {
    if (recording) return stop();
    recording = true;
    btn.classList.add('rec');
    btn.textContent = 'Press keys…';
    mount(msg, h('span', { class: 'muted' }, 'Esc to cancel, Backspace to switch it off.'));
    await call('hotkeys:pause'); // so pressing your current hotkey doesn't open a price check
    window.addEventListener('keydown', onKey, true);
  });
  btn.addEventListener('blur', () => { if (recording) stop(); });

  return h('div', { class: 'field' },
    h('span', {}, label),
    h('div', { class: 'row', style: { gap: '8px' } },
      btn,
      statusText ? h('span', { class: `pill ${statusText[0]}` }, statusText[1]) : null,
      st[name] !== fallback ? h('button', { class: 'quiet sm', onclick: () => stop(fallback) }, `Reset to ${H.label(fallback)}`) : null),
    msg,
    help ? h('span', { class: 'help' }, help) : null);
}

// ---------------- settings ----------------
function renderSettings() { return window.UI.keepScroll(() => renderSettingsNow()); }
function updateText(u) {
  switch (u?.state) {
    case 'dev': return u.message;
    case 'checking': return 'Checking for a new version…';
    case 'downloading': return `Downloading version ${u.latest || ''}${u.percent ? ` (${u.percent}%)` : ''}…`;
    case 'ready': return `Version ${u.latest} is downloaded. Restart to use it, or it installs the next time you quit.`;
    case 'none': return 'You have the latest version.';
    case 'error': return `Couldn't check for updates: ${u.message}`;
    default: return 'Updates are checked shortly after start.';
  }
}
function updateBox() {
  const text = h('span', { class: 'small muted', style: { flex: 1 } }, '…');
  const btns = h('span', { class: 'row', style: { gap: '6px' } });
  const draw = (u) => {
    text.textContent = updateText(u);
    mount(btns,
      u?.state === 'ready' ? h('button', { class: 'primary', onclick: () => call('update:install') }, 'Restart to update') : null,
      u?.state !== 'dev' && u?.state !== 'ready' ? h('button', { disabled: u?.state === 'checking' || u?.state === 'downloading', onclick: async () => draw(await call('update:check')) }, 'Check now') : null);
  };
  call('update:status').then(draw).catch(() => {});
  window.poe.on('update:status', draw);
  return [h('span', {}, h('b', {}, `Version ${S.settings.version}`)), text, btns];
}

function gameSoundRows(st) {
  const map = st.gameSoundFiles || {};
  const save = async (next) => { await call('settings:set', { gameSoundFiles: next }); S.settings.gameSoundFiles = next; window.UI.setGameSounds(next); renderSettings(); };
  return h('div', { class: 'gs-grid' }, Array.from({ length: 16 }, (_, i) => {
    const n = String(i + 1);
    const file = map[n];
    return h('div', { class: 'gs-row' + (file ? ' has' : '') },
      h('b', {}, `Game sound ${n}`),
      file ? h('span', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'play', type: 'button', 'aria-label': `Play game sound ${n}`, onclick: () => window.UI.playSound(`game:${n}`) }, '▶'),
        h('button', { class: 'quiet sm', onclick: () => { const next = { ...map }; delete next[n]; save(next); } }, 'Remove'))
        : window.UI.fileDropZone('Drop a recording or click', '.mp3,.wav,.ogg', async (f) => {
          if (!/\.(mp3|wav|ogg)$/i.test(f.name)) return toast('Use an .mp3, .wav or .ogg file', true);
          try {
            const snd = await call('sounds:import', { name: `game sound ${n}.${f.name.split('.').pop()}`, data: await window.UI.fileToBase64(f) });
            await save({ ...map, [n]: snd.id });
            window.UI.playSound(`game:${n}`);
          } catch { /* toast */ }
        }));
  }));
}

function appIconBox(st) {
  const img = h('img', { alt: 'Current icon', width: 48, height: 48, style: { borderRadius: '8px', background: '#0003', objectFit: 'contain' } });
  call('appIcon:get').then((u) => { img.src = u; }).catch(() => {});
  return [img,
    h('div', { class: 'stack', style: { gap: '6px', flex: 1 } },
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: async () => { const u = await call('appIcon:pick'); if (u) { img.src = u; toast('Icon changed'); renderSettings(); } } }, 'Choose an image…'),
        st.customAppIcon ? h('button', { class: 'quiet', onclick: async () => { img.src = await call('appIcon:reset'); toast('Back to the PoE Helper icon'); renderSettings(); } }, 'Use the default icon') : null),
      h('span', { class: 'small muted' }, 'Any .png, .jpg or .ico. It is cropped to a square; simple shapes read best at tray size (16 px). The desktop shortcut keeps its own icon.'))];
}

async function renderSettingsNow() {
  await refreshState();
  const st = S.settings;
  const el = $('page-settings');
  let leagues = [];
  try { leagues = await call('leagues:list'); } catch { /* offline */ }
  const field = (label, input, help) => h('label', { class: 'field' }, label, input, help ? h('span', { class: 'help' }, help) : null);
  const set = (key, transform = (v) => v) => (e) => call('settings:set', { [key]: transform(e.target.type === 'checkbox' ? e.target.checked : e.target.value) }).then(() => toast('Saved'));
  const sid = h('input', { type: 'password', placeholder: st.sessionSet ? 'Saved and encrypted' : '32 characters', autocomplete: 'off', style: { flex: 1 } });
  const rules = (st.mapRules || []).map((r) => ({ ...r }));
  const saveRules = () => call('settings:set', { mapRules: rules }).then(() => toast('Saved'));

  mount(el,
    pageHead('Settings'),
    h('div', { class: 'cols', style: { alignItems: 'start' } },
      h('div', {},
        section('Your account', 'Only needed for net worth.',
          h('div', { class: 'panel stack' },
            field('Account name', h('input', { value: st.accountName || '', placeholder: 'YourName#1234', onchange: set('accountName', (v) => v.trim()) }), 'Include the #number shown on pathofexile.com.'),
            field('POESESSID', h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, sid,
              h('button', { onclick: async () => { await call('session:set', sid.value); sid.value = ''; toast('Session saved'); renderSettings(); } }, 'Save'),
              st.sessionSet ? h('button', { class: 'danger', onclick: async () => { await call('session:set', ''); renderSettings(); } }, 'Remove') : null),
              h('span', {}, h('button', { class: 'primary sm', style: { margin: '4px 0' }, onclick: async (e) => {
                e.target.disabled = true;
                e.target.textContent = 'Log in in the window that opened…';
                const r = await call('session:login').catch(() => null);
                if (r?.ok) toast(`Logged in. Your POESESSID is saved${r.accountName ? ` and your account name is ${r.accountName}` : ''}.`);
                else if (r?.cancelled) toast('Login window closed; nothing was saved.');
                renderSettings();
              } }, st.sessionSet ? 'Log in again on pathofexile.com' : 'Log in on pathofexile.com'),
              h('br'), 'Opens the official login page. Log in there yourself; once you see your account page, the app saves the session and closes the window. Or paste it: on pathofexile.com press F12, then Application, Cookies, POESESSID. It is stored encrypted and only sent to pathofexile.com for stash tabs. Never share it.')))),
        section('Requests', 'How much the app may ask of GGG and poe.ninja.',
          h('div', { class: 'panel stack' },
            field('GGG requests per day', h('input', { type: 'number', min: 10, value: st.dailyGggBudget, onchange: set('dailyGggBudget', Number) }), 'Stash and trade requests stop once this is reached. Price checks never count.'),
            field('Speed', h('select', { onchange: set('rateSafety', Number) }, [[0.3, 'Gentle: 30% of the allowed rate'], [0.5, 'Normal: 50%'], [0.7, 'Faster: 70%']].map(([v, l]) => h('option', { value: v, selected: Number(st.rateSafety) === v }, l)))),
            field('Keep prices for (minutes)', h('input', { type: 'number', min: 5, value: st.ninjaTtlMin, onchange: set('ninjaTtlMin', Number) }), 'poe.ninja updates about every 15 minutes, so lower values only add downloads.'),
            field('Your name or link for request headers', h('input', { value: st.contact || '', placeholder: 'Optional, for example github.com/you', onchange: set('contact', (v) => v.trim()) })),
            h('details', {}, h('summary', {}, 'Price server address'),
              h('div', { class: 'stack', style: { marginTop: '8px' } }, h('input', { value: st.ninjaBaseUrl, onchange: set('ninjaBaseUrl', (v) => v.trim()), 'aria-label': 'Price server address' }), h('span', { class: 'help' }, 'Change only if you run your own caching proxy for poe.ninja.')))))),
      h('div', {},
        section('Price check', null,
          h('div', { class: 'panel stack' },
            field('League', h('select', { onchange: set('leagueOverride') }, h('option', { value: '' }, `Follow the current league (${leagues[0]?.name || 'automatic'})`), leagues.map((l) => h('option', { value: l.id, selected: st.leagueOverride === l.id }, l.name || l.id)))),
            hotkeyField('hotkeyPrice', 'Price check hotkey', st, st.keySender ? 'Hover an item in game and press it. The price check pops up next to the item.' : 'Press Ctrl+C on the item first, then this hotkey.', 'Alt+E'),
            hotkeyField('hotkeyPriceAdvanced', 'Price check with mod tiers', st, 'Copies with Ctrl+Alt+C so mod names and tiers are included.', 'Ctrl+Alt+D'),
            toggle(st.overlayCloseOnMouseAway !== false, (v) => call('settings:set', { overlayCloseOnMouseAway: v }).then(() => toast('Saved')), 'Close the price check when I move the mouse away, until I use it (Esc always closes it)'),
            h('div', { class: 'row small' }, h('span', { class: 'muted' }, st.overlayPos ? 'The price check opens where you last dragged it.' : 'The price check opens next to the item. Drag it by its top bar to choose a fixed place.'),
              st.overlayPos ? h('button', { class: 'quiet sm', onclick: async () => { await call('overlay:resetPos'); toast('The price check opens next to the item again'); renderSettings(); } }, 'Open next to the item again') : null),
            toggle(st.clipboardMode, (v) => call('settings:set', { clipboardMode: v }).then(() => toast('Saved')), 'Open the overlay whenever I Ctrl+C an item'),
            toggle(st.restoreClipboard, (v) => call('settings:set', { restoreClipboard: v }).then(() => toast('Saved')), 'Put my clipboard back after a hotkey check'),
            field('Trade listings', h('select', { onchange: set('tradeStatus') }, [['securable', 'Instant buyout only'], ['available', 'Instant buyout and in person'], ['online', 'In person, online sellers'], ['any', 'Any listing']].map(([v, l]) => h('option', { value: v, selected: (st.tradeStatus || 'securable') === v }, l))), 'Instant buyout listings come from merchant tabs and can be bought straight away from your hideout.'),
            field('Trade search range', h('select', { onchange: set('tradeTolerance', Number) }, [[0, 'Exact values'], [0.05, '5% below my values'], [0.1, '10% below my values'], [0.2, '20% below my values']].map(([v, l]) => h('option', { value: v, selected: Number(st.tradeTolerance) === v }, l)))),
            toggle(st.tradeFetchListings, (v) => call('settings:set', { tradeFetchListings: v }).then(() => toast('Saved')), 'Show the cheapest listings after a search (1 extra request)'),
            field('Item label font', h('div', { class: 'row' },
              h('span', { class: 'small', style: { flex: 1 } }, st.labelFontPath ? `Using ${st.labelFontPath.split(/[\\/]/).pop()}` : 'Using the bundled look-alike (Marcellus SC)'),
              h('button', { class: 'sm', onclick: async () => { const n = await call('font:pick'); if (n) { await window.UI.loadUserFont(); toast(`Item labels now use ${n}`); renderSettings(); } } }, 'Choose font file'),
              st.labelFontPath ? h('button', { class: 'quiet sm', onclick: async () => { await call('font:clear'); toast('Back to the bundled font. Restart the app to see it everywhere.'); renderSettings(); } }, 'Reset') : null),
              'The game uses Fontin SmallCaps. It is free from exljbris.com but can\'t be shipped with this app; download it and pick the .otf file here for an exact match.'))),
        section('Net worth', null,
          h('div', { class: 'panel stack' },
            field('Client.txt', h('input', { value: st.clientLogPath || '', placeholder: '…\\Path of Exile\\logs\\Client.txt', onchange: set('clientLogPath', (v) => v.trim()) }), 'Automatic snapshots pause when this file goes quiet for 15 minutes, which means you stopped playing.'),
            field('Skip stacks worth less than (chaos)', h('input', { type: 'number', min: 0, value: st.minItemChaos, onchange: set('minItemChaos', Number) })))))),
    section('Starting the app', null,
      h('div', { class: 'panel stack' },
        toggle(!!st.startWithWindows, (v) => call('settings:set', { startWithWindows: v }).then(() => toast(v ? 'PoE Helper starts with Windows, in the tray' : 'PoE Helper no longer starts with Windows')), 'Start PoE Helper with Windows (it waits in the tray)'),
        toggle(!!st.minimizeToTray, (v) => call('settings:set', { minimizeToTray: v }).then(() => toast(v ? 'Minimizing now hides PoE Helper in the tray' : 'Minimizing keeps PoE Helper in the taskbar')), 'Minimize to the tray instead of the taskbar'),
        h('div', { class: 'row' }, h('button', { onclick: () => call('tray:hide') }, 'Hide to tray now'),
          h('span', { class: 'small muted' }, 'Closing the window also keeps PoE Helper running in the tray, so Alt+E keeps working. Click the tray icon to open it again; right-click it and choose Quit to close it for good.')))),
    notesSection(await call('app:changelog').catch(() => [])),
    section('Updates', 'PoE Helper checks GitHub for a new version at start and every 4 hours, downloads it in the background, and installs it when you restart.',
      h('div', { class: 'panel row', style: { gap: '14px' } }, updateBox())),
    section('Game sound previews', 'Your filter uses the game\'s built-in drop sounds (Game sound 1 to 16). They are part of the game, so PoE Helper can\'t include them. Drop in your own recording of a sound once and every ▶ for it plays that recording. Previews only: the filter keeps the real in-game sound.',
      h('div', { class: 'panel' }, gameSoundRows(st))),
    section('Tray and app icon', 'The picture in the tray, the taskbar and the window title bar.',
      h('div', { class: 'panel row', style: { gap: '16px' } }, appIconBox(st))),
    section('Map warnings', 'Turn on the mods your build can\'t run. A # stands for any number.',
      h('div', { class: 'panel' },
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Mod'), h('th', {}, 'Matches text'), h('th', {}, 'Warning'))),
          h('tbody', {}, rules.map((r) => h('tr', {},
            h('td', { style: { width: '44px' } }, toggle(r.enabled, (v) => { r.enabled = v; saveRules(); })),
            h('td', {}, r.label),
            h('td', { class: 'muted small' }, r.pattern),
            h('td', {}, h('select', { onchange: (e) => { r.severity = e.target.value; saveRules(); } }, [['deadly', 'Skip the map'], ['danger', 'Dangerous'], ['warn', 'Annoying'], ['info', 'Just so you know']].map(([v, l]) => h('option', { value: v, selected: r.severity === v }, l)))))))),
        (() => {
          const label = h('input', { placeholder: 'Name' });
          const pat = h('input', { placeholder: 'Monsters have #% increased Area of Effect', style: { flex: 1 } });
          return h('div', { class: 'row', style: { marginTop: '12px' } }, label, pat, h('button', { onclick: () => { if (!pat.value.trim()) return; rules.push({ id: `c_${Date.now()}`, label: label.value || pat.value, pattern: pat.value, severity: 'danger', enabled: true }); saveRules().then(renderSettings); } }, 'Add warning'));
        })())));
}

// ---------------- events ----------------
window.poe.on('toast', (m) => toast(m));
window.poe.on('networth:updated', () => { if (currentPage === 'networth' || currentPage === 'dashboard') go(currentPage); });
window.poe.on('filter:rebuilt', () => { if (currentPage === 'filters') go('filters'); });
window.poe.on('history:updated', () => { if (currentPage === 'dashboard' || currentPage === 'price') refreshState(); });

go('dashboard');
