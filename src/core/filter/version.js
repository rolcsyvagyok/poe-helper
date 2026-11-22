'use strict';
/**
 * The NeverSink version in a FilterBlade filter's header, and whether a newer one is out.
 * "# VERSION:  8.21.0a.2026.317.17" is version 8.21.0a, built 2026-03-17 (month and day run together).
 */

function filterVersion(text) {
  const m = /^#\s*VERSION:\s*(\d+\.\d+\.\d+[a-z]*)(?:\.(\d{4})\.(\d{1,2})(\d{2})\.\d+)?/m.exec(String(text || '').slice(0, 4000));
  if (!m) return null;
  const date = m[2] ? `${m[2]}-${m[3].padStart(2, '0')}-${m[4]}` : null;
  return { version: m[1], date: date && !isNaN(Date.parse(date)) ? date : null };
}

// 8.21.1 > 8.21.0a > 8.21.0
function compareVersions(a, b) {
  const p = (v) => String(v || '').replace(/^v/i, '').split('.').map((x) => { const m = /^(\d+)([a-z]*)$/i.exec(x) || [0, 0, '']; return [Number(m[1]), m[2].toLowerCase()]; });
  const x = p(a); const y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const [n1, s1] = x[i] || [0, '']; const [n2, s2] = y[i] || [0, ''];
    if (n1 !== n2) return n1 - n2;
    if (s1 !== s2) return s1 < s2 ? -1 : 1;
  }
  return 0;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthName(date, now = new Date()) {
  const d = new Date(date + 'T12:00:00Z');
  if (isNaN(d)) return null;
  return MONTHS[d.getUTCMonth()] + (d.getUTCFullYear() !== now.getUTCFullYear() ? ` ${d.getUTCFullYear()}` : '');
}

/**
 * Is the filter old? With `latest` (the newest NeverSink release), it is old when a newer version is out.
 * Without it (no internet), when it was built more than 90 days ago.
 */
function filterAge(text, latest = null, now = new Date()) {
  const v = filterVersion(text);
  if (!v) return null;
  const days = v.date ? Math.floor((now - new Date(v.date + 'T12:00:00Z')) / 86400000) : null;
  const old = latest ? compareVersions(latest, v.version) > 0 : days != null && days > 90;
  return { ...v, days, latest: latest || null, old, month: v.date ? monthName(v.date, now) : null };
}

module.exports = { filterVersion, compareVersions, filterAge };
