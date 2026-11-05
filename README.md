# PoE Helper

A Path of Exile 1 desktop helper with an in-game overlay. It combines a price check overlay, WealthyExile-style net worth tracking and local loot filter overrides in one app, and it is built to make **as few API calls as possible**.

## Features

**Price check overlay**
- Hover an item and press **`Alt+E`** (change it in Settings by pressing the keys you want), or just `Ctrl+C` it with clipboard mode on. The price check pops up next to the item without taking focus from the game, so you can hover the next item and press Alt+E again. Esc or moving the mouse away closes it; once your mouse has been on the popup it stays open until Esc or ✕. Drag it by its top bar and the next popup opens in the same place (Settings resets it); 📌 keeps it open. The overlay shows the poe.ninja price, divine conversion, stack total and how confident the price is.
- Handles currency and every stackable category (scarabs, essences, fossils, oils, omens, tattoos, runegrafts, embers, djinn coins…), divination cards, gems (level, quality, corruption), uniques (5L/6L pricing, variant ranges, unidentified bases), maps and influenced bases by item level.
- **Trade search**: the popup lists **every mod** on the item (implicit, explicit, crafted, fractured, enchant) with a tick box and **min and max**, plus totals when several lines add up (total resistance, total life). You can also filter by item properties: same base or any base of that kind, item level range, links, quality, gem level, map tier, corrupted, influences.
  - **Defaults:** your mods start a little below the item's values, and with two or more resistance lines the total resistance is ticked instead of each line. "Reduced" mods use the numbers shown on the item.
  - **Instant buyout only by default:** searches show merchant-tab listings you can buy right away. Change it per search, or in Settings → Trade listings.
  - **Results:** the count, the cheapest price, a typical price and the first listings, plus a link to the same search on the trade site. Each search uses 1 to 2 GGG requests.
  - **Where:** the in-game popup and the app's Price check page.
- **Map check**: warns about reflect, no regen, less recovery, curses and more. You decide which mods are deadly for your build.
- **Filter explainer**: shows which block of your loot filter applies to the item, and its line number.
- One-click **Hide in filter** / **Highlight** buttons write a local rule straight into your filter.

**Tier designer**
- Design how **Tier 1 to Tier 6** look once, and apply it to every category in your filter, or only those you tick (Currency, Divination, Uniques, Scarabs…).
- Per tier, set text, border and background colour (with opacity and quick swatches), text size, drop sound with volume, light beam, and minimap icon colour, shape and size.
- A loot-pile preview shows every tier together the way drops land on the ground. Click a drop to edit it.
- Six ready-made themes: **Classic, Midnight violet, Deep ocean, Ember, Verdant, Monochrome**. Save your own designs alongside them.
- **Tier 1 is always a white label** with a white beam, a white star and the Divine tink. A lock (on by default) keeps it that way in your own designs; only its text colour and size change.
- Special cases, "new" tiers and catch-all tiers keep their own look. **Undo last apply** restores the previous looks.
- Filters can't change the typeface; the game uses one font for every label, so the designer controls size.

**Tray**
- Closing the window keeps PoE Helper in the tray (Alt+E keeps working); the first time, a notice says where it went. Settings has **Hide to tray now**, **Minimize to the tray** and **Tray and app icon**, where you can pick any image as the icon for the tray, taskbar and window.

**Net worth (WealthyExile-style)**
- Pick the stash tabs to track. Snapshots value them with poe.ninja prices.
- History chart, change and income per hour, breakdown by tab and category, your most valuable items, and "what changed" between snapshots.
- Optional auto snapshots, which pause while `Client.txt` shows you are not playing.

**Daily lab**
- Alt+L in game: pick the lab (or open your favourite) and see today's layout from poelab.com on top of the game. Warns when today's isn't uploaded yet.

**What to farm**
- League mechanics ranked by how much their loot gained in value this week on poe.ninja, with each one's most valuable, rising and falling items.
- Items that doubled or halved are listed (and marked in the loot filter tiers); click any item for its 7-day price graph. Uses only poe.ninja.

