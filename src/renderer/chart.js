'use strict';
/* Dependency-free SVG line chart for net worth history. */

window.lineChart = function lineChart(points, { divine, height = 220, bands = [], unit = null, zero = false } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 900;
  const H = height;
  const pad = { l: 56, r: 14, t: 12, b: 26 };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('preserveAspectRatio', 'none');
  const el = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    svg.append(n);
    return n;
  };
  if (!points.length) {
    el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'axis' }, 'No snapshots yet');
    return svg;
  }
  const useDiv = unit ? unit === 'd' : divine && Math.max(...points.map((p) => Math.abs(p.chaos))) > divine * 3;
  const val = (p) => (useDiv ? p.chaos / (p.divine || divine) : p.chaos);
  const xs = points.map((p) => p.ts);
  const ys = points.map(val);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) > x0 ? Math.max(...xs) : x0 + 1;
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const span = y1 - y0;
  y0 = y0 >= 0 ? Math.max(0, y0 - span * 0.08) : y0 - span * 0.08; // prices never go below zero
  y1 += span * 0.08;
  const X = (t) => pad.l + ((t - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);

  const defs = el('defs', {});
  const grad = document.createElementNS(NS, 'linearGradient');
  grad.setAttribute('id', 'nwFill');
  grad.setAttribute('x1', '0'); grad.setAttribute('x2', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('y2', '1');
  for (const [o, c, a] of [['0%', '#e5c48b', '0.35'], ['100%', '#e5c48b', '0']]) {
    const s = document.createElementNS(NS, 'stop');
    s.setAttribute('offset', o); s.setAttribute('stop-color', c); s.setAttribute('stop-opacity', a);
    grad.append(s);
  }
  defs.append(grad);

  // farming sessions as shaded bands with their name
  for (const b of bands) {
    const a = Math.max(x0, b.from), z = Math.min(x1, b.to || x1);
    if (z <= a) continue;
    el('rect', { x: X(a), y: pad.t, width: Math.max(2, X(z) - X(a)), height: H - pad.t - pad.b, class: 'band' + (b.on ? ' on' : '') });
    el('line', { x1: X(a), x2: X(a), y1: pad.t, y2: H - pad.b, class: 'band-edge' });
    el('text', { x: X(a) + 4, y: pad.t + 12, class: 'band-label' }, b.label);
  }
  if (zero && y0 < 0 && y1 > 0) el('line', { x1: pad.l, x2: W - pad.r, y1: Y(0), y2: Y(0), class: 'zero-line' });
  for (let i = 0; i <= 4; i++) {
    const v = y0 + ((y1 - y0) * i) / 4;
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'grid-line' });
    el('text', { x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis' }, (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : Math.round(v * 10) / 10) + (useDiv ? 'd' : 'c'));
  }
  const fmtT = (t) => {
    const d = new Date(t);
    return x1 - x0 > 2 * 86400000 ? `${d.getMonth() + 1}/${d.getDate()}` : d.toTimeString().slice(0, 5);
  };
  // time labels: five across a long span, fewer when they would repeat the same minute
  const nT = x1 - x0 < 5 * 60000 ? 0 : x1 - x0 < 30 * 60000 ? 1 : 4;
  for (let i = 0; i <= nT; i++) {
    const t = nT ? x0 + ((x1 - x0) * i) / nT : x0;
    el('text', { x: nT ? X(t) : W / 2, y: H - 6, 'text-anchor': !nT ? 'middle' : i === 0 ? 'start' : i === nT ? 'end' : 'middle', class: 'axis' }, fmtT(t));
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)},${Y(val(p)).toFixed(1)}`).join(' ');
  el('path', { d: `${d} L${X(xs[xs.length - 1])},${H - pad.b} L${X(xs[0])},${H - pad.b} Z`, class: 'area' });
  el('path', { d, class: 'line' });
  if (points.length < 60) points.forEach((p) => el('circle', { cx: X(p.ts), cy: Y(val(p)), r: 2.5, class: 'dot' }));
  // hover: a line at the nearest snapshot with its value and time
  const guide = el('line', { x1: 0, x2: 0, y1: pad.t, y2: H - pad.b, class: 'hover-line', visibility: 'hidden' });
  const mark = el('circle', { cx: 0, cy: 0, r: 4.5, class: 'hover-dot', visibility: 'hidden' });
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const tipEl = document.createElement('div');
  tipEl.className = 'chart-tip';
  wrap.append(svg, tipEl);
  const unitS = useDiv ? ' div' : 'c';
  const signed = points.some((p) => val(p) < 0);
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(X(p.ts) - x) < Math.abs(X(best.ts) - x)) best = p;
    const px = X(best.ts), py = Y(val(best));
    for (const n of [guide, mark]) n.setAttribute('visibility', 'visible');
    guide.setAttribute('x1', px); guide.setAttribute('x2', px);
    mark.setAttribute('cx', px); mark.setAttribute('cy', py);
    const v = val(best);
    const d = new Date(best.ts);
    tipEl.replaceChildren();
    const b = document.createElement('b'); b.textContent = `${signed && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v) >= 100 ? Math.round(Math.abs(v)) : Math.round(Math.abs(v) * 100) / 100}${unitS}`;
    const s2 = document.createElement('span'); s2.textContent = `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toTimeString().slice(0, 5)}`;
    tipEl.append(b, s2);
    tipEl.style.display = 'grid';
    const left = (px / W) * r.width, top = (py / H) * r.height;
    const tw = tipEl.offsetWidth;
    tipEl.style.left = `${Math.max(0, Math.min(r.width - tw, left + 12 + tw > r.width ? left - tw - 12 : left + 12))}px`;
    tipEl.style.top = `${Math.max(0, top - 52)}px`;
  };
  svg.addEventListener('mousemove', show);
  svg.addEventListener('mouseleave', () => { for (const n of [guide, mark]) n.setAttribute('visibility', 'hidden'); tipEl.style.display = 'none'; });
  return wrap;
};
