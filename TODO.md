# TODO

## Next (asked 2026-11-10)

- **PoB configuration (asked 2026-11-10):** Path of Building's Configuration tab (charges, Onslaught, Fortify, Unholy Might, Leeching, enemy is Shocked/Chilled, boss type, map mods, shrines, Champion's Intimidate, Sacrifice Minion on Attack, etc.) has to be ticked by hand after every import. Show these options in the app (Path of Building page) and keep them per character, so a new snapshot gets the same ticks without doing it again. PoB stores them in the build XML (<Config><Input name=... boolean/number/string/>); its option list is Modules/ConfigOptions.lua (varList, with section, label, type, ifSkill/ifFlag... conditions).
- **Gear tooltips (Stats tab):** hovering a gear row shows the exact item (its mods), like the game's tooltip.
- **Path of Building icon:** use the icon of %APPDATA%\Path of Building Community\Path of Building.exe for the PoB page in the menu (extract it on the user's PC with app.getFileIcon; don't ship it).
- **WealthyExile tab:** taking a snapshot should be the main view; switch between snapshots with a list (or something that looks good).
- **Menu:** put Path of Building right above Settings.
- **Trade search bug** (Path of Building > Upgrades): "The trade site said: Query is too complex. Please reduce the amount of filters used. Logging in will increase this limit." Fix: send the POESESSID with this search (GggClient.tradeSearch has no session) and cap the weights (about 10 without login, up to 35 with; drop tiny ones). Code: pobFindItem in src/main/main.js, buildWeightedQuery in src/core/pob-trade.js.
- **Price buttons** ("Check prices", "Set category prices") only on currency, fragments and league mechanics categories, not on base categories (filters.js renderTiers header).
- **Show in app** (price check): the Loot filter page opens the right category, but the left category list doesn't show where you are. Expand its group and scroll the active row into view.
- Done, not released yet: 1.0.35 (currency folded to six tiers, Scrolls list).

## Next

- **Taskbar icon is missing.** The installed app shows Electron's blank window icon on the Windows taskbar (and in the Alt+Tab preview) instead of the PoE Helper icon. Check that the BrowserWindow gets `icon`, that build/icon.ico is packaged (electron-builder `win.icon`), and set the AppUserModelID (`app.setAppUserModelId`) to match the installer's appId so Windows uses the shortcut's icon.

## Later

- Price changes "since your last check" (today they're poe.ninja's 7-day change).

- Check the live poe.ninja and trade API responses against the parsers after each league start.
