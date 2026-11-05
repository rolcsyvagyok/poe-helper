'use strict';
/* "What to farm": poe.ninja's 7-day trends grouped by league mechanic, plus the price history popup.
   Everything comes from poe.ninja (cached like the price check); nothing here asks GGG. */
(() => {
  const { h, mount, chaosDiv, ago, call, toast } = window.UI;

  const pct = (c) => (c == null ? '' : `${c > 0 ? '+' : ''}${Math.abs(c) >= 100 ? Math.round(c) : c.toFixed(1).replace(/\.0$/, '')}%`);
  const trendClass = (c) => (c == null ? 'flat' : c >= 100 ? 'up big' : c <= -50 ? 'down big' : c > 2 ? 'up' : c < -2 ? 'down' : 'flat');
  const trendBadge = (c, title) => (c == null ? null : h('span', { class: `trend ${trendClass(c)}`, title: title || 'Change over the last 7 days on poe.ninja' }, pct(c)));

  /** The price history popup for one item: { name, chaos, old, change, points: [{ts, chaos}] } */
  function priceGraph(item, divine) {
    if (!item?.points?.length) return toast(`poe.ninja has no price history for ${item?.name || 'this item'} yet.`, true);
    document.querySelector('.ph-back')?.remove();
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const lo = Math.min(...item.points.map((p) => p.chaos));
    const hi = Math.max(...item.points.map((p) => p.chaos));
    const back = h('div', { class: 'ph-back', onclick: (e) => { if (e.target === back) close(); } },
      h('div', { class: 'ph-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Price history of ${item.name}` },
        h('div', { class: 'ph-head' },
          item.icon ? h('img', { src: item.icon, alt: '', width: 36, height: 36 }) : null,
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('div', { class: 'ph-name' }, item.name),
            h('div', { class: 'small muted' }, `${chaosDiv(item.old, divine)} a week ago → ${chaosDiv(item.chaos, divine)} now `, trendBadge(item.change))),
          h('button', { class: 'quiet sm', 'aria-label': 'Close', onclick: close }, '✕')),
        window.lineChart(item.points, { divine, height: 220 }),
        h('div', { class: 'small faint' }, `Last 7 days on poe.ninja. Lowest ${chaosDiv(lo, divine)}, highest ${chaosDiv(hi, divine)}.`)));
    document.addEventListener('keydown', onKey);
    document.body.append(back);
    back.querySelector('button').focus();
  }

  const graphButton = (item, divine, label = 'Graph') => h('button', {
    class: 'sm quiet ph-btn', title: `Price history of ${item.name}`, 'aria-label': `Price history of ${item.name}`,
    disabled: !item.points?.length, onclick: (e) => { e.stopPropagation(); priceGraph(item, divine); },
  }, '📈 ', label);

  let farm = null;
  let loading = false;
  let showAllMovers = false;

  async function renderFarm(force = false) {
    const page = document.getElementById('page-farm');
    if (!farm || force) {
      if (loading) return;
      loading = true;
      mount(page, h('h1', {}, 'What to farm'), h('p', { class: 'muted' }, h('span', { class: 'spin' }), ' Reading poe.ninja prices…'));
      try { farm = await call('farm:dashboard'); } catch (e) { loading = false; return mount(page, h('h1', {}, 'What to farm'), h('p', { class: 'bad' }, `Couldn't load prices: ${e.message}`)); }
      loading = false;
    }
    const d = farm.divine;
    const itemLine = (r) => h('li', { class: 'farm-item', onclick: () => priceGraph(r, d), title: r.points?.length ? 'Click for the price history' : '' },
      r.icon ? h('img', { src: r.icon, alt: '', width: 22, height: 22, loading: 'lazy' }) : h('span', { class: 'farm-noimg' }),
      h('span', { class: 'n' }, r.name),
      h('span', { class: 'p' }, chaosDiv(r.chaos, d)),
      trendBadge(r.change));

    const movers = farm.movers.length
      ? h('div', { style: { overflowX: 'auto' } }, h('table', { class: 'farm-movers' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Mechanic'), h('th', { class: 'r' }, 'A week ago'), h('th', { class: 'r' }, 'Now'), h('th', { class: 'r' }, 'Change'), h('th', {}))),
        h('tbody', {}, (showAllMovers ? farm.movers : farm.movers.slice(0, 10)).map((r) => h('tr', { class: r.change > 0 ? 'rise' : 'fall' },
          h('td', {}, h('span', { class: 'row', style: { gap: '8px', flexWrap: 'nowrap' } }, r.icon ? h('img', { src: r.icon, alt: '', width: 22, height: 22, loading: 'lazy' }) : null, r.name)),
          h('td', { class: 'small muted' }, r.group),
          h('td', { class: 'r small muted' }, chaosDiv(r.old, d)),
          h('td', { class: 'r' }, chaosDiv(r.chaos, d)),
          h('td', { class: 'r' }, trendBadge(r.change)),
          h('td', { class: 'r' }, graphButton(r, d)))))))
      : h('p', { class: 'muted' }, 'Nothing doubled or halved in price this week.');

    const card = (g) => h('div', { class: 'farm-card' },
      h('div', { class: 'farm-card-head' },
        g.top[0]?.icon ? h('img', { src: g.top[0].icon, alt: '', width: 30, height: 30 }) : null,
        h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'farm-card-name' }, g.name), h('div', { class: 'small faint' }, `${g.count} items · typical item ${chaosDiv(g.typical, d)}`)),
        trendBadge(g.change, 'How the whole mechanic moved this week, weighted by how much of each item trades')),
      h('div', { class: 'small muted farm-sub' }, 'Most valuable'),
      h('ul', { class: 'farm-list' }, g.top.map(itemLine)),
      g.up.length ? [h('div', { class: 'small muted farm-sub' }, 'Rising'), h('ul', { class: 'farm-list' }, g.up.map(itemLine))] : null,
      g.down.length ? [h('div', { class: 'small muted farm-sub' }, 'Falling'), h('ul', { class: 'farm-list' }, g.down.map(itemLine))] : null);

    mount(page,
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'baseline' } },
        h('h1', {}, 'What to farm'),
        h('button', { class: 'sm', onclick: () => renderFarm(true) }, 'Refresh')),
      h('p', { class: 'muted' }, `poe.ninja prices for ${farm.league} over the last 7 days, updated ${ago(farm.ageMs)}. Mechanics are sorted by how much their loot gained in value. Click any item for its price history.`),
      h('h2', {}, 'By league mechanic'),
      h('div', { class: 'farm-grid' }, farm.groups.map(card)),
      h('h2', {}, 'Big price changes'),
      h('p', { class: 'small faint' }, 'Items worth at least 1c that doubled (+100% or more) or halved (−50% or more) this week.'),
      movers,
      farm.movers.length > 10 ? h('button', { class: 'sm quiet', style: { margin: '8px 0 60px' }, onclick: () => { showAllMovers = !showAllMovers; renderFarm(); } }, showAllMovers ? 'Show fewer' : `Show all ${farm.movers.length}`) : null);
  }

  window.Farm = { renderFarm, priceGraph, graphButton, trendBadge, pct };
})();
