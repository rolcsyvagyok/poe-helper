'use strict';
/**
 * Where an item sits in your loot filter, in words and as a place in the app: the rule that decides it
 * (from explain()) mapped to the Loot filter page part that makes or holds that rule.
 *
 *   PoE Helper's own rules (top of the file)  -> My bases, Base ranks, Campaign, value tiers, your rules
 *   FilterBlade tiers ($type-> $tier-> tags)  -> that category and tier
 *   other FilterBlade rules                   -> the section of the file it is in ("[0609] Gloves")
 */

const MARK = '#### POE-HELPER';

const OWN = [
  [/^My bases:/, 'My bases', 'mybases'],
  [/^Cluster jewels:/, 'Cluster jewels', 'clustergrid'],
  [/^(Base ranks|Base visibility|Bases you hid)\b/, 'Base ranks', 'basematrix'],
  [/^Campaign:/, 'Campaign', 'campaignhide'],
  [/^Economy:/, 'Value tiers', null],
];

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const titleCase = (s) => (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()));

/** The FilterBlade section a line is in: the nearest "# [[0600]] Name" above it, and "# [0609] Name" if there is one. */
function sectionOf(lines, lineNo) {
  let sub = null;
  for (let i = Math.min(lineNo - 2, lines.length - 1); i >= 0; i--) {
    const l = lines[i];
    if (!l.startsWith('#')) continue;
    const top = /^#\s*\[\[(\d{4})\]\]\s*(.+?)\s*$/.exec(l);
    if (top) return { top: titleCase(clean(top[2])), sub };
    if (!sub) {
      const s = /^#\s*\[(\d{4})\]\s*(.+?)\s*$/.exec(l);
      if (s) sub = titleCase(clean(s[2]));
    }
  }
  return sub ? { top: null, sub } : null;
}

/**
 * @param {string} text      the filter file the game reads
 * @param {object} hit       explain() result: { line, comment, chain }
 * @param {function} tierLabel (type, tier) -> { category, key, name } (name: your own name for the tier), or null when the tier isn't known
 * @returns {{ text: string, tier?: object, goto: object|null } | null}
 */
function whereInFilter(text, hit, tierLabel = () => null) {
  if (!hit?.line) return null;
  const comment = clean(hit.comment);
  const lines = String(text || '').split(/\r?\n/);
  const markStart = lines.findIndex((l) => l.startsWith(`${MARK} START`));
  const markEnd = lines.findIndex((l) => l.startsWith(`${MARK} END`));
  const own = markStart >= 0 && markEnd > markStart && hit.line > markStart && hit.line <= markEnd + 1;

  for (const [re, name, special] of OWN) {
    if (re.test(comment)) {
      const detail = comment.replace(re, '').replace(/^[:\s,]+/, '');
      return { text: detail ? `${name}: ${detail}` : name, goto: special ? { page: 'filters', special } : null };
    }
  }
  if (own) return { text: comment ? `your rule "${comment}"` : 'one of your rules', goto: null };

  const tag = /\$type->(\S+)\s+\$tier->(\S+)/.exec(comment);
  if (tag) {
    const names = tierLabel(tag[1], tag[2]);
    // the tier's name is put together by the app (TierNames), which knows FilterBlade's tier ids
    if (names) return { text: names.category, tier: { type: tag[1], tier: tag[2], name: names.name || null }, goto: { page: 'filters', type: tag[1], key: names.key || `${tag[1]}|${tag[2]}` } };
  }
  const sec = sectionOf(lines, hit.line);
  if (sec) return { text: [sec.top, sec.sub].filter(Boolean).join(' › '), goto: null };
  return tag ? { text: `${tag[1]}, ${tag[2]}`, goto: null } : null;
}

module.exports = { whereInFilter, sectionOf };
