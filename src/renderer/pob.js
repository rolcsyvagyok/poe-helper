'use strict';
/* Path of Building page: snapshots of your character, and PoB's own maths on any build
   (a snapshot or a build from your PoB builds folder): item tester, full stats, two builds side by side,
   and which mods would help each gear slot most.
   Uses helpers defined in app.js (S, call, h, mount, section, toast, pageHead, refreshState, hotkeyField, fmtNum, pobBox, cleanErr). */
(() => {
  const PB = { recent: [], tab: 'snapshot', file: null, a: null, b: null, text: '', builds: null, results: {}, busy: {} };
  const TABS = [['snapshot', 'Snapshot'], ['stats', 'Build'], ['tree', 'Tree'], ['calcs', 'Calcs'], ['config', 'Configuration'], ['upgrades', 'Upgrades'], ['gems', 'Support gems'], ['levelling', 'Levelling guide'], ['compare', 'Compare snapshots']];

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
    // the build you work with stays picked (until you pick another or save a new snapshot)
    if (!has(PB.file)) PB.file = (has(st.current) ? st.current : null) || (has(st.last?.file) ? st.last.file : null) || snaps[0]?.file || PB.builds[0]?.file || null;
    const LV = PB.lv || (PB.lv = {});
    if (LV.file === undefined) LV.file = st.levelling || null;
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
    h('span', { class: 'muted small' }, 'Build'), buildSelect(PB.file, (v) => { PB.file = v; PB.results = {}; call('pob:setCurrent', v).catch(() => {}); render(); }), extra || null,
    PB.file ? h('button', { class: 'sm', style: { whiteSpace: 'nowrap' }, title: 'Starts Path of Building with this build open', onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await call('pob:openInPob', PB.file); toast('Path of Building is starting with this build'); } catch (err) { toast(errText(err)); } finally { setTimeout(() => { b.disabled = false; }, 3000); }
    } }, 'Open in Path of Building') : null);

  // ---------------------------------------------------------------- item tester
  // ---------------------------------------------------------------- item tester (on the Build tab), like PoB's Items tab:
  // paste or copy an item, see PoB's own tooltip with what equipping it in each slot gives
  function itemTester() {
    const ta = h('textarea', { rows: 4, placeholder: 'Press Ctrl+V with an item copied (Ctrl+C on it in game): it is tested right away. With "Test every item I copy" on, just copy it in game.', style: { width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: '12.5px' } }, PB.text);
    const out = h('div', { class: 'stack' });
    const run = async () => {
      PB.text = ta.value;
      if (!PB.text.trim()) return mount(out, h('p', { class: 'small muted' }, 'Paste an item first.'));
      if (!PB.file) return mount(out, h('p', { class: 'small warn' }, 'Pick a build first, or save a snapshot.'));
      mount(out, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), ' Path of Building is working it out…'));
      try { PB.results.test = { text: PB.text, file: PB.file, r: await call('pob:itemTooltip', { file: PB.file, text: PB.text }) }; showTip(out); } catch (e) { mount(out, h('p', { class: 'small warn' }, errText(e))); }
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); });
    ta.addEventListener('paste', () => setTimeout(run, 0));
    // Ctrl+V anywhere on the Build tab (not in another box) pastes the item here and tests it
    if (PB.pasteHandler) document.removeEventListener('paste', PB.pasteHandler);
    PB.pasteHandler = (e) => {
      if (!ta.isConnected) { document.removeEventListener('paste', PB.pasteHandler); PB.pasteHandler = null; return; }
      const t = e.target;
      if (t === ta || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || t?.isContentEditable) return;
      const text = e.clipboardData?.getData('text') || '';
      if (!/Rarity:/.test(text)) return;
      e.preventDefault();
      ta.value = text;
      run();
    };
    document.addEventListener('paste', PB.pasteHandler);
    if (PB.results.test && PB.results.test.text === PB.text && PB.results.test.file === PB.file) showTip(out);
    else if (PB.text && (PB.autoRun || PB.results.test?.file !== PB.file)) { PB.autoRun = false; setTimeout(run, 0); }
    const watching = PB.st?.watchClipboard !== false;
    const nameOf = (t) => { const l = t.split(/\r?\n/).map((x) => x.trim()); const i = l.findIndex((x) => x.startsWith('Rarity:')); return i >= 0 ? (l[i + 2] && !l[i + 2].startsWith('---') ? `${l[i + 1]}, ${l[i + 2]}` : l[i + 1]) : 'Item'; };
    return h('div', { class: 'panel stack pob-tester' },
      h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } }, h('h3', { style: { margin: 0 } }, 'Item tester'),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: watching, onchange: async (e) => { await call('pob:set', { watchClipboard: e.target.checked }); PB.st.watchClipboard = e.target.checked; toast(e.target.checked ? 'Every item you copy is tested here' : 'Copied items are no longer tested'); } }),
          'Test every item I copy in game (Ctrl+C)'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'sm', title: 'Use the item you copied last', onclick: async () => { const t = await call('clipboard:item').catch(() => null); if (!t) return toast('The clipboard has no Path of Exile item. Press Ctrl+C on one in game first.', true); ta.value = t; run(); } }, 'Paste from clipboard'),
        null),
      PB.recent.length > 1 ? h('div', { class: 'row small', style: { gap: '6px', flexWrap: 'wrap' } }, h('span', { class: 'muted' }, 'Copied before:'),
        PB.recent.slice(1).map((t) => h('button', { class: 'quiet sm', onclick: () => { PB.text = t; PB.results.test = null; PB.autoRun = true; render(); } }, nameOf(t)))) : null,
      ta, out,
      h('details', {}, h('summary', { class: 'small muted' }, 'Hotkey'), hotkeyField('hotkeyPobTest', 'Item tester hotkey', S.settings, 'Hover an item in game and press it: the item is copied and tested here, against the build above.', '')));
  }
  // PoB's tooltip: the item on the left, what each slot gives on the right
  function showTip(out) {
    const r = PB.results.test?.r;
    if (!r) return mount(out);
    if (r.error) return mount(out, h('p', { class: 'small warn' }, r.error));
    const lines = r.lines || [];
    const firstCmp = lines.findIndex((l) => /will give you|^\^x80A080Tip:/.test(l.text || ''));
    const itemLines = firstCmp >= 0 ? lines.slice(0, firstCmp) : lines;
    const cmpLines = firstCmp >= 0 ? lines.slice(firstCmp).filter((l) => !/^\^x80A080Tip:/.test(l.text || '')) : [];
    while (itemLines.length && itemLines[itemLines.length - 1].sep) itemLines.pop();
    const rarity = String(r.rarity || '').toLowerCase();
    const line = (l, i) => (l.sep ? h('div', { class: 'tsep' }) : h('div', { class: l.size >= 20 ? 'thead' : l.size >= 16 ? 'tline' : 'tline small' }, String(l.text).split('\n').map((t, k) => h('div', { key: k }, pobText(t)))));
    // compares: one block per "Equipping this item in … will give you:" header
    const blocks = [];
    for (const l of cmpLines) {
      if (/will give you/.test(l.text || '') || !blocks.length) blocks.push({ head: l, rows: [] });
      else blocks[blocks.length - 1].rows.push(l);
    }
    mount(out, h('div', { class: 'pob-itemtip' },
      h('div', { class: `pob-itembox rar-${rarity}` }, itemLines.map(line)),
      h('div', { class: 'pob-cmpbox' }, blocks.length ? blocks.map((b) => h('div', { class: 'pob-cmp' }, h('div', { class: 'chead' }, String(b.head.text).split('\n').map((t) => h('div', {}, pobText(t)))),
        b.rows.length ? b.rows.map((l) => (l.sep ? null : h('div', { class: 'crow' }, pobText(l.text)))) : h('div', { class: 'crow faint' }, 'No change.')))
        : h('div', { class: 'small muted' }, 'This item doesn\'t fit any slot of this build, or changes nothing.'))));
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
    const file = PB.file;
    const pickMain = async (group) => {
      try {
        const st = await call('pob:setMain', { file, group: Number(group) || null });
        // everything worked out for this build depends on the main skill
        for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`)) delete PB.results[k];
        PB.results.test = null; PB.results.find = null;
        PB.results[`stats|${file}`] = st;
        toast(`Main skill: ${st.skill || 'none'}`);
        render();
      } catch (e) { toast(errText(e), true); }
    };
    // PoB's pickers under Main skill: the skill of the group, its part, stages, mines, minion and its skill
    const setOpt = async (key, value) => {
      try {
        const st = await call('pob:skillOpt', { file, key, value });
        for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`)) delete PB.results[k];
        PB.results.test = null; PB.results.find = null;
        PB.results[`stats|${file}`] = st;
        toast(`Main skill: ${st.skill || 'none'}`);
        render();
      } catch (e) { toast(errText(e), true); }
    };
    // several trees / item sets / skill sets / config sets in one build (PoB's loadouts)
    const setSet = async (kind, value) => {
      try {
        const st = await call('pob:buildSet', { file, kind, value, link: kind === 'tree' });
        for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`)) delete PB.results[k];
        PB.results.test = null; PB.results.find = null;
        PB.results[`stats|${file}`] = st;
        toast(kind === 'tree' ? `Tree: ${st.sets?.trees?.[st.sets.tree - 1] || ''}` : 'Switched');
        render();
      } catch (e) { toast(errText(e), true); }
    };
    const S2 = r.sets;
    const setPick = (label, kind, list, cur) => list && list.length > 1 ? h('label', { class: 'row small', style: { gap: '6px' } }, h('span', { class: 'muted' }, label),
      h('select', { 'aria-label': label, title: r.editable ? null : 'Switched in PoE Helper only: your Path of Building file stays as it is.', onchange: (e) => setSet(kind, Number(e.target.value)) },
        list.map((x, i) => { const t = kind === 'tree' ? x : x.title; const divider = /^[-=_~*.\s]{3,}$/.test(t); return h('option', { value: kind === 'tree' ? i + 1 : x.id, selected: kind === 'tree' ? i + 1 === cur : x.id === cur, disabled: divider }, divider ? '──────────' : t); }))) : null;
    const setsRow = S2 ? h('div', { class: 'row small pob-sets', style: { gap: '14px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '8px' } },
      setPick('Tree', 'tree', S2.trees, S2.tree),
      setPick('Items', 'items', S2.items, S2.itemsActive),
      setPick('Skills', 'skills', S2.skills, S2.skillsActive),
      setPick('Config', 'configs', S2.configs, S2.configsActive)) : null;
    const so = r.skillOpts;
    const pick = (label, key, list, cur) => h('label', { class: 'row small', style: { gap: '6px' } }, h('span', { class: 'muted' }, label),
      h('select', { 'aria-label': label, disabled: !r.editable || list.length < 2, title: r.editable ? null : 'Pick this in Path of Building for your own builds; snapshots can be changed here.', onchange: (e) => setOpt(key, key === 'minion' ? e.target.value : Number(e.target.value)) },
        list.map(([v, t]) => h('option', { value: v, selected: v === cur }, t))));
    const count = (label, key, cur, placeholder) => h('label', { class: 'row small', style: { gap: '6px' } }, h('span', { class: 'muted' }, label),
      h('input', { type: 'number', min: 0, max: 999, style: { width: '64px' }, value: cur || '', placeholder: placeholder || '', disabled: !r.editable, 'aria-label': label,
        onchange: (e) => setOpt(key, Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0)))) }));
    const optsRow = so ? h('div', { class: 'row small pob-skillopts', style: { gap: '14px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '8px' } },
      so.active?.length > 1 ? pick('Skill', 'active', so.active.map((n, i) => [i + 1, n]), so.mainActive) : null,
      so.parts ? pick('Part', 'part', so.parts.map((n, i) => [i + 1, n]), so.part) : null,
      so.stages != null ? count('Stages', 'stages', so.stages) : null,
      so.mine ? count('Active mines', 'mines', so.mines, 'auto') : null,
      so.minions ? pick('Minion', 'minion', so.minions.map((m) => [m.id, m.name]), so.minion) : null,
      so.minionSkills ? pick('Minion skill', 'minionSkill', so.minionSkills.map((n, i) => [i + 1, n]), so.minionSkill) : null,
      r.editable ? null : h('span', { class: 'faint' }, 'Change these in Path of Building for your own builds.')) : null;
    const head = h('div', { class: 'panel pob-sum' }, h('div', { class: 'row', style: { gap: '10px' } },
      h('span', {}, h('b', {}, r.name), ` · ${[r.ascendancy || r.class, r.level ? `level ${r.level}` : null].filter(Boolean).join(' · ')}`),
      h('span', { class: 'spacer' }),
      r.skillGroups?.length ? h('label', { class: 'row small', style: { gap: '6px' } }, h('span', { class: 'muted' }, 'Main skill'),
        h('select', { 'aria-label': 'Main skill', onchange: (e) => pickMain(e.target.value) },
          r.skillGroups.map((g) => h('option', { value: g.index, selected: g.index === r.mainGroup }, `${g.name}${g.slot ? ` (${g.slot})` : ''}`)))) : null), setsRow, optsRow);
    const groups = STAT_GROUPS.map(([title, rows]) => {
      const list = rows.filter(([k]) => shownStat(d, k));
      if (!list.length) return null;
      return h('div', { class: 'panel pob-stat' }, h('h3', {}, title), h('table', {}, h('tbody', {}, list.map(([k, label, unit]) => h('tr', {}, h('td', {}, label), h('td', { class: 'r' }, statValue(d, k, unit)))))));
    });
    const skills = r.skills?.length ? h('div', { class: 'panel pob-stat' }, h('h3', {}, 'Skills in full DPS'),
      h('table', {}, h('tbody', {}, r.skills.slice().sort((a, b) => b.dps - a.dps).map((s) => h('tr', {}, h('td', {}, s.name, s.count > 1 ? ` ×${s.count}` : '', s.part ? h('span', { class: 'faint' }, ` (${s.part})`) : null), h('td', { class: 'r' }, num(s.dps * (s.count || 1)))))))) : null;
    const gear = h('div', { class: 'panel pob-stat' }, h('h3', {}, 'Gear'), h('table', {}, h('tbody', {}, (r.gear || []).map((g) => h('tr', { class: g.text ? 'pob-gearrow' : '', tabindex: g.text ? 0 : null, onmouseenter: (e) => showItemTip(e.currentTarget, g), onmouseleave: hideItemTip, onfocus: (e) => showItemTip(e.currentTarget, g), onblur: hideItemTip },
      h('td', { class: 'muted' }, g.slot), h('td', { class: `rar-${String(g.rarity || '').toLowerCase()}` }, g.title || g.name, g.title && g.base ? h('span', { class: 'faint' }, ` ${g.base}`) : null))))));
    const gems = h('div', { class: 'panel pob-stat' }, h('h3', {}, 'Gems'), (r.gems || []).map((g) => h('div', { class: 'pob-gems' + (g.enabled ? '' : ' off') + (g.main ? ' main' : '') },
      h('div', { class: 'small muted' }, g.slot || 'No slot', g.label ? ` · ${g.label}` : '', g.main ? ' · main skill' : '', g.enabled ? '' : ' · off'),
      h('div', {}, g.gems.map((x, i) => h('span', { class: (x.support ? 'sup' : 'act') + (x.enabled ? '' : ' off') }, i ? ' · ' : '', `${x.name} ${x.level}${x.quality ? `/${x.quality}` : ''}`))))));
    // the item tester sits in its own column on the right, next to the stats
    return [head, h('div', { class: 'pob-buildcols' }, h('div', { class: 'stack', style: { gap: '12px', minWidth: 0 } }, h('div', { class: 'pob-grid' }, groups, skills), h('div', { class: 'pob-grid' }, gear, gems)), h('div', { class: 'pob-side' }, itemTester()))];
  }

  // the exact item, like the game's tooltip, when you point at a gear row
  let tipEl = null;
  function hideItemTip() { tipEl?.remove(); tipEl = null; }
  function showItemTip(row, g) {
    hideItemTip();
    if (!g.text) return;
    const lines = g.text.split('\n');
    let i = 0;
    const rarity = /^Rarity:\s*(\w+)/i.exec(lines[0])?.[1]?.toLowerCase() || String(g.rarity || '').toLowerCase();
    if (/^Rarity:/i.test(lines[0])) i = 1;
    const head = [];
    // name and base: two lines for rares and uniques, one for the rest
    const nameLines = rarity === 'rare' || rarity === 'unique' || rarity === 'relic' ? 2 : 1;
    for (let k = 0; k < nameLines && i < lines.length; k++) head.push(lines[i++]);
    const props = [];
    while (i < lines.length && /^(Armour|Evasion|Energy ?Shield|Ward|Requires|Quality|Sockets|Item Level|Physical Damage|Elemental Damage|Critical|Attacks per|Weapon Range|Chance to Block)\b.*:/.test(lines[i])) props.push(lines[i++]);
    let implicitCount = 0;
    if (/^Implicits:\s*(\d+)/.test(lines[i] || '')) implicitCount = Number(/^Implicits:\s*(\d+)/.exec(lines[i++])[1]);
    const implicits = lines.slice(i, i + implicitCount);
    const rest = lines.slice(i + implicitCount);
    const special = (l) => /^(Corrupted|Mirrored|Split|Unidentified|Fractured Item|Synthesised Item)$/.test(l);
    const sec = (list, cls) => (list.length ? h('div', { class: `pob-tip-sec ${cls || ''}` }, list.map((l) => h('div', {}, l))) : null);
    tipEl = h('div', { class: `pob-tip rar-box-${rarity}`, role: 'tooltip' },
      h('div', { class: `pob-tip-head rar-${rarity}` }, head.map((l) => h('div', {}, l))),
      sec(props, 'props'), sec(implicits, 'impl'), sec(rest.filter((l) => !special(l)), 'expl'), sec(rest.filter(special), 'corr'));
    document.body.append(tipEl);
    const r = row.getBoundingClientRect();
    const w = tipEl.offsetWidth;
    const hgt = tipEl.offsetHeight;
    let x = r.right + 12;
    if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 12);
    let y = Math.min(r.top, window.innerHeight - hgt - 8);
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${Math.max(8, y)}px`;
  }

  // ---------------------------------------------------------------- Tree (PoB's tab): the passive tree, hover a node for what it does
  const NODE_R = [26, 38, 54, 36, 30, 140, 30];
  const NODE_KIND = ['Passive', 'Notable', 'Keystone', 'Jewel socket', 'Mastery', 'Class start', 'Ascendancy start'];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; };

  function treeTab() {
    const out = h('div', { class: 'stack' });
    const draw = (r) => mount(out, treeView(r, draw));
    PB.treeRedraw = { file: PB.file, draw };
    withResult('tree', out, () => call('pob:tree', PB.file), draw);
    return [buildRow(), out];
  }
  let treeTipEl = null;
  const hideTreeTip = () => { treeTipEl?.remove(); treeTipEl = null; };

  // o.file: a build other than the one picked at the top; o.readOnly: just look (the levelling guide)
  function treeView(r, redraw, o = {}) {
    const file = o.file || PB.file;
    const ro = !!o.readOnly;
    if (ro) r = { ...r, editable: false };
    const byId = new Map(r.nodes.map((n) => [n.i, n]));
    const F = PB.treeOpts || (PB.treeOpts = { q: '' });
    const diffKey = `nodes|${file}`;
    const diffs = PB.results[diffKey] || (PB.results[diffKey] = {});
    // the whole tree, and where you look (kept per build while the app runs)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of r.nodes) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); }
    const pad = 200;
    const full = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    const views = PB.treeViews || (PB.treeViews = {});
    const firstLook = !views[file];
    let view = views[file] || { ...full };
    const root = svg('svg', { class: 'pob-tree-svg', role: 'img', 'aria-label': 'Passive tree' });
    const setView = () => { root.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); views[file] = view; };
    setView();
    const gEdges = svg('g');
    const gNodes = svg('g');
    root.append(gEdges, gNodes);
    const pos = (n) => [n.x, n.y];
    for (const [a, b, arc] of r.edges) {
      const n1 = byId.get(a); const n2 = byId.get(b);
      if (!n1 || !n2) continue;
      const on = n1.a && n2.a;
      let d;
      if (arc && n1.rad) {
        let da = n2.an - n1.an;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da <= -Math.PI) da += Math.PI * 2;
        d = `M${n1.x} ${n1.y}A${n1.rad} ${n1.rad} 0 0 ${da > 0 ? 1 : 0} ${n2.x} ${n2.y}`;
      } else d = `M${n1.x} ${n1.y}L${n2.x} ${n2.y}`;
      const e = svg('path', { d, class: 'tl' + (on ? ' on' : '') + (n1.asc ? ' asc' : '') });
      e.dataset.a = a; e.dataset.b = b;
      gEdges.append(e);
    }
    const nodeEls = new Map();
    // rings drawn on top of everything, so changed nodes stand out from the art (a dark band, then the colour)
    const gHalo = svg('g', { class: 'thalo', 'pointer-events': 'none' });
    root.append(gHalo);
    // new: blue ring and a "+" badge; given up: orange ring, crossed out, and a "−" badge
    const haloEls = (x, y, r0, kind, extra = '') => {
      const R = r0 + 24;
      const out = [svg('circle', { cx: x, cy: y, r: R, class: `halo-bg${extra}` }), svg('circle', { cx: x, cy: y, r: R, class: `halo ${kind}${extra}` })];
      if (kind === 'gone') { const d = R * 0.62; out.push(svg('path', { d: `M${x - d} ${y - d}L${x + d} ${y + d}`, class: `halo-x${extra}` })); }
      const bx = x + R * 0.8; const by = y - R * 0.8;
      out.push(svg('circle', { cx: bx, cy: by, r: 36, class: `halo-badge ${kind}${extra}` }));
      const t = svg('text', { x: bx, y: by + 18, class: `halo-sign${extra}` }); t.textContent = kind === 'gone' ? '−' : '+';
      out.push(t);
      return out;
    };
    const halo = (n, kind) => gHalo.append(...haloEls(n.x, n.y, NODE_R[n.t] || 26, kind));
    root.haloEls = haloEls;
    for (const n of r.nodes) {
      if (n.t === 5 && !n.n) continue; // other classes' starts
      const cls = `tn t${n.t}${n.a ? ' on' : ''}${n.asc ? ' asc' : ''}${n.j ? ` jewel rar-${String(n.jr || '').toLowerCase()}` : ''}`;
      const c = svg('circle', { cx: n.x, cy: n.y, r: NODE_R[n.t] || 26, class: cls });
      c.dataset.i = n.i;
      gNodes.append(c);
      nodeEls.set(n.i, c);
      if (n.t === 5) {
        const t = svg('text', { x: n.x, y: n.y + 15, class: 'tclass' });
        t.textContent = r.class || '';
        gNodes.append(t);
      }
    }
    // heatmap: what each node is worth (PoB's node power), worked out a piece at a time
    const HEAT = { d: ['DPS', '#ff5a3c'], l: ['Life', '#4fd06a'], e: ['Effective HP', '#4fb4ff'] };
    const powKey = `power|${file}`;
    const heatBox = h('span', { class: 'small faint' });
    const paintHeat = () => {
      const P = PB.results[powKey];
      const k = F.heat;
      for (const el of nodeEls.values()) { el.style.fill = ''; el.style.stroke = ''; el.style.fillOpacity = ''; el.classList.remove('heat', 'useless'); }
      if (!k || !P) return mount(heatBox, '');
      const vals = Object.values(P.map).map((v) => v[k]).filter((v) => v > 0);
      const max = Math.max(0.0001, ...vals);
      const [, colour] = HEAT[k];
      for (const [id, v] of Object.entries(P.map)) {
        const el = nodeEls.get(Number(id));
        const n = byId.get(Number(id));
        if (!el || !n) continue;
        const x = v[k];
        if (n.a) { if (Math.abs(x) < 0.05) el.classList.add('useless'); continue; }
        // the tiny ones stay plain, so the nodes worth taking stand out
        const t = Math.min(1, x / max);
        if (x <= 0.05 || t < 0.04) continue;
        el.classList.add('heat');
        el.style.fill = colour;
        el.style.fillOpacity = String(0.3 + Math.sqrt(t) * 0.7);
        el.style.stroke = colour;
      }
      mount(heatBox, P.done ? `Coloured by ${HEAT[k][0].toLowerCase()} each node adds; dimmed allocated nodes add nothing to it.` : h('span', {}, h('span', { class: 'spin' }), ` Path of Building is scoring the nodes… ${Math.round((P.got / Math.max(1, P.total)) * 100)}%`));
    };
    const runHeat = async () => {
      let P = PB.results[powKey];
      if (!P) P = PB.results[powKey] = { map: {}, got: 0, total: 1, done: false };
      paintHeat();
      if (P.done || P.running) return;
      P.running = true;
      try {
        while (!P.done && PB.results[powKey] === P) {
          const res = await call('pob:power', { file, from: P.got, count: 150 });
          for (const v of res.results) P.map[v.i] = v;
          P.got = res.from + res.results.length; P.total = res.total; P.done = res.done;
          if (PB.tab === 'tree' && PB.file === file && root.isConnected) paintHeat();
        }
      } catch (e) { mount(heatBox, h('span', { class: 'warn' }, errText(e))); } finally { P.running = false; }
    };

    // change the tree: click a node like in PoB (snapshots only)
    const diffBar = h('div', { class: 'pob-cfg-diff' });
    const showDiff = () => {
      const d = PB.treeDiff?.file === file ? PB.treeDiff : null;
      if (!d) return mount(diffBar, h('span', { class: 'small faint' }, r.editable ? 'Click a node to allocate it (with the path to it), click an allocated one to remove it. What it did shows here.' : 'This is one of your own Path of Building builds: change its tree in Path of Building. Snapshots can be changed here.'));
      if (d.busy) return mount(diffBar, h('span', { class: 'what' }, d.what), h('span', { class: 'small muted' }, h('span', { class: 'spin' }), ' recalculating…'));
      if (d.error) return mount(diffBar, h('span', { class: 'what' }, d.what), h('span', { class: 'small warn' }, d.error));
      mount(diffBar, h('span', { class: 'what' }, d.what),
        d.changes.length ? d.changes.map((c) => h('span', { class: 'chg ' + (c.diff > 0 ? 'up' : 'down') },
          `${c.label} ${fmtStat(c.before, c.unit)} → ${fmtStat(c.after, c.unit)} (${c.diff > 0 ? '+' : ''}${c.pct != null && Math.abs(c.pct) < 10000 ? `${c.pct.toFixed(1)}%` : fmtStat(c.diff, c.unit)})`))
          : h('span', { class: 'small muted' }, 'No change to the main numbers.'),
        h('button', { class: 'sm', onclick: () => edit({ undo: true }, 'Undo') }, 'Undo'));
    };
    const edit = async (args, what) => {
      if (!r.editable) return;
      hideTreeTip(); closePick();
      PB.treeDiff = { file, what, busy: true }; showDiff();
      try {
        const nr = await call('pob:treeEdit', { file, ...args });
        if (nr.needEffect) { PB.treeDiff = null; showDiff(); return; }
        if (nr.error) { PB.treeDiff = { file, what, error: nr.error }; showDiff(); return; }
        const used = nr.used - r.used;
        PB.treeDiff = { file, what: `${what}${used ? ` (${used > 0 ? '+' : ''}${used} ${Math.abs(used) === 1 ? 'point' : 'points'})` : ''}`, changes: statDiff(r.summary?.stats, nr.summary?.stats) };
        // everything worked out for this build changes with its tree
        for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`) && !k.startsWith('config|')) delete PB.results[k];
        PB.results.test = null; PB.results.find = null;
        PB.results[`tree|${file}`] = nr;
        redraw(nr);
      } catch (e) { PB.treeDiff = { file, what, error: errText(e) }; showDiff(); }
    };
    // a mastery: pick its effect (like PoB's popup)
    let pickEl = null;
    const closePick = () => { pickEl?.remove(); pickEl = null; };
    const pickMastery = (n, at) => {
      closePick(); hideTreeTip();
      pickEl = h('div', { class: 'pob-tree-pick', role: 'dialog', 'aria-label': `${n.n} effects` },
        h('div', { class: 'ttl' }, n.n || 'Mastery', h('button', { class: 'sm ghost', 'aria-label': 'Close', onclick: closePick }, '×')),
        (n.m || []).map((o) => h('button', { class: 'opt' + (o.id === n.ms ? ' on' : ''), onclick: () => edit({ id: n.i, effect: o.id }, `${n.n}: ${o.label}`) }, o.label)),
        n.a ? h('button', { class: 'opt rm', onclick: () => edit({ id: n.i }, `Removed ${n.n}`) }, 'Remove this mastery') : null);
      document.body.append(pickEl);
      const w = pickEl.offsetWidth; const hh = pickEl.offsetHeight;
      pickEl.style.left = `${Math.max(8, Math.min(at.x + 12, window.innerWidth - w - 8))}px`;
      pickEl.style.top = `${Math.max(8, Math.min(at.y - 20, window.innerHeight - hh - 8))}px`;
    };
    root.addEventListener('click', (e) => {
      if (lastDragMoved) return;
      const id = Number(e.target?.dataset?.i);
      const n = id && byId.get(id);
      if (!n || n.t >= 5 || !r.editable) return;
      if (PB.opt?.file === file) { toast('Keep the optimised tree or go back to yours first.'); return; }
      if (n.t === 4) { if (n.m?.length) pickMastery(n, { x: e.clientX, y: e.clientY }); return; }
      edit({ id }, `${n.a ? 'Removed' : 'Allocated'} ${n.n || NODE_KIND[n.t]}`);
    });
    let lastDragMoved = false;

    // the optimiser: what it changed so far (blue: taken, dashed orange ring: given up)
    const O = PB.opt?.file === file ? PB.opt : null;
    if (O) {
      for (const n of r.nodes) {
        const el = nodeEls.get(n.i);
        if (!el) continue;
        if (n.a && !O.startIds.has(n.i)) { el.classList.add('new'); halo(n, 'new'); }
        if (!n.a && O.startIds.has(n.i)) { el.classList.add('gone'); halo(n, 'gone'); }
      }
      // the connections it takes (blue) and gives up (dashed orange)
      const isOn = new Map(r.nodes.map((n) => [n.i, !!n.a]));
      for (const e of gEdges.children) {
        const a = Number(e.dataset.a); const b = Number(e.dataset.b);
        if (isOn.get(a) && isOn.get(b) && (!O.startIds.has(a) || !O.startIds.has(b))) e.classList.add('new');
        else if (O.startIds.has(a) && O.startIds.has(b) && (!isOn.get(a) || !isOn.get(b))) e.classList.add('gone');
      }
    }
    const optPanel = ro ? null : optimiserPanel(r, file);
    const tlPanel = ro ? null : timelessPanel(r, file);
    // the socket the timeless jewel search is about, with the jewel's radius
    const TL = PB.tl?.file === file ? PB.tl : null;
    const sock = TL && (TL.sockets || []).find((x) => x.id === TL.socket);
    if (sock) {
      gEdges.prepend(svg('circle', { cx: sock.x, cy: sock.y, r: sock.radius || 1500, class: 'tradius' }));
      nodeEls.get(sock.id)?.classList.add('tsock');
      for (const id of TL.shown?.ids || []) nodeEls.get(id)?.classList.add('tconq');
    }

    // the real node art (PoB's sprite sheets from your PoB folder), under the circles that keep hover and highlights
    const drawArt = (art) => {
      if (!root.isConnected && !root.parentNode) { /* still being built: fine */ }
      const defs = svg('defs');
      const sheetId = {};
      Object.entries(art).forEach(([f, url], k) => { const im = svg('image', { id: `pobsheet-${k}`, href: url }); defs.append(im); sheetId[f] = `pobsheet-${k}`; });
      const gArt = svg('g', { class: 'tart', 'pointer-events': 'none' });
      const put = (n, idx) => {
        const sp = idx && r.sprites[idx - 1];
        if (!sp || !sheetId[sp.f]) return;
        const size = sp.w * 2.66;
        const hh = sp.h * 2.66;
        const box = svg('svg', { x: n.x - size / 2, y: n.y - hh / 2, width: size, height: hh, viewBox: `${sp.x} ${sp.y} ${sp.w} ${sp.h}`, preserveAspectRatio: 'none', overflow: 'hidden' });
        box.append(svg('use', { href: `#${sheetId[sp.f]}` }));
        gArt.append(box);
      };
      for (const n of r.nodes) {
        if (n.t === 5 && !n.n) continue;
        put(n, n.a ? n.ia : n.iu);
        put(n, n.a ? n.fa : n.fu);
      }
      root.insertBefore(defs, root.firstChild);
      root.insertBefore(gArt, gNodes);
      root.classList.add('art');
    };
    if (r.sprites?.length && r.treeVersion) {
      const files = [...new Set(r.sprites.map((x) => x.f))];
      const ak = `${r.treeVersion}|${files.join(',')}`;
      const cached = (PB.treeArt || (PB.treeArt = {}))[ak];
      if (cached) drawArt(cached);
      else call('pob:treeArt', { version: r.treeVersion, files }).then((art) => { PB.treeArt[ak] = art; if (Object.keys(art).length) drawArt(art); }).catch(() => {});
    }

    // search: rings round the nodes that match, like PoB
    const doSearch = () => {
      const q = F.q.trim().toLowerCase();
      let hits = 0;
      for (const n of r.nodes) {
        const el = nodeEls.get(n.i);
        if (!el) continue;
        const hit = !!q && ((n.n || '').toLowerCase().includes(q) || (n.s || []).some((l) => l.toLowerCase().includes(q)) || (n.j || '').toLowerCase().includes(q));
        el.classList.toggle('hit', hit);
        if (hit) hits++;
      }
      mount(hitBox, q ? `${hits} ${hits === 1 ? 'node' : 'nodes'} match` : '');
    };
    const hitBox = h('span', { class: 'small faint' });

    // hover: the node, what it does, and the path to it
    let hoverId = null;
    const clearPath = () => { root.querySelectorAll('.path').forEach((e) => e.classList.remove('path')); };
    const markPath = (ids) => {
      clearPath();
      const set = new Set(ids);
      for (const id of ids) nodeEls.get(id)?.classList.add('path');
      gEdges.querySelectorAll('path').forEach((e) => { if (set.has(Number(e.dataset.a)) && (set.has(Number(e.dataset.b)) || byId.get(Number(e.dataset.b))?.a) || set.has(Number(e.dataset.b)) && byId.get(Number(e.dataset.a))?.a) e.classList.add('path'); });
    };
    const diffBlock = (title, a, b) => {
      const ch = statDiff(a, b);
      return h('div', { class: 'tsec' }, h('div', { class: 'tdh' }, title), ch.length ? ch.map((c) => h('div', { class: c.diff > 0 ? 'up' : 'down' },
        `${c.diff > 0 ? '+' : ''}${c.pct != null && Math.abs(c.pct) < 10000 ? `${c.pct.toFixed(1)}%` : fmtStat(c.diff, c.unit)} ${c.label} (${fmtStat(c.before, c.unit)} → ${fmtStat(c.after, c.unit)})`)) : h('div', { class: 'faint' }, 'No change.'));
    };
    const showTip = (n, at) => {
      hideTreeTip();
      const d = diffs[n.i];
      const kind = n.t === 3 && n.j ? 'Jewel socket' : NODE_KIND[n.t];
      treeTipEl = h('div', { class: 'pob-tree-tip', role: 'tooltip' },
        h('div', { class: `tname t${n.t}` }, n.n || kind, h('span', { class: 'tkind' }, `${kind}${n.a ? ' · allocated' : ''}`)),
        n.s?.length && !(n.t === 4 && !n.a && n.m?.length) ? h('div', { class: 'tsec' }, n.s.map((l) => h('div', {}, l))) : null,
        n.r?.length ? h('div', { class: 'tsec faint' }, n.r.map((l) => h('div', {}, plainPob(l)))) : null,
        n.j ? h('div', { class: 'tsec' }, h('div', { class: `rar-${String(n.jr || '').toLowerCase()}` }, n.j), (n.jt || '').split('\n').filter((l) => !/^(Rarity:|Implicits:)/.test(l)).slice(2).map((l) => h('div', { class: 'jl' }, l))) : null,
        (() => { const P = PB.results[powKey]?.map?.[n.i]; const k = F.heat; return P && k ? h('div', { class: 'tsec' }, `${n.a ? 'Worth' : 'Adds'} ${P[k] >= 0 ? '' : ''}${P[k].toFixed(1)}% ${HEAT[k][0].toLowerCase()} on its own`) : null; })(),
        n.t === 4 && !n.a && n.m?.length ? h('div', { class: 'tsec' }, h('div', { class: 'tdh' }, 'Choices:'), n.m.map((o) => h('div', {}, `• ${o.label}`))) : null,
        r.editable && n.t < 5 ? h('div', { class: 'tsec faint' }, n.t === 4 ? 'Click to pick its effect.' : n.a ? 'Click to remove it (and what hangs on it).' : n.u ? 'Path of Building can\'t reach it from your tree.' : 'Click to allocate it (and the path to it).') : null,
        n.t >= 5 || n.t === 4 ? null : !d ? h('div', { class: 'tsec faint' }, h('span', { class: 'spin' }), ' Path of Building is working it out…')
          : d.error ? h('div', { class: 'tsec warn' }, d.error)
          : [d.one ? diffBlock(n.a ? 'Unallocating this node will give you:' : 'Allocating this node will give you:', d.base, d.one) : null,
            d.all ? diffBlock(n.a ? `Unallocating it and the ${d.count} nodes depending on it:` : `Allocating it and the ${d.count} nodes leading to it:`, d.base, d.all) : null,
            !n.a && d.count ? h('div', { class: 'tsec faint' }, `${d.count} ${d.count === 1 ? 'point' : 'points'} to get here.`) : null]);
      document.body.append(treeTipEl);
      const w = treeTipEl.offsetWidth; const hh = treeTipEl.offsetHeight;
      let x = at.x + 18; if (x + w > window.innerWidth - 8) x = Math.max(8, at.x - w - 18);
      const y = Math.max(8, Math.min(at.y - 10, window.innerHeight - hh - 8));
      treeTipEl.style.left = `${x}px`; treeTipEl.style.top = `${y}px`;
    };
    let lastAt = { x: 0, y: 0 };
    let timer = null;
    root.addEventListener('mousemove', (e) => {
      lastAt = { x: e.clientX, y: e.clientY };
      if (drag) return;
      const id = Number(e.target?.dataset?.i);
      if (!id) { if (hoverId) { hoverId = null; hideTreeTip(); clearPath(); } return; }
      if (id === hoverId) { if (treeTipEl) { const w = treeTipEl.offsetWidth; let x = lastAt.x + 18; if (x + w > window.innerWidth - 8) x = Math.max(8, lastAt.x - w - 18); treeTipEl.style.left = `${x}px`; } return; }
      hoverId = id;
      const n = byId.get(id);
      showTip(n, lastAt);
      clearTimeout(timer);
      if (n.t >= 4 || ro) return;
      const ready = (dd) => { if (hoverId !== id) return; if (dd?.path?.length) markPath(dd.path); showTip(n, lastAt); };
      if (diffs[id]) return ready(diffs[id]);
      timer = setTimeout(async () => {
        try { diffs[id] = await call('pob:node', { file, id }); } catch (err) { diffs[id] = { error: errText(err) }; }
        ready(diffs[id]);
      }, 120);
    });
    root.addEventListener('mouseleave', () => { hoverId = null; hideTreeTip(); clearPath(); });

    // pan (drag) and zoom (wheel), like PoB
    let drag = null;
    const toTree = (cx, cy) => { const b = root.getBoundingClientRect(); const s = Math.max(view.w / b.width, view.h / b.height); const ox = view.x + (view.w - b.width * s) / 2; const oy = view.y + (view.h - b.height * s) / 2; return { x: ox + (cx - b.left) * s, y: oy + (cy - b.top) * s, s }; };
    root.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = toTree(e.clientX, e.clientY);
      const k = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const w = Math.min(full.w * 1.5, Math.max(600, view.w * k));
      const f = w / view.w;
      view = { x: p.x - (p.x - view.x) * f, y: p.y - (p.y - view.y) * f, w, h: view.h * f };
      setView();
    }, { passive: false });
    root.addEventListener('mousedown', (e) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, v: { ...view }, s: toTree(0, 0).s, moved: false }; root.classList.add('drag'); hideTreeTip(); });
    // one set of window listeners for the tree on screen
    (PB.treeWin || []).forEach(([t, f]) => window.removeEventListener(t, f));
    const onMove = (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) * drag.s; const dy = (e.clientY - drag.y) * drag.s;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      view = { ...drag.v, x: drag.v.x - dx, y: drag.v.y - dy };
      setView();
    };
    const onUp = () => { if (drag) { lastDragMoved = drag.moved; drag = null; root.classList.remove('drag'); setTimeout(() => { lastDragMoved = false; }, 0); } };
    PB.treeWin = [['mousemove', onMove], ['mouseup', onUp]];
    PB.treeWin.forEach(([t, f]) => window.addEventListener(t, f));
    const fit = (onlyAlloc) => {
      const list = onlyAlloc ? r.nodes.filter((n) => n.a && !n.asc) : r.nodes;
      if (!list.length) return;
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const n of list) { a = Math.min(a, n.x); b = Math.min(b, n.y); c = Math.max(c, n.x); d = Math.max(d, n.y); }
      const p2 = onlyAlloc ? 600 : pad;
      view = { x: a - p2, y: b - p2, w: c - a + p2 * 2, h: d - b + p2 * 2 };
      setView();
    };
    if (firstLook) fit(true);
    const zoom = (k) => { const cx = view.x + view.w / 2; const cy = view.y + view.h / 2; const w = Math.min(full.w * 1.5, Math.max(600, view.w * k)); const f = w / view.w; view = { x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w, h: view.h * f }; setView(); };

    const notables = r.nodes.filter((n) => n.a && (n.t === 1 || n.t === 2) && !n.asc).length;
    const over = r.maxPoints && r.used > r.maxPoints;
    const ascOver = r.ascMax && r.ascUsed > r.ascMax;
    const head = h('div', { class: 'panel row', style: { gap: '12px', flexWrap: 'wrap' } },
      h('span', {}, h('b', {}, `${r.class || ''}${r.ascendancy ? ` · ${r.ascendancy}` : ''}`), h('span', { class: 'small muted' }, ` · level ${r.level || '?'} · `),
        h('span', { class: 'small' + (over ? ' warn' : ' muted'), title: r.act ? `At level ${r.level} you are probably in act ${Math.min(10, r.act)}${r.act > 10 ? ' (campaign done)' : ''}: level − 1 plus the quest points of the acts before it${r.act > 2 ? ' and the bandits\' point' : ''}. Never fewer than the tree already has.` : null }, `${r.used}${r.maxPoints ? ` / ${r.maxPoints}` : ''} points`),
        h('span', { class: 'small' + (ascOver ? ' warn' : ' muted') }, ` · ${r.ascUsed || 0} / ${r.ascMax ?? 8} ascendancy`),
        h('span', { class: 'small muted' }, ` · ${notables} notables and keystones`)),
      h('span', { class: 'spacer' }),
      ro ? null : h('label', { class: 'small row', style: { gap: '6px' } }, 'Heatmap',
        h('select', { 'aria-label': 'Heatmap', onchange: (e) => { F.heat = e.target.value || null; if (F.heat) runHeat(); else paintHeat(); } },
          h('option', { value: '', selected: !F.heat }, 'Off'), Object.entries(HEAT).map(([k, [label]]) => h('option', { value: k, selected: F.heat === k }, label)))),
      h('input', { type: 'search', placeholder: 'Search the tree', value: F.q, style: { width: '200px' }, oninput: (e) => { F.q = e.target.value; doSearch(); } }), hitBox,
      h('button', { class: 'sm', title: 'Zoom in', onclick: () => zoom(1 / 1.4) }, '+'), h('button', { class: 'sm', title: 'Zoom out', onclick: () => zoom(1.4) }, '−'),
      h('button', { class: 'sm', onclick: () => fit(true) }, 'Your nodes'), h('button', { class: 'sm', onclick: () => fit(false) }, 'Whole tree'),
      r.editable ? h('button', { class: 'sm' + (PB.optOpen ? ' primary' : ''), 'aria-expanded': PB.optOpen ? 'true' : 'false', onclick: () => { PB.optOpen = !PB.optOpen; redraw(r); } }, 'Optimise') : null,
      ro ? null : h('button', { class: 'sm' + (PB.tlOpen ? ' primary' : ''), 'aria-expanded': PB.tlOpen ? 'true' : 'false', onclick: () => { PB.tlOpen = !PB.tlOpen; redraw(r); } }, 'Timeless jewel'));
    doSearch();
    showDiff();
    if (F.heat && !ro) runHeat();
    // full screen: the tree fills the window (button in its corner, Esc or the button again to leave)
    const FS_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    const FS_EXIT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
    const fsBtn = h('button', { class: 'sm pob-tree-fs', 'aria-label': 'Full screen', title: 'Full screen (Esc to leave)' });
    const treeBox = h('div', { class: 'pob-tree-box' + (PB.treeFull ? ' full' : '') }, root, fsBtn);
    const setFull = (on) => {
      PB.treeFull = on;
      treeBox.classList.toggle('full', on);
      fsBtn.innerHTML = on ? FS_EXIT : FS_ICON;
      fsBtn.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
      document.body.classList.toggle('pob-tree-fullscreen', on);
      if (on) treeBox.append(diffBar); else treeBox.after(diffBar);
    };
    fsBtn.onclick = () => setFull(!PB.treeFull);
    if (PB.treeEsc) document.removeEventListener('keydown', PB.treeEsc);
    PB.treeEsc = (e) => { if (e.key === 'Escape' && PB.treeFull && treeBox.isConnected) setFull(false); };
    document.addEventListener('keydown', PB.treeEsc);
    setTimeout(() => setFull(!!PB.treeFull), 0);
    if (ro) { diffBar.style.display = 'none'; return [head, treeBox, h('p', { class: 'small faint' }, 'Drag to move, scroll to zoom. Hover a node to read it.')]; }
    return [head, optPanel, tlPanel, heatBox, treeBox, diffBar,
      h('p', { class: 'small faint' }, `Hover a node to see what it does to your build (Path of Building works it out with the path to it). Drag to move, scroll to zoom.${r.editable ? ' Changes are saved into this snapshot.' : ''}`)];
  }

  // ---------------------------------------------------------------- share and import, like PoB's Import/Export tab
  function shareBox() {
    const res = h('div', { class: 'small' });
    const share = PB.share || (PB.share = { text: '', name: '', link: null });
    const linkRow = () => (share.link && share.link.file === PB.file ? h('div', { class: 'row', style: { gap: '8px' } },
      h('span', { class: 'small' }, 'Link: ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); call('shell:open', share.link.url); } }, share.link.url)),
      h('button', { class: 'sm', onclick: () => { call('clipboard:write', share.link.url); toast('Link copied'); } }, 'Copy link')) : null);
    const linkBox = h('div', {}, linkRow());
    const ta = h('textarea', { rows: 3, placeholder: 'Paste a Path of Building code, or a link: pobb.in, poe.ninja, pob.codes, Maxroll, Pastebin…', style: { width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: '12px' }, oninput: (e) => { share.text = e.target.value; } }, share.text);
    const doImport = async (btn) => {
      btn.disabled = true;
      mount(res, h('span', { class: 'spin' }), ' Importing…');
      try {
        const r = await call('pob:importCode', { text: ta.value, name: share.name });
        share.text = ''; ta.value = '';
        PB.builds = null; PB.file = r.file; PB.results = {}; call('pob:setCurrent', r.file).catch(() => {});
        const what = [r.info.ascendancy || r.info.className, r.info.level ? `level ${r.info.level}` : null, r.info.skill].filter(Boolean).join(' · ');
        toast(`Imported${r.site ? ` from ${r.site}` : ''}: ${what || 'build'}`);
        PB.tab = 'stats';
        render();
      } catch (e) { mount(res, h('span', { class: 'warn' }, errText(e))); } finally { btn.disabled = false; }
    };
    return h('div', { class: 'panel stack', style: { marginTop: '16px' } },
      h('h3', { style: { margin: 0 } }, 'Share and import builds'),
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
        buildSelect(PB.file, (v) => { PB.file = v; PB.results = {}; call('pob:setCurrent', v).catch(() => {}); render(); }, 'Share'),
        h('button', { class: 'sm', disabled: !PB.file, onclick: async () => { try { const r = await call('pob:exportCode', PB.file); toast(`Build code copied (${r.length.toLocaleString()} characters): paste it in Path of Building's Import/Export tab`); } catch (e) { toast(errText(e)); } } }, 'Copy build code'),
        h('button', { class: 'sm', disabled: !PB.file, title: 'Uploads the build to pobb.in and gives you a link anyone can open', onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { const r = await call('pob:sharePobb', PB.file); share.link = { file: PB.file, url: r.url }; await call('clipboard:write', r.url); toast('pobb.in link copied'); mount(linkBox, linkRow()); } catch (err) { toast(errText(err)); } finally { b.disabled = false; }
        } }, 'Share on pobb.in')),
      linkBox,
      h('div', { class: 'small faint' }, 'pobb.in links are public: anyone with the link sees the build (gear, tree, character name).'),
      h('div', { class: 'stack', style: { gap: '6px', marginTop: '6px' } },
        h('label', { class: 'small muted' }, 'Import a build'), ta,
        h('div', { class: 'row', style: { gap: '8px' } },
          h('input', { type: 'text', placeholder: 'Name (optional)', value: share.name, style: { width: '260px' }, oninput: (e) => { share.name = e.target.value; } }),
          h('button', { class: 'primary sm', onclick: (e) => doImport(e.currentTarget) }, 'Import'),
          h('span', { class: 'small faint' }, 'It is saved with your snapshots, so every tab works on it (and it opens in Path of Building too).')),
        res));
  }

  // ---------------------------------------------------------------- "for this skill": another skill than the build's main one
  // (a levelling skill in act 1, say): Upgrades and Support gems work for it, with its best supports at your level
  let pickerN = 0;
  function skillPicker(file, onchange) {
    const A = PB.asSkill || (PB.asSkill = { name: '', links: '' });
    const skillsKey = `skills|${file}`;
    const id = `pob-skills-${++pickerN}`;
    const list = h('datalist', { id });
    const fill = (sk) => mount(list, sk.map((x) => h('option', { value: x.name }, `${x.tags || ''}${x.req > 1 ? ` · level ${x.req}` : ''}`)));
    if (PB.results[skillsKey]) fill(PB.results[skillsKey]);
    else call('pob:levelPlan', { file, op: 'activeSkills' }).then((x) => { PB.results[skillsKey] = x.skills || []; fill(PB.results[skillsKey]); }).catch(() => {});
    const changed = () => { PB.results.find = null; for (const k of Object.keys(PB.results)) if (/^(upgrades|gems)\|/.test(k)) delete PB.results[k]; onchange?.(); };
    // the build's own main skill and its most links (from its stats)
    const st = PB.results[`stats|${file}`];
    if (!st) call('pob:stats', file).then((x) => { PB.results[`stats|${file}`] = x; if (!A.name) { nameIn.value = x.skill || ''; mount(linkSel, linkOpts()); } }).catch(() => {});
    const mainName = () => PB.results[`stats|${file}`]?.skill || '';
    const maxLinks = () => Math.max(1, ...(PB.results[`stats|${file}`]?.gems || []).map((g) => (g.gems || []).filter((x) => x.enabled !== false).length));
    const isMain = (n) => !n || n.toLowerCase() === mainName().toLowerCase();
    const linkOpts = () => [['', `as many as your build has (${maxLinks()})`], ...[2, 3, 4, 5, 6].map((n) => [String(n), `${n}-link`])].map(([v, t]) => h('option', { value: v, selected: String(A.links) === v }, t));
    const nameIn = h('input', { type: 'text', list: id, placeholder: 'Your build\'s main skill', value: A.name || mainName(), style: { width: '320px' },
      onchange: (e) => { const v = e.target.value.trim(); A.name = isMain(v) ? '' : v; if (!v) e.target.value = mainName(); changed(); } });
    const linkSel = h('select', { 'aria-label': 'Links', onchange: (e) => { A.links = e.target.value; changed(); } }, linkOpts());
    const el = h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
      h('label', { class: 'small row', style: { gap: '6px' } }, 'For the skill', list, nameIn),
      h('label', { class: 'small row', style: { gap: '6px' } }, 'Links', linkSel),
      h('span', { class: 'small faint' }, 'Your main skill by default; type another (Sunder, Rolling Magma…) and it is put in with the best supports you can use at your level, just for this (nothing is saved).'));
    // the skill to use, or null for the build's own
    const get = (level) => {
      if (isMain(A.name)) return null;
      const sk = (PB.results[skillsKey] || []).find((x) => x.name.toLowerCase() === A.name.toLowerCase());
      if (!sk) throw new Error(`"${A.name}" isn't a skill gem Path of Building knows. Pick one from the list.`);
      return { skill: sk.id, name: sk.name, links: Number(A.links) || maxLinks() || LINKS_AT(level || 1), level, req: sk.req };
    };
    return { el, get };
  }

  // ---------------------------------------------------------------- support gem optimiser
  function gemsTab() {
    const out = h('div', { class: 'stack' });
    if (!PB.file) { mount(out, h('p', { class: 'small muted' }, 'Pick a build first, or save a snapshot.')); return [buildRow(), out]; }
    const file = PB.file;
    const key = `gems|${file}`;
    const G = PB.gemSet || (PB.gemSet = { level: null, quality: 20, awakened: false, exceptional: false, keep: {} });
    // the character level of this build unless you typed one for it
    if (G.levelFor !== file) { G.level = PB.results[`stats|${file}`]?.level || null; G.levelFor = file; }
    const resBox = h('div', { class: 'stack' });
    const picker = skillPicker(file, () => render());
    const statsKey = `stats|${file}`;
    const keepBox = h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } });
    const drawKeep = (st) => {
      const main = (st?.gems || []).find((g) => g.main);
      const sup = (main?.gems || []).map((g, i) => ({ ...g, slot: i + 1 })).filter((g) => g.support && g.enabled);
      if (!sup.length) return mount(keepBox, '');
      const kk = G.keep[file] || (G.keep[file] = {});
      mount(keepBox, h('span', { class: 'small muted' }, 'Keep:'), sup.map((g) => h('label', { class: 'check small' },
        h('input', { type: 'checkbox', checked: !!kk[g.slot], onchange: (e) => { kk[g.slot] = e.target.checked; } }), `${g.name} ${g.level}/${g.quality}`)));
    };
    if (PB.results[statsKey]) drawKeep(PB.results[statsKey]);
    else call('pob:stats', file).then((st) => { PB.results[statsKey] = st; drawKeep(st); if (G.level == null) { G.level = st.level || null; lvlIn.value = G.level || ''; } }).catch(() => {});
    if (G.level == null && PB.results[statsKey]?.level) G.level = PB.results[statsKey].level;
    const lvlIn = h('input', { type: 'number', min: 1, max: 100, value: G.level || '', style: { width: '70px' }, onchange: (e) => { G.level = Number(e.target.value) || null; } });
    const run = async (btn, apply) => {
      btn.disabled = true;
      mount(resBox, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), ' Path of Building is trying every support gem in every slot (a few seconds)…'));
      const kk = G.keep[file] || {};
      try {
        const as = picker.get(G.level || PB.results[`stats|${file}`]?.level);
        const r = as && !apply
          ? { ...(await call('pob:levelPlan', { file, op: 'levelSkill', skill: as.skill, level: G.level || PB.results[`stats|${file}`]?.level, links: as.links, quality: G.quality })), editable: false, asName: as.name }
          : await call('pob:supportGems', { file, level: G.level, quality: G.quality, awakened: G.awakened, exceptional: G.exceptional, keep: Object.keys(kk).filter((k) => kk[k]).map(Number), apply });
        if (r.error) { mount(resBox, h('p', { class: 'small warn' }, r.error)); return; }
        if (apply) {
          for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`) && !k.startsWith('config|')) delete PB.results[k];
          PB.results.test = null; PB.results.find = null;
          toast('The new support gems are in this snapshot');
          render();
          return;
        }
        PB.results[key] = r;
        mount(resBox, gemsView(r, (b) => run(b, true)));
      } catch (e) { mount(resBox, h('p', { class: 'small warn' }, errText(e))); } finally { btn.disabled = false; }
    };
    if (PB.results[key]) mount(resBox, gemsView(PB.results[key], (b) => run(b, true)));
    mount(out, h('div', { class: 'panel stack' },
      h('p', { class: 'small muted', style: { margin: 0 } }, 'For your main skill: every support gem that can support it, at the highest level you can use at that character level, is tried in place of each of your supports, and Path of Building keeps the best set. Your own gems are counted at their highest level too.'),
      h('div', { class: 'row', style: { gap: '14px', flexWrap: 'wrap' } },
        h('label', { class: 'small row', style: { gap: '6px' } }, 'Character level', lvlIn),
        h('label', { class: 'small row', style: { gap: '6px' } }, 'Gem quality', h('select', { 'aria-label': 'Gem quality', onchange: (e) => { G.quality = Number(e.target.value); } },
          [[0, '0 (new gems)'], [20, '20']].map(([v, t]) => h('option', { value: v, selected: G.quality === v }, t)))),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: G.awakened, onchange: (e) => { G.awakened = e.target.checked; } }), 'Awakened gems'),
        h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: G.exceptional, onchange: (e) => { G.exceptional = e.target.checked; } }), 'Empower, Enhance, Enlighten and other exceptional gems'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'primary sm', onclick: (e) => run(e.currentTarget, false) }, 'Find the best supports')),
      picker.el, PB.asSkill?.name ? null : keepBox), resBox);
    return [buildRow(), out];
  }
  function gemsView(r, apply) {
    const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : 0);
    const sign = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    const dpsLabel = r.full ? 'full DPS' : 'DPS';
    const changed = r.final.some((f) => f.name !== f.was || f.level !== f.wasLevel);
    return [
      h('div', { class: 'panel stack' },
        h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
          h('b', {}, `${r.skill} at character level ${r.charLevel}`), r.asName ? h('span', { class: 'small faint' }, `(not your build's skill: ${r.final.length + 1}-link, sockets filled with the best supports${r.weapon ? `; your weapon can't use it, so with a plain ${r.weapon}` : ''})`) : null,
          r.asName ? h('span', {}, `${num(r.finalValue)} ${dpsLabel}`) : h('span', {}, `${num(r.startValue)} → ${num(r.finalValue)} ${dpsLabel}`, h('span', { class: r.finalValue >= r.startValue ? 'good' : 'warn' }, ` (${sign(pct(r.finalValue, r.startValue))})`)),
          r.manaBefore != null && r.manaAfter != null && Math.round(r.manaBefore) !== Math.round(r.manaAfter) ? h('span', { class: 'small muted' }, `Mana cost ${Math.round(r.manaBefore)} → ${Math.round(r.manaAfter)}`) : null,
          h('span', { class: 'spacer' }),
          r.editable && changed ? h('button', { class: 'primary sm', title: 'Puts these gems (and levels) in the snapshot', onclick: (e) => apply(e.currentTarget) }, 'Put these in the snapshot') : null),
        r.levelled.length ? h('div', { class: 'small' }, h('span', { class: 'muted' }, `Highest gem levels at character level ${r.charLevel}: `), r.levelled.map((l) => `${l.name} ${l.from} → ${l.to}`).join(' · '),
          h('span', { class: 'muted' }, ` (${num(r.startValue)} → ${num(r.levelledValue)} ${dpsLabel} with your own gems)`)) : null,
        (r.unusable || []).length ? h('div', { class: 'small warn' }, `Not usable at character level ${r.charLevel}: ${r.unusable.map((u) => `${u.name} (needs level ${u.req})`).join(', ')}${r.unusable.some((u) => u.support) ? '; those supports are swapped for ones you can use' : ''}.`) : null,
        r.changes.length ? (() => {
          // what goes out and what comes in (a gem may just move to another socket)
          const before = new Set(r.final.map((f) => f.was));
          const after = new Set(r.final.map((f) => f.name));
          const out = r.final.filter((f) => !after.has(f.was)).map((f) => `${f.was} ${f.wasLevel}`);
          const inn = r.final.filter((f) => !before.has(f.name)).map((f) => `${f.name} ${f.level}`);
          return h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Take out '), h('span', { class: 'gone' }, out.join(', ')), h('span', { class: 'muted' }, ', put in '), h('span', { class: 'new' }, inn.join(', ')), '.');
        })()
          : r.asName ? h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Socket it with: '), h('span', { class: 'new' }, r.final.filter((f) => !f.off).map((f) => `${f.name} ${f.level}`).join(', ') || 'no support helps yet'), '.')
          : h('div', { class: 'small muted' }, 'Your supports are already the best ones Path of Building found for this skill.'),
        h('div', { class: 'small faint' }, `${r.candidates} support gems can support this skill. Quality ${r.quality} is used for every support.`)),
      h('div', { class: 'pob-grid' }, r.final.map((f) => h('div', { class: 'panel pob-stat' },
        h('h3', {}, f.off ? 'Empty socket' : `${f.name} ${f.level}/${f.quality}`, f.off ? h('span', { class: 'small faint' }, ` (${f.was} needs a higher level, nothing else helps)`) : f.name !== f.was ? h('span', { class: 'small faint' }, ' (new)') : null, f.locked ? h('span', { class: 'small faint' }, ' · kept') : null),
        f.alts?.length ? h('table', {}, h('tbody', {}, f.alts.map((a, k) => h('tr', {}, h('td', {}, `${a.name}`), h('td', { class: 'small muted' }, `level ${a.level}`),
          h('td', { class: `small ${a.pct > 0.05 ? 'good' : a.pct < -0.05 ? 'warn' : 'faint'}`, style: { textAlign: 'right' } }, Math.abs(a.pct) < 0.05 ? (a.name === f.name ? 'chosen' : 'same') : sign(a.pct)))))) : h('p', { class: 'small faint' }, f.locked ? 'Kept as it is.' : ''),
        f.alts?.length ? h('div', { class: 'small faint' }, 'Best gems for this slot, against the chosen set.') : null))),
    ];
  }

  const LINKS_AT = (L) => (L < 12 ? 2 : L < 31 ? 3 : L < 60 ? 4 : 5);

  // ---------------------------------------------------------------- levelling guide
  // A build of its own (a guide imported from Path of Building), only to look at: its trees and the gems
  // that go with each. It is never used for upgrades, the item tester or the price check comparison.
  function levellingTab() {
    const out = h('div', { class: 'stack' });
    const LV = PB.lv || (PB.lv = {});
    const builds = PB.builds || [];
    const file = LV.file && builds.some((b) => b.file === LV.file) ? LV.file : null;
    const pick = async (f) => { LV.file = f || null; await call('pob:setLevelling', LV.file).catch(() => {}); render(); };
    const codeIn = h('input', { type: 'text', placeholder: 'Paste a Path of Building code or a pobb.in / poe.ninja / Maxroll link', style: { flex: 1, minWidth: '260px' }, 'aria-label': 'Levelling build code or link' });
    const importBtn = h('button', { class: 'primary sm', onclick: async () => {
      importBtn.disabled = true;
      try {
        const r = await call('pob:importCode', { text: codeIn.value, name: 'Levelling' });
        PB.builds = null; await loadBuilds(true);
        toast(`Imported${r.site ? ` from ${r.site}` : ''}: ${r.info?.skill || 'build'}`);
        await pick(r.file);
      } catch (e) { toast(errText(e), true); } finally { importBtn.disabled = false; }
    } }, 'Import');
    const top = h('div', { class: 'panel stack', style: { gap: '10px' } },
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, h('span', { class: 'muted small' }, 'Levelling guide'),
        (() => {
          // your levelling guides first (imported here), then every other build
          const isGuide = (b) => /(^|\/ )Levelling /.test(b.name);
          const opt = (b) => h('option', { value: b.file, selected: b.file === file }, b.name.replace(/^PoE Helper snapshots \/ /, '').replace(/^Levelling /, ''));
          const guides = builds.filter(isGuide);
          const rest = builds.filter((b) => !isGuide(b));
          return h('select', { 'aria-label': 'Levelling build', style: { flex: 1, minWidth: '220px' }, onchange: (e) => pick(e.target.value) },
            h('option', { value: '', selected: !file }, guides.length ? 'Pick a levelling guide…' : 'Import a levelling build below, or pick a build…'),
            guides.length ? h('optgroup', { label: 'Levelling guides' }, guides.map(opt)) : null,
            rest.length ? h('optgroup', { label: 'Other builds' }, rest.map(opt)) : null);
        })(),
        file ? h('button', { class: 'quiet sm', onclick: () => pick(null) }, 'Clear') : null),
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, codeIn, importBtn),
      h('p', { class: 'small faint' }, 'A levelling guide from Path of Building: pick its trees and see the gems that go with each. It is only for looking: upgrades, the item tester and the price check keep using the build at the top of the Build tab.'));
    out.append(top);
    if (!file) { out.append(h('p', { class: 'small muted' }, 'Import a levelling build (paste its code or link), or pick one from the list.')); return [out]; }

    const statsKey = `stats|${file}`;
    const treeKey = `tree|${file}`;
    const body = h('div', { class: 'stack' }, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), ' Loading the build…'));
    out.append(body);
    const switchSet = async (kind, value) => {
      try {
        const st = await call('pob:buildSet', { file, kind, value, link: kind === 'tree' });
        delete PB.results[treeKey];
        PB.results[statsKey] = st;
        draw();
      } catch (e) { toast(errText(e), true); }
    };
    const setPick = (label, kind, list, cur) => (list && list.length > 1 ? h('label', { class: 'row small', style: { gap: '6px' } }, h('span', { class: 'muted' }, label),
      h('select', { 'aria-label': label, onchange: (e) => switchSet(kind, Number(e.target.value)) },
        list.map((x, i) => { const t = kind === 'tree' ? x : x.title; const divider = /^[-=_~*.\s]{3,}$/.test(t); return h('option', { value: kind === 'tree' ? i + 1 : x.id, selected: kind === 'tree' ? i + 1 === cur : x.id === cur, disabled: divider }, divider ? '──────────' : t); }))) : null);
    // copy a vendor search for the gems shown (more than one string when they don't fit in 250 characters:
    // each press copies the next one)
    const copyRegex = async (btn, st) => {
      try {
        const names = (st.gems || []).flatMap((g) => g.gems.map((x) => x.name));
        const key = `${file}|${st.sets?.skillsActive || ''}`;
        if (LV.rx?.key !== key) LV.rx = { key, r: await call('pob:gemRegex', names), i: 0 };
        const { r } = LV.rx;
        if (!r.strings.length) return toast('None of these gems can be searched for.', true);
        const k = LV.rx.i % r.strings.length;
        await call('clipboard:write', r.strings[k].text);
        LV.rx.i = k + 1;
        btn.textContent = r.strings.length > 1 ? `Copy gem search (${(k + 1) % r.strings.length + 1} of ${r.strings.length})` : 'Copy gem search';
        toast(r.strings.length > 1 ? `Search ${k + 1} of ${r.strings.length} copied (${r.strings[k].count} gems): press again for the next` : `Gem search copied (${r.count} gems): paste it in a vendor's search box`);
      } catch (e) { toast(errText(e), true); }
    };
    const gemsPanel = (st) => h('div', { class: 'panel pob-stat' }, h('div', { class: 'row', style: { gap: '8px' } }, h('h3', { style: { margin: 0 } }, 'Gems'), h('span', { class: 'spacer' }),
      h('button', { class: 'sm', title: 'Copies a search for every gem in this gem setup: paste it in a vendor\'s search box (Ctrl+F) to highlight them', onclick: (e) => copyRegex(e.currentTarget, st) }, 'Copy gem search')),
      (st.gems || []).length ? st.gems.map((g) => h('div', { class: 'pob-gems' + (g.enabled ? '' : ' off') },
        h('div', { class: 'small muted' }, g.slot || 'No slot', g.label ? ` · ${g.label}` : '', g.enabled ? '' : ' · off'),
        h('div', {}, g.gems.map((x, k) => h('span', { class: (x.support ? 'sup' : 'act') + (x.enabled ? '' : ' off') }, k ? ' · ' : '', `${x.name} ${x.level}${x.quality ? `/${x.quality}` : ''}`)))))
        : h('p', { class: 'small muted' }, 'No gems in this skill set.'));
    async function draw() {
      try {
        const st = PB.results[statsKey] || (PB.results[statsKey] = await call('pob:stats', file));
        const tr = PB.results[treeKey] || (PB.results[treeKey] = await call('pob:tree', file));
        const S2 = st.sets || {};
        const pickers = h('div', { class: 'panel row small', style: { gap: '14px', flexWrap: 'wrap' } },
          h('b', {}, `${st.ascendancy || st.class || ''}`), h('span', { class: 'muted' }, st.skill ? `${st.skill}` : ''), h('span', { class: 'spacer' }),
          setPick('Tree', 'tree', S2.trees, S2.tree), setPick('Gems', 'skills', S2.skills, S2.skillsActive), setPick('Items', 'items', S2.items, S2.itemsActive),
          !(S2.trees?.length > 1) && !(S2.skills?.length > 1) ? h('span', { class: 'faint' }, 'This build has one tree and one gem setup.') : null);
        const treeOut = h('div', { class: 'stack' });
        const redraw = (r) => mount(treeOut, treeView(r, redraw, { file, readOnly: true }));
        redraw(tr);
        // every gem of the build (all its gem setups) as a saved search on the Regex page's gem list
        const nameIn = h('input', { placeholder: 'Name, e.g. Slam leveling', style: { flex: 1, minWidth: '140px' }, 'aria-label': 'Name for the gem search' });
        const saveGems = h('button', { class: 'sm', onclick: async () => {
          const name = nameIn.value.trim();
          if (!name) { nameIn.focus(); return toast('Type a name for the gem search first.', true); }
          try {
            const sets = (st.sets?.skills || []).filter((x) => !/^[-=_~*.\s]{3,}$/.test(x.title));
            const only = whichIn.value === 'all' ? null : sets.filter((x) => whichIn.value === 'cur' ? x.id === st.sets?.skillsActive : sets.indexOf(x) <= sets.findIndex((y) => y.id === st.sets?.skillsActive)).map((x) => x.title);
            const g = await call('pob:buildGems', { file, only });
            if (!g.gems.length) return toast('No gems the gem regex knows in this build.', true);
            S.settings.regexPresets = await call('regex:savePreset', { name, kind: 'gems-0', choices: { picks: g.gems, cls: '', act: 0 } });
            toast(`Saved "${name}" with ${g.gems.length} gems: Regex page → Gems${g.unknown.length ? ` (${g.unknown.length} not in the gem list: ${g.unknown.slice(0, 3).join(', ')})` : ''}`);
          } catch (e) { toast(errText(e), true); }
        } }, 'Save gems as a gem search');
        const whichIn = h('select', { 'aria-label': 'Which gem setups', class: 'sm' },
          h('option', { value: 'all' }, 'All gem setups'), h('option', { value: 'upto' }, 'Gem setups up to the one shown'), h('option', { value: 'cur' }, 'Only the gem setup shown'));
        const regexBox = h('div', { class: 'panel stack', style: { gap: '8px' } }, h('div', { class: 'small muted' }, 'Gem search for vendors: the gems of this build, saved on the Regex page.'), whichIn, h('div', { class: 'row', style: { gap: '8px' } }, nameIn, saveGems));
        mount(body, pickers, h('div', { class: 'pob-buildcols' }, h('div', { style: { minWidth: 0 } }, treeOut), h('div', { class: 'pob-side stack', style: { gap: '12px' } }, gemsPanel(st), regexBox)));
      } catch (e) { mount(body, h('p', { class: 'small warn' }, errText(e))); }
    }
    draw();
    return [out];
  }

  // ---------------------------------------------------------------- timeless jewels
  const TL_RANK = { d: ['DPS', { wDps: 1 }], l: ['Life', { wDps: 0, wLife: 1 }], e: ['Effective HP', { wDps: 0, wEhp: 1 }], dl: ['DPS and life', { wDps: 1, wLife: 1 }] };
  function timelessPanel(r, file) {
    if (!PB.tlOpen) return null;
    const T = PB.tl?.file === file ? PB.tl : (PB.tl = { file, sockets: null, socket: null, type: 1, conqueror: '', rank: 'd', state: 'idle', res: null });
    const box = h('div', { class: 'panel stack pob-opt' });
    const redraw = () => { const t = PB.results[`tree|${file}`]; if (PB.treeRedraw?.file === file && t && PB.tab === 'tree') PB.treeRedraw.draw(t); };
    const ask = (op, o = {}) => call('pob:timeless', { file, op, ...o });
    if (!T.sockets) {
      mount(box, h('span', { class: 'small muted' }, h('span', { class: 'spin' }), ' Looking at your jewel sockets…'));
      ask('timelessSockets').then((x) => { T.sockets = x.sockets || []; T.types = x.types || []; T.socket = T.socket || T.sockets[0]?.id || null; redraw(); }).catch((e) => mount(box, h('span', { class: 'small warn' }, errText(e))));
      return box;
    }
    if (!T.sockets.length) { mount(box, h('b', {}, 'Timeless jewel'), h('p', { class: 'small muted' }, 'You have no allocated jewel socket on the tree. Allocate one (click it), then search.')); return box; }
    const type = T.types.find((t) => t.id === T.type) || T.types[0];
    const busy = T.state === 'running';
    const refreshResults = async () => { T.res = await ask('timelessResults', { top: 30, ...TL_RANK[T.rank][1] }); };
    const run = async () => {
      T.state = 'running'; T.res = null; T.shown = null; T.got = 0; T.total = 1; T.error = null; T.stop = false;
      redraw();
      try {
        const st = await ask('timelessStart', { socket: T.socket, type: T.type, conqueror: T.conqueror || null });
        if (st.error) throw new Error(st.error);
        T.total = st.total;
        let last = 0;
        while (!T.stop) {
          const x = await ask('timelessStep', { seconds: 1.5 });
          if (x.error) throw new Error(x.error);
          T.got = x.got; T.total = x.total; T.evals = x.evals;
          if (x.done || Date.now() - last > 4000) { await refreshResults(); last = Date.now(); }
          if (x.done) break;
          if (PB.tl === T) redraw();
        }
        await refreshResults();
        T.state = 'done';
      } catch (e) { T.error = errText(e); T.state = 'idle'; }
      redraw();
    };
    const show = async (row) => {
      try { const x = await ask('timelessShow', { seed: row.seed }); T.shown = { seed: row.seed, nodes: x.nodes || [], ids: (x.nodes || []).map((n) => n.id) }; } catch (e) { toast(errText(e)); }
      // look at the socket and its radius
      const sk = T.sockets.find((y) => y.id === T.socket);
      if (sk) { const rr = (sk.radius || 1500) * 1.25; (PB.treeViews || (PB.treeViews = {}))[file] = { x: sk.x - rr * 1.6, y: sk.y - rr, w: rr * 3.2, h: rr * 2 }; }
      redraw();
    };
    const finish = async (keep, seed) => {
      try {
        await ask('timelessEnd', { keep, seed });
        for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`) && !k.startsWith('config|')) delete PB.results[k];
        PB.results.test = null; PB.results.find = null;
        PB.tl = null; if (!keep) PB.tlOpen = false;
        toast(keep ? `${type.name} (seed ${seed}) is in the socket of this snapshot` : 'Closed');
        render();
      } catch (e) { toast(errText(e)); }
    };
    const trade = () => {
      const res = T.res;
      const ids = res.anyConqueror ? res.tradeIds : [res.tradeIds[(res.conquerorIndex || 1) - 1]];
      call('pob:timelessTrade', { ids, seeds: res.top.slice(0, res.anyConqueror ? 10 : 25).map((x) => x.seed) }).catch((e) => toast(errText(e)));
    };
    const sel = (label, value, opts, onchange, dis) => h('label', { class: 'small row', style: { gap: '6px' } }, label,
      h('select', { 'aria-label': label, disabled: !!dis, onchange: (e) => onchange(e.target.value) }, opts.map(([v, t]) => h('option', { value: v, selected: String(v) === String(value) }, t))));
    const sockLabel = (x) => `${x.notables.slice(0, 3).join(', ') || 'socket'}${x.notables.length > 3 ? '…' : ''} (${x.allocatedInRadius} of your passives in radius)${x.jewel ? ` · has ${x.jewel}` : ''}`;
    const pct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    const cls = (v) => (v > 0.05 ? 'good' : v < -0.05 ? 'warn' : 'faint');
    mount(box,
      h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
        h('b', {}, 'Timeless jewel'),
        sel('Socket', T.socket, T.sockets.map((x) => [x.id, sockLabel(x)]), (v) => { T.socket = Number(v); T.res = null; T.shown = null; redraw(); }, busy),
        sel('Jewel', T.type, T.types.map((t) => [t.id, t.name]), (v) => { T.type = Number(v); T.conqueror = ''; T.res = null; redraw(); }, busy),
        sel('Conqueror', T.conqueror, [['', 'Any (its keystone isn\'t counted)'], ...type.conquerors.map((c) => [c, c])], (v) => { T.conqueror = v; }, busy),
        sel('Best for', T.rank, Object.entries(TL_RANK).map(([k, [l]]) => [k, l]), async (v) => { T.rank = v; if (T.res) { await refreshResults(); redraw(); } }),
        h('span', { class: 'spacer' }),
        busy ? h('button', { class: 'sm', onclick: () => { T.stop = true; } }, 'Stop') : h('button', { class: 'primary sm', onclick: run }, T.res ? 'Search again' : 'Search every seed'),
        !busy ? h('button', { class: 'sm', onclick: () => finish(false) }, 'Close') : null),
      busy ? h('div', { class: 'small muted' }, h('span', { class: 'spin' }), ` ${T.got.toLocaleString()} of ${T.total.toLocaleString()} seeds (${type.min.toLocaleString()}–${type.max.toLocaleString()})${T.type === 1 ? ' · Glorious Vanity changes every small passive too, so it takes a few minutes' : ''}`,
        h('div', { class: 'tl-bar' }, h('span', { style: { width: `${Math.round((T.got / Math.max(1, T.total)) * 100)}%` } }))) : null,
      T.error ? h('div', { class: 'small warn' }, T.error) : null,
      !T.res && !busy ? h('div', { class: 'small faint' }, `Path of Building puts the jewel in the socket with every seed, conquers the passives in its radius like the real jewel, and works out what each one does to your build (your ${T.sockets.find((x) => x.id === T.socket)?.allocatedInRadius || 0} passives in radius count; seeds that change them the same way are worked out once). The current jewel in that socket, if any, is taken out for the comparison.`) : null,
      T.res && T.res.top.length ? [
        h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } },
          h('span', { class: 'small muted' }, `Best ${T.res.top.length} of ${T.res.count.toLocaleString()} seeds for ${TL_RANK[T.rank][0].toLowerCase()}${T.evals ? ` (${T.evals.toLocaleString()} different results)` : ''}. ${T.res.full ? 'Full DPS.' : ''}`),
          h('span', { class: 'spacer' }),
          h('button', { class: 'sm', title: 'The trade site with these seeds, cheapest first', onclick: trade }, `Search the trade site (best ${T.res.anyConqueror ? 10 : 25})`)),
        h('div', { class: 'tl-table' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Seed'), h('th', { class: 'r' }, 'DPS'), h('th', { class: 'r' }, 'Life'), h('th', { class: 'r' }, 'Effective HP'), h('th', {}, ''))),
          h('tbody', {}, T.res.top.map((x) => h('tr', { class: T.shown?.seed === x.seed ? 'on' : '' },
            h('td', {}, String(x.seed)), h('td', { class: `r ${cls(x.dps)}` }, pct(x.dps)), h('td', { class: `r ${cls(x.life)}` }, pct(x.life)), h('td', { class: `r ${cls(x.ehp)}` }, pct(x.ehp)),
            h('td', {}, h('button', { class: 'sm ghost', onclick: () => show(x) }, 'Show'),
              r.editable && !busy ? h('button', { class: 'sm ghost', title: 'Puts this jewel in the socket of the snapshot', onclick: () => finish(true, x.seed) }, 'Use it') : null))))))] : null,
      T.shown ? h('div', { class: 'stack', style: { gap: '4px' } }, h('div', { class: 'small muted' }, `Seed ${T.shown.seed}: your notables in radius become (gold on the tree):`),
        h('div', { class: 'pob-grid' }, T.shown.nodes.map((n) => h('div', { class: 'small tl-node' }, h('b', {}, n.name), (n.sd || []).filter((l) => l.trim()).map((l) => h('div', {}, l)))))) : null);
    return box;
  }

  // ---------------------------------------------------------------- the tree optimiser
  const GOALS = { d: 'DPS', l: 'Life', e: 'Effective HP' };
  const optValueOf = (st, goal) => (goal === 'l' ? st?.Life : goal === 'e' ? st?.TotalEHP : (st?.FullDPS > 0 ? st.FullDPS : st?.CombinedDPS || st?.TotalDPS)) || 0;
  function optimiserPanel(r, file) {
    const O = PB.opt?.file === file ? PB.opt : null;
    if (!PB.optOpen && !O) return null;
    const S2 = PB.optSet || (PB.optSet = { goal: 'd', lifePct: 100, ehpPct: 95, dpsPct: 90, keepRes: true, keepChaos: false, useFree: false, maxIter: 40 });
    const redraw = () => { const t = PB.results[`tree|${file}`]; if (PB.treeRedraw?.file === file && t && PB.tab === 'tree') PB.treeRedraw.draw(t); };
    const num2 = (k, label, min, max) => h('label', { class: 'small row', style: { gap: '6px' } }, label,
      h('input', { type: 'number', min, max, value: S2[k], style: { width: '70px' }, disabled: !!O, onchange: (e) => { S2[k] = Number(e.target.value); } }), k.endsWith('Pct') ? '%' : '');
    const chk = (k, label) => h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: !!S2[k], disabled: !!O, onchange: (e) => { S2[k] = e.target.checked; } }), label);
    const start = async () => {
      const r0 = PB.results[`tree|${file}`] || r;
      PB.opt = { file, goal: S2.goal, running: true, steps: [], startIds: new Set(r0.nodes.filter((n) => n.a).map((n) => n.i)), startStats: r0.summary?.stats, startUsed: r0.used };
      const O2 = PB.opt;
      redraw();
      try {
        await call('pob:optStart', { file, ...S2 });
        while (!O2.stop) {
          const st = await call('pob:optStep', { file });
          if (st.error) { O2.error = st.error; break; }
          if (st.swap) O2.steps.push(st.swap);
          O2.value = st.value; O2.iter = st.iter;
          if (st.startValue != null) O2.baseValue = st.startValue;
          if (st.startStats) O2.startStats = st.startStats;
          O2.stats = st.tree?.summary?.stats;
          if (st.tree) PB.results[`tree|${file}`] = st.tree;
          if (st.done) break;
          redraw();
        }
      } catch (e) { O2.error = errText(e); }
      O2.running = false; O2.finished = true;
      // everything else worked out for this build is out of date while the new tree is shown
      for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`) && !k.startsWith('config|') && !k.startsWith('tree|')) delete PB.results[k];
      redraw();
    };
    const end = async (keep) => {
      try {
        await call('pob:optEnd', { file, keep });
        for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`) && !k.startsWith('config|')) delete PB.results[k];
        PB.results.test = null; PB.results.find = null;
        PB.opt = null; PB.optOpen = false; PB.treeDiff = null;
        toast(keep ? 'The new tree is saved in this snapshot' : 'Back to your tree');
        render();
      } catch (e) { toast(errText(e)); }
    };
    if (!O) {
      return h('div', { class: 'panel stack pob-opt' },
        h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
          h('b', {}, 'Optimise the tree'),
          h('label', { class: 'small row', style: { gap: '6px' } }, 'For', h('select', { 'aria-label': 'Optimise for', onchange: (e) => { S2.goal = e.target.value; const t = PB.results[`tree|${file}`]; if (t && PB.treeRedraw?.file === file) PB.treeRedraw.draw(t); } }, Object.entries(GOALS).map(([k, v]) => h('option', { value: k, selected: S2.goal === k }, v)))),
          S2.goal !== 'd' ? num2('dpsPct', 'Keep DPS at least', 0, 200) : null,
          S2.goal !== 'l' ? num2('lifePct', 'Keep life at least', 0, 200) : null,
          S2.goal !== 'e' ? num2('ehpPct', 'Effective HP at least', 0, 200) : null,
          chk('keepRes', 'Keep fire, cold, lightning res'), chk('keepChaos', 'Keep chaos res'), chk('useFree', 'Use unspent points'),
          num2('maxIter', 'At most', 1, 80), h('span', { class: 'small muted' }, 'swaps'),
          h('span', { class: 'spacer' }), h('button', { class: 'primary sm', onclick: start }, 'Find a better tree')),
        h('div', { class: 'small faint' }, 'With the same number of points, it gives up the nodes worth least and takes paths worth more, one swap at a time, as long as your limits hold (and your gear\'s attribute requirements stay met). Path of Building checks every swap. Nothing is saved until you keep the result. Masteries and the ascendancy are left as they are.'));
    }
    const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : 0);
    const base = O.baseValue ?? optValueOf(O.startStats, O.goal);
    const nowV = O.value ?? base;
    const changes = statDiff(O.startStats, O.stats || O.startStats);
    return h('div', { class: 'panel stack pob-opt' },
      h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
        h('b', {}, `Optimising for ${GOALS[O.goal]}`),
        O.running ? h('span', { class: 'small muted' }, h('span', { class: 'spin' }), ` swap ${O.steps.length + 1}… (Path of Building tries a few hundred paths each time)`) : h('span', { class: 'small muted' }, O.error ? '' : O.steps.length ? `Done: ${O.steps.length} ${O.steps.length === 1 ? 'swap' : 'swaps'}.` : 'No better tree found within your limits.'),
        h('span', {}, `${GOALS[O.goal]} ${fmtStat(base)} → ${fmtStat(nowV)}`, h('span', { class: nowV >= base ? 'good' : 'warn' }, ` (${nowV >= base ? '+' : ''}${pct(nowV, base).toFixed(1)}%)`)),
        h('span', { class: 'spacer' }),
        O.running ? h('button', { class: 'sm', onclick: () => { O.stop = true; } }, 'Stop') : [
          O.steps.length ? h('button', { class: 'primary sm', onclick: () => end(true) }, 'Keep this tree') : null,
          h('button', { class: 'sm', onclick: () => end(false) }, O.steps.length ? 'Go back to my tree' : 'Close')]),
      O.error ? h('div', { class: 'small warn' }, O.error) : null,
      changes.length && O.stats ? h('div', { class: 'pob-cfg-diff inline' }, changes.map((c) => h('span', { class: 'chg ' + (c.diff > 0 ? 'up' : 'down') }, `${c.label} ${fmtStat(c.before, c.unit)} → ${fmtStat(c.after, c.unit)}`))) : null,
      O.steps.length ? h('ol', { class: 'pob-opt-steps small' }, O.steps.map((sw) => h('li', {
        // point at a swap: its nodes light up on the tree
        onmouseenter: () => {
          const mark = (ids, cls) => (ids || []).forEach((id) => document.querySelectorAll(`.pob-tree-svg .tn[data-i="${id}"]`).forEach((el) => {
            el.classList.add(cls);
            const svgEl = el.ownerSVGElement; const g = svgEl?.querySelector('.thalo');
            if (!g || !svgEl.haloEls) return;
            g.append(...svgEl.haloEls(Number(el.getAttribute('cx')), Number(el.getAttribute('cy')), Number(el.getAttribute('r')) + 10, cls === 'swap-add' ? 'new' : 'gone', ' swap-halo'));
          }));
          mark(sw.addedIds, 'swap-add'); mark(sw.removedIds, 'swap-rem');
          document.querySelectorAll('.pob-tree-svg').forEach((el) => el.classList.add('focus'));
        },
        onmouseleave: () => {
          document.querySelectorAll('.pob-tree-svg .swap-add, .pob-tree-svg .swap-rem').forEach((el) => el.classList.remove('swap-add', 'swap-rem'));
          document.querySelectorAll('.pob-tree-svg .swap-halo').forEach((el) => el.remove());
          document.querySelectorAll('.pob-tree-svg.focus').forEach((el) => el.classList.remove('focus'));
        },
        // click: look at them on the tree
        onclick: () => {
          const t = PB.results[`tree|${file}`];
          const ids = new Set([...(sw.addedIds || []), ...(sw.removedIds || [])]);
          const ns = (t?.nodes || []).filter((n) => ids.has(n.i));
          if (!ns.length) return;
          const xs = ns.map((n) => n.x); const ys = ns.map((n) => n.y);
          const pad = 900;
          (PB.treeViews || (PB.treeViews = {}))[file] = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
          redraw();
        },
        title: 'Point at it to see it on the tree; click to go there',
      },
        h('span', { class: 'gone' }, `− ${sw.removed.join(', ') || 'nothing'}`), '  ', h('span', { class: 'new' }, `+ ${sw.added.join(', ')}`),
        h('span', { class: 'faint' }, `  ${GOALS[O.goal]} ${fmtStat(optValueOf(sw.before, O.goal))} → ${fmtStat(optValueOf(sw.after, O.goal))}`)))) : null,
      h('div', { class: 'small faint' }, 'On the tree: nodes to take have a blue ring and a + badge, nodes to give up an orange ring, a cross and a − badge. Point at a swap to see only its nodes.'));
  }

  // ---------------------------------------------------------------- Calcs (PoB's tab): hover a number for its breakdown
  // PoB's colour codes (^0-^9, ^xRRGGBB) as coloured text
  const POB_COLOURS = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#b3b3b3', '#666666'];
  const CB_SAFE = { '#33ff77': '#6cb4ff', '#dd0022': '#ff8a3d', '#00ff00': '#6cb4ff', '#ff0000': '#ff8a3d' };
  function pobText(str) {
    const out = [];
    let colour = null;
    const re = /\^x([0-9a-fA-F]{6})|\^(\d)/g;
    let last = 0;
    let m;
    const push = (t) => { if (t) out.push(colour && colour !== '#ffffff' ? h('span', { style: { color: colour } }, t) : t); };
    const text = String(str ?? '');
    while ((m = re.exec(text))) {
      push(text.slice(last, m.index));
      colour = m[1] ? `#${m[1]}` : POB_COLOURS[Number(m[2])];
      // PoB's gain green and loss red: the app's colour-blind safe blue and orange instead
      colour = CB_SAFE[String(colour).toLowerCase()] || colour;
      last = re.lastIndex;
    }
    push(text.slice(last));
    return out;
  }
  const plainPob = (str) => String(str ?? '').replace(/\^x[0-9a-fA-F]{6}|\^\d/g, '');
  const pobColour = (c) => (/^\^x[0-9a-f]{6}$/i.test(c || '') ? `#${c.slice(2)}` : /^\^\d$/.test(c || '') ? POB_COLOURS[Number(c[1])] : null);

  function calcsTab() {
    const out = h('div', { class: 'stack' });
    withResult('calcs', out, () => call('pob:calcs', PB.file), (r) => mount(out, calcsView(r)));
    return [buildRow(), out];
  }
  let calcTip = null;
  let calcPinned = null;
  const hideCalcTip = (force) => {
    if (calcPinned && !force) return;
    calcTip?.remove(); calcTip = null;
    if (force) { calcPinned?.classList.remove('pinned'); calcPinned = null; }
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCalcTip(true); });
  document.addEventListener('mousedown', (e) => { if (calcPinned && !e.target.closest('.pob-calc-tip') && !e.target.closest('.pob-calc-cell')) hideCalcTip(true); });

  function calcsView(r) {
    const file = PB.file;
    const F = PB.calcView || (PB.calcView = { q: '', closed: {} });
    const bdKey = `bd|${file}`;
    const cache = PB.results[bdKey] || (PB.results[bdKey] = {});
    let hoverRef = null;
    const showTip = async (cellEl, cell, label) => {
      if (calcPinned && calcPinned !== cellEl) return;
      hoverRef = cell.ref;
      if (!cache[cell.ref]) {
        try { cache[cell.ref] = await call('pob:breakdown', { file, ref: cell.ref }); } catch (e) { cache[cell.ref] = { error: errText(e) }; }
      }
      if (hoverRef !== cell.ref || (calcPinned && calcPinned !== cellEl)) return;
      calcTip?.remove();
      calcTip = breakdownTip(cache[cell.ref], label, cell.text);
      if (!calcTip) return;
      document.body.append(calcTip);
      const rc = cellEl.getBoundingClientRect();
      const w = calcTip.offsetWidth;
      const hgt = calcTip.offsetHeight;
      let x = rc.right + 6;
      if (x + w > window.innerWidth - 8) x = Math.max(8, rc.left - w - 6);
      const y = Math.max(8, Math.min(rc.top, window.innerHeight - hgt - 8));
      calcTip.style.left = `${x}px`;
      calcTip.style.top = `${y}px`;
    };
    const q = () => F.q.trim().toLowerCase();
    const match = (t) => q() && plainPob(t).toLowerCase().includes(q());
    const section = (sec) => {
      const wide = sec.width > (r.colWidth || 230) + 20;
      const colour = pobColour(sec.colour) || '#888';
      return h('div', { class: 'pob-calc-sec' + (wide ? ' wide' : ''), style: { borderColor: colour, '--sec': colour } },
        sec.subs.map((sub, si) => {
          const id = `${sec.id}:${si}`;
          const closed = F.closed[id] ?? !!sub.collapsed;
          if (si > 0 && !sub.rows.length) return null;
          return h('div', { class: 'pob-calc-sub' },
            h('button', { class: 'pob-calc-head', 'aria-expanded': closed ? 'false' : 'true', onclick: () => { F.closed[id] = !closed; mount(out(), calcsBody()); } },
              h('span', { class: 'lbl' + (match(sub.label) ? ' hit' : '') }, `${sub.label}:`), sub.extra ? h('span', { class: 'extra' }, pobText(sub.extra)) : null, h('span', { class: 'tog' }, closed ? '+' : '−')),
            closed ? null : sub.rows.map((row, _i, all) => h('div', { class: 'pob-calc-row', style: { gridTemplateColumns: `130px repeat(${Math.max(1, ...all.map((x) => x.cells.length))}, minmax(0, 1fr))`, background: pobColour(row.bg) ? `${pobColour(row.bg)}` : null } },
              h('span', { class: 'rl' + (match(row.label) ? ' hit' : ''), title: row.label ? plainPob(row.label) : null, style: { color: pobColour(row.color) } }, row.label ? pobText(`${row.label}:`) : ''),
              row.cells.map((c) => c.ref
                ? h('span', { class: 'pob-calc-cell' + (c.breakdown ? ' has' : ''), tabindex: c.breakdown ? 0 : null,
                  onmouseenter: c.breakdown ? (e) => showTip(e.currentTarget, c, row.label) : null,
                  onmouseleave: c.breakdown ? () => { hoverRef = null; hideCalcTip(); } : null,
                  onfocus: c.breakdown ? (e) => showTip(e.currentTarget, c, row.label) : null, onblur: c.breakdown ? () => hideCalcTip() : null,
                  onclick: c.breakdown ? (e) => { const el = e.currentTarget; if (calcPinned === el) return hideCalcTip(true); hideCalcTip(true); calcPinned = null; showTip(el, c, row.label).then(() => { calcPinned = el; el.classList.add('pinned'); }); } : null },
                pobText(c.text))
                : h('span', { class: 'pob-calc-cell empty' })))));
        }));
    };
    // PoB's own arrangement: offence in three columns (wide sections across them), then the defences
    const calcsBody = () => {
      const on = r.sections.filter((s) => s.on);
      const offence = on.filter((s) => s.group === 1);
      const defence = on.filter((s) => s.group !== 1);
      const est = (s) => s.subs.reduce((n, sub, i) => n + 1 + ((F.closed[`${s.id}:${i}`] ?? sub.collapsed) ? 0 : sub.rows.length), 0);
      const bands = [];
      let cols = null;
      for (const s of offence) {
        if (s.width > (r.colWidth || 230) + 20) { bands.push(h('div', { class: 'pob-calc-band wide' }, section(s))); cols = null; continue; }
        if (!cols) { cols = [[], [], []].map(() => ({ el: h('div', { class: 'pob-calc-col' }), n: 0 })); bands.push(h('div', { class: 'pob-calc-band' }, cols.map((c) => c.el))); }
        const c = cols.reduce((a, b) => (b.n < a.n ? b : a));
        c.el.append(section(s)); c.n += est(s);
      }
      const g2 = h('div', { class: 'pob-calc-col' }, defence.filter((s) => s.group === 2).map(section));
      const g3 = h('div', { class: 'pob-calc-col' }, defence.filter((s) => s.group === 3).map(section));
      return h('div', { class: 'pob-calc-grid' }, h('div', { class: 'pob-calc-off' }, bands), g2, g3);
    };
    const holder = h('div', {});
    const out = () => holder;
    mount(holder, calcsBody());
    return [
      h('div', { class: 'panel row', style: { gap: '12px', flexWrap: 'wrap' } },
        h('span', { class: 'small muted' }, `Path of Building's Calcs tab for ${r.skill || 'the main skill'} (effective DPS: buffs, charges and the enemy from the Configuration tab). Hover a number to see how it's worked out; click to keep it open.`),
        h('span', { class: 'spacer' }),
        h('input', { type: 'search', placeholder: 'Search', value: F.q, style: { width: '180px' }, oninput: (e) => { F.q = e.target.value; mount(holder, calcsBody()); } })),
      holder,
    ];
  }

  function breakdownTip(b, label, value) {
    if (!b) return null;
    if (b.error) return h('div', { class: 'pob-calc-tip', role: 'tooltip' }, h('div', { class: 'small warn' }, b.error));
    if (!b.sections?.length) return null;
    return h('div', { class: 'pob-calc-tip', role: 'tooltip' },
      label ? h('div', { class: 'ttl' }, pobText(label), value ? h('span', { class: 'val' }, pobText(value)) : null) : null,
      b.sections.map((sec) => {
        if (sec.type === 'TEXT') return h('div', { class: 'txt' }, sec.lines.map((l) => h('div', {}, pobText(l))));
        if (sec.type === 'RADIUS') return h('div', { class: 'txt' }, `Radius: ${sec.radius}`);
        if (sec.type !== 'TABLE') return null;
        return h('div', { class: 'tbl' },
          sec.label ? h('div', { class: 'tlabel' }, pobText(`${sec.label}:`)) : null,
          h('table', {}, h('thead', {}, h('tr', {}, sec.cols.map((c) => h('th', { class: c.right ? 'r' : '' }, c.label)))),
            h('tbody', {}, sec.rows.map((row) => h('tr', {}, sec.cols.map((c) => h('td', { class: c.right ? 'r' : '' }, pobText(row[c.key] ?? ''))))))),
          sec.footer ? h('div', { class: 'foot' }, String(sec.footer).split('\n').map((l) => h('div', {}, pobText(l)))) : null);
      }));
  }

  // ---------------------------------------------------------------- Configuration (PoB's tab)
  function configTab() {
    const out = h('div', { class: 'stack' });
    const key = `config|${PB.file}`;
    const draw = (r) => mount(out, configView(r));
    if (!PB.file) mount(out, h('p', { class: 'small muted' }, 'Pick a build first, or save a snapshot.'));
    else if (PB.results[key]) draw(PB.results[key]);
    else {
      mount(out, h('p', { class: 'small muted' }, h('span', { class: 'spin' }), ' Path of Building is opening the build…'));
      call('pob:config', PB.file).then((r) => { PB.results[key] = r; if (PB.tab === 'config') draw(r); }).catch((e) => mount(out, h('p', { class: 'small warn' }, errText(e))));
    }
    return [buildRow(), out];
  }
  function configView(r) {
    const file = PB.file;
    const F = PB.cfgView || (PB.cfgView = { all: false, q: '' });
    const sumBox = h('div', { class: 'small muted' }, PB.cfgSummary?.file === file ? summaryLine(PB.cfgSummary.r) : r.summary ? summaryLine(r.summary) : '');
    // what the last change did, kept in view at the bottom of the window (no scrolling up to see it)
    const diffBar = h('div', { class: 'pob-cfg-diff' });
    const showDiff = () => {
      const d = PB.cfgDiff?.file === file ? PB.cfgDiff : null;
      if (!d) return mount(diffBar, h('span', { class: 'small faint' }, r.editable ? 'Tick or change an option: what it does to the build shows here.' : ''));
      if (d.busy) return mount(diffBar, h('span', { class: 'what' }, d.what), h('span', { class: 'small muted' }, h('span', { class: 'spin' }), ' recalculating…'));
      if (d.error) return mount(diffBar, h('span', { class: 'what' }, d.what), h('span', { class: 'small warn' }, d.error));
      mount(diffBar, h('span', { class: 'what' }, d.what),
        d.changes.length ? d.changes.map((c) => h('span', { class: 'chg ' + (c.diff > 0 === !c.lowerBetter ? 'up' : 'down') },
          `${c.label} ${fmtStat(c.before, c.unit)} → ${fmtStat(c.after, c.unit)} (${c.diff > 0 ? '+' : ''}${c.pct != null && Math.abs(c.pct) < 10000 ? `${c.pct.toFixed(1)}%` : fmtStat(c.diff, c.unit)})`))
          : h('span', { class: 'small muted' }, 'No change to the main numbers.'));
    };
    showDiff();
    const listBox = h('div', { class: 'pob-cfg-cols' });
    let pending = {};
    let timer = null;
    let names = [];
    const send = async () => {
      const values = pending;
      pending = {};
      const before = PB.cfgSummary?.file === file ? PB.cfgSummary.r : r.summary;
      const what = names.join(', ');
      names = [];
      PB.cfgDiff = { file, what, busy: true };
      showDiff();
      mount(sumBox, h('span', { class: 'spin' }), ' Path of Building is recalculating…');
      try {
        const res = await call('pob:setConfig', { file, values });
        PB.cfgDiff = { file, what, changes: statDiff(before?.stats, res?.stats) };
        showDiff();
        // everything worked out for this build changes with its configuration
        for (const k of Object.keys(PB.results)) if (k.endsWith(`|${file}`) && !k.startsWith('config|')) delete PB.results[k];
        PB.results.test = null; PB.results.find = null;
        PB.cfgSummary = { file, r: res };
        mount(sumBox, summaryLine(res));
      } catch (e) { mount(sumBox, h('span', { class: 'warn' }, errText(e))); PB.cfgDiff = { file, what, error: errText(e) }; showDiff(); }
    };
    const change = (o, v) => {
      const prev = o.value ?? o.default;
      o.value = v;
      o.changed = v !== o.default && !(v == null && (o.default === false || o.default === 0 || o.default === ''));
      pending[o.var] = v;
      const label = o.label.replace(/[?:]\s*$/, '');
      const shownVal = o.type === 'check' ? (v ? 'on' : 'off') : o.type === 'list' ? (o.list || []).find((it) => it.val === v)?.label ?? 'none' : v == null ? 'default' : String(v);
      if (/^Map(Prefix|Suffix)\d$/.test(o.var)) {
        // a map mod ticked or unticked
        const it = (o.list || []).find((x) => x.val === (v === 'NONE' ? prev : v));
        const desc = (it?.label || '').replace(/^[^:]+:\s*/, '');
        names = names.filter((n) => !n.startsWith(`Map: ${desc} `)).concat(`Map: ${desc} ${v === 'NONE' ? 'off' : 'on'}`);
      } else names = names.filter((n) => !n.startsWith(`${label}: `)).concat(`${label}: ${shownVal}`);
      PB.cfgDiff = { file, what: names.join(', '), busy: true };
      showDiff();
      clearTimeout(timer);
      timer = setTimeout(send, 500);
    };
    const control = (o) => {
      const dis = !r.editable;
      if (o.type === 'check') return h('input', { type: 'checkbox', checked: !!o.value, disabled: dis, 'aria-label': o.label, onchange: (e) => change(o, e.target.checked) });
      if (o.type === 'list') return h('select', { disabled: dis, 'aria-label': o.label, onchange: (e) => { const it = o.list[e.target.selectedIndex]; change(o, it ? it.val : null); } },
        (o.list || []).map((it) => h('option', { selected: it.val === (o.value ?? o.default) }, it.label)));
      return h('input', { type: 'number', step: o.type === 'float' ? 'any' : 1, style: { width: '90px' }, disabled: dis, 'aria-label': o.label, placeholder: o.default ? String(o.default) : '', value: o.value != null && o.value !== o.default ? o.value : '',
        onchange: (e) => change(o, e.target.value === '' ? null : Number(e.target.value)) });
    };
    // map mods: PoB's 4 prefix and 4 suffix slots, shown as one tick list each
    const SLOT = /^Map(Prefix|Suffix)\d$/;
    const slots = (kind) => r.options.filter((o) => o.var.startsWith(`Map${kind}`) && SLOT.test(o.var));
    const slotVal = (o) => o.value ?? o.default ?? 'NONE';
    const mapTicks = (kind, q) => {
      const list = slots(kind);
      if (!list.length) return null;
      const picked = new Set(list.map(slotVal).filter((v) => v && v !== 'NONE'));
      const mods = (list[0].list || []).filter((it) => it.val !== 'NONE' && (!q || it.label.toLowerCase().includes(q)));
      if (!mods.length) return null;
      const tick = (it, on) => {
        if (on) {
          const free = list.find((o) => slotVal(o) === 'NONE' || !slotVal(o));
          if (!free) { toast(`A map has at most ${list.length} ${kind === 'Prefix' ? 'prefixes' : 'suffixes'}; untick one first.`); drawList(); return; }
          change(free, it.val);
        } else {
          const o = list.find((x) => slotVal(x) === it.val);
          if (o) change(o, 'NONE');
        }
        drawList();
      };
      return h('div', { class: 'pob-cfg-maps' },
        h('div', { class: 'small muted', style: { margin: '6px 0 2px' } }, `${kind === 'Prefix' ? 'Prefixes' : 'Suffixes'} (${picked.size}/${list.length})`),
        mods.map((it) => {
          const on = picked.has(it.val);
          const m = /^([^:]+):\s*(.*)$/.exec(it.label);
          return h('label', { class: 'pob-cfg-row' + (on ? ' on' : ''), title: m ? m[1] : '' },
            h('span', {}, m ? m[2] : it.label, m ? h('span', { class: 'faint' }, ` · ${m[1]}`) : null),
            h('input', { type: 'checkbox', checked: on, disabled: !r.editable, 'aria-label': it.label, onchange: (e) => tick(it, e.target.checked) }));
        }));
    };
    const MAP_SEC = /^Map Modifiers/;
    const drawList = () => {
      const q = F.q.trim().toLowerCase();
      const shown = r.options.filter((o) => !SLOT.test(o.var) && (F.all || o.shown || o.changed) && (!q || o.label.toLowerCase().includes(q)));
      const ticks = [mapTicks('Prefix', q), mapTicks('Suffix', q)].filter(Boolean);
      const mapSec = r.options.find((o) => SLOT.test(o.var))?.section;
      // the map modifiers go last
      const sections = [...new Set(shown.map((o) => o.section).concat(ticks.length && mapSec ? [mapSec] : []))].sort((a, b) => MAP_SEC.test(a) - MAP_SEC.test(b));
      mount(listBox, sections.length ? sections.map((sec) => h('div', { class: 'panel pob-stat pob-cfg' + (MAP_SEC.test(sec) ? ' maps' : '') }, h('h3', {}, sec),
        shown.filter((o) => o.section === sec).map((o) => h('label', { class: 'pob-cfg-row' + (o.changed ? ' on' : '') + (o.shown ? '' : ' off'), title: o.tooltip || (o.shown ? '' : 'Path of Building doesn\'t use this for this build right now') },
          h('span', {}, o.label), control(o))),
        sec === mapSec ? ticks : null)) : h('p', { class: 'small muted' }, 'Nothing matches.'));
    };
    drawList();
    const changedCount = r.options.filter((o) => o.changed).length;
    return [
      h('div', { class: 'panel stack' },
        r.editable
          ? h('p', { class: 'small muted', style: { margin: 0 } }, 'Path of Building\'s Configuration tab for this snapshot. Changes are saved into the snapshot, and your next snapshot of this character starts with the same ticks (the ones you set in Path of Building itself carry over too).')
          : h('p', { class: 'small muted', style: { margin: 0 } }, 'This is one of your own Path of Building builds: shown as it is. Change it in Path of Building; snapshots can be changed here.'),
        h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } },
          h('input', { type: 'search', placeholder: 'Search the options', value: F.q, style: { flex: 1, minWidth: '200px' }, oninput: (e) => { F.q = e.target.value; drawList(); } }),
          h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: F.all, onchange: (e) => { F.all = e.target.checked; drawList(); } }), 'Show every option (also ones this build doesn\'t use)'),
          h('span', { class: 'small faint' }, `${changedCount} set`),
          r.editable ? h('button', { class: 'sm', title: 'Ticks what the build itself gives: charges you generate, Onslaught and other buffs you gain, Rage at its maximum, a flask, a warcry (snapshots do this by themselves)', onclick: async (e) => {
            const b = e.currentTarget; b.disabled = true;
            try {
              const a = await call('pob:autoConfig', file);
              if (!a.list?.length) { toast('Nothing more to tick from this build'); return; }
              for (const it of a.list) { const o = r.options.find((x) => x.var === it.var); if (o) change(o, it.value); }
              drawList();
              toast(`Ticked: ${a.list.map((it) => r.options.find((x) => x.var === it.var)?.label.replace(/[?:]\s*$/, '') || it.var).join(', ')}`);
            } catch (err) { toast(errText(err)); } finally { b.disabled = false; }
          } }, 'Tick from my build') : null),
        sumBox),
      listBox,
      diffBar,
    ];
  }
  // the main numbers before and after a change (DPS first)
  const DIFF_STATS = [['dps', 'DPS'], ['AverageHit', 'Average hit'], ['Speed', 'Speed', 'rate'], ['CritChance', 'Crit chance', '%'], ['Life', 'Life'], ['EnergyShield', 'Energy shield'], ['Mana', 'Mana'], ['Ward', 'Ward'],
    ['TotalEHP', 'Effective HP'], ['Armour', 'Armour'], ['Evasion', 'Evasion'], ['SpellSuppressionChance', 'Suppression', '%'], ['BlockChance', 'Block', '%'],
    ['FireResist', 'Fire res', '%'], ['ColdResist', 'Cold res', '%'], ['LightningResist', 'Lightning res', '%'], ['ChaosResist', 'Chaos res', '%'], ['MovementSpeedMod', 'Movement speed', 'x'], ['LifeRegenRecovery', 'Life regen']];
  function statDiff(a, b) {
    if (!a || !b) return [];
    const dps = (s) => (s.FullDPS > 0 ? s.FullDPS : s.CombinedDPS || s.TotalDPS || 0);
    const out = [];
    for (const [k, label, unit] of DIFF_STATS) {
      const before = k === 'dps' ? dps(a) : a[k];
      const after = k === 'dps' ? dps(b) : b[k];
      if (typeof before !== 'number' || typeof after !== 'number') continue;
      const diff = after - before;
      if (Math.abs(diff) < (unit === 'x' || unit === 'rate' ? 0.001 : unit === '%' ? 0.05 : 0.5)) continue;
      out.push({ label: k === 'dps' && a.FullDPS > 0 ? 'Full DPS' : label, before, after, diff, unit: unit || '', pct: unit !== '%' && before ? (diff / Math.abs(before)) * 100 : null });
    }
    return out;
  }
  function fmtStat(v, unit) {
    if (unit === '%') return `${(Math.round(v * 10) / 10).toLocaleString()}%`;
    if (unit === 'x') return `${Math.round(v * 1000) / 10}%`;
    if (unit === 'rate') return `${(Math.round(v * 100) / 100).toLocaleString()}/s`;
    return num(v);
  }
  function summaryLine(r) {
    const st = r?.stats || {};
    const dps = st.FullDPS > 0 ? st.FullDPS : st.CombinedDPS || st.TotalDPS || 0;
    return [r?.skill ? `${r.skill}: ` : '', `${num(dps)} ${st.FullDPS > 0 ? 'full DPS' : 'DPS'}`, st.Life ? ` · ${num(st.Life)} life` : '', st.TotalEHP ? ` · ${num(st.TotalEHP)} effective HP` : ''].join('');
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
    const picker = skillPicker(PB.file, () => render());
    const asSkill = () => { const st = PB.results[`stats|${PB.file}`]; return picker.get(st?.level); };
    const startMods = () => withResult('upgrades', mods, () => call('pob:upgrades', { file: PB.file, asSkill: asSkill() }), (r) => mount(mods, asSkillNote(r), upgradesView(r)));
    PB.findAsSkill = asSkill;
    if (PB.results[`upgrades|${PB.file}`]) startMods();
    else mount(mods, h('div', { class: 'panel stack' },
      h('p', { class: 'small muted' }, 'Or see which single mod would help each of your rare items most (PoB adds one high roll at a time to the item you wear).'),
      h('div', {}, h('button', { class: 'sm', disabled: !PB.file, onclick: startMods }, 'Show the best mods per item'))));
    mount(out, h('div', { class: 'panel' }, picker.el), find, h('h3', { style: { margin: '18px 0 0' } }, 'Best mods for your items'), mods);
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
        PB.results.find = await call('pob:findItem', { file: PB.file, slot: F.slot, focus: F.focus, maxLevel: Number(F.maxLevel) || null, maxPrice: Number(F.maxPrice) || null, unit: F.unit, betterOnly: F.betterOnly, asSkill: PB.findAsSkill?.() || null });
        PB.results.find.forFile = PB.file;
        // the app's search was refused: the same search opens on the trade site (logged in there, it's taken)
        if (PB.results.find.refused && PB.results.find.siteUrl) call('shell:open', PB.results.find.siteUrl);
        mount(res, asSkillNote(PB.results.find), findView(PB.results.find));
      } catch (e) { mount(res, h('p', { class: 'small warn' }, errText(e))); }
      btn.disabled = false;
    };
    if (PB.results.find?.forFile === PB.file && PB.results.find.slot === F.slot) mount(res, asSkillNote(PB.results.find), findView(PB.results.find));
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
      r.missing?.length ? h('div', { class: 'small faint' }, `Not on the trade site's list, left out: ${r.missing.join(', ')}`) : null,
      r.leftOut > 0 ? h('div', { class: 'small faint' }, `The trade site only takes a few stats from the app, so the ${r.weights.length} worth most were used (${r.leftOut} left out). Full search on the trade site opens it with all of them.`) : null);
    if (r.refused) {
      return [h('div', { class: 'panel stack' },
        h('div', { class: 'row', style: { gap: '10px' } }, h('span', { class: 'small muted' }, 'Opened on the trade site with every weight filled in.'), h('span', { class: 'spacer' }),
          h('button', { class: 'sm', onclick: () => call('shell:open', r.siteUrl) }, 'Open it again')),
        weights)];
    }
    const head = h('div', { class: 'row', style: { gap: '10px' } },
      h('span', {}, r.total ? `${r.total >= 10000 ? '10,000+' : r.total.toLocaleString()} ${r.total === 1 ? 'item' : 'items'} found${r.minSum ? ' at least about as good as yours' : ''}` : 'Nothing found. Raise the price or the level limit, or untick "Only items about as good as mine".'),
      h('span', { class: 'spacer' }),
      r.leftOut > 0 && r.siteUrl ? h('button', { class: 'sm', title: 'Every weight, opened on the trade site (logged in there it allows more filters)', onclick: () => call('shell:open', r.siteUrl) }, 'Full search on the trade site') : null,
      h('button', { class: 'sm', onclick: () => call('shell:open', r.url) }, 'Open on the trade site'));
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

  const asSkillNote = (r) => (r?.asSkill ? h('div', { class: 'small muted' }, 'For ', h('b', {}, r.asSkill.skill), ` with ${r.asSkill.gems.slice(1).map((g) => `${g.name} ${g.level}`).join(', ') || 'no supports'} (gem ${r.asSkill.gems[0]?.level || 1})`,
    r.asSkill.weapon ? h('span', { class: 'warn' }, `. Your weapon can't use ${r.asSkill.skill}, so a plain ${r.asSkill.weapon} is used instead (the weapon search looks for your current weapon type)`) : null) : null);
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
    el.classList.toggle('pob-wide', PB.tab === 'calcs' || PB.tab === 'tree');
    mount(el, pageHead('Path of Building', 'Snapshots of your character, and Path of Building\'s own maths on them: test an item, see every stat, compare two builds, find upgrades.'), tabs, intro, body);
    if (PB.tab === 'snapshot') {
      const box = h('div', { class: 'pob-box' });
      mount(body, box, shareBox());
      await pobBox(box);
    } else if (PB.tab === 'stats' || PB.tab === 'test') mount(body, statsTab());
    else if (PB.tab === 'calcs') mount(body, calcsTab());
    else if (PB.tab === 'tree') mount(body, treeTab());
    else if (PB.tab === 'gems') mount(body, gemsTab());
    else if (PB.tab === 'levelling') mount(body, levellingTab());
    else if (PB.tab === 'compare') mount(body, compareTab());
    else if (PB.tab === 'config') mount(body, configTab());
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
    if (currentPage === 'pob' && (PB.tab === 'stats' || PB.tab === 'test')) render();
  });
  // the item tester hotkey
  window.poe.on('app:goto', (g) => {
    if (g?.page !== 'pob') return;
    PB.tab = g.tab === 'test' ? 'stats' : g.tab || PB.tab;
    if (g.text) { PB.text = g.text; PB.recent = [g.text, ...PB.recent.filter((x) => x !== g.text)].slice(0, 8); PB.results.test = null; PB.autoRun = true; }
    go('pob');
  });

  // a snapshot just saved: show it on the Build tab
  const showBuild = (file) => { if (file) { PB.file = file; PB.lastSeen = file; call('pob:setCurrent', file).catch(() => {}); } PB.tab = 'stats'; PB.results = {}; PB.builds = null; render(); };
  window.PobView = { render, showBuild };
})();
