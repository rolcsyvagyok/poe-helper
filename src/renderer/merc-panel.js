'use strict';
/* Mercenary Warrant price check, laid out like Awakened PoE Trade's warrant filters: your skills (primary ones
   always searched, secondary and utility ones yours to tick, weak "brick" skills marked), each with its
   supports (searched on that skill, at their tier or better), "all 5 supports" for a full skill, and your
   build's skills yours lacks to rule out. Each support also shows what ticking it does to the cheapest
   match and how many of the 20 cheapest have it. */
(function () {
  const { h, mount, call } = window.UI;
  const fmt = (c) => (c == null ? '–' : c >= 100 ? `${Math.round(c)}c` : `${Math.round(c * 10) / 10}c`);
  const TAG = { primary: 'Primary', secondary: 'Secondary', utility: 'Utility', brick: 'Brick' };
  const TAG_TIP = { primary: 'Every warrant of this build has it: always searched', secondary: 'Differs between warrants of this build', utility: 'An aura, movement or other helper skill', brick: 'A weak skill for this build: warrants with it sell for less' };

  async function mount_(box, { text, onFit }) {
    const st = { choices: {}, open: {}, busy: false, d: null, error: null };
    const run = async () => {
      st.busy = true; draw();
      try { st.d = await call('merc:analyze', { text, choices: st.choices }); st.error = null; } catch (e) { st.error = e.message; }
      st.busy = false; draw();
    };
    // the current ticks as choices
    const sync = () => {
      const d = st.d;
      st.choices = {
        level: d.levelOn,
        skills: Object.fromEntries(d.skills.filter((s) => s.id).map((s) => [s.id, { on: s.on, full: !!s.full?.on, t3: s.full?.t3on, sup: Object.fromEntries(s.supports.filter((x) => x.id).map((x) => [x.id, x.on])) }])),
        not: Object.fromEntries(d.missing.map((x) => [x.id, x.on])),
      };
    };
    const change = (fn) => { sync(); fn(st.choices); run(); };
    const icon = (url) => (url ? h('img', { class: 'mp-ico', src: url, alt: '', loading: 'lazy' }) : h('span', { class: 'mp-ico' }));
    const tag = (t) => h('span', { class: `mp-tag mp-${t}`, title: TAG_TIP[t] || '' }, TAG[t] || t);
    const pips = (t) => h('span', { class: 'mp-pips', title: `Tier ${t}`, 'aria-label': `Tier ${t}` }, [1, 2, 3].map((i) => h('i', { class: i <= (t || 0) ? 'on' : '' })), h('b', {}, ` T${t || '?'}`));

    function skillRow(s) {
      const open = st.open[s.name] ?? (s.on && s.supports.length > 0);
      const nOn = s.supports.filter((x) => x.on).length;
      return h('div', { class: 'mp-skill' + (s.on ? ' on' : '') },
        h('div', { class: 'mp-row' },
          h('input', { type: 'checkbox', checked: s.on, disabled: s.type === 'primary' || !s.id || st.busy, title: s.type === 'primary' ? 'Always searched: every warrant of this build has it' : 'Search warrants with this skill', onchange: () => change((c) => { c.skills[s.id].on = !s.on; }) }),
          icon(s.icon), h('span', { class: 'mp-name' }, s.name), tag(s.type),
          s.supports.length ? h('button', { class: 'quiet sm mp-more', 'aria-expanded': open ? 'true' : 'false', onclick: () => { st.open[s.name] = !open; draw(); } }, `${nOn}/${s.supports.length} ${open ? '▾' : '▸'}`) : h('span', { class: 'faint small mp-more' }, 'no supports')),
        open ? h('div', { class: 'mp-sups' },
          s.supports.map((x) => h('label', { class: 'mp-sup' + (x.on ? ' on' : '') + (x.id ? '' : ' unknown'),
            title: !x.id ? 'Not in the trade site\'s list' : x.on ? `Only warrants with ${x.name} (Tier ${x.tier} or better) on ${s.name}` : x.count ? `${x.count} of the ${st.d.sample} cheapest have it on ${s.name}; the cheapest of those: ${fmt(st.d.cheapest + x.delta)}` : `None of the ${st.d.sample} cheapest have it on ${s.name}` },
            h('input', { type: 'checkbox', checked: x.on, disabled: !x.id || st.busy, onchange: () => change((c) => { c.skills[s.id].on = true; c.skills[s.id].sup[x.id] = !x.on; }) }),
            h('span', { class: 'n' }, x.name), pips(x.tier),
            h('span', { class: 'mp-delta' + (x.delta > 0 ? ' up' : x.delta < 0 ? ' down' : '') }, x.on ? '✓' : x.delta == null ? '' : x.delta === 0 ? '±0' : `${x.delta > 0 ? '+' : '−'}${fmt(Math.abs(x.delta))}`),
            h('span', { class: 'mp-count' + (x.count != null && x.count < 2 ? ' few' : '') }, x.on || x.count == null ? '' : String(x.count)))),
          s.full ? h('label', { class: 'mp-sup mp-full' + (s.full.on ? ' on' : ''), title: `Warrants whose ${s.name} also has 5 of the supports it can roll, at least this many at Tier 3` },
            h('input', { type: 'checkbox', checked: s.full.on, disabled: st.busy, onchange: () => change((c) => { c.skills[s.id].on = true; c.skills[s.id].full = !s.full.on; }) }),
            h('span', { class: 'n' }, 'All 5 supports, Tier 3 at least'),
            h('input', { type: 'number', min: 0, max: 5, value: s.full.t3on, class: 'mp-t3', 'aria-label': 'Tier 3 supports at least', onclick: (e) => e.stopPropagation(), onchange: (e) => change((c) => { c.skills[s.id].on = true; c.skills[s.id].full = true; c.skills[s.id].t3 = Math.max(0, Math.min(5, Number(e.target.value) || 0)); }) }),
            h('span', { class: 'faint small' }, `yours: ${s.full.t3}`)) : null) : null);
    }

    function draw() {
      const d = st.d;
      if (!d && st.busy) { mount(box, h('div', { class: 'mp' }, h('div', { class: 'small muted' }, 'Looking for warrants like yours…'))); return onFit?.(); }
      if (!d) { mount(box, h('div', { class: 'mp' }, h('div', { class: 'small' }, st.error || 'No answer from the trade site.'), h('button', { class: 'quiet sm', onclick: run }, 'Try again'))); return onFit?.(); }
      mount(box, h('div', { class: 'mp' + (st.busy ? ' busy' : '') },
        h('div', { class: 'mp-head' },
          h('div', {}, h('div', { class: 'mp-k' }, 'Matching'), h('div', { class: 'mp-v' }, String(d.total))),
          h('div', {}, h('div', { class: 'mp-k' }, 'Cheapest'), h('div', { class: 'mp-v' }, fmt(d.cheapest))),
          h('span', { class: 'spacer' }),
          h('button', { class: 'sm', onclick: () => call('shell:open', d.url) }, 'Open on trade site')),
        h('div', { class: 'small muted mp-why' }, h('b', {}, d.build || 'Mercenary'), d.name ? ` · ${d.name}` : '', d.level ? ` · level ${d.level}` : '',
          d.buildKnown ? '' : ' · (this build isn\'t in the list yet: every skill counts as secondary)', d.typeFound ? '' : ' · (other builds are in too)'),
        st.error ? h('div', { class: 'small mp-err' }, st.error) : null,
        h('div', { class: 'mp-sec' }, 'Skills'),
        h('div', { class: 'mp-list' }, d.skills.map(skillRow)),
        d.missing.length ? [h('div', { class: 'mp-sec' }, 'Leave out warrants with'),
          h('div', { class: 'mp-list' }, d.missing.map((x) => h('label', { class: 'mp-row mp-not' + (x.on ? ' on' : '') },
            h('input', { type: 'checkbox', checked: x.on, disabled: st.busy, onchange: () => change((c) => { c.not[x.id] = !x.on; }) }),
            icon(x.icon), h('span', { class: 'mp-name' }, x.name), tag(x.type))))] : null,
        d.level ? h('label', { class: 'mp-row mp-level' }, h('input', { type: 'checkbox', checked: d.levelOn, disabled: st.busy, onchange: () => change((c) => { c.level = !d.levelOn; }) }), h('span', { class: 'mp-name' }, `Mercenary level ${d.level} or more`)) : null,
        h('div', { class: 'small faint' }, `Supports: what ticking it does to the cheapest match, and how many of the ${d.sample} cheapest have it on that skill. Asking prices, not what yours is worth.`)));
      onFit?.();
    }
    await run();
  }

  window.MercPanel = { mount: mount_ };
})();
