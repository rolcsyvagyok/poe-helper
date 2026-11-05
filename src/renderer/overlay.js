'use strict';
/* In-game price check overlay. Network calls only happen on explicit clicks
   (trade search). Everything else is already computed from the local cache. */

const { h, mount, fmt, chaosDiv, ago, toast, call, dropLabel, soundButton, normalizeStyle } = window.UI;
const root = document.getElementById('ov');
let current = null;

function fit() {
  requestAnimationFrame(() => {
    // the body scrolls once the window reaches its maximum height, so ask for its full height
    const body = root.querySelector('.ov-body');
    const extra = body ? body.scrollHeight - body.clientHeight : 0;
    window.poe.call('overlay:resize', root.getBoundingClientRect().height + extra + 14).catch(() => {});
  });
}

function close() {
  window.poe.call('overlay:hide').catch(() => {});
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});

/** Top of the overlay: the item drawn the way your filter draws it on the ground. */
function header(item, filterHit) {
  const name = item ? (item.rarity === 'Unique' || item.rarity === 'Rare' ? item.name : item.typeLine) : 'Price check';
  const hidden = filterHit?.action === 'Hide';
  // the header is the drag handle (frameless window); buttons inside it stay clickable
  return h('div', { class: 'ground ov-ground ov-drag', title: 'Drag to move. The next popup opens where you leave it.' },
    dropLabel(name, filterHit?.style, { rarity: item?.rarity, scale: 0.85, hidden }),
    filterHit ? soundButton(normalizeStyle(filterHit.style).sound) : null,
    h('span', { class: 'spacer' }),
    pinButton(),
    h('button', { class: 'ov-x', title: 'Close (Esc)', 'aria-label': 'Close', onclick: close }, '✕'));
}

let kept = false;
function pinButton() {
  const b = h('button', { class: 'ov-pin' + (kept ? ' on' : ''), 'aria-pressed': kept ? 'true' : 'false', title: kept ? 'Stays open until Esc or ✕. Click to let it close when the mouse moves away.' : 'Keep this popup open', onclick: () => window.poe.call('overlay:keep', !kept).catch(() => {}) }, '📌');
  return b;
}
window.poe.on('overlay:kept', (on) => {
  kept = !!on;
  const b = root.querySelector('.ov-pin');
  if (b) { b.classList.toggle('on', kept); b.setAttribute('aria-pressed', kept ? 'true' : 'false'); }
});

