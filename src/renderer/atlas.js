'use strict';
/* Atlas strategies: your farms, each with an atlas tree (imported from a link), the threads and map kind it uses,
   and what its WealthyExile sessions earned. The tree is GGG's atlas tree data, drawn here; node pictures come
   from web.poecdn.com like every other game picture in the app. */
(() => {
  const { h, mount, call, toast, chaosDiv } = window.UI;

  const agoDays = (t) => { const d = Math.floor((Date.now() - t) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
  const A = { tree: null, list: null, threads: null, sel: null, hoverCat: null, error: null, views: {}, edit: {}, undo: {} };

  // ---------- the tree ----------
  const SIZE = { normal: 34, notable: 50, keystone: 74, wormhole: 60, mastery: 0 };
  const sheetImg = new Map();
  function sheet(url, redraw) {
    if (!sheetImg.has(url)) {
      const img = new Image();
      img.onload = () => redraw?.();
      img.src = url;
      sheetImg.set(url, img);
    }
    const img = sheetImg.get(url);
    return img.complete && img.naturalWidth ? img : null;
  }

  /**
   * The tree on a canvas: drag to move, wheel to zoom, hover a passive for what it does.
   * opts: { picked: Set, choices: {id: i}, highlight: () => Set|null, onChoose(id, i),
   *         edit: () => bool (clicks take and remove passives), onChange(nodes), view: {} kept between redraws }
   */
  function treeCanvas(T, opts) {
    const wrap = h('div', { class: 'at-tree' });
    const canvas = h('canvas', { 'aria-label': 'Atlas passive tree' });
    const tip = h('div', { class: 'at-tip', hidden: true });
    const menu = h('div', { class: 'at-menu', hidden: true });
    const zoomBtns = h('div', { class: 'at-zoom' },
      h('button', { class: 'sm', 'aria-label': 'Zoom in', onclick: () => zoomAt(1.4) }, '+'),
      h('button', { class: 'sm', 'aria-label': 'Zoom out', onclick: () => zoomAt(1 / 1.4) }, '−'),
      h('button', { class: 'sm', title: 'Show the whole tree', onclick: () => { fit(); draw(); } }, 'Fit'));
    const count = h('div', { class: 'at-count' });
    wrap.append(canvas, tip, menu, zoomBtns, count);
    const byId = new Map(T.nodes.map((n) => [n.id, n]));
    const view = opts.view || { x: 0, y: 0, s: 0.05 };
    let hover = null;
    let preview = null; // { add: Set } or { remove: Set } for the passive under the mouse while editing
    const picked = () => opts.picked();
    const editing = () => !!opts.edit?.();
    const points = () => [...picked()].filter((id) => byId.get(id)?.kind !== 'mastery').length;

    // the links between passives, gateways included, for paths
    const adj = new Map();
    for (const [a, b] of T.links || T.edges.map((e) => [e.a, e.b])) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b); adj.get(b).push(a);
    }
    // the shortest way from what you have to a passive: the passives it would take
    function pathTo(target) {
      const P = picked();
      const from = [T.start, ...P];
      const prev = new Map(from.map((id) => [id, null]));
      const queue = [...from];
      for (let i = 0; i < queue.length; i++) {
        const cur = queue[i];
        if (cur === target) break;
        for (const nx of adj.get(cur) || []) {
          if (prev.has(nx) || byId.get(nx)?.kind === 'mastery') continue;
          prev.set(nx, cur); queue.push(nx);
        }
      }
      if (!prev.has(target)) return null;
      const path = [];
      for (let id = target; id != null && !P.has(id) && id !== T.start; id = prev.get(id)) path.push(id);
      return path;
    }
    // taking a passive away also takes away what is only linked through it
    function removing(id) {
      const P = new Set(picked()); P.delete(id);
      const keep = new Set([T.start]); const queue = [T.start];
      for (let i = 0; i < queue.length; i++) for (const nx of adj.get(queue[i]) || []) if (P.has(nx) && !keep.has(nx)) { keep.add(nx); queue.push(nx); }
      return new Set([...picked()].filter((x) => !keep.has(x)));
    }
    function setPreview(n) {
      preview = null;
      if (!editing() || !n || n.id === T.start || n.kind === 'mastery') return;
      if (picked().has(n.id)) preview = { remove: removing(n.id) };
      else { const p = pathTo(n.id); if (p) preview = { add: new Set(p) }; }
    }
    function change(next) {
      const P = picked();
      P.clear(); for (const id of next) P.add(id);
      opts.onChange?.([...P]);
      draw();
    }
    function clickNode(n, ev) {
      if (!n || n.id === T.start) return;
      const P = picked();
      if (!editing()) { if (n.variants.length && P.has(n.id) && opts.onChoose) showMenu(n, ev); return; }
      if (P.has(n.id)) {
        if (n.variants.length && opts.onChoose) return showMenu(n, ev, true);
        const gone = removing(n.id);
        change([...P].filter((x) => !gone.has(x)));
      } else {
        const p = pathTo(n.id);
        if (!p) return;
        if (points() + p.length > (T.points || 150)) { toast(`That needs ${p.length} more point${p.length === 1 ? '' : 's'}; you have ${(T.points || 150) - points()} left.`, true); return; }
        change([...P, ...p]);
        if (n.variants.length && opts.onChoose) showMenu(n, ev, true);
      }
      setPreview(n);
    }

    function fit() {
      const r = canvas.getBoundingClientRect();
      const ids = [...picked()];
      const pts = (ids.length ? ids.map((id) => byId.get(id)).filter(Boolean) : T.nodes).filter((n) => n.kind !== 'mastery');
      const xs = pts.map((n) => n.x); const ys = pts.map((n) => n.y);
      const [x0, x1, y0, y1] = [Math.min(...xs) - 300, Math.max(...xs) + 300, Math.min(...ys) - 300, Math.max(...ys) + 300];
      view.s = Math.min(r.width / (x1 - x0), r.height / (y1 - y0));
      view.x = (x0 + x1) / 2; view.y = (y0 + y1) / 2;
    }
    const toScreen = (x, y, r) => [(x - view.x) * view.s + r.width / 2, (y - view.y) * view.s + r.height / 2];
    const toWorld = (sx, sy, r) => [(sx - r.width / 2) / view.s + view.x, (sy - r.height / 2) / view.s + view.y];

    function draw() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
      const c = canvas.getContext('2d');
      c.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * (r.width / 2 - view.x * view.s), dpr * (r.height / 2 - view.y * view.s));
      c.clearRect(view.x - r.width / 2 / view.s, view.y - r.height / 2 / view.s, r.width / view.s, r.height / view.s);
      const P = picked();
      const hl = opts.highlight?.() || null;
      count.textContent = `${points()} / ${T.points || 150} points${editing() ? ' · click passives to take or remove them' : ''}`;
      const ADD = preview?.add; const DEL = preview?.remove;
      const css = getComputedStyle(wrap);
      const col = (v, d) => css.getPropertyValue(v).trim() || d;
      const ON = col('--at-on', '#e8b04a'); const OFF = col('--at-off', '#3a3f4b'); const HL = col('--good', '#5fadff');
      // lines: taken ones bright and thick, the rest thin
      for (const pass of [0, 1]) {
        for (const e of T.edges) {
          const on = P.has(e.a) && P.has(e.b) || (P.has(e.a) && e.b === T.start) || (P.has(e.b) && e.a === T.start);
          const pre = ADD && (ADD.has(e.a) || ADD.has(e.b));
          if ((pass === 1) !== (on || !!pre)) continue;
          c.beginPath();
          if (e.arc) c.arc(e.arc.cx, e.arc.cy, e.arc.r, e.arc.a1, e.arc.a2, e.arc.a2 < e.arc.a1);
          else { const a = byId.get(e.a); const b = byId.get(e.b); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
          const willAdd = !on && ADD && (ADD.has(e.a) || P.has(e.a) || e.a === T.start) && (ADD.has(e.b) || P.has(e.b) || e.b === T.start) && (ADD.has(e.a) || ADD.has(e.b));
          const willGo = on && DEL && (DEL.has(e.a) || DEL.has(e.b));
          c.strokeStyle = willGo ? '#ff8a3d' : willAdd ? '#f2e3c4' : on ? ON : OFF;
          c.lineWidth = Math.max(on || willAdd ? 14 : 6, (on || willAdd ? 2.2 : 1) / view.s); // world units, never thinner than a pixel or two
          if (willAdd || willGo) c.setLineDash([40, 24]);
          c.stroke(); c.setLineDash([]);
        }
      }
      // nodes
      const small = view.s < 0.045; // zoomed far out: plain dots draw faster and read better
      for (const n of T.nodes) {
        if (n.kind === 'mastery') continue;
        const on = P.has(n.id) || n.id === T.start;
        const size = SIZE[n.kind] || 34;
        let drawn = false;
        if (!small) {
          const key = `${n.kind === 'wormhole' ? 'wormhole' : n.kind}${on ? 'Active' : 'Inactive'}`;
          const sh = T.sheets[key];
          const sp = sh?.coords[n.kind === 'wormhole' ? 'Wormhole' : n.icon];
          const img = sp && sheet(sh.url, draw);
          if (img) {
            c.save(); c.beginPath(); c.arc(n.x, n.y, size, 0, Math.PI * 2); c.clip();
            c.drawImage(img, sp.x, sp.y, sp.w, sp.h, n.x - size, n.y - size, size * 2, size * 2);
            c.restore();
            drawn = true;
          }
        }
        if (!drawn) { c.beginPath(); c.arc(n.x, n.y, size * 0.8, 0, Math.PI * 2); c.fillStyle = on ? ON : '#262a33'; c.fill(); }
        // the ring: taken = gold, the category you point at = blue, dashed for choices not made
        const inHl = hl?.has(n.id);
        if (ADD?.has(n.id) || DEL?.has(n.id)) {
          // what a click would do: dashed white = would be taken, dashed orange with a cross = would be removed
          const rr = size + Math.max(8, 3 / view.s);
          c.beginPath(); c.arc(n.x, n.y, rr, 0, Math.PI * 2);
          c.strokeStyle = DEL?.has(n.id) ? '#ff8a3d' : '#f2e3c4'; c.lineWidth = Math.max(10, 2.5 / view.s);
          c.setLineDash([22, 14]); c.stroke(); c.setLineDash([]);
          if (DEL?.has(n.id)) { c.beginPath(); c.moveTo(n.x - size * 0.7, n.y - size * 0.7); c.lineTo(n.x + size * 0.7, n.y + size * 0.7); c.moveTo(n.x + size * 0.7, n.y - size * 0.7); c.lineTo(n.x - size * 0.7, n.y + size * 0.7); c.stroke(); }
        } else if (on || inHl || n.id === hover?.id) {
          // a highlighted group stays easy to see when zoomed out: its ring never gets thinner than 3 pixels
          c.beginPath(); c.arc(n.x, n.y, size + (inHl ? Math.max(10, 4 / view.s) : 6), 0, Math.PI * 2);
          c.strokeStyle = inHl ? HL : n.id === hover?.id && !on ? '#c9ccd3' : ON;
          c.lineWidth = inHl ? Math.max(14, 3 / view.s) : 8;
          if (on && n.variants?.length && opts.choices()[n.id] == null) c.setLineDash([18, 12]);
          c.stroke(); c.setLineDash([]);
        }
        if (n.kind === 'keystone' || (n.kind === 'notable' && on)) {
          if (view.s > 0.11) {
            c.font = `${Math.round(13 / view.s)}px system-ui, sans-serif`; c.textAlign = 'center';
            c.fillStyle = on ? '#f2e3c4' : '#9aa0ab'; c.fillText(n.name, n.x, n.y + size + 18 / view.s);
          }
        }
      }
    }

    function nodeAt(ev) {
      const r = canvas.getBoundingClientRect();
      const [x, y] = toWorld(ev.clientX - r.left, ev.clientY - r.top, r);
      let best = null; let bd = Infinity;
      for (const n of T.nodes) {
        if (n.kind === 'mastery') continue;
        const d = Math.hypot(n.x - x, n.y - y);
        const reach = Math.max((SIZE[n.kind] || 34) + 10, 8 / view.s);
        if (d < reach && d < bd) { best = n; bd = d; }
      }
      return best;
    }

    function showTip(n, ev) {
      if (!n) { tip.hidden = true; return; }
      const P = picked();
      const ch = opts.choices()[n.id];
      const kind = { keystone: 'Keystone', notable: 'Notable', wormhole: 'Gateway', normal: 'Passive' }[n.kind] || '';
      mount(tip,
        h('div', { class: 'at-tip-h' }, h('b', {}, n.name), h('span', { class: 'small faint' }, ` ${kind} · ${n.cat}`), P.has(n.id) ? h('span', { class: 'at-taken' }, '● Taken') : null),
        n.stats.map((s) => h('div', { class: 'at-stat' }, s)),
        n.variants.length ? h('div', { class: 'at-vars' }, h('div', { class: 'small faint' }, P.has(n.id) ? (ch == null ? 'Pick one (click the passive):' : 'Your choice:') : 'One of:'),
          n.variants.map((v, i) => h('div', { class: 'at-var' + (i === ch ? ' on' : '') }, i === ch ? '✔ ' : '· ', v))) : null,
        n.reminder.length ? h('div', { class: 'small faint at-rem' }, n.reminder.join(' ')) : null,
        preview?.add ? h('div', { class: 'small at-edit-hint' }, `Click to take it: ${preview.add.size} point${preview.add.size === 1 ? '' : 's'}`) : null,
        preview?.remove ? h('div', { class: 'small at-edit-hint bad' }, preview.remove.size > 1 ? `Click to remove it and ${preview.remove.size - 1} passive${preview.remove.size === 2 ? '' : 's'} after it` : 'Click to remove it') : null);
      tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      const x = ev.clientX - r.left; const y = ev.clientY - r.top;
      tip.style.left = `${Math.min(x + 16, r.width - 330)}px`;
      tip.style.top = `${y + 16 + 200 > r.height ? Math.max(4, y - 16 - tip.offsetHeight) : y + 16}px`;
    }

    function showMenu(n, ev, canRemove) {
      const r = wrap.getBoundingClientRect();
      mount(menu, h('div', { class: 'small faint' }, n.name),
        n.variants.map((v, i) => h('button', { class: 'quiet sm' + (opts.choices()[n.id] === i ? ' on' : ''), onclick: () => { menu.hidden = true; opts.onChoose?.(n.id, i); } }, v)),
        canRemove ? h('button', { class: 'quiet sm bad', onclick: () => { menu.hidden = true; const gone = removing(n.id); change([...picked()].filter((x) => !gone.has(x))); } }, '✕ Remove this passive') : null);
      menu.style.left = `${Math.min(ev.clientX - r.left, r.width - 260)}px`;
      menu.style.top = `${Math.min(ev.clientY - r.top, r.height - 40 - n.variants.length * 30)}px`;
      menu.hidden = false;
      tip.hidden = true;
    }

    let drag = null;
    canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; menu.hidden = true; });
    window.addEventListener('mouseup', (e) => {
      if (drag && !drag.moved && e.target === canvas) {
        clickNode(nodeAt(e), e);
      }
      drag = null;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        view.x = drag.vx - dx / view.s; view.y = drag.vy - dy / view.s;
        tip.hidden = true; draw(); return;
      }
      const n = nodeAt(e);
      if (n?.id !== hover?.id) { hover = n; setPreview(n); draw(); }
      canvas.style.cursor = n && (editing() ? n.kind !== 'mastery' : n.variants.length && picked().has(n.id)) ? 'pointer' : 'grab';
      showTip(n, e);
    });
    // the tip goes away whenever the pointer isn't on the tree: leaving it, switching windows, scrolling,
    // or any move that lands somewhere else (mouseleave alone misses some of these)
    const hideTip = () => { tip.hidden = true; if (hover) { hover = null; preview = null; draw(); } };
    canvas.addEventListener('mouseleave', hideTip);
    const offTree = (e) => { if (!tip.hidden && e.target !== canvas) hideTip(); };
    document.addEventListener('mousemove', offTree, true);
    window.addEventListener('blur', hideTip);
    document.addEventListener('visibilitychange', hideTip);
    const onScroll = () => { if (!tip.hidden) hideTip(); };
    document.addEventListener('scroll', onScroll, true);
    // the listeners go with the tree when the page draws a new one
    new MutationObserver((_, obs) => { if (!canvas.isConnected) { document.removeEventListener('mousemove', offTree, true); window.removeEventListener('blur', hideTip); document.removeEventListener('visibilitychange', hideTip); document.removeEventListener('scroll', onScroll, true); obs.disconnect(); } })
      .observe(document.body, { childList: true, subtree: true });
    function zoomAt(f, ev) {
      const r = canvas.getBoundingClientRect();
      const sx = ev ? ev.clientX - r.left : r.width / 2; const sy = ev ? ev.clientY - r.top : r.height / 2;
      const [wx, wy] = toWorld(sx, sy, r);
      view.s = Math.max(0.015, Math.min(0.6, view.s * f));
      view.x = wx - (sx - r.width / 2) / view.s; view.y = wy - (sy - r.height / 2) / view.s;
      draw();
    }
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e); }, { passive: false });
    const ro = new ResizeObserver(() => { if (!view.fitted) { fit(); view.fitted = true; } draw(); }); // a kept view stays where you left it
    ro.observe(canvas);
    wrap.redraw = draw;
    return wrap;
  }

  // ---------- the page ----------
  const fmtC = (c, d) => (c == null ? '–' : chaosDiv(c, d));
  const sign = (c, d) => (c == null ? '–' : `${c >= 0 ? '+' : '−'}${chaosDiv(Math.abs(c), d)}`);
  const dur = (hrs) => { const m = Math.round(hrs * 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const day = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function load() {
    const [list, more] = await Promise.all([call('atlas:list'), A.threads ? null : call('atlas:threads').catch(() => null)]);
    A.list = list;
    if (more) { A.threads = more.threads; A.items = more.items; }
    if (!A.tree && !list.treeError) A.tree = await call('atlas:tree').catch((e) => { A.error = e.message; return null; });
    if (A.sel && !list.strategies.some((s) => s.id === A.sel)) A.sel = null;
    if (!A.sel && list.strategies.length) A.sel = list.strategies[0].id;
  }

  /**
   * Screenshots of the game's atlas tree → the passives taken on them, into S (one of yours) or a new strategy
   * (when none is open, or the open one is a website's).
   */
  async function readShots(files, S) {
    const imgs = [...files].filter((f) => /^image\//.test(f.type || ''));
    if (!imgs.length) return toast('That isn\'t a picture. Use a PNG or JPG screenshot.', true);
    toast(`Reading ${imgs.length === 1 ? 'the screenshot' : `${imgs.length} screenshots`}…`);
    try {
      const bytes = await Promise.all(imgs.map(async (f) => new Uint8Array(await f.arrayBuffer())));
      const r = await call('atlas:fromShots', bytes);
      const into = S && !S.guide ? S.id : null;
      const patch = into ? { id: into, nodes: r.nodes } : { name: `My atlas tree ${new Date().toLocaleDateString()}`, nodes: r.nodes };
      const s = await save(patch, true);
      if (!s) return;
      A.edit[s.id] = true; // to fix what was misread
      await render(true);
      toast(`Read ${r.nodes.length} of ${r.points} points${r.read < r.of ? ` (no tree found on ${r.of - r.read} screenshot${r.of - r.read === 1 ? '' : 's'})` : ''}${into ? '' : ', as a new strategy'}. Check it against the game; click passives to fix it.`);
    } catch (e) { toast(e.message, true); }
  }
  // Ctrl+V of a screenshot on the page (not in a text box): into the open strategy. A copied file comes with the
  // paste event; a screenshot (Print Screen, Win+Shift+S) is read from the clipboard by the app, also when the
  // window sends no paste event for a page without a text box
  const onAtlas = () => { const page = document.getElementById('page-atlas'); return !!(page && page.offsetParent); };
  const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  let pasted = 0;
  async function pasteShot(S = A.current) {
    const bytes = await call('atlas:clipboardShot');
    if (!bytes) return toast('No screenshot on the clipboard. Take one with Print Screen or Win+Shift+S, then press Ctrl+V here.', true);
    readShots([{ type: 'image/png', arrayBuffer: async () => bytes }], S);
  }
  document.addEventListener('paste', (e) => {
    if (!onAtlas() || typing(e.target)) return;
    pasted = Date.now();
    e.preventDefault();
    const f = [...(e.clipboardData?.files || [])].filter((x) => /^image\//.test(x.type || ''));
    if (f.length) readShots(f, A.current); else pasteShot();
  });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v' || e.shiftKey || e.altKey || !onAtlas() || typing(e.target)) return;
    const at = Date.now();
    setTimeout(() => { if (pasted < at) pasteShot(); }, 200);
  });

  async function save(patch, quiet) {
    try {
      const s = await call('atlas:save', patch);
      A.sel = s.id;
      if (!quiet) toast('Saved');
      await render(); // reload: costs, effects and the link follow the change
      return s;
    } catch { return null; /* the toast says why */ }
  }

  async function render(keep) {
    const page = document.getElementById('page-atlas');
    if (!page) return;
    if (!A.list || !keep) {
      if (!A.list) mount(page, window.pageHead('Atlas strategies', null), h('div', { class: 'skeleton panel', role: 'status', 'aria-label': 'Loading' }, h('i'), h('i')));
      try { await load(); } catch (e) { return mount(page, window.pageHead('Atlas strategies', null), h('div', { class: 'panel empty' }, e.message)); }
    }
    const L = A.list;
    const d = L.divine;
    const S = L.strategies.find((s) => s.id === A.sel) || null;
    const newBtn = h('button', { class: 'primary', onclick: async () => { const s = await save({ name: `Strategy ${L.strategies.length + 1}` }, true); if (s) toast('New strategy: paste an atlas tree link, or click passives on the tree'); } }, window.UI.icon('plus', { size: 15 }), ' New strategy');
    const headIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/bmp', multiple: true, hidden: true, onchange: (e) => { readShots(e.target.files, null); e.target.value = ''; } });
    const headShot = h('button', { title: 'A new strategy with the tree read from a screenshot of the game\'s Atlas passive tree (zoomed all the way out; several zoomed-in screenshots work too). Or paste a screenshot on this page with Ctrl+V.', onclick: () => headIn.click() }, window.UI.icon('image', { size: 15 }), ' From screenshot', headIn);
    const headPaste = h('button', { title: 'Paste a screenshot of the Atlas passive tree from the clipboard (or press Ctrl+V on this page)', onclick: () => pasteShot(null) }, 'Paste screenshot');
    A.current = S;
    const head = window.pageHead('Atlas strategies', 'Your farms: the atlas tree, threads and maps each one uses, and what its sessions earned. Start a session here and WealthyExile measures it.', h('span', { class: 'at-headbtns' }, headShot, headPaste, newBtn));

    // ---- the list: a search over names, authors and mechanics; your strategies, then each website's ----
    const q = (A.q || '').trim().toLowerCase();
    const catsOf = (s) => (s.summary?.cats || s.summary?.top || []);
    const hay = (s) => [s.name, s.guide?.author, s.guide?.group, s.mapKind, s.mapName, s.notes, ...(s.threads || []).map((t) => t.name), ...catsOf(s).map((c) => c.name)].filter(Boolean).join(' | ').toLowerCase();
    const matchCat = (s) => (q ? catsOf(s).find((c) => c.name.toLowerCase().includes(q)) : null);
    // searching: the ones with the most passives for that mechanic first
    const shown = q ? L.strategies.filter((s) => hay(s).includes(q)).map((s, i) => [s, matchCat(s)?.count || 0, i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(([s]) => s) : L.strategies;
    const card = (s) => {
      const hit = matchCat(s);
      // the 3 biggest mechanics as chips (the one you searched for first and marked)
      const chips = [...(hit ? [hit] : []), ...(s.summary?.top || []).filter((t) => t.name !== hit?.name)].slice(0, 3);
      const thr = (s.threads || []).length;
      return h('button', { class: 'at-card' + (s.id === A.sel ? ' on' : ''), onclick: () => { A.sel = s.id; A.hoverCat = null; render(true); } },
        h('div', { class: 'at-card-h' }, h('b', {}, s.guide ? s.name.replace(/^.*? · /, '') : s.name), s.total.running ? h('span', { class: 'at-live' }, '● Running') : null),
        s.guide ? h('div', { class: 'at-by' }, `by ${s.guide.author}`) : null,
        chips.length ? h('div', { class: 'at-chips' }, chips.map((c) => h('span', { class: 'at-chip' + (c === hit ? ' hit' : ''), title: `${c.count} passives for ${c.name}` }, c.name, h('i', {}, c.count))))
          : h('div', { class: 'small faint' }, 'No tree yet'),
        h('div', { class: 'at-card-n small' },
          h('span', { class: s.total.perHour != null ? '' : 'faint' }, s.total.perHour != null ? `${sign(s.total.perHour, d)} / h` : 'No sessions yet'),
          h('span', { class: 'faint' }, [thr ? `${thr} ${thr === 1 ? 'thread' : 'threads'}` : '', s.costPerMap ? `${fmtC(s.costPerMap, d)} a map` : ''].filter(Boolean).join(' · '))));
    };
    // sections: yours, then one per website (by its group inside); each folds, and remembers it
    A.fold = A.fold || {};
    const section = (id, title, list, sub) => {
      const open = q ? true : A.fold[id] !== false;
      return h('details', { class: 'at-sec', open, ontoggle: (e) => { if (!q) A.fold[id] = e.target.open; } },
        h('summary', {}, h('span', { class: 'at-sec-t' }, title), h('span', { class: 'at-sec-n' }, String(list.length))),
        sub ? sub : list.map(card));
    };
    const mine = shown.filter((s) => !s.guide);
    const sites = new Map();
    for (const s of shown.filter((x) => x.guide)) {
      let site = 'Guides';
      try { site = new URL(s.guide.source).hostname.replace(/^www\./, ''); } catch { /* keep */ }
      if (!sites.has(site)) sites.set(site, []);
      sites.get(site).push(s);
    }
    const siteBody = (list) => {
      const groups = new Map();
      for (const s of list) { const g = s.guide.group || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); }
      return [...groups].flatMap(([g, l]) => [g ? h('div', { class: 'at-group' }, g) : null, ...l.map(card)]);
    };
    const search = h('input', { type: 'search', class: 'at-search', value: A.q || '', placeholder: 'Find a mechanic, name or author', 'aria-label': 'Find strategies', list: 'at-mechs',
      oninput: (e) => { A.q = e.target.value; clearTimeout(A.qT); A.qT = setTimeout(() => { render(true); const el = document.querySelector('.at-search'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 200); } });
    const mechs = [...new Set(L.strategies.flatMap((s) => catsOf(s).map((c) => c.name)))].sort();
    const cards = h('div', { class: 'at-list' },
      search, h('datalist', { id: 'at-mechs' }, mechs.map((m) => h('option', { value: m }))),
      !L.strategies.length ? h('p', { class: 'small muted' }, 'No strategies yet. Click "New strategy".')
        : !shown.length ? h('p', { class: 'small muted' }, `No strategy has "${A.q}".`)
          : [mine.length || !q ? section('mine', 'My strategies', mine, mine.length ? null : h('p', { class: 'small faint', style: { margin: '2px 4px' } }, 'None yet: click "New strategy", or copy one from below.')) : null,
            ...[...sites].map(([site, list]) => section(`site:${site}`, site, list, siteBody(list)))],
      h('div', { class: 'at-sync small faint' },
        h('span', {}, L.guideSyncAt ? `Guide websites checked ${agoDays(L.guideSyncAt)}` : 'Guide websites: checked once a week'),
        h('button', { class: 'quiet sm', title: 'Look for new strategies on poeatlasplanner.com and maxroll.gg now', onclick: async (e) => {
          e.target.disabled = true; e.target.textContent = 'Checking…';
          try { const r = await call('atlas:syncGuides'); toast(r.added?.length ? `New from the guide websites: ${r.added.join(', ')}` : r.errors?.length ? `Couldn't check: ${r.errors.join('; ')}` : 'No new strategies on the guide websites'); render(); } catch (err) { toast(err.message, true); e.target.disabled = false; e.target.textContent = 'Check now'; }
        } }, 'Check now')));

    const body = h('div', { class: 'at-body' }, S ? strategyView(S, L) : h('div', { class: 'panel empty' }, 'Make a strategy for each way you farm: Breach with Breach threads, Beasts and Heist, Originator maps… Paste its atlas tree link from pathofexile.com, poeplanner.com, poeatlasplanner.com, hypostasis.faith, wealthyexile.com or a maxroll.gg strategy, or click it together on the tree.'));
    window.UI.keepScroll ? window.UI.keepScroll(() => mount(page, head, h('div', { class: 'at-page' }, cards, body))) : mount(page, head, h('div', { class: 'at-page' }, cards, body));
  }

  function strategyView(S, L) {
    const d = L.divine;
    const picked = new Set(S.nodes || []);
    let choices = { ...(S.choices || {}) };
    // ---- name, session, delete ----
    const name = h('input', { class: 'at-name', value: S.name, 'aria-label': 'Strategy name', onchange: (e) => save({ id: S.id, name: e.target.value }, true) });
    const running = S.total.running;
    const otherRunning = !running && L.strategies.some((x) => x.total.running);
    const sessBtn = h('button', { class: running ? 'danger' : 'primary', title: running ? 'Stop: a snapshot is taken and the session ends' : `Start a WealthyExile session for this strategy: a snapshot now and when you stop${otherRunning ? ' (the running one stops)' : ''}`, onclick: async () => {
      sessBtn.disabled = true; sessBtn.textContent = running ? 'Stopping…' : 'Starting…';
      try { await call('atlas:session', { id: S.id, action: running ? 'stop' : 'start' }); toast(running ? 'Session stopped' : 'Session started: run your maps, then stop it here'); } catch { /* toast */ }
      render();
    } }, window.UI.icon(running ? 'stop' : 'play', { size: 15 }), running ? ' Stop session' : ' Start session');
    const del = h('button', { class: 'quiet sm', onclick: async () => {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Click again to delete'; setTimeout(() => { del.dataset.sure = ''; del.textContent = 'Delete'; }, 3000); return; }
      await call('atlas:remove', S.id); A.sel = null; toast(`${S.name} deleted. Its sessions stay in WealthyExile.`); render();
    } }, 'Delete');
    // a copy in My strategies: a guide's tree to change as you like (the guide's own stays as it is)
    const copyBtn = h('button', { class: S.guide ? '' : 'quiet', title: S.guide ? 'Put a copy in My strategies, to change its tree, threads and maps' : 'Make a copy of this strategy', onclick: async () => {
      try { const c = await call('atlas:copy', S.id); A.sel = c.id; A.q = ''; toast(`Copied to My strategies: ${c.name}`); render(); } catch (e) { toast(e.message, true); }
    } }, S.guide ? 'Copy to My strategies' : 'Copy');
    const top = h('div', { class: 'at-top' }, name, h('span', { class: 'spacer' }), copyBtn, sessBtn, del);

    // ---- the tree link ----
    const link = h('input', { type: 'text', value: S.link || '', placeholder: 'Atlas tree link (pathofexile.com, poeplanner.com, poeatlasplanner.com, hypostasis.faith, wealthyexile.com, maxroll.gg), or click passives on the tree', 'aria-label': 'Atlas tree link', style: { flex: 1 } });
    const imp = h('button', { onclick: () => save({ id: S.id, link: link.value }) }, S.link ? 'Update tree' : 'Import tree');
    link.addEventListener('keydown', (e) => { if (e.key === 'Enter') imp.click(); });
    const shotIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/bmp', multiple: true, hidden: true, onchange: (e) => { readShots(e.target.files, S); e.target.value = ''; } });
    const shotBtn = h('button', { title: 'Read your tree from a screenshot of the game\'s Atlas passive tree (zoomed all the way out). Several zoomed-in screenshots work too. You can also paste a screenshot on this page with Ctrl+V.' + (S.guide ? ' It makes a new strategy in My strategies.' : ''), onclick: () => shotIn.click() }, 'From screenshot');
    const linkRow = h('div', { class: 'at-row' }, link, imp, shotBtn, shotIn, h('button', { title: 'Paste a screenshot of the Atlas passive tree from the clipboard (or press Ctrl+V on this page)', onclick: () => pasteShot(S) }, 'Paste screenshot'));
    const linkInfo = S.nodes?.length ? h('div', { class: 'small muted at-linkinfo' },
      `${S.summary?.points ?? S.nodes.length} of ${A.tree?.points || 150} points`, S.summary ? ` · ${S.summary.notables} notable${S.summary.notables === 1 ? '' : 's'} · ${S.summary.keystones} keystone${S.summary.keystones === 1 ? '' : 's'}` : '', S.from ? ` · from ${S.from}` : '',
      S.unknown ? ` · ${S.unknown} passive${S.unknown === 1 ? '' : 's'} not in this tree left out` : '',
      ' · Open on ',
      h('a', { href: '#', onclick: async (e) => { e.preventDefault(); const l = await call('atlas:links', S.id); if (l) window.open(l.official); } }, 'pathofexile.com'), ', ',
      h('a', { href: '#', onclick: async (e) => { e.preventDefault(); const l = await call('atlas:links', S.id); if (l) { await call('clipboard:write', l.hypostasis).catch(() => {}); toast('hypostasis.faith link copied'); } } }, 'copy a hypostasis.faith link')) : null;

    // ---- threads, maps, other inputs ----
    // up to 3 thread types a map, 1-8 of each (10 with Unwavering Vision); a new row shows once the last one is used
    const thr = S.threads || [];
    const saveThr = (l) => save({ id: S.id, threads: l }, true);
    const threadRow = (t, k) => {
      const used = new Set(thr.filter((_, j) => j !== k).map((x) => x.name));
      const sel = h('select', { 'aria-label': `Thread ${k + 1}`, onchange: (e) => { const l = [...thr]; if (e.target.value) l[k] = { name: e.target.value, count: t?.count || 8 }; else l.splice(k, 1); saveThr(l); } },
        h('option', { value: '' }, k ? 'Add another thread' : 'No threads'),
        (A.threads || []).filter((x) => !used.has(x.name)).map((x) => h('option', { value: x.name, selected: x.name === t?.name }, `${x.name} (${chaosDiv(x.chaos, d)})`)),
        t?.name && !(A.threads || []).some((x) => x.name === t.name) ? h('option', { value: t.name, selected: true }, t.name) : null);
      const n = t ? h('input', { type: 'number', min: 1, max: 10, value: t.count ?? 8, title: '1 to 8 a map (up to 10 with Unwavering Vision)', 'aria-label': `How many ${t.name} a map`, style: { width: '58px' }, onchange: (e) => { const l = [...thr]; l[k] = { ...t, count: e.target.value }; saveThr(l); } }) : null;
      return h('div', { class: 'at-row' }, sel, n);
    };
    const threadRows = [...thr.map((t, k) => threadRow(t, k)), thr.length < 3 ? threadRow(null, thr.length) : null];
    const kinds = L.mapKinds;
    // the kind of map you run; poe.ninja gives its price (Originator and other maps: type it)
    const kindSel = h('select', { 'aria-label': 'Map kind', onchange: (e) => save({ id: S.id, mapKind: e.target.value, mapPrice: '' }, true) },
      kinds.map((k) => h('option', { value: k, selected: k === S.mapKind }, k)),
      S.mapKind && !kinds.includes(S.mapKind) ? h('option', { value: S.mapKind, selected: true }, S.mapKind) : null);
    const mapPrice = h('input', { type: 'number', min: 0, step: 'any', value: S.mapPrice ?? '', placeholder: S.mapAuto != null ? `${S.mapAuto}c` : 'price',
      title: S.mapAuto != null ? `poe.ninja: ${S.mapAuto}c a map. Type your own price to use that instead.` : 'poe.ninja has no price for these: type what a map costs you, in chaos',
      'aria-label': 'Price of a map, chaos', class: S.mapAuto == null && S.mapPrice == null ? 'at-need' : '', style: { width: '76px' }, onchange: (e) => save({ id: S.id, mapPrice: e.target.value }, true) });
    const mapName = h('input', { type: 'text', value: S.mapName || '', placeholder: 'Map (optional)', 'aria-label': 'Map', style: { width: '170px' }, onchange: (e) => save({ id: S.id, mapName: e.target.value }, true) });
    const priceOf = (n) => S.costs.find((p) => p.name === n)?.chaos ?? null;
    const extra = (S.inputs || []).map((i, k) => h('div', { class: 'at-in' },
      h('input', { type: 'text', value: i.name, 'aria-label': 'Item', style: { flex: 1 }, onchange: (e) => { const l = [...S.inputs]; l[k] = { ...i, name: e.target.value }; save({ id: S.id, inputs: l }, true); } }),
      h('input', { type: 'number', min: 0, max: 99, value: i.count, 'aria-label': 'How many a map', style: { width: '58px' }, onchange: (e) => { const l = [...S.inputs]; l[k] = { ...i, count: e.target.value }; save({ id: S.id, inputs: l }, true); } }),
      h('span', { class: 'small faint at-price' }, priceOf(i.name) != null ? `${chaosDiv(priceOf(i.name), d)} each` : 'no price'),
      h('button', { class: 'quiet sm', 'aria-label': `Remove ${i.name}`, onclick: () => save({ id: S.id, inputs: S.inputs.filter((_, j) => j !== k) }, true) }, '✕')));
    // Delirium Orbs from a short list (cheapest first, "Fine" rather than "Fine Delirium Orb"), anything else typed
    const newN = h('input', { type: 'number', min: 1, max: 99, value: 1, 'aria-label': 'How many a map', style: { width: '58px' } });
    const addItem = (name) => { if (name) save({ id: S.id, inputs: [...(S.inputs || []), { name, count: newN.value }] }, true); };
    const have = new Set((S.inputs || []).map((i) => i.name));
    const orbs = (A.items || []).filter((x) => !have.has(x.name)).sort((x, y) => (x.chaos ?? 1e9) - (y.chaos ?? 1e9));
    const orbSel = h('select', { 'aria-label': 'Add a Delirium Orb', onchange: (e) => addItem(e.target.value) },
      h('option', { value: '' }, 'Add a Delirium Orb'),
      orbs.map((x) => h('option', { value: x.name }, `${x.name.replace(/ Delirium Orb$/, '')}${x.chaos != null ? ` · ${chaosDiv(x.chaos, d)}` : ''}`)));
    const newName = h('input', { type: 'text', placeholder: 'Other item', 'aria-label': 'Add another item used each map', style: { width: '170px' } });
    const add = () => addItem(newName.value.trim());
    newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const addIn = h('div', { class: 'at-in' }, orbSel, newName, newN, h('button', { class: 'sm', onclick: add }, 'Add'));
    const setup = h('div', { class: 'panel at-setup' },
      h('div', { class: 'at-setup-row' },
        h('div', { class: 'at-field' }, h('span', { class: 'small muted', title: 'Up to 3 kinds of thread on a map' }, 'Threads a map'), h('div', { class: 'at-thr' }, threadRows)),
        h('label', { class: 'at-field' }, h('span', { class: 'small muted' }, 'Maps'), h('div', { class: 'at-row' }, kindSel, mapPrice, mapName)),
        h('div', { class: 'at-field at-cost' }, h('span', { class: 'small muted' }, 'Cost a map'), h('b', { title: S.costs.map((c) => `${c.count > 1 ? `${c.count} × ` : ''}${c.name}: ${c.total != null ? chaosDiv(c.total, d) : 'no price'}`).join('\n') }, S.costPerMap ? chaosDiv(S.costPerMap, d) : '–'),
          S.costs.length ? h('span', { class: 'small faint' }, S.costs.map((c) => `${c.map ? 'map' : c.thread ? c.name.replace(/ Thread$/, ' threads') : c.name} ${c.total != null ? chaosDiv(c.total, d) : '?'}`).join(' + ')) : null)),
      h('div', { class: 'at-ins' }, extra, addIn));

    // ---- tree + effects ----
    let treeBox;
    const hlSet = () => {
      if (!A.hoverCat) return null;
      const c = S.effects.find((x) => x.name === A.hoverCat);
      return c ? new Set(c.nodes) : null;
    };
    // editing: on by itself for an empty tree; clicks then take a passive (and the path to it) or remove one
    if (A.edit[S.id] == null) A.edit[S.id] = !picked.size;
    const editing = () => A.edit[S.id];
    const view = A.views[S.id] || (A.views[S.id] = { x: 0, y: 0, s: 0.05 });
    let saveTimer = null;
    const undo = A.undo[S.id] || (A.undo[S.id] = []);
    let last = [...picked];
    const changed = (nodes) => {
      undo.push(last); if (undo.length > 50) undo.shift();
      last = [...nodes];
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => save({ id: S.id, nodes: last, choices }, true), 700); // a few clicks in a row are saved once
      undoBtn.disabled = false;
    };
    if (A.tree) {
      treeBox = treeCanvas(A.tree, {
        picked: () => picked, choices: () => choices, highlight: hlSet, edit: editing, view,
        onChoose: (id, i) => { choices = { ...choices, [id]: i }; clearTimeout(saveTimer); save({ id: S.id, nodes: [...picked], choices }, true); },
        onChange: changed,
      });
    } else {
      treeBox = h('div', { class: 'panel empty' }, L.treeError || A.error || 'The atlas tree is loading.');
    }
    const editBtn = h('button', { class: 'sm' + (editing() ? ' primary' : ''), 'aria-pressed': editing() ? 'true' : 'false', title: 'Click passives on the tree to take or remove them', onclick: () => { A.edit[S.id] = !editing(); render(true); } }, editing() ? '✔ Editing the tree' : '✎ Edit the tree');
    const undoBtn = h('button', { class: 'sm quiet', disabled: !undo.length, onclick: () => { const prev = undo.pop(); if (!prev) return; picked.clear(); prev.forEach((x) => picked.add(x)); last = prev; treeBox.redraw?.(); clearTimeout(saveTimer); save({ id: S.id, nodes: prev, choices }, true); } }, '↶ Undo');
    const clearBtn = h('button', { class: 'sm quiet', disabled: !picked.size, onclick: () => {
      if (clearBtn.dataset.sure !== '1') { clearBtn.dataset.sure = '1'; clearBtn.textContent = 'Click again to clear'; setTimeout(() => { clearBtn.dataset.sure = ''; clearBtn.textContent = 'Clear tree'; }, 3000); return; }
      changed([]); picked.clear(); treeBox.redraw?.();
    } }, 'Clear tree');
    const treeBar = h('div', { class: 'at-row at-treebar' }, editBtn, editing() ? undoBtn : null, editing() ? clearBtn : null,
      h('span', { class: 'small faint' }, editing() ? 'Click a passive to take it and the path to it; click a taken one to remove it.' : ''));
    const missing = (S.nodes || []).filter((id) => A.tree?.nodes.find((n) => n.id === id)?.variants.length && choices[id] == null).length;
    const fx = h('div', { class: 'at-fx' },
      h('div', { class: 'at-fx-h' }, h('b', {}, 'What the tree does'), missing ? h('span', { class: 'small warn' }, ` ${missing} choice${missing === 1 ? '' : 's'} not made: click ${missing === 1 ? 'it' : 'them'} on the tree (dashed ring)`) : null),
      S.effects.length ? S.effects.map((c) => h('details', {
        class: 'at-cat', open: S.effects.length <= 3 || c === S.effects[0],
        onmouseenter: () => { A.hoverCat = c.name; treeBox.redraw?.(); }, onmouseleave: () => { A.hoverCat = null; treeBox.redraw?.(); },
      },
        h('summary', {}, h('b', {}, c.name), h('span', { class: 'small faint' }, ` ${c.nodes.length} passive${c.nodes.length === 1 ? '' : 's'}`), c.keystones.length ? h('span', { class: 'at-key small' }, ` ◆ ${c.keystones.join(', ')}`) : null),
        h('ul', {}, c.lines.map((l) => h('li', {}, l.text))))) : h('p', { class: 'small muted' }, 'Import a tree or take passives on it to see its effects, grouped by league mechanic. Point at a group to light up its passives.'));

    // ---- sessions ----
    const runs = S.sessions;
    const T = S.total;
    const sessions = h('div', { class: 'panel at-sess' },
      h('div', { class: 'nw-ph' }, h('h2', {}, 'Sessions'), h('span', { class: 'small faint' }, L.clientLog ? 'Maps are counted from your Client.txt' : 'Set Client.txt in Settings to count maps')),
      runs.length ? h('table', { class: 'at-table' },
        h('thead', {}, h('tr', {}, ['Started', 'Time', 'Maps', 'Gained', 'Per hour', 'Per map', ''].map((t, i) => h('th', { class: i ? 'r' : '' }, t)))),
        h('tbody', {}, runs.map((r) => h('tr', {},
          h('td', {}, day(r.start), r.end ? null : h('span', { class: 'at-live' }, ' ● running')),
          h('td', { class: 'r' }, dur(r.hours)),
          h('td', { class: 'r' }, r.maps ?? '–'),
          h('td', { class: 'r ' + (r.gained == null ? '' : r.gained >= 0 ? 'good' : 'bad') }, r.gained == null ? (r.end ? 'No snapshot' : 'Running') : sign(r.gained, d)),
          h('td', { class: 'r' }, r.perHour == null ? '–' : sign(r.perHour, d)),
          h('td', { class: 'r' }, r.perMap == null ? '–' : sign(r.perMap, d)),
          h('td', { class: 'r' }, r.end ? h('button', { class: 'quiet sm', title: 'Open this session in WealthyExile: its chart and what changed', onclick: () => window.openNetworthSession?.(r.id) }, 'Open in WealthyExile') : null)))),
        runs.length > 1 ? h('tfoot', {}, h('tr', {},
          h('td', {}, h('b', {}, 'All')), h('td', { class: 'r' }, dur(T.hours)), h('td', { class: 'r' }, T.maps ?? '–'),
          h('td', { class: 'r ' + (T.gained >= 0 ? 'good' : 'bad') }, sign(T.gained, d)), h('td', { class: 'r' }, sign(T.perHour, d)), h('td', { class: 'r' }, sign(T.perMap, d)), h('td', {}))) : null)
        : h('p', { class: 'small muted' }, 'Start a session when you begin farming this way and stop it when you\'re done. WealthyExile takes a snapshot at both ends; what your stash gained is the session\'s result.'),
      T.perMap != null && S.costPerMap ? h('p', { class: 'small muted' }, `Each map costs about ${chaosDiv(S.costPerMap, d)} in threads and items. If you buy them outside the tracked tabs, take that off: about ${sign(T.perMap - S.costPerMap, d)} a map.`) : null);

    const notes = h('textarea', { class: 'at-notes', rows: 3, placeholder: 'Notes: map choice, threads, how to run it…', onchange: (e) => save({ id: S.id, notes: e.target.value }, true) }, S.notes || '');

    // a strategy from the poeatlasplanner.com guide: whose tree it is, and where it came from
    const guideInfo = S.guide ? h('div', { class: 'small at-guide' },
      h('b', {}, S.guide.author), ` · ${S.guide.about} `,
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); call('shell:open', S.guide.source).catch(() => {}); } }, `The guide on ${(() => { try { return new URL(S.guide.source).hostname.replace(/^www\./, ''); } catch { return 'its website'; } })()}`)) : null;
    return h('div', { class: 'at-detail' }, top, h('div', { class: 'panel at-link' }, guideInfo, linkRow, linkInfo), setup,
      h('div', { class: 'at-main' }, h('div', { class: 'at-treecol' }, treeBar, treeBox, h('div', { class: 'small faint' }, 'Drag to move, scroll to zoom. Gold: taken. Blue ring: the group you point at on the right.')), fx),
      sessions, h('div', { class: 'panel' }, h('b', {}, 'Notes'), notes),
      null);
  }

  window.AtlasView = { render: () => render(false) };
})();