**Loot filter: FilterBlade tiers, edited locally**
- Pick the filter you downloaded from FilterBlade (any NeverSink-based filter works). The app reads its tier tags (`$type->currency $tier->t1`) and shows it the way FilterBlade does. Categories are on the left; each tier shows its in-game look and its bases as chips.
- **Move bases between tiers**: click bases to select them, then Move or Hide; or drag them onto another tier. Hidden bases get a scoped Hide block placed right before their old tier, so they can't hide unrelated items. Each moved base is marked and can be put back with ×. You can also add a base that isn't listed yet.
- **Edit each tier's look**: text, border and background colours with opacity, text size, sound (the filter's own sound, a PoE Helper tink, or a built-in game sound) with volume, light beam, and minimap icon colour, shape and size. A live preview shows it on the ground, and one click goes back to the FilterBlade look.
- **Never loses your work**: your edits are stored as a list of changes and applied to a fresh copy of the FilterBlade file every time, written as `<name> (helper).filter`. Re-download from FilterBlade and the copy is rebuilt with your changes. The original file is never modified.
- **Themes**: save the current tier looks (all, or only the ones you changed) as a theme. Apply it to any FilterBlade filter or strictness, matched by category and tier, or export and import it as a `.json` file to share.
- **Price review (auto-tiering)**: one click checks poe.ninja for every category it prices (currency, fossils, oils, essences, omens, tattoos, divination cards, scarabs, fragments, runegrafts, vials, and uniques by base if you opt in) and lists items that now belong in a different tier.
  - **Per-category table, like FilterBlade's "Apply currency":** every tier has **Include** and **Worth at least N** in chaos, divine or exalted. Empty thresholds use a suggestion halfway between neighbouring tiers. Excluded tiers are never filled and their items stay put. The last row, **Anything less valuable**, either hides those items or leaves them where they are. "Auto-tier…" on any category opens its table.
  - **Hysteresis:** items only move when clearly outside their tier (1.5× past the boundary by default), so prices sitting on an edge don't bounce back and forth.
  - **Skipped on purpose:** items with fewer than 5 listings are left alone. Special tiers, "new" tiers, single-item tiers and hidden-to-hidden moves are never used.
  - **Approve or automate:** tick the moves and press **Apply <category>** (or apply everything at once), or tick **Auto-update** on a category to re-tier it every hour.
  - **Undo:** every run is logged, and "Undo last run" puts it all back.
  - **No GGG requests:** it uses the same 20-minute poe.ninja cache as price checks.
