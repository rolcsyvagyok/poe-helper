'use strict';
/**
 * Rate limiter that follows GGG's dynamic rate-limit headers.
 *
 *   X-Rate-Limit-Policy:  trade-search-request-limit
 *   X-Rate-Limit-Rules:   Ip,Account
 *   X-Rate-Limit-Ip:      8:10:60,15:60:120      (maxHits:periodSec:penaltySec)
 *   X-Rate-Limit-Ip-State:1:10:0,1:60:0          (hits:periodSec:activeRestrictionSec)
 *   Retry-After:          60                     (on 429)
 *
 * We keep one bucket per policy key. Before each request we wait until every
 * known rule has room, using only `safety` (default 50%) of the allowed hits —
 * a helper tool should never be the reason someone gets locked out.
 * If we have never seen a policy, we allow ONE request through to learn the rules.
 */

function parseRuleList(s) {
  if (!s) return [];
  return String(s)
    .split(',')
    .map((p) => p.trim().split(':').map(Number))
    .filter((a) => a.length === 3 && a.every(Number.isFinite))
    .map(([a, period, c]) => ({ a, period, c }));
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) return headers[k];
  return undefined;
}

class Bucket {
  constructor() {
    this.rules = []; // {maxHits, period, penalty}
    this.hits = []; // timestamps (ms)
    this.blockedUntil = 0;
    this.learned = false;
    this.inFlight = 0;
  }
}

class RateLimiter {
  constructor({ safety = 0.5, now = () => Date.now(), sleep } = {}) {
    this.safety = safety;
    this.now = now;
    this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.buckets = new Map();
    this.queue = Promise.resolve();
    this.stats = { total: 0, byKey: {}, throttledMs: 0, last429: null };
  }

  bucket(key) {
    if (!this.buckets.has(key)) this.buckets.set(key, new Bucket());
    return this.buckets.get(key);
  }

  /** Milliseconds to wait before the next request on `key` is allowed. */
  waitTime(key) {
    const b = this.bucket(key);
    const t = this.now();
    let wait = Math.max(0, b.blockedUntil - t);
    if (!b.learned) {
      // Unknown policy: one request at a time, at most one per second, until headers teach us the rules.
      if (b.inFlight > 0) return Math.max(wait, 250);
      const last = b.hits.length ? Math.max(...b.hits) : -Infinity;
      return Math.max(wait, last + 1000 - t);
    }
    for (const r of b.rules) {
      const allowed = Math.max(1, Math.floor(r.maxHits * this.safety));
      const windowStart = t - r.period * 1000;
      const inWindow = b.hits.filter((h) => h > windowStart).sort((x, y) => x - y);
      if (inWindow.length + b.inFlight >= allowed) {
        const idx = inWindow.length + b.inFlight - allowed;
        const oldest = inWindow[Math.min(idx, inWindow.length - 1)] ?? t;
        wait = Math.max(wait, oldest + r.period * 1000 - t + 50);
      }
    }
    return wait;
  }

  /**
   * Run `fn` (which performs the HTTP request and returns {response, ...})
   * under the limiter. `fn` must return an object with `headers` and `status`.
   * Requests are serialized per limiter so waits are predictable.
   */
  schedule(key, fn) {
    const run = async () => {
      let w = this.waitTime(key);
      while (w > 0) {
        this.stats.throttledMs += w;
        await this.sleep(w);
        w = this.waitTime(key);
      }
      const b = this.bucket(key);
      b.inFlight++;
      b.hits.push(this.now());
      this.stats.total++;
      this.stats.byKey[key] = (this.stats.byKey[key] || 0) + 1;
      try {
        const res = await fn();
        this.update(key, res.headers, res.status);
        return res;
      } finally {
        b.inFlight--;
        this.prune(b);
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  prune(b) {
    const maxPeriod = Math.max(60, ...b.rules.map((r) => r.period));
    const cutoff = this.now() - maxPeriod * 1000;
    b.hits = b.hits.filter((h) => h > cutoff);
  }

  update(key, headers, status) {
    const b = this.bucket(key);
    const rulesHeader = getHeader(headers, 'X-Rate-Limit-Rules');
    const t = this.now();
    if (rulesHeader) {
      const rules = [];
      let maxServerHits = 0;
      for (const name of String(rulesHeader).split(',').map((s) => s.trim()).filter(Boolean)) {
        const limits = parseRuleList(getHeader(headers, `X-Rate-Limit-${name}`));
        const state = parseRuleList(getHeader(headers, `X-Rate-Limit-${name}-State`));
        limits.forEach((l, i) => {
          rules.push({ maxHits: l.a, period: l.period, penalty: l.c });
          const s = state[i];
          if (s) {
            if (s.c > 0) b.blockedUntil = Math.max(b.blockedUntil, t + s.c * 1000);
            // Server knows about hits from other tools/browser tabs: mirror them.
            const windowStart = t - l.period * 1000;
            const known = b.hits.filter((h) => h > windowStart).length;
            if (s.a > known) maxServerHits = Math.max(maxServerHits, s.a - known);
          }
        });
      }
      for (let i = 0; i < maxServerHits; i++) b.hits.push(t);
      if (rules.length) {
        b.rules = rules;
        b.learned = true;
      }
    }
    if (status === 429) {
      const ra = Number(getHeader(headers, 'Retry-After')) || 60;
      b.blockedUntil = Math.max(b.blockedUntil, t + ra * 1000);
      this.stats.last429 = new Date(t).toISOString();
    }
  }

  snapshot() {
    const out = {};
    for (const [k, b] of this.buckets) {
      out[k] = {
        rules: b.rules,
        recentHits: b.hits.length,
        blockedForMs: Math.max(0, b.blockedUntil - this.now()),
        nextAllowedInMs: this.waitTime(k),
      };
    }
    return { ...this.stats, buckets: out };
  }
}

module.exports = { RateLimiter, parseRuleList, getHeader };
