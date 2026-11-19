'use strict';
/* Crafting: every mod a base can roll at an item level, how likely each one is, and its tags,
   laid out like Craft of Exile: bases on the left, the prefix and suffix pools side by side. */
(function () {
  const { h, mount, call } = window.UI;
  const C = { tab: 'mods', sim: null, fossils: [], hTag: 'life', hAddTag: 'life', resFrom: 'Fire', resTo: 'Cold', benchId: '', odds: null, oddsKey: '', targets: new Set(), infTab: 'shaper', item: null, paste: false, bases: null, cls: 'Body Armour', attr: 'INT', base: 'Vaal Regalia', ilvl: 86, inf: [], tag: null, open: {}, q: '' };
  const pct = (x) => (x >= 0.1 ? `${(x * 100).toFixed(2)}%` : x > 0 ? `${(x * 100).toFixed(2)}%` : '–');
  const INF = [['shaper', 'Shaper'], ['elder', 'Elder'], ['crusader', 'Crusader'], ['basilisk', 'Hunter'], ['eyrie', 'Redeemer'], ['adjudicator', 'Warlord']];
  const GROUPS = [
    ['One-handed', ['Claw', 'Dagger', 'Rune Dagger', 'One Hand Axe', 'One Hand Mace', 'Sceptre', 'One Hand Sword', 'Thrusting One Hand Sword', 'Wand']],
    ['Two-handed', ['Bow', 'Staff', 'Warstaff', 'Two Hand Axe', 'Two Hand Mace', 'Two Hand Sword']],
    ['Armour', ['Body Armour', 'Helmet', 'Gloves', 'Boots', 'Shield', 'Quiver']],
    ['Jewellery', ['Amulet', 'Ring', 'Belt']],
    ['Jewels', ['Jewel', 'AbyssJewel']],
    ['Flasks', ['LifeFlask', 'ManaFlask', 'HybridFlask', 'UtilityFlask']],
  ];
  const NAME = { AbyssJewel: 'Abyss Jewel', LifeFlask: 'Life Flask', ManaFlask: 'Mana Flask', HybridFlask: 'Hybrid Flask', UtilityFlask: 'Utility Flask', 'Thrusting One Hand Sword': 'Thrusting Sword' };
  const nm = (c) => NAME[c] || c;
  // tag colours as Craft of Exile uses them; the name is always written, so colour is only a help
  const TAG_CLASS = { Fire: 'fire', Cold: 'cold', Lightning: 'light', Chaos: 'chaos', Physical: 'phys', Life: 'life', Mana: 'mana', Defences: 'def', 'Energy Shield': 'def', Armour: 'def', Evasion: 'def', Attack: 'atk', Caster: 'cast', Speed: 'speed', Critical: 'crit', Elemental: 'ele', Resistance: 'res', Attribute: 'attrib', Minion: 'minion', Damage: 'dmg' };
  const tagChip = (t, extra = '') => h('span', { class: `co-tag co-${TAG_CLASS[t] || 'other'}${extra}` }, t);

  async function render() {
    const el = document.getElementById('page-craft');
    if (!C.bases) C.bases = await call('craft:bases');
    if (C.tab === 'sim') return renderSim(el);
    const targets = [...C.targets];
    const view = await call('craft:view', C.item ? { item: C.item, ilvl: C.itemIlvl || undefined, influences: C.itemInf || undefined, targets } : { base: C.base, ilvl: C.ilvl, influences: C.inf, targets });
    if (C.item && !view) { C.item = null; window.UI.toast('That item\'s base isn\'t one that rolls mods.', true); return render(); }
    // your item: the left side shows its base
    if (C.item && view) { C.cls = view.base.cls; C.base = view.base.name; C.attr = C.bases.find((c) => c.cls === C.cls)?.bases.find((b) => b.name === C.base)?.attr || null; }
    draw(el, view);
  }
  const pick = (cls, base) => {
    const c = C.bases.find((x) => x.cls === cls);
    if (!c) return;
    C.item = null; C.itemIlvl = null; C.itemInf = null; C.targets = new Set();
    C.cls = cls; C.base = base || c.bases[c.bases.length - 1].name;
    C.attr = c.bases.find((b) => b.name === C.base)?.attr || null;
    C.inf = []; C.tag = null; C.open = {}; C.sim = null; C.odds = null; render();
  };

  // ---------- left: item classes and bases ----------
  function sidebar(v) {
    const have = new Set(C.bases.map((c) => c.cls));
    const cur = C.bases.find((c) => c.cls === C.cls);
    const attrs = [...new Set(cur.bases.map((b) => b.attr).filter(Boolean))];
    const list = [...cur.bases].filter((b) => !attrs.length || b.attr === C.attr).reverse();
    const q = C.q.trim().toLowerCase();
    const found = q ? C.bases.flatMap((c) => c.bases.filter((b) => b.name.toLowerCase().includes(q)).map((b) => ({ ...b, cls: c.cls }))).slice(0, 40) : null;
    return h('aside', { class: 'co-side' },
      h('input', { type: 'search', placeholder: 'Find a base', value: C.q, 'aria-label': 'Find a base', oninput: (e) => { C.q = e.target.value; const pos = e.target.selectionStart; render().then(() => { const i = document.querySelector('.co-side input[type=search]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }); } }),
      found ? h('div', { class: 'co-bases' }, found.length ? found.map((b) => h('button', { class: 'co-base' + (b.name === C.base ? ' on' : ''), onclick: () => { C.q = ''; pick(b.cls, b.name); } },
        window.UI.itemPic(b.name, { size: 30 }), h('span', {}, b.name, h('small', {}, `${nm(b.cls)} · level ${b.lvl}`)))) : h('div', { class: 'small muted' }, 'No base matches.')) : [
        ...GROUPS.map(([g, classes]) => h('div', { class: 'co-group' }, h('div', { class: 'co-ghead' }, g),
          h('div', { class: 'co-classes' }, classes.filter((c) => have.has(c)).map((c) => h('button', { class: 'co-cls' + (c === C.cls ? ' on' : ''), onclick: () => pick(c) }, nm(c)))))),
        attrs.length > 1 ? h('div', { class: 'co-attrs', role: 'tablist' }, attrs.map((a) => h('button', { class: 'co-deftab' + (a === C.attr ? ' on' : ''), role: 'tab', 'aria-selected': a === C.attr ? 'true' : 'false',
          onclick: () => { C.attr = a; const b = cur.bases.filter((x) => x.attr === a); C.base = b[b.length - 1].name; C.open = {}; C.sim = null; C.item = null; render(); } }, a))) : null,
        h('div', { class: 'co-bases' }, list.map((b) => h('button', { class: 'co-base' + (b.name === C.base ? ' on' : ''), onclick: () => { C.base = b.name; C.open = {}; C.sim = null; C.item = null; render(); } },
          window.UI.itemPic(b.name, { size: 30 }), h('span', {}, b.name, h('small', {}, `level ${b.lvl}`))))),
      ]);
  }

  // ---------- a mod group and its tiers ----------
  function modRow(f) {
    const open = !!C.open[f.key];
    const mine = f.yours ? h('span', { class: 'co-mine' }, `On your item${f.yours.tier ? ` · T${f.yours.tier}` : ''}${f.yours.name ? ` ${f.yours.name}` : ''}${f.yours.crafted ? ' · crafted' : f.yours.fractured ? ' · fractured' : ''}`) : f.blocked ? h('span', { class: 'co-blocked' }, 'Can\'t roll: a mod of this kind is on your item') : null;
    const hit = !C.tag || f.tags.includes(C.tag);
    const openTiers = f.tiers.filter((t) => t.open);
    return h('div', { class: 'co-mod' + (hit ? '' : ' dim') + (open ? ' open' : '') + (f.yours ? ' yours' : '') + (f.blocked ? ' blocked' : '') },
      h('button', { class: 'co-modhead', 'aria-expanded': open ? 'true' : 'false', onclick: () => { C.open[f.key] = !open; render(); } },
        f.yours || f.blocked || f.offered != null ? h('span', { class: 'co-tiers' }, `${openTiers.length}`) :
          h('span', { class: 'co-want' + (C.targets.has(f.key) ? ' on' : ''), role: 'checkbox', 'aria-checked': C.targets.has(f.key) ? 'true' : 'false', tabindex: 0, title: 'Tick the mods you want: Crafting finds the best blocker for them',
            onclick: (e) => { e.stopPropagation(); if (C.targets.has(f.key)) C.targets.delete(f.key); else C.targets.add(f.key); render(); },
            onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); e.target.click(); } } }, C.targets.has(f.key) ? '✓' : ''),
        h('span', { class: 'co-modtext' }, f.range.split('\n').map((l) => h('div', {}, l)),
          mine, f.offered != null ? h('span', { class: 'co-offer' }, `In the 3 you're offered: ${pct(f.offered)}`) : null,
          h('div', { class: 'co-tagline' }, f.influence ? h('span', { class: 'co-tag co-inf' }, f.influence) : null, f.tags.map((t) => tagChip(t, C.tag === t ? ' on' : '')))),
        h('span', { class: 'co-w' }, String(f.weight)),
        h('span', { class: 'co-p' }, f.yours ? '✓' : pct(f.chance))),
      open ? h('div', { class: 'co-tierlist' }, f.tiers.map((t) => h('div', { class: 'co-tier' + (t.open ? '' : ' locked') + (f.yours?.tier === t.tier ? ' yours' : ''), title: t.open ? '' : `Needs item level ${t.lvl}` },
        h('span', { class: 'co-tn' }, `T${t.tier}`),
        h('span', { class: 'co-il' }, `iLvl ${t.lvl}`),
        h('span', { class: 'co-tname' }, t.name || ''),
        h('span', { class: 'co-roll' }, t.text.split('\n').map((l) => h('div', {}, l))),
        h('span', { class: 'co-w' }, String(t.weight)),
        h('span', { class: 'co-p' }, t.open ? pct(t.chance) : '–')))) : null);
  }

  function pool(title, s, side, v) {
    const sl = v?.item?.slots;
    const full = sl && sl.max && sl[side] >= sl.max;
    const tagged = C.tag ? s.families.filter((f) => f.tags.includes(C.tag)).reduce((n, f) => n + f.chance, 0) : null;
    return h('section', { class: 'co-pool' },
      h('header', {}, h('h3', {}, title), h('span', { class: 'faint small' }, `${s.families.length} groups · weight ${s.total}`),
        sl && sl.max ? h('span', { class: 'co-slots' + (full ? ' full' : '') }, `${sl[side]} / ${sl.max} on your item${full ? ' · full' : ''}`) : null,
        h('span', { class: 'spacer' }), C.tag ? h('span', { class: 'small' }, `${C.tag} `, h('b', {}, pct(tagged))) : null),
      h('div', { class: 'co-cols small faint' }, h('span', {}, 'Tiers'), h('span', {}, 'Modifier'), h('span', { class: 'r' }, 'Weight'), h('span', { class: 'r' }, 'Chance')),
      full ? h('div', { class: 'co-note' }, `No open ${side}: a new one can't roll until you remove one.`) : null,
      s.families.length ? s.families.map(modRow) : h('div', { class: 'small muted', style: { padding: '10px' } }, 'None at this item level.'));
  }

  // the best blockers for the mods you ticked
  function blockerPanel(v) {
    const B = v.blockers;
    const side = (sd) => (sd === 'prefix' ? 'prefix' : 'suffix');
    return h('section', { class: 'co-block panel' },
      h('div', { class: 'co-bhead' }, h('h3', {}, 'Best blockers'),
        h('span', { class: 'small muted' }, `You want ${C.targets.size} mod${C.targets.size === 1 ? '' : 's'}. ${B.sides.map((sd) => `A new ${side(sd)} is one of them: ${pct(B.before[sd])}`).join(' · ')}.`),
        h('span', { class: 'spacer' }), h('button', { class: 'quiet sm', onclick: () => { C.targets = new Set(); render(); } }, 'Clear ticks')),
      B.rows.length ? B.rows.slice(0, C.moreBlockers ? 12 : 4).map((r, i) => h('div', { class: 'co-brow' + (i === 0 ? ' best' : '') },
        h('div', { class: 'co-bmain' },
          i === 0 ? h('span', { class: 'co-tag co-bestt' }, 'Best') : null,
          h('b', {}, r.text.split('\n').join(' / ')),
          h('span', { class: 'co-tag co-other' }, `crafted ${r.side}`),
          r.meta ? h('span', { class: 'co-tag co-meta' }, `blocks every ${r.meta} mod, both sides`) : r.groups > 1 ? h('span', { class: 'co-tag co-meta' }, `blocks ${r.groups} kinds`) : null,
          h('span', { class: 'faint small' }, r.cost)),
        h('div', { class: 'co-bafter' }, B.sides.map((sd) => h('span', {}, `${side(sd)}: ${pct(B.before[sd])} → `, h('b', {}, pct(r.after[sd])), r.after[sd] > B.before[sd] ? h('span', { class: 'co-up' }, ` ×${(r.after[sd] / Math.max(1e-9, B.before[sd])).toFixed(2)}`) : null))),
        h('div', { class: 'co-blocked small faint' }, 'Blocks: ', r.blocked.slice(0, 8).map((x) => x.text.split('\n')[0]).join(' · '), r.blocked.length > 8 ? ` · and ${r.blocked.length - 8} more` : ''),
        h('div', { class: 'small faint' }, `Takes a ${r.side} slot.`))) :
        h('div', { class: 'small muted' }, 'No bench craft helps here: nothing it blocks is in the way, or it would block what you want.'),
      B.rows.length > 4 ? h('button', { class: 'quiet sm', onclick: () => { C.moreBlockers = !C.moreBlockers; render(); } }, C.moreBlockers ? 'Show fewer' : `Show ${Math.min(12, B.rows.length) - 4} more`) : null,
      h('div', { class: 'small faint' }, 'Chances are for one new mod (Exalted Orb, Harvest, Veiled Chaos…). A blocker you craft has to be removed afterwards to free its slot.'));
  }


  // ---------- tabs: the mod list, and the emulator ----------
  function tabs() {
    return h('div', { class: 'co-tabs', role: 'tablist' }, [['mods', 'Mods'], ['sim', 'Try crafts']].map(([id, name]) => h('button', {
      class: 'co-tab' + (C.tab === id ? ' on' : ''), role: 'tab', 'aria-selected': C.tab === id ? 'true' : 'false',
      onclick: () => { C.tab = id; render(); } }, name)));
  }

  // ---------- the craft emulator ----------
  const RAR = { Normal: 'normal', Magic: 'magic', Rare: 'rare' };
  async function startSim(o) {
    const r = await call('craft:simStart', o);
    if (r.error) { window.UI.toast(r.error, true); return; }
    C.sim = { state: r.state, view: await call('craft:simView', r.state), undo: [], log: [], used: {} };
    C.odds = null;
  }
  async function doCraft(action, args, label) {
    const S = C.sim;
    const r = await call('craft:simAct', { state: S.state, action, args });
    if (r.error) { window.UI.toast(r.error, true); return; }
    S.undo.push({ state: S.state, view: S.view, used: { ...S.used }, log: S.log.length });
    if (S.undo.length > 200) S.undo.shift();
    S.state = r.state; S.view = r.view;
    S.used[label] = (S.used[label] || 0) + 1;
    S.log.unshift({ label, note: r.note || '' });
    S.log = S.log.slice(0, 40);
    C.odds = null;
    render();
  }
  function undo() {
    const S = C.sim; const u = S.undo.pop();
    if (!u) return;
    S.state = u.state; S.view = u.view; S.used = u.used; S.log = S.log.slice(S.log.length - u.log);
    C.odds = null; render();
  }

  // the item, as the game shows it
  function simItem(v) {
    const line = (m) => h('div', { class: 'cs-mod' + (m.crafted ? ' crafted' : '') + (m.fractured ? ' fractured' : '') },
      h('span', { class: 'cs-badge' }, `${m.aff === 'prefix' ? 'P' : 'S'}${m.tier ? ` T${m.tier}` : ''}`),
      h('span', { class: 'cs-text' }, m.text.split('\n').map((l) => h('div', {}, l)),
        h('span', { class: 'co-tagline' }, m.crafted ? h('span', { class: 'co-tag co-other' }, 'crafted') : null, m.fractured ? h('span', { class: 'co-tag co-other' }, 'fractured') : null,
          m.unknown ? h('span', { class: 'co-tag co-other' }, 'not in the mod list') : null, (m.showTags || []).map((t) => tagChip(t)))));
    const empty = (sd, n) => Array.from({ length: Math.max(0, v.max - n) }, () => h('div', { class: 'cs-mod open' }, h('span', { class: 'cs-badge' }, sd), h('span', { class: 'cs-text faint' }, 'open')));
    return h('div', { class: `cs-item cs-${RAR[v.rarity] || 'normal'}` },
      h('div', { class: 'cs-head' }, window.UI.itemPic(v.base.name, { size: 48 }),
        h('div', {}, h('b', {}, v.base.name), h('div', { class: 'small' }, `${v.rarity} · item level ${v.ilvl}${v.influences.length ? ` · ${v.influences.map((i) => INF.find(([x]) => x === i)?.[1]).join(' + ')}` : ''}${v.corrupted ? ' · corrupted' : ''}`))),
      h('div', { class: 'cs-side small faint' }, `Prefixes ${v.prefixes.length} / ${v.max}`),
      v.prefixes.map(line), empty('P', v.prefixes.length),
      h('div', { class: 'cs-side small faint' }, `Suffixes ${v.suffixes.length} / ${v.max}`),
      v.suffixes.map(line), empty('S', v.suffixes.length));
  }

  const btn = (label, why, onclick, extra = {}) => h('button', { class: 'sm' + (extra.cls ? ` ${extra.cls}` : ''), disabled: !!why, title: why || extra.title || '', onclick }, label);
  const sel = (value, opts, onchange, label) => h('select', { 'aria-label': label, onchange: (e) => onchange(e.target.value) }, opts.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));

  function currencyPanel(v) {
    return h('section', { class: 'cs-panel' }, h('h3', {}, 'Currency'),
      h('div', { class: 'cs-grid' }, v.currency.map((c) => h('button', { class: 'cs-cur', disabled: !!v.can[c.id], title: v.can[c.id] || c.what, onclick: () => doCraft(c.id, {}, c.name) },
        window.UI.itemPic(c.name, { size: 32 }), h('span', {}, c.name.replace(/^Orb of /, ''))))));
  }

  function harvestPanel(v) {
    const tags = v.harvestTags.map(([n, t]) => [t, n]);
    const tagName = (t) => v.harvestTags.find(([, x]) => x === t)?.[0] || t;
    const RES = ['Fire', 'Cold', 'Lightning'];
    const resWhy = C.resFrom === C.resTo ? 'Pick two different elements' : v.can[`harvestResist:${C.resFrom}:${C.resTo}`];
    return h('section', { class: 'cs-panel' }, h('h3', {}, 'Harvest'),
      h('div', { class: 'cs-row' }, h('span', {}, 'Reforge with a'), sel(C.hTag, tags, (x) => { C.hTag = x; }, 'Harvest reforge tag'), h('span', {}, 'mod'),
        btn('Reforge', v.can.harvestReforge, () => doCraft('harvestReforge', { tag: C.hTag }, `Harvest: reforge ${tagName(C.hTag)}`), { title: 'Rerolls the rare with at least one mod of that tag' })),
      h('div', { class: 'cs-row' }, h('span', {}, 'Add a'), sel(C.hAddTag, tags, (x) => { C.hAddTag = x; }, 'Harvest add tag'), h('span', {}, 'mod, remove a random one'),
        btn('Add', v.can.harvestAdd, () => doCraft('harvestAdd', { tag: C.hAddTag }, `Harvest: add ${tagName(C.hAddTag)}`), { title: 'Not on influenced items. Costs a Sacred lifeforce in game.' })),
      h('div', { class: 'cs-row' }, h('span', {}, 'Change'), sel(C.resFrom, RES.map((r) => [r, r]), (x) => { C.resFrom = x; render(); }, 'Resistance from'), h('span', {}, 'Resistance to'),
        sel(C.resTo, RES.map((r) => [r, r]), (x) => { C.resTo = x; render(); }, 'Resistance to'),
        btn('Change', resWhy, () => doCraft('harvestResist', { from: C.resFrom, to: C.resTo }, `Harvest: ${C.resFrom} to ${C.resTo}`))),
      h('div', { class: 'cs-row' }, h('span', {}, 'Reforge with an influence mod'),
        btn('Reforge', v.can.harvestInfluence, () => doCraft('harvestInfluence', {}, 'Harvest: influence reforge'))),
      h('div', { class: 'small faint' }, 'Harvest reforges keep fractured mods and the side a "cannot be changed" bench craft locks.'));
  }

  function benchPanel(v) {
    const list = v.bench;
    // your pick stays; otherwise the first craft that fits now
    const pickedOk = list.find((b) => b.id === C.benchId);
    if (!pickedOk || (pickedOk.why && !C.benchPicked)) C.benchId = (list.find((b) => !b.why) || list[0] || {}).id || '';
    const cur = list.find((b) => b.id === C.benchId);
    const opt = (b) => h('option', { value: b.id, selected: b.id === C.benchId }, `${b.why ? '✕ ' : ''}${b.text.split('\n').join(' / ')} · ${b.cost}`);
    return h('section', { class: 'cs-panel' }, h('h3', {}, 'Crafting bench'),
      list.length ? h('div', { class: 'cs-row' }, h('select', { class: 'cs-bench', 'aria-label': 'Bench craft', onchange: (e) => { C.benchId = e.target.value; C.benchPicked = true; render(); } },
        h('optgroup', { label: 'Prefixes' }, list.filter((b) => b.aff === 'prefix').map(opt)),
        h('optgroup', { label: 'Suffixes' }, list.filter((b) => b.aff === 'suffix').map(opt))),
      btn('Craft', cur?.why, () => doCraft('bench', { id: C.benchId }, 'Bench craft'))) : h('div', { class: 'small muted' }, 'Make the item magic or rare to use the bench.'),
      cur?.why ? h('div', { class: 'small faint' }, cur.why) : null,
      h('div', { class: 'cs-row' }, btn('Remove crafted mods', v.can.removeCrafted, () => doCraft('removeCrafted', {}, 'Remove crafted mods'))));
  }

  const tries = (p) => (p > 0 ? `about 1 in ${p >= 0.5 ? (1 / p).toFixed(1) : Math.round(1 / p).toLocaleString()}` : 'never');
  const cmp = (a, b) => (a > b * 1.001 ? h('span', { class: 'co-up' }, ` + ×${(a / Math.max(b, 1e-9)).toFixed(1)}`) : a < b * 0.999 ? h('span', { class: 'cs-down' }, ` − ×${(a / Math.max(b, 1e-9)).toFixed(2)}`) : null);
  const short = (n) => n.replace(/ Fossil$/, '');
  const famName = (k) => { const f = (C.fams || []).find((x) => x.key === k); return f ? f.range.split('\n').join(' / ') : k; };

  // the mods you want: click them (prefixes and suffixes this base can roll)
  function wantPicker(v) {
    const q = (C.fq || '').trim().toLowerCase();
    const onItem = new Set([...v.prefixes, ...v.suffixes].filter((m) => m.fractured).map((m) => m.key));
    const list = (sd) => (C.fams || []).filter((f) => f.aff === sd && (!q || f.range.toLowerCase().includes(q) || f.tags.some((t) => t.toLowerCase().includes(q))));
    const row = (f) => {
      const on = C.targets.has(f.key);
      return h('button', { class: 'cs-wmod' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', title: on ? 'Click to drop it' : 'Click: I want this mod',
        onclick: () => { if (on) C.targets.delete(f.key); else C.targets.add(f.key); render(); } },
        h('span', { class: 'cs-wbox' }, on ? '✓' : ''),
        h('span', { class: 'cs-wtext' }, f.range.split('\n').map((l) => h('div', {}, l)), onItem.has(f.key) ? h('small', {}, 'fractured on your item') : null),
        h('span', { class: 'cs-wp faint small' }, pct(f.chance)));
    };
    const search = h('input', { type: 'search', placeholder: 'Find a mod or tag (life, fire, speed…)', value: C.fq || '', 'aria-label': 'Find a mod',
      oninput: (e) => { C.fq = e.target.value; const pos = e.target.selectionStart; render().then(() => { const i = document.querySelector('.cs-wsearch input'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }); } });
    return h('div', { class: 'cs-wpick' },
      h('div', { class: 'cs-row cs-wsearch' }, h('b', {}, 'Mods you want'), search,
        C.targets.size ? h('button', { class: 'quiet sm', onclick: () => { C.targets = new Set(); render(); } }, `Clear (${C.targets.size})`) : null),
      C.targets.size ? h('div', { class: 'cs-want' }, [...C.targets].map((k) => h('span', { class: 'cs-chip' }, famName(k),
        h('button', { class: 'quiet sm', 'aria-label': `Drop ${famName(k)}`, onclick: () => { C.targets.delete(k); render(); } }, '×')))) : null,
      h('div', { class: 'cs-wcols' }, ['prefix', 'suffix'].map((sd) => { const l = list(sd); return h('div', {}, h('div', { class: 'cs-side small faint' }, sd === 'prefix' ? 'Prefixes' : 'Suffixes'),
        h('div', { class: 'cs-wlist' }, l.length ? l.map(row) : h('div', { class: 'small faint', style: { padding: '6px' } }, q ? 'None match' : 'None'))); })));
  }

  // the best fossil sets for the mods you clicked (worked out in the background)
  function bestPanel() {
    const want = [...C.targets];
    if (!want.length) return h('div', { class: 'small faint' }, 'Click the mods you want: the best fossils for them show here.');
    const key = `${JSON.stringify(C.sim.state)}|${want.sort().join()}`;
    if (C.bestKey !== key) {
      C.bestKey = key; C.best = 'busy';
      call('craft:bestFossils', { state: C.sim.state, targets: want }).then((r) => { if (C.bestKey === key && r !== null) { C.best = r; render(); } })
        .catch((e) => { if (C.bestKey === key) { C.best = { error: e.message }; render(); } });
    }
    const B = C.best;
    if (B === 'busy') return h('div', { class: 'cs-best small muted' }, `Trying every set of up to 4 fossils for ${want.length} mod${want.length === 1 ? '' : 's'}…`);
    if (!B || B.error) return h('div', { class: 'small muted' }, B?.error || '');
    const same = (fs) => fs.length === C.fossils.length && fs.every((x) => C.fossils.includes(x));
    return h('div', { class: 'cs-best' },
      h('div', { class: 'cs-row' }, h('b', {}, 'Best fossils'), h('span', { class: 'small faint' }, `${want.length === 1 ? 'that mod' : `all ${want.length} mods`} in one resonator · Chaos Orb: ${pct(B.chaos.all)} (${tries(B.chaos.all)})`)),
      B.best.length ? h('table', { class: 'cs-otable' }, h('tbody', {}, B.best.map((r, i) => h('tr', { class: (i === 0 ? 'all' : '') + (same(r.fossils) ? ' picked' : '') },
        h('td', {}, i === 0 ? h('span', { class: 'co-tag co-bestt' }, 'Best') : null, ' ', r.fossils.map(short).join(' + '), h('div', { class: 'small faint' }, `${r.fossils.length} fossil${r.fossils.length === 1 ? '' : 's'}`)),
        h('td', { class: 'r' }, h('b', {}, pct(r.all)), cmp(r.all, B.chaos.all), h('div', { class: 'small faint' }, tries(r.all))),
        h('td', { class: 'r' }, same(r.fossils) ? h('span', { class: 'small' }, '✓ picked') : h('button', { class: 'sm', onclick: () => { C.fossils = [...r.fossils]; C.odds = null; render(); } }, 'Use these')))))) :
        h('div', { class: 'small muted' }, 'No fossil set can give all of these at once on this item. Try fewer mods.'),
      h('div', { class: 'small faint' }, `${B.checked.toLocaleString()} sets checked; the best ones tried ${B.tries.toLocaleString()} times on your item. Fractured mods stay.`));
  }

  function fossilPanel(v) {
    const on = new Set(C.fossils);
    const fWhy = !C.fossils.length ? 'Pick up to 4 fossils' : v.corrupted ? 'The item is corrupted' : null;
    return h('section', { class: 'cs-panel cs-fossils' }, h('h3', {}, 'Fossils'),
      wantPicker(v),
      bestPanel(),
      h('div', { class: 'cs-side small faint' }, 'Your fossils'),
      h('div', { class: 'cs-fgrid' }, v.fossils.map((f) => h('button', {
        class: 'cs-fossil' + (on.has(f.name) ? ' on' : ''), disabled: !f.fits, 'aria-pressed': on.has(f.name) ? 'true' : 'false',
        title: `${f.text}${f.special ? '\n(its effect isn\'t in the emulator)' : ''}${f.fits ? '' : '\nCan\'t be used on this item'}`,
        onclick: () => { if (on.has(f.name)) C.fossils = C.fossils.filter((x) => x !== f.name); else if (C.fossils.length < 4) C.fossils = [...C.fossils, f.name]; else { window.UI.toast('A resonator takes up to 4 fossils.', true); return; } C.odds = null; render(); } },
        window.UI.itemPic(f.name, { size: 28 }), h('span', {}, short(f.name), f.special ? h('small', {}, ' *') : null)))),
      h('div', { class: 'cs-row' }, h('span', { class: 'small' }, C.fossils.length ? C.fossils.join(' + ') : 'No fossil picked'), h('span', { class: 'spacer' }),
        btn('Use resonator', fWhy, () => doCraft('fossil', { fossils: C.fossils }, `Resonator: ${C.fossils.map(short).join(' + ')}`))),
      h('div', { class: 'small faint' }, '* Its special effect (corruption, sockets, vendor price) isn\'t in the emulator; the reforge still is.'),
      oddsPanel(v));
  }

  // the chance of hitting the mods you want with the fossils you picked, against a Chaos Orb
  function oddsPanel() {
    const want = [...C.targets];
    if (!want.length || !C.fossils.length) return null;
    const key = `${JSON.stringify(C.sim.state)}|${C.fossils.join()}|${want.join()}`;
    if (C.oddsKey !== key) {
      C.oddsKey = key; C.odds = 'busy';
      call('craft:fossilOdds', { state: C.sim.state, fossils: C.fossils, targets: want }).then((o) => { if (C.oddsKey === key) { C.odds = o; render(); } });
    }
    const o = C.odds && C.odds !== 'busy' ? C.odds : null;
    return h('div', { class: 'cs-odds' },
      h('b', {}, `With ${C.fossils.map(short).join(' + ')}`),
      C.odds === 'busy' ? h('div', { class: 'small muted' }, 'Working it out…') : null,
      o ? h('table', { class: 'cs-otable' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'r' }, 'These fossils'), h('th', { class: 'r' }, 'Chaos Orb'))),
        h('tbody', {},
          want.length > 1 ? h('tr', { class: 'all' }, h('td', {}, h('b', {}, `All ${want.length} at once`)), h('td', { class: 'r' }, h('b', {}, pct(o.all)), cmp(o.all, o.chaos.all), h('div', { class: 'small faint' }, tries(o.all))), h('td', { class: 'r' }, pct(o.chaos.all), h('div', { class: 'small faint' }, tries(o.chaos.all)))) : null,
          want.map((k) => h('tr', {}, h('td', {}, famName(k)), h('td', { class: 'r' }, pct(o.each[k]), cmp(o.each[k], o.chaos.each[k]), want.length === 1 ? h('div', { class: 'small faint' }, tries(o.each[k])) : null), h('td', { class: 'r' }, pct(o.chaos.each[k])))))) : null,
      o ? h('div', { class: 'small faint' }, `From ${o.tries.toLocaleString()} tries on your item as it is now. Any tier counts.`) : null);
  }

  async function renderSim(el) {
    if (!C.sim) await startSim(C.item ? { text: C.item } : { base: C.base, ilvl: C.ilvl, influences: C.inf });
    if (!C.sim) { C.tab = 'mods'; return render(); }
    const v = C.sim.view;
    // the mod kinds this base can roll, for "Add a mod you want"
    const fk = `${v.base.name}|${v.ilvl}|${v.influences.join()}`;
    if (C.famsKey !== fk) {
      C.famsKey = fk;
      const cv = await call('craft:view', { base: v.base.name, ilvl: v.ilvl, influences: v.influences });
      C.fams = cv ? [...cv.prefix.families, ...cv.suffix.families].filter((f) => f.weight > 0) : [];
    }
    const box = h('textarea', { class: 'co-paste', rows: 8, placeholder: 'Paste your item here (Ctrl+C on it in game)', 'aria-label': 'Your item\'s text' });
    const useItem = async () => { const t = box.value.trim(); if (!t) return; C.item = t; C.paste = false; await startSim({ text: t }); render(); };
    if (C.paste) setTimeout(() => box.focus(), 0);
    const S = C.sim;
    const used = Object.entries(S.used);
    mount(el, h('div', { class: 'co' },
      sidebar(null),
      h('div', { class: 'co-main' },
        tabs(),
        C.paste ? h('div', { class: 'panel co-pastebox' }, box, h('div', { class: 'row small', style: { gap: '8px' } }, h('button', { class: 'sm', onclick: useItem }, 'Craft on this item'), h('button', { class: 'quiet sm', onclick: () => { C.paste = false; render(); } }, 'Cancel'))) : null,
        h('div', { class: 'cs' },
          h('div', { class: 'cs-left' },
            simItem(v),
            h('div', { class: 'cs-row' },
              btn('Undo', S.undo.length ? null : 'Nothing to undo', undo),
              h('button', { class: 'sm quiet', onclick: async () => { await startSim(C.item ? { text: C.item } : { base: C.base, ilvl: C.ilvl, influences: C.inf }); render(); }, title: C.item ? 'Back to your item as you pasted it' : `A new normal ${C.base}` }, 'Start over'),
              h('button', { class: 'sm quiet', onclick: () => { C.paste = true; render(); } }, 'Use my item'),
              C.item ? h('button', { class: 'sm quiet', onclick: async () => { C.item = null; await startSim({ base: C.base, ilvl: C.ilvl, influences: C.inf }); render(); }, title: 'Craft on a new normal base from the list on the left' }, 'Use a new base') : null),
            !C.item ? h('div', { class: 'cs-row small' },
              h('label', { class: 'cs-row' }, h('span', { class: 'muted' }, 'Item level'), h('input', { type: 'number', min: 1, max: 100, value: C.ilvl, style: { width: '58px' }, 'aria-label': 'Item level', onchange: async (e) => { C.ilvl = Math.max(1, Math.min(100, Number(e.target.value) || 86)); await startSim({ base: C.base, ilvl: C.ilvl, influences: C.inf }); render(); } })),
              h('div', { class: 'co-infs', role: 'group', 'aria-label': 'Influence, up to two' }, INF.map(([id, name]) => h('button', {
                class: 'co-infbtn' + (C.inf.includes(id) ? ' on' : ''), 'aria-pressed': C.inf.includes(id) ? 'true' : 'false',
                onclick: async () => { C.inf = C.inf.includes(id) ? C.inf.filter((x) => x !== id) : [...C.inf, id].slice(-2); await startSim({ base: C.base, ilvl: C.ilvl, influences: C.inf }); render(); } }, name)))) : null,
            used.length ? h('section', { class: 'cs-panel' }, h('h3', {}, 'Used'),
              h('div', { class: 'cs-used small' }, used.map(([k, n]) => h('span', {}, `${n} × ${k}`)))) : null,
            S.log.length ? h('section', { class: 'cs-panel' }, h('h3', {}, 'Last crafts'),
              h('ol', { class: 'cs-log small' }, S.log.slice(0, 12).map((l) => h('li', {}, l.label, l.note ? h('span', { class: 'faint' }, ` · ${l.note}`) : null)))) : null),
          h('div', { class: 'cs-right' }, currencyPanel(v), fossilPanel(v), harvestPanel(v), benchPanel(v))),
        h('p', { class: 'small faint' }, 'Rolls use the game\'s own mod weights. How many mods a reforge gives (4: 8 in 12, 5: 3 in 12, 6: 1 in 12) and Transmutation\'s 1 or 2 mods are the usual community numbers.'))));
  }

  function draw(el, v) {
    const ilvl = h('input', { type: 'range', min: 1, max: 100, value: C.ilvl, 'aria-label': 'Item level', oninput: (e) => { num.value = e.target.value; }, onchange: (e) => { if (C.item) C.itemIlvl = Number(e.target.value); else C.ilvl = Number(e.target.value); render(); } });
    const num = h('input', { type: 'number', min: 1, max: 100, value: C.ilvl, style: { width: '58px' }, 'aria-label': 'Item level', onchange: (e) => { const n = Math.max(1, Math.min(100, Number(e.target.value) || 86)); if (C.item) C.itemIlvl = n; else C.ilvl = n; render(); } });
    if (v) { ilvl.value = v.ilvl; num.value = v.ilvl; }
    const box = h('textarea', { class: 'co-paste', rows: 8, placeholder: 'Paste your item here (Ctrl+C on it in game; Ctrl+Alt+C also gives the mod names and tiers)', 'aria-label': 'Your item\'s text' });
    const useItem = () => { const t = box.value.trim(); if (!t) return; C.item = t; C.itemIlvl = null; C.itemInf = null; C.paste = false; C.tag = null; C.open = {}; C.sim = null; render(); };
    const pastePanel = C.paste ? h('div', { class: 'panel co-pastebox' }, box,
      h('div', { class: 'row small', style: { gap: '8px' } }, h('button', { class: 'sm', onclick: useItem }, 'Use this item'), h('button', { class: 'quiet sm', onclick: () => { C.paste = false; render(); } }, 'Cancel'),
        h('span', { class: 'faint' }, 'Or press "Craft" on a price check.'))) : null;
    const it = v?.item;
    const mineLine = it ? h('div', { class: 'co-yours small' }, h('b', {}, `Your ${it.rarity ? it.rarity.toLowerCase() + ' ' : ''}item`),
      ` · ${it.slots.prefix} prefix${it.slots.prefix === 1 ? '' : 'es'}, ${it.slots.suffix} suffix${it.slots.suffix === 1 ? '' : 'es'}`,
      it.fractured ? ' · fractured' : '', it.corrupted ? ' · corrupted (can\'t be changed)' : '',
      it.mods.some((m) => !m.key && !/Veil/.test(m.name)) ? h('span', { class: 'faint' }, ' · some mods not found') : null,
      h('button', { class: 'quiet sm', onclick: () => { C.item = null; C.itemIlvl = null; C.itemInf = null; C.sim = null; render(); } }, 'Back to bases')) : null;
    if (C.paste) setTimeout(() => box.focus(), 0);
    mount(el, h('div', { class: 'co' },
      sidebar(v),
      h('div', { class: 'co-main' },
        tabs(),
        pastePanel,
        v ? h('div', { class: 'co-item panel' },
          window.UI.itemPic(v.base.name, { size: 56 }),
          h('div', { class: 'co-iname' }, h('b', {}, v.base.name), h('span', { class: 'small muted' }, `${nm(v.base.cls)} · base level ${v.base.lvl}`)),
          C.paste ? null : h('button', { class: 'sm', onclick: () => { C.paste = true; render(); }, title: 'Paste an item from the game to see what can still roll on it' }, it ? 'Paste another item' : 'Use my item'),
          mineLine,
          h('label', { class: 'co-ilvl' }, h('span', { class: 'small muted' }, 'Item level'), ilvl, num),
          v.canInfluence ? h('div', { class: 'co-infs', role: 'group', 'aria-label': 'Influence, up to two' }, INF.map(([id, name]) => h('button', {
            class: 'co-infbtn co-inf-' + id + (v.influences.includes(id) ? ' on' : ''), 'aria-pressed': v.influences.includes(id) ? 'true' : 'false', title: `${name} influence`,
            onclick: () => { if (C.item) { const cur = C.itemInf || v.influences; C.itemInf = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2); } else C.inf = C.inf.includes(id) ? C.inf.filter((x) => x !== id) : [...C.inf, id].slice(-2); C.open = {}; render(); } }, name))) : null) : null,
        v ? h('div', { class: 'co-tagbar' }, h('span', { class: 'small muted' }, 'Tags'),
          v.tags.map((t) => h('button', { class: 'co-tagbtn' + (C.tag === t.tag ? ' on' : ''), 'aria-pressed': C.tag === t.tag ? 'true' : 'false', onclick: () => { C.tag = C.tag === t.tag ? null : t.tag; render(); }, title: `A new prefix has it ${pct(t.prefix)}, a new suffix ${pct(t.suffix)}` },
            tagChip(t.tag), h('span', { class: 'faint' }, `${t.prefix ? pct(t.prefix) : '–'} / ${t.suffix ? pct(t.suffix) : '–'}`)))) : null,
        v?.blockers ? blockerPanel(v) : C.targets.size === 0 && v ? h('div', { class: 'small faint', style: { margin: '0 0 8px' } }, 'Tick the mods you want (the box left of each mod) to see which bench craft blocks the most of the rest.') : null,
        v ? h('div', { class: 'co-pools' }, pool('Prefixes', v.prefix, 'prefix', v), pool('Suffixes', v.suffix, 'suffix', v)) : h('div', { class: 'panel' }, 'Pick a base.'),
        v?.influenceMods ? h('div', { class: 'co-extra' },
          h('div', { class: 'co-xhead' }, h('h3', {}, 'Influence mods'),
            h('span', { class: 'small muted' }, 'Each influence\'s own mods, with their chance if the item had only that influence.'),
            h('div', { class: 'co-infs', role: 'tablist' }, INF.map(([id, name]) => h('button', { class: 'co-infbtn' + (C.infTab === id ? ' on' : ''), role: 'tab', 'aria-selected': C.infTab === id ? 'true' : 'false', onclick: () => { C.infTab = id; render(); } }, name)))),
          h('div', { class: 'co-pools' }, pool(`${INF.find(([i]) => i === C.infTab)[1]} prefixes`, v.influenceMods[C.infTab].prefix), pool(`${INF.find(([i]) => i === C.infTab)[1]} suffixes`, v.influenceMods[C.infTab].suffix))) : null,
        v?.veiled && (v.veiled.prefix.families.length || v.veiled.suffix.families.length) ? h('div', { class: 'co-extra' },
          h('div', { class: 'co-xhead' }, h('h3', {}, 'Veiled mods'),
            h('span', { class: 'small muted' }, 'What a Veiled Prefix or Suffix can unveil into on this base. Unveiling offers 3 of them; you keep one.')),
          h('div', { class: 'co-pools' }, pool('Unveiled prefixes', v.veiled.prefix), pool('Unveiled suffixes', v.veiled.suffix))) : null,
        h('p', { class: 'small faint' }, 'Chance: how likely one new prefix (or suffix) is that mod group, e.g. from a Chaos Orb, Exalted Orb or Orb of Alchemy. Mods already on the item would raise the others a bit. Weights come from the game\'s files.'))));
  }

  // from a price check: open with that item
  function load(text) { C.item = text; C.itemIlvl = null; C.itemInf = null; C.paste = false; C.tag = null; C.open = {}; C.sim = null; C.odds = null; }
  window.CraftView = { render, load };
})();
