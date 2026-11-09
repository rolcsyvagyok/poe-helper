'use strict';
/* Path of Building page: snapshots of your character, and PoB's own maths on any build
   (a snapshot or a build from your PoB builds folder): item tester, full stats, two builds side by side,
   and which mods would help each gear slot most.
   Uses helpers defined in app.js (S, call, h, mount, section, toast, pageHead, refreshState, hotkeyField, fmtNum, pobBox, cleanErr). */
(() => {
  const PB = { recent: [], tab: 'snapshot', file: null, a: null, b: null, text: '', builds: null, results: {}, busy: {} };
  const TABS = [['snapshot', 'Snapshot'], ['test', 'Item tester'], ['stats', 'Stats'], ['compare', 'Compare'], ['upgrades', 'Upgrades']];

  const num = (n, unit = '') => {
    if (n == null || !Number.isFinite(n)) return '–';
    if (unit === 'x') return `${(n * 100).toFixed(1)}%`;
    if (unit === '%') return `${Math.round(n * 10) / 10}%`;
    if (unit === 's') return n.toFixed(2);
    return fmtNum(n);
  };
  const signed = (n, unit = '') => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n), unit)}`;
  const pct = (p) => (p == null || !Number.isFinite(p) ? '' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p) >= 10 ? Math.round(Math.abs(p)) : Math.abs(p).toFixed(1)}%`);
  const errText = (e) => (typeof cleanErr === 'function' ? cleanErr(e) : String(e?.message || e));

  async function loadBuilds(force) {
    if (!PB.builds || force) PB.builds = await call('pob:builds').catch(() => []);
    const st = await call('pob:state').catch(() => ({}));
    const snaps = PB.builds.filter((b) => b.snapshot);
    const has = (f) => f && PB.builds.some((b) => b.file === f);
    if (!has(PB.file)) PB.file = (has(st.last?.file) ? st.last.file : null) || snaps[0]?.file || PB.builds[0]?.file || null;
    if (!has(PB.b)) PB.b = PB.file;
    if (!has(PB.a) || PB.a === PB.b) {
      // the snapshot of the same character before the newest one
      const bName = PB.builds.find((x) => x.file === PB.b)?.name || '';
      const who = /^PoE Helper snapshots \/ (.+) \d{4}-\d\d-\d\d \d\d-\d\d$/.exec(bName)?.[1];
      PB.a = (who && snaps.find((x) => x.file !== PB.b && x.name.includes(`/ ${who} `))?.file) || snaps.find((x) => x.file !== PB.b)?.file || PB.builds.find((x) => x.file !== PB.b)?.file || null;
    }
    return st;
  }

  function buildSelect(value, onchange, label = 'Build') {
    const snaps = PB.builds.filter((b) => b.snapshot);
    const other = PB.builds.filter((b) => !b.snapshot);
    const opt = (b) => h('option', { value: b.file, selected: b.file === value }, b.snapshot ? b.name.replace(/^PoE Helper snapshots \/ /, '') : b.name);
    return h('select', { 'aria-label': label, style: { flex: 1, minWidth: '220px' }, onchange: (e) => onchange(e.target.value) },
      !PB.builds.length ? h('option', { value: '' }, 'No builds yet: save a snapshot first') : null,
      snaps.length ? h('optgroup', { label: 'Your snapshots' }, snaps.map(opt)) : null,
      other.length ? h('optgroup', { label: 'Path of Building builds' }, other.map(opt)) : null);
  }
  const buildRow = (extra) => h('div', { class: 'row', style: { gap: '8px', marginBottom: '14px' } },
    h('span', { class: 'muted small' }, 'Build'), buildSelect(PB.file, (v) => { PB.file = v; PB.results = {}; render(); }), extra || null);

  // ---------------------------------------------------------------- item tester
  function testTab() {
    const ta = h('textarea', { rows: 6, placeholder: 'Paste an item: hover it in game, press Ctrl+C, then paste here (Ctrl+V).', style: { width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: '12.5px' } }, PB.text);
    const out = h('div', { class: 'stack' });
    const run = async () => {
      PB.text = ta.value;
      if (!PB.text.trim()) return mount(out, h('p', { class: 'small muted' }, 'Paste an item first.'));
      if (!PB.file) return mount(out, h('p', { class: 'small warn' }, 'Pick a build first, or save a snapshot.'));
      mount(out, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), ' Path of Building is working it out…'));
      try { PB.results.test = { text: PB.text, r: await call('pob:test', { file: PB.file, text: PB.text }) }; showTest(out); } catch (e) { mount(out, h('p', { class: 'small warn' }, errText(e))); }
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); });
    ta.addEventListener('paste', () => setTimeout(run, 0));
    if (PB.results.test && PB.results.test.text === PB.text) showTest(out);
    else if (!PB.text) mount(out, h('div', { class: 'panel small muted' }, 'Copy an item in game (hover it, Ctrl+C) or paste one below: what it does to your build shows here.'));
    else if (PB.text && PB.autoRun) { PB.autoRun = false; setTimeout(run, 0); }
    const watching = PB.st?.watchClipboard !== false;
    const nameOf = (t) => { const l = t.split(/\r?\n/).map((x) => x.trim()); const i = l.findIndex((x) => x.startsWith('Rarity:')); return i >= 0 ? (l[i + 2] && !l[i + 2].startsWith('---') ? `${l[i + 1]}, ${l[i + 2]}` : l[i + 1]) : 'Item'; };
    return [buildRow(), out,
      h('div', { class: 'panel stack', style: { marginTop: '12px' } },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: watching, onchange: async (e) => { await call('pob:set', { watchClipboard: e.target.checked }); PB.st.watchClipboard = e.target.checked; toast(e.target.checked ? 'Every item you copy is tested here' : 'Copied items are no longer tested'); } }),
          'Test every item I copy: hover an item in game, press Ctrl+C, and the result shows here'),
        PB.recent.length > 1 ? h('div', { class: 'row small', style: { gap: '6px', flexWrap: 'wrap' } }, h('span', { class: 'muted' }, 'Copied before:'),
          PB.recent.slice(1).map((t) => h('button', { class: 'quiet sm', onclick: () => { PB.text = t; PB.results.test = null; PB.autoRun = true; render(); } }, nameOf(t)))) : null,
        ta,
        h('div', { class: 'row', style: { gap: '8px' } },
          h('button', { class: 'primary sm', onclick: run }, 'Test'),
          h('button', { class: 'sm', title: 'Use the item you copied last', onclick: async () => { const t = await call('clipboard:item').catch(() => null); if (!t) return toast('The clipboard has no Path of Exile item. Press Ctrl+C on one in game first.', true); ta.value = t; run(); } }, 'Paste from clipboard'),
          h('span', { class: 'small faint' }, 'Ctrl+Enter tests too.')),
        hotkeyField('hotkeyPobTest', 'Item tester hotkey', S.settings, 'Hover an item in game and press it: the item is copied and tested here, against the build above.', ''))];
  }
  function showTest(out) {
    const r = PB.results.test?.r;
    if (!r) return mount(out);
    if (r.error) return mount(out, h('p', { class: 'small warn' }, r.error));
    const main = r.slots.filter((s) => !s.swap);
    const swap = r.slots.filter((s) => s.swap);
    const card = (s) => {
      const dps = s.changes.find((c) => c.key === 'dps');
      const rest = s.changes.filter((c) => c.key !== 'dps');
      return h('div', { class: 'panel pob-slot' },
        h('div', { class: 'row', style: { gap: '8px' } }, h('b', {}, s.slot), h('span', { class: 'small faint' }, s.current ? `instead of ${s.current}` : 'empty slot'), h('span', { class: 'spacer' }),
          dps ? h('span', { class: `pob-big ${dps.diff > 0 ? 'up' : 'down'}` }, `${pct(dps.pct) || signed(dps.diff)} ${r.full ? 'full DPS' : 'DPS'}`) : h('span', { class: 'small faint' }, 'same DPS')),
        rest.length ? h('div', { class: 'pob-chgs' }, rest.map((c) => h('span', { class: `pob-chg ${c.diff > 0 ? 'up' : 'down'}`, title: `${num(c.before, c.unit)} → ${num(c.after, c.unit)}` }, `${signed(c.diff, c.unit)} ${c.label}`))) : h('div', { class: 'small faint' }, 'Nothing else changes.'));
    };
    mount(out,
      h('div', { class: 'small muted' }, `${r.item} with ${PB.builds.find((b) => b.file === PB.file)?.name.replace(/^PoE Helper snapshots \/ /, '') || 'your build'}:`),
      main.length ? main.map(card) : h('p', { class: 'small muted' }, 'This item doesn\'t fit any slot of this build.'),
      swap.length ? h('details', {}, h('summary', { class: 'small muted' }, 'Weapon swap'), swap.map(card)) : null);
  }

  // ---------------------------------------------------------------- stats
  const STAT_GROUPS = [
    ['Offence', [['FullDPS', 'Full DPS'], ['CombinedDPS', 'Combined DPS'], ['TotalDPS', 'Hit DPS'], ['TotalDotDPS', 'Damage over time DPS'], ['IgniteDPS', 'Ignite DPS'], ['BleedDPS', 'Bleed DPS'], ['PoisonDPS', 'Poison DPS'], ['ImpaleDPS', 'Impale DPS'],
      ['AverageHit', 'Average hit'], ['Speed', 'Uses per second', 's'], ['HitChance', 'Chance to hit', '%'], ['CritChance', 'Crit chance', '%'], ['CritMultiplier', 'Crit multiplier', 'x'], ['ManaCost', 'Mana cost'], ['LifeCost', 'Life cost']]],
    ['Life and mana', [['Life', 'Life'], ['LifeUnreserved', 'Life unreserved'], ['LifeRegenRecovery', 'Life regen per second'], ['LifeLeechGainRate', 'Life leech per second'], ['EnergyShield', 'Energy shield'], ['EnergyShieldRegenRecovery', 'ES regen per second'], ['Ward', 'Ward'], ['Mana', 'Mana'], ['ManaUnreserved', 'Mana unreserved'], ['ManaRegenRecovery', 'Mana regen per second']]],
    ['Defence', [['TotalEHP', 'Effective HP'], ['PhysicalMaximumHitTaken', 'Biggest physical hit'], ['FireMaximumHitTaken', 'Biggest fire hit'], ['ColdMaximumHitTaken', 'Biggest cold hit'], ['LightningMaximumHitTaken', 'Biggest lightning hit'], ['ChaosMaximumHitTaken', 'Biggest chaos hit'],
      ['Armour', 'Armour'], ['PhysicalDamageReduction', 'Physical damage reduction', '%'], ['Evasion', 'Evasion'], ['MeleeEvadeChance', 'Chance to evade attacks', '%'], ['BlockChance', 'Block', '%'], ['SpellBlockChance', 'Spell block', '%'], ['SpellSuppressionChance', 'Spell suppression', '%']]],
    ['Resistances', [['FireResist', 'Fire', 'res'], ['ColdResist', 'Cold', 'res'], ['LightningResist', 'Lightning', 'res'], ['ChaosResist', 'Chaos', 'res']]],
    ['Other', [['MovementSpeedMod', 'Movement speed', 'x'], ['Str', 'Strength'], ['Dex', 'Dexterity'], ['Int', 'Intelligence'], ['PowerChargesMax', 'Power charges'], ['FrenzyChargesMax', 'Frenzy charges'], ['EnduranceChargesMax', 'Endurance charges']]],
  ];
  const ALWAYS = new Set(['Life', 'EnergyShield', 'Mana', 'TotalEHP', 'Armour', 'Evasion', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist', 'Str', 'Dex', 'Int', 'MovementSpeedMod']);
  const statValue = (d, k, unit) => {
    if (unit === 'res') {
      const over = d[`${k}OverCap`];
      return `${Math.round(d[k])}%${over > 0 ? ` (+${Math.round(over)}% over the cap)` : ''}`;
    }
    return num(d[k], unit);
  };
  const shownStat = (d, k) => typeof d[k] === 'number' && (ALWAYS.has(k) || Math.abs(d[k]) > 0.0001);

  async function withResult(key, out, fetch, show) {
    if (!PB.file) return mount(out, h('p', { class: 'small muted' }, 'Pick a build first, or save a snapshot.'));
    const cacheKey = `${key}|${PB.file}`;
    if (PB.results[cacheKey]) return show(PB.results[cacheKey]);
    mount(out, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), key === 'upgrades' ? ' Trying mods on each of your items in Path of Building (a few seconds)…' : ' Path of Building is opening the build…'));
    try { PB.results[cacheKey] = await fetch(); if (PB.tab === key) show(PB.results[cacheKey]); } catch (e) { mount(out, h('p', { class: 'small warn' }, errText(e))); }
  }

  function statsTab() {
    const out = h('div', { class: 'stack' });
    withResult('stats', out, () => call('pob:stats', PB.file), (r) => mount(out, statsView(r)));
    return [buildRow(), out];
  }
  function statsView(r) {
    const d = r.detail || {};
    const head = h('div', { class: 'panel pob-sum' }, h('b', {}, r.name), ` · ${[r.ascendancy || r.class, r.level ? `level ${r.level}` : null, r.skill].filter(Boolean).join(' · ')}`);
    const groups = STAT_GROUPS.map(([title, rows]) => {
      const list = rows.filter(([k]) => shownStat(d, k));
      if (!list.length) return null;
      return h('div', { class: 'panel pob-stat' }, h('h3', {}, title), h('table', {}, h('tbody', {}, list.map(([k, label, unit]) => h('tr', {}, h('td', {}, label), h('td', { class: 'r' }, statValue(d, k, unit)))))));
    });
    const skills = r.skills?.length ? h('div', { class: 'panel pob-stat' }, h('h3', {}, 'Skills in full DPS'),
      h('table', {}, h('tbody', {}, r.skills.slice().sort((a, b) => b.dps - a.dps).map((s) => h('tr', {}, h('td', {}, s.name, s.count > 1 ? ` ×${s.count}` : '', s.part ? h('span', { class: 'faint' }, ` (${s.part})`) : null), h('td', { class: 'r' }, num(s.dps * (s.count || 1)))))))) : null;
    const gear = h('div', { class: 'panel pob-stat' }, h('h3', {}, 'Gear'), h('table', {}, h('tbody', {}, (r.gear || []).map((g) => h('tr', {}, h('td', { class: 'muted' }, g.slot), h('td', { class: `rar-${String(g.rarity || '').toLowerCase()}` }, g.title || g.name, g.title && g.base ? h('span', { class: 'faint' }, ` ${g.base}`) : null))))));
    const gems = h('div', { class: 'panel pob-stat' }, h('h3', {}, 'Gems'), (r.gems || []).map((g) => h('div', { class: 'pob-gems' + (g.enabled ? '' : ' off') + (g.main ? ' main' : '') },
      h('div', { class: 'small muted' }, g.slot || 'No slot', g.label ? ` · ${g.label}` : '', g.main ? ' · main skill' : '', g.enabled ? '' : ' · off'),
      h('div', {}, g.gems.map((x, i) => h('span', { class: (x.support ? 'sup' : 'act') + (x.enabled ? '' : ' off') }, i ? ' · ' : '', `${x.name} ${x.level}${x.quality ? `/${x.quality}` : ''}`))))));
    return [head, h('div', { class: 'pob-grid' }, groups, skills), h('div', { class: 'pob-grid' }, gear, gems)];
  }

  // ---------------------------------------------------------------- compare two builds
  function compareTab() {
    const out = h('div', { class: 'stack' });
    const go = async () => {
      if (!PB.a || !PB.b) return mount(out, h('p', { class: 'small muted' }, 'Pick two builds. Save two snapshots of a character to see how it changed.'));
      mount(out, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), ' Path of Building is opening both builds…'));
      try {
        const get = async (f) => PB.results[`stats|${f}`] || (PB.results[`stats|${f}`] = await call('pob:stats', f));
        const a = await get(PB.a);
        const b = await get(PB.b);
        if (PB.tab === 'compare') mount(out, compareView(a, b));
      } catch (e) { mount(out, h('p', { class: 'small warn' }, errText(e))); }
    };
    go();
    return [h('div', { class: 'stack', style: { gap: '8px', marginBottom: '14px' } },
      h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'muted small', style: { width: '48px' } }, 'Before'), buildSelect(PB.a, (v) => { PB.a = v; render(); }, 'Before')),
      h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'muted small', style: { width: '48px' } }, 'After'), buildSelect(PB.b, (v) => { PB.b = v; render(); }, 'After'))), out];
  }
  function compareView(a, b) {
    const da = a.detail || {};
    const db = b.detail || {};
    const rows = [];
    for (const [title, list] of STAT_GROUPS) {
      const rs = list.filter(([k]) => shownStat(da, k) || shownStat(db, k)).map(([k, label, unit]) => {
        const x = da[k] ?? 0;
        const y = db[k] ?? 0;
        const diff = y - x;
        const u = unit === 'res' ? '%' : unit;
        const same = Math.abs(diff) < (u === 'x' ? 0.0005 : 0.05);
        // less is better only for costs
        const better = /Cost$/.test(k) ? diff < 0 : diff > 0;
        return h('tr', { class: same ? 'same' : '' }, h('td', {}, label), h('td', { class: 'r muted' }, num(x, u)), h('td', { class: 'r' }, num(y, u)),
          h('td', { class: `r ${same ? 'faint' : better ? 'good' : 'bad'}` }, same ? '' : `${signed(diff, u)}${x && u !== '%' && u !== 'x' ? ` (${pct((diff / Math.abs(x)) * 100)})` : ''}`));
      });
      if (rs.length) rows.push(h('tr', { class: 'grp' }, h('td', { colspan: 4 }, title)), ...rs);
    }
    // gear by slot
    const gearOf = (r) => { const m = new Map(); for (const g of r.gear || []) if (g.slot !== 'Jewel') m.set(g.slot, g); return m; };
    const ga = gearOf(a);
    const gb = gearOf(b);
    const slots = [...new Set([...ga.keys(), ...gb.keys()])];
    const gearChanges = slots.filter((s) => (ga.get(s)?.name || '') !== (gb.get(s)?.name || ''));
    const jewels = (r) => (r.gear || []).filter((g) => g.slot === 'Jewel').map((g) => g.name);
    const ja = jewels(a);
    const jb = jewels(b);
    const jAdded = jb.filter((n) => !ja.includes(n));
    const jGone = ja.filter((n) => !jb.includes(n));
    // gems: by name, with level and quality
    const gemMap = (r) => { const m = new Map(); for (const g of r.gems || []) for (const x of g.gems) m.set(x.name, x); return m; };
    const ma = gemMap(a);
    const mb = gemMap(b);
    const gemAdded = [...mb.keys()].filter((n) => !ma.has(n));
    const gemGone = [...ma.keys()].filter((n) => !mb.has(n));
    const gemLevel = [...mb.keys()].filter((n) => ma.has(n) && (ma.get(n).level !== mb.get(n).level || ma.get(n).quality !== mb.get(n).quality));
    const who = (r) => `${r.name}${r.level ? `, level ${r.level}` : ''}`;
    return [
      h('div', { class: 'panel pob-cmp' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'r' }, who(a)), h('th', { class: 'r' }, who(b)), h('th', { class: 'r' }, 'Change'))),
        h('tbody', {}, rows))),
      h('div', { class: 'pob-grid' },
        h('div', { class: 'panel pob-stat' }, h('h3', {}, 'Gear that changed'),
          gearChanges.length || jAdded.length || jGone.length ? h('table', {}, h('tbody', {},
            gearChanges.map((s) => h('tr', {}, h('td', { class: 'muted' }, s), h('td', {}, h('span', { class: 'faint' }, ga.get(s)?.name || 'empty'), ' → ', gb.get(s)?.name || 'empty'))),
            jAdded.map((n) => h('tr', {}, h('td', { class: 'muted' }, 'Jewel'), h('td', {}, `+ ${n}`))),
            jGone.map((n) => h('tr', {}, h('td', { class: 'muted' }, 'Jewel'), h('td', { class: 'faint' }, `− ${n}`))))) : h('p', { class: 'small muted' }, 'The same gear.')),
        h('div', { class: 'panel pob-stat' }, h('h3', {}, 'Gems that changed'),
          gemAdded.length || gemGone.length || gemLevel.length ? h('div', { class: 'stack', style: { gap: '4px' } },
            gemAdded.map((n) => h('div', { class: 'good small' }, `+ ${n} ${mb.get(n).level}${mb.get(n).quality ? `/${mb.get(n).quality}` : ''}`)),
            gemGone.map((n) => h('div', { class: 'bad small' }, `− ${n}`)),
            gemLevel.map((n) => h('div', { class: 'small' }, `${n}: ${ma.get(n).level}/${ma.get(n).quality} → ${mb.get(n).level}/${mb.get(n).quality}`))) : h('p', { class: 'small muted' }, 'The same gems.'))),
    ];
  }

  // ---------------------------------------------------------------- upgrades: find a better item on trade
  function upgradesTab() {
    const out = h('div', { class: 'stack' });
    const find = h('div', { class: 'stack' });
    const mods = h('div', { class: 'stack' });
    findBox(find);
    const startMods = () => withResult('upgrades', mods, () => call('pob:upgrades', PB.file), (r) => mount(mods, upgradesView(r)));
    if (PB.results[`upgrades|${PB.file}`]) startMods();
    else mount(mods, h('div', { class: 'panel stack' },
      h('p', { class: 'small muted' }, 'Or see which single mod would help each of your rare items most (PoB adds one high roll at a time to the item you wear).'),
      h('div', {}, h('button', { class: 'sm', disabled: !PB.file, onclick: startMods }, 'Show the best mods per item'))));
    mount(out, find, h('h3', { style: { margin: '18px 0 0' } }, 'Best mods for your items'), mods);
    return [buildRow(), out];
  }

  async function findBox(box) {
    if (!PB.file) return mount(box, h('p', { class: 'small muted' }, 'Pick a build first, or save a snapshot.'));
    mount(box, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), ' Path of Building is opening the build…'));
    let st;
    try { st = PB.results[`stats|${PB.file}`] || (PB.results[`stats|${PB.file}`] = await call('pob:stats', PB.file)); } catch (e) { return mount(box, h('p', { class: 'small warn' }, errText(e))); }
    const saved = PB.st?.find || {};
    const F = PB.find || (PB.find = { focus: saved.focus || 'balanced', maxPrice: saved.maxPrice ?? '', unit: saved.unit || 'chaos', betterOnly: saved.betterOnly !== false, maxLevel: null, slot: null });
    const slots = (st.gear || []).filter((g) => !/^(Jewel|Flask)/.test(g.slot));
    if (!slots.some((g) => g.slot === F.slot)) F.slot = slots[0]?.slot || null;
    if (F.maxLevel == null || F.levelFor !== PB.file) { F.maxLevel = st.level || ''; F.levelFor = PB.file; }
    const save = () => call('pob:set', { find: { focus: F.focus, maxPrice: F.maxPrice, unit: F.unit, betterOnly: F.betterOnly } }).catch(() => {});
    const res = h('div', { class: 'stack' });
    const field2 = (label, input) => h('label', { class: 'field', style: { minWidth: '140px' } }, label, input);
    const run = async (btn) => {
      btn.disabled = true;
      mount(res, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), ' Path of Building works out what each stat is worth, then the trade site is searched and the best 10 are tested in PoB…'));
      try {
        PB.results.find = await call('pob:findItem', { file: PB.file, slot: F.slot, focus: F.focus, maxLevel: Number(F.maxLevel) || null, maxPrice: Number(F.maxPrice) || null, unit: F.unit, betterOnly: F.betterOnly });
        PB.results.find.forFile = PB.file;
        mount(res, findView(PB.results.find));
      } catch (e) { mount(res, h('p', { class: 'small warn' }, errText(e))); }
      btn.disabled = false;
    };
    if (PB.results.find?.forFile === PB.file && PB.results.find.slot === F.slot) mount(res, findView(PB.results.find));
    mount(box, h('div', { class: 'panel stack' },
      h('h3', { style: { margin: 0 } }, 'Find a better item on the trade site'),
      h('p', { class: 'small muted', style: { margin: 0 } }, 'Like Path of Building\'s trade search: PoB puts a blank item of the same base in the slot and tries each stat on it, so every stat gets a weight for what it adds to your build (resistances you need count a lot, ones over the cap nothing). The trade site then lists items by the weighted sum of their stats, best first, and PoB tests the top 10 in your build.'),
      h('div', { class: 'row', style: { gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' } },
        field2('Slot', h('select', { onchange: (e) => { F.slot = e.target.value; mount(res); } }, slots.map((g) => h('option', { value: g.slot, selected: g.slot === F.slot }, `${g.slot}: ${g.title || g.name}`)))),
        field2('Good for', h('select', { onchange: (e) => { F.focus = e.target.value; save(); } },
          [['damage', 'Damage'], ['balanced', 'Damage and defence'], ['defence', 'Defence (effective HP)']].map(([v, l]) => h('option', { value: v, selected: F.focus === v }, l)))),
        field2('Level requirement up to', h('input', { type: 'number', min: 1, max: 100, value: F.maxLevel, style: { width: '90px' }, oninput: (e) => { F.maxLevel = e.target.value; } })),
        field2('Price up to', h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } },
          h('input', { type: 'number', min: 0, step: 'any', placeholder: 'any', value: F.maxPrice, style: { width: '90px' }, oninput: (e) => { F.maxPrice = e.target.value; }, onchange: save }),
          h('select', { onchange: (e) => { F.unit = e.target.value; save(); } }, [['chaos', 'chaos'], ['divine', 'divine']].map(([v, l]) => h('option', { value: v, selected: F.unit === v }, l)))))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: F.betterOnly, onchange: (e) => { F.betterOnly = e.target.checked; save(); } }), 'Only items about as good as mine or better'),
      h('div', { class: 'row', style: { gap: '10px' } }, h('button', { class: 'primary sm', disabled: !F.slot, onclick: (e) => run(e.currentTarget) }, 'Search the trade site'),
        h('span', { class: 'small faint' }, 'Uses 2 trade requests (the search and the 10 best listings).'))),
      res);
  }

  function findView(r) {
    const weights = h('details', {}, h('summary', { class: 'small muted' }, `Weights PoB worked out for ${r.slot} (${r.weights.length} stats)`),
      h('div', { class: 'pob-chgs', style: { marginTop: '6px' } }, r.weights.map((w) => h('span', { title: `Tested as: ${w.line}` }, `${w.text}: ${w.weight}`))),
      r.missing?.length ? h('div', { class: 'small faint' }, `Not on the trade site's list, left out: ${r.missing.join(', ')}`) : null);
    const head = h('div', { class: 'row', style: { gap: '10px' } },
      h('span', {}, r.total ? `${r.total >= 10000 ? '10,000+' : r.total.toLocaleString()} ${r.total === 1 ? 'item' : 'items'} found${r.minSum ? ' at least about as good as yours' : ''}` : 'Nothing found. Raise the price or the level limit, or untick "Only items about as good as mine".'),
      h('span', { class: 'spacer' }), h('button', { class: 'sm', onclick: () => call('shell:open', r.url) }, 'Open on the trade site'));
    const money = (p) => (p ? `${Math.round(p.amount * 100) / 100} ${p.currency}` : 'no price');
    const card = (l) => {
      const d = l.test?.dps;
      return h('div', { class: 'panel pob-slot' },
        h('div', { class: 'row', style: { gap: '8px' } }, h('b', {}, l.name), h('span', { class: 'small faint' }, [l.level ? `level ${l.level}` : null, l.ilvl ? `ilvl ${l.ilvl}` : null].filter(Boolean).join(' · ')),
          h('span', { class: 'spacer' }), h('span', { class: 'pill' }, money(l.price)),
          d ? h('span', { class: `pob-big ${d.diff > 0 ? 'up' : 'down'}` }, `${pct(d.pct) || signed(d.diff)} ${l.full ? 'full DPS' : 'DPS'}`) : l.test ? h('span', { class: 'small faint' }, 'same DPS') : h('span', { class: 'small faint' }, 'PoB couldn\'t test it')),
        l.test?.changes?.length ? h('div', { class: 'pob-chgs' }, l.test.changes.map((c) => h('span', { class: `pob-chg ${c.diff > 0 ? 'up' : 'down'}`, title: `${num(c.before, c.unit)} → ${num(c.after, c.unit)}` }, `${signed(c.diff, c.unit)} ${c.label}`))) : null,
        h('details', {}, h('summary', { class: 'small muted' }, 'Mods'), h('div', { class: 'small', style: { whiteSpace: 'pre-line', marginTop: '4px' } }, l.mods.join('\n'))),
        h('div', { class: 'row', style: { gap: '6px' } },
          l.whisper ? h('button', { class: 'sm', onclick: async () => { await call('clipboard:write', l.whisper); toast('Whisper copied. Paste it in game chat.'); } }, 'Copy whisper') : null,
          h('button', { class: 'quiet sm', onclick: () => { PB.text = l.text; PB.results.test = null; PB.autoRun = true; PB.tab = 'test'; render(); } }, 'Open in the item tester'),
          l.seller ? h('span', { class: 'small faint' }, l.seller) : null));
    };
    return [h('div', { class: 'panel stack' }, head, weights, r.listings.length ? h('div', { class: 'small faint' }, `The ${r.listings.length} best by the trade site's sum, tested in Path of Building and sorted by what they do to your build.`) : null), ...r.listings.map(card)];
  }

  function upgradesView(r) {
    if (!r.slots?.length) return h('p', { class: 'small muted' }, 'No rare gear to improve in this build (uniques are left out).');
    const top = (list, key) => list.filter((m) => m[key] > 0.05).sort((x, y) => y[key] - x[key]).slice(0, 4);
    const line = (m, key) => h('div', { class: 'pob-up' }, h('span', {}, m.mod), h('span', { class: 'good' }, pct(m[key])),
      key === 'dpsPct' && m.ehpPct > 0.05 ? h('span', { class: 'faint small' }, ` and ${pct(m.ehpPct)} EHP`) : null,
      key === 'ehpPct' && m.dpsPct > 0.05 ? h('span', { class: 'faint small' }, ` and ${pct(m.dpsPct)} DPS`) : null);
    // the best single mods anywhere, first
    const all = r.slots.flatMap((s) => s.mods.map((m) => ({ ...m, slot: s.slot })));
    // a mod that helps the same on several items is listed once, with every slot it can go on
    const best = (key) => {
      const byMod = new Map();
      for (const m of all.filter((x) => x[key] > 0.05).sort((x, y) => y[key] - x[key])) {
        const had = byMod.get(m.mod);
        if (!had) byMod.set(m.mod, { ...m, slots: [m.slot] });
        else if (Math.abs(had[key] - m[key]) < 0.05) had.slots.push(m.slot);
      }
      return [...byMod.values()].slice(0, 6);
    };
    const bestBox = (title, key) => h('div', { class: 'panel pob-stat' }, h('h3', {}, title),
      best(key).length ? best(key).map((m) => h('div', { class: 'pob-up' }, h('span', {}, m.mod, h('span', { class: 'faint small' }, ` on ${m.slots.length > 3 ? `${m.slots.slice(0, 3).join(', ')} and ${m.slots.length - 3} more` : m.slots.join(', ')}`)), h('span', { class: 'good' }, pct(m[key])))) : h('p', { class: 'small muted' }, 'Nothing found.'));
    return [
      h('div', { class: 'pob-grid' }, bestBox(`Most ${r.full ? 'full DPS' : 'DPS'}`, 'dpsPct'), bestBox('Most effective HP', 'ehpPct')),
      h('div', { class: 'pob-grid' }, r.slots.map((s) => {
        const d = top(s.mods, 'dpsPct');
        const e = top(s.mods, 'ehpPct');
        return h('div', { class: 'panel pob-stat' }, h('h3', {}, s.slot, h('span', { class: 'faint small' }, `  ${s.item}`)),
          h('div', { class: 'small muted' }, 'For damage'), d.length ? d.map((m) => line(m, 'dpsPct')) : h('div', { class: 'small faint' }, 'None of the tried mods add damage here.'),
          h('div', { class: 'small muted', style: { marginTop: '8px' } }, 'For defence'), e.length ? e.map((m) => line(m, 'ehpPct')) : h('div', { class: 'small faint' }, 'None of the tried mods add effective HP here.'));
      })),
      h('p', { class: 'small faint' }, 'Each mod is tried on its own, added to the item you wear, with a high roll. A rare can only have 3 prefixes and 3 suffixes, so you may have to give up a mod to get one.'),
    ];
  }

  // ---------------------------------------------------------------- page
  async function render() {
    await refreshState();
    const el = document.getElementById('page-pob');
    const st = await loadBuilds();
    PB.st = st;
    const tabs = h('div', { class: 'fb-tabs', role: 'tablist' }, TABS.map(([id, label]) =>
      h('button', { role: 'tab', 'aria-selected': PB.tab === id ? 'true' : 'false', class: PB.tab === id ? 'active' : '', onclick: () => { PB.tab = id; render(); } }, label)));
    const body = h('div', { class: 'pob-body' });
    const intro = !st.dirFound ? h('div', { class: 'panel small warn' }, 'Path of Building (Community) wasn\'t found. Install it, or choose its folder on the Snapshot tab.') : null;
    mount(el, pageHead('Path of Building', 'Snapshots of your character, and Path of Building\'s own maths on them: test an item, see every stat, compare two builds, find upgrades.'), tabs, intro, body);
    if (PB.tab === 'snapshot') {
      const box = h('div', { class: 'pob-box' });
      mount(body, box);
      await pobBox(box);
    } else if (PB.tab === 'test') mount(body, testTab());
    else if (PB.tab === 'stats') mount(body, statsTab());
    else if (PB.tab === 'compare') mount(body, compareTab());
    else mount(body, upgradesTab());
  }

  // a new snapshot: list it and use it
  window.poe.on('pob:changed', async () => {
    PB.builds = null;
    const st = await call('pob:state').catch(() => ({}));
    if (st.last?.file && st.last.file !== PB.lastSeen) { PB.lastSeen = st.last.file; PB.file = st.last.file; PB.b = st.last.file; PB.a = null; PB.results = {}; }
    if (currentPage === 'pob') render();
  });
  // an item you copied in game: tested right away on the Item tester tab, else kept for when you open it
  window.poe.on('pob:copied', (t) => {
    PB.recent = [t, ...PB.recent.filter((x) => x !== t)].slice(0, 8);
    PB.text = t;
    PB.results.test = null;
    PB.autoRun = true;
    if (currentPage === 'pob' && PB.tab === 'test') render();
  });
  // the item tester hotkey
  window.poe.on('app:goto', (g) => {
    if (g?.page !== 'pob') return;
    PB.tab = g.tab || PB.tab;
    if (g.text) { PB.text = g.text; PB.recent = [g.text, ...PB.recent.filter((x) => x !== g.text)].slice(0, 8); PB.results.test = null; PB.autoRun = true; }
    go('pob');
  });

  window.PobView = { render };
})();
