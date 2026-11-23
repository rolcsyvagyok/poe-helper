'use strict';
const { h, mount, fmt, chaosDiv, ago, rarityClass, toast, call, dropLabel, soundButton, playSound } = window.UI;

const S = { settings: {}, league: '', divine: null, usage: null, history: [], sounds: [] };
const $ = (id) => document.getElementById(id);

// ---------------- navigation ----------------
const pages = { dashboard: renderOverview, networth: renderNetworth, farm: () => window.Farm.renderFarm(), atlas: () => window.AtlasView.render(), lab: () => window.LabView.renderLabPage(), macros: renderMacros, trade: renderTrade, collection: () => window.CollectionView.render(), regex: () => window.RegexView.renderRegexPage(), craft: () => window.CraftView.render(), pob: () => window.PobView.render(), filters: renderFilters, designer: renderDesigner, settings: renderSettings };
let currentPage = 'dashboard';

// menu icons
// Each entry has an in-game item picture that fits what it does (Loot filter: Chaos Orb, WealthyExile:
// Divine Orb, ...). The pictures load from GGG's image server through poe.ninja's data; until then, or
// offline, the line icon shows.
const navIcon = (b) => window.UI.icon(b.dataset.art ? `art:${b.dataset.art}` : b.dataset.icon, { size: 22, fallback: b.dataset.icon });
document.querySelectorAll('#nav button[data-icon]').forEach((b) => {
  const label = b.textContent;
  b.textContent = '';
  b.append(h('span', { class: 'nav-ic', 'aria-hidden': 'true' }, navIcon(b)), h('span', { class: 'nav-label' }, label));
});
window.poe.call('art:icons', [...document.querySelectorAll('#nav button[data-art]')].map((b) => b.dataset.art)).then((map) => {
  if (!map || !Object.keys(map).length) return;
  window.UI.setArt(map);
  document.querySelectorAll('#nav button[data-art]').forEach((b) => b.querySelector('.nav-ic')?.replaceChildren(navIcon(b)));
}).catch(() => {});
// Path of Building's own icon, from the Path of Building.exe on this PC (nothing of PoB's ships with the app)
function pobNavIcon() {
  window.poe.call('pob:icon').then((url) => {
    if (!url) return;
    const b = document.querySelector('#nav button[data-page="pob"]');
    b?.querySelector('.nav-ic')?.replaceChildren(h('img', { src: url, alt: '', width: 22, height: 22, style: { objectFit: 'contain' } }));
  }).catch(() => {});
}
setTimeout(pobNavIcon, 300);
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

// the icon next to the app's name: the bare flask, or your chosen icon
function setBrandIcon() {
  call('appIcon:get', 'mark').then((u) => { const el = document.getElementById('brandIcon'); if (el && u) { el.src = u; el.classList.toggle('boxed', !!S.settings?.customAppIcon || S.settings?.appIconStyle === 'classic'); } }).catch(() => {});
}

async function refreshState() {
  Object.assign(S, await call('state:get'));
  if (!S.sounds.length) S.sounds = await call('sounds:list').catch(() => []);
  window.UI.setGameSounds(window.UI.gameSoundMap(S.settings));
  window.UI.applyTheme(S.settings.uiTheme);
  setBrandIcon();
  if (!S.iconsLoaded) { S.userIcons = await call('icons:list').catch(() => []); UI.setUserIcons(S.userIcons); S.iconsLoaded = true; }
  const u = S.usage?.ggg?.today;
  mount($('sideFoot'),
    h('div', {}, h('span', { class: 'league-chip' }, S.league), S.settings.leagueOverride ? '' : h('span', { class: 'faint' }, ' (auto)')),
    themeDots(),
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

// ---------------- Path of Building ----------------
const fmtNum = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : Math.round(n).toLocaleString());
async function pobBox(box) {
  const st = await call('pob:state');
  const last = st.last;
  const ls = last?.summary;
  const stats = ls?.stats || {};
  mount(box,
    section('Path of Building', 'PoE Helper uses your installed Path of Building (Community) to make the snapshots. It starts when you save one and stops again after a few minutes.',
      h('div', { class: 'panel stack' },
        h('div', { class: 'row small', style: { gap: '8px' } }, h('span', { class: 'muted' }, 'Path of Building:'), h('code', {}, st.dir || 'not found'),
          h('button', { class: 'sm quiet', onclick: async () => { await call('pob:pickDir', 'pob'); pobBox(box); } }, 'Choose folder')),
        !st.dirFound ? h('div', { class: 'small warn' }, 'Path of Building (Community) wasn\'t found. Install it, or choose its folder.') : null,
        h('div', { class: 'row small', style: { gap: '8px' } }, h('span', { class: 'muted' }, 'Builds folder:'), h('code', {}, st.buildsDir),
          h('button', { class: 'sm quiet', onclick: async () => { await call('pob:pickDir', 'builds'); pobBox(box); } }, 'Choose folder')),
        st.state === 'failed' && st.error ? h('div', { class: 'small warn' }, `Path of Building didn't start: ${st.error}`) : null,
        h('span', { class: 'help' }, 'Path of Building is open source (MIT licence); PoE Helper uses your installed copy.'))),
    section('Snapshot of my character', 'Like Path of Building\'s Import tab: your gear, gems, passive tree and jewels from pathofexile.com, made into a build by Path of Building and saved as a new file.',
      pobSnapshotBox(st, () => pobBox(box))),
    last ? section('Last snapshot', null,
      h('div', { class: 'panel stack' },
        h('div', { class: 'pob-sum' }, h('b', {}, last.character), ` · ${[ls?.ascendancy || ls?.class, ls?.level ? `level ${ls.level}` : null, ls?.skill].filter(Boolean).join(' · ')}`,
          h('div', { class: 'small muted' }, [stats.FullDPS ? `${fmtNum(stats.FullDPS)} full DPS` : stats.CombinedDPS ? `${fmtNum(stats.CombinedDPS)} DPS` : null, stats.Life ? `${fmtNum(stats.Life)} life` : null, stats.EnergyShield > 50 ? `${fmtNum(stats.EnergyShield)} ES` : null, stats.TotalEHP ? `${fmtNum(stats.TotalEHP)} effective HP` : null].filter(Boolean).join(' · ')),
          h('div', { class: 'small faint' }, `${last.file.split(/[\\/]/).pop()}, saved ${new Date(last.at).toLocaleString()}`)),
        h('div', { class: 'row' }, h('button', { class: 'sm', onclick: () => call('pob:openFolder') }, 'Open snapshots folder')))) : null);
}
// Snapshot: your character from pathofexile.com made into a PoB build by PoB's own Import code, saved in your builds folder.
let pobChars = null; // characters loaded this session
function pobSnapshotBox(st, refresh) {
  const S0 = S.settings;
  const hasLogin = !!(S0.accountName && S0.sessionSet);
  const status = h('span', { class: 'small muted' });
  // grouped by league: the current league first, other leagues, then Standard and Hardcore only if you want them
  const current = S.league;
  const opts = st.charView || {};
  const all = pobChars || (st.character ? [{ name: st.character, league: '' }] : []);
  const shown = all.filter((c) => c.name === st.character || (opts.currentOnly ? c.league === current : (opts.showStandard || !isPermanentLeague(c.league))));
  const leagues = [...new Set(shown.map((c) => c.league || ''))].sort((a, b) => (a === current ? -1 : b === current ? 1 : 0) || (isPermanentLeague(a) - isPermanentLeague(b)) || a.localeCompare(b));
  const optOf = (c) => h('option', { value: c.name, selected: st.character === c.name }, [c.name, c.level ? `level ${c.level}` : null, c.class].filter(Boolean).join(' · '));
  const charSel = h('select', { style: { flex: 1 }, 'aria-label': 'Character', onchange: async (e) => { await call('pob:set', { character: e.target.value || null }); toast('Saved'); } },
    h('option', { value: '' }, 'The character I played last'),
    leagues.map((l) => h('optgroup', { label: l ? (l === current ? `${l} (current league)` : l) : 'Picked before' },
      shown.filter((c) => (c.league || '') === l).sort((a, b) => (b.level || 0) - (a.level || 0) || a.name.localeCompare(b.name)).map(optOf))));
  const setView = async (patch) => { await call('pob:set', { charView: { ...opts, ...patch } }); refresh(); };
  const hiddenCount = all.length - shown.length;
  const loadChars = async (btn) => {
    btn.disabled = true; mount(status, 'Loading your characters…');
    try { pobChars = await call('pob:characters', true); refresh(); } catch (e) { mount(status, h('span', { class: 'warn' }, cleanErr(e))); btn.disabled = false; }
  };
  const save = async (btn) => {
    btn.disabled = true; mount(status, 'Reading your character and building it in Path of Building…');
    try {
      const r = await call('pob:snapshot');
      const auto = (r.summary?.autoConfig || []).length;
      toast(`Saved a snapshot of ${r.character}${auto ? ` (${auto} Configuration ${auto === 1 ? 'option' : 'options'} ticked from the build: charges, buffs, rage…)` : ''}`);
      if (window.PobView?.showBuild && currentPage === 'pob') window.PobView.showBuild(r.file); else refresh();
    } catch (e) { mount(status, h('span', { class: 'warn' }, cleanErr(e))); btn.disabled = false; }
  };
  return h('div', { class: 'panel stack' },
    h('span', { class: 'help' }, 'Saved in ', h('code', {}, 'PoE Helper snapshots'), ' in your builds folder, named after the character and the time. Open it in Path of Building like any build. Each snapshot is a new file, so older ones stay.'),
    !hasLogin ? h('div', { class: 'small warn' }, 'Add your account name and POESESSID in Settings first; the snapshot reads your character with them, private profiles too.') : null,
    h('label', { class: 'field' }, 'Character', h('div', { class: 'row', style: { gap: '8px' } }, charSel,
      h('button', { class: 'sm quiet', title: 'Get your character list from pathofexile.com (1 request)', onclick: (e) => loadChars(e.currentTarget) }, pobChars ? 'Refresh list' : 'Load characters'))),
    pobChars ? h('div', { class: 'row small', style: { gap: '16px' } },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!opts.currentOnly, onchange: (e) => setView({ currentOnly: e.target.checked }) }), `Only ${current || 'the current league'}`),
      opts.currentOnly ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!opts.showStandard, onchange: (e) => setView({ showStandard: e.target.checked }) }), 'Show Standard and Hardcore'),
      hiddenCount ? h('span', { class: 'faint' }, `${hiddenCount} ${hiddenCount === 1 ? 'character' : 'characters'} not shown`) : null) : null,
    h('div', { class: 'row', style: { gap: '10px' } },
      h('button', { class: 'primary sm', disabled: !st.dirFound || !hasLogin, onclick: (e) => save(e.currentTarget) }, 'Save snapshot now'), status),
    hotkeyField('hotkeySnapshot', 'Snapshot hotkey', S0, 'Saves a snapshot from anywhere, in game too (2-3 requests to pathofexile.com each time). Also in the tray menu.', ''));
}
/** Leagues that never end: Standard, Hardcore and their SSF and Ruthless versions. */
const isPermanentLeague = (l) => /^(SSF |HC SSF |Hardcore SSF |SSF Hardcore |Hardcore |HC )?(Standard|Hardcore|Ruthless)( SSF)?$/i.test(String(l || '').trim()) || /^(SSF )?(Hardcore )?Ruthless$|^Hardcore SSF$|^SSF Standard$|^SSF Hardcore$/i.test(String(l || '').trim());
const cleanErr = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ---------------- the app's look ----------------
async function setUiTheme(id) {
  S.settings.uiTheme = window.UI.applyTheme(id);
  await call('settings:set', { uiTheme: S.settings.uiTheme }).catch(() => {});
  document.querySelectorAll('[data-theme-id]').forEach((b) => b.classList.toggle('on', b.dataset.themeId === S.settings.uiTheme));
}
function themeDots() {
  const cur = S.settings.uiTheme || 'midnight';
  return h('div', { class: 'theme-dots', role: 'group', 'aria-label': 'Look' }, h('span', { class: 'faint' }, 'Look'), window.UI.UI_THEMES.map((t) => h('button', {
    class: t.id === cur ? 'on' : '', 'data-theme-id': t.id, title: `${t.name} look`, 'aria-label': `${t.name} look`,
    style: { background: `linear-gradient(135deg, ${t.sw[1]} 50%, ${t.sw[2]} 50%)` }, onclick: () => setUiTheme(t.id),
  })));
}
function themePicker() {
  const cur = S.settings.uiTheme || 'midnight';
  return h('div', { class: 'theme-pick' }, window.UI.UI_THEMES.map((t) => h('button', { class: 'tp' + (t.id === cur ? ' on' : ''), 'data-theme-id': t.id, onclick: () => setUiTheme(t.id) },
    h('div', { class: 'tp-sw', style: { boxShadow: `inset 0 0 0 1px ${t.sw[3]}` } }, h('i', { style: { background: t.sw[0] } }),
      h('b', { style: { background: t.sw[1], color: t.sw[2] } }, 'Aa', h('span', { style: { background: t.sw[3] } }))),
    h('span', { class: 'tp-name' }, t.name), h('span', { class: 'help' }, t.note))));
}

