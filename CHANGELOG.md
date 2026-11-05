# Patch notes

Newest first. Each `## <version> - <date>` section is shown in the app (Settings → Patch notes)
and used as the text of the GitHub release, so write it for players.

## 1.0.6 - 2026-11-05

- **Daily lab works.** 1.0.5 showed "this.fetch is not a function" instead of the layout; it now downloads today's layout from poelab.
- **Clearer menu.** Bigger entries with icons, a marker on the page you're on, and Loot filter right below Overview.
- **Wider category list.** On the Loot filter page, drag the right edge of the category list to make it wider (double-click it to reset). The page also uses the full window width now.
- **Big belts looks like the multi-base uniques,** a bit louder: bigger text, a beam, a larger minimap star and a sound. It keeps following the "High variety - multi-bases" look, also through themes and the designer, until you edit Big belts yourself.
- **Giga follows your theme.** The Giga currency tier now takes the look of the top currency tier in every designer theme or theme you apply, a bit louder, until you edit Giga yourself. Before, it kept the original look whatever theme you chose.
- **Cluster enchantments shows the size tiers too.** Cells your economy tiers don't cover now show the look of the filter's size tier that catches them (like "Large: 12 passives, item level 84+"), or a dashed strike-through when that tier hides them. Hover a cell to see which tier it is.
- **"By enchantment (economy)" is gone from the list:** the Cluster enchantments grid already covers it. Cluster jewels has the Large Cluster Jewel picture.
- **Picking a category no longer jumps to the top of the page** when you'd scrolled down; it only scrolls back up to the tier list if you'd scrolled past it.
- **Stacked** starts with Big stacks and Small stacks.
- **New category pictures:** an Elder guardian map for Influenced maps, a Nightmare map for Nightmare maps, a tier 16 map for Regular maps and a Stacked Deck for Divination cards.

## 1.0.5 - 2026-11-05

- **Daily lab.** Press Alt+L in game, pick the lab (1-4) and today's layout from poelab.com shows in a window on top of the game. Press Alt+L or Esc to hide it. Star a lab as your favourite and Alt+L opens it straight away. If poelab hasn't uploaded today's layout yet, it says so, shows the newest one and checks again every 10 minutes. Also on the new Daily lab page in the menu.
- **What to farm.** A new page ranks the league mechanics by how much their loot gained in value this week on poe.ninja, with each one's most valuable, rising and falling items. Click any item for its 7-day price graph.
- **Big price changes are marked.** Items that doubled or halved this week get a badge in their tier and in Price review, with the old and new price and a 📈 graph button.
- **Base visibility, like FilterBlade's matrix.** Rare items → Base visibility lists every base FilterBlade knows: armour by defence type or class, weapons, jewellery, flasks and jewels, Heist bases and Ritual bases. Paint bases with a brush: Hide, Fractured: show or Fractured: hide. Hiding works in maps only unless you untick it, and "Keep item level 86 and above" keeps the good ones. Uniques, influenced, synthesised, corrupted, mirrored and 6-socket items are never hidden by it.
- **Cluster jewels by enchantment.** Jewels → Cluster enchantments shows every enchantment against its number of passives, per item level band, with poe.ninja's price in each cell and what your filter does with it. Paint cells with the top or good look or hide them, or mark them all by price ("top from 1 div, good from 20c").
- **Jewels have their own section:** Normal jewels, Abyss jewels, Cluster jewels (by enchantment and by size) and Cluster enchantments.
- **Heist tidied up:** Blueprints, Contracts, Rogue's Markers, Equipment (cloaks, brooches, gear and tools in one place) and Heist bases. Ritual bases are under Ritual, and Heist targets moved to a new Quest items category.
- **Thresholds in chaos or divines.** Each auto-tier row has two boxes, "Over [ ] c or [ ] div". The one you typed in last counts; the other shows the converted price.
- **Big belts.** Unique items get a "Big belts" tier above S tier with Heavy Belt and Leather Belt, created once.
- **Bigger label previews,** close to the size they have in game.
- **Hide hidden bases when they're fractured too:** "Also when fractured" and "Also when synthesised" under a gear category's tiers.
- **Logging in is more reliable:** the login window opens your account page itself after you log in.
- Dead Man's Sulphur and League exclusive moved to Current league; map categories show a map picture; clearer tier names for cluster jewels and Heist cloaks.

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
