# TODO

## Next (asked 2026-11-10)

- Done in 1.0.36: PoB configuration, gear tooltips, PoB icon, PoB above Settings, trade "query too complex", WealthyExile snapshot-first, price buttons only on currency/fragments/league mechanics, Show in app reveals the category. Check them on the real PC after the release.

## Next

- **Taskbar icon is missing.** The installed app shows Electron's blank window icon on the Windows taskbar (and in the Alt+Tab preview) instead of the PoE Helper icon. Check that the BrowserWindow gets `icon`, that build/icon.ico is packaged (electron-builder `win.icon`), and set the AppUserModelID (`app.setAppUserModelId`) to match the installer's appId so Windows uses the shortcut's icon.

## Later

- Price changes "since your last check" (today they're poe.ninja's 7-day change).

- Check the live poe.ninja and trade API responses against the parsers after each league start.
