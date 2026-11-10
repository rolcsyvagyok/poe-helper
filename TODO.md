# TODO

## Next (asked 2026-11-10)

- Done in 1.0.36: PoB configuration, gear tooltips, PoB icon, PoB above Settings, trade "query too complex", WealthyExile snapshot-first, price buttons only on currency/fragments/league mechanics, Show in app reveals the category. Check them on the real PC after the release.
- Done in 1.0.38 (not released yet): PoB Tree tab (node hover diffs, path, search, click to allocate/remove, masteries, undo, heatmap), PoB Calcs tab (hover breakdowns like PoB), Configuration diff bar, map mods as tick lists, trade search retries with fewer stats plus a prefilled trade-site link. Check them on the real PC.
- Done in 1.0.38: tree optimiser (greedy swaps with limits). Ideas: masteries and cluster jewels in the optimiser, longer paths, a whole-tree respec mode.
- Done in 1.0.38: timeless jewel finder (every seed, exact via PoB), levelling plan (tree order, ascendancy by lab, gems per stage). Next ideas: best uniques per slot with prices, pantheon/bandit/flask check, defence report.

## Next

- **Skill parts (PoB's second Main Skill dropdown).** Some skills have parts PoB lets you pick, e.g. Kinetic Blast → "Projectile" / "Explosions", Summon Sacred Wisps → "Kinetic Blast" (wisps using it), and minion skills. Our Main skill picker only lists the socket group, so DPS uses PoB's default part. Read `activeSkill.activeEffect.grantedEffect.parts` (and `srcInstance.skillPart` / `skillPartCalcs`, plus `skillMinion` / `skillMinionSkill` for minions), show a second dropdown under Main skill when there's more than one part, save the choice in the build, and use it in Build, Calcs, Upgrades, Support gems and the optimiser. Also show the part-specific config options PoB adds (skill-specific settings like stages, number of projectiles hitting, etc.).

- **Taskbar icon is missing.** The installed app shows Electron's blank window icon on the Windows taskbar (and in the Alt+Tab preview) instead of the PoE Helper icon. Check that the BrowserWindow gets `icon`, that build/icon.ico is packaged (electron-builder `win.icon`), and set the AppUserModelID (`app.setAppUserModelId`) to match the installer's appId so Windows uses the shortcut's icon.

## Later

- Price changes "since your last check" (today they're poe.ninja's 7-day change).

- Check the live poe.ninja and trade API responses against the parsers after each league start.
