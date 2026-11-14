# PoE Helper: notes for Claude

A Path of Exile 1 desktop helper (Electron, Windows first). The README lists the features, RELEASING.md
the release steps, CHANGELOG.md what each version changed (written for players), and TODO.md what's next.

## Layout

- `src/main/` — the main process.
  - `main.js`: windows, tray, hotkeys, every IPC handler (`handle('area:name', …)`).
  - `services.js`: prices, filters, GGG/poe.ninja calls, settings.
  - `pob.js`: `PobEngine`, which talks to the Path of Building worker.
  - `pob-worker.js`: the Electron utilityProcess that runs PoB.
  - `updater.js`: auto-update from GitHub releases.
- `src/preload.js` — the IPC allowlist. A new `handle('x:y')` channel must be added here too, or the renderer can't call it.
- `src/renderer/` — plain JS, no framework. `dom.js` has `h()` and `mount()`.
  - `app.js`: pages and navigation.
  - `pob.js`: the whole Path of Building page (Snapshot, Build, Tree, Calcs, Configuration, Upgrades, Support gems, Levelling plan, Compare).
  - `styles.css`: all styles.
- `src/core/` — pure logic, unit-tested: item parser, pricer, trade, filter engine, regex, lab, pob-code (build codes), pob-trade (weighted trade queries).
  - `price-filters.js` + `trade.prepareSearch`: the price check's search, modelled on Awakened PoE Trade (MIT): pseudo totals, Q20 defences/DPS, starting ticks, crafting-base preset. The hotkey copies with Ctrl+Alt+C; `item.modMeta` holds tier / prefix-suffix / roll ranges, and `plainItemText` gives Path of Building the plain copy.
- `src/core/filter/strictness.js` + `strictness.json`: FilterBlade's strictness levels done in the app. Rebuild the JSON with `node scripts/build-strictness.js <7 FilterBlade downloads, Soft first>` when NeverSink changes them. Only the change from the download's own level ("# TYPE: 2-…") is applied, under the owner's own tier actions; stored per filter name in `settings.strictness`.
- `src/pob/` — Lua run inside the user's own Path of Building install.
  - `SimpleGraphic.lua`: stubs for PoB's graphics host.
  - `host.lua`: the headless PoB host, one op per request.
- `test/` — `node --test`, run with `npm test`. Keep it green.
- `scripts/` — data builders (gems, item mods, map mods) and `release-notes.js` (CHANGELOG → GitHub release text).

## Path of Building, headless

- The app never ships PoB. It runs the user's installed copy (the folder is picked in Settings).
- `pob-worker.js` loads PoB's `lua51.dll` with koffi, runs `SimpleGraphic.lua`, then `host.lua`. Requests and answers are JSON lines.
- **The worker sets `id` on every message.** Never name an op parameter `id`; use e.g. `node` (this caused the "No such node" bug).
- Timeless jewel tables: PoB's `Inflate` used a koffi callback that crashed PoB on some PCs (0xC0000409).
  - The worker now unpacks the tables once to `userData/pob-cache/<Name>-<packedSize>.bin`.
  - Lua gets `POEHELPER_INFLATED = { [size] = path }`, and `Inflate` reads the matching file.
  - Keep it that way: no koffi callbacks.
  - `host.lua` blocks writes to PoB's TimelessJewelData folder.
- PoB APIs used:
  - `build.calcsTab:GetMiscCalculator()`, called as `calcFunc({ addNodes, removeNodes, repSlotName, repItem }, full)`.
  - `spec:AllocNode` / `DeallocNode` / `AddUndoState`.
  - `calcsTab.sectionList` for the Calcs tab.
  - `itemsTab:AddItemTooltip` with a fake tooltip object.
  - `data.readLUT` for timeless jewels.
- Local functions in `host.lua` must be defined before use, or forward-declared (as `autoConfig` is near `applyConfig`).
- What is saved where:
  - Only **snapshots** (characters imported by the app) are changed and saved by the app: tree edits, config, support gems, skill parts.
  - The user's own PoB builds are read-only here.
  - The main skill choice is kept per file in settings (`pob.mainGroups`).
- `autoConfig` ticks Configuration options from the build (charges, buffs, conditional buffs, crit recently, enemy conditions). It only sets options still at their default.
- Passive points available: `pointsForLevel` in host.lua. It is level − 1, plus the quest points by act (the same table as the levelling plan), plus the bandit point after act 2, and never fewer than the tree uses.
- A PoB request that times out restarts the worker (`restartStuck`), so one stuck request can't block the queue.
- `log()` in main.js also writes `userData/poe-helper.log` (1 MB, then `.old`). Ask the owner for it when something broke.

## Testing PoB changes

- The unit tests don't run PoB. Change `host.lua`, then test against a real PoB install. Lua 5.1 / LuaJIT can be driven from a script with ctypes, or run the app.
- In a Python ctypes harness, don't name a variable `L`: it is the lua_State.
- Check UI changes in the running app (or a browser harness that serves `src/renderer` with mocked IPC) and look at a screenshot.

## Rules from the owner

- **Privacy:** the POESESSID is stored encrypted (safeStorage) and only ever sent to pathofexile.com. Never log it, and never put it, settings.json, or anyone's loot filter in the repo or in a zip.
- **No GGG or Path of Building assets in the repo.** No game art, sounds or PoB images.
  - The tree art is read at runtime from the user's PoB `TreeData` folder.
  - Game sounds are extracted on the user's PC.
- **Ask first:** don't delete releases or files without asking.
- **Few API calls:** keep GGG and poe.ninja requests minimal. Rate limits are respected in `rate-limiter.js`, and the UI shows GGG requests used today.
- **Colour:** must work for colour-blind users (deutan). Use blue/orange rather than green/red, and add a shape or sign (+ / −, dashed, crossed out), not colour alone.
- **Text:** player-facing text is plain English and short. CHANGELOG entries are for players, not developers.

## Releasing

- The owner releases from his Windows PC (see RELEASING.md).
- Each release needs a `package.json` version bump and a `## X.Y.Z - YYYY-MM-DD` section at the top of CHANGELOG.md. That section becomes the GitHub release text and the in-app patch notes.
- `npm run release` builds the NSIS installer and publishes it to github.com/rolcsyvagyok/poe-helper. Installed copies auto-update from there.
- It needs `GH_TOKEN` with Contents read/write on the repo. Don't release from another machine unless the owner agrees.
- Run `npm test` before every release.