- **From the overlay**: price-checked items show their category and tier, with Move and Hide buttons that edit your tiers directly. Items that aren't in any tier get **"Put it into"** with the categories made for that item class, and a tier FilterBlade switched off gets **"Switch it on"**. Magic items are matched by their base ("Quicksilver Flask" from "Abecedarian's Quicksilver Flask of Incision").
- **My bases**: press **+ My bases…** in the price check on a normal, magic or rare item, pick the item levels (this item's by default, or 82+/86+) and rarities, and the base is highlighted above everything else in your filter. The My bases page (top of the category list) lists them with editable item level ranges and rarities, an on/off switch, and one shared look you can edit.
- **Giga tier**: Currency starts with a Giga tier above Tier 1, looking like the Divine Orb's tier, holding Mirror of Kalandra, Hinekora's Lock and Mirror Shard. Delete it if you don't want it; it won't come back.
- **Your own tiers**: "+ New tier" on any category adds a tier (for example **Giga** above Tier 1 in Currency, for mirror-level items). It copies the look of a tier you pick (the Divine Orb's tier by default) and you fill it by dragging items onto it or typing them in. Rename or delete it from its header; deleting puts its items back.
- **Tier names and labels**: tiers read "Tier 1", "Tier 2"… (NeverSink's hint words are dropped; "typically 301c" says the value), one-off tiers get real names ("Portal scrolls"), and each tier's label shows its most valuable item at today's prices.
- **Switched-off tiers**: FilterBlade's strictness turns tiers off by commenting them out (`#Show`). They show as **Off** (dashed) and every tier has a Shown / Hidden / Off switch.
- **Safe item names**: the game refuses a whole filter over one unknown BaseType name, so every name is checked against your FilterBlade filter and poe.ninja before writing. Near misses are corrected ("Gemcutters Mercy" → "Gemcutter's Mercy"); unknown names are left out.
- **Categories like FilterBlade's**: Currency & Rewards (Currency, Harvest, Delirium, Scarab, Essence, Fossil, Oil, Trial, Splinter, Unique items, Divination Cards, Gems, Vendor Recipes, Gold, Current League, Fragments, Endgame Maps, Rares, Special Bases & Crafting, Jewels/Flasks/Tinctures, Highlight specific bases), Campaign (level 1-67), and Miscellaneous (League-specific, Chancing Bases, Miscellaneous). Each opens to the filter's own subcategories, and **Reset** undoes your changes in that category. **Edit categories** (top of the list) lets you rename categories, reorder them, add your own in any section, and move subcategories between them by dragging or with the menu next to each one; **Reset layout** goes back to the defaults. This only organises the list; your filter isn't changed.
- **Category icons**: by default the in-game picture of a fitting item (Divine Orb for Currency, Chromatic Orb for Vendor Recipes, Orb of Chance for Chancing…). The pictures are loaded from GGG's image server through poe.ninja's data, not bundled with the app; offline you see line icons. Click the icon in a category's header to pick a line icon or drop in your own image (.png, .svg, .jpg, up to 512 KB).
- **Extra rules, price tiers and item check** are still there as tabs. Extra rules go above everything else; price tiers add poe.ninja-based highlights; item check shows which rule hits a pasted item and how it looks.
- **Your own sounds**: drag an .mp3, .wav or .ogg onto a tier (or into its look editor, or the Tier designer) and it becomes that tier's drop sound. It's kept in the app's data folder and copied next to your filter.
- **Drop sounds ("tinks")**: six original sounds ship with the app (Divine tink, Chime, Sparkle, Coin, Soft bell, Deep gong) and play in the app. Writing the filter copies the ones you use to `My Games/Path of Exile/poehelper-sounds/`. The 16 built-in game sounds can be picked too, but they can only be heard in game.

> **Synced (online) filters work too.** When FilterBlade syncs a filter to your PoE account, the game stores it in `My Games/Path of Exile/OnlineFilters/` without a file extension. The app lists those as "<name> (synced from FilterBlade)" and writes your version as `<name> (helper).filter` next to your local filters. Whenever FilterBlade pushes an update, the game replaces the online file and your copy is rebuilt with your changes. Select the "(helper)" filter in game instead of the online one.

## API usage (why it is light)

| What | Source | When it calls | Cost |
|---|---|---|---|
| League name | poe.ninja `/poe1/api/economy/leagues` | at most every 6 h | 0 GGG |
| Prices | poe.ninja economy endpoints | per category, at most every 20 min, with ETag (`304 Not Modified`) | 0 GGG |
| Price check (uniques, currency, cards, gems, maps…) | local cache | never | 0 |
| Trade stat list (mod → id) | GGG `/api/trade/data/stats` | at most once a week, only when you open trade search | ≤1 GGG / week |
| Trade search | GGG `/api/trade/search` (+ `/fetch` for listings) | only when you press **Search** | 1–2 GGG |
| Stash tab list | GGG `get-stash-items?tabs=1` | cached 6 h; also returns tab 0's items for free | 1 GGG |
| Net worth snapshot | GGG `get-stash-items` | 1 per **selected** tab; reused if you snapshot again within 60 s | N GGG |

Guards on every GGG request:
- GGG's `X-Rate-Limit-*` headers are parsed and followed at **50 %** of the allowed rate (configurable). `Retry-After` is honoured.
- A **daily cap** (default 300) stops all GGG requests once reached.
- The dashboard shows exactly how many requests were made today, per type.
- Your `POESESSID` is only ever sent to the stash endpoint, never to trade.

poe.ninja's API guidelines are followed: only the documented economy endpoints, conditional requests, a descriptive User-Agent, and no polling faster than the data refreshes. If you plan to share the app with many people, poe.ninja asks apps to proxy requests through their own backend. Set **Settings → poe.ninja base URL** to your proxy.

## Install for players (with automatic updates)

Download **PoE-Helper-Setup-x.y.z.exe** from https://github.com/rolcsyvagyok/poe-helper/releases/latest and run it (if SmartScreen warns, press More info → Run anyway). The installed app updates itself from GitHub: it checks at start and every 4 hours, downloads in the background, and offers **Restart to update** (also in the tray menu and Settings → Updates). How to publish a new version: see [RELEASING.md](RELEASING.md).

## Run from the source folder (for building releases)

1. **Install Node.js 22 LTS** from nodejs.org (the Windows .msi installer, default options). Only needed once.
2. **Unzip** `poe-helper.zip` somewhere permanent, for example `C:\Tools\poe-helper`.
3. **Double-click `Start PoE Helper.cmd`** in that folder.
   - The first time, a window shows it installing (a few minutes, about 300 MB), then PoE Helper opens.
   - It also creates **PoE Helper** shortcuts on your Desktop and in the Start menu.
4. **From then on, open PoE Helper from the Desktop or Start menu shortcut.** No black window, no commands.

To have it ready every time you play, turn on *Settings → Starting the app → Start PoE Helper with Windows*; it then waits in the tray. Closing the window keeps it running in the tray so Alt+E keeps working; quit from the tray icon.

If you prefer typing: `npm install` once, then `npm start`.

### Make an installer instead (optional)
```
npm run dist
```
This puts `PoE Helper Setup 0.3.0.exe` (installer) and a portable `.exe` in the `dist` folder. They're unsigned, so Windows SmartScreen asks once: **More info → Run anyway**. You can also push a tag like `v0.1.0` to GitHub; the included workflow builds the `.exe` files for you.

## First-time setup

1. **Game display mode:** in PoE, *Options → Graphics → Display mode → Windowed Fullscreen*. Overlays can't draw over exclusive fullscreen.
2. **Price check:** hover an item in game and press **Alt+E**. The price pops up next to the item. Esc, or moving the mouse away, closes it. Change the hotkey in *Settings → Price check*: click the hotkey box and press the keys you want.
3. **Loot filter:** open *Loot filter*, pick your filter (FilterBlade filters synced to your account show as "(synced from FilterBlade)"), and make any change. The app writes `<name> (helper).filter` next to your filters. In game: *Options → Game → Item Filter → "<name> (helper)"*, once. After later changes, zone or press the reload button next to the filter dropdown in game.
4. **Look of your tiers:** *Tier designer → pick a theme → Apply*. Tier 1 is always white with the Divine tink.
5. **Prices on tiers:** *Loot filter → Price review → Check prices*. Tick the moves you want and Apply, or turn on the hourly automatic mode.
6. **Net worth** (optional):
   - In Settings, enter your account name with its number (`Name#1234`) and your `POESESSID`. To find it: log in on pathofexile.com, press F12, then *Application → Cookies → POESESSID*. It is stored encrypted on your PC.
   - On the Net worth page: **Load tab list**, tick the tabs to track, **Save selection**, then **Take snapshot**.
   - For automatic snapshots that pause while you're idle, set the `Client.txt` path. It is usually `C:\Program Files (x86)\Grinding Gear Games\Path of Exile\logs\Client.txt`, or `...\steamapps\common\Path of Exile\logs\Client.txt` on Steam.
7. **League:** Auto follows poe.ninja's current challenge league, so it switches to 3.30 by itself once poe.ninja lists it after the Nov 13 launch. You can also pin a league in Settings.

### Updating to a new version
Quit PoE Helper from the tray icon, unzip the new version over the old folder, then start it from your shortcut (or double-click `Start PoE Helper.cmd`). Your settings, filters and history live in `%APPDATA%\PoE Helper`, not in this folder.

## Fair play

The app reads the clipboard and sends **one** `Ctrl+C` per hotkey press, the same model other community tools use. It never automates gameplay. Keep your `POESESSID` private; anyone who has it can act as you on the website.

## Project layout

```
src/
  core/                 pure Node logic, unit-tested, no Electron
    item-parser.js      clipboard item text → structured item
    rate-limiter.js     GGG header-driven limiter (safety margin, Retry-After)
    cache.js            JSON disk cache with ETag metadata, settings store
    ninja.js            poe.ninja client (lazy categories, conditional GETs)
    ggg.js              GGG client: stash, trade; budget + counters
    pricer.js           item → category routing + best match
    trade.js            mod → trade stat matching, query builder
    map-mods.js         dangerous map mod rules
    networth.js         snapshots, valuation, income, diffs
    filter/
      parser.js         lossless .filter parser + block renderer
      matcher.js        "which block hits this item?"
      tiers.js          FilterBlade/NeverSink tiers: read, move, hide, restyle, themes
      tier-prices.js    poe.ninja prices per tier, price review and auto-tier plans
      designer.js       tier designer presets (Tier 1 white + tink) and apply logic
      manager.js        helper filter writer, economy tiers, file watching
  main/
    main.js             Electron: windows, overlay, tray, hotkeys, IPC
    services.js         wires core modules together
    keys.js             optional Ctrl+C sender (uiohook-napi)
  preload.js            minimal, allow-listed IPC bridge
  renderer/             main window + overlay (vanilla JS, no remote code)
test/                   node:test suites (npm test)
```

## Known limitations

- Rares aren't auto-priced (no reliable offline method exists). Use the overlay's trade search.
- Uniques with several variants show a range unless the mods identify the variant.
- Net worth values currency, fragments, cards, scarabs and similar stackables, identified uniques, gems and maps. Rares and unidentified uniques count as 0, like most net worth tools.
- poe.ninja's API has no stability guarantee. If a route moves, update `src/core/ninja.js`.

## Fonts

Item labels use the game's **Fontin SmallCaps** when it's installed on your system. Otherwise they use the bundled **Marcellus SC** (© Astigmatic, SIL Open Font License 1.1, see `src/renderer/fonts/MarcellusSC-OFL.txt`), the closest open look-alike, tuned to match the game's label weight and spacing. For an exact match, download Fontin SmallCaps for free from exljbris.com and choose the file in **Settings → Price check → Item label font**. Fontin can't be shipped with the app under its licence.