// ---------------- version and patch notes ----------------
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
function versionLine() {
  const v = S.ver;
  return h('button', { class: 'version-line', title: 'Read the patch notes', onclick: () => openNotes() },
    h('div', {}, `Version ${v?.version || S.settings.version}`),
    v?.releasedAt ? h('div', { class: 'faint' }, `Released ${fmtDate(v.releasedAt)}`) : null,
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
const NOTES_SHOWN = 5;
const RELEASES_URL = 'https://github.com/rolcsyvagyok/poe-helper/releases';
// where a change is in the app: the first match wins ("Show" button next to the change)
const NOTE_PLACES = [
  [/Rare looks/i, 'Rare looks', { special: 'rarelooks' }],
  [/Base ranks|Unid item tier|Memory Strand|Ranked bases|Tier 0/i, 'Base ranks', { special: 'basematrix' }],
  [/My collection/i, 'My collection', { page: 'collection' }],
  [/Atlas strateg/i, 'Atlas strategies', { page: 'atlas' }],
  [/Map regex/i, 'Map regex', { page: 'regex' }],
  [/WealthyExile|net worth/i, 'WealthyExile', { page: 'networth' }],
  [/Unique items|High variety|unique bases|uniques page/i, 'Unique items', { type: 'uniques' }],
  [/Regular maps|map cards|white maps|yellow maps/i, 'Regular maps', { type: 'maps' }],
  [/Tier designer|Text size|theme/i, 'Tier designer', { page: 'designer' }],
  [/Loot filter/i, 'Loot filter', { page: 'filters' }],
  [/Path of Building|\bPoB\b/, 'Path of Building', { page: 'pob' }],
  [/Trade searches/i, 'Trade searches', { page: 'trade' }],
  [/Settings/, 'Settings', { page: 'settings' }],
  [/Chat macros/, 'Chat macros', { page: 'macros' }],
  [/Crafting/, 'Crafting', { page: 'craft' }],
];
function noteGo(t) {
  if (t.page) return go(t.page);
  window.showInFilter?.(t.special ? { special: t.special } : { type: t.type, key: `${t.type}|` });
  go('filters');
}
// one line per change: the first sentence, without the details after it
function noteSummary(text) {
  const plain = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  // the headline: up to the first ": ", " (", ". " or "; " outside quotes (the rest is the detail, on hover);
  // a short topic before ": " ("Price check header: …") keeps its first clause after it
  const stop = (txt, from) => {
    let best = -1;
    for (const re of [/\. /g, /: /g, / \(/g, /; /g]) {
      re.lastIndex = from;
      let m;
      while ((m = re.exec(txt))) { if (((txt.slice(0, m.index).match(/"/g) || []).length % 2) === 0) break; }
      if (m && (best < 0 || m.index < best)) best = m.index;
    }
    return best;
  };
  let cut = stop(plain, 6);
  if (cut > 0 && plain.slice(cut, cut + 2) === ': ' && cut < 40) { const more = stop(plain, cut + 2); cut = more > 0 ? more : -1; }
  let one = cut > 0 ? plain.slice(0, cut) : plain.replace(/\.$/, '');
  if (one.length > 120) one = `${one.slice(0, 115).replace(/\s+\S*$/, '')}…`;
  return { one, full: plain };
}
const vnum = (v) => String(v || '').split('.').map((n) => Number(n) || 0);
const vnewer = (a, b) => { const x = vnum(a); const y = vnum(b); for (let k = 0; k < 3; k++) if ((x[k] || 0) !== (y[k] || 0)) return (x[k] || 0) > (y[k] || 0); return false; };
function notesSection(all) {
  // what changed since the version you had: every change of the newer versions in one list, no version headers
  const base = S.ver?.notesBase;
  const fresh = all.filter((e) => (!base || vnewer(e.version, base)) && !vnewer(e.version, S.ver?.version || e.version));
  // the short list: the "* " lines of each newer version ("* [Base ranks] text"); a version without them adds nothing
  const changes = (fresh.length ? fresh : all.slice(0, 1)).flatMap((e) => String(e.notes || '').split('\n').map((l) => l.trim()).filter((l) => /^\* /.test(l)).map((l) => l.slice(2)));
  const rows = changes.map((c0) => {
    const tag = /^\[([^\]]+)\]\s*/.exec(c0);
    const c = tag ? c0.slice(tag[0].length) : c0;
    const { one, full } = { one: c.replace(/\*\*([^*]+)\*\*/g, '$1'), full: c };
    const place = tag ? NOTE_PLACES.find(([, name]) => name === tag[1]) : null;
    return h('li', { class: 'note-row', title: full !== one ? full : '' },
      h('span', { class: 'note-text' }, one),
      place ? h('button', { class: 'sm note-go', title: `Open ${place[1]}`, onclick: () => noteGo(place[2]) }, place[1], ' →') : null);
  });
  const older = all.slice(0, NOTES_SHOWN);
  return section("What's new", base && fresh.length ? 'What changed since your last update. The button opens the place in the app.' : 'The latest changes. The button opens the place in the app.',
    h('div', { class: 'panel stack notes', id: 'patch-notes' },
      rows.length ? h('ul', { class: 'notes-list note-rows' }, rows) : h('p', { class: 'small muted' }, 'No patch notes in this copy.'),
      h('details', { class: 'notes-entry' }, h('summary', {}, h('span', { class: 'small muted' }, 'Full patch notes of the last versions')),
        older.map((e) => h('div', { class: 'notes-body' }, h('p', {}, h('b', {}, `Version ${e.version}`), e.date ? h('span', { class: 'faint' }, ` · ${fmtDate(e.date)}`) : null), mdBlock(String(e.notes || '').split('\n').filter((l) => !/^\s*\* /.test(l)).join('\n')))),
        all.length > NOTES_SHOWN ? h('p', { class: 'small muted' }, 'Older versions: ', h('a', { href: RELEASES_URL, target: '_blank', rel: 'noopener' }, 'every release on GitHub'), '.') : null)));
}

// ---------------- shared bits ----------------
// a page's name with its explanation behind an ⓘ (pages read cleaner without a paragraph on top)
function pageHead(title, desc, ...right) {
  return h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, h('h1', {}, title), desc ? window.UI.infoTip(desc, { label: `About ${title}` }) : null), h('span', { class: 'spacer' }), ...right);
}
window.pageHead = pageHead;
// a section's explanation: a short one stays as a grey line, a long one goes behind an ⓘ
const sectionNote = (title, desc) => (!desc ? null : typeof desc === 'string' && desc.length > 70 ? window.UI.infoTip(desc, { label: `About ${title}` }) : h('p', {}, desc));
// ---------------------------------------------------------------- chat macros
const MACRO_IDEAS = [['/exit', 'Log out to character select'], ['/hideout', 'Go to your hideout'], ['/kingsmarch', 'Go to Kingsmarch'], ['/menagerie', 'Go to the Menagerie'], ['/delve', 'Go to the Azurite Mine'], ['/heist', 'Go to the Rogue Harbour'], ['/monastery', 'Go to the Monastery of the Keepers'], ['@last ', 'Reply to the last whisper (not sent: type the rest)'], ['/invite @last', 'Party invite the last whisperer'], ['/kick ', 'Leave your party (add your name)'], ['/remaining', 'Monsters left in the area'], ['/deaths', 'How many times you died'], ['/played', 'Time played on this character'], ['/dnd', 'Do not disturb on or off']];
async function renderMacros() {
  const page = document.getElementById('page-macros');
  const st = (await call('state:get')).settings;
  const list = (Array.isArray(st.chatMacros) && st.chatMacros.length ? st.chatMacros : [1, 2, 3, 4, 5].map((n) => ({ key: `F${n}`, text: n === 1 ? '/exit' : n === 2 ? '/hideout' : '', send: true }))).map((m) => ({ ...m }));
  const save = async (msg) => { await call('settings:set', { chatMacros: list }); if (msg) toast(msg); };
  const ideas = h('datalist', { id: 'macro-ideas' }, MACRO_IDEAS.map(([v, l]) => h('option', { value: v }, l)));
  const row = (m, i) => h('div', { class: 'macro-row' },
    h('span', { class: 'macro-key' }, window.Hotkey.label(m.key)),
    h('input', { value: m.text || '', list: 'macro-ideas', placeholder: 'e.g. /exit (empty: this key does nothing)', maxlength: 250, 'aria-label': `What ${m.key} types in chat`,
      onchange: (e) => { m.text = e.target.value; save(m.text.trim() ? `${m.key}: ${m.text.trim()}` : `${m.key} does nothing now`); } }),
    h('label', { class: 'check small', title: 'Off: the text is typed but not sent, so you can finish it (handy for @last replies)' },
      h('input', { type: 'checkbox', checked: m.send !== false, onchange: (e) => { m.send = e.target.checked; save('Saved'); } }), h('span', {}, 'Send')));
  mount(page,
    pageHead('Chat macros', 'Press a key in game: PoE Helper presses Enter, types your text and presses Enter again, just like typing it yourself. One key press sends one message. The keys only work while Path of Exile is the active window, so F1 to F5 still do their normal thing in every other app.'),
    h('div', { class: 'panel stack', style: { maxWidth: '760px' } },
      toggle(st.chatMacrosOn !== false, async (v) => { await call('settings:set', { chatMacrosOn: v }); toast(v ? 'Chat macros on' : 'Chat macros off'); renderMacros(); }, 'Use chat macros'),
      st.chatMacrosOn !== false ? [ideas, ...list.map(row),
        h('label', { class: 'check small', title: 'After Enter the macro presses Backspace twice before typing, so a waiting ^ (or another accent key) doesn\'t end up in front of the text.' },
          h('input', { type: 'checkbox', checked: st.chatMacroClear !== false, onchange: async (e) => { await call('settings:set', { chatMacroClear: e.target.checked }); toast(e.target.checked ? 'Macros clear the chat line first' : 'Macros type straight away'); } }),
          h('span', {}, 'Press Backspace twice before the text (removes a waiting ^)'))] : h('p', { class: 'small muted' }, 'Off: F1 to F5 are left alone, also in game.'),
      st.keySender === false ? h('p', { class: 'small warn' }, 'Chat macros need the key sender (uiohook-napi), which isn\'t available in this copy.') : null,
      h('p', { class: 'small faint' }, 'Tip: start typing in a box for ideas like /exit, /hideout, /kingsmarch or @last. Your clipboard is put back after each macro.')));
}

// ---------------------------------------------------------------- trade searches
// Saved pathofexile.com/trade links (normal and live searches), with a price watch: the search is run again
// every few minutes, cheapest first, and you get a notification when something is at or under your price.
const TRADE_EVERY = [5, 10, 15, 30, 60, 120];
function agoText(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
async function renderTrade() {
  const page = document.getElementById('page-trade');
  const data = await call('trade:list');
  const redraw = (d) => { if (currentPage === 'trade') draw(d); };
  const draw = (d) => {
    const nameIn = h('input', { placeholder: 'Name, e.g. Cheap 6-link chest', maxlength: 80, 'aria-label': 'Name for the search', style: { flex: '1 1 180px' } });
    const urlIn = h('input', { placeholder: 'Paste a pathofexile.com/trade link (normal or live search)', 'aria-label': 'Trade search link', style: { flex: '3 1 320px' } });
    const add = async () => {
      try { const r = await call('trade:save', { name: nameIn.value, url: urlIn.value }); toast(`Saved "${r.list[r.list.length - 1].name}"`); redraw(r); } catch (e) { toast(cleanErr(e), true); }
    };
    urlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const card = (s, i) => {
      const save = async (patch, msg) => { try { const r = await call('trade:save', { key: s.key, ...patch }); if (msg) toast(msg); redraw(r); } catch (e) { toast(cleanErr(e), true); redraw(await call('trade:list')); } };
      const kind = s.kind === 'exchange' ? 'Bulk exchange' : s.live ? 'Live search' : 'Search';
      const amount = h('input', { type: 'number', min: 0, step: 'any', value: s.max?.amount ?? '', placeholder: 'Price', 'aria-label': `${s.name}: highest price`, style: { width: '90px' },
        onchange: (e) => save({ max: { amount: Number(e.target.value), unit: unit.value } }, Number(e.target.value) > 0 ? `${s.name}: tells you at ${e.target.value} ${unit.value} or less` : `${s.name}: no price set`) });
      const unit = h('select', { 'aria-label': `${s.name}: currency`, onchange: (e) => save({ max: { amount: Number(amount.value), unit: e.target.value } }) },
        h('option', { value: 'chaos', selected: (s.max?.unit || 'chaos') === 'chaos' }, 'chaos'), h('option', { value: 'divine', selected: s.max?.unit === 'divine' }, 'divine'));
      const every = h('select', { 'aria-label': `${s.name}: how often`, onchange: (e) => save({ everyMin: Number(e.target.value) }) },
        TRADE_EVERY.map((m) => h('option', { value: m, selected: s.everyMin === m }, m < 60 ? `every ${m} min` : `every ${m / 60} h`)));
      const watch = toggle(!!s.watch, (v) => {
        if (v && !(Number(amount.value) > 0)) { toast('Type the most you want to pay first.', true); redraw(d); return; }
        save({ watch: v, max: { amount: Number(amount.value), unit: unit.value } }, v ? `Watching "${s.name}"` : `Stopped watching "${s.name}"`);
      }, 'Price watch');
      const check = h('button', { class: 'sm', onclick: async () => {
        check.disabled = true; check.textContent = 'Checking…';
        try { const r = await call('trade:check', s.key); const c = r.entry.last?.cheapest; toast(c ? `${s.name}: cheapest ${c.amount} ${c.currency}${r.hits.length ? ' (at your price!)' : ''}` : `${s.name}: nothing listed`); } catch (e) { toast(cleanErr(e), true); }
        redraw(await call('trade:list'));
      } }, 'Check now');
      const c = s.last?.cheapest;
      const status = s.error ? h('span', { class: 'small bad' }, `Last check failed: ${s.error}`)
        : s.last ? h('span', { class: 'small muted' }, c ? `Cheapest: ${c.amount} ${c.currency}${c.name ? ` · ${c.name}` : ''} · ${s.last.total} listed · ${agoText(s.last.at)}` : `Nothing listed · ${agoText(s.last.at)}`)
          : h('span', { class: 'small faint' }, s.kind === 'exchange' ? 'Bulk exchange links can be opened, not price watched.' : 'Not checked yet.');
      const nameEdit = h('input', { value: s.name, maxlength: 80, class: 'ts-name', 'aria-label': 'Search name', onchange: (e) => save({ name: e.target.value }, 'Renamed') });
      return h('div', { class: 'panel stack ts-card' + (s.watch ? ' on' : '') },
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
          nameEdit, h('span', { class: 'pill' }, kind), h('span', { class: 'small faint' }, s.league), h('span', { class: 'spacer' }),
          h('button', { class: 'primary sm', title: s.link, onclick: () => call('trade:open', s.key).catch((e) => toast(cleanErr(e), true)) }, s.live ? 'Open live search' : 'Open'),
          s.kind !== 'exchange' ? check : null,
          h('button', { class: 'quiet sm', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: async () => redraw(await call('trade:move', { key: s.key, dir: -1 })) }, '↑'),
          h('button', { class: 'quiet sm', title: 'Move down', 'aria-label': 'Move down', disabled: i === d.list.length - 1, onclick: async () => redraw(await call('trade:move', { key: s.key, dir: 1 })) }, '↓'),
          h('button', { class: 'quiet sm', onclick: async () => { if (!confirm(`Remove "${s.name}"?`)) return; redraw(await call('trade:remove', s.key)); toast('Removed'); } }, 'Remove')),
        s.kind !== 'exchange' ? h('div', { class: 'row small', style: { gap: '8px', flexWrap: 'wrap' } }, watch, h('span', { class: 'muted' }, 'Tell me at'), amount, unit, h('span', { class: 'muted' }, 'or less,'), every) : null,
        status);
    };

    mount(page,
      pageHead('Trade searches', 'Save your trade searches and live searches with a name, and open them later in one click. Turn on the price watch and PoE Helper runs the search again every few minutes, cheapest first, and sends a Windows notification when something is at or under your price.'),
      h('div', { class: 'panel stack', style: { gap: '8px' } },
        h('b', {}, 'Add a search'),
        h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, nameIn, urlIn, h('button', { class: 'primary', onclick: add }, 'Save')),
        h('p', { class: 'small faint' }, 'Make the search on pathofexile.com/trade, then copy the link from the address bar. A live search link (ending in /live) is saved too.')),
      d.list.length ? d.list.map(card) : h('p', { class: 'small muted' }, 'No saved searches yet.'),
      h('p', { class: 'small faint' }, `The price watch only runs while PoE Helper is open (also in the tray). At most ${d.maxWatched} searches are watched at once.`));
  };
  draw(data);
}
window.poe.on('trade:watched', () => { if (currentPage === 'trade') renderTrade(); });

function section(title, desc, ...content) {
  return h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, title), sectionNote(title, desc)), ...content);
}
function sectionWith(title, desc, right, ...content) {
  return h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, title), sectionNote(title, desc), h('span', { class: 'spacer' }), right), ...content);
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

  let bg = null;
  try { bg = await call('overviewBg:get'); } catch { /* none */ }
  const bgUrl = typeof bg === 'string' ? bg : bg?.url;
  const bgButtons = h('div', { class: 'ov-hero-tools' },
    h('button', { class: 'quiet sm', title: 'Pick a picture from your PC for this page', onclick: async () => { try { await call('overviewBg:pick'); renderOverviewNow(); } catch (e) { toast(cleanErr(e), true); } } }, bgUrl ? 'Change picture' : 'Add a background picture'),
    bg ? h('button', { class: 'quiet sm', onclick: async () => { await call('overviewBg:reset'); renderOverviewNow(); } }, 'Remove') : null);
  mount(el,
    // the top of the page: your background picture (if you picked one) behind the title and the main numbers
    h('div', { class: 'ov-hero' + (bgUrl ? ' with-bg' : '') + (bg?.shipped ? ' shipped' : ''), style: bgUrl ? { backgroundImage: `url("${bgUrl}")` } : null },
      h('div', { class: 'ov-hero-in' },
        h('h1', {}, 'Overview'),
        h('p', { class: 'ov-hero-sub' }, `Playing ${S.league}${S.divine ? `. A Divine Orb is worth ${fmt(S.divine)} chaos right now.` : '.'}`),
        h('div', { class: 'figures ov-figures' },
          figure(latest ? chaosDiv(latest.totalChaos, latest.divine) : 'No snapshot', latest ? `Net worth, updated ${ago(Date.now() - latest.ts)}` : 'Net worth: take a snapshot on the WealthyExile page'),
          figure(report?.perHourChaos != null ? `${report.perHourChaos >= 0 ? '+' : ''}${fmt(report.perHourChaos)}c` : '–', 'Per hour over the last day', report?.perHourChaos >= 0 ? 'good' : report?.perHourChaos < 0 ? 'bad' : ''),
        )),
      bgButtons,
      bg?.credit ? h('span', { class: 'ov-hero-credit' }, bg.credit) : null),
    // net worth over the last day, from snapshots already taken (no new requests)
    (report?.series || []).length > 1 ? h('div', { style: { marginTop: '28px' } },
      h('div', { class: 'section-head' }, h('h2', {}, 'Net worth, last day'), h('span', { class: 'spacer' }), h('button', { class: 'quiet sm', onclick: () => go('networth') }, 'Open WealthyExile')),
      h('div', { class: 'panel' }, window.lineChart(report.series.filter((p) => p.ts >= latest.ts - 24 * 3600 * 1000), { divine: latest.divine, height: 150 }))) : null,
    // the things people open most, one click away
    h('div', { class: 'ov-shortcuts', style: { marginTop: '28px' } },
      [['pob', 'Snapshot my build', 'Path of Building: DPS, tree, upgrades'], ['trade', 'Trade searches', 'Saved searches and price watch'], ['lab', "Today's lab", 'The layout from poelab'], ['regex', 'Map regex', 'Copy a search for your stash'], ['farm', 'What to farm', 'What pays best right now'], ['filters', 'Loot filter', 'Your tiers and price changes']]
        .map(([page, title, note]) => h('button', { class: 'ov-card', onclick: () => go(page) }, h('b', {}, title), h('span', { class: 'small muted' }, note)))),
    h('div', { class: 'cols', style: { marginTop: '28px', alignItems: 'start' } },
      h('div', {},
        h('div', { class: 'section-head' }, h('h2', {}, 'Recent price checks'), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, `${window.Hotkey ? window.Hotkey.label(S.settings.hotkeyPrice) : S.settings.hotkeyPrice} over an item`)),
        historyList(S.history.slice(0, 10))),
      null));
}