function render(p) {
  current = p;
  if (p.loading) {
    mount(root, header(null), h('div', { class: 'ov-body' }, h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Pricing')));
    return fit();
  }
  if (p.error && !p.item) {
    mount(root, header(null), h('div', { class: 'ov-body' }, h('div', { class: 'muted' }, p.error)));
    return fit();
  }
  const { item, price, map, filterHit } = p;
  const divine = price?.divine;
  const facts = [];
  if (item.typeLine && item.name && item.name !== item.typeLine) facts.push(item.typeLine);
  if (item.itemLevel) facts.push(`item level ${item.itemLevel}`);
  if (item.gemLevel) facts.push(`level ${item.gemLevel}${item.quality ? `, ${item.quality}% quality` : ''}`);
  if (item.sockets?.links >= 5) facts.push(`${item.sockets.links}-link`);
  if (item.mapTier) facts.push(`tier ${item.mapTier}`);
  if (item.influences?.length) facts.push(item.influences.join(' and '));
  if (item.flags?.corrupted) facts.push('corrupted');

  const body = h('div', { class: 'ov-body' });
  if (facts.length) body.append(h('div', { class: 'ov-meta' }, facts.join(', ')));

  // --- price ---
  if (price?.found) {
    const conf = { high: ['good', 'Plenty of listings'], medium: ['warn', 'Some listings'], low: ['bad', 'Few listings'], range: ['warn', 'Variants differ'] }[price.confidence] || ['', ''];
    body.append(h('div', { class: 'ov-price' },
      h('span', { class: 'big' }, chaosDiv(price.chaos, divine)),
      divine && price.chaos >= divine ? h('span', { class: 'alt' }, `${fmt(price.chaos)} chaos`) : null,
      h('span', { class: 'spacer' }),
      conf[1] ? h('span', { class: `pill ${conf[0]}` }, conf[1]) : null));
    if (price.stackSize > 1) body.append(h('div', { class: 'small' }, `Your stack of ${price.stackSize} is worth `, h('b', {}, chaosDiv(price.totalChaos, divine))));
    if (price.range) body.append(h('div', { class: 'small muted' }, `Versions of this unique sell for ${fmt(price.range[0])} to ${fmt(price.range[1])} chaos. Check the mods.`));
    if (price.matches?.length > 1) {
      body.append(h('div', { class: 'ov-block' }, h('div', { class: 't' }, 'Close matches'),
        h('div', { class: 'ov-list' }, price.matches.slice(0, 4).map((m) => h('div', { class: 'li' },
          h('span', { class: 'muted' }, [m.variant, m.links ? `${m.links}-link` : null, m.gemLevel ? `${m.gemLevel}/${m.gemQuality || 0}%` : null, m.corrupted ? 'corrupted' : null, m.levelRequired && price.category === 'BaseType' ? `ilvl ${m.levelRequired}+` : null].filter(Boolean).join(', ') || m.name),
          h('span', { class: 'spacer' }),
          h('span', {}, chaosDiv(m.chaos, divine)))))));
    }
  } else if (price) {
    body.append(h('div', { class: 'muted' }, p.kind === 'rare' || p.kind === 'magic' ? 'Priced by its mods: tick them below and search.' : 'poe.ninja has no price for this item.'));
  }
  if (price?.ageMs != null) body.append(h('div', { class: 'small faint' }, `${p.league} prices from ${ago(price.ageMs)}`));

  // --- map warnings ---
  if (map) {
    const verdict = { skip: ['bad', 'Skip or reroll'], careful: ['warn', 'Be careful'], ok: ['good', 'Looks fine'] }[map.verdict];
    const st = map.stats;
    const stats = [st.quantity != null ? `${st.quantity}% quantity` : null, st.rarity != null ? `${st.rarity}% rarity` : null, st.packSize != null ? `${st.packSize}% pack size` : null].filter(Boolean).join(', ');
    body.append(h('div', { class: 'ov-block' },
      h('div', { class: 'row' }, h('span', { class: `pill ${verdict[0]}` }, verdict[1]), stats ? h('span', { class: 'small muted' }, stats) : null),
      map.hits.length ? h('div', { class: 'ov-list' }, map.hits.map((x) => h('div', { class: `li sev-${x.severity}` }, x.label))) : h('div', { class: 'small muted' }, 'None of the mods you flagged.')));
  }

  // --- filter ---
  if (filterHit?.line) {
    body.append(h('div', { class: 'small muted' }, `${filterHit.action === 'Hide' ? 'Hidden' : 'Shown'} by line ${filterHit.line} of your filter.`));
  }

  // --- actions ---
  const tradeBox = h('div', { class: 'ov-block', style: { display: 'none' } });
  const ti = p.tierInfo;
  // the same names as on the Loot filter page
  const nameOf = (type, o) => window.TierNames.tierName({ tier: o.tier, type, customName: o.name });
  const tierLabel = (t, type = ti?.type) => nameOf(type, (ti?.options || []).find((o) => o.tier === t) || { tier: t });
  const stateNote = (o) => (o.state === 'Off' ? ' (off)' : o.action === 'Hide' ? ' (hidden)' : '');
  let tierControls = null;
  if (ti && !ti.notListed) {
    // FilterBlade tiers: hide the base or move it to another tier of its category
    const rows = [h('div', { class: 't' }, `In your filter: ${ti.label}, ${tierLabel(ti.tier)}`)];
    if (ti.hiddenByYou) {
      rows[0].textContent = `In your filter: ${ti.label}, hidden by you`;
      rows.push(h('div', { class: 'small muted' }, 'You hid this. Pick a tier to show it again; the first one is where your filter had it.'));
    }
    if (ti.byCondition) {
      rows[0].textContent = `In your filter: ${ti.label}, ${nameOf(ti.type, ti)}`;
      rows.push(h('div', { class: 'small muted' }, `This tier takes items by ${ti.conditions.length ? ti.conditions.map(readableCondition).join(' and ') : 'their properties'}, not by name, so there is nothing to move. Change its look on the Loot filter page in the app.`),
        h('div', { class: 'ov-actions' },
          h('button', { onclick: () => setTierShown(ti, ti.state === 'Hide' ? 'Show' : 'Hide') }, ti.state === 'Hide' ? 'Show this tier' : 'Hide this tier')));
    }
    if (ti.state === 'Off') {
      rows.push(h('div', { class: 'small muted' }, 'FilterBlade switched this tier off for your strictness, so the game skips it and the item falls through to a later rule.'),
        h('div', { class: 'ov-actions' }, h('button', { class: 'primary', onclick: () => switchOn(ti) }, `Switch ${tierLabel(ti.tier)} on`)));
    }
    if (ti.options.length && ti.state !== 'Off') {
      const opts = ti.options.map((o) => h('option', { value: o.tier, selected: o.tier === ti.tier }, `${nameOf(ti.type, o)}${o.original ? ' (where your filter had it)' : ''}${stateNote(o)}`));
      const sel = h('select', { 'aria-label': 'Move to tier' }, opts);
      // picking a tier shows its look at the top, so you see what it will look like on the ground
      sel.addEventListener('change', () => previewLook(ti.options.find((o) => o.tier === sel.value)));
      rows.push(h('div', { class: 'ov-actions' }, sel, h('button', { onclick: () => moveTier(ti.type, ti.base, sel.value, ti.options.find((o) => o.tier === sel.value)) }, ti.hiddenByYou ? 'Show here' : 'Move'), ti.hiddenByYou ? null : h('button', { onclick: () => moveTier(ti.type, ti.base, '__hide__') }, 'Hide')));
      // each tier's typical price, like the tier list in the app ("Tier 2, typically 1 div")
      call('tiers:prices', ti.type).then((pr) => {
        if (!pr?.tiers) return;
        ti.options.forEach((o, i) => {
          const med = pr.tiers[o.key || `${ti.type}|${o.tier}`]?.median;
          if (med != null) opts[i].textContent = `${nameOf(ti.type, o)}, typically ${chaosDiv(med, pr.divine)}${o.original ? ' (where your filter had it)' : ''}${stateNote(o)}`;
        });
      }).catch(() => {});
    }
    tierControls = h('div', { class: 'ov-block' }, rows);
  }
  // not in any tier that is on: put it into one
  if (ti?.candidates?.length) {
    const sel = h('select', { 'aria-label': 'Category and tier' }, ti.candidates.map((c) => h('optgroup', { label: c.label }, c.tiers.map((o) => h('option', { value: `${c.type}\t${o.tier}` }, `${c.label}: ${nameOf(c.type, o)}${stateNote(o)}`)))));
    sel.addEventListener('change', () => { const [type, tier] = sel.value.split('\t'); previewLook(ti.candidates.find((c) => c.type === type)?.tiers.find((o) => o.tier === tier)); });
    const add = h('div', { class: 'ov-block' },
      h('div', { class: 't' }, ti.notListed ? `${ti.base} isn't in any tier of your filter. Put it into` : 'Or put it into a tier that is on'),
      h('div', { class: 'ov-actions' }, sel, h('button', { class: ti.notListed ? 'primary' : '', onclick: () => { const [type, tier] = sel.value.split('\t'); moveTier(type, ti.base, tier, ti.candidates.find((c) => c.type === type)?.tiers.find((o) => o.tier === tier)); } }, 'Add')));
    tierControls = tierControls ? h('div', { class: 'stack', style: { gap: '10px' } }, tierControls, add) : add;
  }
  const inTier = ti && !ti.notListed;
  const gear = ['Normal', 'Magic', 'Rare'].includes(item.rarity) && !!(item.baseType || item.typeLine) && !['currency', 'divination', 'gem', 'map', 'fragment'].includes(p.kind);
  const actions = h('div', { class: 'ov-actions' },
    gear ? h('button', { title: 'Add this base to My bases in your filter, for the item levels you choose', onclick: () => openMyBase(quickBox) }, '+ My bases…') : null,
    inTier ? null : h('button', { title: 'Choose rarities and item levels, then hide', onclick: () => openQuick('hide', quickBox) }, 'Hide…'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'quiet', onclick: () => call('app:show') }, 'App'));
  if (tierControls) body.append(tierControls);
  const quickBox = h('div', { class: 'ov-block', style: { display: 'none' } });
  body.append(actions, quickBox, tradeBox);
  // the mod picker opens right away for anything sold on the trade site; only "Search" asks GGG
  if (p.tradeable) openTrade(tradeBox);

  mount(root, header(item, filterHit), body);
  fit();
}

/** Draw the item at the top with a tier's look (o: an option from tierInfo, with its style). */
function previewLook(o) {
  const head = root.querySelector('.ov-ground');
  if (!head || !current) return;
  const hit = o ? { action: o.action === 'Hide' || o.state === 'Hide' ? 'Hide' : 'Show', style: o.style || {} } : current.filterHit;
  head.replaceWith(header(current.item, hit));
}

async function moveTier(type, base, to, option) {
  try {
    // a base read from the game's item text is a real name (a magic item's base is only our reading)
    const r = await call('tiers:move', { type, bases: [base], to, force: current.item?.rarity !== 'Magic' });
    if (r?.leftOut?.includes(base)) return toast(`${base} wasn't added: the game doesn't know that name.`);
    if (to === '__hide__') { toast(`${base} is now hidden. Zone or reload the filter in game.`); return close(); }
    // stay open with the item drawn in its new tier's look
    if (option) { previewLook(option); current.filterHit = { ...(current.filterHit || {}), action: option.action === 'Hide' ? 'Hide' : 'Show', style: option.style || {} }; }
    const where = root.querySelector('.ov-block .t');
    if (where && option) where.textContent = `In your filter: ${current.tierInfo?.label || ''}, ${window.TierNames.tierName({ tier: to, type, customName: option.name })}`;
    toast(`${base} moved. Zone or reload the filter in game.`);
  } catch { /* toast shown */ }
}

/** "MapTier >= 16" -> "map tier 16 or higher" */
function readableCondition(c) {
  // NeverSink's "any mod" trick: HasExplicitMod >=8 "a" "e" "i" "o" "u" "y" = 8 or more mods
  const many = /^HasExplicitMod\s*>=\s*(\d+)\s+"a" "e" "i" "o" "u" "y"/.exec(c);
  if (many) return `${many[1]} or more mods`;
  const flag = /^(Corrupted|Identified|Mirrored|FracturedItem|SynthesisedItem|AnyEnchantment|HasImplicitMod)\s+(True|False)$/.exec(c);
  if (flag) {
    const word = { Corrupted: 'corrupted', Identified: 'identified', Mirrored: 'mirrored', FracturedItem: 'fractured', SynthesisedItem: 'synthesised', AnyEnchantment: 'enchanted', HasImplicitMod: 'with implicit mods' }[flag[1]];
    return flag[2] === 'True' ? word : `not ${word}`;
  }
  const m = /^(\w+)\s*(>=|<=|==|=|>|<)?\s*(.+)$/.exec(c);
  if (!m) return c;
  const what = { MapTier: 'map tier', ItemLevel: 'item level', AreaLevel: 'area level', Quality: 'quality', StackSize: 'stack size', GemLevel: 'gem level', DropLevel: 'drop level', Sockets: 'sockets', LinkedSockets: 'linked sockets' }[m[1]]
    || m[1].replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const v = m[3].replace(/"/g, '');
  return { '>=': `${what} ${v} or higher`, '<=': `${what} ${v} or lower`, '>': `${what} above ${v}`, '<': `${what} below ${v}` }[m[2]] || `${what} ${v}`;
}

async function setTierShown(ti, action) {
  try {
    await call('tiers:action', { key: ti.key, action });
    toast(`${ti.label}, ${window.TierNames.tierName({ tier: ti.tier, type: ti.type })}: ${action === 'Hide' ? 'hidden' : 'shown'}. Zone or reload the filter in game.`);
    close();
  } catch { /* toast shown */ }
}

async function switchOn(ti) {
  try {
    await call('tiers:action', { key: ti.key, action: 'Show' });
    toast(`${ti.label}: tier switched on. Zone or reload the filter in game.`);
    close();
  } catch { /* toast shown */ }
}

/** "+ My bases": this base, from item level X (default: this item's), for the rarities you tick. */
function openMyBase(box) {
  const item = current.item;
  const base = item.baseType || item.typeLine;
  const ORDER = ['Normal', 'Magic', 'Rare'];
  const boxes = Object.fromEntries(ORDER.map((r) => [r, h('input', { type: 'checkbox', checked: true })]));
  const min = h('input', { type: 'number', min: 1, max: 100, value: item.itemLevel || '', placeholder: 'Any', style: { width: '64px' }, 'aria-label': 'Lowest item level' });
  const max = h('input', { type: 'number', min: 1, max: 100, placeholder: 'Any', style: { width: '64px' }, 'aria-label': 'Highest item level' });
  const save = h('button', { class: 'primary' }, `Add ${base}`);
  save.onclick = async () => {
    const rarities = ORDER.filter((r) => boxes[r].checked);
    if (!rarities.length) return toast('Tick at least one rarity.');
    try {
      await call('bases:add', { text: current.text, ilvlMin: min.value || null, ilvlMax: max.value || null, rarities });
      toast(`${base} added to My bases. Zone or reload the filter in game.`);
      box.style.display = 'none';
      fit();
    } catch { /* toast */ }
  };
  box.style.display = '';
  mount(box,
    h('div', { class: 't' }, `Add ${base} to My bases`),
    h('div', { class: 'row small', style: { gap: '8px' } },
      h('span', { class: 'muted' }, 'Item level'), min, h('span', { class: 'muted' }, 'to'), max,
      h('button', { class: 'quiet sm', onclick: () => { min.value = 82; } }, '82+'),
      h('button', { class: 'quiet sm', onclick: () => { min.value = 86; } }, '86+')),
    h('div', { class: 'row', style: { gap: '12px' } }, ORDER.map((r) => h('label', { class: `check small r-${r}` }, boxes[r], r))),
    h('div', { class: 'small faint' }, 'Shown above all your other tiers with the My bases look. Edit it under Loot filter → My bases.'),
    h('div', { class: 'row' }, save, h('button', { class: 'quiet', onclick: () => { box.style.display = 'none'; fit(); } }, 'Cancel')));
  fit();
  min.focus();
}

/** Hide / Highlight form: which rarities and which item levels the rule covers. */
function openQuick(kind, box) {
  const item = current.item;
  const base = item.baseType || item.typeLine;
  const ORDER = ['Normal', 'Magic', 'Rare'];
  const unique = item.rarity === 'Unique';
  const plain = ORDER.includes(item.rarity);
  const defaults = !plain ? [] : kind === 'hide' ? ORDER.slice(0, ORDER.indexOf(item.rarity) + 1) : [item.rarity];
  const boxes = Object.fromEntries(ORDER.map((r) => [r, h('input', { type: 'checkbox', checked: defaults.includes(r) })]));
  const min = h('input', { type: 'number', min: 1, max: 100, placeholder: 'Any', style: { width: '64px' } });
  const max = h('input', { type: 'number', min: 1, max: 100, placeholder: 'Any', style: { width: '64px' } });
  const save = h('button', { class: 'primary' });
  const label = () => {
    const picked = ORDER.filter((r) => boxes[r].checked);
    const rw = plain && picked.length && picked.length < 3 ? picked.map((r) => r.toLowerCase()).join('/') + ' ' : plain && picked.length === 3 ? 'all ' : '';
    const lv = min.value && max.value ? ` ${min.value}-${max.value}` : min.value ? ` ${min.value}+` : max.value ? ` up to ${max.value}` : '';
    save.textContent = `${kind === 'hide' ? 'Hide' : 'Highlight'} ${rw}${base}${lv ? ', ilvl' + lv : ''}`;
    save.disabled = plain && !picked.length;
  };
  [...Object.values(boxes), min, max].forEach((x) => x.addEventListener('input', label));
  save.onclick = async () => {
    const opts = { rarities: unique ? ['Unique'] : plain ? ORDER.filter((r) => boxes[r].checked) : null, ilvlMin: min.value || null, ilvlMax: max.value || null };
    try {
      const r = await call('filter:quick', { kind, text: current.text, opts });
      toast(r.target ? `"${r.rule.label}" saved. Zone or reload the filter in game.` : `"${r.rule.label}" saved. Pick your filter in the app to use it.`);
      box.style.display = 'none';
      fit();
    } catch { /* toast */ }
  };
  label();
  box.style.display = '';
  mount(box,
    h('div', { class: 't' }, kind === 'hide' ? `Hide ${base} for` : `Highlight ${base} for`),
    plain ? h('div', { class: 'row', style: { gap: '12px' } }, ORDER.map((r) => h('label', { class: `check small r-${r}` }, boxes[r], r))) : null,
    h('div', { class: 'row small', style: { gap: '8px' } },
      h('span', { class: 'muted' }, 'Item level'), min, h('span', { class: 'muted' }, 'to'), max,
      item.itemLevel ? h('button', { class: 'quiet sm', onclick: () => { min.value = item.itemLevel; label(); } }, `From ${item.itemLevel} (this one)`) : null),
    h('div', { class: 'row' }, save, h('button', { class: 'quiet', onclick: () => { box.style.display = 'none'; fit(); } }, 'Cancel')));
  fit();
  min.focus();
}

async function quick(kind) {
  try {
    const r = await call('filter:quick', { kind, text: current.text });
    toast(r.target ? `${r.rule.label}: saved. Zone or reload the filter in game.` : `${r.rule.label}: saved. Pick a base filter in the app to write it.`);
  } catch { /* toast shown */ }
}

async function openTrade(box) {
  box.style.display = '';
  await window.TradePanel.mount(box, { text: current.text, divine: current.price?.divine, onFit: fit });
}

// your recordings of the game's drop sounds, so ▶ works for "Game sound N" here too
let gameSoundsLoaded = false;
window.poe.on('overlay:show', (p) => {
  if (!gameSoundsLoaded) {
    gameSoundsLoaded = true;
    window.poe.call('state:get').then((st) => window.UI.setGameSounds(window.UI.gameSoundMap(st?.settings))).catch(() => { gameSoundsLoaded = false; });
  }
  render(p);
});
