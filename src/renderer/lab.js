'use strict';
/* Daily lab: today's Labyrinth layout from poelab.com, in its own always-on-top window (hotkey)
   and on the Daily lab page of the main window. */
(() => {
  const { h, mount, call, toast } = window.UI;
  const DIFFS = [['normal', 'Normal', 33], ['cruel', 'Cruel', 55], ['merciless', 'Merciless', 68], ['uber', 'Uber', 75]];

  /** One layout viewer: picker, then the picture. opts.overlay: the in-game window. */
  function createViewer(root, { overlay = false } = {}) {
    let current = null; // { diff, ... }
    let zoom = false;
    let busy = false;
    let favorite = null;
    let recheck = null;
    const nameOf = (id) => DIFFS.find((d) => d[0] === id)?.[1] || id;
    const setFavorite = async (id) => {
      favorite = await call('lab:favorite', favorite === id ? null : id);
      toast(favorite ? `${nameOf(favorite)} is your favourite: the hotkey opens it straight away` : 'No favourite: the hotkey asks which lab every time');
      if (current) showPicture(); else picker(id);
    };

    const pickButtons = (last) => h('div', { class: 'lab-pick' },
      h('div', { class: 'lab-pick-title' }, 'Which labyrinth?'),
      h('div', { class: 'lab-pick-row' }, DIFFS.map(([id, name, lvl], i) => h('div', { class: 'lab-pick-cell' },
        h('button', { class: 'lab-pick-btn' + (id === last ? ' last' : ''), onclick: () => load(id) },
          h('span', { class: 'k' }, String(i + 1)), h('span', { class: 'n' }, name), h('span', { class: 'l' }, `area level ${lvl}`)),
        h('button', { class: 'quiet sm lab-fav' + (favorite === id ? ' on' : ''), title: favorite === id ? 'Your favourite: the hotkey opens it straight away. Click to stop.' : `Make ${name} your favourite: the hotkey then opens it straight away`, onclick: () => setFavorite(id) }, favorite === id ? '★ Favourite' : '☆ Favourite')))),
      h('div', { class: 'small faint' }, overlay ? 'Press 1-4, or Enter for the last one. Esc or the hotkey hides this. Pick a favourite and the hotkey opens it straight away.' : 'Layouts from poelab.com, updated daily after the reset at midnight UTC.'));

    const header = () => h('div', { class: 'lab-head' + (overlay ? ' drag' : '') },
      h('b', {}, current ? `${current.name} labyrinth` : 'Daily lab'),
      current ? h('span', { class: 'small muted' }, current.date, current.stale ? h('span', { class: 'lab-stale' }, ' · not today\'s') : null) : null,
      current ? h('button', { class: 'sm quiet nodrag lab-fav' + (favorite === current.diff ? ' on' : ''), title: favorite === current.diff ? 'Your favourite lab. Click to stop.' : `Make ${current.name} your favourite: the hotkey opens it straight away`, onclick: () => setFavorite(current.diff) }, favorite === current.diff ? '★' : '☆') : null,
      h('span', { class: 'spacer' }),
      h('div', { class: 'lab-diffs nodrag' }, DIFFS.map(([id, name], i) => h('button', { class: 'sm' + (current?.diff === id ? ' on' : ''), title: `${name} (${i + 1})`, onclick: () => load(id) }, name))),
      current ? h('button', { class: 'sm quiet nodrag', title: 'Look for a newer layout on poelab (R)', onclick: () => load(current.diff, true) }, '↻') : null,
      overlay ? h('input', { class: 'nodrag lab-op', type: 'range', min: 30, max: 100, value: Math.round((window.labOpacity || 1) * 100), title: 'See-through', 'aria-label': 'Opacity', oninput: (e) => call('lab:opacity', e.target.value / 100).then((o) => { window.labOpacity = o; }) }) : null,
      h('button', { class: 'sm quiet nodrag', title: 'Open this on poelab.com', onclick: () => call('shell:open', current?.page || 'https://www.poelab.com/') }, 'poelab ↗'),
      overlay ? h('button', { class: 'sm quiet nodrag', title: 'Hide (Esc)', 'aria-label': 'Hide', onclick: () => call('lab:hide') }, '✕') : null);

    const draw = (bodyEl) => mount(root, header(), bodyEl);

    async function load(diff, refresh = false) {
      if (busy) return;
      busy = true;
      draw(h('div', { class: 'lab-body center' }, h('span', { class: 'spin' }), ` Loading today's ${diff} layout from poelab…`));
      try {
        current = await call('lab:get', { diff, refresh });
        favorite = current.favorite;
        zoom = false;
        showPicture();
        // not uploaded yet: look again every 10 minutes while this lab is open
        clearInterval(recheck);
        if (current.stale) {
          const d = current.diff;
          recheck = setInterval(async () => {
            if (busy || current?.diff !== d) return clearInterval(recheck);
            try { const r = await call('lab:get', { diff: d, refresh: true }); if (!r.stale) { clearInterval(recheck); current = r; favorite = r.favorite; showPicture(); toast(`Today's ${r.name} layout is up`); } } catch { /* try next time */ }
          }, 10 * 60000);
        }
      } catch (e) {
        draw(h('div', { class: 'lab-body center' }, h('p', { class: 'bad' }, e.message), h('button', { class: 'sm', onclick: () => load(diff, true) }, 'Try again')));
      } finally { busy = false; }
    }

    function showPicture() {
      const img = h('img', { src: current.dataUrl, alt: `${current.name} labyrinth layout for ${current.date}`, class: zoom ? 'zoom' : '', draggable: 'false' });
      const box = h('div', { class: 'lab-body lab-img' + (zoom ? ' zoomed' : ''), title: zoom ? 'Click to fit the window' : 'Click to see it full size', onclick: () => { zoom = !zoom; showPicture(); } }, img);
      // poelab posts each day's layouts some time after the reset at midnight UTC
      const resetLocal = new Date(`${current.today}T00:00:00Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const banner = current.stale ? h('div', { class: 'lab-notyet' },
        h('b', {}, `Today's ${current.name} layout isn't uploaded yet.`),
        ` poelab posts it some time after the daily reset (${resetLocal} your time). This is the one from ${current.date}, so it may not match. Checking again every 10 minutes.`,
        h('button', { class: 'sm quiet', onclick: (e) => { e.stopPropagation(); load(current.diff, true); } }, 'Check now')) : null;
      draw(h('div', { class: 'lab-wrap' }, banner, box, h('div', { class: 'lab-credit small faint' }, 'Layout by poelab.com')));
    }

    function picker(last) { current = null; clearInterval(recheck); draw(h('div', { class: 'lab-body center' }, pickButtons(last))); }
    const setFav = (f) => { favorite = f || null; };

    root.addEventListener('keydown', () => {});
    return { load, picker, setFav, get current() { return current; } };
  }

  /** The in-game window. */
  function mountOverlay(root) {
    const v = createViewer(root, { overlay: true });
    let last = 'uber';
    window.poe.on('lab:pick', ({ diff, last: l } = {}) => { last = l || last; if (diff) v.load(diff); else v.picker(last); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return call('lab:hide');
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) return v.load(DIFFS[i][0]);
      if (e.key === 'Enter' && !v.current) return v.load(last);
      if ((e.key === 'r' || e.key === 'R') && v.current) return v.load(v.current.diff, true);
    });
    call('state:get').then((s) => { window.UI.applyTheme(s.settings.uiTheme); window.labOpacity = s.settings.labOpacity || 1; last = s.settings.labLast || last; v.setFav(s.settings.labFavorite); v.picker(last); }).catch(() => v.picker(last));
  }

  /** The Daily lab page in the main window. */
  async function renderLabPage() {
    const page = document.getElementById('page-lab');
    const s = (await call('state:get')).settings;
    const viewerRoot = h('div', { class: 'lab lab-inpage' });
    const hk = window.Hotkey ? window.Hotkey.label(s.hotkeyLab) : s.hotkeyLab;
    mount(page,
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'baseline' } },
        h('h1', {}, 'Daily lab'),
        h('div', { class: 'row', style: { gap: '8px' } },
          h('span', { class: 'small muted' }, !s.hotkeyLab ? 'Set a hotkey in Settings to show it in game' : s.labFavorite ? `In game: press ${hk} (opens your favourite)` : `In game: press ${hk}, then 1-4`),
          h('button', { class: 'primary sm', onclick: () => call('lab:show', viewer.current?.diff || s.labLast) }, 'Show in game overlay'))),
      h('p', { class: 'muted' }, "Today's Labyrinth layout for each difficulty, from poelab.com. Each picture is fetched once a day and kept, so it opens instantly after that."),
      viewerRoot);
    const viewer = createViewer(viewerRoot);
    viewer.setFav(s.labFavorite);
    viewer.load(s.labFavorite || s.labLast || 'uber');
  }

  window.LabView = { createViewer, mountOverlay, renderLabPage };
  if (document.body.classList.contains('labwin')) mountOverlay(document.getElementById('lab'));
})();
