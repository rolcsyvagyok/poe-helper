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
  uiTheme: 'atlas', // the app's look: 'atlas' (default), 'hideout' or 'dark'
  accountName: '',
  sessionEnc: null, // encrypted POESESSID
  contact: '', // optional contact for User-Agent, e.g. a GitHub URL
  hotkeyPrice: 'Alt+E',
  hotkeyPriceAdvanced: 'Ctrl+Alt+D',
  hotkeySnapshot: '',
  hotkeyPobTest: '', // copy the item under the mouse and test it against your build on the Path of Building page (off until you pick one) // save a Path of Building snapshot of your character (off until you pick one)
  hotkeyLab: 'Alt+L', // daily lab overlay: pick a difficulty, see today's layout from poelab
  labLast: 'uber',
  labFavorite: null, // the lab the hotkey opens straight away (null: ask every time)
  labPages: {}, // your own poelab page addresses per difficulty, if poelab moves them
  labIndex: {}, // layouts kept on disk
  labOverlayBounds: null,
  labOpacity: 1,
  clipboardMode: true, // pop the overlay when you Ctrl+C an item in game
  restoreClipboard: true,
  overlayCloseOnMouseAway: true,
  overlayPos: null, // where you last dragged the price check
  minimizeToTray: false,
  customAppIcon: false, // your own tray/app icon in <userData>/app-icon.png
  trayHintShown: false,
  categoryIcons: {}, // type -> built-in icon name or "img:<file>"
  baseFilterName: null, // the chosen filter's name, to find it again if the game renames the file
  economyRetired: false,
  gameSoundFiles: {},
  gameSounds: null, // preview copies made from your game: { dir, bankMtime, files: { "6": "game-6.ogg" } }
  gameDir: '', // your Path of Exile folder, once found or picked
  // game sound number -> your own recording (my-*.mp3) used for previews only
  versionSeen: null, // {version, at, from}: when this copy first ran its current version
  notesShownFor: null, // version whose patch notes you already saw
  gigaDone: false, // the default Giga tier in currency was set up once
  fbSideMini: false, // the category list folded down to its icons
  fbSideWidth: 300, // width of the loot filter's category list
  clusterGrid: {}, // cluster jewels: { "Large|Fire Damage|12|84": 'top' | 'good' | 'hide' }
  baseMatrix: {}, // base visibility: { "Vaal Regalia": { vis: 'hide', frac: 'show' } }
  baseMatrixOpts: { mapsOnly: true, keepIlvl: null },
  regexMaps: { kind: 'regular', avoid: [], want: [], mapTypes: { shaper: 'avoid', elder: 'avoid', conqueror: 'avoid', originator: 'avoid', blighted: 'avoid', ravaged: 'avoid' } }, // the Regex page's map choices
  campaignHide: { classes: [], rares: false, untilLevel: 67, keepLinks: 4 },
  showAllCurrency: false, // league start: every currency tier shows (Loot filter → Currency) // Campaign → Hide item types
  hiddenGroups: {}, // Base ranks → Hide whole groups: { label: { before: { base: rank } } }
  pob: { dir: null, buildsDir: null, character: null, last: null }, // Path of Building: your install, builds folder, the character to snapshot and the last snapshot
  regexGems: { tab: 0, picks: [], acts: {} },
  regexGemClass: '', // Regex → Gems: your class, for which vendor sells a gem first // the Regex page's gems
  regexCampaign: { type: '', variant: null, picks: {}, mode: 'any' }, // the Regex page's campaign item choices ({ mod: tier, 0 = any })
  regexItems: { type: '', variant: null, picks: {} }, // the Regex page's magic item mod choices ({ mod: [tiers] })
  regexBeasts: { minChaos: 10 }, // the Regex page's beast choices
  regexFavMods: [], // map mods kept at the top of the list
  regexTrade: { tier16: true, eightMods: false }, // the trade search's quick buttons
  regexPresets: [], // saved searches: [{ name, kind: 'maps', choices }]
  baseRanks: require('../core/base-ranks').DEFAULT_RANKS, // { "Vaal Regalia": 'B' }: S best, missing = D (untiered, the lowest)
  rankKinds: { rares: 'D', crafting: 'D', fractured: 'D', influenced: 'D' }, // lowest rank shown per kind of drop ('D' = all ranks)
  rankCraftIlvl: 82,
  rankIlvl: {}, // lowest item level per kind of drop: { fractured: 68 } (crafting bases: rankCraftIlvl)
  hideFractured: false, // also hide fractured copies of bases you hid
  hideSynthesised: false, // and synthesised ones
  bigBeltsDone: false,
  bigBeltsLookV2: false,
  gigaOwnLook: false, // you edited the Giga look yourself, so it stops following the top currency tier
  gigaLookV3: false,
  gigaDeleted: false, // you deleted the Giga tier yourself
  bigBeltsDeleted: false,
  gigaRestoreV1: false,
  tinkToGame6: false, // Tier 1 got FilterBlade's sound back once
  t1BorderText: false, // Tier 1's white-label border took its text colour once

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
  filterPins: [], // categories pinned to the top of the Loot filter list: none until you pin one
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

