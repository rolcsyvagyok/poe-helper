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
const { FilterManager, economyRules, quickRule, SOUNDS, DEFAULT_TIER_SOUNDS, MY_BASES_STYLE, helperPathFor } = require('../core/filter/manager');
const { explain } = require('../core/filter/matcher');
const tiers = require('../core/filter/tiers');
const strictness = require('../core/filter/strictness');
const tierPricing = require('../core/filter/tier-prices');
const designer = require('../core/filter/designer');

const VERSION = require('../../package.json').version;

const DEFAULT_SETTINGS = {
  leagueOverride: '',
  uiTheme: 'midnight', // the app's look: 'midnight' (default), 'atlas', 'hideout' or 'dark'
  accountName: '',
  collectAutoHours: 3, // My collection: tick new uniques from the Unique stash tab every N hours (0: only on the button)
  collectAutoAt: 0,
  sessionEnc: null, // encrypted POESESSID
  contact: '', // optional contact for User-Agent, e.g. a GitHub URL
  hotkeyPrice: 'Alt+E',
  hotkeySnapshot: '',
  hotkeyPobTest: '', // copy the item under the mouse and test it against your build on the Path of Building page (off until you pick one) // save a Path of Building snapshot of your character (off until you pick one)
  defaultGuidesDone: [], // the built-in levelling guides already imported (by link)
  chatMacrosOn: true, // F1-F5 chat macros, only while Path of Exile is the active window
  chatMacroClear: true, // before a macro's text: let out a waiting ^ (accent key) and empty the chat line
  chatMacros: [{ key: 'F1', text: '/exit', send: true }, { key: 'F2', text: '/hideout', send: true }, { key: 'F3', text: '', send: true }, { key: 'F4', text: '', send: true }, { key: 'F5', text: '', send: true }],
  pobCompareOn: true, // the price check also shows what the item does to your build (Path of Building); off: PoB isn't started for it
  hotkeyAltClick: '', // one Alt + left click where the mouse is (off until you set a key)
  hotkeyClick: '', // one left click where the mouse is
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
  appIconStyle: 'flask', // the built-in icon: 'flask' (default) or 'classic' (the gold diamond)
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
  talismans: {}, // Loot filter → Talismans: { "Flame Hellion Talisman": 'top' | 'good' | 'hide' }
  talismanRest: false, // hide every talisman you haven't picked
  clusterAuto: { on: true, top: '1 div', good: '20c', basic: '5c', hide: true }, // Cluster jewels: by poe.ninja price, kept up to date
  clusterAutoCells: {}, // what that price rule set last time: { key: 'top'|'good'|'hide' }
  clusterGrid: {}, // cluster jewels: { "Large|Fire Damage|12|84": 'top' | 'good' | 'hide' }
  baseMatrix: {}, // base visibility: { "Vaal Regalia": { vis: 'hide', frac: 'show' } }
  baseMatrixOpts: { mapsOnly: true, keepIlvl: null },
  regexMaps: { kind: 'regular', avoid: [], want: [], mapTypes: { shaper: 'avoid', elder: 'avoid', conqueror: 'avoid', originator: 'avoid', blighted: 'avoid', ravaged: 'avoid' } }, // the Regex page's map choices
  campaignHide: { classes: [], rares: false, untilLevel: 67, keepLinks: 4 },
  strictness: {}, // FilterBlade's strictness done in the app, per filter: { "<filter name>": 0..6 }; missing = as FilterBlade made it
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
  rankKinds: { rares: 'off', crafting: 'D', fractured: 'D', influenced: 'D', veiled: 'D' }, // lowest rank shown per kind of drop ('D' = all ranks, 'off' = FilterBlade decides)
  rankCraftIlvl: 82,
  rankRareTiers: true, // rares on your ranked bases go into FilterBlade's rare tiers by rank (S Tier 1 ... C Tier 4)
  rankUnidRarity: ['Rare'], // rarities the item tier rules take; FilterBlade's own is all three (['Normal', 'Magic', 'Rare'])
  rankStrands: null, // Memory Strand gear per rank: fewest strands shown { S: 15, A: 20, B: 60, C: 'off' } (null = the filter decides)
  rankUnidTier: null, // 3.30 unidentified item tier per rank: { S: 2, A: 3 } (null = the filter decides)
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
  selectedTabIds: [], // the same tabs by GGG's tab id: a tab keeps its id when you move it, its number changes
  minItemChaos: 0,
  tradeTolerance: 0.1,
  tradeStatus: 'securable', // Instant Buyout only
  tradeFetchListings: true,
  tradeAutoSearch: true,
  poepricesOn: false, // poeprices.info is gone (the domain is for sale since late 2026): the price guess is off // uniques and unidentified items are searched at once (Awakened PoE Trade's "smart" first search)
  overviewBgOff: false, // you removed the Overview picture that comes with the app
  tradeSearches: [], // saved trade searches and live searches (Trade searches page), with the price watch
  filterDir: '',
  baseFilter: '',
  overrides: [],
  economy: { enabled: false, thresholds: { top: 100, high: 20, mid: 5, hideDivBelow: 0, sounds: { top: 'divine-tink', high: 'chime', mid: 'soft-bell', multi: 'coin' } } },
  autoWatchFilter: true,
  tierPatch: { moves: {}, styles: {}, actions: {} },
  labelFontPath: '',
  alwaysShow: {}, // per category: bases that move with their price but never into a hidden tier
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

function createServices({ dataDir, secrets, fetchImpl, webFetch = null, log = console.log, labBrowser = null }) {
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
      // GGG's list (checked in the background, see refreshLeague) knows a new league the minute it starts;
      // poe.ninja can take a while to add it. A price check itself never asks GGG.
      const g = settings.get('gggLeague');
      let id = g?.id && Date.now() - g.at < 12 * 3600000 ? g.id : null;
      if (!id) id = await ninja.currentLeague().catch(() => null);
      leagueCache = { at: Date.now(), id: id || leagueCache?.id || 'Standard' };
      if (id) settings.set('lastLeague', id);
      else if (!leagueCache.id || leagueCache.id === 'Standard') leagueCache.id = settings.get('lastLeague') || 'Standard';
    }
    return leagueCache.id;
  }

  /** Asks GGG which challenge league is running (1 request, at start and every few hours). */
  async function refreshLeague() {
    const { pickChallengeLeague } = require('../core/ggg');
    const id = pickChallengeLeague(await ggg.leagues());
    const before = leagueCache?.id;
    if (id) settings.set('gggLeague', { id, at: Date.now() });
    leagueCache = null;
    const now = await getLeague();
    return { league: now, changed: !!before && before !== now };
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
    get: (k) => (['selectedTabs', 'selectedTabIds', 'minItemChaos'].includes(k) ? settings.get(k) : snapshots.get(k)),
    set: (k, v) => (['selectedTabs', 'selectedTabIds', 'minItemChaos'].includes(k) ? settings.set(k, v) : snapshots.set(k, v)),
  };
  const networth = new NetWorthTracker({ ggg, ninja, store: nwStore, getLeague, log, extraPrices: (names) => extraPrices(names) });
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
    let price = await pricer.price(item).catch((e) => ({ error: e.message }));
    // no poe.ninja price (new currency): the bulk exchange's fair price from the last hour or day, if there is one
    if (price && price.chaos == null && ['currency', 'fragment', 'divination'].includes(kind)) {
      const ex = exchangeCached(item.typeLine || item.baseType || item.name);
      if (ex?.chaos) price = { ...price, error: undefined, found: true, confidence: 'exchange', chaos: ex.chaos, source: 'exchange', sellers: ex.sellers, exchangeAt: ex.at, stackSize: item.stack?.current || 1, totalChaos: Math.round(ex.chaos * (item.stack?.current || 1) * 100) / 100 };
    }
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
    let tradeable = ['rare', 'magic', 'unique', 'normal', 'gem', 'unique-map', 'map'].includes(kind) || /^corpses$/i.test(item.itemClass || '');
    const entry = { at: Date.now(), name: item.name !== item.typeLine && item.name ? `${item.name} ${item.typeLine}` : item.typeLine, kind, chaos: price.chaos ?? null, total: price.totalChaos ?? null };
    const hist = [entry, ...(settings.get('history') || [])].slice(0, 100);
    settings.set('history', hist);
    const tierInfo = tierInfoFor(item, filterHit);
    const weapon = require('../core/trade').weaponDps(item);
    // bulk items get the live exchange; identified rares a poeprices.info guess (both as Awakened shows them)
    // bulk items get the live exchange, if the exchange lists them; an item it doesn't list (a Blood-filled
    // Vessel holds its own monster) gets the normal trade search by name instead
    let bulk = ['currency', 'divination', 'fragment'].includes(kind);
    // a Facetor's Lens holds its own experience: searched by that, not on the exchange
    if (bulk && item.properties?.['Stored Experience']) { bulk = false; tradeable = true; }
    // a Mercenary Warrant: searched by its build and skills
    if (item.warrant) { bulk = false; tradeable = true; }
    // a temple (Chronicle of Atzoatl) sells for its rooms: a normal search, never the bulk exchange
    if (/^(Chronicle of Atzoatl|Inscribed Ultimatum)$/i.test(item.typeLine || item.baseType || '')) { bulk = false; tradeable = true; }
    // invitations (the Searing Exarch's, the Eater of Worlds'…): sold one at a time with instant buyout; the bulk
    // exchange's offers for them are mostly fake
    if (bulk && / Invitation$/.test(item.typeLine || item.baseType || item.name || '')) { bulk = false; tradeable = true; }
    if (bulk && kind === 'fragment') {
      try { if (!PF.exchangeTag(await ggg.tradeStatic(), item.typeLine || item.baseType || item.name)) { bulk = false; tradeable = true; } } catch { /* keep the exchange */ }
    }
    const guess = false; // poeprices.info is gone: no price guess
    // your base rank for this base, and the rare tier of the filter it puts rares in
    let baseRank = null;
    try {
      const M = require('../core/filter/manager');
      const b = item.baseType || item.typeLine;
      if (['Normal', 'Magic', 'Rare'].includes(item.rarity) && M.RANKED_NAMES.includes(b)) {
        const rank = (settings.get('baseRanks') || {})[b] || 'D';
        const RT = { S: 't1', A: 't2', B: 't3', C: 't4' };
        let rareTier = null;
        if (item.rarity === 'Rare' && settings.get('rankRareTiers') !== false && RT[rank]) {
          const t = (() => { try { return tierViewNow(); } catch { return null; } })()?.types.find((x) => x.type === 'rr')?.tiers.find((x) => x.tier === RT[rank]);
          if (t) rareTier = { tier: t.tier, state: t.state };
        }
        // unidentified (3.30): the item tier decides, not the rare tiers
        const unid = item.flags?.unidentified ? { tier: item.unidTier ?? null, min: (settings.get('rankUnidTier') || {})[rank] ?? null } : null;
        if (unid) rareTier = null;
        baseRank = { base: b, rank, rareTier, unid, look: (M.RANK_LOOKS || {})[rank] || null, group: M.rankGroupOf ? M.rankGroupOf(b) : null };
      }
    } catch { /* no ranks */ }
    let collection = null;
    if (item.rarity === 'Unique' && (item.baseType || item.typeLine)) { try { collection = await collectionFor(item.baseType || item.typeLine); collection.own = item.flags?.unidentified ? null : (item.name || null); } catch { collection = null; } }
    // a cluster jewel: its row in the Cluster jewels price table (size, small passive kind, passives)
    let cluster = null;
    const cm = /^(Large|Medium|Small) Cluster Jewel$/.exec(item.baseType || item.typeLine || '');
    if (cm && item.rarity !== 'Unique') {
      const en = item.mods?.enchant || [];
      const grants = en.filter((t) => /^Added Small Passive Skills grant:/i.test(t)).map((t) => t.replace(/^Added Small Passive Skills grant:\s*/i, ''));
      const node = grants.length ? require('../core/filter/matcher').clusterNode(grants.join('\n')) : null;
      const passives = Number(/^Adds (\d+) Passive Skills?/i.exec(en.find((t) => /^Adds \d+ Passive/i.test(t)) || '')?.[1]) || null;
      cluster = { size: cm[1], node, passives, ilvl: item.itemLevel || null };
    }
    return { warrant: item.warrant || null, collection, baseRank, cluster, item: slimItem(item), kind, price, filterHit, filterWhere, tierInfo, tradeable, weapon, bulk, guess, autoBulk: settings.get('tradeAutoSearch') !== false };
  }

  let bulkTag = async () => null;
  let statsRetryAt = 0; // the last time an unknown mod asked for a new stat list (at most once an hour, even when it fails)
  async function tradePrepare(text) {
    const item = readItem(text);
    if (!item) throw new Error('Not an item.');
    let stats = await ggg.tradeStats(); // 1 request per week at most
    // the search Awakened PoE Trade would make: totals, the item's own numbers at 20% quality, what to tick
    let { mods, props, presets } = require('../core/trade').prepareSearch(stats, item, { tolerance: settings.get('tradeTolerance') ?? 0.1 });
    // a mod the list doesn't know may be new this league: a list over a day old is fetched again (1 request a day at most)
    if (mods.some((m) => m.unmatched) && Date.now() - statsRetryAt > 60 * 60 * 1000) {
      statsRetryAt = Date.now();
      const fresh = await ggg.tradeStats({ maxAge: 24 * 60 * 60 * 1000 }).catch(() => stats);
      if (fresh !== stats) { stats = fresh; ({ mods, props, presets } = require('../core/trade').prepareSearch(stats, item, { tolerance: settings.get('tradeTolerance') ?? 0.1 })); }
    }
    const kind = classify(item);
    // an imbued support the trade site's list didn't match: its exact characters, to see why (no private data)
    for (const m of mods) if (m.group === 'imbued' && m.unmatched) log('imbued not matched', JSON.stringify(m.text), [...String(m.text)].map((c) => c.charCodeAt(0)).filter((c) => c > 126 || c < 32).join(',') || 'plain');
    // only an identified unique is searched at once; everything else waits for Search (saves GGG requests)
    // an unidentified unique: which uniques its base can be (the trade site's item list, cached). One (Voices on a
    // Large Cluster Jewel): that's it. More: you pick, as in Awakened PoE Trade
    let uniqueChoices = null;
    if (kind === 'unique' && item.flags?.unidentified) {
      try {
        const base = item.baseType || item.typeLine;
        const names = [];
        for (const g of (await ggg.tradeItems())?.result || []) for (const e of g.entries || []) if (e.name && e.type === base && e.flags?.unique && !names.includes(e.name)) names.push(e.name);
        uniqueChoices = names;
        if (names.length === 1) props.uniqueName = names[0];
      } catch (e) { log('unique choices', e.message); }
    }
    const autoSearch = settings.get('tradeAutoSearch') !== false && ((kind === 'unique' && (!item.flags?.unidentified || !!props.uniqueName)) || !!item.warrant);
    return { mods, props, presets, kind, autoSearch, uniqueChoices, status: settings.get('tradeStatus') || 'securable' };
  }

  /** Wickerman parts: the trade site lists some by their plain name ("Hag's Stomach"), some by the full one
   *  ("Greater Golemic Stone"); its item list (cached) says which */
  async function fixPartType(item) {
    if (item.itemClass !== 'Viscera') return;
    try { item.baseType = require('../core/trade').partTradeType(await ggg.tradeItems(), item.typeLine) || item.baseType; } catch (e) { log('trade item list', e.message); }
  }

  /** The same search as a trade site link (pathofexile.com/trade/search/<league>?q=...), without asking GGG's API. */
  async function tradeSiteUrl({ text, mods, props = null, opts = {} }) {
    const item = readItem(text);
    if (!item) throw new Error('Not an item.');
    const league = await getLeague();
    const status = opts.status || settings.get('tradeStatus') || 'securable';
    let gemType = null;
    if (classify(item) === 'gem' && / of /.test(item.typeLine || '')) {
      try { gemType = require('../core/trade').gemTradeType(await ggg.tradeItems(), item.typeLine); } catch { /* base name */ }
    }
    await fixPartType(item);
    let warrantType = null;
    if (item.warrant?.build) { try { warrantType = require('../core/trade').warrantTradeType(await ggg.tradeItems(), item.warrant.build); } catch (e) { log('trade item list', e.message); } }
    const query = buildQuery(item, mods || [], { tolerance: settings.get('tradeTolerance'), ...opts, status, ...(props ? { props } : {}), ...(gemType ? { gemType } : {}), ...(warrantType ? { warrantType } : {}) });
    return `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify({ query: query.query, sort: query.sort }))}`;
  }
  async function tradeSearch({ text, mods, props = null, opts = {} }) {
    const item = readItem(text);
    if (!item) throw new Error('Not an item.');
    const league = await getLeague();
    const status = opts.status || settings.get('tradeStatus') || 'securable';
    // transfigured gems are searched as their base gem plus a discriminator (the trade site's item list says which)
    let gemType = null;
    if (classify(item) === 'gem' && / of /.test(item.typeLine || '')) {
      try { gemType = require('../core/trade').gemTradeType(await ggg.tradeItems(), item.typeLine); } catch (e) { log('trade item list', e.message); }
    }
    await fixPartType(item);
    let warrantType = null;
    if (item.warrant?.build) { try { warrantType = require('../core/trade').warrantTradeType(await ggg.tradeItems(), item.warrant.build); } catch (e) { log('trade item list', e.message); } }
    const query = buildQuery(item, mods || [], { tolerance: settings.get('tradeTolerance'), ...opts, status, ...(props ? { props } : {}), ...(gemType ? { gemType } : {}), ...(warrantType ? { warrantType } : {}) });
    const res = await ggg.tradeSearch(league, query, { maxWaitMs: 10000 }).catch((e) => {
      // the trade site doesn't know this item (new league items it doesn't list yet, like Wickerman parts)
      if (/Unknown item base type/i.test(e.message)) throw new Error(`The trade site doesn't list ${item.typeLine || 'this item'}, so it can't be price checked there.`);
      throw e;
    });
    const out = { url: ggg.tradeUrl(league, res.id), total: res.total ?? res.result?.length ?? 0, listings: null };
    if ((opts.fetchListings ?? settings.get('tradeFetchListings')) && res.result?.length) {
      // the 10 cheapest: one request (a second one only when all 10 are the same one or two sellers)
      const first = await ggg.tradeFetch(res.id, res.result.slice(0, 10));
      const sellers = summarizeListings(first, null).prices.length;
      const more = res.result.length > 10 && sellers <= 2 ? await ggg.tradeFetch(res.id, res.result.slice(10, 20)).catch(() => ({ result: [] })) : { result: [] };
      const divine = await ninja.divinePrice(league).catch(() => null);
      out.listings = summarizeListings({ result: [...(first.result || []), ...(more.result || [])] }, divine, { me: settings.get('accountName') || '' });
    }
    return out;
  }

  // ---------- Mercenary Warrants: priced against the listed ones like yours ----------
  /** choices: what you ticked (see core/merc.js model); empty = Awakened PoE Trade's start (primary skills only). */
  async function warrantAnalyze({ text, choices = {}, status = null } = {}) {
    const M = require('../core/merc');
    const item = readItem(text);
    if (!item?.warrant) throw new Error('Not a Mercenary Warrant.');
    const league = await getLeague();
    const m = M.model(item.warrant, choices);
    let type = null;
    try { type = require('../core/trade').warrantTradeType(await ggg.tradeItems(), item.warrant.build); } catch (e) { log('trade item list', e.message); }
    const query = M.warrantQuery(m, type, status || settings.get('tradeStatus') || 'securable');
    const res = await ggg.tradeSearch(league, query, { maxWaitMs: 10000 });
    const divine = await ninja.divinePrice(league).catch(() => null);
    const got = [];
    // the 20 cheapest: two requests at most
    for (let i = 0; i < Math.min(20, res.result?.length || 0); i += 10) {
      const f = await ggg.tradeFetch(res.id, res.result.slice(i, i + 10)).catch(() => ({ result: [] }));
      got.push(...(f.result || []));
    }
    const listings = got.map((r) => M.readListing(r, divine)).filter(Boolean);
    const a = M.analyze(m, listings);
    return { ...m, name: item.warrant.name, typeFound: !!type, url: ggg.tradeUrl(league, res.id), total: res.total ?? 0, cheapest: a.cheapest, sample: a.sample,
      listings: listings.slice(0, 5).map((l) => ({ chaos: l.chaos, name: l.name, level: l.level })) };
  }

  // ---------- bulk exchange and poeprices.info, as Awakened PoE Trade ----------
  const PF = require('../core/price-filters');
  /** Live exchange listings for a stackable item (currency, fragments, cards…): 1 request. null when it has no tag. */
  // ---------- bulk exchange prices, for currency poe.ninja doesn't price yet (new this league) ----------
  // checked at most once an hour per item, kept a day; "no price" is kept too, so it isn't asked again
  const EX_TTL = 60 * 60 * 1000;
  const EX_KEEP = 24 * 60 * 60 * 1000;
  function exchangeCached(name) {
    const e = (settings.get('exchangePrices') || {})[name];
    return e && Date.now() - e.at < EX_KEEP ? e : null;
  }
  function exchangeRemember(name, est) {
    const all = { ...(settings.get('exchangePrices') || {}), [name]: { chaos: est?.chaos ?? null, sellers: est?.sellers ?? 0, at: Date.now() } };
    const keep = Object.keys(all).sort((a, b) => all[b].at - all[a].at).slice(0, 60);
    settings.set('exchangePrices', Object.fromEntries(keep.map((k) => [k, all[k]])));
  }
  async function exchangePrice(name) {
    const hit = exchangeCached(name);
    if (hit && Date.now() - hit.at < EX_TTL) return hit.chaos ? hit : null;
    const tag = PF.exchangeTag(await ggg.tradeStatic(), name);
    if (!tag) return null;
    const league = await getLeague();
    const res = await ggg.tradeExchange(league, PF.exchangeQuery(tag, { status: 'online' }), { maxWaitMs: 10000 });
    const divine = await ninja.divinePrice(league).catch(() => null);
    const est = PF.exchangeEstimate(PF.exchangeListings(res, { me: settings.get('accountName') || '' }), divine);
    exchangeRemember(name, est);
    return est;
  }
  /** For a WealthyExile snapshot: exchange prices for currency poe.ninja doesn't price; 5 new requests at most. */
  async function extraPrices(names) {
    const out = new Map();
    let asked = 0;
    for (const n of names) {
      let e = exchangeCached(n);
      if (!e || Date.now() - e.at >= EX_TTL) {
        if (asked >= 5) { if (e?.chaos) out.set(n, e.chaos); continue; }
        asked += 1;
        try { e = await exchangePrice(n); } catch (err) { log('exchange price', n, err.message); }
      }
      if (e?.chaos) out.set(n, e.chaos);
    }
    return out;
  }

  async function tradeBulk({ text, status } = {}) {
    const item = readItem(text);
    if (!item) throw new Error('Not an item.');
    const tag = PF.exchangeTag(await ggg.tradeStatic(), item.typeLine || item.baseType || item.name);
    if (!tag) return null;
    const league = await getLeague();
    const res = await ggg.tradeExchange(league, PF.exchangeQuery(tag, { status: status === 'any' ? 'any' : 'online' }), { maxWaitMs: 10000 });
    const divine = await ninja.divinePrice(league).catch(() => null);
    const rows = PF.exchangeListings(res, { me: settings.get('accountName') || '' });
    // the fair price (3rd cheapest online seller), kept for the price check and WealthyExile when poe.ninja has none
    const estimate = status === 'any' ? null : PF.exchangeEstimate(rows, divine);
    if (status !== 'any') exchangeRemember(item.typeLine || item.baseType || item.name, estimate);
    return { tag, total: res.total ?? Object.keys(res.result || {}).length, url: ggg.exchangeUrl(league, res.id), divineChaos: divine, estimate, ...rows };
  }
  bulkTag = async (text) => { try { const it = readItem(text); return it ? PF.exchangeTag(await ggg.tradeStatic(), it.typeLine || it.baseType || it.name) : null; } catch { return null; } };

  // poeprices.info: its guess for a rare, cached 5 minutes (the same item checked twice costs nothing)
  const guessCache = new Map();
  async function pricePredict({ text } = {}) {
    return null; // poeprices.info is gone (the domain now points to a sale page)
    const item = readItem(text);
    if (!item || item.rarity !== 'Rare' || item.flags?.unidentified) return null;
    const league = await getLeague();
    const q = PF.poepricesQuery(require('../core/item-parser').plainItemText(text), league);
    const hit = guessCache.get(q);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.r;
    const res = await (fetchImpl || globalThis.fetch)(`https://www.poeprices.info/api?${q}`, { headers: { 'User-Agent': userAgent() } });
    let json;
    try { json = await res.json(); } catch { throw new Error(`poeprices.info is busy or down (${res.status}).`); }
    const cur = await ninja.category(league, 'Currency').catch(() => []);
    const r = { ...PF.poepricesResult(json, { exaltChaos: cur.find((c) => /^exalted orb$/i.test(c.name))?.chaos || null, divineChaos: cur.find((c) => /^divine orb$/i.test(c.name))?.chaos || null }), url: `https://www.poeprices.info/api?${q}&w=1` };
    guessCache.set(q, { at: Date.now(), r });
    if (guessCache.size > 50) guessCache.delete(guessCache.keys().next().value);
    return r;
  }

  // ---------- saved trade searches and the price watch ----------
  const TW = require('../core/trade-watch');
  const savedSearches = () => (Array.isArray(settings.get('tradeSearches')) ? settings.get('tradeSearches') : []);
  const keepSearches = (list) => settings.set('tradeSearches', list);
  const publicSearch = (s) => ({ ...s, query: undefined, hasQuery: !!s.query, told: undefined, lastTop: undefined, lastListings: undefined, link: TW.tradeLink(s) });
  function tradeSearchList() {
    const list = savedSearches();
    return { list: list.map(publicSearch), perDay: TW.requestsPerDay(list), budget: settings.get('dailyGggBudget'), usedToday: ggg.usageToday().total, minEvery: TW.MIN_EVERY, maxWatched: TW.MAX_WATCHED };
  }
  function cleanMax(max) {
    const amount = Number(max?.amount);
    return amount > 0 ? { amount: Math.round(amount * 100) / 100, unit: max.unit === 'divine' ? 'divine' : 'chaos' } : null;
  }
  /** Add or change one: { key? (an existing one), name, url, max: { amount, unit }, everyMin, watch } */
  function tradeSearchSave(e = {}) {
    const list = savedSearches();
    const old = e.key ? list.find((x) => x.key === e.key) : null;
    const url = e.url ?? (old ? TW.tradeLink(old) : '');
    const p = TW.parseTradeUrl(url);
    if (!p) throw new Error('Paste a pathofexile.com/trade link, e.g. https://www.pathofexile.com/trade/search/League/AbC123');
    const inLink = TW.queryFromId(p.id)?.query; // a long link names its item: "Nebulis Void Sceptre"
    const name = String(e.name ?? old?.name ?? '').trim().slice(0, 80) || [inLink?.name, inLink?.type].filter((x) => typeof x === 'string').join(' ').slice(0, 80) || (p.live ? 'Live search' : 'Trade search');
    const same = old && old.league === p.league && old.id === p.id;
    const next = {
      ...(same ? old : {}),
      key: old?.key || `ts${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name, kind: p.kind, league: p.league, id: p.id, live: p.live,
      max: e.max !== undefined ? cleanMax(e.max) : (old?.max || null),
      everyMin: Math.max(TW.MIN_EVERY, Math.min(24 * 60, Math.round(Number(e.everyMin ?? old?.everyMin ?? 30)) || 30)),
      watch: e.watch !== undefined ? !!e.watch : (old?.watch ?? false),
      added: old?.added || Date.now(),
    };
    if (!same) { delete next.query; delete next.told; delete next.lastCheck; delete next.last; delete next.error; delete next.lastTop; delete next.lastListings; }
    if (next.watch && next.kind === 'exchange') next.watch = false; // bulk exchange links can only be opened
    const watched = list.filter((x) => x.watch && x.key !== next.key).length;
    if (next.watch && watched >= TW.MAX_WATCHED) throw new Error(`At most ${TW.MAX_WATCHED} searches can be watched at once.`);
    const out = old ? list.map((x) => (x.key === old.key ? next : x)) : [...list, next];
    keepSearches(out);
    return tradeSearchList();
  }
  function tradeSearchRemove(key) {
    keepSearches(savedSearches().filter((x) => x.key !== key));
    return tradeSearchList();
  }
  function tradeSearchMove(key, dir) {
    const list = savedSearches();
    const i = list.findIndex((x) => x.key === key);
    const j = i + (dir < 0 ? -1 : 1);
    if (i >= 0 && j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
    keepSearches(list);
    return tradeSearchList();
  }
  /** Runs one saved search again, cheapest first. Returns { entry, hits, url }. */
  async function tradeSearchCheck(key) {
    let s = savedSearches().find((x) => x.key === key);
    if (!s) throw new Error('That search is gone.');
    if (s.kind === 'exchange') throw new Error('Bulk exchange links can be opened, not checked for prices.');
    const update = (patch) => { const list = savedSearches(); const i = list.findIndex((x) => x.key === key); if (i >= 0) { list[i] = { ...list[i], ...patch }; keepSearches(list); s = list[i]; } };
    try {
      if (!s.query) update({ query: await ggg.tradeQuery(s.league, s.id) });
      const res = await ggg.tradeSearch(s.league, TW.cheapestFirst(s.query));
      const divine = await ninja.divinePrice(s.league).catch(() => null);
      // the same 10 cheapest listings as last time: their prices are known, so no fetch (half the requests)
      const top = (res.result || []).slice(0, 10);
      const sameTop = top.length && s.lastTop === top.join(',') && Array.isArray(s.lastListings);
      const listings = sameTop ? s.lastListings.map((l) => ({ ...l, chaos: TW.chaosOf(l, divine) }))
        : TW.listingsOf(top.length ? await ggg.tradeFetch(res.id, top, { interactive: false }) : { result: [] }, divine);
      const { hits, cheapest } = TW.priceHits(listings, s.max, divine, s.told || []);
      const told = [...new Set([...(s.told || []), ...hits.map((x) => x.id)])].slice(-200);
      update({ lastCheck: Date.now(), error: null, told, lastTop: top.join(','), lastListings: listings.map(({ chaos, ...l }) => l), last: { total: res.total ?? res.result?.length ?? 0, cheapest, divine: divine || null, at: Date.now(), url: ggg.tradeUrl(s.league, res.id) } });
      return { entry: publicSearch(s), hits, url: ggg.tradeUrl(s.league, res.id) };
    } catch (e) {
      update({ lastCheck: Date.now(), error: e.message });
      throw e;
    }
  }
  /** The price watch: checks the searches that are due, one after another. Returns what to tell you. */
  async function tradeWatchTick() {
    const out = [];
    for (const s of TW.dueSearches(savedSearches())) {
      try {
        const r = await tradeSearchCheck(s.key);
        if (r.hits.length) out.push(r);
      } catch (e) {
        log('trade watch', s.name, e.message);
        if (/budget/i.test(e.message)) break;
      }
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
    // the patch notes show what changed since the version whose notes you last read (else the one you updated from)
    return { version: VERSION, releasedAt: mine?.date || null, updatedAt: seen.at, updatedFrom: seen.from, justUpdated, notesShown: settings.get('notesShownFor') === VERSION, notesBase: (settings.get('notesShownFor') && settings.get('notesShownFor') !== VERSION ? settings.get('notesShownFor') : settings.get('notesShownFor') === VERSION ? settings.get('notesBase') : null) || seen.from || null };
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
    // every name says where it is ("name\tGem"): look only there, not in every other list
    const onlyHinted = names.length && names.every((raw) => String(raw).includes('\t'));
    for (const c of [...hinted, ...(onlyHinted ? [] : ART_DEFAULT.filter((x) => !hinted.includes(x)))]) {
      if (![...want].some((n) => !n.startsWith('*') && !out[n])) break;
      let icons = new Map();
      try { icons = await ninja.icons(league, c); } catch { /* the priced list below */ }
      // the priced list too (same cached data), with its spelling fixes
      try { for (const l of await ninja.category(league, c)) if (l.icon && !icons.has(l.name)) icons.set(l.name, String(l.icon).startsWith('/') ? `https://web.poecdn.com${l.icon}` : String(l.icon)); } catch { /* none */ }
      for (const n of want) if (!out[n] && icons.has(n) && ok(icons.get(n))) out[n] = icons.get(n);
    }
    // the first hours of a new league poe.ninja has few lists (no gems yet): pictures are the same in Standard
    if (league !== 'Standard' && hinted.length && [...want].some((n) => !n.startsWith('*') && !out[n])) {
      for (const c of hinted) {
        let icons = new Map();
        try { icons = await ninja.icons('Standard', c); } catch { continue; }
        for (const n of want) if (!out[n] && icons.has(n) && ok(icons.get(n))) out[n] = icons.get(n);
      }
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
    'clientLogPath', 'selectedTabs', 'selectedTabIds', 'filterDir', 'baseFilter', 'baseFilterName', 'history', 'designerThemes', 'themes', 'priceReviewLog', 'trayHintShown',
    'economyRetired', 'gigaRestoreV1', 'tinkToGame6', 'gigaLookV3', 'bigBeltsLookV2', 't1BorderText', 'ranksV1', 'ranksV2', 'ranksV3', 'ranksV4', 'ownTierFixV1', 'fullLooksV1', 'fbVisibilityV1', 'rareRanksFbV1', 'stackedDesignV1', 'threadsTieredV1', 'myChoiceV1', 'rareThemeV1', 'veiledKindV1', 'midnightV1', 'rareTiersV2', 'rareYellowV1', 'sixSocketWhiteV1', 'clusterDesignV1', 'stackedDeckStacksV1'];
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
  const FILTER_KEYS = ['sizeAdjust', 'alwaysShow', 'collectHide', 'uniqueCollection', 'collectHideBelow', 'collectedHideBases', 'collectMissingBases', 'rankUnidRarity', 'rankStrands', 'mapHide', 'strictness', 'tierPatch', 'overrides', 'economy', 'clusterGrid', 'clusterAuto', 'clusterAutoCells', 'talismans', 'talismanRest', 'baseMatrix', 'baseMatrixOpts', 'baseRanks', 'hiddenGroups', 'campaignHide', 'showAllCurrency', 'rankKinds', 'rankCraftIlvl', 'rankIlvl', 'rankUnidTier',
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
  // ---------- share the app's own settings (not the loot filter, not anything private) ----------
  // Only these go in the file: hotkeys, chat macros, overlay and price check choices, the Regex page,
  // saved trade searches, the lab overlay. Never your account, login (POESESSID), league, folders on
  // your PC (Path of Exile, Path of Building, the filter), history, net worth or caches.
  const APP_KEYS = ['uiTheme', 'collectAutoHours', 'hotkeyPrice', 'hotkeySnapshot', 'hotkeyPobTest', 'chatMacrosOn', 'chatMacroClear', 'chatMacros', 'pobCompareOn',
    'hotkeyLab', 'hotkeyAltClick', 'hotkeyClick', 'labFavorite', 'labOpacity', 'clipboardMode', 'restoreClipboard', 'overlayCloseOnMouseAway', 'minimizeToTray',
    'appIconStyle', 'regexMaps', 'regexGems', 'regexGemClass', 'regexCampaign', 'regexItems', 'regexBeasts', 'regexFavMods',
    'regexTrade', 'regexPresets', 'dailyGggBudget', 'ninjaTtlMin', 'autoSnapshotMin', 'minItemChaos', 'tradeTolerance',
    'tradeStatus', 'tradeFetchListings', 'tradeAutoSearch', 'tradeSearches', 'overviewBgOff', 'fbSideMini', 'fbSideWidth', 'filterPins', 'autoWatchFilter'];
  const APP_SHARE_KIND = 'poe-helper-app-settings';
  function exportAppSettings() {
    const values = Object.fromEntries(APP_KEYS.filter((k) => settings.get(k) !== undefined).map((k) => [k, settings.get(k)]));
    // saved trade searches go without their last results and notifications (yours, not theirs)
    if (Array.isArray(values.tradeSearches)) values.tradeSearches = values.tradeSearches.map(({ last, lastCheck, lastListings, lastTop, told, error, ...t }) => t);
    return JSON.stringify({ kind: APP_SHARE_KIND, version: 1, app: VERSION, exportedAt: new Date().toISOString(), settings: values }, null, 1);
  }
  /** Someone else's app settings replace yours (yours are kept for Undo); keys the file doesn't have stay yours. */
  function importAppSettings(text) {
    const fs = require('fs');
    let data;
    try { data = JSON.parse(String(text)); } catch { throw new Error('That isn\'t a PoE Helper app settings file.'); }
    if (data?.kind === SHARE_KIND) throw new Error('That is a loot filter settings file: import it under "Share your loot filter settings".');
    if (data?.kind !== APP_SHARE_KIND || typeof data.settings !== 'object' || !data.settings) throw new Error('That isn\'t a PoE Helper app settings file.');
    fs.writeFileSync(path.join(dataDir, 'settings-before-app-import.json'), JSON.stringify(Object.fromEntries(APP_KEYS.map((k) => [k, settings.data[k] ?? null]))));
    let n = 0;
    const ok = (k, v) => (k === 'chatMacros' || k === 'tradeSearches' || k === 'regexPresets' || k === 'regexFavMods' || k === 'filterPins' ? Array.isArray(v)
      : DEFAULT_SETTINGS[k] == null || v == null || typeof v === typeof DEFAULT_SETTINGS[k]);
    for (const k of APP_KEYS) if (k in data.settings && ok(k, data.settings[k])) { settings.data[k] = data.settings[k]; n++; }
    // chat macros type into your game chat: keep them to a key and one line of text each
    if (Array.isArray(settings.data.chatMacros)) settings.data.chatMacros = settings.data.chatMacros.slice(0, 12).map((m) => ({ key: String(m?.key || ''), text: String(m?.text || '').replace(/[\r\n]+/g, ' ').slice(0, 250), send: m?.send !== false })).filter((m) => m.key);
    settings.save();
    return { count: n, from: data.app || null, at: data.exportedAt || null };
  }
  function undoImportAppSettings() {
    const fs = require('fs');
    const f = path.join(dataDir, 'settings-before-app-import.json');
    if (!fs.existsSync(f)) throw new Error('There is no import to undo.');
    const before = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [k, v] of Object.entries(before)) { if (!APP_KEYS.includes(k)) continue; if (v === null) delete settings.data[k]; else settings.data[k] = v; }
    settings.save();
    fs.unlinkSync(f);
    return true;
  }
  function canUndoAppImport() {
    try { return require('fs').existsSync(path.join(dataDir, 'settings-before-app-import.json')); } catch { return false; }
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

  // the tiers as the game will have them at a strictness level (your own changes on top)
  function viewAtLevel(text, patch, level) {
    // tiers show what the game will do (with your strictness); "by you" marks only your own changes
    // base ranks sort rares into FilterBlade's rare tiers (as the written filter has them); your moves win
    let shown = patch;
    if (settings.get('rankRareTiers') !== false) {
      const { rareTierMoves } = require('../core/filter/manager');
      const rm = rareTierMoves(text, settings.get('baseRanks') || {}, require('../core/filter/manager').RANKED_NAMES || []);
      shown = { ...patch, moves: { ...rm, ...(patch.moves || {}) } };
    }
    const sp = strictness.withStrictness(text, shown, level);
    const view = tiers.tierView(text, sp);
    view.editedActions = patch.actions || {};
    // "Show all currency" shows the currency tiers the filter itself hides (not yours, not your strictness's):
    // the tiers say so, as the game will show them
    if (settings.get('showAllCurrency')) {
      for (const t of view.types) if (/^currency(->|$)/.test(t.type)) for (const x of t.tiers) {
        if (x.state === 'Hide' && sp.actions?.[x.key] !== 'Hide') { x.state = 'Show'; x.allCurrency = true; }
      }
    }
    return view;
  }

  /**
   * What a strictness level would change before you pick it: every tier whose state (Shown, Hidden, Off) differs
   * from now, with its items. { from, to, changes: [{ type, label, key, tier, name, mine, before, after, bases }] }
   */
  function strictnessPreview(level) {
    const now = tierViewNow();
    if (!now) throw new Error('Choose your filter first.');
    const text = filters.readBase();
    const lv = level == null || level === '' ? strictness.levelOf(text) : Math.max(0, Math.min(strictness.LEVELS.length - 1, Math.round(Number(level))));
    const next = viewAtLevel(text, settings.get('tierPatch') || {}, lv);
    const stateOf = (x) => x.state || (x.off ? 'Off' : x.action);
    const before = new Map(now.types.flatMap((t) => t.tiers.map((x) => [x.key, stateOf(x)])));
    const changes = [];
    for (const t of next.types) for (const x of t.tiers) {
      const was = before.get(x.key);
      const will = stateOf(x);
      if (!was || was === will) continue;
      if (x.hasBaseList && !(x.bases || []).length) continue; // an empty tier: nothing changes in game
      changes.push({ type: t.type, label: t.label, key: x.key, tier: x.tier, customName: x.customName || null, mine: !!x.mine, before: was, after: will, bases: (x.bases || []).slice(0, 40), count: (x.bases || []).length, catchAll: !x.hasBaseList });
    }
    const L = strictness.LEVELS;
    const from = now.strictness?.level ?? now.strictness?.own ?? null;
    return { from, fromName: L[from] ?? null, to: lv, toName: L[lv], changes };
  }

  function tierViewNow() {
    const base = filters.basePath();
    if (!base) return null;
    let mtime;
    try { mtime = require('fs').statSync(base).mtimeMs; } catch { return null; }
    const patch = settings.get('tierPatch') || {};
    let head = '';
    try { const fd = require('fs').openSync(base, 'r'); const buf = Buffer.alloc(2048); require('fs').readSync(fd, buf, 0, 2048, 0); require('fs').closeSync(fd); head = buf.toString('utf8'); } catch { /* read below */ }
    const level = strictness.levelFor(settings.get('strictness'), head, base);
    const sig = `${base}|${mtime}|${level}|${!!settings.get('showAllCurrency')}|${JSON.stringify(patch)}`;
    if (viewCache?.sig !== sig) {
      const text = filters.readBase();
      const view = viewAtLevel(text, patch, level);
      // scrolls and lifeforce always get their own colours in the written filter: show them that way here
      const { fixedLookOf } = require('../core/filter/manager');
      for (const t of view.types) for (const x of t.tiers) {
        const f = x.bases?.length && x.bases.every((b) => fixedLookOf([b])?.base === b) && new Set(x.bases.map((b) => fixedLookOf([b]).base)).size === 1 ? fixedLookOf(x.bases) : null;
        if (!f || x.action !== 'Show') continue;
        const st = { ...(x.style || {}), background: f.background, text: f.text, ...(f.border ? { border: f.border } : {}), ...(f.fontSize ? { fontSize: f.fontSize } : {}) };
        if (st.beam) st.beam = { ...st.beam, color: f.beam };
        if (st.icon) st.icon = { ...st.icon, color: f.game };
        x.style = st;
        x.fixedLook = f.base;
      }
      // "what FilterBlade has" for a tier is its state at your strictness
      const sa = strictness.strictnessActions(text, level);
      for (const t of view.types) for (const x of t.tiers) if (sa[x.key]) x.origState = sa[x.key];
      view.strictness = { level, own: strictness.levelOf(text), levels: strictness.LEVELS, notes: strictness.NOTES };
      viewCache = { sig, view };
    }
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

  /**
   * Uniques whose base is in none of your unique tiers (new bases like Eye Gouger): they get the catch-all look.
   * -> [{ name: base, label: 'Eye Gouger: The Covetous Dark', chaos, listings }] (the base is what's moved)
   */
  async function unlistedUniqueBases(view) {
    const league = await getLeague();
    const CLS = { UniqueWeapon: 'Wands', UniqueArmour: 'Body Armours', UniqueAccessory: 'Rings', UniqueFlask: 'Utility Flasks', UniqueJewel: 'Jewels' };
    const inTiers = new Set(view.types.filter((t) => t.type === 'uniques').flatMap((t) => t.tiers.flatMap((x) => x.bases)));
    let parsed = null;
    try { const t = filters.activeText(); if (t != null) parsed = require('../core/filter/parser').parse(t); } catch { parsed = null; }
    const byBase = new Map();
    for (const [cat, cls] of Object.entries(CLS)) {
      let lines = [];
      try { lines = await ninja.category(league, cat); } catch { continue; }
      for (const l of lines) {
        const base = l.baseType;
        if (!base || inTiers.has(base) || l.links >= 5 || !(l.chaos > 0)) continue;
        const cur = byBase.get(base);
        if (cur && cur.chaos >= l.chaos) continue;
        byBase.set(base, { name: base, label: `${base}: ${l.name}`, chaos: l.chaos, listings: l.listingCount ?? null, cls, unique: l.name, known: true });
      }
    }
    const lands = (u) => {
      if (!parsed) return true;
      const item = readItem(`Item Class: ${u.cls}\nRarity: Unique\n${u.unique}\n${u.name}\n--------\nItem Level: 80\n--------\nx`);
      const hit = item && explain(parsed, item);
      return !!hit && /\$type->uniques\s+\$tier->rest/.test(hit.comment || '');
    };
    return [...byBase.values()].filter(lands).sort((a, b) => b.chaos - a.chaos).slice(0, 60).map(({ cls, unique, ...u }) => u);
  }

  /**
   * Tier moves for items your filter can't have any more: names the last write left out because neither your
   * FilterBlade filter nor poe.ninja's current league knows them (last league's scarabs…). [{ key, type, name }]
   */
  // Is the FilterBlade filter older than NeverSink's newest release? GitHub is asked at most once a day.
  async function filterAge() {
    let text; try { if (!filters.basePath()) return null; text = filters.readBase(); } catch { return null; }
    let latest = settings.get('neverSinkLatest');
    if (!latest || Date.now() - latest.at > 86400000) {
      try {
        const res = await (fetchImpl || globalThis.fetch)('https://api.github.com/repos/NeverSinkDev/NeverSink-Filter/releases/latest', { headers: { 'User-Agent': userAgent(), Accept: 'application/vnd.github+json' } });
        const tag = res.ok ? (await res.json())?.tag_name : null;
        latest = { tag: /^\d+\.\d+/.test(tag || '') ? tag : latest?.tag || null, at: Date.now() };
      } catch (e) { log('neversink version', e.message); latest = { tag: latest?.tag || null, at: Date.now() - 82800000 }; } // try again in an hour
      settings.set('neverSinkLatest', latest);
    }
    return require('../core/filter/version').filterAge(text, latest.tag);
  }

  function staleMoves() {
    const dropped = new Set(filters.lastDropped || []);
    if (!dropped.size) return [];
    return Object.keys((settings.get('tierPatch') || {}).moves || {}).map((k) => { const [type, name] = k.split('\t'); return { key: k, type, name }; }).filter((m) => dropped.has(m.name));
  }
  /** Removes those moves (only when you click Remove on the Loot filter page). */
  function dropStaleMoves() {
    const stale = staleMoves();
    if (!stale.length) return { removed: 0, view: tierViewNow() };
    const p = { ...(settings.get('tierPatch') || {}) };
    p.moves = { ...(p.moves || {}) };
    for (const m of stale) delete p.moves[m.key];
    log('removed old tier moves', stale.map((m) => m.name).join(', '));
    return { ...savePatch(p), removed: stale.length };
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
    // back to what FilterBlade had: drop the change rather than store a no-op. A Hide is always kept: with
    // "Show all currency" on, only tiers you hid yourself stay hidden (FilterBlade's own hides are shown)
    if (tier && action === tier.origState && action !== 'Hide') action = null;
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

  /** One look for several tiers at once (Loot filter → Rare looks); null = back to FilterBlade's looks. */
  function setTierStyles(keys = [], style = null) {
    let patch = settings.get('tierPatch') || {};
    for (const k of keys) patch = tiers.withStyle(patch, String(k), style || null);
    return savePatch(patch);
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
    // first time only: the hourly auto-tier keeps it up to date after that
    if (!Object.keys(settings.get('clusterAutoCells') || {}).length) { try { await clusterAutoRun({ prices, divine: units.divine }); } catch (e) { log('cluster auto', e.message); } }
    return { auto: settings.get('clusterAuto') || {}, autoCells: settings.get('clusterAutoCells') || {}, sizes: cl.SIZES, bands: cl.BANDS, enchants, filter: fromFilter.cells, bySize, looks: { ...cl.DEFAULT_LOOKS, ...designer.clusterLooks((k) => settings.get(k)), basic: cl.basicLooks(view?.types.find((t) => t.type === 'jewels->cluster')).Large || cl.DEFAULT_LOOKS.basic }, sizeLooks: fromFilter.looks, prices, ageMs, priceStats: priceStats && { total: priceStats.total, matched: priceStats.total - priceStats.missed.length, missed: priceStats.missed.slice(0, 40) }, divine: units.divine || null, state: settings.get('clusterGrid') || {}, hasFilterTiers: !!eco };
  }
  // "1 div" / "20c" / "35" -> chaos
  function clusterChaos(v, divine) {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*(c|chaos|d|div|divine)?\s*$/i.exec(String(v ?? ''));
    if (!m) return null;
    const n = Number(m[1].replace(',', '.'));
    return /^d/i.test(m[2] || '') ? (divine ? n * divine : null) : n;
  }
  /** The price rule: recomputed from poe.ninja (cached) prices. Returns the changes as auto-tier moves
   *  ({type: 'cluster', key, base, from, to, chaos}); rewrites the filter when write is set and something changed. */
  async function clusterAutoRun({ prices, divine, write = true } = {}) {
    const cl = require('../core/cluster');
    const a = settings.get('clusterAuto') || {};
    let cells = {};
    if (a.on) {
      const league = await getLeague();
      if (!prices) prices = cl.priceCells(await ninja.category(league, 'ClusterJewel'), { total: 0, missed: [] });
      if (divine == null) divine = (await currencyUnits(league).catch(() => ({}))).divine;
      const top = clusterChaos(a.top, divine); const good = clusterChaos(a.good, divine);
      const basic = a.basic === '' || a.basic == null ? null : clusterChaos(a.basic, divine);
      if (top == null || good == null || !Object.keys(prices).length) return null; // keep what was set until prices come back
      cells = cl.autoCells(prices, { top, good, basic, hide: a.hide !== false, prev: settings.get('clusterAutoCells') || null });
    }
    const old = settings.get('clusterAutoCells') || {};
    const same = Object.keys(old).length === Object.keys(cells).length && Object.entries(cells).every(([k, v]) => old[k] === v);
    if (same) return { changed: 0, moves: [] };
    const bands = Object.fromEntries(cl.BANDS.map((b) => [b.id, b.name]));
    const moves = !Object.keys(old).length ? [] : [...new Set([...Object.keys(old), ...Object.keys(cells)])].filter((k) => old[k] !== cells[k]).map((k) => {
      const [size, e, p, band] = k.split('|');
      return { type: 'cluster', key: k, base: `${size} Cluster Jewel: ${p} passives, ${e} (${(bands[band] || '').toLowerCase()})`, from: old[k] || null, to: cells[k] || null, chaos: prices?.[k] ?? null };
    });
    settings.set('clusterAutoCells', cells);
    if (write && filters.basePath()) filters.write();
    return { changed: Object.keys(cells).length, moves };
  }
  async function setClusterAuto(opts = {}) {
    const a = { ...(settings.get('clusterAuto') || {}) };
    for (const k of ['on', 'hide']) if (k in opts) a[k] = !!opts[k];
    for (const k of ['top', 'good', 'basic']) if (k in opts) a[k] = String(opts[k] ?? '').trim();
    const lg = await getLeague().catch(() => null);
    const divine = lg ? (await currencyUnits(lg).catch(() => ({}))).divine : null;
    if (a.on && (clusterChaos(a.top, divine) == null || clusterChaos(a.good, divine) == null || (a.basic && clusterChaos(a.basic, divine) == null))) throw new Error('Type prices like 1 div or 20c.');
    settings.set('clusterAuto', a);
    await clusterAutoRun();
    return { auto: a, autoCells: settings.get('clusterAutoCells') || {} };
  }
  // ---------- talismans: your own tiers for the beast talisman bases ----------
  function talismanView() {
    const tal = require('../core/talismans');
    let bases = [];
    try { if (filters.basePath()) bases = tal.talismanBases(filters.readBase()); } catch (e) { log('talismans', e.message); }
    return { bases, state: settings.get('talismans') || {}, rest: !!settings.get('talismanRest'), looks: designer.clusterLooks((k) => settings.get(k)) };
  }
  function setTalisman({ bases = [], value = null, rest } = {}) {
    const state = { ...(settings.get('talismans') || {}) };
    for (const b of bases) {
      if (!/Talisman$/.test(String(b))) continue;
      if (['top', 'good', 'hide'].includes(value)) state[b] = value; else delete state[b];
    }
    settings.set('talismans', state);
    if (rest !== undefined) settings.set('talismanRest', !!rest);
    if (filters.basePath()) filters.write();
    return talismanView();
  }
  /** Set cells: value 'top' | 'good' | 'hide' | null (back to the filter). */
  function setCluster({ keys = [], value = null } = {}) {
    const cl = require('../core/cluster');
    const state = { ...(settings.get('clusterGrid') || {}) };
    for (const k of keys) {
      const [size, e, p, band] = String(k).split('|');
      if (!cl.SIZES.some((z) => z.id === size && z.passives.includes(Number(p))) || !cl.ALL_ENCHANTS.includes(e) || !cl.BANDS.some((b) => b.id === band)) continue;
      if (['top', 'good', 'basic', 'hide'].includes(value)) state[k] = value; else delete state[k];
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
      unidTiers: settings.get('rankUnidTier') || null,
      strands: settings.get('rankStrands') || null,
      unidRarity: settings.get('rankUnidRarity') || null,
      hasStrands: (() => { try { return /\$type->gear->memorystrand\b/.test(filters.readBase()); } catch { return false; } })(),
      hasUnidTiers: (() => { try { return /\$type->gear->tiered\b/.test(filters.readBase()); } catch { return false; } })(),
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
  function setRankKind({ kind, min, craftIlvl, ilvl, unidTiers, strands, unidRarity } = {}) {
    if (unidRarity !== undefined) settings.set('rankUnidRarity', ['Normal', 'Magic', 'Rare'].filter((r) => (Array.isArray(unidRarity) ? unidRarity : ['Normal', 'Magic', 'Rare']).includes(r)));
    if (strands !== undefined) {
      if (strands === null) settings.set('rankStrands', null);
      else {
        const clean = {};
        for (const r of ['S', 'A', 'B', 'C']) { const v = strands?.[r]; if (v === 'off') clean[r] = 'off'; else { const n = Math.round(Number(v)); if (n >= 1 && n <= 100) clean[r] = n; } }
        settings.set('rankStrands', clean);
      }
    }
    const { RANK_KINDS, UNID_TIERS } = require('../core/filter/manager');
    // unidentified item tier per rank (null: the filter's own rules decide)
    if (unidTiers !== undefined) {
      if (unidTiers === null) settings.set('rankUnidTier', null);
      else {
        const clean = {};
        for (const r of RANK_ORDER) { const t = Math.round(Number(unidTiers?.[r])); if (UNID_TIERS.includes(t)) clean[r] = t; }
        settings.set('rankUnidTier', clean);
      }
    }
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
    return { kinds, craftIlvl: settings.get('rankCraftIlvl') || 82, ilvls: settings.get('rankIlvl') || {}, unidTiers: settings.get('rankUnidTier') || null, strands: settings.get('rankStrands') || null, unidRarity: settings.get('rankUnidRarity') || null, target };
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
  /** Regular maps: hide white / yellow / below Tier 16 ({ white, yellow, below16 }). */
  // ---------- unique collection: "I have it" per unique; bases fully collected and cheap are hidden ----------
  const UNIQUE_CATS = ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel', 'UniqueRelic', 'UniqueTincture'];
  /** base -> [{ name, chaos }] for the uniques that drop normally (no Foulborn, Replica or linked variants), most valuable price per name */
  async function uniquesByBase() {
    const league = await getLeague();
    const out = new Map();
    for (const c of UNIQUE_CATS) {
      let lines = [];
      try { lines = await ninja.category(league, c); } catch { lines = []; }
      for (const l of lines || []) {
        if (!l.baseType || !l.name || l.links || /^(Foulborn|Replica) /.test(l.name)) continue;
        const list = out.get(l.baseType) || [];
        const e = list.find((x) => x.name === l.name);
        if (e) e.chaos = Math.max(e.chaos, l.chaos); else list.push({ name: l.name, chaos: l.chaos });
        out.set(l.baseType, list);
      }
    }
    return out;
  }
  /** Every unique that drops (no Foulborn, Replica or linked versions), for the Collection page. */
  async function collectionList() {
    const league = await getLeague();
    const have = settings.get('uniqueCollection') || {};
    const hiddenBases = new Set(settings.get('collectedHideBases') || []);
    const LABEL = { UniqueWeapon: 'Weapons', UniqueArmour: 'Armour', UniqueAccessory: 'Jewellery', UniqueFlask: 'Flasks', UniqueJewel: 'Jewels', UniqueRelic: 'Relics', UniqueTincture: 'Tinctures' };
    const byName = new Map();
    // the categories of the game's Unique stash tab, in its order
    const CLASS_OF = require('../core/base-classes.json');
    const TAB = [['Flasks', /Flasks$/], ['Amulets', /^Amulets$/], ['Rings', /^Rings$/], ['Claws', /^Claws$/], ['Daggers', /Daggers$/], ['Wands', /^Wands$/],
      ['One Hand Swords', /^(One Hand|Thrusting One Hand) Swords$/], ['One Hand Axes', /^One Hand Axes$/], ['One Hand Maces', /^(One Hand Maces|Sceptres)$/], ['Bows', /^Bows$/], ['Staves', /^(Staves|Warstaves)$/],
      ['Two Hand Swords', /^Two Hand Swords$/], ['Two Hand Axes', /^Two Hand Axes$/], ['Two Hand Maces', /^Two Hand Maces$/], ['Quivers', /^Quivers$/], ['Belts', /^Belts$/], ['Gloves', /^Gloves$/], ['Boots', /^Boots$/],
      ['Body Armours', /^Body Armours$/], ['Helmets', /^Helmets$/], ['Shields', /^Shields$/], ['Jewels', /Jewels$/], ['Maps', /^Maps$/], ['Relics', /Relics$/], ['Tinctures', /^Tinctures$/]];
    const tabOf = (base, cat) => { const c = cat === 'UniqueMap' ? 'Maps' : CLASS_OF[base] || ''; const t = TAB.find(([, re]) => re.test(c)); return t ? t[0] : 'Other'; };
    for (const c of [...UNIQUE_CATS, 'UniqueMap']) {
      let lines = [];
      try { lines = await ninja.category(league, c); } catch { lines = []; }
      for (const l of lines || []) {
        if (!l.name || !l.baseType || l.links || /^Foulborn /.test(l.name)) continue; // Replicas are in the game's Unique tab too
        const e = byName.get(l.name);
        if (e) { e.chaos = Math.max(e.chaos, l.chaos); if (!e.icon && l.icon) e.icon = l.icon; continue; }
        byName.set(l.name, { name: l.name, base: l.baseType, group: LABEL[c] || (c === 'UniqueMap' ? 'Maps' : c), tab: tabOf(l.baseType, c), chaos: l.chaos, icon: l.icon || null, have: !!have[l.name], hiddenBase: hiddenBases.has(l.baseType) });
      }
    }
    return { league, tabs: [...TAB.map(([n]) => n), 'Other'], on: settings.get('collectHide') !== false, max: Number(settings.get('collectHideBelow') ?? 5), hiddenBases: [...hiddenBases], uniques: [...byName.values()] };
  }
  async function refreshCollected(write = true) {
    const have = settings.get('uniqueCollection') || {};
    const max = Number(settings.get('collectHideBelow') ?? 5);
    const idx = await uniquesByBase();
    const hide = [];
    const on = settings.get('collectHide') !== false;
    if (on) for (const [base, list] of idx) if (list.length && list.every((u) => have[u.name]) && list.every((u) => u.chaos <= max)) hide.push(base);
    // bases with a unique you're missing: FilterBlade's hidden (cheap) unique tiers show them again
    const missing = on && Object.keys(have).length ? [...idx].filter(([, list]) => list.some((u) => !have[u.name])).map(([b]) => b).sort() : [];
    const before = JSON.stringify([settings.get('collectedHideBases') || [], settings.get('collectMissingBases') || []]);
    settings.set('collectedHideBases', hide.sort());
    settings.set('collectMissingBases', missing);
    if (write && before !== JSON.stringify([hide, missing]) && filters.basePath()) filters.write();
    return { count: Object.keys(have).length, hidden: hide, max, on };
  }
  async function collectionFor(base) {
    const have = settings.get('uniqueCollection') || {};
    const list = (await uniquesByBase()).get(base) || [];
    return { base, max: Number(settings.get('collectHideBelow') ?? 5), hidden: (settings.get('collectedHideBases') || []).includes(base), uniques: list.map((u) => ({ ...u, have: !!have[u.name] })).sort((a, b) => b.chaos - a.chaos) };
  }
  async function setCollected({ name, have, base, max, on } = {}) {
    if (on !== undefined) settings.set('collectHide', !!on);
    if (max !== undefined) settings.set('collectHideBelow', Math.max(0, Number(max) || 0));
    if (name) {
      const all = { ...(settings.get('uniqueCollection') || {}) };
      if (have) all[name] = true; else delete all[name];
      settings.set('uniqueCollection', all);
    }
    const r = await refreshCollected();
    return { ...r, base: base ? await collectionFor(base) : null };
  }

  /** Your Unique stash tab, as PoE Ladder (poeladder.com) sees it: GGG gives the tab's items only to apps it approved,
   *  and PoE Ladder is one. Its API is public: 2 requests, none to GGG. Only adds ticks, never removes one. */
  async function collectionFromStash() {
    const league = await getLeague();
    const acct = String(settings.get('accountName') || '').trim();
    if (!acct) return { league, needAccount: true, note: 'Set your account name (Name#1234) in Settings first.' };
    const user = encodeURIComponent(acct.replace('#', '-'));
    const get = async (url) => {
      const r = await (fetchImpl || globalThis.fetch)(url, { headers: { 'User-Agent': userAgent(), Accept: 'application/json' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`PoE Ladder answered ${r.status}`);
      return r.json();
    };
    const ladders = await get(`https://poeladder.com/api/v1/users/${user}/stashfound`);
    if (!Array.isArray(ladders) || !ladders.length) return { league, notJoined: true, note: 'PoE Ladder doesn\'t know your account yet. Join it once at poeladder.com, then try again.' };
    const norm = (x) => String(x || '').toLowerCase().replace(/^ssf\s+/, '').trim();
    // poe.ninja calls the league "Covens", PoE Ladder "Covens of Umbra": the same league when one starts with the other
    const same = (a, b) => a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
    const mine = ladders.filter((l) => !l.isPoe2 && same(norm(l.name), norm(league)));
    if (!mine.length) return { league, ladders: ladders.filter((l) => !l.isPoe2).map((l) => l.name), note: `PoE Ladder has no ${league} ladder for you yet. Join it there (Ladder → your league), then try again.` };
    const names = new Set();
    for (const l of mine) for (const u of (await get(l.url || `https://poeladder.com/api/v1/users/${user}/leagues/${encodeURIComponent(l.identifier)}/stashfound`)) || []) if (u?.name) names.add(u.name);
    const all = { ...(settings.get('uniqueCollection') || {}) };
    const added = [...names].filter((n) => !all[n]);
    for (const n of added) all[n] = true;
    settings.set('uniqueCollection', all);
    const r = await refreshCollected();
    return { league, ladder: mine.map((l) => l.name).join(', '), found: names.size, added, hidden: r.hidden, note: names.size ? null : 'PoE Ladder has no uniques for you in this league yet. It can take a while after you join.' };
  }

  function setMapHide(o = {}) {
    const cur = { white: false, yellow: false, below16: false, ...(settings.get('mapHide') || {}) };
    for (const k of ['white', 'yellow', 'below16']) if (k in o) cur[k] = !!o[k];
    settings.set('mapHide', cur);
    if (filters.basePath()) filters.write();
    return cur;
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
  /** FilterBlade's strictness done in the app: null = as your FilterBlade download, 0 Soft ... 6 Uber Plus Strict. */
  function setStrictness(level) {
    const base = filters.basePath();
    if (!base) throw new Error('Choose your filter first.');
    const n = level == null || level === '' ? null : Math.max(0, Math.min(strictness.LEVELS.length - 1, Math.round(Number(level))));
    const saved = settings.get('strictness');
    const map = saved && typeof saved === 'object' ? { ...saved } : {};
    const key = strictness.filterKey(filters.readBase(), base);
    if (Number.isFinite(n)) map[key] = n; else delete map[key];
    settings.set('strictness', map);
    viewCache = null;
    const target = filters.write();
    return { level: Number.isFinite(n) ? n : null, target, view: tierViewNow() };
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
  // league mechanics only (no plain currency, scarabs or cards) and their loot: [poe.ninja list, only these names, not these names]
  const FARM_GROUPS = [
    { id: 'eldritch', name: 'Eldritch altars', src: [['Currency', /eldritch|ember|ichor/i], ['Invitation', /^(Incandescent|Screaming) Invitation/]], art: 'Exceptional Eldritch Ember' },
    // Nightmare maps' bosses drop the uber pinnacle fragments (and Yoke of Suffering): what the maps cost and what they give
    { id: 'nightmare', name: 'Nightmare boss rush', src: [['Map', /^Nightmare Map$/], ['Fragment', /^(Awakening|Blazing|Cosmic|Decaying|Devouring|Reality|Synthesising|Lonely|Reverent|Traumatic) Fragment$|^Fragment of (Emptiness|Terror|Shape|Knowledge)$|^(Echo|Memory) of (Loneliness|Reverence|Trauma)$/], ['UniqueAccessory', /^Yoke of Suffering$/]], art: 'Reality Fragment' },
    { id: 'breach', name: 'Breach', src: [['Fragment', /breach|chayula|xoph|tul|esh|uul|hivebrain/i], ['Currency', /blessing of|splinter of (xoph|tul|esh|uul|chayula)/i]], art: 'Hivebrain Gland' },
    { id: 'legion', name: 'Legion', src: [['Fragment', /^Timeless/]], art: 'Timeless Karui Emblem' },
    { id: 'delirium', name: 'Delirium', src: [['DeliriumOrb'], ['Fragment', /simulacrum/i]], art: '*DeliriumOrb' },
    { id: 'harvest', name: 'Harvest', src: [['Currency', /lifeforce/i]], art: 'Sacred Crystallised Lifeforce' },
    { id: 'ultimatum', name: 'Ultimatum', src: [['Currency', /catalyst/i], ['Fragment', /ultimatum/i]], art: 'Fertile Catalyst' },
    { id: 'blight', name: 'Blight', src: [['Oil'], ['BlightedMap'], ['BlightRavagedMap']], art: '*Oil' },
    { id: 'essence', name: 'Essence', src: [['Essence']], art: '*Essence' },
    { id: 'delve', name: 'Delve', src: [['Fossil'], ['Resonator']], art: '*Fossil' },
    { id: 'ritual', name: 'Ritual', src: [['Omen'], ['Fragment', /^Ritual /]], art: '*Omen' },
    { id: 'kingsmarch', name: 'Kingsmarch', src: [['Tattoo'], ['Runegraft']], art: '*Tattoo' },
    { id: 'expedition', name: 'Expedition', src: [['Artifact'], ['Astrolabe']], art: null },
    { id: 'necropolis', name: 'Necropolis', src: [['Corpse'], ['AllflameEmber']], art: null },
    { id: 'wickerman', name: 'Wickerman', src: [['Viscera']], art: null },
    { id: 'bestiary', name: 'Bestiary', src: [['Beast']], art: null },
    { id: 'incursion', name: 'Incursion', src: [['Vial']], art: null },
    { id: 'incubator', name: 'Incubation', src: [['Incubator']], art: null },
  ];
  /** A mechanic's items from the poe.ninja lists (one line per name, the most traded one). */
  async function farmItems(g, load) {
    const byName = new Map();
    for (const [cat, only, skip] of g.src) {
      for (const l of await load(cat)) {
        if (!l.name || !(l.chaos > 0) || (only && !only.test(l.name)) || (skip && skip.test(l.name))) continue;
        const name = l.variant && cat !== 'Viscera' && cat !== 'Map' ? `${l.name} (${l.variant})` : l.name;
        const prev = byName.get(name);
        if (!prev || (l.volume ?? l.listingCount ?? 0) > (prev.volume ?? prev.listingCount ?? 0)) byName.set(name, { ...l, name });
      }
    }
    return [...byName.values()];
  }
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
      const items = await farmItems(g, load);
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
      // the card's picture: the mechanic's own item (a catalyst for Ultimatum), else its most valuable one
      const artRow = g.art && !g.art.startsWith('*') ? rows.find((r) => r.name === g.art && r.icon) : null;
      groups.push({ id: g.id, name: g.name, art: g.art, icon: artRow?.icon || null, count: rows.length, change, typical: typical[Math.floor(typical.length / 2)] ?? null, top, up, down });
    }
    groups.sort((a, b) => (b.change ?? -1e9) - (a.change ?? -1e9));
    allMovers.sort((a, b) => Math.abs(Math.log((b.chaos + 0.1) / ((b.old ?? b.chaos) + 0.1))) - Math.abs(Math.log((a.chaos + 0.1) / ((a.old ?? a.chaos) + 0.1))));
    return { league, divine, ageMs, groups, movers: allMovers.slice(0, 40) };
  }
  /** Every item of one mechanic, most valuable first: { id, name, league, divine, items: [...] } */
  // ---- Atlas strategies: farms with an atlas tree, threads, map kind and what each session earned ----
  const Atlas = require('../core/atlas');
  const ATLAS_URL = 'https://raw.githubusercontent.com/grindinggear/atlastree-export/master/data.json';
  let atlasTree = null;
  // GGG's atlas tree data, from their GitHub (never shipped with the app); checked again once a week
  async function atlasTreeData() {
    let e = cache.get('atlas_tree');
    if (atlasTree && e && Date.now() - e.savedAt < 7 * 86400000) return atlasTree;
    if (!e || Date.now() - e.savedAt > 7 * 86400000) {
      try {
        const res = await (fetchImpl || globalThis.fetch)(ATLAS_URL, { headers: { 'User-Agent': userAgent() } });
        if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
        const data = await res.json();
        if (!data?.nodes?.root) throw new Error('not an atlas tree');
        e = cache.set('atlas_tree', data);
        atlasTree = null;
      } catch (err) {
        log('atlas tree', err.message);
        if (!e) throw new Error('The atlas tree couldn\'t be downloaded from GitHub. Check your internet and try again.');
        cache.touch('atlas_tree'); // keep the old one; try again in a week
      }
    }
    if (!atlasTree) atlasTree = Atlas.buildTree(e.data);
    return atlasTree;
  }
  let atlasDraw = null;
  async function atlasView() {
    const tree = await atlasTreeData();
    if (!atlasDraw || atlasDraw.tree !== tree) atlasDraw = { tree, data: Atlas.drawData(tree) };
    return atlasDraw.data;
  }

  const ATLAS_INPUT_TYPES = ['Thread', 'Scarab', 'Fragment', 'Currency', 'Essence', 'Fossil', 'DeliriumOrb', 'Oil', 'Astrolabe'];
  // what a list of item names costs on poe.ninja (chaos each); names it doesn't know are left out
  async function namePrices(names, league) {
    const want = new Set(names.filter(Boolean).map((n) => n.toLowerCase()));
    const out = new Map();
    for (const c of ATLAS_INPUT_TYPES) {
      if (![...want].some((n) => !out.has(n))) break;
      let list = [];
      try { list = await ninja.category(league, c); } catch (e) { log('atlas prices', c, e.message); }
      for (const l of list) { const k = l.name.toLowerCase(); if (want.has(k) && !out.has(k)) out.set(k, { chaos: l.chaos, icon: l.icon || null }); }
    }
    for (const n of want) if (!out.has(n)) { const ex = exchangeCached(n.replace(/\b\w/g, (c) => c.toUpperCase())); if (ex?.chaos) out.set(n, { chaos: ex.chaos, icon: null }); }
    return out;
  }

  // the threads (with prices) and the names of items you might put in the map device (for the input box)
  async function atlasThreads() {
    const league = await getLeague();
    const get = async (c) => { try { return await ninja.category(league, c); } catch (e) { log('atlas items', c, e.message); return []; } };
    const threads = (await get('Thread')).map((l) => ({ name: l.name, chaos: l.chaos, icon: l.icon || null })).sort((a, b) => a.name.localeCompare(b.name));
    // what else goes into the map device: Delirium Orbs (3.30 has no scarabs)
    const items = (await get('DeliriumOrb')).map((l) => ({ name: l.name, chaos: l.chaos ?? null }));
    return { threads, items };
  }

  const strategiesAll = () => settings.get('atlasStrategies') || [];
  // up to 3 thread types a map (1-8 each; Unwavering Vision: one type with up to 10). Older strategies kept one in s.thread
  const threadsOf = (s) => (Array.isArray(s.threads) ? s.threads : s.thread?.name ? [s.thread] : []).filter((t) => t?.name);
  // map kinds; the ones poe.ninja prices (cat + names) add their price to the cost a map (the middle price when
  // several maps make the kind: the four conqueror maps)
  const ATLAS_MAP_KINDS = [
    { name: 'Normal T16 maps', cat: 'Map', re: /^Map \(Tier 16\)$/ },
    { name: 'Originator maps' }, // poe.ninja has no line for them: type your price
    { name: 'Nightmare maps', cat: 'Map', re: /^Nightmare Map$/ },
    { name: 'Conqueror maps', cat: 'Map', re: /^(Baran|Veritania|Drox|Al-Hezmin) Map \(Tier 16\)$/ },
    { name: 'Shaper guardian maps', cat: 'Map', re: /^Shaper Guardian Map$/ },
    { name: 'Elder guardian maps', cat: 'Map', re: /^The (Purifier|Enslaver|Constrictor|Eradicator) Map \(Tier 16\)$/ },
    { name: 'Vaal Temple maps', cat: 'Map', re: /^Vaal Temple Map$/ },
    { name: 'Blighted maps (T16)', cat: 'BlightedMap', re: /^Blighted Map \(Tier 16\)$/ },
    { name: 'Blight-ravaged maps (T16)', cat: 'BlightRavagedMap', re: /\(Tier 16\)$/ },
    { name: 'Other maps' },
  ];
  // names saved by older versions
  const MAP_KIND_OLD = { 'Any maps': 'Normal T16 maps', 'Nightmare (Valdo) maps': 'Nightmare maps', Mirage: 'Other maps', 'Unique maps': 'Other maps' };
  const mapKindOf = (s) => MAP_KIND_OLD[s.mapKind] || s.mapKind || 'Normal T16 maps';
  async function mapKindPrice(kind, league) {
    const k = ATLAS_MAP_KINDS.find((x) => x.name === kind);
    if (!k?.cat) return null;
    let list = [];
    try { list = await ninja.category(league, k.cat); } catch (e) { log('map kind price', e.message); return null; }
    const p = list.filter((l) => k.re.test(l.name) && l.chaos > 0).map((l) => l.chaos).sort((a, b) => a - b);
    return p.length ? p[Math.floor((p.length - 1) / 2)] : null;
  }

  const mapCounts = new Map();
  // a session's result from the WealthyExile snapshots taken when it started and stopped
  function sessionResult(sess, series) {
    const base = [...series].reverse().find((p) => p.ts <= sess.start + 60000) || series.find((p) => p.ts >= sess.start);
    const end = [...series].reverse().find((p) => p.ts <= (sess.end ? sess.end + 120000 : Infinity));
    // items left out of the session (a sale or a buy in the middle of it) don't count
    const gained = base && end && end.ts > base.ts ? end.chaos - base.chaos - (sess.adjustChaos ?? require('../core/networth').adjustOf(sess)) : null;
    const hours = ((sess.end || Date.now()) - sess.start) / 3600000;
    let maps = null;
    const logPath = settings.get('clientLogPath');
    // a finished session's maps never change: counted once (Client.txt can be huge); a running one every time
    const key = `${sess.id}|${sess.end || ''}`;
    if (sess.end && mapCounts.has(key)) maps = mapCounts.get(key);
    else if (logPath) {
      maps = require('../core/client-log').countMaps(logPath, sess.start, sess.end || Infinity)?.count ?? null;
      if (sess.end && maps != null) mapCounts.set(key, maps);
    }
    return { id: sess.id, name: sess.name, start: sess.start, end: sess.end, hours, gained, perHour: gained != null && hours > 0.05 ? gained / hours : null, maps, perMap: gained != null && maps ? gained / maps : null };
  }

  // community strategies from guide websites (poeatlasplanner.com, maxroll.gg): each added once, credited;
  // deleted ones don't come back, and a website added later only brings its own
  const PRESET_FILES = ['../core/atlas-presets.json', '../core/atlas-presets-maxroll.json'];
  // one key per tree, so the same strategy found again (bundled or by the weekly check) isn't added twice
  const presetKey = (p) => {
    const mx = Atlas.maxrollId(p.link || '');
    if (mx) return `mx:${mx}`;
    const code = /#p=([A-Za-z0-9_-]+)/.exec(p.link || '')?.[1];
    return code ? `pap:${code}` : `id:${p.id}`;
  };
  function presetSeen() {
    let seen = settings.get('atlasPresetsSeen');
    if (!Array.isArray(seen)) seen = settings.get('atlasPresetsV1') ? require('../core/atlas-presets.json').presets.map((p) => p.id) : [];
    return new Set(seen);
  }
  /** Adds the presets not seen before. A preset: { id, group, author, name, about, source, link, and the tree as
   *  maxroll history, or nodes/choices already read, or only the link }. */
  function addPresets(list, tree) {
    const seenSet = presetSeen();
    // a bundled preset seen under its id also counts as seen under its key (and the other way round)
    for (const P of PRESET_FILES.map((f) => require(f))) for (const p of P.presets) if (seenSet.has(p.id)) seenSet.add(presetKey(p));
    const added = [];
    for (const p of list) {
      const key = presetKey(p);
      if (seenSet.has(p.id) || seenSet.has(key)) continue;
      seenSet.add(p.id); seenSet.add(key);
      let r;
      try {
        if (p.maxroll) {
          const m = Atlas.fromMaxroll({ name: p.name, data: { profiles: [{ atlas: { variants: [{ name: '', history: p.maxroll.history, masteries: p.maxroll.masteries }], strategy: { threads: p.maxroll.threads, device: p.maxroll.device } } }] } }, tree);
          const known = m.nodes.filter((id) => tree.nodes.has(id));
          r = { nodes: known, choices: Object.fromEntries(Object.entries(m.choices).filter(([k]) => known.includes(Number(k)))), from: 'maxroll.gg', unknown: m.nodes.length - known.length, threads: m.threads, mapName: m.map?.name };
        } else r = Atlas.parseLink(p.link, tree);
      } catch (e) { log('guide preset', p.id, e.message); continue; }
      if (!r.nodes?.length) continue;
      added.push({ id: p.id, presetId: p.id, created: Date.now(), name: `${p.author} · ${p.name}`, link: p.link, nodes: r.nodes, choices: r.choices, from: r.from, unknown: r.unknown,
        threads: p.threads || r.threads || [], mapName: r.mapName || undefined, mapKind: p.mapKind || undefined,
        guide: { author: p.author, group: p.group, about: p.about, source: p.source } });
    }
    if (added.length) settings.set('atlasStrategies', [...strategiesAll(), ...added]);
    settings.set('atlasPresetsSeen', [...seenSet]);
    if (added.length) log('atlas strategies: added', added.length, 'from guide websites:', added.map((x) => x.name).join(', '));
    return added;
  }
  function addGuidePresets(tree) {
    const list = PRESET_FILES.flatMap((f) => { const P = require(f); return P.presets.map((p) => ({ ...p, source: p.source || P.source })); });
    return addPresets(list, tree);
  }

  // ---- the weekly check of the guide websites: new strategies there come into the list by themselves ----
  const PAP_GUIDE = 'https://poeatlasplanner.com/guides/best-atlas-tree';
  const MAXROLL_CAT = 'https://maxroll.gg/poe/category/currency';
  const unhtml = (x) => String(x || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&rsquo;|’/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  /** poeatlasplanner.com's guide page -> presets: each tree is a section with "Author · Name", a goal line and its link. */
  function papPresetsFrom(html) {
    const out = [];
    const heads = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => ({ at: m.index, text: unhtml(m[1]) }));
    for (const m of html.matchAll(/<section class="guide-preset[^"]*" id="([^"]+)">([\s\S]*?)<\/section>/g)) {
      const body = m[2];
      const title = unhtml(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(body)?.[1]);
      const href = /href="(\/\?preset=[^"]*#p=[A-Za-z0-9_-]+)"/.exec(body)?.[1];
      if (!title || !href) continue;
      const [author, ...rest] = title.split(' · ');
      const group = heads.filter((x) => x.at < m.index).pop()?.text || 'Guides';
      out.push({ id: `pap-${m[1]}`, group: group.replace(/\s*\(.*\)$|:.*$/g, '').slice(0, 40), author: rest.length ? author : 'poeatlasplanner.com', name: (rest.length ? rest.join(' · ') : title).slice(0, 60),
        about: unhtml(/class="guide-preset-goal"[^>]*>([\s\S]*?)<\/p>/.exec(body)?.[1]).slice(0, 140) || title, source: PAP_GUIDE, link: `https://poeatlasplanner.com${href.replace(/&amp;/g, '&')}` });
    }
    return out;
  }
  async function syncGuideSites({ force = false } = {}) {
    const last = settings.get('atlasSyncAt') || 0;
    if (!force && Date.now() - last < 7 * 86400000) return { skipped: true, at: last };
    settings.set('atlasSyncAt', Date.now());
    const get = webFetch || fetchImpl || globalThis.fetch;
    const text = async (url) => { const r = await get(url, { headers: { 'User-Agent': userAgent(), Accept: 'text/html' } }); if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`); return r.text(); };
    const tree = await atlasTreeData();
    const found = []; const errors = [];
    try { found.push(...papPresetsFrom(await text(PAP_GUIDE))); } catch (e) { errors.push(e.message); }
    try {
      // maxroll: its farming guides; each guide page is read once (the ones with an atlas planner become strategies)
      const cat = await text(MAXROLL_CAT);
      const slugs = [...new Set([...cat.matchAll(/href="\/poe\/currency\/([a-z0-9/-]+)"/g)].map((m) => m[1]))];
      const done = new Set(settings.get('atlasSyncMaxrollPages') || []);
      for (const P of PRESET_FILES.map((f) => require(f))) for (const p of P.presets) if (/maxroll\.gg\/poe\/currency\//.test(p.source || '')) done.add(p.source.replace(/.*\/poe\/currency\//, ''));
      for (const slug of slugs.filter((x) => !done.has(x)).slice(0, 8)) {
        done.add(slug);
        try {
          const page = await text(`https://maxroll.gg/poe/currency/${slug}`);
          const id = Atlas.maxrollId(page);
          if (!id) continue;
          const res = await get(`https://planners.maxroll.gg/profiles/poe/${id}`, { headers: { 'User-Agent': userAgent(), Accept: 'application/json' } });
          if (!res.ok) continue;
          const json = await res.json();
          let data = json.data; if (typeof data === 'string') data = JSON.parse(data);
          const prof = (data?.profiles || []).find((x) => x?.atlas?.variants?.some((v) => v.history?.length));
          if (!prof) continue;
          const vs = prof.atlas.variants.filter((v) => v.history?.length);
          const full = vs.reduce((a, v) => (v.history.length > a.history.length ? v : a), vs[0]);
          const who = data.author?.contentCreator || '';
          const shown = [...page.matchAll(/href="\/@([\w-]+)"[^>]*>([^<]{2,40})</g)].find(([, s2]) => s2.toLowerCase() === who.toLowerCase())?.[2];
          const name = String(json.name || prof.name || slug).replace(/^"[^"]*":\s*/, '').slice(0, 60);
          found.push({ id: `mx-${id}`, group: /boss/i.test(name) ? 'Boss rush' : /league ?start/i.test(name) ? 'League start' : 'Farming', author: shown || who || 'maxroll.gg', name, about: unhtml(/<meta name="description" content="([^"]*)"/.exec(page)?.[1]).slice(0, 140) || name,
            source: `https://maxroll.gg/poe/currency/${slug}`, link: `https://maxroll.gg/poe/farming-strategy-planner/${id}`,
            maxroll: { history: full.history, masteries: full.masteries || {}, threads: prof.atlas.strategy?.threads || [], device: prof.atlas.strategy?.device || [] } });
        } catch (e) { log('maxroll guide', slug, e.message); }
      }
      settings.set('atlasSyncMaxrollPages', [...done].slice(-300));
    } catch (e) { errors.push(e.message); }
    const added = addPresets(found, tree);
    log('guide websites checked:', found.length, 'strategies found,', added.length, 'new', errors.length ? `(${errors.join('; ')})` : '');
    return { at: Date.now(), added: added.map((x) => x.name), errors };
  }

  /** A copy of a strategy (a guide's one too) in My strategies, to change as you like. */
  function atlasCopy(id) {
    const all = strategiesAll();
    const s = all.find((x) => x.id === id);
    if (!s) throw new Error('That strategy is gone.');
    const { guide, presetId, sessions, ...rest } = s;
    const copy = { ...JSON.parse(JSON.stringify(rest)), id: `s${Date.now().toString(36)}`, created: Date.now(), name: `${s.name.replace(/^.*? · /, '')}${guide ? ` (${guide.author})` : ' (copy)'}`.slice(0, 80),
      notes: [s.notes, guide ? `From ${guide.author}: ${guide.source}` : ''].filter(Boolean).join('\n') };
    settings.set('atlasStrategies', [...all, copy]);
    return copy;
  }

  async function atlasList() {
    const league = await getLeague();
    let tree = null; let treeError = null;
    try { tree = await atlasTreeData(); } catch (e) { treeError = e.message; }
    if (tree) addGuidePresets(tree);
    // once a week, in the background: new strategies on the guide websites (the list picks them up next time)
    if (tree) syncGuideSites().catch((e) => log('guide websites:', e.message));
    const list = strategiesAll();
    const names = list.flatMap((s) => [...threadsOf(s).map((t) => t.name), ...(s.inputs || []).map((i) => i.name)]);
    const prices = await namePrices(names, league).catch(() => new Map());
    const divine = await ninja.divinePrice(league).catch(() => null);
    const nw = networth.report(league, { sinceMs: 365 * 86400000 });
    const series = nw?.series || [];
    const sessions = networth.sessions(league);
    const kindPrices = new Map();
    for (const k of new Set(list.map(mapKindOf))) kindPrices.set(k, await mapKindPrice(k, league));
    return {
      league, divine, treeError, guideSyncAt: settings.get('atlasSyncAt') || null, mapKinds: ATLAS_MAP_KINDS.map((k) => k.name), clientLog: !!settings.get('clientLogPath'),
      strategies: list.map((s) => {
        const priced = (name, count) => { const p = prices.get(String(name || '').toLowerCase()); return { name, count, chaos: p?.chaos ?? null, icon: p?.icon || null, total: p?.chaos != null ? Math.round(p.chaos * count * 100) / 100 : null }; };
        // the map itself when it isn't a normal one: poe.ninja's price, or the price you typed
        const kind = mapKindOf(s);
        const auto = kindPrices.get(kind) ?? null;
        const mapEach = s.mapPrice != null ? s.mapPrice : auto;
        const mapCost = mapEach != null ? { name: s.mapName || kind.replace(/maps\b/, 'map'), count: 1, chaos: mapEach, icon: null, total: mapEach, map: true, auto, own: s.mapPrice != null } : null;
        const costs = [mapCost, ...threadsOf(s).filter((t) => t.count).map((t) => ({ ...priced(t.name, t.count), thread: true })), ...(s.inputs || []).filter((i) => i.name && i.count).map((i) => priced(i.name, i.count))].filter(Boolean);
        const costPerMap = costs.reduce((a, i) => a + (i.total || 0), 0);
        const runs = sessions.filter((x) => x.strategy === s.id).map((x) => sessionResult(x, series)).reverse();
        const done = runs.filter((r) => r.gained != null);
        const hours = done.reduce((a, r) => a + r.hours, 0);
        const gained = done.reduce((a, r) => a + r.gained, 0);
        const maps = done.reduce((a, r) => a + (r.maps || 0), 0);
        const fx = tree && s.nodes?.length ? Atlas.effects(tree, s.nodes, s.choices || {}) : null;
        return {
          ...s, mapKind: kind, threads: threadsOf(s), costs, mapAuto: auto, costPerMap: Math.round(costPerMap * 100) / 100,
          summary: fx ? { points: fx.points, notables: fx.notables, keystones: fx.keystones, top: fx.categories.slice(0, 4).map((c) => ({ name: c.name, count: c.nodes.length })), cats: fx.categories.map((c) => ({ name: c.name, count: c.nodes.length })) } : null,
          effects: fx?.categories || [],
          sessions: runs,
          total: { hours, gained: done.length ? gained : null, perHour: hours > 0.05 ? gained / hours : null, maps: maps || null, perMap: maps ? gained / maps : null, running: runs.some((r) => !r.end) },
        };
      }),
    };
  }

  // create (no id) or change a strategy; a new tree link is read here, so a bad link is refused before it's saved
  // a maxroll.gg farming strategy: its planner profile (one request; an article page first when that's the link)
  async function maxrollStrategy(link) {
    const get = webFetch || fetchImpl || globalThis.fetch;
    let id = Atlas.maxrollId(link);
    if (!id) {
      const res = await get(link, { headers: { 'User-Agent': userAgent(), Accept: 'text/html' } });
      if (!res.ok) throw new Error(`maxroll.gg answered ${res.status}. Try the planner link from the page instead.`);
      id = Atlas.maxrollId(await res.text());
      if (!id) throw new Error('No atlas tree was found on that maxroll.gg page.');
    }
    const res = await get(`https://planners.maxroll.gg/profiles/poe/${id}`, { headers: { 'User-Agent': userAgent(), Accept: 'application/json' } });
    if (!res.ok) throw new Error(res.status === 404 ? 'That maxroll.gg planner was not found.' : `maxroll.gg answered ${res.status}. Try again in a minute.`);
    const r = Atlas.fromMaxroll(await res.json(), await atlasTreeData());
    if (!r) throw new Error('That maxroll.gg planner has no atlas tree.');
    return r;
  }

  async function atlasSave(input = {}) {
    const all = strategiesAll();
    const old = input.id ? all.find((s) => s.id === input.id) : null;
    if (input.id && !old) throw new Error('That strategy was removed.');
    const s = { ...(old || { id: `${Date.now()}`, created: Date.now() }) };
    if (input.name !== undefined) s.name = String(input.name).trim().slice(0, 80) || 'My strategy';
    if (!s.name) s.name = `Strategy ${all.length + 1}`;
    if (input.link !== undefined && String(input.link).trim() !== (old?.link || '')) {
      const link = String(input.link).trim();
      if (!link) { s.link = ''; s.nodes = []; s.choices = {}; s.from = ''; } else {
        if (/maxroll\.gg/i.test(link)) {
          // maxroll: the tree, and its threads and map when the strategy has none yet
          const tree = await atlasTreeData();
          const m = await maxrollStrategy(link);
          const known = m.nodes.filter((id) => tree.nodes.has(id));
          if (!known.length) throw new Error('No passives of this atlas tree were found in that maxroll.gg planner.');
          Object.assign(s, { link, nodes: known, choices: Object.fromEntries(Object.entries(m.choices).filter(([k]) => known.includes(Number(k)))), from: 'maxroll.gg', unknown: m.nodes.length - known.length });
          if (!threadsOf(s).length && m.threads.length && input.threads === undefined) { s.threads = m.threads; delete s.thread; }
          if (!s.mapName && m.map && input.mapName === undefined) s.mapName = m.map.name;
          if (m.name && input.name === undefined && (!old || /^Strategy \d+$/.test(s.name))) s.name = m.name.slice(0, 80);
        } else {
          const r = Atlas.parseLink(link, await atlasTreeData());
          Object.assign(s, { link, nodes: r.nodes, choices: r.choices, from: r.from, unknown: r.unknown });
        }
      }
    }
    // a tree picked by hand on the page: kept as a pathofexile.com link, so it can be opened and shared like an import
    if (Array.isArray(input.nodes)) {
      const tree = await atlasTreeData();
      const nodes = Atlas.connectedNodes(tree, input.nodes);
      const choices = Object.fromEntries(Object.entries(input.choices || s.choices || {}).filter(([k]) => nodes.includes(Number(k))));
      Object.assign(s, { nodes, choices, from: 'made here', unknown: 0, link: nodes.length ? 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/' + Atlas.encodeOfficial(nodes, choices, tree) : '' });
    }
    if (input.choices && typeof input.choices === 'object') s.choices = Object.fromEntries(Object.entries(input.choices).filter(([k, v]) => (s.nodes || []).includes(Number(k)) && Number.isInteger(v) && v >= 0));
    if (input.choices && s.from === 'made here' && s.nodes?.length) s.link = 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/' + Atlas.encodeOfficial(s.nodes, s.choices, await atlasTreeData());
    if (input.threads !== undefined) {
      const seen = new Set();
      s.threads = (Array.isArray(input.threads) ? input.threads : []).map((t) => ({ name: String(t?.name || '').trim().slice(0, 60), count: Math.max(1, Math.min(10, Math.round(Number(t?.count) || 8))) }))
        .filter((t) => t.name && !seen.has(t.name) && seen.add(t.name)).slice(0, 3);
      delete s.thread;
    }
    if (input.mapKind !== undefined) s.mapKind = String(input.mapKind || '').slice(0, 60);
    if (input.mapPrice !== undefined) { const v = Number(input.mapPrice); s.mapPrice = input.mapPrice === '' || input.mapPrice == null || !(v >= 0) ? null : Math.round(v * 100) / 100; }
    if (input.mapName !== undefined) s.mapName = String(input.mapName || '').slice(0, 60);
    if (input.inputs !== undefined) s.inputs = (Array.isArray(input.inputs) ? input.inputs : []).map((i) => ({ name: String(i?.name || '').trim().slice(0, 60), count: Math.max(0, Math.min(99, Math.round(Number(i?.count) || 0))) })).filter((i) => i.name).slice(0, 12);
    if (input.notes !== undefined) s.notes = String(input.notes || '').slice(0, 4000);
    s.updated = Date.now();
    settings.set('atlasStrategies', old ? all.map((x) => (x.id === s.id ? s : x)) : [...all, s]);
    return s;
  }

  function atlasRemove(id) {
    const all = strategiesAll();
    settings.set('atlasStrategies', all.filter((s) => s.id !== id));
    return true;
  }

  // the tree as links for other sites
  async function atlasLinks(id) {
    const s = strategiesAll().find((x) => x.id === id);
    if (!s?.nodes?.length) return null;
    const tree = await atlasTreeData();
    return {
      official: 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/' + Atlas.encodeOfficial(s.nodes, s.choices, tree),
      hypostasis: 'https://hypostasis.faith/atlas/data.html#t=' + Atlas.encodeHypostasis(s.nodes, s.choices, tree),
    };
  }
  async function farmGroup(id) {
    const g = FARM_GROUPS.find((x) => x.id === id);
    if (!g) throw new Error('Unknown mechanic');
    const league = await getLeague();
    const divine = await ninja.divinePrice(league).catch(() => null);
    const lists = {};
    const load = async (c) => { if (!lists[c]) { try { lists[c] = await ninja.category(league, c); } catch (e) { log('farm', c, e.message); lists[c] = []; } } return lists[c]; };
    const items = (await farmItems(g, load)).map((l) => {
      const trend = trendOf(l.sparkline, l.chaos);
      return { name: l.name, chaos: l.chaos, icon: l.icon || null, volume: l.volume ?? l.listingCount ?? null, change: trend?.change ?? null, old: trend?.old ?? null, points: trend?.points || null };
    }).sort((a, b) => b.chaos - a.chaos);
    return { id: g.id, name: g.name, league, divine, items };
  }
  // Categories auto-tiered by default. Uniques are opt-in: one base can hold a 1c and a 300c unique.
  const DEFAULT_REVIEW_TYPES = ['divination', 'fragments', 'currency', 'currency->fossil', 'currency->oil', 'currency->essence', 'currency->deliriumorbs', 'currency->trial->omen', 'currency->trial->tattoo', 'runesgrafts', 'mapenchantments'];

  function reviewCfg() {
    const c = settings.get('priceReview') || {};
    return { minListings: 5, margin: 1.5, auto: false, includeNew: false, categories: {}, ...c };
  }

  /**
   * Check every priced category against poe.ninja and plan auto-tier moves.
   * Only poe.ninja (cached 20 min) is used; no GGG requests.
   */
  /**
   * The items that land in a category's catch-all tier ("Items not listed in another tier land here"): what
   * poe.ninja prices for the category, and (currency and fragments) what the trade site's own list has, that
   * no tier of your filter names. A new item on patch day shows up here, so you can move it into a tier.
   * -> [{ name, chaos, listings, fresh }] (fresh: the trade site lists it, poe.ninja has no price yet)
   */
  async function unlistedItems(type) {
    const view = tierViewNow();
    if (!view) return [];
    // only true currency / fragments: a name from another list (an Astrolabe, a Djinn coin) has its own class and rules
    if (type === 'uniques') return unlistedUniqueBases(view);
    const SRC = { currency: { ninja: ['Currency'], static: ['Currency'], cls: 'Stackable Currency' }, fragments: { ninja: ['Fragment'], static: ['Fragments'], cls: 'Map Fragments' } }[type];
    if (!SRC) return [];
    const known = new Set(view.types.flatMap((t) => t.tiers.flatMap((x) => x.bases.map((b) => b.toLowerCase()))));
    for (const n of settings.get('forcedNames') || []) known.add(String(n).toLowerCase());
    const league = await getLeague();
    const out = new Map();
    const data = {};
    for (const c of SRC.ninja) { try { data[c] = await ninja.category(league, c); } catch { /* no prices */ } }
    for (const p of tierPricing.priceIndex(type, data).values()) {
      const name = p.name;
      if (!name || known.has(name.toLowerCase()) || /[()]/.test(name)) continue;
      out.set(name, { name, chaos: Number.isFinite(p.chaos) ? p.chaos : null, listings: p.listings ?? null });
    }
    // the trade site's item list has new currency the day it comes out (no extra request: it's cached)
    try {
      for (const g of (await ggg.tradeStatic())?.result || []) {
        if (!SRC.static.includes(g.id)) continue;
        for (const e of g.entries || []) {
          const n = e.text;
          if (n && !known.has(n.toLowerCase()) && !out.has(n) && !/[()]/.test(n)) out.set(n, { name: n, chaos: null, listings: null, fresh: true });
        }
      }
    } catch { /* poe.ninja's names only */ }
    // keep the ones your written filter really sends to this category's catch-all tier
    let parsed = null;
    try { const t = filters.activeText(); if (t != null) parsed = require('../core/filter/parser').parse(t); } catch { parsed = null; }
    const lands = (name) => {
      if (!parsed) return true;
      const item = readItem(`Item Class: ${SRC.cls}\nRarity: ${SRC.cls === 'Stackable Currency' ? 'Currency' : 'Normal'}\n${name}\n--------\nStack Size: 1/10`);
      if (!item) return false;
      const hit = explain(parsed, item);
      return !!hit && new RegExp(`\\$type->${type.replace(/[>-]/g, '\\$&')}\\s+\\$tier->rest`).test(hit.comment || '');
    };
    return [...out.values()].filter((u) => lands(u.name)).sort((a, b) => (b.chaos ?? -1) - (a.chaos ?? -1) || a.name.localeCompare(b.name)).slice(0, 60);
  }

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
        alwaysShow: new Set((settings.get('alwaysShow') || {})[t.type] || []),
        knownNames: knownAll,
        // where FilterBlade had each moved base (High variety bases that don't fit go back there)
        movedFrom: Object.fromEntries(Object.entries(view.moved || {}).filter(([k, v]) => v && k.startsWith(`${t.type}\t`)).map(([k, v]) => [k.slice(t.type.length + 1), v])),
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

  /**
   * "Always show": the bases keep moving with their price, but never into a hidden tier. Turning it on for a base
   * that is hidden now puts it in the lowest tier that shows.
   */
  function setAlwaysShow(type, bases, on) {
    const all = { ...(settings.get('alwaysShow') || {}) };
    const set = new Set(all[type] || []);
    for (const b of bases) (on ? set.add(b) : set.delete(b));
    if (set.size) all[type] = [...set]; else delete all[type];
    settings.set('alwaysShow', all);
    let view = tierViewNow();
    if (on && view) {
      const t = view.types.find((x) => x.type === type);
      const shown = (t?.tiers || []).filter((x) => x.hasBaseList && x.action !== 'Hide' && !x.special && !x.generated && !x.off && !x.own);
      const low = shown[shown.length - 1];
      const hidden = bases.filter((b) => t?.tiers.some((x) => x.action === 'Hide' && x.bases.includes(b)));
      if (low && hidden.length) view = moveBases(type, hidden, low.tier).view || tierViewNow();
    }
    return { alwaysShow: settings.get('alwaysShow') || {}, view };
  }

  /** moves: [{type, base, from, to}] */
  function applyReviewMoves(moves, { auto = false } = {}) {
    const groups = new Map();
    for (const m of moves) {
      if (m.type === 'cluster') continue; // already set by the cluster price rule
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
      if (m.type === 'cluster') {
        // pinned as your own choice, so the next price check doesn't change it straight back
        if (m.from) setCluster({ keys: [m.key], value: m.from });
        continue;
      }
      if (m.from) moveBases(m.type, [m.base], m.from);
      else resetTiers({ type: m.type, base: m.base });
    }
    settings.set('priceReviewLog', logList);
    return { undone: last.moves.length, at: last.at };
  }

  /** Automatic mode: apply every planned move in enabled categories. Returns the moves made. */
  function autoTierWanted() {
    const cfg = reviewCfg();
    return !!cfg.auto || Object.values(cfg.categories || {}).some((c) => c?.auto === true) || !!(settings.get('clusterAuto') || {}).on;
  }

  /** 3.30 threads (Abyss Thread, Breach Thread...): FilterBlade has them all in one fragment tier. Once,
   *  they are put into the fragment tiers by their poe.ninja price (the price review keeps them right after). */
  async function tierThreads() {
    if (settings.get('threadsTieredV1') || !filters.basePath()) return [];
    const r = await priceReview({ types: ['fragments'] });
    const c = r.categories.find((x) => x.type === 'fragments');
    const moves = (c?.moves || []).filter((m) => /\bThread$/.test(m.base)).map((m) => ({ ...m, type: 'fragments' }));
    if (moves.length) applyReviewMoves(moves, { auto: true });
    settings.set('threadsTieredV1', true);
    log('threads', `${moves.length} thread(s) tiered by price`);
    return moves;
  }
  async function autoTierRun() {
    const cfg = reviewCfg();
    if (!autoTierWanted() || !filters.basePath()) return [];
    const r = await priceReview();
    const moves = r.categories.filter((c) => c.auto).flatMap((c) => c.moves.map((m) => ({ ...m, type: c.type })));
    // cluster jewels by price (Loot filter → Cluster jewels), in the same run and the same undo
    let cm = [];
    try { cm = (await clusterAutoRun({ write: !moves.length }))?.moves || []; } catch (e) { log('cluster auto', e.message); }
    if (moves.length || cm.length) applyReviewMoves([...moves, ...cm], { auto: true });
    return [...moves, ...cm];
  }

  // ---------- tier designer ----------
  function designerState() {
    const d = settings.get('designer') || {};
    const preset = designer.PRESETS.find((p) => p.id === (d.presetId || 'classic')) || designer.PRESETS[0];
    const levels = designer.fullLevels(d.levels || preset.levels);
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
      themes: (settings.get('designerThemes') || []).map((t) => ({ ...t, levels: designer.fullLevels(t.levels) })),
      draft: { levels: designer.lockTier1(levels), presetId: d.presetId || null, lockTier1: true, groups: d.groups || null },
      groups,
      canUndo: !!settings.get('designerUndo'),
      hasFilter: !!view,
      // the preview's items: real ones from your currency tiers
      samples: designer.sampleItems(view),
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
    let origView = null;
    try { origView = tiers.tierView(filters.readBase(), {}); } catch { /* colours of the other items stay */ }
    const r = designer.applyDesign(view, patch, lv, { groups, origView, rareStyle: settings.get('rareStyle') || 'yellow' });
    const { target } = savePatch(r.patch);
    return { count: r.count, categories: r.categories, target };
  }

  /** Loot filter → Rare looks → "Use my theme's colours": the current design's levels on every rare / gear kind only. */
  function rareLooksFromTheme({ style } = {}) {
    if (style) settings.set('rareStyle', style === 'theme' ? 'theme' : 'yellow');
    const rareStyle = settings.get('rareStyle') || 'yellow';
    const view = tierViewNow();
    if (!view) throw new Error('Choose your filter on the Loot filter page first.');
    const d = settings.get('designer') || {};
    const preset = designer.PRESETS.find((p) => p.id === (d.presetId || 'classic')) || designer.PRESETS[0];
    const levels = designer.lockTier1(designer.fullLevels(d.levels || preset.levels));
    const patch = settings.get('tierPatch') || {};
    const styles = { ...(patch.styles || {}) };
    let count = 0;
    for (const t of designer.targetsFor(view)) {
      if (designer.rareLevel(t.type, t.tier) === undefined || !levels[t.level]) continue;
      styles[t.key] = designer.lookFor(t, levels, { rareStyle });
      count++;
    }
    const { target } = savePatch({ ...patch, moves: { ...(patch.moves || {}) }, styles });
    return { count, target };
  }

  /** Tier designer → Text size: { all, currency, … } steps in font points (-30..+30). */
  function setSizeAdjust(o = {}) {
    const cur = { ...(settings.get('sizeAdjust') || {}) };
    for (const [k, v] of Object.entries(o)) {
      const n = Math.max(-30, Math.min(30, Math.round(Number(v) || 0)));
      if (n) cur[k] = n; else delete cur[k];
    }
    settings.set('sizeAdjust', cur);
    if (filters.basePath()) filters.write();
    return cur;
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
    const t = { id: `d_${Date.now()}`, name: String(name || 'My design').slice(0, 60), levels: designer.fullLevels(levels) };
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
  // 1.0.52: every tier plays FilterBlade's own sound for it again (themes used to set game sounds of their
  // own and none at all on Tier 5-6). Sound files you added yourself stay.
  if (!settings.get('fbSoundsV1')) {
    const tp = settings.get('tierPatch');
    if (tp?.styles) {
      const styles = {};
      for (const [k, st] of Object.entries(tp.styles)) styles[k] = designer.withFilterSound(st);
      settings.set('tierPatch', { ...tp, styles });
    }
    const d = settings.get('designer');
    if (d?.levels) {
      const levels = {};
      for (const [k, st] of Object.entries(d.levels)) levels[k] = k === 'giga' ? st : designer.withFilterSound(st);
      settings.set('designer', { ...d, levels });
    }
    settings.set('fbSoundsV1', true);
    try { if (filters.basePath()) filters.write(); } catch (e) { log('filter sounds upgrade', e.message); }
  }
  // 1.0.57: themes give Tier 2 the game's sound 1 and Tiers 3-6 sound 2 (Tier 1 keeps the Divine sound);
  // tiers a theme set (FilterBlade's sound kept) get them now. Sounds you set on a tier yourself stay.
  if (!settings.get('levelSoundsV1')) {
    const tp = settings.get('tierPatch');
    if (tp?.styles) {
      const styles = {};
      for (const [k, st] of Object.entries(tp.styles)) {
        const level = designer.tierLevel(String(k).split('|').pop());
        styles[k] = st?.keepSound && level >= 2 && level <= 6 ? designer.withLevelSound(st, level) : st;
      }
      settings.set('tierPatch', { ...tp, styles });
    }
    const d = settings.get('designer');
    if (d?.levels) {
      const levels = {};
      for (const [k, st] of Object.entries(d.levels)) levels[k] = designer.LEVEL_SOUNDS[k] ? designer.withLevelSound(st, Number(k)) : st;
      settings.set('designer', { ...d, levels });
    }
    settings.set('levelSoundsV1', true);
    try { if (filters.basePath()) filters.write(); } catch (e) { log('tier sounds upgrade', e.message); }
  }
  // 1.0.66: what FilterBlade hides stays hidden. The price review had moved hidden items (cheap cards
  // like The Twins) into shown tiers, and "Show all currency" showed every hidden currency tier.
  if (!settings.get('fbVisibilityV1')) {
    settings.set('fbVisibilityV1', true);
    try {
      let changed = false;
      if (settings.get('showAllCurrency')) { settings.set('showAllCurrency', false); changed = true; }
      const base = filters.basePath() ? filters.readBase() : null;
      const logList = settings.get('priceReviewLog') || [];
      let tp = settings.get('tierPatch') || {};
      if (base && logList.length) {
        const view = tiers.tierView(base, strictness.withStrictness(base, {}, strictness.levelFor(settings.get('strictness'), base, filters.basePath())));
        const stateOf = new Map(view.types.flatMap((t) => t.tiers.map((x) => [`${t.type}|${x.tier}`, x.state])));
        let n = 0;
        for (const entry of logList) {
          const keep = [];
          for (const m of entry.moves || []) {
            const hiddenFrom = m.from && stateOf.get(`${m.type}|${m.from}`) !== 'Show';
            const shownTo = stateOf.get(`${m.type}|${m.to}`) === 'Show';
            if (hiddenFrom && shownTo && tp.moves?.[`${m.type}\t${m.base}`] === m.to) { tp = tiers.withoutMove(tp, m.type, m.base); n++; continue; }
            keep.push(m);
          }
          entry.moves = keep;
        }
        if (n) { settings.set('tierPatch', tp); settings.set('priceReviewLog', logList.filter((e) => e.moves.length)); changed = true; log('filter visibility', `${n} hidden item(s) hidden again`); }
      }
      if (changed && filters.basePath()) filters.write();
    } catch (e) { log('filter visibility', e.message); }
  }
  // 1.0.88: unidentified item tiers and Memory Strands are always your choice (no "Filter decides"):
  // start from what FilterBlade shows at Semi-Strict; rare looks take your theme's colours once
  if (!settings.get('myChoiceV1')) {
    settings.set('myChoiceV1', true);
    let changed = false;
    if (!settings.get('rankUnidTier')) { settings.set('rankUnidTier', { S: 2, A: 2, B: 2, C: 3 }); changed = true; }
    if (!settings.get('rankStrands')) { settings.set('rankStrands', { S: 15, A: 20, B: 60, C: 'off' }); changed = true; }
    try { if (changed && filters.basePath()) filters.write(); } catch (e) { log('my choice', e.message); }
  }
  // 1.0.98: veiled rares are a kind of their own on Base ranks (all ranks shown, in the filter's veiled look)
  if (!settings.get('veiledKindV1')) {
    settings.set('veiledKindV1', true);
    const k = { ...(settings.get('rankKinds') || {}) };
    if (!k.veiled) { settings.set('rankKinds', { ...k, veiled: 'D' }); try { if (filters.basePath()) filters.write(); } catch (e) { log('veiled kind', e.message); } }
  }
  // 1.0.103: the new near-black Midnight look for everyone once (Settings → Appearance switches back)
  if (!settings.get('midnightV1')) { settings.set('midnightV1', true); settings.set('uiTheme', 'midnight'); }
  // 1.0.103: a higher item tier always looks more expensive; Tier 0 ranks get the quiet look with a rank border
  if (!settings.get('rareTiersV2')) {
    settings.set('rareTiersV2', true);
    try {
      const view = filters.basePath() ? tierViewNow() : null;
      if (view) {
        const d = settings.get('designer') || {};
        const preset = designer.PRESETS.find((p) => p.id === (d.presetId || 'classic')) || designer.PRESETS[0];
        const levels = designer.lockTier1(designer.fullLevels(d.levels || preset.levels));
        const patch = settings.get('tierPatch') || {};
        const styles = { ...(patch.styles || {}) };
        let n = 0;
        for (const t of designer.targetsFor(view)) if (t.rank && levels[t.level]) { styles[t.key] = designer.lookFor(t, levels, { rareStyle: 'theme' }); n++; }
        if (n) savePatch({ ...patch, moves: { ...(patch.moves || {}) }, styles });
      }
    } catch (e) { log('rare tiers v2', e.message); }
  }
  // 1.0.143: your Stacked Deck tier also for stacks of Stacked Decks (FilterBlade's stacked currency), same look; once
  if (!settings.get('stackedDeckStacksV1')) {
    settings.set('stackedDeckStacksV1', true);
    try {
      const patch = settings.get('tierPatch') || {};
      const look = (patch.styles || {})['currency|poehelper-stackeddeck'];
      const view = look && filters.basePath() ? tierViewNow() : null;
      if (view) {
        const T = require('../core/filter/tiers');
        let p = patch;
        for (const ty of view.types.filter((t) => /^currency->stacked/.test(t.type))) {
          const holder = ty.tiers.find((t) => t.bases.includes('Stacked Deck'));
          if (!holder || (p.newTiers || []).some((x) => x.type === ty.type && x.name === 'Stacked Deck')) continue;
          const [np, tier] = T.withNewTier(p, { type: ty.type, name: 'Stacked Deck', copyFrom: holder.tier, before: holder.tier });
          np.moves[`${ty.type}\tStacked Deck`] = tier;
          np.styles[`${ty.type}|${tier}`] = structuredClone(look);
          p = np;
        }
        if (p !== patch) savePatch(p);
      }
    } catch (e) { log('stacked deck stacks', e.message); }
  }
  // 1.0.132: cluster jewel tiers (by enchantment) in your design's Tier 1 / Tier 2 looks; once
  if (!settings.get('clusterDesignV1')) {
    settings.set('clusterDesignV1', true);
    try {
      const view = filters.basePath() ? tierViewNow() : null;
      if (view) {
        const lv = designer.currentLevels((k) => settings.get(k));
        const patch = settings.get('tierPatch') || {};
        const styles = { ...(patch.styles || {}) };
        let n = 0;
        for (const t of designer.targetsFor(view)) if (/^jewels->cluster(eco)?$/.test(t.type)) { const l = designer.lookFor(t, lv); if (l) { styles[t.key] = l; n++; } }
        if (n) savePatch({ ...patch, moves: { ...(patch.moves || {}) }, styles });
      }
    } catch (e) { log('cluster design', e.message); }
  }
  // 1.0.118: 6-socket items in FilterBlade's white look, whatever the design; once
  if (!settings.get('sixSocketWhiteV1')) {
    settings.set('sixSocketWhiteV1', true);
    try {
      const view = filters.basePath() ? tierViewNow() : null;
      if (view) {
        const patch = settings.get('tierPatch') || {};
        const styles = { ...(patch.styles || {}) };
        let n = 0;
        for (const t of view.types) if (t.type === 'socketslinks') for (const tier of t.tiers) if (designer.isSixSockets({ type: t.type, tier: tier.tier })) { styles[tier.key] = JSON.parse(JSON.stringify(designer.SIX_SOCKET_LOOK)); n++; }
        if (n) savePatch({ ...patch, moves: { ...(patch.moves || {}) }, styles });
      }
    } catch (e) { log('six sockets white', e.message); }
  }
  // 1.0.117: plain rares (tiered and untiered) in the game's rare yellow, so they don't look like currency; once
  if (!settings.get('rareYellowV1')) {
    settings.set('rareYellowV1', true);
    try { if (filters.basePath()) rareLooksFromTheme({ style: 'yellow' }); } catch (e) { log('rare yellow', e.message); }
  }
  if (!settings.get('rareThemeV1')) {
    settings.set('rareThemeV1', true);
    const d = settings.get('designer');
    try { if ((d?.levels || d?.presetId) && filters.basePath()) rareLooksFromTheme(); } catch (e) { log('rare theme', e.message); }
  }
  // 1.0.67: stacked currency, and other items drawn in one of the tier colours, take your design's colours (only the colours); put on once
  if (!settings.get('stackedDesignV1')) {
    settings.set('stackedDesignV1', true);
    try {
      const d = settings.get('designer');
      const view = d?.levels && filters.basePath() ? tierViewNow() : null;
      if (view) {
        const tp = settings.get('tierPatch') || {};
        const styles = { ...(tp.styles || {}) };
        const lv = designer.lockTier1(d.levels);
        const n = designer.stackedColours(view, styles, lv) + designer.paletteColours(tiers.tierView(filters.readBase(), {}), styles, lv);
        if (n) savePatch({ ...tp, styles });
      }
    } catch (e) { log('stacked colours', e.message); }
  }
  // 1.0.66: plain rares are left to FilterBlade again, so it hides the poor ones in maps (showing
  // every ranked rare showed them all). Unidentified item tiers by rank and the other kinds stay.
  if (!settings.get('rareRanksFbV1')) {
    settings.set('rareRanksFbV1', true);
    const kinds = settings.get('rankKinds') || {};
    if (kinds.rares && kinds.rares !== 'off' && kinds.rares !== 'none') {
      settings.set('rankKinds', { ...kinds, rares: 'off' });
      try { if (filters.basePath()) filters.write(); } catch (e) { log('rare ranks', e.message); }
    }
  }
  // 1.0.66: every tier look is full size and solid (no see-through colours); only the colours differ
  if (!settings.get('fullLooksV1')) {
    const tp = settings.get('tierPatch');
    if (tp?.styles) settings.set('tierPatch', { ...tp, styles: Object.fromEntries(Object.entries(tp.styles).map(([k, st]) => [k, designer.fullLook(st)])) });
    const d = settings.get('designer');
    if (d?.levels) settings.set('designer', { ...d, levels: designer.fullLevels(d.levels) });
    const th = settings.get('designerThemes');
    if (Array.isArray(th)) settings.set('designerThemes', th.map((t) => ({ ...t, levels: designer.fullLevels(t.levels) })));
    settings.set('fullLooksV1', true);
    try { if (tp?.styles && filters.basePath()) filters.write(); } catch (e) { log('full looks', e.message); }
  }
  // 1.0.65: the price review used your own tiers ("Giga") as price bands and could fill one with
  // hundreds of items. Items it put there go back to FilterBlade's tier; items you put there stay.
  if (!settings.get('ownTierFixV1')) {
    const logList = settings.get('priceReviewLog') || [];
    let tp = settings.get('tierPatch') || {};
    let n = 0;
    for (const entry of logList) {
      for (const m of entry.moves || []) {
        if (!/^poehelper-/.test(m.to || '') || m.to === 'poehelper-hidden') continue;
        if (tp.moves?.[`${m.type}\t${m.base}`] !== m.to) continue;
        tp = tiers.withoutMove(tp, m.type, m.base);
        n++;
      }
      entry.moves = (entry.moves || []).filter((m) => !/^poehelper-/.test(m.to || '') || m.to === 'poehelper-hidden');
    }
    if (n) {
      settings.set('tierPatch', tp);
      settings.set('priceReviewLog', logList.filter((e) => e.moves.length));
      log('own tier fix', `${n} item(s) back to their FilterBlade tier`);
    }
    settings.set('ownTierFixV1', true);
    try { if (n && filters.basePath()) filters.write(); } catch (e) { log('own tier fix', e.message); }
  }
  // the rank upgrade runs at start, so the filter gets the new ranking without opening the page
  try { if ((migrateRanks() || kindsChanged) && filters.basePath()) filters.write(); } catch (e) { log('ranks upgrade', e.message); }

  // ---------------- bug report ----------------
  // What a report holds: the logs, the settings without the login or contact, the filter the game reads and
  // the filter it is made from, and a short summary. Nothing is sent: the player passes the file on himself.
  const REPORT_DROP = /^(sessionEnc|contact|accountName)$|Enc$|token|secret|password/i;
  function reportFiles(extra = {}) {
    const fs = require('fs');
    const files = [];
    const add = (name, file) => { try { if (fs.existsSync(file) && fs.statSync(file).isFile()) files.push({ name, data: fs.readFileSync(file) }); } catch { /* skip */ } };
    for (const n of ['poe-helper.log', 'poe-helper.log.old', 'poe-helper-errors.log', 'poe-helper-errors.log.old']) add(n, path.join(dataDir, n));
    const clean = {};
    for (const [k, v] of Object.entries(settings.data || {})) clean[k] = REPORT_DROP.test(k) ? (v ? '(left out)' : v) : v;
    files.push({ name: 'settings.json', data: JSON.stringify(clean, null, 2) });
    let base = null; let helper = null;
    try { base = filters.basePath(); } catch { /* none */ }
    if (base) {
      add(`filters/${path.basename(base)}`, base);
      try { helper = helperPathFor(base); add(`filters/${path.basename(helper)}`, helper); } catch { /* none */ }
    }
    const lines = [
      `PoE Helper ${VERSION}`, `Made: ${new Date().toISOString()}`,
      `Windows: ${require('os').release()} (${process.arch})`, `League: ${settings.get('leagueOverride') || '(auto)'}`,
      `Base filter: ${base || '(none picked)'}`, `Filter the game reads: ${helper || '(none)'}${helper && fs.existsSync(helper) ? '' : ' (missing)'}`,
      `Strictness: ${JSON.stringify(settings.get('strictness') || {})}`, `Show all currency: ${!!settings.get('showAllCurrency')}`,
      `Client.txt set: ${!!settings.get('clientLogPath')}`,
      ...Object.entries(extra).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`),
    ];
    files.unshift({ name: 'report.txt', data: lines.join('\r\n') + '\r\n' });
    return files;
  }

  return { addGuidePresetsForTest: (tree) => addGuidePresets(tree), addPresetsForTest: (l, tree) => addPresets(l, tree), papPresetsFrom, syncGuideSites, atlasCopy, strictnessPreview, reportFiles, setAlwaysShow, atlasView, atlasThreads, atlasList, atlasSave, atlasRemove, atlasLinks, filterAge, staleMoves, dropStaleMoves, farmGroup, unlistedItems, collectionFromStash, collectionList, setSizeAdjust, refreshCollected, collectionFor, setCollected, rareLooksFromTheme, setTierStyles, setMapHide, tierThreads, tradeSiteUrl, exportAppSettings, importAppSettings, undoImportAppSettings, canUndoAppImport, APP_KEYS, setStrictness, tradeBulk, pricePredict, refreshLeague, tradeSearchList, tradeSearchSave, tradeSearchRemove, tradeSearchMove, tradeSearchCheck, tradeWatchTick, exportFilterSettings, importFilterSettings, undoImportFilterSettings, canUndoImport, setTierCondition, defaultRanks, regexMapTrade, regexMapView, regexMapBuild, regexBeastView, regexBeastBuild, regexItemBases, regexItemView, regexItemBuild, regexCampaignView, regexCampaignBuild, regexGemView, regexGemBuild, setCampaignHide, setShowAllCurrency, regexSavePreset, regexDeletePreset, setBaseRanks, setRankKind, autoRanks, resetAll, undoResetAll, canUndoReset, gameSoundsState, extractGameSounds, refreshGameSounds, labLayout, LAB_DIFFS, clusterView, setCluster, setClusterAuto, warrantAnalyze, talismanView, setTalisman, clusterAutoRun, baseMatrixView, setBaseMatrix, setBaseMatrixOpts, farmDashboard, setStackSize, parsePrice, currencyUnits, changelog, versionInfo, myBases, addMyBase, updateMyBase, removeMyBase, setMyBasesStyle, addTier, removeTier, renameTier, categoryArt, userIconsDir, listIcons, importIcon, deleteIcon, listSounds, importSound, soundData, autoTierWanted, readItem, magicBaseOf, tierInfoFor, SOUNDS, DEFAULT_TIER_SOUNDS, settings, snapshots, usage, cache, ninja, ggg, limiter, pricer, networth, filters, getLeague, applySettings, priceText, tradePrepare, tradeSearch, regenerateEconomy, quickFilter, usageSnapshot, tierViewNow, tierPrices, setTierAction, tierSuggest, designerState, designerSaveDraft, designerApply, designerUndo, designerSaveTheme, designerDeleteTheme, priceReview, applyReviewMoves, undoLastReview, autoTierRun, moveBases, setTierStyle, resetTiers, themes, saveTheme, applyTheme, deleteTheme, importTheme, exportTheme, VERSION };
}

function slimItem(item) {
  const { raw, ...rest } = item;
  return rest;
}

module.exports = { createServices, DEFAULT_SETTINGS };
