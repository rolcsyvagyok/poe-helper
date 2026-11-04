'use strict';
/**
 * Lossless PoE item filter parser. `serialize(parse(text)) === text` for any input,
 * because every block keeps its original lines. Generated blocks are rendered by
 * renderBlock() and spliced in as text.
 */

const BLOCK_START = /^\s*(Show|Hide|Minimal)\b(.*)$/;
const OPS = ['==', '!=', '<=', '>=', '=', '<', '>'];

/** Tokenize a value list: `"Divine Orb" "Chaos Orb" Unique 5` -> ['Divine Orb','Chaos Orb','Unique','5'] */
function tokenize(s) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1] != null ? m[1] : m[2]);
  return out;
}

function parseLine(raw) {
  // `raw` keeps its own "\r" (if any) so files with mixed line endings round-trip exactly.
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
  const commentIdx = indexOfComment(line);
  const body = (commentIdx >= 0 ? line.slice(0, commentIdx) : line).trim();
  const comment = commentIdx >= 0 ? line.slice(commentIdx + 1).trim() : null;
  if (!body) return { raw, keyword: null, comment };
  const m = /^(\S+)\s*(.*)$/.exec(body);
  const keyword = m[1];
  let rest = m[2] || '';
  let op = null;
  for (const o of OPS) {
    if (rest.startsWith(o)) {
      op = o;
      rest = rest.slice(o.length).trim();
      break;
    }
  }
  // Count prefix for HasExplicitMod >=2 "a" "b"
  let count = null;
  if (/^\d+\s/.test(rest) && /^(HasExplicitMod|HasEnchantment|HasImplicitMod)$/.test(keyword)) {
    count = Number(rest.match(/^\d+/)[0]);
    rest = rest.replace(/^\d+\s+/, '');
  }
  return { raw, keyword, op, count, values: tokenize(rest), comment };
}

function indexOfComment(s) {
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') inQ = !inQ;
    else if (s[i] === '#' && !inQ) return i;
  }
  return -1;
}

/**
 * @returns {{segments: Array<{kind:'raw', lines:string[]} | {kind:'block', action, headerComment, lines:object[], startLine:number}>, eol:string}}
 */
function parse(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length;
  const eol = crlf > lf / 2 ? '\r\n' : '\n'; // used for lines we add
  const lines = text.split('\n'); // each line keeps a trailing "\r" if it had one
  const segments = [];
  let current = null;
  let raw = { kind: 'raw', lines: [] };

  const flushRaw = () => {
    if (raw.lines.length) segments.push(raw);
    raw = { kind: 'raw', lines: [] };
  };

  // FilterBlade "switches off" tiers by commenting the whole block out: "#Show # $type->x $tier->y"
  // followed by "#\tBaseType ...". We read those as disabled blocks (the leading "#" is
  // stripped from every line and put back by serialize), so they can be switched on again.
  const DISABLED_START = /^#(Show|Hide|Minimal)\b(.*\$type->\S+.*\$tier->\S+.*)$/;
  lines.forEach((line, i) => {
    const plain = line.replace(/\r$/, '');
    if (current && current.disabled) {
      if (plain.startsWith('#') && plain.trim() !== '#' && !DISABLED_START.test(plain) && !/^#\s*!!/.test(plain)) {
        current.lines.push(parseLine(line.slice(1)));
        return;
      }
      segments.push(current);
      current = null;
    }
    const dm = DISABLED_START.exec(plain);
    if (dm) {
      if (current) segments.push(current);
      flushRaw();
      const hc = dm[2].trim();
      current = { kind: 'block', action: dm[1], disabled: true, headerRaw: line.slice(1), headerComment: hc.startsWith('#') ? hc.slice(1).trim() : null, lines: [], startLine: i + 1 };
      return;
    }
    const bm = BLOCK_START.exec(plain);
    if (bm && !line.trim().startsWith('#')) {
      if (current) segments.push(current);
      flushRaw();
      const hc = bm[2].trim();
      current = { kind: 'block', action: bm[1], headerRaw: line, headerComment: hc.startsWith('#') ? hc.slice(1).trim() : null, lines: [], startLine: i + 1 };
      return;
    }
    if (current) {
      const trimmed = line.trim();
      // A block ends at the first blank line (or the next Show/Hide). Comment lines
      // inside a block stay with it so later conditions are never orphaned.
      if (trimmed === '') {
        segments.push(current);
        current = null;
        raw.lines.push(line);
        return;
      }
      current.lines.push(parseLine(line));
      return;
    }
    raw.lines.push(line);
  });
  if (current) segments.push(current);
  flushRaw();
  return { segments, eol };
}

function serialize(doc) {
  const out = [];
  for (const s of doc.segments) {
    if (s.kind === 'raw') out.push(...s.lines);
    else if (s.rendered != null) out.push(...s.rendered.split(/\r?\n/).map((l) => (doc.eol === '\r\n' ? l + '\r' : l)));
    else {
      const off = s.disabled ? '#' : '';
      out.push(off + (s.headerRaw ?? `${s.action}${s.headerComment ? ' # ' + s.headerComment : ''}`));
      out.push(...s.lines.map((l) => off + l.raw));
    }
  }
  return out.join('\n');
}

function blocks(doc) {
  return doc.segments.filter((s) => s.kind === 'block');
}

function quote(v) {
  return /^-?\d+$/.test(String(v)) || /^(True|False|Normal|Magic|Rare|Unique|None)$/.test(String(v)) ? String(v) : `"${String(v).replace(/"/g, '')}"`;
}

