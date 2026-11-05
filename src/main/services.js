'use strict';
/**
 * Wires the core modules together. Kept free of Electron imports (except via
 * injected `secrets`) so it can be tested with plain Node.
 */

const path = require('path');
const { DiskCache, JsonStore } = require('../core/cache');
const { NinjaClient, trendOf, isBigChange } = require('../core/ninja');
const { GggClient } = require('../core/ggg');
const { RateLimiter } = require('../core/rate-limiter');
const { Pricer } = require('../core/pricer');
const { parseItem, classify } = require('../core/item-parser');
const { checkMap, DEFAULT_RULES } = require('../core/map-mods');
const { matchItemMods, buildQuery, summarizeListings, defaultProps } = require('../core/trade');
const { NetWorthTracker } = require('../core/networth');
const { FilterManager, economyRules, quickRule, SOUNDS, DEFAULT_TIER_SOUNDS, MY_BASES_STYLE } = require('../core/filter/manager');
const { explain } = require('../core/filter/matcher');
const tiers = require('../core/filter/tiers');
const tierPricing = require('../core/filter/tier-prices');
const designer = require('../core/filter/designer');

const VERSION = require('../../package.json').version;

const DEFAULT_SETTINGS = {
  leagueOverride: '',
  accountName: '',
  sessionEnc: null, // encrypted POESESSID
  contact: '', // optional contact for User-Agent, e.g. a GitHub URL
  hotkeyPrice: 'Alt+E',
  hotkeyPriceAdvanced: 'Ctrl+Alt+D',
  hotkeyLab: 'Alt+L', // daily lab overlay: pick a difficulty, see today's layout from poelab
  labLast: 'uber',
  labFavorite: null, // the lab the hotkey opens straight away (null: ask every time)
  labPages: {}, // your own poelab page addresses per difficulty, if poelab moves them
  labIndex: {}, // layouts kept on disk
  labOverlayBounds: null,
  labOpacity: 1,
  clipboardMode: true, // pop the overlay when you Ctrl+C an item in game
  restoreClipboard: true,
  overlayAutoHideMs: 0,
  overlayCloseOnMouseAway: true,
  overlayPos: null, // where you last dragged the price check
  minimizeToTray: false,
  customAppIcon: false, // your own tray/app icon in <userData>/app-icon.png
  trayHintShown: false,
  categoryIcons: {}, // type -> built-in icon name or "img:<file>"
  baseFilterName: null, // the chosen filter's name, to find it again if the game renames the file
  economyRetired: false,
  gameSoundFiles: {}, // game sound number -> your own recording (my-*.mp3) used for previews only
  versionSeen: null, // {version, at, from}: when this copy first ran its current version
  notesShownFor: null, // version whose patch notes you already saw
  gigaDone: false, // the default Giga tier in currency was set up once
  fbSideWidth: 300, // width of the loot filter's category list
  clusterGrid: {}, // cluster jewels: { "Large|Fire Damage|12|84": 'top' | 'good' | 'hide' }
  baseMatrix: {}, // base visibility: { "Vaal Regalia": { vis: 'hide', frac: 'show' } }
  baseMatrixOpts: { mapsOnly: true, keepIlvl: null },
  hideFractured: false, // also hide fractured copies of bases you hid
  hideSynthesised: false, // and synthesised ones
  bigBeltsDone: false,
  bigBeltsLookV2: false,
  gigaOwnLook: false, // you edited the Giga look yourself, so it stops following the top currency tier
  gigaLookV2: false,
  bigBeltsOwnLook: false, // the default "Big belts" tier in uniques was set up once
  myBases: [], // [{id, base, ilvlMin, ilvlMax, rarities, enabled}]
  myBasesStyle: null, // look of My bases (null = the default teal)
  categoryLayout: {}, // your names, new categories, order and subcategory placement in the filter list
  forcedNames: [], // item names you added with "Add anyway"
  startWithWindows: false,
  dailyGggBudget: 300,
  rateSafety: 0.5,
  ninjaBaseUrl: 'https://poe.ninja',
  ninjaTtlMin: 20,
  clientLogPath: '',
  autoSnapshotMin: 0,
  selectedTabs: [],
  minItemChaos: 0,
  mapRules: DEFAULT_RULES,
  tradeTolerance: 0.1,
  tradeStatus: 'securable', // Instant Buyout only
  tradeFetchListings: true,
  filterDir: '',
  baseFilter: '',
  overrides: [],
  economy: { enabled: false, thresholds: { top: 100, high: 20, mid: 5, hideDivBelow: 0, sounds: { top: 'divine-tink', high: 'chime', mid: 'soft-bell', multi: 'coin' } } },
  autoWatchFilter: true,
  tierPatch: { moves: {}, styles: {}, actions: {} },
  labelFontPath: '',
  filterPins: ['currency', 'divination', 'fragments->scarabs', 'uniques'],
  // Price review / auto-tiering. categories[type] = { enabled, thresholds: { tier: chaos } }
  priceReview: { minListings: 5, margin: 1.5, auto: false, includeNew: false, categories: {} },
  priceReviewLog: [],
  // Tier designer: draft design, saved designs, and what Apply replaced (for undo)
  designer: { levels: null, presetId: 'classic', lockTier1: true, groups: null },
  designerThemes: [],
  designerUndo: null,
  themes: [],
  history: [],
};

