'use strict';
/* Crafting: every mod a base can roll at an item level, how likely each one is, and its tags,
   laid out like Craft of Exile: bases on the left, the prefix and suffix pools side by side. */
(function () {
  const { h, mount, call } = window.UI;
  const C = { item: null, paste: false, bases: null, cls: 'Body Armour', attr: 'INT', base: 'Vaal Regalia', ilvl: 86, inf: [], tag: null, open: {}, q: '' };
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
    const view = await call('craft:view', C.item ? { item: C.item, ilvl: C.itemIlvl || undefined, influences: C.itemInf || undefined } : { base: C.base, ilvl: C.ilvl, influences: C.inf });
    if (C.item && !view) { C.item = null; window.UI.toast('That item\'s base isn\'t one that rolls mods.', true); return render(); }
    // your item: the left side shows its base
    if (C.item && view) { C.cls = view.base.cls; C.base = view.base.name; C.attr = C.bases.find((c) => c.cls === C.cls)?.bases.find((b) => b.name === C.base)?.attr || null; }
    draw(el, view);
  }
  const pick = (cls, base) => {
    const c = C.bases.find((x) => x.cls === cls);
    if (!c) return;
    C.item = null; C.itemIlvl = null; C.itemInf = null;
    C.cls = cls; C.base = base || c.bases[c.bases.length - 1].name;
    C.attr = c.bases.find((b) => b.name === C.base)?.attr || null;
    C.inf = []; C.tag = null; C.open = {}; render();
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
          onclick: () => { C.attr = a; const b = cur.bases.filter((x) => x.attr === a); C.base = b[b.length - 1].name; C.open = {}; render(); } }, a))) : null,
        h('div', { class: 'co-bases' }, list.map((b) => h('button', { class: 'co-base' + (b.name === C.base ? ' on' : ''), onclick: () => { C.base = b.name; C.open = {}; render(); } },
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
        h('span', { class: 'co-tiers' }, `${openTiers.length}`),
        h('span', { class: 'co-modtext' }, f.range.split('\n').map((l) => h('div', {}, l)),
          mine, h('div', { class: 'co-tagline' }, f.influence ? h('span', { class: 'co-tag co-inf' }, f.influence) : null, f.tags.map((t) => tagChip(t, C.tag === t ? ' on' : '')))),
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

  function draw(el, v) {
    const ilvl = h('input', { type: 'range', min: 1, max: 100, value: C.ilvl, 'aria-label': 'Item level', oninput: (e) => { num.value = e.target.value; }, onchange: (e) => { if (C.item) C.itemIlvl = Number(e.target.value); else C.ilvl = Number(e.target.value); render(); } });
    const num = h('input', { type: 'number', min: 1, max: 100, value: C.ilvl, style: { width: '58px' }, 'aria-label': 'Item level', onchange: (e) => { const n = Math.max(1, Math.min(100, Number(e.target.value) || 86)); if (C.item) C.itemIlvl = n; else C.ilvl = n; render(); } });
    if (v) { ilvl.value = v.ilvl; num.value = v.ilvl; }
    const box = h('textarea', { class: 'co-paste', rows: 8, placeholder: 'Paste your item here (Ctrl+C on it in game; Ctrl+Alt+C also gives the mod names and tiers)', 'aria-label': 'Your item\'s text' });
    const useItem = () => { const t = box.value.trim(); if (!t) return; C.item = t; C.itemIlvl = null; C.itemInf = null; C.paste = false; C.tag = null; C.open = {}; render(); };
    const pastePanel = C.paste ? h('div', { class: 'panel co-pastebox' }, box,
      h('div', { class: 'row small', style: { gap: '8px' } }, h('button', { class: 'sm', onclick: useItem }, 'Use this item'), h('button', { class: 'quiet sm', onclick: () => { C.paste = false; render(); } }, 'Cancel'),
        h('span', { class: 'faint' }, 'Or press "Craft" on a price check.'))) : null;
    const it = v?.item;
    const mineLine = it ? h('div', { class: 'co-yours small' }, h('b', {}, `Your ${it.rarity ? it.rarity.toLowerCase() + ' ' : ''}item`),
      ` · ${it.slots.prefix} prefix${it.slots.prefix === 1 ? '' : 'es'}, ${it.slots.suffix} suffix${it.slots.suffix === 1 ? '' : 'es'}`,
      it.fractured ? ' · fractured' : '', it.corrupted ? ' · corrupted (can\'t be changed)' : '',
      it.mods.some((m) => !m.key && !/Veil/.test(m.name)) ? h('span', { class: 'faint' }, ' · some mods not found') : null,
      h('button', { class: 'quiet sm', onclick: () => { C.item = null; C.itemIlvl = null; C.itemInf = null; render(); } }, 'Back to bases')) : null;
    if (C.paste) setTimeout(() => box.focus(), 0);
    mount(el, h('div', { class: 'co' },
      sidebar(v),
      h('div', { class: 'co-main' },
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
        v ? h('div', { class: 'co-pools' }, pool('Prefixes', v.prefix, 'prefix', v), pool('Suffixes', v.suffix, 'suffix', v)) : h('div', { class: 'panel' }, 'Pick a base.'),
        h('p', { class: 'small faint' }, 'Chance: how likely one new prefix (or suffix) is that mod group, e.g. from a Chaos Orb, Exalted Orb or Orb of Alchemy. Mods already on the item would raise the others a bit. Weights come from the game\'s files.'))));
  }

  // from a price check: open with that item
  function load(text) { C.item = text; C.itemIlvl = null; C.itemInf = null; C.paste = false; C.tag = null; C.open = {}; }
  window.CraftView = { render, load };
})();
