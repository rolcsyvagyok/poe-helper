'use strict';
/* Dependency-free SVG line chart for net worth history. */

window.lineChart = function lineChart(points, { divine, height = 220 } = {}) {
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
  const useDiv = divine && Math.max(...points.map((p) => p.chaos)) > divine * 3;
  const val = (p) => (useDiv ? p.chaos / (p.divine || divine) : p.chaos);
  const xs = points.map((p) => p.ts);
  const ys = points.map(val);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) || x0 + 1;
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

  for (let i = 0; i <= 4; i++) {
    const v = y0 + ((y1 - y0) * i) / 4;
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'grid-line' });
    el('text', { x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis' }, (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : Math.round(v * 10) / 10) + (useDiv ? 'd' : 'c'));
  }
  const fmtT = (t) => {
    const d = new Date(t);
    return x1 - x0 > 2 * 86400000 ? `${d.getMonth() + 1}/${d.getDate()}` : d.toTimeString().slice(0, 5);
  };
  for (let i = 0; i <= 4; i++) {
    const t = x0 + ((x1 - x0) * i) / 4;
    el('text', { x: X(t), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle', class: 'axis' }, fmtT(t));
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)},${Y(val(p)).toFixed(1)}`).join(' ');
  el('path', { d: `${d} L${X(xs[xs.length - 1])},${H - pad.b} L${X(xs[0])},${H - pad.b} Z`, class: 'area' });
  el('path', { d, class: 'line' });
  if (points.length < 60) points.forEach((p) => el('circle', { cx: X(p.ts), cy: Y(val(p)), r: 2.5, class: 'dot' }));
  return svg;
};