function historyList(rows) {
  if (!rows.length) return h('div', { class: 'panel empty' }, 'Hover an item in game and press the hotkey. Checks show up here.');
  return h('div', { class: 'panel', style: { padding: '6px 18px' } }, h('table', {}, h('tbody', {}, rows.map((r, i) => h('tr', {},
    h('td', { style: i === 0 ? { borderTop: 0 } : null }, itemName(r.name, { divination: 'r-Divination', currency: 'r-Currency', gem: 'r-Gem', unique: 'r-Unique', 'unique-map': 'r-Unique', rare: 'r-Rare', magic: 'r-Magic' }[r.kind] || 'r-Normal')),
    h('td', { class: 'r', style: i === 0 ? { borderTop: 0 } : null }, r.total && r.total !== r.chaos ? h('span', {}, chaosDiv(r.total, S.divine), h('span', { class: 'faint' }, ` (${chaosDiv(r.chaos, S.divine)} each)`)) : chaosDiv(r.chaos, S.divine)),
    h('td', { class: 'r faint small', style: i === 0 ? { borderTop: 0 } : null }, ago(Date.now() - r.at)))))));
}

// ---------------- price check (manual) ----------------
// ---------------- net worth ----------------
let nwWindow = 24 * 3600 * 1000;
let nwAt = null; // the snapshot you picked in the list (its time); null = the newest
let nwTabs = null;
let nwCat = null; // the category picked on the dashboard
let nwFind = '';
const nwArt = {}; // item name -> picture, for snapshots taken before pictures were kept