function createServices({ dataDir, secrets, fetchImpl, log = console.log, labBrowser = null }) {
  const settings = new JsonStore(path.join(dataDir, 'settings.json'), DEFAULT_SETTINGS);
  // 1.0.15: map warnings are gone; drop their saved list
  if ('mapRules' in settings.data) { delete settings.data.mapRules; settings.save(); }
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
  const lab = new LabClient({ dir: path.join(dataDir, 'lab'), fetchImpl, userAgent: userAgent(), log, store: settings, browser: labBrowser });
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
    let filterHit = null;
    let filterWhere = null;
    try {
      const text = filters.activeText();
      if (text != null) {
        filterHit = explain(require('../core/filter/parser').parse(text), item);
        filterWhere = require('../core/filter/where').whereInFilter(text, filterHit, (type, tier) => {
          const view = (() => { try { return tierViewNow(); } catch { return null; } })();
          const t = view?.types.find((x) => x.type === type);
          const here = t?.tiers.find((x) => x.tier === tier);
          return t && here ? { category: t.label, key: here.key, name: here.customName || null } : null;
        });
      }
    } catch { /* no filter configured */ }
    const tradeable = ['rare', 'magic', 'unique', 'normal', 'gem', 'unique-map', 'map'].includes(kind);
    const entry = { at: Date.now(), name: item.name !== item.typeLine && item.name ? `${item.name} ${item.typeLine}` : item.typeLine, kind, chaos: price.chaos ?? null, total: price.totalChaos ?? null };
    const hist = [entry, ...(settings.get('history') || [])].slice(0, 100);
    settings.set('history', hist);
    const tierInfo = tierInfoFor(item, filterHit);
    return { item: slimItem(item), kind, price, filterHit, filterWhere, tierInfo, tradeable };
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
  const FIXED_ART = {
    'Expedition Logbook': 'https://web.poecdn.com/image/Art/2DItems/Maps/ExpeditionChronicle3.png',
    Mageblood: 'https://web.poecdn.com/image/Art/2DItems/Belts/InjectorBelt.png', // when poe.ninja's unique list hasn't loaded yet
  };
  // the app's item categories -> poe.ninja's lists to look in for a picture
  const ART_LISTS = {
    Gem: ['SkillGem', 'ImbuedGem'], Unique: ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueJewel', 'UniqueFlask', 'UniqueRelic', 'UniqueTincture'],
    UniqueMap: ['UniqueMap'], Expedition: ['Artifact'],
  };
  const ART_DEFAULT = ['Currency', 'Fragment', 'Scarab', 'Essence', 'Fossil', 'Oil', 'DeliriumOrb', 'Omen', 'Tattoo', 'DivinationCard', 'UniqueAccessory', 'Map', 'BlightedMap', 'ClusterJewel', 'BaseType'];
  /** names: item names, or "name\tcategory" so the right poe.ninja list is looked in first */
  const CARD_ICON = 'https://web.poecdn.com/image/Art/2DItems/Divination/InventoryIcon.png';
  async function categoryArt(names = []) {
    const league = await getLeague();
    const hinted = [];
    const want = new Set();
    for (const raw of names) {
      const [n, c] = String(raw).split('\t');
      want.add(n);
      if (c) for (const t of ART_LISTS[c] || [c]) if (!hinted.includes(t)) hinted.push(t);
    }
    const out = {};
    const ok = (u) => /^https:\/\/web\.poecdn\.com\//.test(u); // the only image host the app loads from
    // pictures by name from every list the items could be in (priced right now or not)
    for (const c of [...hinted, ...ART_DEFAULT.filter((x) => !hinted.includes(x))]) {
      if (![...want].some((n) => !n.startsWith('*') && !out[n])) break;
      let icons = new Map();
      try { icons = await ninja.icons(league, c); } catch { /* the priced list below */ }
      // the priced list too (same cached data), with its spelling fixes
      try { for (const l of await ninja.category(league, c)) if (l.icon && !icons.has(l.name)) icons.set(l.name, String(l.icon).startsWith('/') ? `https://web.poecdn.com${l.icon}` : String(l.icon)); } catch { /* none */ }
      for (const n of want) if (!out[n] && icons.has(n) && ok(icons.get(n))) out[n] = icons.get(n);
    }
    // "*Type" (any item of a category), cluster jewel bases and a tier 16 map: from the priced lists
    let anyMap = null; // poe.ninja's map list often has no tiers (only Vaal temple maps), so any map picture will do
    const special = [...want].filter((n) => n.startsWith('*') || /Cluster Jewel$/.test(n));
    for (const c of special.length ? ART_DEFAULT : []) {
      if (special.every((n) => out[n])) break;
      let list = [];
      try { list = await ninja.category(league, c); } catch { continue; }
      for (const l of list) {
        const u = l.icon ? (String(l.icon).startsWith('/') ? `https://web.poecdn.com${l.icon}` : String(l.icon)) : null;
        if (!u || !ok(u)) continue;
        // cluster jewels are listed by their enchantment; their picture is the base's ("Large Cluster Jewel")
        if (c === 'ClusterJewel' && l.baseType && want.has(l.baseType) && !out[l.baseType]) out[l.baseType] = u;
        if ((c === 'Map' || c === 'BlightedMap') && !anyMap) anyMap = u;
        if (want.has(`*${c}`) && !out[`*${c}`]) out[`*${c}`] = u;
        if (c === 'Map' && want.has('*Map16') && !out['*Map16'] && Number(l.mapTier) === 16) out['*Map16'] = u;
      }
    }
    if (want.has('*Map16') && !out['*Map16'] && anyMap) out['*Map16'] = anyMap;
    // an essence nobody trades this league isn't on poe.ninja at all: GGG's picture follows its name
    // ("Screaming Essence of Woe" -> Essence/Woe5.png)
    const ESS = { Whispering: 1, Muttering: 2, Weeping: 3, Wailing: 4, Screaming: 5, Shrieking: 6, Deafening: 7 };
    for (const n of want) {
      const m = /^(\w+) Essence of (\w+)$/.exec(n);
      if (!out[n] && m && ESS[m[1]]) out[n] = `https://web.poecdn.com/image/Art/2DItems/Currency/Essence/${m[2]}${ESS[m[1]]}.png`;
    }
    // poe.ninja has no pictures for cards; every card has the same one in your stash
    for (const raw of names) { const [n, c] = String(raw).split('\t'); if (c === 'DivinationCard' && !out[n]) out[n] = CARD_ICON; }
    if (want.has('*DivinationCard') && !out['*DivinationCard']) out['*DivinationCard'] = CARD_ICON;
    // items poe.ninja doesn't price: GGG's own picture of the item, loaded when shown (nothing is bundled)
    for (const [n, u] of Object.entries(FIXED_ART)) if (want.has(n) && !out[n]) out[n] = u;
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
    const game = /^game-[A-Za-z0-9]+\.ogg$/.test(file);
    if (!game && !/^my-.+\.(mp3|wav|ogg)$/i.test(file)) throw new Error('Unknown sound.');
    const buf = require('fs').readFileSync(path.join(game ? gameSoundsDir : userSoundsDir, file));
    return `data:${SOUND_EXT[file.split('.').pop().toLowerCase()]};base64,${buf.toString('base64')}`;
  }

  // ---------- reset everything ----------
  // What a fresh install has, except what is yours and not a choice about looks or behaviour: your
  // account and session, league, the filter you picked, your history and net worth, saved themes, the
  // game sound copies, the lab pages, and the one-time upgrades that already ran.
  const RESET_KEEPS = ['accountName', 'sessionEnc', 'contact', 'leagueOverride', 'labLast', 'labFavorite', 'labPages', 'labIndex', 'labOverlayBounds',
    'gameSounds', 'gameDir', 'versionSeen', 'notesShownFor', 'forcedNames', 'startWithWindows', 'dailyGggBudget', 'rateSafety', 'ninjaBaseUrl', 'ninjaTtlMin',
    'clientLogPath', 'selectedTabs', 'filterDir', 'baseFilter', 'baseFilterName', 'history', 'designerThemes', 'themes', 'priceReviewLog', 'trayHintShown',
    'economyRetired', 'gigaRestoreV1', 'tinkToGame6', 'gigaLookV3', 'bigBeltsLookV2', 't1BorderText', 'ranksV1', 'ranksV2', 'ranksV3', 'ranksV4'];
  function resetAll() {
    const before = structuredClone(settings.get());
    // one level of undo, in case it was a misclick
    try { require('fs').writeFileSync(path.join(dataDir, 'settings-before-reset.json'), JSON.stringify(before, null, 2)); } catch { /* best effort */ }
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (!RESET_KEEPS.includes(k)) settings.data[k] = structuredClone(DEFAULT_SETTINGS[k]);
    settings.save();
    applySettings();
    viewCache = null;
    let target = null;
    try { if (filters.basePath()) { tierViewNow(); target = filters.write(); } } catch (e) { log('reset write', e.message); }
    return { target, keptKeys: RESET_KEEPS.length };
  }
  function undoResetAll() {
    const f = path.join(dataDir, 'settings-before-reset.json');
    const fs = require('fs');
    if (!fs.existsSync(f)) throw new Error('There is no reset to undo.');
    const before = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [k, v] of Object.entries(before)) settings.data[k] = v;
    settings.save();
    fs.unlinkSync(f);
    applySettings();
    viewCache = null;
    try { if (filters.basePath()) filters.write(); } catch (e) { log('undo reset write', e.message); }
    return true;
  }
  const canUndoReset = () => require('fs').existsSync(path.join(dataDir, 'settings-before-reset.json'));

  // ---------- loot filter settings to share: everything you set up for the filter, in one file ----------
  // Not in it: your account, login, league, filter folder, which filter file you use, history, saved themes.
  const FILTER_KEYS = ['tierPatch', 'overrides', 'economy', 'clusterGrid', 'baseMatrix', 'baseMatrixOpts', 'baseRanks', 'hiddenGroups', 'campaignHide', 'showAllCurrency', 'rankKinds', 'rankCraftIlvl', 'rankIlvl',
    'hideFractured', 'hideSynthesised', 'myBases', 'myBasesStyle', 'categoryLayout', 'filterPins', 'priceReview', 'designer',
    'gigaOwnLook', 'bigBeltsOwnLook', 'gigaDone', 'bigBeltsDone', 'gigaDeleted', 'bigBeltsDeleted'];
  const SHARE_KIND = 'poe-helper-loot-filter-settings';
  function exportFilterSettings() {
    const fs = require('fs');
    const values = Object.fromEntries(FILTER_KEYS.filter((k) => settings.get(k) !== undefined).map((k) => [k, settings.get(k)]));
    // your own drop sounds go along, so the looks sound the same on the other PC
    const used = [...new Set(JSON.stringify(values).match(/my-[a-z0-9-]+\.(?:mp3|wav|ogg)/gi) || [])];
    const sounds = {};
    for (const f of used) { try { sounds[f] = fs.readFileSync(path.join(userSoundsDir, path.basename(f))).toString('base64'); } catch { /* gone */ } }
    return JSON.stringify({ kind: SHARE_KIND, version: 1, app: VERSION, exportedAt: new Date().toISOString(), settings: values, sounds }, null, 1);
  }
  /** Someone else's loot filter settings replace yours (yours are kept for Undo). */
  function importFilterSettings(text) {
    const fs = require('fs');
    let data;
    try { data = JSON.parse(String(text)); } catch { throw new Error('That isn\'t a PoE Helper loot filter settings file.'); }
    if (data?.kind !== SHARE_KIND || typeof data.settings !== 'object' || !data.settings) throw new Error('That isn\'t a PoE Helper loot filter settings file.');
    fs.writeFileSync(path.join(dataDir, 'settings-before-import.json'), JSON.stringify(Object.fromEntries(FILTER_KEYS.map((k) => [k, settings.data[k] ?? null]))));
    fs.mkdirSync(userSoundsDir, { recursive: true });
    for (const [f, b64] of Object.entries(data.sounds || {})) {
      if (!/^my-[a-z0-9-]+\.(mp3|wav|ogg)$/i.test(f)) continue;
      const buf = Buffer.from(String(b64), 'base64');
      if (buf.length && buf.length <= 5 * 1024 * 1024) fs.writeFileSync(path.join(userSoundsDir, f), buf);
    }
    // keys the file doesn't have go back to how a fresh install has them, so it's really their setup
    for (const k of FILTER_KEYS) {
      if (k in data.settings) settings.data[k] = data.settings[k];
      else if (k in DEFAULT_SETTINGS) settings.data[k] = structuredClone(DEFAULT_SETTINGS[k]);
      else delete settings.data[k];
    }
    settings.save();
    viewCache = null;
    let target = null;
    try { if (filters.basePath()) target = filters.write(); } catch (e) { log('import write', e.message); }
    return { count: Object.keys(data.settings).length, from: data.app || null, at: data.exportedAt || null, target };
  }
  function undoImportFilterSettings() {
    const fs = require('fs');
    const f = path.join(dataDir, 'settings-before-import.json');
    if (!fs.existsSync(f)) throw new Error('There is no import to undo.');
    const before = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [k, v] of Object.entries(before)) { if (v === null) delete settings.data[k]; else settings.data[k] = v; }
    settings.save();
    fs.unlinkSync(f);
    viewCache = null;
    try { if (filters.basePath()) filters.write(); } catch (e) { log('undo import write', e.message); }
    return true;
  }
  const canUndoImport = () => require('fs').existsSync(path.join(dataDir, 'settings-before-import.json'));

  // ---------- the game's own alert sounds, for previews ----------
  // Made from the game install on this PC (FMOD/Desktop/ItemFilter.bank) into the app's data folder;
  // nothing from the game ships with the app. Done once, and again when a patch changes the bank.
  const gameSoundsDir = path.join(dataDir, 'game-sounds');
  const gameSoundsLib = require('../core/game-sounds');
  const SETUPS = path.join(__dirname, '..', '..', 'assets', 'game-sounds', 'vorbis-setups.bin');
  function gameSoundsState() {
    const st = settings.get('gameSounds') || null;
    const files = {};
    for (const [id, f] of Object.entries(st?.files || {})) if (require('fs').existsSync(path.join(gameSoundsDir, f))) files[id] = f;
    return { ...(st || {}), files, count: Object.keys(files).length };
  }
  /** dir: a game folder you picked; otherwise the one used last time, or the usual install places. */
  function extractGameSounds({ dir = null, force = false } = {}) {
    const fs = require('fs');
    const prev = settings.get('gameSounds') || {};
    const extra = [dir, settings.get('gameDir'), prev.dir].filter(Boolean);
    const gameDir = dir && fs.existsSync(gameSoundsLib.bankIn(dir)) ? dir : gameSoundsLib.findGameDir({ extra });
    if (!gameDir) throw new Error(dir ? 'That folder has no FMOD\\Desktop\\ItemFilter.bank. Pick the Path of Exile folder itself (the one with Bundles2 and FMOD in it).' : "Couldn't find Path of Exile on this PC. Pick its folder.");
    const bankMtime = fs.statSync(gameSoundsLib.bankIn(gameDir)).mtimeMs;
    if (!force && prev.dir === gameDir && prev.bankMtime === bankMtime && gameSoundsState().count >= 16) return gameSoundsState();
    const r = gameSoundsLib.extract({ gameDir, outDir: gameSoundsDir, setupsFile: SETUPS });
    if (!Object.keys(r.files).length) throw new Error(`No sounds could be read from the game (${r.failed[0] || 'unknown format'}).`);
    if (r.failed.length) log('game sounds', r.failed.join('; '));
    settings.set('gameDir', gameDir);
    settings.set('gameSounds', { dir: gameDir, bankMtime, files: r.files, at: Date.now(), failed: r.failed.length });
    return gameSoundsState();
  }
  /** At start: quietly make them if the game is found and they're missing or the game was patched. */
  function refreshGameSounds() {
    try { return extractGameSounds(); } catch (e) { log('game sounds', e.message); return null; }
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
    // 1.0.10: resetting a category used to drop the Giga tier for good; bring it back once
    if (!settings.get('gigaRestoreV1')) {
      settings.set('gigaRestoreV1', true);
      if (settings.get('gigaDone') && !((settings.get('tierPatch') || {}).newTiers || []).some((x) => x.type === 'currency' && x.name === 'Giga')) settings.set('gigaDone', false);
      if (settings.get('bigBeltsDone') && !((settings.get('tierPatch') || {}).newTiers || []).some((x) => x.name === 'Big belts')) settings.set('bigBeltsDone', false);
    }
    if (!settings.get('gigaDone') && !settings.get('gigaDeleted') && !gigaBusy) { const r = ensureGiga(viewCache.view); if (r?.view) return r.view; }
    if (!settings.get('bigBeltsDone') && !settings.get('bigBeltsDeleted') && !gigaBusy) { const r = ensureBigBelts(viewCache.view); if (r?.view) return r.view; }
    // 1.0.6: Big belts was made with the S tier look; give it the multi-base look once
    if (settings.get('bigBeltsDone') && !settings.get('bigBeltsLookV2') && !gigaBusy) {
      settings.set('bigBeltsLookV2', true);
      const p = settings.get('tierPatch') || {};
      const next = syncBigBelts(p);
      if (next !== p) { gigaBusy = true; try { const r = savePatch(next); if (r?.view) return r.view; } finally { gigaBusy = false; } }
    }
    // 1.0.8: themes used the app's own "Divine tink" file on Tier 1; put back FilterBlade's sound (game sound 6)
    if (!settings.get('tinkToGame6') && !gigaBusy) {
      settings.set('tinkToGame6', true);
      const TINK = 'poehelper-sounds/divine-tink.mp3';
      const fix = (st) => { if (st?.customSound !== TINK) return st; const { customSound, customVolume, ...rest } = st; return { ...rest, sound: { ...designer.TIER1_SOUND } }; };
      const fixLevels = (lv) => (lv && lv[1] ? { ...lv, 1: fix(lv[1]) } : lv);
      const d = settings.get('designer');
      if (d?.levels) settings.set('designer', { ...d, levels: fixLevels(d.levels) });
      settings.set('designerThemes', (settings.get('designerThemes') || []).map((t) => ({ ...t, levels: fixLevels(t.levels) })));
      const p = settings.get('tierPatch') || {};
      const styles = Object.fromEntries(Object.entries(p.styles || {}).map(([k, v]) => [k, fix(v)]));
      if (JSON.stringify(styles) !== JSON.stringify(p.styles || {})) { gigaBusy = true; try { const r = savePatch({ ...p, styles }); if (r?.view) return r.view; } finally { gigaBusy = false; } }
    }
    // 1.0.15: the white Tier 1 look gets a border in its text colour instead of white
    if (!settings.get('t1BorderText') && !gigaBusy) {
      settings.set('t1BorderText', true);
      const isWhite = (a) => Array.isArray(a) && a[0] === 255 && a[1] === 255 && a[2] === 255;
      const fix = (st) => (st && isWhite(st.background) && isWhite(st.border) && Array.isArray(st.text) && !isWhite(st.text) ? { ...st, border: [...st.text.slice(0, 3), 255] } : st);
      const fixLevels = (lv) => (lv && lv[1] ? { ...lv, 1: fix(lv[1]) } : lv);
      const d = settings.get('designer');
      if (d?.levels) settings.set('designer', { ...d, levels: fixLevels(d.levels), lockTier1: true });
      settings.set('designerThemes', (settings.get('designerThemes') || []).map((t) => ({ ...t, levels: fixLevels(t.levels) })));
      const p = settings.get('tierPatch') || {};
      const styles = Object.fromEntries(Object.entries(p.styles || {}).map(([k, v]) => [k, fix(v)]));
      if (JSON.stringify(styles) !== JSON.stringify(p.styles || {})) { gigaBusy = true; try { const r = savePatch({ ...p, styles }); if (r?.view) return r.view; } finally { gigaBusy = false; } }
    }
    // 1.0.7: Giga follows the theme's top currency look, reversed
    if (settings.get('gigaDone') && !settings.get('gigaLookV3') && !gigaBusy) {
      settings.set('gigaLookV3', true);
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

  // Giga follows the top currency tier it was copied from (Divine/Exalted level), reversed (that tier's text
  // colour as the background, gold text), so it never looks like Tier 1 and a theme restyles it too,
  // until you edit the Giga look yourself.
  function syncGiga(patch) {
    if (settings.get('gigaOwnLook')) return patch;
    const nt = (patch.newTiers || []).find((x) => x.type === 'currency' && x.name === 'Giga');
    if (!nt) return patch;
    let view = null;
    try { view = tiers.tierView(filters.readBase(), patch); } catch { return patch; }
    const src = view?.types.find((t) => t.type === 'currency')?.tiers.find((t) => t.tier === nt.copyFrom);
    if (!src?.style) return patch;
    const key = `currency|${nt.tier}`;
    const want = designer.gigaLook(src.style);
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
    // deleting a default tier yourself keeps it deleted; a reset brings it back
    const nt = ((settings.get('tierPatch') || {}).newTiers || []).find((x) => x.type === type && x.tier === tier);
    if (nt?.type === 'currency' && nt.name === 'Giga') settings.set('gigaDeleted', true);
    if (nt?.name === 'Big belts') settings.set('bigBeltsDeleted', true);
    return savePatch(tiers.withoutNewTier(settings.get('tierPatch') || {}, type, tier));
  }
  function renameTier({ type, tier, name }) {
    const p = tiers.clonePatch(settings.get('tierPatch') || {});
    const nt = p.newTiers.find((x) => x.type === type && x.tier === tier);
    if (nt) nt.name = String(name || '').trim().slice(0, 40) || nt.name;
    return savePatch(p);
  }

  /** Item level / area level / quality ({ op, value } or 'any'), rarity [..] or switched-off bases (exclude: [..]) of one tier; null = the filter's own. */
  function setTierCondition(key, field, value) {
    const ok = ['GemLevel', 'ItemLevel', 'AreaLevel', 'Quality', 'Rarity', 'exclude'];
    if (!ok.includes(field)) throw new Error('That condition can\'t be changed here.');
    return savePatch(tiers.withCondition(settings.get('tierPatch') || {}, key, field, value));
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
    // only names that belong to this category: what its tiers hold now or held in your filter,
    // plus poe.ninja's list for it (Delirium -> delirium orbs, not every item in the game)
    const view = tierViewNow();
    const names = new Set();
    const mine = view?.types.find((t) => t.type === type);
    for (const tier of mine?.tiers || []) for (const b of tier.bases) names.add(b);
    try {
      const orig = tiers.extractTiers(require('../core/filter/parser').parse(filters.readBase())).find((t) => t.type === type);
      for (const tier of orig?.tiers || []) for (const b of tier.bases) names.add(b);
    } catch { /* no base filter */ }
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
    // the default tiers (Giga, Big belts) come back after a reset of their category or of everything
    const again = (t) => {
      if (t === 'currency') { settings.set('gigaDone', false); settings.set('gigaDeleted', false); }
      if (/^uniques/.test(t)) { settings.set('bigBeltsDone', false); settings.set('bigBeltsDeleted', false); }
    };
    if (all) { patch = {}; again('currency'); again('uniques'); }
    if (key) patch = tiers.withStyle(patch, key, null);
    if (type && base) patch = tiers.withoutMove(patch, type, base);
    // a whole category (or several): every move, look and Shown/Hidden/Off change in it
    const typesToReset = types || (type && !base ? [type] : null);
    if (typesToReset) {
      const inType = (k, sep) => typesToReset.includes(k.split(sep)[0]);
      // only the reset categories lose their changes; other categories keep theirs, own tiers included
      patch = {
        ...patch,
        moves: Object.fromEntries(Object.entries(patch.moves || {}).filter(([k]) => !inType(k, '\t'))),
        styles: Object.fromEntries(Object.entries(patch.styles || {}).filter(([k]) => !inType(k, '|'))),
        actions: Object.fromEntries(Object.entries(patch.actions || {}).filter(([k]) => !inType(k, '|'))),
        conditions: Object.fromEntries(Object.entries(patch.conditions || {}).filter(([k]) => !inType(k, '|'))),
        newTiers: (patch.newTiers || []).filter((x) => !typesToReset.includes(x.type)),
      };
      for (const t of typesToReset) again(t);
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
    // no filter chosen yet: nothing to check the names against (null = unknown, not "missing")
    try { if (filters.basePath()) known = new Set([...filters.readBase().matchAll(/"([^"\r\n]+)"/g)].map((m) => m[1])); } catch { known = null; }
    const bases = {};
    for (const c of CLASSES) {
      bases[c] = {};
      for (const d of DEFENCES) bases[c][d.id] = (BASES[c][d.id] || []).map((name) => ({ name, inFilter: known ? known.has(name) : null }));
    }
    const mark = (name) => ({ name, inFilter: known ? known.has(name) : null });
    const { NOT_RANKED_GROUPS } = require('../core/filter/manager');
    const groups = GROUPS.filter((g) => !NOT_RANKED_GROUPS.has(g.id)).map((g) => ({ id: g.id, name: g.name, columns: Object.entries(g.columns).map(([title, list]) => ({ title, list: list.map(mark) })) }));
    migrateRanks();
    const { RANKS, RANK_LOOKS, RANK_KINDS } = require('../core/filter/manager');
    return {
      defences: DEFENCES, classes: CLASSES, bases, groups,
      state: settings.get('baseMatrix') || {},
      opts: { mapsOnly: true, keepIlvl: null, ...(settings.get('baseMatrixOpts') || {}) },
      ranks: settings.get('baseRanks') || {},
      kinds: settings.get('rankKinds') || {},
      craftIlvl: settings.get('rankCraftIlvl') || 82,
      ilvls: settings.get('rankIlvl') || {},
      rankList: RANKS,
      rankLooks: RANK_LOOKS,
      rankKinds: RANK_KINDS.map((k) => ({ id: k.id, name: k.name, about: k.about, ilvl: !!k.ilvl })),
      minionBases: require('../core/base-ranks').MINION_BASES,
    };
  }
  /** The usual ranking back (Reset all on the Base ranks page). */
  function defaultRanks() {
    const ranks = { ...require('../core/base-ranks').DEFAULT_RANKS };
    settings.set('baseRanks', ranks);
    if (filters.basePath()) filters.write();
    return { ranks };
  }
  /** Once: the old fractured looks become ranks (best look = S, good look = B, hidden = C). */
  function migrateRanks() {
    migrateRanksV1();
    // 1.0.16: five ranks (D = untiered) and the usual ranking to start from; "all ranks" is now D
    if (!settings.get('ranksV2')) {
      settings.set('ranksV2', true);
      settings.set('baseRanks', { ...require('../core/base-ranks').DEFAULT_RANKS });
      const kinds = { ...(settings.get('rankKinds') || {}) };
      for (const k of Object.keys(kinds)) if (kinds[k] === 'C') kinds[k] = 'D';
      settings.set('rankKinds', kinds);
      settings.set('ranksV3', true);
      settings.set('ranksV4', true);
      return true;
    }
    // 1.0.19: jewellery gets its usual ranking (the 1.0.18 one was off by a rank); every ring, amulet
    // and belt is set from it, the rest of jewellery is D
    if (!settings.get('ranksV4')) {
      settings.set('ranksV3', true);
      settings.set('ranksV4', true);
      const { JEWELLERY_RANKS } = require('../core/base-ranks');
      const jewels = Object.values(require('../core/base-data').GROUPS.find((g) => g.id === 'jewellery')?.columns || {}).flat();
      const ranks = { ...(settings.get('baseRanks') || {}) };
      for (const b of jewels) { if (JEWELLERY_RANKS[b]) ranks[b] = JEWELLERY_RANKS[b]; else delete ranks[b]; }
      settings.set('baseRanks', ranks);
      return true;
    }
    return false;
  }
  function migrateRanksV1() {
    if (settings.get('ranksV1')) return;
    const state = { ...(settings.get('baseMatrix') || {}) };
    const ranks = { ...(settings.get('baseRanks') || {}) };
    let had = false;
    for (const [b, e] of Object.entries(state)) {
      if (!e.frac) continue;
      had = true;
      if (e.frac === 'top') ranks[b] = 'S';
      else if (e.frac === 'show') ranks[b] = 'B';
      const n = { ...e }; delete n.frac;
      if (Object.keys(n).length) state[b] = n; else delete state[b];
    }
    if (had) {
      settings.set('baseRanks', ranks);
      settings.set('baseMatrix', state);
      settings.set('rankKinds', { ...(settings.get('rankKinds') || {}), fractured: 'B' });
    }
    settings.set('ranksV1', true);
  }
  // ---------- Regex page: stash search strings ----------
  const mapRegex = require('../core/regex/maps');
  function regexMapView(o = {}) { return mapRegex.mapRegexView(o); }
  // beasts: poe.ninja's beast prices (kept for building), the list, and the search strings
  let beastPrices = [];
  async function regexBeastView() {
    const beasts = require('../core/regex/beasts');
    let note = null;
    try {
      const league = await getLeague();
      beastPrices = await ninja.category(league, 'Beast');
    } catch (e) { note = `No beast prices from poe.ninja right now (${e.message}).`; }
    return { ...beasts.beastView(beastPrices), note };
  }
  function regexItemBases() { return require('../core/regex/items').itemTypes(); }
  function regexItemView(o = {}) { return require('../core/regex/items').magicView(o); }
  function regexItemBuild(choices = {}) {
    settings.set('regexItems', choices);
    return require('../core/regex/items').buildMagicRegex(choices);
  }
  function regexCampaignView(o = {}) { return require('../core/regex/items').campaignView(o); }
  function regexCampaignBuild(choices = {}) {
    settings.set('regexCampaign', choices);
    return require('../core/regex/items').buildCampaignRegex(choices);
  }
  function regexGemView() { return { gems: require('../core/regex/gems').gemList() }; }
  function regexGemBuild(choices = {}) {
    // the store holds every act's picks ({ tab, picks, acts: { 1: [...], 2: [...] } })
    const st = choices.store && typeof choices.store === 'object' ? choices.store : { picks: choices.picks || [] };
    settings.set('regexGems', { tab: Number(st.tab) || 0, picks: [...new Set(st.picks || [])], acts: Object.fromEntries(Object.entries(st.acts || {}).map(([k, v]) => [k, [...new Set(v || [])]])) });
    return require('../core/regex/gems').buildGemRegex(choices);
  }
  function regexBeastBuild(choices = {}) {
    settings.set('regexBeasts', choices);
    return require('../core/regex/beasts').buildBeastRegex(choices, beastPrices);
  }
  function regexMapBuild(choices = {}) {
    settings.set('regexMaps', choices);
    return mapRegex.buildMapRegex(choices);
  }
  /** The same choices as a trade site search for maps: { url, total, notes } */
  async function regexMapTrade({ choices, tier16 = true, eightMods = false } = {}) {
    const { buildMapTradeQuery } = require('../core/regex/map-trade');
    const league = await getLeague();
    const c = choices || settings.get('regexMaps') || {};
    settings.set('regexTrade', { tier16: !!tier16, eightMods: !!eightMods });
    const tierMin = tier16 ? 16 : null;
    const tierMax = tier16 ? 16 : null;
    const modsMin = eightMods ? 8 : null;
    const stats = await ggg.tradeStats().catch(() => null); // once a week at most
    const { query, notes } = buildMapTradeQuery(c, { tierMin, tierMax, modsMin, status: settings.get('tradeStatus') || 'securable' }, stats);
    const res = await ggg.tradeSearch(league, query);
    return { url: ggg.tradeUrl(league, res.id), total: res.total ?? res.result?.length ?? 0, notes };
  }
  function regexSavePreset({ name, kind = 'maps', choices } = {}) {
    const n = String(name || '').trim().slice(0, 60);
    if (!n) throw new Error('Give the search a name.');
    const list = (settings.get('regexPresets') || []).filter((p) => !(p.name === n && p.kind === kind));
    list.push({ name: n, kind, choices: structuredClone(choices || {}), at: Date.now() });
    settings.set('regexPresets', list);
    return list;
  }
  function regexDeletePreset({ name, kind = 'maps' } = {}) {
    const list = (settings.get('regexPresets') || []).filter((p) => !(p.name === name && p.kind === kind));
    settings.set('regexPresets', list);
    return list;
  }

  const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'];
  /** Give bases a rank: rank 'S'..'C', or dir +1 (a rank up) / -1 (a rank down) from where each is. */
  function setBaseRanks({ bases = [], rank, dir } = {}) {
    const { RANKED_NAMES } = require('../core/filter/manager');
    const valid = new Set(RANKED_NAMES);
    const ranks = { ...(settings.get('baseRanks') || {}) };
    for (const b of bases) {
      if (!valid.has(b)) continue;
      let r = rank;
      if (dir) {
        const i = RANK_ORDER.indexOf(ranks[b] || 'D');
        r = RANK_ORDER[Math.max(0, Math.min(RANK_ORDER.length - 1, i - Math.sign(dir)))];
      }
      if (!RANK_ORDER.includes(r)) continue;
      if (r === 'D') delete ranks[b]; else ranks[b] = r; // D (untiered) is the lowest and the default
    }
    settings.set('baseRanks', ranks);
    const target = filters.basePath() ? filters.write() : null;
    return { ranks, target, leftOut: filters.lastDropped };
  }
  /** The lowest rank shown for one kind of drop: 'S' | 'A' | 'B' | 'C' (all) | 'none' | 'off' (filter decides). */
  function setRankKind({ kind, min, craftIlvl, ilvl } = {}) {
    const { RANK_KINDS } = require('../core/filter/manager');
    const kinds = { ...(settings.get('rankKinds') || {}) };
    const known = kind && RANK_KINDS.some((k) => k.id === kind);
    if (known && min !== undefined) {
      if ([...RANK_ORDER, 'none'].includes(min)) kinds[kind] = min; else delete kinds[kind];
    }
    settings.set('rankKinds', kinds);
    // the lowest item level for one kind (1 = any)
    if (known && ilvl !== undefined) {
      const n = Math.round(Number(ilvl));
      const lv = Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 1;
      if (kind === 'crafting') settings.set('rankCraftIlvl', lv);
      else {
        const all = { ...(settings.get('rankIlvl') || {}) };
        if (lv > 1) all[kind] = lv; else delete all[kind];
        settings.set('rankIlvl', all);
      }
    }
    if (craftIlvl !== undefined) {
      const n = Math.round(Number(craftIlvl));
      settings.set('rankCraftIlvl', n >= 1 && n <= 100 ? n : 82);
    }
    const target = filters.basePath() ? filters.write() : null;
    return { kinds, craftIlvl: settings.get('rankCraftIlvl') || 82, ilvls: settings.get('rankIlvl') || {}, target };
  }
  /**
   * Ranks in one go from the base order: in every column (item class and defence, or weapon type) the
   * best bases (listed first) get S, then A, then B, the rest C.
   */
  function autoRanks({ s = 1, a = 2, b = 2, c = 2 } = {}) {
    const v = baseMatrixView();
    const cols = [];
    for (const c of v.classes) for (const d of v.defences) cols.push(v.bases[c][d.id] || []);
    for (const g of v.groups) for (const col of g.columns) cols.push(col.list);
    const ranks = {};
    const done = new Set();
    for (const list of cols) {
      list.filter((x) => x.inFilter !== false).forEach((x, i) => {
        if (done.has(x.name)) return; // a base in several columns keeps its first (best) place
        done.add(x.name);
        const r = i < s ? 'S' : i < s + a ? 'A' : i < s + a + b ? 'B' : i < s + a + b + c ? 'C' : 'D';
        if (r !== 'D') ranks[x.name] = r;
      });
    }
    settings.set('baseRanks', ranks);
    if (filters.basePath()) filters.write();
    const vals = Object.values(ranks);
    return { ranks, S: vals.filter((r) => r === 'S').length, A: vals.filter((r) => r === 'A').length, B: vals.filter((r) => r === 'B').length, C: vals.filter((r) => r === 'C').length, D: done.size - vals.length };
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
      if (frac !== undefined) { if (frac === 'top' || frac === 'show' || frac === 'hide') e.frac = frac; else delete e.frac; }
      if (Object.keys(e).length) state[b] = e; else delete state[b];
    }
    settings.set('baseMatrix', state);
    const target = filters.basePath() ? filters.write() : null;
    return { state, target, leftOut: filters.lastDropped };
  }
  function setCampaignHide(o = {}) {
    const { CAMPAIGN_CLASSES } = require('../core/filter/manager');
    const cur = { classes: [], rares: false, untilLevel: 67, keepLinks: 4, ...(settings.get('campaignHide') || {}) };
    if (Array.isArray(o.classes)) cur.classes = o.classes.filter((c) => CAMPAIGN_CLASSES.includes(c));
    if ('rares' in o) cur.rares = !!o.rares;
    if ('untilLevel' in o) cur.untilLevel = Math.max(1, Math.min(83, Math.round(Number(o.untilLevel) || 67)));
    if ('keepLinks' in o) { const n = Math.round(Number(o.keepLinks)); cur.keepLinks = n >= 2 && n <= 6 ? n : 0; }
    settings.set('campaignHide', cur);
    if (filters.basePath()) filters.write();
    return cur;
  }
  function setShowAllCurrency(on) {
    settings.set('showAllCurrency', !!on);
    if (filters.basePath()) filters.write();
    return !!on;
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
  const DEFAULT_REVIEW_TYPES = ['divination', 'fragments', 'currency', 'currency->fossil', 'currency->oil', 'currency->essence', 'currency->deliriumorbs', 'currency->trial->omen', 'currency->trial->tattoo', 'runesgrafts', 'vials'];

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
      draft: { levels: designer.lockTier1(levels), presetId: d.presetId || null, lockTier1: true, groups: d.groups || null },
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

  function designerApply({ levels, groups = null }) {
    const view = tierViewNow();
    if (!view) throw new Error('Choose your filter on the Loot filter page first.');
    const lv = designer.lockTier1(levels); // Tier 1 always keeps the white look
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

  const optionOf = (x) => ({ tier: x.tier, action: x.action, state: x.state || x.action, name: x.customName || null, style: x.style || null, key: x.key });

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
    // hidden by you (the Hide button): say so, and offer every tier of that category to bring it back,
    // with the tier your filter had it in first
    const hidKey = Object.keys((settings.get('tierPatch') || {}).moves || {}).find((k) => k.endsWith(`\t${base}`) && settings.get('tierPatch').moves[k] === tiers.HIDE);
    const hidType = fromHit?.[2] === tiers.HIDDEN_TIER ? fromHit[1] : hidKey ? hidKey.split('\t')[0] : null;
    if (!loc && hidType) {
      const t = view.types.find((x) => x.type === hidType);
      if (t) {
        let orig = null;
        try { orig = tiers.extractTiers(require('../core/filter/parser').parse(filters.readBase())).find((x) => x.type === hidType)?.tiers.find((x) => x.bases.includes(base))?.tier || null; } catch { /* no base filter */ }
        const opts = t.tiers.filter((x) => movable(x) && !x.off).map((x) => ({ ...optionOf(x), original: x.tier === orig }));
        opts.sort((a, b) => (b.original ? 1 : 0) - (a.original ? 1 : 0));
        return { base, type: t.type, label: t.label, tier: tiers.HIDDEN_TIER, state: 'Hide', hiddenByYou: true, options: opts };
      }
    }
    // tiers that pick items by a property instead of a base list (regular maps by map tier:
    // "Map (Tier 16)" is in "Tier 16" because MapTier >= 16): show that tier, there is nothing to move
    if (hitTier && !hitTier.hasBaseList && !hitTier.generated) {
      const t = view.types.find((x) => x.type === fromHit[1]);
      return { base, type: t.type, label: t.label, tier: hitTier.tier, state: hitTier.state || hitTier.action, key: hitTier.key, byCondition: true,
        conditions: hitTier.conditions.filter((c) => !/^(Class|Rarity)\b/.test(c)), name: hitTier.customName || null, options: [] };
    }
    const list = candidates();
    return list.length ? { base, notListed: true, candidates: list } : null;
  }

  // 1.0.20: the kinds start at "All ranks"; synthesised items are left to the filter
  let kindsChanged = false;
  if (!settings.get('rankKindsV2')) {
    const k = { ...(settings.get('rankKinds') || {}) };
    delete k.synthesised;
    for (const id of ['rares', 'crafting', 'fractured', 'influenced']) if (!k[id] || k[id] === 'off') k[id] = 'D';
    settings.set('rankKinds', k);
    settings.set('rankKindsV2', true);
    kindsChanged = true;
  }
  // 1.0.18: influenced and blighted maps are skipped by default on the Regex page
  if (!settings.get('regexTypesV1')) {
    const rm = settings.get('regexMaps') || {};
    if (!rm.mapTypes || !Object.keys(rm.mapTypes).length) settings.set('regexMaps', { ...rm, mapTypes: { shaper: 'avoid', elder: 'avoid', conqueror: 'avoid', originator: 'avoid', blighted: 'avoid', ravaged: 'avoid' } });
    settings.set('regexTypesV1', true);
  }
  // 1.0.18: nothing is pinned by default any more; drop the old default pins (your own pins stay)
  if (!settings.get('pinsDefaultV2')) {
    const was = settings.get('filterPins');
    if (Array.isArray(was) && JSON.stringify(was) === JSON.stringify(['currency', 'divination', 'fragments->scarabs', 'uniques'])) settings.set('filterPins', []);
    settings.set('pinsDefaultV2', true);
  }
  // 1.0.22: Atlas is the default look; 1.0.21 saved Dark for everyone, so move them over once (Hideout stays)
  if (!settings.get('atlasDefaultV1')) {
    if (settings.get('uiTheme') !== 'hideout') settings.set('uiTheme', 'atlas');
    settings.set('atlasDefaultV1', true);
  }
  // 1.0.24: the app's own sounds (chime, sparkle, tink…) are gone from the looks it set up: tiers keep FilterBlade's
  // sound, the app's own rules use the game's alert sounds. Sounds you added yourself stay.
  if (!settings.get('gameSoundsV1')) {
    const BUILTIN = /^poehelper-sounds\/(divine-tink|chime|sparkle|coin|soft-bell|deep-gong)\.mp3$/;
    const GAME = { 'divine-tink': 6, chime: 1, sparkle: 2, coin: 4, 'soft-bell': 4, 'deep-gong': 3 };
    const tp = settings.get('tierPatch');
    if (tp?.styles) {
      let n = 0;
      const styles = {};
      for (const [k, st] of Object.entries(tp.styles)) {
        if (st && BUILTIN.test(st.customSound || '')) { const { customSound, customVolume, ...rest } = st; styles[k] = { ...rest, keepSound: true }; n += 1; } else styles[k] = st;
      }
      if (n) settings.set('tierPatch', { ...tp, styles });
    }
    const mb = settings.get('myBasesStyle');
    if (mb && BUILTIN.test(mb.customSound || '')) { const { customSound, customVolume, ...rest } = mb; settings.set('myBasesStyle', { ...rest, sound: { id: 2, volume: 300 } }); }
    const eco = settings.get('economy');
    if (eco?.thresholds?.sounds) {
      const snd = { ...eco.thresholds.sounds };
      for (const [k, v] of Object.entries(snd)) if (GAME[v]) snd[k] = `game:${GAME[v]}`;
      settings.set('economy', { ...eco, thresholds: { ...eco.thresholds, sounds: snd } });
    }
    const d = settings.get('designer');
    if (d?.levels) {
      const levels = {};
      for (const [k, st] of Object.entries(d.levels)) levels[k] = st && BUILTIN.test(st.customSound || '') ? (({ customSound, customVolume, ...rest }) => ({ ...rest, keepSound: true }))(st) : st;
      settings.set('designer', { ...d, levels });
    }
    settings.set('gameSoundsV1', true);
  }
  // the rank upgrade runs at start, so the filter gets the new ranking without opening the page
  try { if ((migrateRanks() || kindsChanged) && filters.basePath()) filters.write(); } catch (e) { log('ranks upgrade', e.message); }

  return { exportFilterSettings, importFilterSettings, undoImportFilterSettings, canUndoImport, setTierCondition, defaultRanks, regexMapTrade, regexMapView, regexMapBuild, regexBeastView, regexBeastBuild, regexItemBases, regexItemView, regexItemBuild, regexCampaignView, regexCampaignBuild, regexGemView, regexGemBuild, setCampaignHide, setShowAllCurrency, regexSavePreset, regexDeletePreset, setBaseRanks, setRankKind, autoRanks, resetAll, undoResetAll, canUndoReset, gameSoundsState, extractGameSounds, refreshGameSounds, labLayout, LAB_DIFFS, clusterView, setCluster, baseMatrixView, setBaseMatrix, setBaseMatrixOpts, farmDashboard, setStackSize, parsePrice, currencyUnits, changelog, versionInfo, myBases, addMyBase, updateMyBase, removeMyBase, setMyBasesStyle, addTier, removeTier, renameTier, categoryArt, userIconsDir, listIcons, importIcon, deleteIcon, listSounds, importSound, soundData, autoTierWanted, readItem, magicBaseOf, tierInfoFor, SOUNDS, DEFAULT_TIER_SOUNDS, settings, snapshots, usage, cache, ninja, ggg, limiter, pricer, networth, filters, getLeague, applySettings, priceText, tradePrepare, tradeSearch, regenerateEconomy, quickFilter, usageSnapshot, tierViewNow, tierPrices, setTierAction, tierSuggest, designerState, designerSaveDraft, designerApply, designerUndo, designerSaveTheme, designerDeleteTheme, priceReview, applyReviewMoves, undoLastReview, autoTierRun, moveBases, setTierStyle, resetTiers, themes, saveTheme, applyTheme, deleteTheme, importTheme, exportTheme, VERSION };
}

function slimItem(item) {
  const { raw, ...rest } = item;
  return rest;
}

module.exports = { createServices, DEFAULT_SETTINGS };