function createServices({ dataDir, secrets, fetchImpl, log = console.log }) {
  const settings = new JsonStore(path.join(dataDir, 'settings.json'), DEFAULT_SETTINGS);
  const snapshots = new JsonStore(path.join(dataDir, 'networth.json'), { snapshots: [] });
  const usage = new JsonStore(path.join(dataDir, 'usage.json'), {});
  const cache = new DiskCache(path.join(dataDir, 'cache'));

  const userAgent = () => {
    const c = settings.get('contact');
    return `PoEHelper/${VERSION} (personal desktop tool${c ? '; contact: ' + c : ''})`.replace(/[^\x20-\x7E]/g, '');
  };

  const ninja = new NinjaClient({ cache, fetchImpl, userAgent: userAgent(), baseUrl: settings.get('ninjaBaseUrl'), ttlMs: settings.get('ninjaTtlMin') * 60000, log });
  const limiter = new RateLimiter({ safety: settings.get('rateSafety') });
  const { LabClient, DIFFS: LAB_DIFFS } = require('../core/lab');
  const lab = new LabClient({ dir: path.join(dataDir, 'lab'), fetchImpl, userAgent: userAgent(), log, store: settings });
  /** Today's layout as a picture the windows can show (they only load pictures from the app). */
  async function labLayout({ diff, refresh = false } = {}) {
    const d = diff || settings.get('labLast') || 'uber';
    lab.userAgent = userAgent();
    const r = await lab.layout(d, { refresh });
    settings.set('labLast', d);
    const fs = require('fs');
    const ext = path.extname(r.file).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return { diff: d, name: LAB_DIFFS.find((x) => x.id === d).name, favorite: settings.get('labFavorite') || null, date: r.date, today: r.today, stale: r.stale, page: r.page, dataUrl: `data:${mime};base64,${fs.readFileSync(r.file).toString('base64')}` };
  }
  const ggg = new GggClient({
    cache,
    fetchImpl,
    userAgent: userAgent(),
    usage,
    dailyBudget: settings.get('dailyGggBudget'),
    limiter,
    getSessionId: () => secrets.decrypt(settings.get('sessionEnc')),
    getAccountName: () => settings.get('accountName'),
    log,
  });

  let leagueCache = null;
  async function getLeague() {
    const o = settings.get('leagueOverride');
    if (o) return o;
    if (!leagueCache || Date.now() - leagueCache.at > 3600000) {
      leagueCache = { at: Date.now(), id: await ninja.currentLeague().catch(() => 'Standard') };
    }
    return leagueCache.id;
  }

  const pricer = new Pricer({ ninja, getLeague });

  // 1.0.3 retired the "Price tiers" tab: its highlights sat on top of your tiers. Switch them off once.
  if (!settings.get('economyRetired')) {
    const eco = settings.get('economy');
    if (eco?.enabled) settings.set('economy', { ...eco, enabled: false });
    settings.set('economyRetired', true);
  }

  // Net worth uses the snapshot store but reads tab selection from settings
  const nwStore = {
    get: (k) => (k === 'selectedTabs' || k === 'minItemChaos' ? settings.get(k) : snapshots.get(k)),
    set: (k, v) => (k === 'selectedTabs' || k === 'minItemChaos' ? settings.set(k, v) : snapshots.set(k, v)),
  };
  const networth = new NetWorthTracker({ ggg, ninja, store: nwStore, getLeague, log });
  const userSoundsDir = path.join(dataDir, 'sounds');
  const filters = new FilterManager({ store: settings, soundsDir: path.join(__dirname, '..', 'renderer', 'sounds'), userSoundsDir, log });
  // Names poe.ninja spelled out for us are safe to write into the filter as BaseType values.
  // Unique names never are (BaseType is "Heavy Belt", not "Mageblood"), only their bases.
  const ninjaCategory = ninja.category.bind(ninja);
  ninja.category = async (league, type) => {
    const list = await ninjaCategory(league, type);
    for (const l of list || []) {
      if (l.baseType) filters.verifiedNames.add(l.baseType);
      if (!l.guessed && !/^Unique/.test(type) && l.name) filters.verifiedNames.add(l.name);
    }
    return list;
  };

  function applySettings() {
    ninja.userAgent = userAgent();
    ninja.baseUrl = String(settings.get('ninjaBaseUrl') || 'https://poe.ninja').replace(/\/$/, '');
    ninja.ttlMs = Math.max(5, Number(settings.get('ninjaTtlMin')) || 20) * 60000;
    ggg.userAgent = userAgent();
    ggg.dailyBudget = Math.max(1, Number(settings.get('dailyGggBudget')) || 300);
    limiter.safety = Math.min(0.9, Math.max(0.2, Number(settings.get('rateSafety')) || 0.5));
    leagueCache = null;
  }

  // ---------- operations used by IPC ----------

  async function priceText(text) {
    const item = readItem(text);
    if (!item) return { error: 'Clipboard does not contain a Path of Exile item.' };
    const kind = classify(item);
    const price = await pricer.price(item).catch((e) => ({ error: e.message }));
    const map = kind === 'map' || kind === 'unique-map' ? checkMap(item, settings.get('mapRules')) : null;
    let filterHit = null;
    try {
      const doc = filters.parsedActive();
      if (doc) filterHit = explain(doc, item);
    } catch { /* no filter configured */ }
    const tradeable = ['rare', 'magic', 'unique', 'normal', 'gem', 'unique-map', 'map'].includes(kind);
    const entry = { at: Date.now(), name: item.name !== item.typeLine && item.name ? `${item.name} ${item.typeLine}` : item.typeLine, kind, chaos: price.chaos ?? null, total: price.totalChaos ?? null };
    const hist = [entry, ...(settings.get('history') || [])].slice(0, 100);
    settings.set('history', hist);
    const tierInfo = tierInfoFor(item, filterHit);
    return { item: slimItem(item), kind, price, map, filterHit, tierInfo, tradeable };
  }

  async function tradePrepare(text) {
    const item = readItem(text);
    if (!item) throw new Error('Not an item.');
    const stats = await ggg.tradeStats(); // 1 request per week at most
    const mods = matchItemMods(stats, item, { tolerance: settings.get('tradeTolerance') ?? 0.1 });
    return { mods, props: defaultProps(item), kind: classify(item), status: settings.get('tradeStatus') || 'securable' };
  }

  async function tradeSearch({ text, mods, props = null, opts = {} }) {
    const item = readItem(text);
    if (!item) throw new Error('Not an item.');
    const league = await getLeague();
    const status = opts.status || settings.get('tradeStatus') || 'securable';
    const query = buildQuery(item, mods || [], { tolerance: settings.get('tradeTolerance'), ...opts, status, ...(props ? { props } : {}) });
    const res = await ggg.tradeSearch(league, query);
    const out = { url: ggg.tradeUrl(league, res.id), total: res.total ?? res.result?.length ?? 0, listings: null };
    if ((opts.fetchListings ?? settings.get('tradeFetchListings')) && res.result?.length) {
      const fetched = await ggg.tradeFetch(res.id, res.result.slice(0, 10));
      const divine = await ninja.divinePrice(league).catch(() => null);
      out.listings = summarizeListings(fetched, divine);
    }
    return out;
  }

  async function economyPrices(league) {
    const cats = ['DivinationCard', 'Currency', 'Fragment', 'Scarab', 'Fossil', 'Oil', 'Essence', 'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueJewel', 'UniqueFlask'];
    const prices = {};
    for (const c of cats) {
      try { prices[c] = await ninja.category(league, c); } catch (e) { log('economy category failed', c, e.message); }
    }
    return prices;
  }

  /** `preview: true` builds the tiers for display even while they are switched off. */
  async function regenerateEconomy({ preview = false } = {}) {
    const eco = settings.get('economy');
    if (!eco?.enabled && !preview) {
      filters.setEconomy([]);
      return [];
    }
    const league = await getLeague();
    const prices = await economyPrices(league);
    // thresholds can be typed in divines; poe.ninja's current Divine Orb price turns them into chaos
    const th = { ...(eco?.thresholds || {}) };
    if (th.unit === 'divine') {
      const units = await currencyUnits(league);
      const div = units.divine || 0;
      if (!div) throw new Error('poe.ninja has no Divine Orb price right now, so divine thresholds can\'t be used. Try again later or switch to chaos.');
      for (const k of ['top', 'high', 'mid', 'hideDivBelow']) if (Number(th[k])) th[k] = Number(th[k]) * div;
    }
    const rules = economyRules(prices, { ...th, sounds: { ...DEFAULT_TIER_SOUNDS, ...(eco?.thresholds?.sounds || {}) } });
    filters.setEconomy(eco?.enabled ? rules : []);
    return rules;
  }

  // ---------- version and patch notes ----------
  /** CHANGELOG.md -> [{version, date, notes: markdown lines}] newest first. */
  function changelog() {
    let text = '';
    try { text = require('fs').readFileSync(path.join(__dirname, '..', '..', 'CHANGELOG.md'), 'utf8'); } catch { return []; }
    const out = [];
    for (const part of text.split(/^## /m).slice(1)) {
      const [head, ...body] = part.split('\n');
      const m = /^(\S+)\s*(?:-\s*(\d{4}-\d{2}-\d{2}))?/.exec(head.trim());
      if (m) out.push({ version: m[1], date: m[2] || null, notes: body.join('\n').trim() });
    }
    return out;
  }
  /** Remembers when this copy first ran each version, so the app can say "updated on ...". */
  function versionInfo() {
    const notes = changelog();
    const mine = notes.find((n) => n.version === VERSION) || null;
    let seen = settings.get('versionSeen') || null;
    let justUpdated = false;
    if (!seen || seen.version !== VERSION) {
      justUpdated = !!seen; // a previous version ran here before
      seen = { version: VERSION, at: Date.now(), from: seen?.version || null };
      settings.set('versionSeen', seen);
    }
    return { version: VERSION, releasedAt: mine?.date || null, updatedAt: seen.at, updatedFrom: seen.from, justUpdated, notesShown: settings.get('notesShownFor') === VERSION };
  }

  // ---------- item pictures for the category list ----------
  // The pictures are the game's own, loaded at run time from GGG's image server through the links
  // poe.ninja gives with its prices (nothing is bundled). Uses the same 20-minute poe.ninja cache.
  async function categoryArt(names = []) {
    const league = await getLeague();
    const want = new Set(names);
    const out = {};
    let anyMap = null; // poe.ninja's map list often has no tiers (only Vaal temple maps), so any map picture will do
    for (const c of ['Currency', 'Fragment', 'Scarab', 'Essence', 'Fossil', 'Oil', 'DeliriumOrb', 'Omen', 'Tattoo', 'DivinationCard', 'UniqueAccessory', 'Map', 'BlightedMap', 'ClusterJewel', 'BaseType']) {
      if (Object.keys(out).length >= want.size) break;
      let list = [];
      try { list = await ninja.category(league, c); } catch { continue; }
      for (const l of list) {
        // cluster jewels are listed by their enchantment; their picture is the base's ("Large Cluster Jewel")
        if (c === 'ClusterJewel' && l.baseType && want.has(l.baseType) && !out[l.baseType] && l.icon) {
          const u = String(l.icon).startsWith('/') ? `https://web.poecdn.com${l.icon}` : String(l.icon);
          if (/^https:\/\/web\.poecdn\.com\//.test(u)) out[l.baseType] = u;
        }
        if ((c === 'Map' || c === 'BlightedMap') && !anyMap && l.icon) {
          const u = String(l.icon).startsWith('/') ? `https://web.poecdn.com${l.icon}` : String(l.icon);
          if (/^https:\/\/web\.poecdn\.com\//.test(u)) anyMap = u;
        }
        if (!l.icon || out[l.name] || !(want.has(l.name) || want.has(`*${c}`) || (c === 'Map' && want.has('*Map16')))) continue;
        let url = String(l.icon);
        if (url.startsWith('/')) url = `https://web.poecdn.com${url}`;
        if (!/^https:\/\/web\.poecdn\.com\//.test(url)) continue; // the only image host the app loads from
        if (want.has(l.name)) out[l.name] = url;
        if (want.has(`*${c}`) && !out[`*${c}`]) out[`*${c}`] = url; // "any item of this category"
        if (c === 'Map' && want.has('*Map16') && !out['*Map16'] && Number(l.mapTier) === 16) out['*Map16'] = url; // a tier 16 map
      }
      if (c === 'Map' && want.has('*Map16') && !out['*Map16'] && anyMap) out['*Map16'] = anyMap;
    }
    if (want.has('*Map16') && !out['*Map16'] && anyMap) out['*Map16'] = anyMap;
    return out;
  }

  // ---------- your own icons (category icons and the tray/app icon) ----------
  const userIconsDir = path.join(dataDir, 'icons');
  const ICON_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon' };
  function listIcons() {
    const fs = require('fs');
    let files = [];
    try { files = fs.readdirSync(userIconsDir); } catch { /* none yet */ }
    return files.filter((f) => /^[a-z0-9-]+\.(png|jpe?g|webp|gif|svg)$/i.test(f)).sort().map((f) => ({
      id: `img:${f}`,
      name: f.replace(/\.\w+$/, '').replace(/-\d+$/, '').replace(/-/g, ' '),
      url: `data:${ICON_MIME[f.split('.').pop().toLowerCase()]};base64,${fs.readFileSync(path.join(userIconsDir, f)).toString('base64')}`,
    }));
  }
  /** Saves an uploaded image (base64) as icons/<name>.<ext>. Small images only: they are shown at 16 to 24 px. */
  function importIcon({ name, data }) {
    const fs = require('fs');
    const m = /^(.*)\.(png|jpe?g|webp|gif|svg)$/i.exec(String(name || ''));
    if (!m) throw new Error('Use a .png, .jpg, .webp, .gif or .svg image.');
    const buf = Buffer.from(String(data || ''), 'base64');
    if (!buf.length) throw new Error('That image is empty.');
    if (buf.length > 512 * 1024) throw new Error('That image is over 512 KB. Icons show at 16 to 24 pixels, so a small one is plenty.');
    const slug = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'icon';
    const ext = m[2].toLowerCase();
    fs.mkdirSync(userIconsDir, { recursive: true });
    let file = `${slug}.${ext}`;
    for (let i = 2; fs.existsSync(path.join(userIconsDir, file)) && !fs.readFileSync(path.join(userIconsDir, file)).equals(buf); i++) file = `${slug}-${i}.${ext}`;
    fs.writeFileSync(path.join(userIconsDir, file), buf);
    return listIcons().find((x) => x.id === `img:${file}`);
  }
  function deleteIcon(id) {
    const file = path.basename(String(id || '').replace(/^img:/, ''));
    if (!/^[a-z0-9-]+\.(png|jpe?g|webp|gif|svg)$/i.test(file)) throw new Error('Unknown icon.');
    try { require('fs').unlinkSync(path.join(userIconsDir, file)); } catch { /* already gone */ }
    // categories using it go back to their default icon
    const icons = { ...(settings.get('categoryIcons') || {}) };
    for (const [k, v] of Object.entries(icons)) if (v === id) delete icons[k];
    settings.set('categoryIcons', icons);
    return true;
  }

  // ---------- your own sounds ----------
  const SOUND_EXT = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
  function userSounds() {
    let files = [];
    try { files = require('fs').readdirSync(userSoundsDir); } catch { /* none yet */ }
    return files.filter((f) => /^my-.+\.(mp3|wav|ogg)$/i.test(f)).sort().map((f) => ({ id: f, name: f.replace(/^my-/, '').replace(/\.\w+$/, '').replace(/-/g, ' '), note: 'your sound', user: true }));
  }
  function listSounds() {
    return [...SOUNDS, ...userSounds()];
  }
  /** Saves a dropped sound file as "my-<name>.<ext>". data is base64. */
  function importSound({ name, data }) {
    const fs = require('fs');
    const m = /^(.*)\.(mp3|wav|ogg)$/i.exec(String(name || ''));
    if (!m) throw new Error('Use an .mp3, .wav or .ogg file.');
    const buf = Buffer.from(String(data || ''), 'base64');
    if (!buf.length) throw new Error('That file is empty.');
    if (buf.length > 5 * 1024 * 1024) throw new Error('That sound is over 5 MB. Use a short clip.');
    const slug = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/^my-/, '').slice(0, 40) || 'sound';
    const ext = m[2].toLowerCase();
    fs.mkdirSync(userSoundsDir, { recursive: true });
    let file = `my-${slug}.${ext}`;
    for (let i = 2; fs.existsSync(path.join(userSoundsDir, file)) && !fs.readFileSync(path.join(userSoundsDir, file)).equals(buf); i++) file = `my-${slug}-${i}.${ext}`;
    fs.writeFileSync(path.join(userSoundsDir, file), buf);
    return userSounds().find((x) => x.id === file);
  }
  /** A data: URL so the app can play your sound (the file lives outside the app folder). */
  function soundData(id) {
    const file = path.basename(String(id || ''));
    if (!/^my-.+\.(mp3|wav|ogg)$/i.test(file)) throw new Error('Unknown sound.');
    const buf = require('fs').readFileSync(path.join(userSoundsDir, file));
    return `data:${SOUND_EXT[file.split('.').pop().toLowerCase()]};base64,${buf.toString('base64')}`;
  }

  /** Names written as given even though neither your filter nor poe.ninja lists them. */
  function trustNames(names) {
    settings.set('forcedNames', [...new Set([...(settings.get('forcedNames') || []), ...names.filter(Boolean)])].slice(-500));
  }

  function quickFilter(kind, text, opts = {}) {
    const item = readItem(text);
    if (!item) throw new Error('Not an item.');
    // the base came from the game's own item text, so it is a real name (magic names are only our reading)
    if (item.rarity !== 'Magic' && item.baseType) trustNames([item.baseType]);
    const rule = filters.addOverride(quickRule(kind, item, opts));
    const target = filters.basePath() ? filters.write() : null;
    return { rule, target };
  }

  function usageSnapshot() {
    return { ggg: ggg.snapshot(), ninja: ninja.stats };
  }

  // ---------- FilterBlade-style tiers ----------
  let viewCache = null;
  /**
   * Currency gets a "Giga" tier above everything, once, looking like the Divine Orb's tier and
   * holding the mirror-level items. Delete it and it stays deleted (giga.done is remembered).
   */
  const GIGA_ITEMS = ['Mirror of Kalandra', "Hinekora's Lock", 'Mirror Shard'];
  let gigaBusy = false;
  function ensureGiga(view) {
    if (gigaBusy || settings.get('gigaDone')) return null;
    const cur = view?.types.find((t) => t.type === 'currency');
    if (!cur) return null;
    gigaBusy = true;
    try {
      settings.set('gigaDone', true);
      let patch = settings.get('tierPatch') || {};
      if ((patch.newTiers || []).some((x) => x.type === 'currency')) return null; // you already made one
      const movable = cur.tiers.filter((x) => x.hasBaseList && !x.special && !x.generated);
      const look = movable.find((x) => x.bases.includes('Divine Orb')) || movable[0];
      const top = cur.tiers.find((x) => !x.generated);
      if (!look || !top) return null;
      let tier;
      [patch, tier] = tiers.withNewTier(patch, { type: 'currency', name: 'Giga', copyFrom: look.tier, before: top.tier });
      const known = new Set(cur.tiers.flatMap((x) => x.bases));
      for (const b of GIGA_ITEMS) if (known.has(b)) patch = tiers.withMove(patch, 'currency', b, tier);
      return savePatch(patch);
    } finally { gigaBusy = false; }
  }

  // "Big belts": Heavy Belt and Leather Belt carry the most valuable uniques, so they get a tier above S tier, once.
  const BIG_BELTS = ['Heavy Belt', 'Leather Belt'];
  function ensureBigBelts(view) {
    if (gigaBusy || settings.get('bigBeltsDone')) return null;
    const holds = (t) => t.tiers.some((x) => BIG_BELTS.some((b) => x.bases.includes(b)));
    const uni = view?.types.find((t) => t.type === 'uniques' && holds(t)) || view?.types.find((t) => /^uniques/.test(t.type) && holds(t));
    if (!uni) return null;
    gigaBusy = true;
    try {
      settings.set('bigBeltsDone', true);
      let patch = settings.get('tierPatch') || {};
      if ((patch.newTiers || []).some((x) => x.type === uni.type && x.name === 'Big belts')) return null;
      const movable = uni.tiers.filter((x) => x.hasBaseList && !x.special && !x.generated);
      // looks like the multi-base uniques, made a bit louder (synced in savePatch)
      const look = movable.find((x) => x.tier === 'multispecial') || movable.find((x) => /^multi/.test(x.tier)) || movable.find((x) => x.tier === 't1') || movable[0];
      // right above S tier, below NeverSink's special cases (synthesised, 6-links, Kaom's...)
      const top = uni.tiers.find((x) => x.tier === 't1') || uni.tiers.find((x) => !x.generated);
      if (!look || !top) return null;
      let tier;
      [patch, tier] = tiers.withNewTier(patch, { type: uni.type, name: 'Big belts', copyFrom: look.tier, before: top.tier });
      const known = new Set(uni.tiers.flatMap((x) => x.bases));
      for (const b of BIG_BELTS) if (known.has(b)) patch = tiers.withMove(patch, uni.type, b, tier);
      return savePatch(patch);
    } finally { gigaBusy = false; }
  }

  function tierViewNow() {
    const base = filters.basePath();
    if (!base) return null;
    let mtime;
    try { mtime = require('fs').statSync(base).mtimeMs; } catch { return null; }
    const patch = settings.get('tierPatch') || {};
    const sig = `${base}|${mtime}|${JSON.stringify(patch)}`;
    if (viewCache?.sig !== sig) viewCache = { sig, view: tiers.tierView(filters.readBase(), patch) };
    if (!settings.get('gigaDone') && !gigaBusy) { const r = ensureGiga(viewCache.view); if (r?.view) return r.view; }
    if (!settings.get('bigBeltsDone') && !gigaBusy) { const r = ensureBigBelts(viewCache.view); if (r?.view) return r.view; }
    // 1.0.6: Big belts was made with the S tier look; give it the multi-base look once
    if (settings.get('bigBeltsDone') && !settings.get('bigBeltsLookV2') && !gigaBusy) {
      settings.set('bigBeltsLookV2', true);
      const p = settings.get('tierPatch') || {};
      const next = syncBigBelts(p);
      if (next !== p) { gigaBusy = true; try { const r = savePatch(next); if (r?.view) return r.view; } finally { gigaBusy = false; } }
    }
    // 1.0.6: Giga follows the theme's top currency look
    if (settings.get('gigaDone') && !settings.get('gigaLookV2') && !gigaBusy) {
      settings.set('gigaLookV2', true);
      const p = settings.get('tierPatch') || {};
      const next = syncGiga(p);
      if (next !== p) { gigaBusy = true; try { const r = savePatch(next); if (r?.view) return r.view; } finally { gigaBusy = false; } }
    }
    return viewCache.view;
  }

  /** Saves the patch and rewrites the "(helper)" copy right away. */
  // Big belts follows the multi-base uniques' look ("High variety - multi-bases"), a bit more visible:
  // bigger text, a beam when it drops, a larger minimap icon and a sound. It keeps following that tier
  // (also through themes and the designer) until you edit the Big belts look yourself.
  function louder(st = {}) {
    const s2 = JSON.parse(JSON.stringify(st || {}));
    s2.fontSize = Math.min(45, (Number(s2.fontSize) || 40) + 5);
    if (!s2.beam) s2.beam = { color: 'Orange', temp: true };
    s2.icon = s2.icon ? { ...s2.icon, size: Math.max(0, (Number(s2.icon.size) || 2) - 1) } : { size: 1, color: 'Orange', shape: 'Star' };
    if (!s2.sound && !s2.customSound) s2.sound = { id: 2, volume: 300 };
    return s2;
  }
  function syncBigBelts(patch) {
    if (settings.get('bigBeltsOwnLook')) return patch;
    const nt = (patch.newTiers || []).find((x) => x.name === 'Big belts');
    if (!nt) return patch;
    let view = null;
    try { view = tiers.tierView(filters.readBase(), patch); } catch { return patch; }
    const uni = view?.types.find((t) => t.type === nt.type);
    const multi = uni?.tiers.find((t) => t.tier === 'multispecial') || uni?.tiers.find((t) => /^multi/.test(t.tier));
    if (!multi?.style) return patch;
    const key = `${nt.type}|${nt.tier}`;
    const want = louder(multi.style);
    if (JSON.stringify(patch.styles?.[key]) === JSON.stringify(want)) return patch;
    return tiers.withStyle(patch, key, want);
  }

  // Giga follows the top currency tier it was copied from (Divine/Exalted level), a bit louder, so a
  // designer theme or a theme you apply restyles it too, until you edit the Giga look yourself.
  function syncGiga(patch) {
    if (settings.get('gigaOwnLook')) return patch;
    const nt = (patch.newTiers || []).find((x) => x.type === 'currency' && x.name === 'Giga');
    if (!nt) return patch;
    let view = null;
    try { view = tiers.tierView(filters.readBase(), patch); } catch { return patch; }
    const src = view?.types.find((t) => t.type === 'currency')?.tiers.find((t) => t.tier === nt.copyFrom);
    if (!src?.style) return patch;
    const key = `currency|${nt.tier}`;
    const want = louder(src.style);
    if (JSON.stringify(patch.styles?.[key]) === JSON.stringify(want)) return patch;
    return tiers.withStyle(patch, key, want);
  }

  function savePatch(patch) {
    patch = syncGiga(syncBigBelts(patch));
    settings.set('tierPatch', patch);
    const target = filters.basePath() ? filters.write() : null;
    return { view: tierViewNow(), target, leftOut: filters.lastDropped };
  }

  function moveBases(type, bases, to, { force = false } = {}) {
    const view = tierViewNow();
    if (!view) throw new Error('Choose your filter first.');
    if (force) trustNames(bases);
    let patch = settings.get('tierPatch') || {};
    const origType = tiers.extractTiers(require('../core/filter/parser').parse(filters.readBase())).find((t) => t.type === type);
    for (const base of bases) {
      // Moving a base back to where the filter originally had it just drops the edit.
      const orig = origType?.tiers.find((t) => t.bases.includes(base))?.tier;
      patch = orig === to ? tiers.withoutMove(patch, type, base) : tiers.withMove(patch, type, base, to);
    }
    return savePatch(patch);
  }

 // ---------- My bases ----------
  function myBases() {
    return { list: settings.get('myBases') || [], style: settings.get('myBasesStyle') || MY_BASES_STYLE };
  }
  function saveMyBases(list) {
    settings.set('myBases', list);
    const target = filters.basePath() ? filters.write() : null;
    return { ...myBases(), target, leftOut: filters.lastDropped };
  }
  /** From the price check (text) or typed in (base). Same base + same range isn't added twice. */
  function addMyBase({ text = null, base = null, ilvlMin = null, ilvlMax = null, rarities = null, group = 'mybases', passivesMin = null, passivesMax = null, action = 'Show' } = {}) {
    let b = base ? String(base).trim() : null;
    let itemClass = null;
    if (text) {
      const item = readItem(text);
      if (!item) throw new Error('Not an item.');
      if (item.rarity === 'Unique') throw new Error('Uniques are tiered under Unique items; My bases is for normal, magic and rare bases.');
      b = item.baseType || item.typeLine;
      itemClass = item.itemClass || null;
      if (item.rarity !== 'Magic') trustNames([b]); // read from the game's own item text
    }
    if (!b) throw new Error('Type a base name.');
    const num = (v) => (v === '' || v == null || !Number.isFinite(+v) ? null : Math.max(1, Math.min(100, Math.round(+v))));
    const small = (v) => (v === '' || v == null || !Number.isFinite(+v) ? null : Math.max(1, Math.min(12, Math.round(+v))));
    const entry = { id: `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, group: group === 'cluster' ? 'cluster' : 'mybases', base: b, itemClass, ilvlMin: num(ilvlMin), ilvlMax: num(ilvlMax), passivesMin: small(passivesMin), passivesMax: small(passivesMax), action: action === 'Hide' ? 'Hide' : 'Show', rarities: Array.isArray(rarities) && rarities.length ? rarities : ['Normal', 'Magic', 'Rare'], enabled: true, addedAt: Date.now() };
    const list = settings.get('myBases') || [];
    const same = (e) => e.base === entry.base && e.ilvlMin === entry.ilvlMin && e.ilvlMax === entry.ilvlMax && (e.passivesMin ?? null) === entry.passivesMin && (e.passivesMax ?? null) === entry.passivesMax && (e.action || 'Show') === entry.action;
    if (list.some(same)) throw new Error(`${entry.base} with those settings is already there.`);
    return { ...saveMyBases([entry, ...list]), entry };
  }
  function updateMyBase(id, patch = {}) {
    const keep = ['ilvlMin', 'ilvlMax', 'rarities', 'enabled', 'base', 'passivesMin', 'passivesMax', 'action'];
    return saveMyBases((settings.get('myBases') || []).map((e) => (e.id === id ? { ...e, ...Object.fromEntries(Object.entries(patch).filter(([k]) => keep.includes(k))) } : e)));
  }
  function removeMyBase(id) {
    return saveMyBases((settings.get('myBases') || []).filter((e) => e.id !== id));
  }
  function setMyBasesStyle(style) {
    settings.set('myBasesStyle', style || null);
    return saveMyBases(settings.get('myBases') || []);
  }

  /** Your own tier, e.g. "Giga" above Tier 1 in currency, looking like the Divine Orb's tier. */
  function addTier({ type, name, copyFrom, before }) {
    const view = tierViewNow();
    const t = view?.types.find((x) => x.type === type);
    if (!t) throw new Error('Choose a category first.');
    const src = t.tiers.find((x) => x.tier === copyFrom) || t.tiers.find((x) => x.hasBaseList && !x.special && !x.generated);
    if (!src) throw new Error('This category has no tier to copy.');
    const [patch, tier] = tiers.withNewTier(settings.get('tierPatch') || {}, { type, name: String(name || '').trim() || 'My tier', copyFrom: src.tier, before: before || src.tier });
    return { ...savePatch(patch), tier };
  }
  function removeTier({ type, tier }) {
    return savePatch(tiers.withoutNewTier(settings.get('tierPatch') || {}, type, tier));
  }
  function renameTier({ type, tier, name }) {
    const p = tiers.clonePatch(settings.get('tierPatch') || {});
    const nt = p.newTiers.find((x) => x.type === type && x.tier === tier);
    if (nt) nt.name = String(name || '').trim().slice(0, 40) || nt.name;
    return savePatch(p);
  }

  function setStackSize(key, n) {
    return savePatch(tiers.withStackSize(settings.get('tierPatch') || {}, key, n));
  }

  function setTierAction(key, action) {
    const tier = tierViewNow()?.types.flatMap((t) => t.tiers).find((t) => t.key === key);
    // back to what FilterBlade had: drop the change rather than store a no-op
    if (tier && action === tier.origState) action = null;
    return savePatch(tiers.withAction(settings.get('tierPatch') || {}, key, action));
  }

  /** Names to suggest when typing an item into a tier: everything in the filter plus poe.ninja's list for this category. */
  async function tierSuggest(type) {
    const view = tierViewNow();
    const names = new Set();
    for (const t of view?.types || []) for (const tier of t.tiers) for (const b of tier.bases) names.add(b);
    const cats = tierPricing.categoriesForType(type);
    if (cats.length) {
      const league = await getLeague();
      for (const c of cats) {
        try {
          for (const l of await ninja.category(league, c)) names.add(type.split('->')[0] === 'uniques' && !type.includes('->') ? l.baseType || l.name : l.name);
        } catch { /* cached failure or offline: filter names only */ }
      }
    }
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  function setTierStyle(key, style) {
    // editing Big belts yourself stops it following the multi-base look; resetting it starts again
    if (/\|poehelper-bigbelts$/.test(key)) settings.set('bigBeltsOwnLook', !!style);
    if (/^currency\|poehelper-giga\d*$/.test(key)) settings.set('gigaOwnLook', !!style);
    return savePatch(tiers.withStyle(settings.get('tierPatch') || {}, key, style));
  }

  function resetTiers({ key, type, types = null, base, all } = {}) {
    let patch = settings.get('tierPatch') || {};
    if (all) patch = {};
    if (key) patch = tiers.withStyle(patch, key, null);
    if (type && base) patch = tiers.withoutMove(patch, type, base);
    // a whole category (or several): every move, look and Shown/Hidden/Off change in it
    const typesToReset = types || (type && !base ? [type] : null);
    if (typesToReset) {
      const inType = (k, sep) => typesToReset.includes(k.split(sep)[0]);
      patch = {
        moves: Object.fromEntries(Object.entries(patch.moves || {}).filter(([k]) => !inType(k, '\t'))),
        styles: Object.fromEntries(Object.entries(patch.styles || {}).filter(([k]) => !inType(k, '|'))),
        actions: Object.fromEntries(Object.entries(patch.actions || {}).filter(([k]) => !inType(k, '|'))),
      };
    }
    return savePatch(patch);
  }

  // ---------- themes: a named set of tier looks ----------
  function themes() {
    return settings.get('themes') || [];
  }
  function saveTheme(name, { onlyEdited = false } = {}) {
    const view = tierViewNow();
    if (!view) throw new Error('Choose your filter first.');
    const styles = tiers.themeFromView(view, onlyEdited ? view.editedStyles : null);
    const theme = { id: `t_${Date.now()}`, name: String(name || 'My theme').slice(0, 60), styles, createdAt: Date.now() };
    settings.set('themes', [theme, ...themes().filter((t) => t.name !== theme.name)]);
    return theme;
  }
  function applyTheme(idOrTheme) {
    const theme = typeof idOrTheme === 'string' ? themes().find((t) => t.id === idOrTheme) : idOrTheme;
    if (!theme?.styles) throw new Error('That theme is empty or missing.');
    const view = tierViewNow();
    if (!view) throw new Error('Choose your filter first.');
    const existing = new Set(view.types.flatMap((t) => t.tiers.map((x) => x.key)));
    let patch = settings.get('tierPatch') || {};
    let applied = 0;
    for (const [key, style] of Object.entries(theme.styles)) {
      if (!existing.has(key)) continue;
      patch = tiers.withStyle(patch, key, style);
      applied++;
    }
    return { ...savePatch(patch), applied, total: Object.keys(theme.styles).length };
  }
  function deleteTheme(id) {
    settings.set('themes', themes().filter((t) => t.id !== id));
    return themes();
  }
  function importTheme(json) {
    const t = typeof json === 'string' ? JSON.parse(json) : json;
    if (!t || typeof t.styles !== 'object' || t.format !== 'poe-helper-theme') throw new Error('This file is not a PoE Helper theme.');
    const theme = { id: `t_${Date.now()}`, name: String(t.name || 'Imported theme').slice(0, 60), styles: t.styles, createdAt: Date.now() };
    settings.set('themes', [theme, ...themes()]);
    return theme;
  }
  function exportTheme(id) {
    const t = themes().find((x) => x.id === id);
    if (!t) throw new Error('Theme not found.');
    return JSON.stringify({ format: 'poe-helper-theme', version: 1, name: t.name, styles: t.styles }, null, 2);
  }

  /** Current poe.ninja prices for one FilterBlade category, compared with its tiers. Uses the shared price cache. */
  async function tierPrices(type) {
    const view = tierViewNow();
    const t = view?.types.find((x) => x.type === type);
    if (!t) throw new Error('Category not found in your filter.');
    const cats = tierPricing.categoriesForType(type);
    if (!cats.length) return { supported: false, type };
    const league = await getLeague();
    const data = {};
    let oldest = 0;
    for (const c of cats) {
      try { data[c] = await ninja.category(league, c); oldest = Math.max(oldest, ninja.cachedAge(league, c) || 0); } catch (e) { log('tier prices', c, e.message); }
    }
    const res = tierPricing.analyse(t, tierPricing.priceIndex(type, data));
    return { supported: true, type, league, ageMs: oldest, divine: await ninja.divinePrice(league).catch(() => null), filterUpdated: filterLastUpdate(), ...res };
  }

  // ---------- cluster jewels: enchantment x passives x item level, priced by poe.ninja ----------
  async function clusterView() {
    const cl = require('../core/cluster');
    const view = tierViewNow();
    const eco = view?.types.find((t) => t.type === 'jewels->clustereco') || null;
    const fromFilter = cl.readFilter(eco);
    const bySize = cl.readSizeTiers(view?.types.find((t) => t.type === 'jewels->cluster') || null);
    let prices = {};
    let ageMs = null;
    let priceStats = null;
    try {
      const league = await getLeague();
      priceStats = { total: 0, missed: [] };
      prices = cl.priceCells(await ninja.category(league, 'ClusterJewel'), priceStats);
      ageMs = ninja.cachedAge(league, 'ClusterJewel');
    } catch (e) { log('cluster prices', e.message); }
    const units = await getLeague().then((lg) => currencyUnits(lg)).catch(() => ({ chaos: 1 }));
    const enchants = Object.fromEntries(cl.SIZES.map((z) => [z.id, [...cl.ENCHANTS[z.id], ...fromFilter.extra[z.id].filter((e) => cl.ALL_ENCHANTS.includes(e) && !cl.ENCHANTS[z.id].includes(e))]]));
    return { sizes: cl.SIZES, bands: cl.BANDS, enchants, filter: fromFilter.cells, bySize, looks: { ...cl.DEFAULT_LOOKS, ...(fromFilter.looks.Large || {}) }, sizeLooks: fromFilter.looks, prices, ageMs, priceStats: priceStats && { total: priceStats.total, matched: priceStats.total - priceStats.missed.length, missed: priceStats.missed.slice(0, 40) }, divine: units.divine || null, state: settings.get('clusterGrid') || {}, hasFilterTiers: !!eco };
  }
  /** Set cells: value 'top' | 'good' | 'hide' | null (back to the filter). */
  function setCluster({ keys = [], value = null } = {}) {
    const cl = require('../core/cluster');
    const state = { ...(settings.get('clusterGrid') || {}) };
    for (const k of keys) {
      const [size, e, p, band] = String(k).split('|');
      if (!cl.SIZES.some((z) => z.id === size && z.passives.includes(Number(p))) || !cl.ALL_ENCHANTS.includes(e) || !cl.BANDS.some((b) => b.id === band)) continue;
      if (['top', 'good', 'hide'].includes(value)) state[k] = value; else delete state[k];
    }
    settings.set('clusterGrid', state);
    const target = filters.basePath() ? filters.write() : null;
    return { state, target };
  }

  // ---------- base visibility matrix (like FilterBlade's): which bases show, and their fractured copies ----------
  function baseMatrixView() {
    const { DEFENCES, CLASSES, BASES, GROUPS } = require('../core/base-data');
    let known = null;
    try { const t = filters.basePath() ? filters.readBase() : ''; known = new Set([...t.matchAll(/"([^"\r\n]+)"/g)].map((m) => m[1])); } catch { known = null; }
    const bases = {};
    for (const c of CLASSES) {
      bases[c] = {};
      for (const d of DEFENCES) bases[c][d.id] = (BASES[c][d.id] || []).map((name) => ({ name, inFilter: known ? known.has(name) : null }));
    }
    const mark = (name) => ({ name, inFilter: known ? known.has(name) : null });
    const groups = GROUPS.map((g) => ({ id: g.id, name: g.name, columns: Object.entries(g.columns).map(([title, list]) => ({ title, list: list.map(mark) })) }));
    return { defences: DEFENCES, classes: CLASSES, bases, groups, state: settings.get('baseMatrix') || {}, opts: { mapsOnly: true, keepIlvl: null, ...(settings.get('baseMatrixOpts') || {}) } };
  }
  /** Paint bases: vis 'hide' | null (filter decides), frac 'show' | 'hide' | null; undefined leaves it as it is. */
  function setBaseMatrix({ bases = [], vis, frac } = {}) {
    const { MATRIX_NAMES } = require('../core/filter/manager');
    const valid = new Set(MATRIX_NAMES);
    const state = { ...(settings.get('baseMatrix') || {}) };
    for (const b of bases) {
      if (!valid.has(b)) continue;
      const e = { ...(state[b] || {}) };
      if (vis !== undefined) { if (vis === 'hide') e.vis = 'hide'; else delete e.vis; }
      if (frac !== undefined) { if (frac === 'show' || frac === 'hide') e.frac = frac; else delete e.frac; }
      if (Object.keys(e).length) state[b] = e; else delete state[b];
    }
    settings.set('baseMatrix', state);
    const target = filters.basePath() ? filters.write() : null;
    return { state, target, leftOut: filters.lastDropped };
  }
  function setBaseMatrixOpts(o = {}) {
    const cur = { mapsOnly: true, keepIlvl: null, ...(settings.get('baseMatrixOpts') || {}) };
    if ('mapsOnly' in o) cur.mapsOnly = !!o.mapsOnly;
    if ('keepIlvl' in o) { const n = Math.round(Number(o.keepIlvl)); cur.keepIlvl = n >= 1 && n <= 100 ? n : null; }
    settings.set('baseMatrixOpts', cur);
    if (filters.basePath()) filters.write();
    return cur;
  }

  // ---------- "What to farm": poe.ninja's 7-day trend grouped by league mechanic (no GGG requests) ----------
  const FARM_GROUPS = [
    { id: 'currency', name: 'Currency', cats: ['Currency'], skip: /lifeforce|splinter|shard|fragment/i, art: 'Divine Orb' },
    { id: 'scarab', name: 'Scarabs', cats: ['Scarab'], art: '*Scarab' },
    { id: 'fragment', name: 'Fragments & splinters', cats: ['Fragment'], art: 'Fragment of the Shape' },
    { id: 'delirium', name: 'Delirium', cats: ['DeliriumOrb'], art: '*DeliriumOrb' },
    { id: 'harvest', name: 'Harvest', cats: ['Currency'], only: /lifeforce/i, art: 'Sacred Crystallised Lifeforce' },
    { id: 'blight', name: 'Blight', cats: ['Oil'], art: '*Oil' },
    { id: 'essence', name: 'Essence', cats: ['Essence'], art: '*Essence' },
    { id: 'delve', name: 'Delve', cats: ['Fossil', 'Resonator'], art: '*Fossil' },
    { id: 'ritual', name: 'Ritual', cats: ['Omen'], art: '*Omen' },
    { id: 'kingsmarch', name: 'Kingsmarch', cats: ['Tattoo', 'Runegraft'], art: '*Tattoo' },
    { id: 'expedition', name: 'Expedition', cats: ['Artifact', 'Astrolabe'], art: null },
    { id: 'divination', name: 'Divination cards', cats: ['DivinationCard'], art: '*DivinationCard' },
  ];
  async function farmDashboard() {
    const league = await getLeague();
    const divine = await ninja.divinePrice(league).catch(() => null);
    const slim = (l) => {
      const trend = trendOf(l.sparkline, l.chaos);
      return { name: l.name, chaos: l.chaos, icon: l.icon || null, volume: l.volume ?? l.listingCount ?? null, change: trend?.change ?? null, old: trend?.old ?? null, points: trend?.points || null, big: isBigChange(trend) };
    };
    const lists = {};
    let ageMs = 0;
    const load = async (c) => {
      if (lists[c]) return lists[c];
      try { lists[c] = await ninja.category(league, c); ageMs = Math.max(ageMs, ninja.cachedAge(league, c) || 0); } catch (e) { log('farm', c, e.message); lists[c] = []; }
      return lists[c];
    };
    const groups = [];
    const allMovers = [];
    for (const g of FARM_GROUPS) {
      let items = [];
      for (const c of g.cats) items.push(...(await load(c)));
      items = items.filter((l) => l.name && l.chaos > 0 && (!g.only || g.only.test(l.name)) && (!g.skip || !g.skip.test(l.name)));
      if (!items.length) continue;
      const rows = items.map(slim);
      // the market moves where the trading is: weight by how much of each item trades (volume x price)
      let nowSum = 0; let oldSum = 0;
      for (const r of rows) {
        if (r.old == null) continue;
        const w = Math.max(1, Number(r.volume) || 1);
        nowSum += r.chaos * w; oldSum += r.old * w;
      }
      const change = oldSum > 0 ? Math.round((nowSum / oldSum - 1) * 1000) / 10 : null;
      const traded = rows.filter((r) => (r.volume ?? 0) > 0).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 15);
      const typical = (traded.length ? traded : rows).map((r) => r.chaos).sort((a, b) => a - b);
      const top = [...rows].sort((a, b) => b.chaos - a.chaos).slice(0, 5);
      const moving = rows.filter((r) => r.change != null && Math.max(r.chaos, r.old || 0) >= 1);
      const up = [...moving].sort((a, b) => b.change - a.change).filter((r) => r.change > 0).slice(0, 3);
      const down = [...moving].sort((a, b) => a.change - b.change).filter((r) => r.change < 0).slice(0, 3);
      for (const r of rows) if (r.big) allMovers.push({ ...r, group: g.name });
      groups.push({ id: g.id, name: g.name, art: g.art, count: rows.length, change, typical: typical[Math.floor(typical.length / 2)] ?? null, top, up, down });
    }
    groups.sort((a, b) => (b.change ?? -1e9) - (a.change ?? -1e9));
    allMovers.sort((a, b) => Math.abs(Math.log((b.chaos + 0.1) / ((b.old ?? b.chaos) + 0.1))) - Math.abs(Math.log((a.chaos + 0.1) / ((a.old ?? a.chaos) + 0.1))));
    return { league, divine, ageMs, groups, movers: allMovers.slice(0, 40) };
  }
  // Categories auto-tiered by default. Uniques are opt-in: one base can hold a 1c and a 300c unique.
  const DEFAULT_REVIEW_TYPES = ['divination', 'fragments->scarabs', 'fragments', 'currency', 'currency->fossil', 'currency->oil', 'currency->essence', 'currency->deliriumorbs', 'currency->trial->omen', 'currency->trial->tattoo', 'runesgrafts', 'vials'];

  function reviewCfg() {
    const c = settings.get('priceReview') || {};
    return { minListings: 5, margin: 1.5, auto: false, includeNew: false, categories: {}, ...c };
  }

  /**
   * Check every priced category against poe.ninja and plan auto-tier moves.
   * Only poe.ninja (cached 20 min) is used; no GGG requests.
   */
  async function priceReview({ types = null, overrides = {} } = {}) {
    const view = tierViewNow();
    if (!view) throw new Error('Choose your filter first.');
    const cfg = reviewCfg();
    const league = await getLeague();
    const out = [];
    const knownAll = new Set(view.types.flatMap((t) => t.tiers.flatMap((x) => x.bases.map((b) => b.toLowerCase()))));
    const units = await currencyUnits(league);
    for (const t of view.types) {
      if (types && !types.includes(t.type)) continue;
      const cats = tierPricing.categoriesForType(t.type);
      if (!cats.length) continue;
      const catCfg = { ...(cfg.categories[t.type] || {}), ...(overrides[t.type] || {}) };
      const enabled = catCfg.enabled ?? DEFAULT_REVIEW_TYPES.includes(t.type);
      const data = {};
      for (const c of cats) {
        try { data[c] = await ninja.category(league, c); } catch (e) { log('price review', c, e.message); }
      }
      // thresholds are typed in the category's unit ("worth at least 2 divine"); the plan works in chaos
      // each threshold is typed with its own unit ("200c", "1 div", "0.5 ex"); a bare number uses the
      // category's old unit setting, else chaos
      const unit = units[catCfg.unit] ? catCfg.unit : 'chaos';
      const thresholds = {};
      for (const [k, v] of Object.entries(catCfg.thresholds || {})) {
        const c = parsePrice(v, units, unit);
        if (c != null) thresholds[k] = c;
      }
      const plan = tierPricing.autoTierPlan(t, tierPricing.priceIndex(t.type, data), {
        thresholds, include: catCfg.include || {}, rest: catCfg.rest || 'keep', minListings: cfg.minListings, margin: cfg.margin,
        // names the filter already lists anywhere are never "new"; uniques are priced by base so they never add names
        includeNew: !!cfg.includeNew,
        knownNames: knownAll,
      });
      if (plan.tiers.length < 2) continue; // nothing to tier (all special or unpriced)
      const ages = cats.map((c) => ninja.cachedAge(league, c)).filter((x) => x != null);
      // hourly auto-update is set per category (the old all-categories switch still counts)
      const auto = catCfg.auto === true || (catCfg.auto == null && !!cfg.auto && enabled);
      out.push({ type: t.type, label: t.label, enabled, auto, rest: catCfg.rest || 'keep', unit, raw: catCfg.thresholds || {}, ageMs: ages.length ? Math.max(...ages) : null, tierLooks: Object.fromEntries(t.tiers.map((x) => [x.tier, x.style])), ...plan, prices: undefined });
    }
    return { league, filterUpdated: filterLastUpdate(), cfg, categories: out, units, divine: units.divine };
  }

  /** "200c", "1 div", "1,5 divine", "0.5ex", "300" -> chaos (null if it isn't a price). */
  function parsePrice(v, units, defaultUnit = 'chaos') {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v * (units[defaultUnit] || 1) : null;
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*(c|ch|chaos|d|div|divs|divine|divines|e|ex|exa|exalt|exalted|exalts)?\s*$/i.exec(String(v));
    if (!m) return null;
    const n = Number(m[1].replace(',', '.'));
    const u = !m[2] ? defaultUnit : /^c/i.test(m[2]) ? 'chaos' : /^d/i.test(m[2]) ? 'divine' : 'exalted';
    if (!units[u]) return null;
    return n * units[u];
  }

  /** Chaos value of one of each unit thresholds can be typed in. */
  async function currencyUnits(league) {
    const units = { chaos: 1 };
    try {
      const cur = await ninja.category(league, 'Currency');
      const find = (n) => cur.find((x) => x.name === n)?.chaos;
      const div = find('Divine Orb');
      const ex = find('Exalted Orb');
      if (div > 0) units.divine = div;
      if (ex > 0) units.exalted = ex;
    } catch { /* chaos only */ }
    return units;
  }

  /** moves: [{type, base, from, to}] */
  function applyReviewMoves(moves, { auto = false } = {}) {
    const groups = new Map();
    for (const m of moves) {
      const k = `${m.type}\u0000${m.to}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m.base);
    }
    let result = null;
    for (const [k, bases] of groups) {
      const [type, to] = k.split('\u0000');
      result = moveBases(type, bases, to);
    }
    if (moves.length) {
      const logList = settings.get('priceReviewLog') || [];
      logList.unshift({ at: Date.now(), auto, moves: moves.map(({ type, base, from, to, chaos }) => ({ type, base, from, to, chaos })) });
      settings.set('priceReviewLog', logList.slice(0, 20));
    }
    return { count: moves.length, view: result?.view || tierViewNow() };
  }

  /** Put back everything the last review run moved. */
  function undoLastReview() {
    const logList = settings.get('priceReviewLog') || [];
    const last = logList.shift();
    if (!last) throw new Error('Nothing to undo.');
    for (const m of last.moves) {
      if (m.from) moveBases(m.type, [m.base], m.from);
      else resetTiers({ type: m.type, base: m.base });
    }
    settings.set('priceReviewLog', logList);
    return { undone: last.moves.length, at: last.at };
  }

  /** Automatic mode: apply every planned move in enabled categories. Returns the moves made. */
  function autoTierWanted() {
    const cfg = reviewCfg();
    return !!cfg.auto || Object.values(cfg.categories || {}).some((c) => c?.auto === true);
  }

  async function autoTierRun() {
    const cfg = reviewCfg();
    if (!autoTierWanted() || !filters.basePath()) return [];
    const r = await priceReview();
    const moves = r.categories.filter((c) => c.auto).flatMap((c) => c.moves.map((m) => ({ ...m, type: c.type })));
    if (moves.length) applyReviewMoves(moves, { auto: true });
    return moves;
  }

  // ---------- tier designer ----------
  function designerState() {
    const d = settings.get('designer') || {};
    const preset = designer.PRESETS.find((p) => p.id === (d.presetId || 'classic')) || designer.PRESETS[0];
    const levels = d.levels || preset.levels;
    const view = (() => { try { return tierViewNow(); } catch { return null; } })();
    // categories (top-level groups) with how many tiers a design would restyle
    const groups = [];
    if (view) {
      const counts = new Map();
      for (const t of designer.targetsFor(view)) {
        const g = t.type.split('->')[0];
        counts.set(g, (counts.get(g) || 0) + 1);
      }
      for (const [g, n] of counts) groups.push({ id: g, label: tiers.typeLabel(g), tiers: n });
    }
    return {
      missing: filters.missing(),
      presets: designer.PRESETS,
      themes: settings.get('designerThemes') || [],
      draft: { levels: d.lockTier1 === false ? levels : designer.lockTier1(levels), presetId: d.presetId || null, lockTier1: d.lockTier1 !== false, groups: d.groups || null },
      groups,
      canUndo: !!settings.get('designerUndo'),
      hasFilter: !!view,
    };
  }

  function designerSaveDraft(draft) {
    const cur = settings.get('designer') || {};
    settings.set('designer', { ...cur, ...draft });
    return designerState();
  }

  function designerApply({ levels, groups = null, lockTier1 = true }) {
    const view = tierViewNow();
    if (!view) throw new Error('Choose your filter on the Loot filter page first.');
    const lv = lockTier1 ? designer.lockTier1(levels) : levels;
    const patch = settings.get('tierPatch') || {};
    settings.set('designerUndo', { styles: patch.styles || {}, at: Date.now() });
    const r = designer.applyDesign(view, patch, lv, { groups });
    const { target } = savePatch(r.patch);
    return { count: r.count, categories: r.categories, target };
  }

  function designerUndo() {
    const u = settings.get('designerUndo');
    if (!u) throw new Error('Nothing to undo.');
    const patch = settings.get('tierPatch') || {};
    savePatch({ ...patch, moves: patch.moves || {}, styles: u.styles || {} });
    settings.set('designerUndo', null);
    return true;
  }

  function designerSaveTheme(name, levels) {
    const t = { id: `d_${Date.now()}`, name: String(name || 'My design').slice(0, 60), levels };
    settings.set('designerThemes', [t, ...(settings.get('designerThemes') || []).filter((x) => x.name !== t.name)]);
    return t;
  }

  function designerDeleteTheme(id) {
    settings.set('designerThemes', (settings.get('designerThemes') || []).filter((x) => x.id !== id));
    return true;
  }

  function filterLastUpdate() {
    try {
      const head = require('fs').readFileSync(filters.basePath(), 'utf8').slice(0, 2000);
      return /^#lastUpdate:(.+)$/m.exec(head)?.[1]?.trim() || null;
    } catch { return null; }
  }

  /** Every base named anywhere in your filter's tiers, longest first (for reading magic item names). */
  const baseListCache = new WeakMap();
  function knownBases(view) {
    if (!view) return [];
    if (!baseListCache.has(view)) {
      const set = new Set();
      for (const t of view.types) for (const tier of t.tiers) for (const b of tier.bases) set.add(b);
      baseListCache.set(view, [...set].sort((a, b) => b.length - a.length));
    }
    return baseListCache.get(view);
  }

  /** "Abecedarian's Quicksilver Flask of Incision" -> "Quicksilver Flask" */
  function magicBaseOf(typeLine) {
    if (!typeLine) return null;
    let view = null;
    try { view = tierViewNow(); } catch { /* no filter */ }
    const hit = knownBases(view).find((b) => new RegExp(`(^|\\s)${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(typeLine));
    if (hit) return hit;
    // no filter to compare with: at least drop the suffix
    const noSuffix = typeLine.replace(/\s+of\s+.+$/, '');
    return noSuffix !== typeLine ? noSuffix : null;
  }

  /** parseItem plus the real base for magic items, which the game glues to their affixes. */
  function readItem(text) {
    const item = parseItem(text);
    if (item && item.rarity === 'Magic') {
      const b = magicBaseOf(item.typeLine);
      if (b) item.baseType = b;
    }
    return item;
  }

  function tierFits(item) {
    const { parseLine } = require('../core/filter/parser');
    const { evalCondition } = require('../core/filter/matcher');
    // Only tiers whose own conditions fit this item: a rare Vaal Axe must never be offered
    // the uniques tier just because "Vaal Axe" is listed there.
    return (tier) => tier.conditions.every((c) => evalCondition(parseLine('\t' + c), item, []) !== false);
  }

  const optionOf = (x) => ({ tier: x.tier, action: x.action, state: x.state || x.action });

  /** Where an item sits in your tiers, for the overlay's "move to tier" menu. */
  function tierInfoFor(item, filterHit) {
    const view = (() => { try { return tierViewNow(); } catch { return null; } })();
    if (!view) return null;
    const base = item.baseType || item.typeLine;
    const fits = tierFits(item);
    const cls = item.itemClass ? `"${item.itemClass}"` : null;
    const movable = (tier) => tier.hasBaseList && !tier.special && !tier.generated;
    // 1) the tier that actually styles this item, if the base is listed there
    const fromHit = filterHit?.chain?.map((c) => /\$type->(\S+)\s+\$tier->(\S+)/.exec(c.comment || '')).filter(Boolean).pop();
    let loc = null;
    if (fromHit) {
      const tt = view.types.find((t) => t.type === fromHit[1])?.tiers.find((t) => t.tier === fromHit[2]);
      if (tt?.bases.includes(base) && !tt.generated) loc = { type: fromHit[1], tier: fromHit[2] };
    }
    // 2) otherwise a tier listing the base (switched-off ones too), preferring one for this item class
    if (!loc) {
      const cands = [];
      for (const t of view.types) for (const tier of t.tiers) if (tier.bases.includes(base) && !tier.generated && fits(tier) && (movable(tier) || tier.off)) cands.push({ type: t.type, tier: tier.tier, conds: tier.conditions.join(' '), off: tier.off });
      const rank = (c) => (cls && c.conds.includes(cls) ? 4 : 0) + (c.off ? 0 : 2) + (c.type.includes('->') ? 0 : 1);
      cands.sort((a, b) => rank(b) - rank(a));
      loc = cands[0] || null;
    }
    // categories whose tiers would take this item (when it isn't listed, or only in a switched-off tier)
    // A tier further down the file than the rule that catches the item now would never be reached
    // (e.g. levelling flasks sit below the endgame hide layer), so those aren't offered.
    const hitTier = fromHit ? view.types.find((t) => t.type === fromHit[1])?.tiers.find((t) => t.tier === fromHit[2]) : null;
    const reachable = (x) => !hitTier || x.line <= hitTier.line;
    const candidates = () => {
      const byType = [];
      for (const t of view.types) {
        const tiers = t.tiers.filter((x) => movable(x) && fits(x) && !x.off && reachable(x));
        if (!tiers.length) continue;
        const forClass = cls && t.tiers.some((x) => x.conditions.join(' ').includes(cls));
        byType.push({ type: t.type, label: t.label, forClass, tiers: tiers.map(optionOf) });
      }
      // only categories made for this item class: a flask is never offered "Exotic heist bases"
      const list = byType.filter((x) => x.forClass);
      return list.slice(0, 12).map(({ forClass, ...x }) => x);
    };
    if (loc) {
      const t = view.types.find((x) => x.type === loc.type);
      if (!t) return null;
      const here = t.tiers.find((x) => x.tier === loc.tier);
      const state = here?.state || here?.action;
      return { base, type: t.type, label: t.label, tier: loc.tier, state, key: here?.key, special: !!here?.special, options: t.tiers.filter(movable).map(optionOf), candidates: state === 'Off' ? candidates() : null };
    }
    const list = candidates();
    return list.length ? { base, notListed: true, candidates: list } : null;
  }

  return { labLayout, LAB_DIFFS, clusterView, setCluster, baseMatrixView, setBaseMatrix, setBaseMatrixOpts, farmDashboard, setStackSize, parsePrice, currencyUnits, changelog, versionInfo, myBases, addMyBase, updateMyBase, removeMyBase, setMyBasesStyle, addTier, removeTier, renameTier, categoryArt, userIconsDir, listIcons, importIcon, deleteIcon, listSounds, importSound, soundData, autoTierWanted, readItem, magicBaseOf, tierInfoFor, SOUNDS, DEFAULT_TIER_SOUNDS, settings, snapshots, usage, cache, ninja, ggg, limiter, pricer, networth, filters, getLeague, applySettings, priceText, tradePrepare, tradeSearch, regenerateEconomy, quickFilter, usageSnapshot, tierViewNow, tierPrices, setTierAction, tierSuggest, designerState, designerSaveDraft, designerApply, designerUndo, designerSaveTheme, designerDeleteTheme, priceReview, applyReviewMoves, undoLastReview, autoTierRun, moveBases, setTierStyle, resetTiers, themes, saveTheme, applyTheme, deleteTheme, importTheme, exportTheme, VERSION };
}

function slimItem(item) {
  const { raw, ...rest } = item;
  return rest;
}

module.exports = { createServices, DEFAULT_SETTINGS };