// ---------------- WealthyExile dashboard ----------------
const WX_CATS = {
  Currency: 'Currency', Fragment: 'Fragments', Scarab: 'Scarabs', Essence: 'Essences', Fossil: 'Fossils', Resonator: 'Resonators', Oil: 'Oils',
  DeliriumOrb: 'Delirium orbs', DivinationCard: 'Divination cards', Unique: 'Uniques', Gem: 'Gems', Map: 'Maps', UniqueMap: 'Unique maps',
  BlightedMap: 'Blighted maps', Omen: 'Omens', Thread: 'Threads', Viscera: 'Wickerman parts', Cluster: 'Cluster jewels', Corpse: 'Corpses', Tattoo: 'Tattoos', Artifact: 'Expedition', Incubator: 'Incubators', Invitation: 'Invitations',
  Memory: 'Memories', Vial: 'Vials', Runegraft: 'Runegrafts', AllflameEmber: 'Allflame embers', Astrolabe: 'Astrolabes',
  EnshroudingCrystal: 'Enshrouding crystals', DjinnCoin: 'Djinn coins', Beast: 'Beasts', Ducat: 'Ducats', Corpse: 'Corpses', KalguuranRune: 'Runes',
};
const wxName = (c) => WX_CATS[c] || String(c || 'Other').replace(/([a-z])([A-Z])/g, '$1 $2');
const wxBase = (n) => String(n).replace(/ \((?:5|6)L\)$/, '').replace(/ \d+\/\d+$/, '').replace(/ T\d+$/, '');
const wxIcon = (item, size = 26) => {
  const url = item.i || nwArt[wxBase(item.n)];
  return url ? h('img', { src: url, alt: '', width: size, height: size, loading: 'lazy', style: { objectFit: 'contain' } }) : h('span', { class: 'wx-noimg', style: { width: size + 'px', height: size + 'px' } });
};

// WealthyExile: a bar with the league, last snapshot and session; the net worth (or session profit) chart next
// to the categories donut; then every item of the snapshot, filterable by stash tab.
let nwSession = null; // a session's id: the page shows that session (profit); null = all snapshots
let nwMode = 'total'; // chart: 'total' or 'rate' (per day, per hour in a session)
// opens WealthyExile on one session (the Atlas strategies page links its sessions here)
window.openNetworthSession = (id) => { nwSession = id || null; nwMode = 'total'; go('networth'); };
let nwCatView = 'donut';
let nwSort = { k: 'total', dir: -1 };
let nwOffTabs = new Set(); // stash tabs unticked in the item list
let nwShowAll = false;
let nwSetup = false;
let nwView = 'overview'; // 'overview' or 'changes' (what changed between two snapshots)
let nwFrom = ''; // the Changes tab's start: '' = the snapshot before, 's:<id>' = a session's start, 'h:<hours>', or a time
let nwTo = ''; // '' = the newest snapshot
let nwAllRows = {};
const NW_COLOURS = ['#e5c48b', '#4a90d9', '#f08c00', '#9db8d6', '#b0702a', '#6d8fbf', '#f2c46d', '#3f5f8f', '#c98a4b', '#7fb3e0'];