const SHAPES = ['Circle', 'Diamond', 'Hexagon', 'Square', 'Star', 'Triangle', 'Cross', 'Moon', 'Raindrop', 'Kite', 'Pentagon', 'UpsideDownHouse'];
const COLORS = ['Red', 'Green', 'Blue', 'Brown', 'White', 'Yellow', 'Cyan', 'Grey', 'Orange', 'Pink', 'Purple'];

/**
 * Render a generated block.
 * rule = { action, label, conditions:[{keyword, op, values, count}], style:{text, border, background, fontSize, sound:{id,volume}, customSound, beam:{color,temp}, icon:{size,color,shape}, disableDropSound}, continue }
 */
function renderBlock(rule, eol = '\n') {
  const lines = [`${rule.action || 'Show'}${rule.label ? ' # ' + rule.label.replace(/[\r\n]/g, ' ') : ''}`];
  for (const c of rule.conditions || []) {
    if (!c.keyword) continue;
    const vals = (c.values || []).map(quote).join(' ');
    lines.push(`\t${c.keyword}${c.op ? ' ' + c.op : ''}${c.count != null ? ' ' + c.count : ''}${vals ? ' ' + vals : ''}`);
  }
  lines.push(...renderStyleLines(rule.style || {}));
  if (rule.continue) lines.push('\tContinue');
  return lines.join(eol);
}

/** Style object -> filter lines (tab-indented). Shared by generated blocks and tier edits. */
function renderStyleLines(s = {}, indent = '\t') {
  const lines = [];
  const rgba = (a) => a.slice(0, 4).map((n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)))).join(' ');
  if (s.fontSize) lines.push(`SetFontSize ${Math.max(1, Math.min(45, s.fontSize))}`);
  if (s.text) lines.push(`SetTextColor ${rgba(s.text)}`);
  if (s.border) lines.push(`SetBorderColor ${rgba(s.border)}`);
  if (s.background) lines.push(`SetBackgroundColor ${rgba(s.background)}`);
  if (s.customSound) lines.push(`CustomAlertSound "${String(s.customSound).replace(/"/g, '')}"${s.customVolume ? ' ' + Math.max(0, Math.min(300, s.customVolume)) : ''}`);
  else if (s.sound?.id) lines.push(`${s.sound.positional ? 'PlayAlertSoundPositional' : 'PlayAlertSound'} ${s.sound.id} ${s.sound.volume ?? 300}`);
  if (s.disableDropSound) lines.push('DisableDropSound');
  if (s.beam?.color && COLORS.includes(s.beam.color)) lines.push(`PlayEffect ${s.beam.color}${s.beam.temp ? ' Temp' : ''}`);
  else if (s.beam === null || s.beam?.none) lines.push('PlayEffect None');
  if (s.icon?.color && COLORS.includes(s.icon.color) && SHAPES.includes(s.icon.shape)) lines.push(`MinimapIcon ${s.icon.size ?? 1} ${s.icon.color} ${s.icon.shape}`);
  else if (s.icon === null || s.icon?.none) lines.push('MinimapIcon -1');
  return lines.map((l) => indent + l);
}

/** Filter style lines (parsed) -> style object. Inverse of renderStyleLines. */
function styleFromLines(lines) {
  const s = {};
  const nums = (v) => v.map(Number);
  for (const l of lines) {
    const v = l.values || [];
    switch (l.keyword) {
      case 'SetFontSize': s.fontSize = Number(v[0]); break;
      case 'SetTextColor': s.text = nums(v).concat(v.length < 4 ? [255] : []).slice(0, 4); break;
      case 'SetBorderColor': s.border = nums(v).concat(v.length < 4 ? [255] : []).slice(0, 4); break;
      case 'SetBackgroundColor': s.background = nums(v).concat(v.length < 4 ? [255] : []).slice(0, 4); break;
      case 'PlayAlertSound':
      case 'PlayAlertSoundPositional':
        if (v[0] && v[0] !== 'None') s.sound = { id: /^\d+$/.test(v[0]) ? Number(v[0]) : v[0], volume: v[1] ? Number(v[1]) : 300, positional: l.keyword.endsWith('Positional') };
        break;
      case 'CustomAlertSound':
      case 'CustomAlertSoundOptional':
        if (v[0] && v[0] !== 'None') { s.customSound = v[0]; if (v[1]) s.customVolume = Number(v[1]); }
        break;
      case 'DisableDropSound': s.disableDropSound = true; break;
      case 'PlayEffect': if (v[0] && v[0] !== 'None') s.beam = { color: v[0], temp: v[1] === 'Temp' }; break;
      case 'MinimapIcon': if (v[0] !== '-1' && v[1]) s.icon = { size: Number(v[0]), color: v[1], shape: v[2] }; break;
      default:
    }
  }
  return s;
}

const STYLE_KEYWORDS = ['SetFontSize', 'SetTextColor', 'SetBorderColor', 'SetBackgroundColor', 'PlayAlertSound', 'PlayAlertSoundPositional', 'CustomAlertSound', 'CustomAlertSoundOptional', 'DisableDropSound', 'EnableDropSound', 'DisableDropSoundIfAlertSound', 'EnableDropSoundIfAlertSound', 'PlayEffect', 'MinimapIcon'];

module.exports = { parse, serialize, blocks, parseLine, tokenize, renderBlock, renderStyleLines, styleFromLines, STYLE_KEYWORDS, SHAPES, COLORS };
