# TODO

## Next (asked 2026-11-10)

- Done in 1.0.36: PoB configuration, gear tooltips, PoB icon, PoB above Settings, trade "query too complex", WealthyExile snapshot-first, price buttons only on currency/fragments/league mechanics, Show in app reveals the category. Check them on the real PC after the release.
- Done in 1.0.38 (not released yet): PoB Tree tab (node hover diffs, path, search, click to allocate/remove, masteries, undo, heatmap), PoB Calcs tab (hover breakdowns like PoB), Configuration diff bar, map mods as tick lists, trade search retries with fewer stats plus a prefilled trade-site link. Check them on the real PC.
- Done in 1.0.38: tree optimiser (greedy swaps with limits). Ideas: masteries and cluster jewels in the optimiser, longer paths, a whole-tree respec mode.
- Done in 1.0.38: timeless jewel finder (every seed, exact via PoB), levelling plan (tree order, ascendancy by lab, gems per stage). Next ideas: best uniques per slot with prices, pantheon/bandit/flask check, defence report.

## Next

- Done in 1.0.42: skill parts (PoB's pickers under Main skill: the skill of the group, its part, stages, active mines, minion and minion skill), saved into snapshots and used by every tab. Idea: let Upgrades / Support gems compare parts side by side.

- **Taskbar icon**: the window icon (icon.ico, 16–256 px), electron-builder `win.icon` and `app.setAppUserModelId('dev.poehelper.app')` matching the appId are all set already. Check on the PC whether the taskbar still shows Electron's icon; if so, try passing a nativeImage instead of the .ico path.

## Later

- Price changes "since your last check" (today they're poe.ninja's 7-day change).

- Check the live poe.ninja and trade API responses against the parsers after each league start.