function nwDonut(cats, total) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'nw-donut');
  svg.setAttribute('role', 'img');
  const R = 46, C = 2 * Math.PI * R;
  let off = 0;
  cats.forEach((g, i) => {
    const part = g.total / total;
    if (part <= 0) return;
    const c = document.createElementNS(NS, 'circle');
    for (const [k, v] of Object.entries({ cx: 60, cy: 60, r: R, fill: 'none', stroke: NW_COLOURS[i % NW_COLOURS.length], 'stroke-width': 14, 'stroke-dasharray': `${Math.max(0.5, part * C - 1)} ${C}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 60 60)' })) c.setAttribute(k, v);
    const t = document.createElementNS(NS, 'title'); t.textContent = `${wxName(g.id)}: ${Math.round(part * 1000) / 10}%`; c.append(t);
    svg.append(c);
    off += part * C;
  });
  return svg;
}

function nwItems(latest, tabNames, snapBtn) {
  const d = latest.divine;
  const items = latest.items || [];
  // pictures for older snapshots: one lookup by name, then redraw
  const lack = items.slice(0, 80).filter((i) => !i.i && !(wxBase(i.n) in nwArt));
  const missing = [...new Map(lack.map((i) => [wxBase(i.n), `${wxBase(i.n)}\t${i.c || ''}`])).values()].slice(0, 60);
  if (missing.length) {
    for (const i of lack) nwArt[wxBase(i.n)] = null;
    call('art:icons', missing).then((m) => { let any = false; for (const [k, v] of Object.entries(m || {})) if (v) { nwArt[k] = v; any = true; } if (any && currentPage === 'networth') renderNetworth(); }).catch(() => {});
  }
  // with tabs picked, an item counts only when the snapshot knows its tab
  const inTab = (i) => (i.t?.length ? i.t.some((t) => !nwOffTabs.has(t)) : !nwOffTabs.size);
  const q = nwFind.trim().toLowerCase();
  const shown = items.filter((i) => inTab(i) && (!nwCat || (i.c || 'Other') === nwCat) && (!q || i.n.toLowerCase().includes(q)));
  const key = { name: (i) => i.n.toLowerCase(), qty: (i) => i.q, each: (i) => i.e, total: (i) => i.q * i.e }[nwSort.k];
  shown.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * nwSort.dir; });
  const sum = shown.reduce((a, i) => a + i.q * i.e, 0);
  const th = (k, label, cls = '') => h('th', { class: cls, 'aria-sort': nwSort.k === k ? (nwSort.dir < 0 ? 'descending' : 'ascending') : 'none' },
    h('button', { class: 'nw-sort', onclick: () => { nwSort = { k, dir: nwSort.k === k ? -nwSort.dir : (k === 'name' ? 1 : -1) }; renderNetworth(); } }, label, nwSort.k === k ? (nwSort.dir < 0 ? ' ↓' : ' ↑') : ''));
  const find = h('input', { type: 'search', placeholder: 'Search…', value: nwFind, 'aria-label': 'Search items', oninput: (e) => { nwFind = e.target.value; clearTimeout(window.wxFindT); window.wxFindT = setTimeout(() => { renderNetworth(); }, 250); } });
  const LIMIT = 100;
  return h('div', { class: 'nw-panel nw-items-box' },
    h('div', { class: 'nw-ph' }, h('h2', {}, nwOffTabs.size ? 'Items in the chosen tabs' : 'Items recorded in the last snapshot'), h('span', { class: 'small faint' }, `${shown.length} items · ${chaosDiv(sum, d)}`)),
    h('div', { class: 'nw-items-grid one' },
      h('div', { style: { minWidth: 0 } },
        h('div', { class: 'nw-toolbar' }, find,
          nwCat ? h('button', { class: 'pill-btn on', onclick: () => { nwCat = null; renderNetworth(); }, title: 'Show every category' }, `${wxName(nwCat)} ✕`) : null,
          h('span', { class: 'spacer' }), snapBtn),
        shown.length ? h('table', { class: 'wx-items nw-table' },
          h('thead', {}, h('tr', {}, th('name', 'Name'), h('th', {}, 'Tab'), th('qty', 'Quantity', 'r'), th('each', 'Price', 'r'), th('total', 'Total price', 'r'))),
          h('tbody', {}, (nwShowAll ? shown : shown.slice(0, LIMIT)).map((i) => h('tr', {},
            h('td', {}, h('span', { class: 'nw-name' }, wxIcon(i, 30), h('span', {}, i.n))),
            h('td', {}, h('span', { class: 'nw-chips' }, (i.t || []).slice(0, 3).map((t) => h('span', { class: 'nw-chip', title: t }, t.length > 12 ? `${t.slice(0, 11)}…` : t)), (i.t || []).length > 3 ? h('span', { class: 'nw-chip' }, `+${i.t.length - 3}`) : null)),
            h('td', { class: 'r' }, fmt(i.q)),
            h('td', { class: 'r muted' }, window.UI.money(i.e, d)),
            h('td', { class: 'r' }, window.UI.money(i.q * i.e, d)))))) : h('p', { class: 'small muted', style: { padding: '12px' } }, 'Nothing matches.'),
        !nwShowAll && shown.length > LIMIT ? h('button', { class: 'quiet sm', style: { margin: '10px 0' }, onclick: () => { nwShowAll = true; renderNetworth(); } }, `Show all ${shown.length}`) : null)));
}


// ---- WealthyExile, Changes: what changed between two snapshots and where the profit came from ----
async function nwChanges(sessions, d) {
  const now = Date.now();
  const fromTs = nwFrom.startsWith('s:') ? sessions.find((x) => x.id === nwFrom.slice(2))?.start
    : nwFrom.startsWith('h:') ? now - Number(nwFrom.slice(2)) * 3600000 : nwFrom === 'first' ? 1 : nwFrom ? Number(nwFrom) : null;
  let C = null;
  try { C = await call('networth:compare', { from: fromTs || null, to: nwTo ? Number(nwTo) : null }); } catch { /* none */ }
  const list = (C?.list || []).slice().reverse();
  const r = C?.result;
  if (!r) return h('div', { class: 'nw-panel' }, h('p', { class: 'muted' }, list.length ? 'Take one more snapshot to see what changed.' : 'Take two snapshots to see what changed between them.'));
  const dd = r.to.divine || d;
  const money = (v, o = {}) => window.UI.money(v, dd, o);
  const signed = (v) => window.UI.money(v, dd, { sign: true });
  const signedText = (v) => `${v >= 0 ? '+' : '−'}${chaosDiv(Math.abs(v), dd)}`;
  const when = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const span = (hrs) => (hrs < 1 / 60 ? 'under a minute' : hrs < 1 ? `${Math.round(hrs * 60)} min` : hrs < 48 ? `${(Math.round(hrs * 10) / 10)} h` : `${Math.round(hrs / 24)} days`);
  const snapOpt = (x, sel) => h('option', { value: String(x.ts), selected: sel }, `${when(x.ts)} · ${chaosDiv(x.chaos, d)}${x.reason === 'auto' ? ' · auto' : ''}`);
  const fromSel = h('select', { 'aria-label': 'Compare from', onchange: (e) => { nwFrom = e.target.value; nwAllRows = {}; renderNetworth(); } },
    h('option', { value: '', selected: !nwFrom }, 'The snapshot before'),
    h('option', { value: 'h:1', selected: nwFrom === 'h:1' }, '1 hour ago'),
    h('option', { value: 'h:24', selected: nwFrom === 'h:24' }, '24 hours ago'),
    h('option', { value: 'h:168', selected: nwFrom === 'h:168' }, 'A week ago'),
    h('option', { value: 'first', selected: nwFrom === 'first' }, 'My first snapshot'),
    sessions.length ? h('optgroup', { label: 'A session\'s start' }, sessions.slice(0, 10).map((x) => h('option', { value: `s:${x.id}`, selected: nwFrom === `s:${x.id}` }, `${x.name} (${when(x.start)})`))) : null,
    h('optgroup', { label: 'A snapshot' }, list.slice(1, 40).map((x) => snapOpt(x, nwFrom === String(x.ts)))));
  const toSel = h('select', { 'aria-label': 'Compare to', onchange: (e) => { nwTo = e.target.value; nwAllRows = {}; renderNetworth(); } },
    h('option', { value: '', selected: !nwTo }, 'The newest snapshot'),
    list.slice(1, 40).map((x) => snapOpt(x, nwTo === String(x.ts))));

  // the headline: total change, per hour, and the four parts it's made of
  const part = (label, v, help) => h('div', { class: 'cx-part' + (v > 0 ? ' up' : v < 0 ? ' down' : '') , title: help },
    h('span', { class: 'cx-pl' }, label), h('b', {}, signed(v)));
  const head = h('div', { class: 'nw-panel cx-head' },
    h('div', { class: 'cx-total' },
      h('span', { class: 'small muted' }, `Change in ${span(r.hours)}`),
      h('b', { class: 'cx-big ' + (r.total >= 0 ? 'up' : 'down') }, signed(r.total)),
      h('span', { class: 'small muted' }, r.perHour != null ? [signed(r.perHour), ' an hour'] : `${chaosDiv(r.from.chaos, d)} → ${chaosDiv(r.to.chaos, d)}`)),
    h('div', { class: 'cx-parts' },
      part('Loot', r.loot, 'Items you have more of, at today\'s price'),
      part('Spent or sold', r.spent, 'Items you have fewer of: used, sold, or moved out of your tracked tabs'),
      part('Price moves', r.prices, 'What you held all along, worth more or less now'),
      Math.abs(r.other) >= 1 ? part('Small items', r.other, 'Items under 1c, which snapshots don\'t list one by one') : null));

  // where it came from: each category's net change (bars: + blue to the right, − orange to the left)
  // the 10 biggest changes either way, best first (a big loss must not drop off the end)
  const cats = [...r.byCat].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 10).sort((a, b) => b.net - a.net);
  const mx = Math.max(1, ...cats.map((g) => Math.abs(g.net)));
  const catBox = h('div', { class: 'nw-panel' },
    h('div', { class: 'nw-ph' }, h('h2', {}, 'Where it came from'), h('span', { class: 'small faint' }, 'by category')),
    cats.length ? h('div', { class: 'cx-cats' }, cats.map((g) => h('div', { class: 'cx-cat', title: `Loot ${signedText(g.loot)}, spent ${signedText(g.spent)}, price moves ${signedText(g.prices)}` },
      h('span', { class: 'n' }, wxName(g.c)),
      h('span', { class: 'cx-track' }, h('i', { class: g.net >= 0 ? 'up' : 'down', style: { width: `${Math.max(2, (Math.abs(g.net) / mx) * 50)}%` } })),
      h('b', { class: 'r ' + (g.net >= 0 ? 'good' : 'bad') }, signed(g.net))))) : h('p', { class: 'small muted' }, 'Nothing changed.'),
    r.tabs.length ? h('div', { class: 'cx-tabs small' }, h('span', { class: 'muted' }, 'By tab: '), r.tabs.slice(0, 8).map((t) => h('span', { class: 'cx-tab ' + (t.v >= 0 ? 'up' : 'down') }, `${t.t} ${t.v >= 0 ? '+' : '−'}${chaosDiv(Math.abs(t.v), d)}`))) : null);

  // the items: new loot, what's gone, and price moves
  const rows = (key, items, n, cols) => {
    const all = nwAllRows[key];
    const shown = all ? items : items.slice(0, n);
    return [h('table', { class: 'wx-items nw-table cx-table' },
      h('thead', {}, h('tr', {}, cols.map(([l, c]) => h('th', { class: c || '' }, l)))),
      h('tbody', {}, shown.map((i) => h('tr', {}, cols.map(([, c, f]) => h('td', { class: c || '' }, f(i))))))),
    items.length > n ? h('button', { class: 'quiet sm', onclick: () => { nwAllRows[key] = !all; renderNetworth(); } }, all ? 'Show fewer' : `Show all ${items.length}`) : null];
  };
  const nameCell = (i) => h('span', { class: 'nw-name' }, wxIcon(i, 26), h('span', {}, i.n));
  const box = (title, sub, items, key, n, cols, empty) => h('div', { class: 'nw-panel' },
    h('div', { class: 'nw-ph' }, h('h2', {}, title), h('span', { class: 'small faint' }, sub)),
    items.length ? rows(key, items, n, cols) : h('p', { class: 'small muted' }, empty));
  const gained = box('New loot', `${r.gained.length} items · ${signedText(r.loot)}`, r.gained, 'gained', 12,
    [['Item', '', nameCell], ['Got', 'r', (i) => `+${fmt(i.dq)}`], ['Each', 'r muted', (i) => money(i.e1)], ['Worth', 'r', (i) => h('b', { class: 'good' }, signed(i.fromQty))]], 'No new items.');
  const lost = box('Spent or sold', `${r.lost.length} items`, r.lost, 'lost', 8,
    [['Item', '', nameCell], ['Gone', 'r', (i) => `−${fmt(-i.dq)}`], ['Worth', 'r', (i) => h('b', { class: 'bad' }, signed(i.fromQty))]], 'Nothing used or sold.');
  const moved = r.moved.length ? h('details', { class: 'nw-panel cx-moves', open: !!nwAllRows.movesOpen, ontoggle: (e) => { nwAllRows.movesOpen = e.target.open; } },
    h('summary', {}, h('b', {}, 'Price moves'), h('span', { class: 'small faint' }, ` · ${r.moved.length} items you held changed price: ${signedText(r.prices)}`)),
    rows('moved', r.moved, 10, [['Item', '', nameCell], ['You hold', 'r', (i) => fmt(i.q0)], ['Price', 'r muted', (i) => [money(i.e0), ' → ', money(i.e1)]], ['Change', 'r', (i) => h('b', { class: i.fromPrice >= 0 ? 'good' : 'bad' }, signed(i.fromPrice))]])) : null;

  return h('div', { class: 'cx' },
    h('div', { class: 'nw-panel cx-pick row' }, h('span', { class: 'muted' }, 'From'), fromSel, h('span', { class: 'muted' }, 'to'), toSel,
      h('span', { class: 'small faint' }, `${when(r.from.ts)} → ${when(r.to.ts)}`)),
    head,
    h('div', { class: 'nw-two' }, gained, h('div', { class: 'cx-col' }, catBox, lost)),
    moved);
}

function renderNetworth() { return window.UI.keepScroll(() => renderNetworthNow()); }
async function renderNetworthNow() {
  await refreshState();
  const el = $('page-networth');
  const st = S.settings;
  const ready = st.accountName && st.sessionSet;
  let report = null;
  try { report = await call('networth:report', 24 * 365 * 3600000, null); } catch { /* none */ }
  const sessions = (report?.sessions || []).slice().reverse();
  const running = sessions.find((s) => !s.end);
  const sess = nwSession ? sessions.find((s) => s.id === nwSession) : null;
  if (nwSession && !sess) nwSession = null;
  const all = report?.series || [];
  const latest = report?.latest;
  const d = latest?.divine;
  const selected = new Set(st.selectedTabs || []);

  // ---- the bar on top ----
  const snapBtn = h('button', { class: 'primary', disabled: !ready || !selected.size, onclick: async () => {
    snapBtn.disabled = true; snapBtn.textContent = 'Taking snapshot…';
    try { await call('networth:snapshot'); toast('Snapshot taken: here\'s what changed'); nwView = 'changes'; nwFrom = ''; nwTo = ''; nwAllRows = {}; } catch { /* toast */ }
    renderNetworth();
  }, title: `Costs ${selected.size} GGG ${selected.size === 1 ? 'request' : 'requests'} (one per tracked tab)` }, 'Take snapshot ', window.UI.icon('plusc', { size: 16 }));
  const sessBtn = h('button', { class: running ? 'danger' : '', disabled: !ready || !selected.size, onclick: async () => {
    sessBtn.disabled = true; sessBtn.textContent = running ? 'Stopping…' : 'Starting…';
    try { const s = await call('networth:session', running ? 'stop' : 'start'); if (!running && s) nwSession = s.id; toast(running ? `${running.name} ended` : `${s.name} started: snapshots now count towards it`); } catch { /* toast */ }
    renderNetworth();
  } }, window.UI.icon(running ? 'stop' : 'play', { size: 15 }), running ? ' Stop session' : ' Start session');
  const fact = (ic, label, value, extra) => h('div', { class: 'nw-fact' }, h('span', { class: 'nw-fact-ico', 'aria-hidden': 'true' }, window.UI.icon(ic, { size: 18 })), h('div', {}, h('div', { class: 'nw-fact-l' }, label), h('div', { class: 'nw-fact-v' }, value, extra || null)));
  const played = (s) => ((s.end || Date.now()) - s.start);
  const dur = (ms) => { const m = Math.floor(ms / 60000); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const sessSel = h('select', { class: 'nw-sess-sel', 'aria-label': 'Session', onchange: (e) => { nwSession = e.target.value || null; nwMode = 'total'; renderNetworth(); } },
    h('option', { value: '' }, 'All snapshots'),
    sessions.map((s) => h('option', { value: s.id, selected: s.id === nwSession }, `${s.name}${s.end ? '' : ' (active)'}`)));
  const bar = h('div', { class: 'nw-bar' },
    fact('history', 'Last snapshot', latest ? ago(Date.now() - latest.ts) : 'none yet'),
    fact('hourglass', 'Session', sessSel, running ? h('span', { class: 'nw-live' }, '● Active') : null),
    sess ? fact('timer', 'Played', dur(played(sess))) : null,
    h('span', { class: 'spacer' }),
    sessBtn,
    h('button', { class: 'quiet nw-more' + (nwSetup ? ' on' : ''), 'aria-expanded': nwSetup ? 'true' : 'false', title: 'Tracked tabs, automatic snapshots, history', 'aria-label': 'Settings for WealthyExile', onclick: () => { nwSetup = !nwSetup; renderNetworth(); } }, window.UI.icon('dots', { size: 18 })));

  // ---- stash tabs: pick tabs, and the whole page (chart, categories, items) shows only them ----
  const tabNames = Object.keys(latest?.byTab || {}).sort((a, b) => (latest.byTab[b] || 0) - (latest.byTab[a] || 0));
  for (const t of [...nwOffTabs]) if (!tabNames.includes(t)) nwOffTabs.delete(t);
  const onTab = (t) => !nwOffTabs.has(t);
  const tabsOn = tabNames.filter(onTab);
  // a snapshot's value in the chosen tabs (older snapshots without tab values count whole)
  const inTabs = (p) => (nwOffTabs.size && p.tabs ? Object.entries(p.tabs).reduce((a, [t, v]) => a + (onTab(t) ? v : 0), 0) : p.chaos);
  const allFiltered = all.map((p) => ({ ...p, chaos: inTabs(p) }));
  const latestTotal = nwOffTabs.size ? tabsOn.reduce((a, t) => a + (latest.byTab[t] || 0), 0) : latest?.totalChaos;
  const tabBar = latest && tabNames.length ? h('div', { class: 'nw-panel nw-tabbar-top' },
    h('div', { class: 'nw-ph' }, h('h2', {}, 'Stash tabs'),
      h('span', { class: 'small faint' }, nwOffTabs.size ? `Showing ${tabsOn.length} of ${tabNames.length} tabs: ${chaosDiv(latestTotal || 0, d)}` : `Showing all ${tabNames.length} tabs. Click a tab to see only it.`),
      h('span', { class: 'spacer' }),
      nwOffTabs.size ? h('button', { class: 'quiet sm', onclick: () => { nwOffTabs = new Set(); renderNetworth(); } }, 'Show all tabs') : null),
    !(latest.items || []).some((i) => i.t?.length) ? h('p', { class: 'small faint' }, 'This snapshot is older than tab tracking: take a new one to see each tab\'s items.') : null,
    latest.unread?.length ? h('p', { class: 'small warn nw-unread' }, `⚠ ${latest.unread.join(', ')}: GGG sends no items for a map stash tab, so the maps in it can't be counted. Maps you keep in a normal or quad tab are counted.`) : null,
    h('div', { class: 'nw-tabchips', role: 'group', 'aria-label': 'Stash tabs to show' }, tabNames.map((t) => {
      const on = onTab(t);
      const only = nwOffTabs.size && tabsOn.length === 1 && on;
      return h('button', { class: 'nw-tabchip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false',
        title: nwOffTabs.size ? (on ? 'Click to leave this tab out' : 'Click to add this tab') : 'Click to see only this tab',
        onclick: () => {
          if (!nwOffTabs.size) nwOffTabs = new Set(tabNames.filter((x) => x !== t)); // first click: only this tab
          else if (on && !only) nwOffTabs.add(t);
          else if (on && only) nwOffTabs = new Set(); // the last one: back to every tab
          else nwOffTabs.delete(t);
          renderNetworth();
        } },
        h('span', { class: 'chk', 'aria-hidden': 'true' }, on ? '✓' : '+'), h('span', { class: 'n' }, t), h('span', { class: 'v' }, chaosDiv(latest.byTab[t] || 0, d)));
    }))) : null;

  // ---- chart ----
  let pts, title, unit, head;
  if (sess) {
    const base = [...all].reverse().find((p) => p.ts <= sess.start + 60000) || all.find((p) => p.ts >= sess.start);
    const inS = allFiltered.filter((p) => p.ts >= (base?.ts ?? sess.start) && p.ts <= (sess.end ? sess.end + 120000 : Infinity));
    const baseV = base ? inTabs(base) : 0;
    const profit = inS.map((p) => ({ ts: p.ts, chaos: p.chaos - baseV, divine: p.divine }));
    pts = nwMode === 'rate' ? profit.filter((p) => p.ts - profit[0].ts >= 30 * 60000).map((p) => ({ ...p, chaos: p.chaos / ((p.ts - profit[0].ts) / 3600000) })) : profit;
    const last = profit[profit.length - 1];
    head = last ? window.UI.money(last.chaos, d, { sign: true }) : '–';
    title = [['total', 'Profit'], ['rate', 'Profit / h']];
  } else {
    pts = allFiltered;
    // income per day: the change over the day before each snapshot (or since the first one), only once at
    // least an hour lies between them; a few minutes don't say anything about a day
    if (nwMode === 'rate') {
      pts = allFiltered.map((p) => {
        const from = allFiltered.find((q) => q.ts >= p.ts - 86400000) || allFiltered[0];
        const days = (p.ts - from.ts) / 86400000;
        return days >= 1 / 24 ? { ...p, chaos: (p.chaos - from.chaos) / days } : null;
      }).filter(Boolean);
    }
    const first = allFiltered[0];
    head = latest ? window.UI.money(latestTotal, d) : '–';
    title = [['total', nwOffTabs.size ? 'Worth in these tabs' : 'Net worth'], ['rate', 'Income / d']];
    if (first && latest && first.ts !== latest.ts) { const g = latestTotal - first.chaos; head = [h('span', { class: 'delta-pill ' + (g >= 0 ? 'up' : 'down') }, window.UI.money(g, d, { sign: true })), head]; }
  }
  unit = d && Math.max(1, ...pts.map((p) => Math.abs(p.chaos))) > d * 3 ? 'd' : 'c';
  const bands = sess ? [] : sessions.map((s) => ({ from: s.start, to: s.end || Date.now(), label: s.name, on: s.id === running?.id }));
  const chartBox = h('div', { class: 'nw-panel nw-chart' },
    h('div', { class: 'nw-ph' },
      h('div', { class: 'seg' }, title.map(([k, l]) => h('button', { class: nwMode === k ? 'on' : '', 'aria-pressed': nwMode === k ? 'true' : 'false', onclick: () => { nwMode = k; renderNetworth(); } }, l))),
      h('span', { class: 'spacer' }), h('b', { class: 'nw-big' }, head)),
    pts.length ? window.lineChart(pts, { divine: d, height: 230, bands, unit, zero: !!sess || nwMode === 'rate' })
      : h('div', { class: 'nw-empty' }, window.UI.icon('chart', { size: 28 }), h('span', {}, nwMode === 'rate' ? (sess ? 'Profit per hour shows after the session has run for half an hour.' : 'Income per day needs snapshots at least an hour apart.') : 'Take a snapshot to start the chart.')));

  // ---- categories ----
  const groups = new Map();
  for (const i of (latest?.items || []).filter((i) => (i.t?.length ? i.t.some(onTab) : !nwOffTabs.size))) { const c = i.c || 'Other'; if (!groups.has(c)) groups.set(c, { id: c, total: 0, items: [] }); const g = groups.get(c); g.total += i.q * i.e; g.items.push(i); }
  const cats = [...groups.values()].sort((a, b) => b.total - a.total);
  const tot = cats.reduce((a, g) => a + g.total, 0) || 1;
  const pct = (v) => { const x = Math.round((v / tot) * 1000) / 10; return x > 0 ? `${x}%` : '<0.1%'; };
  const catRow = (g, i) => h('button', { class: 'nw-cat' + (nwCat === g.id ? ' on' : ''), 'aria-pressed': nwCat === g.id ? 'true' : 'false', title: 'Show only these items', onclick: () => { nwCat = nwCat === g.id ? null : g.id; renderNetworth(); } },
    h('i', { class: 'dot', style: { background: NW_COLOURS[i % NW_COLOURS.length] } }), wxIcon(g.items[0], 22), h('span', { class: 'n' }, wxName(g.id)),
    nwCatView === 'list' ? h('span', { class: 'small muted' }, chaosDiv(g.total, d)) : null, h('span', { class: 'p' }, pct(g.total)));
  const catBox = h('div', { class: 'nw-panel nw-cats' },
    h('div', { class: 'nw-ph' }, h('h2', {}, 'Categories'), h('span', { class: 'spacer' }),
      h('div', { class: 'seg' }, [['donut', 'Donut'], ['list', 'List']].map(([k, l]) => h('button', { class: nwCatView === k ? 'on' : '', onclick: () => { nwCatView = k; renderNetworth(); } }, l)))),
    cats.length ? h('div', { class: 'nw-cats-body' + (nwCatView === 'list' ? ' list' : '') },
      nwCatView === 'donut' ? h('div', { class: 'nw-donut-wrap' }, nwDonut(cats, tot), h('div', { class: 'nw-donut-mid' }, h('span', { class: 'small muted' }, 'Total'), window.UI.money(nwOffTabs.size ? tot : (latest.totalChaos || tot), d))) : null,
      h('div', { class: 'nw-cat-list' }, cats.map(catRow))) : h('p', { class: 'small muted' }, 'Take a snapshot to see your categories.'));

  // ---- a session: its result and what each tab gained ----
  let sessBox = null;
  if (sess) {
    const base = [...all].reverse().find((p) => p.ts <= sess.start + 60000) || all.find((p) => p.ts >= sess.start);
    const end = [...all].reverse().find((p) => p.ts <= (sess.end ? sess.end + 120000 : Infinity));
    const profit = base && end ? end.chaos - base.chaos : 0;
    const hrs = played(sess) / 3600000;
    const tabs = base?.tabs && end?.tabs ? [...new Set([...Object.keys(base.tabs), ...Object.keys(end.tabs)])].map((t) => [t, (end.tabs[t] || 0) - (base.tabs[t] || 0)]).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])) : [];
    const mx = Math.max(1, ...tabs.map(([, v]) => Math.abs(v)));
    const sign = (v) => `${v >= 0 ? '+' : '−'}${chaosDiv(Math.abs(v), d)}`;
    sessBox = h('div', { class: 'nw-two' },
      h('div', { class: 'nw-panel' },
        h('div', { class: 'nw-ph' }, h('h2', {}, 'Change per tab'), h('span', { class: 'small faint' }, 'since the session started')),
        tabs.length ? h('div', { class: 'nw-tabbars' }, tabs.map(([t, v]) => h('div', { class: 'nw-tabbar' },
          h('span', { class: 'n' }, t),
          h('span', { class: 'track' }, h('i', { class: v >= 0 ? 'up' : 'down', style: { width: `${Math.max(2, (Math.abs(v) / mx) * 100)}%` } })),
          h('b', { class: v >= 0 ? 'good' : 'bad' }, sign(v))))) : h('p', { class: 'small muted' }, 'Take a snapshot during the session to see what each tab gained.')),
      h('div', { class: 'nw-panel nw-result' },
        h('div', { class: 'nw-ph' }, h('h2', {}, 'Session result')),
        h('div', { class: 'nw-res-grid' },
          h('span', {}, ''), h('span', { class: 'small faint r' }, 'Total'), h('span', { class: 'small faint r' }, '/ h'),
          h('b', {}, 'Profit'), h('b', { class: 'r ' + (profit >= 0 ? 'good' : 'bad') }, sign(profit)), h('b', { class: 'r' }, hrs > 0.05 ? sign(profit / hrs) : '–')),
        h('div', { class: 'nw-res-grid two' },
          h('span', { class: 'muted' }, 'Played'), h('b', { class: 'r' }, dur(played(sess))),
          h('span', { class: 'muted' }, 'Snapshots'), h('b', { class: 'r' }, String(all.filter((p) => p.ts >= sess.start - 60000 && p.ts <= (sess.end || Infinity) + 120000).length)),
          h('span', { class: 'muted' }, 'Started'), h('b', { class: 'r' }, new Date(sess.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
          h('span', { class: 'muted' }, sess.end ? 'Ended' : 'Status'), h('b', { class: 'r' }, sess.end ? new Date(sess.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '● running'))));
  }

  // ---- set up: tracked tabs, automatic snapshots, history ----
  const perHourReq = st.autoSnapshotMin ? Math.round((60 / Math.max(15, st.autoSnapshotMin)) * selected.size * 10) / 10 : 0;
  const setupOpen = nwSetup || !ready || !selected.size;
  const setup = setupOpen ? h('div', { class: 'nw-panel stack' },
    h('div', { class: 'nw-ph' }, h('h2', {}, 'Tracked tabs and automatic snapshots'), h('span', { class: 'spacer' }),
      h('button', { class: 'quiet sm', disabled: !ready, onclick: async () => { nwTabs = await call('networth:tabs', !!nwTabs); renderNetworth(); } }, nwTabs ? 'Reload tab list' : 'Load tab list')),
    !ready ? h('p', { class: 'small muted' }, 'Add your account name and POESESSID in Settings first.')
      : !nwTabs ? h('p', { class: 'small muted' }, 'Load your tab list, then tick the tabs to track. Loading costs 1 request and is remembered for 6 hours.')
        : h('div', { class: 'tabs-pick' }, nwTabs.filter((t) => !t.hidden).map((t) => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: selected.has(t.index), onchange: (e) => { e.target.checked ? selected.add(t.index) : selected.delete(t.index); } }),
          t.colour ? h('span', { class: 'swatch', style: { background: '#' + t.colour } }) : null, t.name))),
    nwTabs ? h('div', { class: 'row' }, h('button', { onclick: async () => { await call('networth:select', [...selected]); toast(`Tracking ${selected.size} tabs`); renderNetworth(); } }, 'Save selection')) : null,
    h('div', { class: 'row small' }, h('span', { class: 'muted' }, 'Automatic snapshots'),
      h('select', { onchange: async (e) => { await call('settings:set', { autoSnapshotMin: Number(e.target.value) }); renderNetworth(); } },
        [0, 15, 30, 60, 120].map((m) => h('option', { value: m, selected: Number(st.autoSnapshotMin) === m }, m ? `Every ${m} minutes` : 'Off'))),
      st.autoSnapshotMin ? h('span', { class: 'faint' }, `About ${perHourReq} requests an hour while you play`) : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'danger sm', onclick: async () => { if (confirm(`Delete all snapshots for ${S.league}?`)) { await call('networth:clear'); nwSession = null; renderNetworth(); } } }, 'Delete history'))) : null;

  const viewTabs = latest ? h('div', { class: 'cx-views', role: 'tablist' }, [['overview', 'Overview'], ['changes', 'Changes']].map(([k, l]) => h('button', {
    class: 'cx-view' + (nwView === k ? ' on' : ''), role: 'tab', 'aria-selected': nwView === k ? 'true' : 'false', onclick: () => { nwView = k; renderNetworth(); } }, l)),
  h('span', { class: 'spacer' }), nwView === 'changes' ? snapBtn : null) : null;
  if (nwView === 'changes' && latest) {
    mount(el, h('div', { class: 'nw-page' }, bar, setup, viewTabs, await nwChanges(sessions, d)));
    return;
  }
  mount(el,
    h('div', { class: 'nw-page' },
      bar,
      setup,
      viewTabs,
      tabBar,
      h('div', { class: 'nw-top' }, chartBox, catBox),
      sessBox,
      latest ? null : h('div', { class: 'nw-panel row' }, snapBtn, h('span', { class: 'small muted' }, 'Your net worth, categories and items show up here after your first snapshot.')),
      latest ? nwItems(latest, tabNames, snapBtn) : null));
}

