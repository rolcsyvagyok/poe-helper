'use strict';
/* Mercenary Warrant price check: your mercenary against the listed ones like it. Tick a skill or support to
   compare against closer listings; each support row shows what ticking it does to the cheapest match and how
   many of the cheapest listings have it. */
(function () {
  const { h, mount, call } = window.UI;
  const fmt = (c) => (c == null ? '–' : c >= 100 ? `${Math.round(c)}c` : `${Math.round(c * 10) / 10}c`);

  async function mount_(box, { text, onFit }) {
    const st = { on: null, busy: false, data: null, error: null };
    const run = async () => {
      st.busy = true; draw();
      try { st.data = await call('merc:analyze', { text, on: st.on }); st.error = null; } catch (e) { st.error = e.message; }
      st.busy = false; draw();
    };
    const toggle = (kind, id) => {
      const d = st.data;
      if (!d) return;
      st.on = st.on || { skills: d.skills.filter((s) => s.on).map((s) => s.id), supports: d.skills.flatMap((s) => s.supports.filter((x) => x.on).map((x) => x.id)) };
      const list = st.on[kind];
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.push(id);
      run();
    };
    function card(s) {
      return h('div', { class: 'mp-card' + (s.on ? ' on' : '') },
        h('label', { class: 'mp-skill' }, h('input', { type: 'checkbox', checked: s.on, disabled: !s.id || st.busy, onchange: () => toggle('skills', s.id) }), h('b', {}, s.name),
          h('span', { class: 'faint small' }, s.supports.length ? `${s.supports.filter((x) => x.on).length}/${s.supports.length}` : 'no supports')),
        s.supports.map((x) => h('label', { class: 'mp-sup' + (x.on ? ' on' : '') + (x.id ? '' : ' unknown'), title: x.id ? (x.on ? 'Ticked: only listings with this support count' : x.count ? `${x.count} of the ${st.data.sample} cheapest have it; the cheapest of those is ${fmt(st.data.cheapest + x.delta)}` : `None of the ${st.data.sample} cheapest have it`) : 'The trade site doesn\'t list this support' },
          h('input', { type: 'checkbox', checked: x.on, disabled: !x.id || st.busy, onchange: () => toggle('supports', x.id) }),
          h('span', { class: 'n' }, x.name, x.tier ? h('span', { class: 'mp-tier' }, ` T${x.tier}`) : null),
          h('span', { class: 'mp-delta' + (x.delta > 0 ? ' up' : x.delta < 0 ? ' down' : '') }, x.on ? '✓' : x.delta == null ? '' : x.delta === 0 ? '0' : `${x.delta > 0 ? '+' : '−'}${fmt(Math.abs(x.delta))}`),
          h('span', { class: 'mp-count' + (x.count != null && x.count < 2 ? ' few' : '') }, x.on ? '' : x.count == null ? '' : String(x.count)))));
    }
    function draw() {
      const d = st.data;
      if (!d && st.busy) { mount(box, h('div', { class: 'mp' }, h('div', { class: 'small muted' }, 'Looking for warrants like yours…'))); return onFit?.(); }
      if (!d) { mount(box, h('div', { class: 'mp' }, h('div', { class: 'small' }, st.error || 'No answer from the trade site.'), h('button', { class: 'quiet sm', onclick: run }, 'Try again'))); return onFit?.(); }
      mount(box, h('div', { class: 'mp' + (st.busy ? ' busy' : '') },
        h('div', { class: 'mp-head' },
          h('div', {}, h('div', { class: 'mp-k' }, 'Matching listings'), h('div', { class: 'mp-v' }, String(d.total))),
          h('div', {}, h('div', { class: 'mp-k' }, 'Cheapest listed'), h('div', { class: 'mp-v' }, fmt(d.cheapest))),
          h('span', { class: 'spacer' }),
          h('button', { class: 'sm', onclick: () => call('shell:open', d.url) }, 'Open on trade site')),
        h('div', { class: 'small muted mp-why' }, 'Your ', h('b', {}, d.build || 'mercenary'), d.name ? ` ${d.name}` : '', `, against every listed one with the skills${countOn(d) ? ` and ${countOn(d)} support${countOn(d) === 1 ? '' : 's'}` : ''} ticked. Tick more of what yours has to compare against closer listings. Each support shows what ticking it does to the cheapest match, and how many of the ${d.sample} cheapest have it.`,
          d.typeFound ? '' : ' (The trade site didn\'t know this build, so other builds are in too.)'),
        st.error ? h('div', { class: 'small mp-err' }, st.error) : null,
        h('div', { class: 'mp-cards' }, d.skills.map(card)),
        h('div', { class: 'small faint' }, 'Asking prices, not what yours is worth: no two mercenaries are alike.')));
      onFit?.();
    }
    const countOn = (d) => d.skills.reduce((n, s) => n + s.supports.filter((x) => x.on).length, 0);
    await run();
  }

  window.MercPanel = { mount: mount_ };
})();
