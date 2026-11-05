# Patch notes

Newest first. Each `## <version> - <date>` section is shown in the app (Settings → Patch notes)
and used as the text of the GitHub release, so write it for players.

## 1.0.4 - 2026-11-05

- **Uniques tiered like FilterBlade.** S tier, A tier, A tier - jewels, B+C tier, the D tiers and the High variety tiers, grouped by letter. "Combine into one A tier" (and so on) moves every base of a letter into its first tier.
- **Stacked** is its own category under Currency: Big stacks, Small stacks, Portal scrolls, Wisdom scrolls, Transmutes and Augmentations. Every stacked tier has a "Stacks of at least" box to change its stack size.
- **Levelling currency** is its own category at the bottom of Currency.
- **Heist** is a league mechanic now: contracts, blueprints, Rogue's Markers, tools, gear, brooches and cloaks.
- **Maps** has its own section: Regular, Influenced, Nightmare, Blighted, Special maps (enchanted, corrupted, implicit and Vaal temple maps) and Other map items.
- **Ducats** moved to Current league, which now sits with the league mechanics.
- **Log in instead of copying your POESESSID.** Settings → "Log in on pathofexile.com" opens the official login page in its own window. Log in there yourself; when your account page shows, the app saves the session (encrypted, as before), fills in your account name if it's empty, and closes the window. The app never sees your password.
- **Look editor:** the preview shows the text size you pick, and the sound is one line at the bottom; press Change to pick another or drop in your own.

## 1.0.3 - 2026-11-05

- **Thresholds with their own unit.** In the auto-tier tables type "200c", "1 div", "1,5 div" or "0.5 ex" in any box and press Enter (or just click away). Mix chaos and divines in the same category; a plain number means chaos.
- **Apply all price changes.** A button at the top of the Loot filter page checks poe.ninja for every priced category and moves every item to the tier its price fits, in one go. Price review → Undo last run puts it back.
- **"Check prices" only marks what's wrong.** Only items that belong in another tier are coloured; the rest stay plain.
- **Jewels category** with normal, abyss and cluster jewels, and **Cluster jewel rules**: highlight or hide cluster jewels by base (small, medium, large), item level and number of passives.
- **Flasks & tinctures** is its own category now, in Rare items.
- **Names:** "Sanctified relics" is now Sanctum, and League-specific's first subcategory is Vials.
- **Simpler tabs.** Extra rules and Price tiers are gone: My bases covers adding bases, and the auto-tier tables cover prices. The old Price tiers highlights are switched off once, because they drew over your tiers. Rules made with "Hide…" in the price check are listed on the My bases page.

## 1.0.2 - 2026-11-05

- **Category pictures load for every category.** poe.ninja's exchange lists send each item's picture and real name in a separate list that wasn't being read, so only a few categories had pictures. Now Scarab, Delirium, Harvest, Blight, Ritual, Essence, Kingsmarch and Delve show theirs too.
- **Exact item names from poe.ninja.** Exchange items (scarabs, essences, oils, fossils, omens, tattoos and more) now use the names poe.ninja spells out, instead of names rebuilt from web addresses, so prices and tiers match those items more reliably.

## 1.0.1 - 2026-11-05

- **New category layout.** Currency; Fragments (Scarab, Other fragments with the splinters); League mechanics (Delirium, Harvest, Blight with the oils, Ritual with corpses and omens, Essence, Kingsmarch with tattoos and runegrafts, Delve with the fossils); Cards & gems; Rare items (My bases, Rares, Crafting bases, Special bases, Chancing bases, Vendor recipes, Jewels/flasks/tinctures, Highlight specific bases); then Uniques & endgame, Campaign and Miscellaneous. Each category shows the in-game picture of a fitting item.
- **Price tiers in divines.** On the Price tiers tab, switch "Prices in" to Divine and type thresholds like "at least 1 divine". They're converted with poe.ninja's current Divine Orb price every time the filter is written, and the page shows that price.
- **Preview the game's own drop sounds.** Settings → Game sound previews has a slot for each built-in sound (Game sound 1 to 16). Drop in your own recording once and every ▶ for that sound plays it, in the tier list, the look editor, the designer and the price check. Previews only: your filter keeps the real in-game sound.

## 1.0.0 - 2026-11-04

The first release on GitHub. From now on PoE Helper updates itself.

- **Automatic updates.** The app checks GitHub when it starts and every 4 hours, downloads new versions in the background, and offers "Restart to update". It also installs when you quit.
- **Version and patch notes in the app.** The version, its release date and when your copy last updated are at the bottom of the menu. Click them, or open Settings, to read these notes.
- **Price check (Alt+E).** Every mod with tick boxes and min/max, instant buyout listings by default, gems searched by level, quality and corruption, a popup you can drag and pin.
- **Loot filter tiers like FilterBlade.** Move, hide or switch off tiers, edit their looks, a Giga tier above Tier 1 for mirror-level currency, your own tiers, and "My bases" for the bases you collect.
- **Categories you can organise.** Rename them, add your own, move subcategories between them, with item pictures or your own icons.
- **Auto-tiering by poe.ninja prices.** A per-category table with Include and "worth at least", and hourly auto-update for the categories you choose.
- **Tier designer** with six themes; Tier 1 always stays white with the Divine tink. Drop in your own sounds.
- **Safe filter writing.** Unknown item names are corrected or left out so the game always loads your filter, and a synced filter the game saves under a new name is found again.
- **Net worth** from your stash tabs, tracked over time.