// ---------------- loot filter ----------------
let ecoRules = null;

/** The original filter sections, now shown inside tabs of the FilterBlade-style page (filters.js). */
// The loot filter file: which FilterBlade filter, writing it, the folder (in Settings).
function filterFileBox(info, st, redraw) {
  const writeNow = async () => {
    try {
      const p = await call('filter:write');
      toast(`Written to ${p.split(/[\\/]/).pop()}. Zone or reload the filter in game.`);
      redraw();
    } catch { /* toast */ }
  };
  const helperName = info.base ? info.base.replace(/\.filter$/i, ' (helper).filter') : null;
  return h('div', { class: 'panel stack' },
    h('div', { class: 'row' },
      h('select', { 'aria-label': 'Base filter', onchange: async (e) => { await call('settings:set', { baseFilter: e.target.value }); redraw(); } },
        h('option', { value: '' }, 'Choose your filter'),
        info.files.map((f) => h('option', { value: f.name, selected: f.name === info.base }, f.display || f.name.replace(/\.filter$/i, '')))),
      h('span', { class: 'small muted' }, !info.files.length ? 'No .filter files found in the folder below.' : info.base ? (info.lastWrite ? `Written to "${helperName}" ${ago(Date.now() - info.lastWrite.at)}.` : `Will be written to "${helperName}".`) : 'Pick the filter you normally use.'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'primary', onclick: writeNow, disabled: !info.base }, 'Write filter')),
    h('div', { class: 'row' },
      toggle(st.autoWatchFilter, (v) => call('settings:set', { autoWatchFilter: v }), 'Rewrite automatically when you download a new version of the filter')),
    (() => {
      const dirInput = h('input', { value: st.filterDir || info.dir || '', style: { flex: 1, minWidth: '300px' }, 'aria-label': 'Filter folder' });
      return h('details', {}, h('summary', {}, `Filter folder: ${info.dir || 'not found'}`),
        h('div', { class: 'row', style: { marginTop: '8px' } }, dirInput, h('button', { onclick: async () => { await call('settings:set', { filterDir: dirInput.value.trim() }); redraw(); } }, 'Use this folder')));
    })());
}

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
  const r0 = initial || { action: 'Show', label: '', conditions: [], style: { fontSize: 42, text: [255, 42, 42, 255], border: [255, 42, 42, 255], background: [255, 255, 255, 255], sound: { id: 6, volume: 300 }, beam: { color: 'Red' }, icon: { size: 0, color: 'Red', shape: 'Star' } } };
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
      else toast(save ? `${label}: ${H.label(save)}` : 'Hotkey switched off');
      pages[currentPage]().catch(() => {});
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
      u?.state !== 'dev' && u?.state !== 'ready' ? h('button', { disabled: u?.state === 'checking' || u?.state === 'downloading', onclick: async () => draw(await call('update:check')) }, 'Check now') : null,
      h('button', { title: 'Opens the folder with poe-helper.log and poe-helper-errors.log. Send these when something broke.', onclick: () => call('app:openLogs').catch(() => {}) }, 'Open logs'),
      h('button', { title: 'Puts the logs, your settings (without your login) and your loot filters in one zip on your Desktop. Nothing is sent: pass the file on to whoever helps you.', onclick: async (e) => {
        e.target.disabled = true;
        try { const r = await call('app:report'); toast(`Report saved: ${r.file.split(/[\\/]/).pop()} (on your Desktop). Send that file.`); } catch (err) { toast(`Couldn't make the report: ${err.message}`); } finally { e.target.disabled = false; }
      } }, 'Make a report'));
  };
  call('update:status').then(draw).catch(() => {});
  window.poe.on('update:status', draw);
  return [h('span', {}, h('b', {}, `Version ${S.settings.version}`)), text, btns];
}

const SH_SOUNDS = ['ShDivine', 'ShMirror', 'ShExalted', 'ShChaos', 'ShVaal', 'ShRegal', 'ShFusing', 'ShAlchemy', 'ShBlessed', 'ShGeneral'];
function gameSoundRows(st, redraw = () => window.renderDesigner?.()) {
  const own = st.gameSoundFiles || {};
  const got = st.gameSounds?.files || {};
  const save = async (next) => { await call('settings:set', { gameSoundFiles: next }); S.settings.gameSoundFiles = next; window.UI.setGameSounds(window.UI.gameSoundMap(S.settings)); redraw(); };
  const take = async (opts) => {
    try {
      const r = await call('gameSounds:extract', opts);
      S.settings.gameSounds = r;
      window.UI.setGameSounds(window.UI.gameSoundMap(S.settings));
      toast(r.count ? `${r.count} sounds taken from your game` : 'No folder picked');
      redraw();
    } catch { /* toast shown */ }
  };
  const status = Object.keys(got).length
    ? h('div', { class: 'row', style: { gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' } },
      h('span', { class: 'good' }, `✓ ${Object.keys(got).length} sounds from your game`),
      h('span', { class: 'small faint' }, st.gameSounds?.dir || ''),
      h('span', { class: 'spacer' }),
      h('button', { class: 'sm quiet', onclick: () => take({ force: true }) }, 'Read them again'),
      h('button', { class: 'sm quiet', onclick: () => take({ pick: true }) }, 'Other game folder…'))
    : h('div', { class: 'row', style: { gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' } },
      h('span', { class: 'muted' }, "Not taken from your game yet."),
      h('button', { class: 'primary sm', onclick: () => take({}) }, 'Find my game'),
      h('button', { class: 'sm', onclick: () => take({ pick: true }) }, 'Pick the game folder…'));
  const row = (n, label) => {
    const mine = own[n];
    const has = mine || got[n];
    return h('div', { class: 'gs-row' + (has ? ' has' : '') },
      h('b', {}, label),
      has ? h('span', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'play', type: 'button', 'aria-label': `Play ${label}`, onclick: () => window.UI.playSound(`game:${n}`) }, '▶'),
        mine ? h('span', { class: 'small faint' }, 'your recording') : null,
        mine ? h('button', { class: 'quiet sm', onclick: () => { const next = { ...own }; delete next[n]; save(next); } }, got[n] ? 'Use the game\'s' : 'Remove') : null)
        : window.UI.fileDropZone('Drop a recording or click', '.mp3,.wav,.ogg', async (f) => {
          if (!/\.(mp3|wav|ogg)$/i.test(f.name)) return toast('Use an .mp3, .wav or .ogg file', true);
          try {
            const snd = await call('sounds:import', { name: `game sound ${n}.${f.name.split('.').pop()}`, data: await window.UI.fileToBase64(f) });
            await save({ ...own, [n]: snd.id });
            window.UI.playSound(`game:${n}`);
          } catch { /* toast */ }
        }));
  };
  return h('div', { class: 'stack', style: { gap: '12px' } },
    status,
    h('div', { class: 'gs-grid' }, Array.from({ length: 16 }, (_, i) => row(String(i + 1), `Game sound ${i + 1}`))),
    Object.keys(got).some((k) => /^Sh/.test(k)) ? [h('div', { class: 'small muted' }, 'The named sounds (PlayAlertSound ShDivine and so on):'), h('div', { class: 'gs-grid' }, SH_SOUNDS.filter((k) => got[k] || own[k]).map((k) => row(k, k)))] : null);
}

window.gameSoundRows = gameSoundRows;

function appIconBox(st) {
  const img = h('img', { alt: 'Current icon', width: 48, height: 48, style: { borderRadius: '8px', background: '#0003', objectFit: 'contain' } });
  call('appIcon:get').then((u) => { img.src = u; }).catch(() => {});
  return [img,
    h('div', { class: 'stack', style: { gap: '6px', flex: 1 } },
      h('div', { class: 'row' },
        [['flask', 'Flask'], ['classic', 'Classic']].map(([k, label]) => h('button', { class: !st.customAppIcon && (st.appIconStyle || 'flask') === k ? 'primary' : 'quiet', 'aria-pressed': String(!st.customAppIcon && (st.appIconStyle || 'flask') === k), onclick: async () => { img.src = await call('appIcon:style', k); S.settings.appIconStyle = k; S.settings.customAppIcon = false; setBrandIcon(); toast(`${label} icon`); renderSettings(); } }, label)),
        h('button', { class: st.customAppIcon ? 'primary' : 'quiet', onclick: async () => { const u = await call('appIcon:pick'); if (u) { img.src = u; S.settings.customAppIcon = true; setBrandIcon(); toast('Icon changed'); renderSettings(); } } }, 'Choose an image…'),
        null),
      h('span', { class: 'small muted' }, 'Any .png, .jpg or .ico. It is cropped to a square; simple shapes read best at tray size (16 px). The desktop shortcut keeps its own icon.'))];
}

async function renderSettingsNow() {
  const filterInfo = await call('filter:list').catch(() => ({ files: [], base: null }));
  const shareUndo = await call('filterShare:canUndo').catch(() => false);
  const appShareUndo = await call('appShare:canUndo').catch(() => false);
  await refreshState();
  const st = S.settings;
  const el = $('page-settings');
  let leagues = [];
  try { leagues = await call('leagues:list'); } catch { /* offline */ }
  const field = (label, input, help) => h('label', { class: 'field' }, label, input, help ? h('span', { class: 'help' }, help) : null);
  const set = (key, transform = (v) => v) => (e) => call('settings:set', { [key]: transform(e.target.type === 'checkbox' ? e.target.checked : e.target.value) }).then(() => toast('Saved'));
  const sid = h('input', { type: 'password', placeholder: st.sessionSet ? 'Saved and encrypted' : '32 characters', autocomplete: 'off', style: { flex: 1 } });

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
            field('Speed', h('select', { onchange: set('rateSafety', Number) }, [[0.3, 'Gentle (a third of what GGG allows)'], [0.5, 'Normal (half of what GGG allows)'], [0.7, 'Faster (most of what GGG allows)']].map(([v, l]) => h('option', { value: v, selected: Number(st.rateSafety) === v }, l)))),
            field('Keep prices for (minutes)', h('input', { type: 'number', min: 5, value: st.ninjaTtlMin, onchange: set('ninjaTtlMin', Number) }), 'poe.ninja updates about every 15 minutes, so lower values only add downloads.'),
            field('Your name or link for request headers', h('input', { value: st.contact || '', placeholder: 'Optional, for example github.com/you', onchange: set('contact', (v) => v.trim()) })),
            h('details', {}, h('summary', {}, 'Price server address'),
              h('div', { class: 'stack', style: { marginTop: '8px' } }, h('input', { value: st.ninjaBaseUrl, onchange: set('ninjaBaseUrl', (v) => v.trim()), 'aria-label': 'Price server address' }), h('span', { class: 'help' }, 'Change only if you run your own caching proxy for poe.ninja.'))))),
        section('Updates', 'PoE Helper checks GitHub for a new version at start and every 4 hours, downloads it in the background, and installs it when you restart.',
          h('div', { class: 'panel row', style: { gap: '14px' } }, updateBox()))),
      h('div', {},
        section('Appearance', 'How PoE Helper looks. Items keep the colours your filter gives them. You can also switch with the dots at the bottom of the menu.',
          h('div', { class: 'panel' }, themePicker())),
        section('Price check', null,
          h('div', { class: 'panel stack' },
            field('League', h('select', { onchange: set('leagueOverride') }, h('option', { value: '' }, `Follow the current league (${st.leagueOverride ? 'automatic' : S.league || 'automatic'})`), leagues.map((l) => h('option', { value: l.id, selected: st.leagueOverride === l.id }, l.name || l.id)))),
            hotkeyField('hotkeyPrice', 'Price check hotkey', st, st.keySender ? 'Hover an item in game and press it. The price check pops up next to the item.' : 'Press Ctrl+C on the item first, then this hotkey.', 'Alt+E'),
            toggle(st.pobCompareOn !== false, (v) => call('settings:set', { pobCompareOn: v }).then(() => { toast(v ? 'The price check compares with your build' : 'The price check only prices'); renderSettings(); }), 'Show what the item does to my build in the price check (like the item tester). Off: Path of Building isn\'t run, so the price check is a little faster'),
            hotkeyField('hotkeyAltClick', 'Alt + left click', st, 'Press it in game: one Alt + left click where your mouse is. Only while Path of Exile is in front.', ''),
            hotkeyField('hotkeyClick', 'Left click', st, 'Press it in game: one left click where your mouse is. One click per press, as GGG allows.', ''),
            hotkeyField('hotkeyLab', 'Daily lab overlay', st, 'Opens today\'s Labyrinth layout from poelab in game: press it, pick 1-4. Press it again (or Esc) to hide.', 'Alt+L'),
            toggle(st.overlayCloseOnMouseAway !== false, (v) => call('settings:set', { overlayCloseOnMouseAway: v }).then(() => toast('Saved')), 'Close the price check when I move the mouse away, until I use it (Esc always closes it)'),
            h('div', { class: 'row small' }, h('span', { class: 'muted' }, st.overlayPos ? 'The price check opens where you last dragged it.' : 'The price check opens next to the item. Drag it by its top bar to choose a fixed place.'),
              st.overlayPos ? h('button', { class: 'quiet sm', onclick: async () => { await call('overlay:resetPos'); toast('The price check opens next to the item again'); renderSettings(); } }, 'Open next to the item again') : null),
            h('div', { class: 'row small' }, h('span', { class: 'muted', style: { flex: 1 } }, 'Streaming the game window in Discord? The price check is its own window, so Discord leaves it out. Open the stream window and share that one instead: it shows the game with your price checks on top.'),
              h('button', { class: 'sm', onclick: () => call('stream:open') }, 'Open stream window')),
            toggle(st.clipboardMode, (v) => call('settings:set', { clipboardMode: v }).then(() => toast('Saved')), 'Open the overlay whenever I Ctrl+C an item'),
            toggle(st.restoreClipboard, (v) => call('settings:set', { restoreClipboard: v }).then(() => toast('Saved')), 'Put my clipboard back after a hotkey check'),
            field('Trade listings', h('select', { onchange: set('tradeStatus') }, [['securable', 'Instant buyout only'], ['available', 'Instant buyout and in person'], ['online', 'In person, online sellers'], ['any', 'Any listing']].map(([v, l]) => h('option', { value: v, selected: (st.tradeStatus || 'securable') === v }, l))), 'Instant buyout listings come from merchant tabs and can be bought straight away from your hideout.'),
            field('Trade search range', h('select', { onchange: set('tradeTolerance', Number) }, [[0, 'Exact values'], [0.05, '5% below my values'], [0.1, '10% below my values'], [0.2, '20% below my values']].map(([v, l]) => h('option', { value: v, selected: Number(st.tradeTolerance) === v }, l)))),
            toggle(st.tradeFetchListings, (v) => call('settings:set', { tradeFetchListings: v }).then(() => toast('Saved')), 'Show the 20 cheapest listings after a search (1 to 2 extra requests)'),
            toggle(st.tradeAutoSearch !== false, (v) => call('settings:set', { tradeAutoSearch: v }).then(() => toast('Saved')), 'Search uniques, unidentified items and the bulk exchange at once (rares wait for Search)'),
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
    section('Loot filter file', 'The FilterBlade filter PoE Helper builds on, and where your version of it is written.', filterFileBox(filterInfo, st, renderSettings)),
    section('Share your loot filter settings', 'Everything you set up for the filter in PoE Helper (tiers and looks, base ranks, my bases, clusters, your rules, category prices, the tier designer, your own sounds) in one file. Someone else imports it and gets your setup; their account, league and filter file stay theirs.',
      h('div', { class: 'panel row', style: { gap: '10px' } },
        h('button', { class: 'primary', onclick: async () => { const p = await call('filterShare:export'); if (p) toast(`Saved to ${p.split(/[\\/]/).pop()}`); } }, 'Export…'),
        h('button', { onclick: async () => {
          if (!confirm('Importing replaces your loot filter settings with the ones in the file. You can undo it afterwards. Go on?')) return;
          try { const r = await call('filterShare:import'); if (r) { toast(`Imported${r.from ? ` (made with PoE Helper ${r.from})` : ''}. Your filter is rewritten; zone or reload it in game.`); renderSettings(); } } catch { /* toast */ }
        } }, 'Import…'),
        shareUndo ? h('button', { class: 'quiet', onclick: async () => { await call('filterShare:undo'); toast('Your own settings are back'); renderSettings(); } }, 'Undo import') : null)),
    section('Share your app settings', 'Your hotkeys, chat macros, price check and overlay choices, the Regex page, saved trade searches and the lab overlay, in one file. Your account, login, league, folders, history and net worth are never in it.',
      h('div', { class: 'panel row', style: { gap: '10px' } },
        h('button', { class: 'primary', onclick: async () => { const p = await call('appShare:export'); if (p) toast(`Saved to ${p.split(/[\\/]/).pop()}`); } }, 'Export…'),
        h('button', { onclick: async () => {
          if (!confirm('Importing replaces your app settings with the ones in the file. You can undo it afterwards. Go on?')) return;
          try { const r = await call('appShare:import'); if (r) { toast(`Imported ${r.count} settings${r.from ? ` (made with PoE Helper ${r.from})` : ''}`); renderSettings(); } } catch { /* toast */ }
        } }, 'Import…'),
        appShareUndo ? h('button', { class: 'quiet', onclick: async () => { await call('appShare:undo'); toast('Your own app settings are back'); renderSettings(); } }, 'Undo import') : null)),
    notesSection(await call('app:changelog').catch(() => [])),
    section('Tray and app icon', 'The picture in the tray, the taskbar and the window title bar.',
      h('div', { class: 'panel row', style: { gap: '16px' } }, appIconBox(st))),
    section('Start over', 'Puts every look, tier, base, cluster, sound, hotkey and setting you changed in PoE Helper back to how a fresh install has them, and rewrites your filter to match. It keeps your account and login, the league, the filter you picked, your price check history and net worth, your saved themes and the game sound copies.',
      h('div', { class: 'panel row', style: { gap: '10px' } },
        h('button', { class: 'danger', onclick: async () => {
          if (!confirm('Put everything you changed in PoE Helper back to a fresh install? Your filter is rewritten without your changes. You can undo this once.')) return;
          try { await call('app:resetAll'); toast('Everything is back to how a fresh install has it. Zone or reload the filter in game.'); renderSettings(); } catch { /* toast */ }
        } }, 'Reset everything'),
        (await call('app:canUndoReset').catch(() => false)) ? h('button', { onclick: async () => { try { await call('app:undoReset'); toast('Your changes are back'); renderSettings(); } catch { /* toast */ } } }, 'Undo the reset') : null,
        h('span', { class: 'small muted' }, 'Only for what PoE Helper changed: your FilterBlade filter itself is never touched.'))));
}

// ---------------- events ----------------
window.poe.on('toast', (m) => toast(m));
window.poe.on('networth:updated', () => { if (currentPage === 'networth' || currentPage === 'dashboard') go(currentPage); });
window.poe.on('filter:rebuilt', () => { if (currentPage === 'filters') go('filters'); });
// "Show in app" from the price check: the Loot filter at the item's tier, the item picked
window.poe.on('app:goto', (g) => {
  if (g?.page === 'filters') { window.showInFilter?.(g); go('filters'); }
  if (g?.page === 'craft') { window.CraftView?.load(g.text); go('craft'); }
});
window.poe.on('history:updated', () => { if (currentPage === 'dashboard') refreshState(); });
// a levelling guide or build was added in the background (the default guides): the PoB page shows it
window.poe.on('pob:buildsChanged', () => { if (currentPage === 'pob') window.PobView?.render(); });
window.poe.on('gameSounds:changed', (r) => { S.settings.gameSounds = r; window.UI.setGameSounds(window.UI.gameSoundMap(S.settings)); if (currentPage === 'designer') go('designer'); });

go('dashboard');
