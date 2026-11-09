# Patch notes

Newest first. Each `## <version> - <date>` section is shown in the app (Settings → Patch notes)
and used as the text of the GitHub release, so write it for players.

## 1.0.33 - 2026-11-10

- **Fixed: the item tester, Upgrades and Search the trade site stopped with "attempt to call method 'Item'".** The released Path of Building makes items differently from its newest code; PoE Helper now works with both.
- **Snapshots take the skill that does the most damage as the main skill.** Path of Building's import picks the socket group with the most gems, which is often your aura link (Grace instead of Flicker Strike).
- **Stats: pick the main skill** at the top. It is remembered for that build, and the item tester and Upgrades use it too.
- **Compare is now Compare snapshots**, the last tab.

## 1.0.32 - 2026-11-09

The Path of Building page now does Path of Building's maths, not only snapshots. It has tabs, and every tab works on a snapshot or on any build in your PoB builds folder:

- **Item tester**: copy an item in game (hover it, Ctrl+C) and the Item tester shows what it does in each slot it fits: DPS change in %, life, energy shield, effective HP, resistances, attributes. No price check hotkey needed; the last items you copied stay as buttons to flip back to. You can also paste an item, or set the item tester hotkey to copy and open it in one press.
- **Stats**: everything Path of Building's side panel shows: DPS (and each skill in full DPS), average hit, speed, crit, life, ES, mana and regen, effective HP and the biggest hit you can take of each type, armour, evasion, block, suppression, resistances with how far over the cap, attributes and charges. Plus your gear and your gem links.
- **Compare**: two builds side by side, like yesterday's snapshot and today's: every stat with the change, the gear that changed and the gems that were added, removed or levelled.
- **Upgrades: find a better item on the trade site**, like Path of Building's trade search. Pick a slot, what matters (damage, defence or both), the highest level requirement and the most you want to pay. Path of Building puts a blank item of the same base in that slot and tries each stat on it, so every stat gets a weight for what it adds to your build (a resistance you need counts a lot, one over the cap nothing). The trade site lists items by the weighted sum of their stats, and Path of Building tests the 10 best in your build: DPS and effective HP change, the rest of the changes, the price, a Copy whisper button and Open in the item tester. 2 trade requests per search. Below it, Best mods for your items shows which single mod would help each of your rare items most.

A third ring slot and abyssal sockets only show when your build has them.

## 1.0.31 - 2026-11-09

- **Fixed: snapshots failed with "Path of Building didn't start: _SimpleGraphic.def.lua: No such file or directory".** An installed Path of Building doesn't have that file, so PoE Helper now brings its own copy.
- **Loot filter search shows the category of each base** it finds, under the name: "Regal Orb, Tier 5, Currency: Big stacks" instead of three Regal Orbs you can't tell apart.

## 1.0.30 - 2026-11-09

- **Path of Building → Snapshot: characters grouped by league.** The current league is first, then your other leagues. Standard and Hardcore characters are hidden until you tick Show Standard and Hardcore, and Only <league> shows just the current league. Your choice is remembered.

## 1.0.29 - 2026-11-09

- **Path of Building has its own page** in the menu (under Regex), instead of a section in Settings.
- **Snapshots of your character** (Path of Building page): like Path of Building's Import tab, it reads your gear, gems, passive tree and jewels from pathofexile.com with your login (private profiles too) and has Path of Building make them into a build, saved as a new file in `PoE Helper snapshots` in your builds folder. Open it in Path of Building like any build; older snapshots stay. Pick a character or leave it on the one you played last, press Save snapshot now, or set a hotkey to save one from in game; it's in the tray menu too. Path of Building only runs while it makes a snapshot.
- **The price check no longer compares items with your Path of Building build**; that part was getting in the way of the price check.
- **The price check says where the item is in your filter**: "Shown by line 65 of your filter: Base ranks: rares, rank D", or the category and tier, or the section of the FilterBlade file. Show in app opens that place on the Loot filter page (Base ranks, My bases, Campaign or the tier), also for items whose base isn't in a tier list.
- **Copy and paste a look** on the Loot filter page: Copy look on any tier (or in the look editor), then Paste look on another tier gives it the same colours, size, sound, beam and icon. In the look editor, Paste puts the copied look in the editor first, so you can adjust it before Save look. Works for My bases too.

## 1.0.28 - 2026-11-09

- **Path of Building in the price check** (new, Settings → Path of Building): turn it on, pick one of your builds, and checking a piece of gear shows what it does to your build in each slot it fits: DPS (or full DPS) change in %, life, energy shield, effective HP, resistances, attributes and more, instead of what you wear now. It's worked out by your own installed Path of Building (Community), run in the background, the same way its item tooltip does. Save your build in Path of Building and press Reload to compare with the new version.
- **Regex → Gems: Copy search on every part** (Act 1 · Nessa, Act 2 · Yeena…): copies a search for just the gems you picked in that part, so you can search one vendor at a time; your picks and the full search stay as they are.

## 1.0.27 - 2026-11-09

- **Regex → Gems: a Picked view** (next to the act tabs): only the gems you picked on that tab, whatever the colour, kind or search filters say, still in parts by vendor. Click one to drop it.
- **Regex → Gems: "Copy picks from Act 1"** (on the Act 2 tab, and so on): adds the gems you picked in the act before to this act's picks.
- **Regex: Beasts has no Harvest beasts switch any more**: every beast is a Harvest beast now.

## 1.0.26 - 2026-11-08

- **Regex: saved gem searches, per act.** On the Gems page, Save as new keeps the gems you picked (and your class) under the act you're on; each act tab has its own list to load, update or delete.

## 1.0.25 - 2026-11-08

- **Regex: Gems** (new): every gem in the game, 855 of them (skill and support gems, transfigured, Vaal and Awakened), to click into a search for vendors (Lilly and the act vendors) or your stash. Filter by colour, skill or support, a name or a tag (fire, minion…); pick everything shown at once. Each gem gets the shortest piece of its name that no other gem has ("^fireb"; "Ice Nova" doesn't find "Ice Nova of Frostbolts"), and when they don't fit in one search you get several to copy one after another.
- **Gems: where to get them in the campaign.** Pick your class and every gem shows the first vendor that sells it to you ("A1 Nessa", "A3 Siosa", "A6 Lilly"); hover it for its quest reward and every vendor. Tabs for Act 1, 2, 3, 4 and 6+ list only the gems your class can have by then, and each act keeps its own picks, so you have a search ready for every vendor. Skill gems and supports sit side by side, each in parts by where you get them first (Act 1 · Nessa, Act 2 · Yeena, Act 3 · Clarissa, Act 3 · Siosa, Act 6 · Lilly Roth, quest rewards only, not sold), with a Pick all for each part. (Vendor and quest data from exile-leveling.)
- **Regex: Shields are with Quivers under Off-hand** in the item type lists.
- **Regex: the page doesn't jump any more** when you tick a tier or pick a mod: only that row and the search change, and the bar at the top keeps its height.

## 1.0.24 - 2026-11-08

- **Regex: Campaign items** (new): for levelling, pick an item type and the mods you want (movement speed, life, resistances…); the search finds them on any item, normal, magic or rare, by the mods' own text, at every tier or from a tier you pick ("T3 or better"). Any one of them or all of them, and searches can be saved.
- **Regex: Magic item mods shows the amounts** (T1 +91–100, T2 +77–90…) instead of the mod names (they're in the tooltip), and **ticking T2 ticks T1 too** (unticking a tier unticks the worse ones).
- **Item types come in parts** (Armour, Jewellery, One-handed and Two-handed weapons, Flasks, Jewels) in both lists.
- **Rapiers count as One Hand Swords everywhere:** Regex, Base ranks (one column and one Hide whole groups button) and Campaign → Hide item types. A group you hid as "Rapiers" before can still be brought back under "Hidden earlier".
- **The app's own sounds are gone from your filter:** the chime, sparkle and tinks the app put on tiers (Tier designer looks, Base ranks S and A, My bases, fractured bases, economy rules) are replaced by FilterBlade's own sound for each tier, or the game's alert sounds for the app's own rules. Sounds you added yourself stay. The look editor has "The filter's own sound (FilterBlade)" to pick.
- **WealthyExile: essences nobody trades right now have their picture too** (poe.ninja doesn't list them, so GGG's own picture of the essence is used).
- **WealthyExile: divination cards have their picture** (poe.ninja has none for cards, so the stash's card picture is used).

## 1.0.23 - 2026-11-08

- **Price check: "Show in app"** (was App) opens the Loot filter at the item's tier, with the item picked and the tier lit up, so you can move or restyle it right there.
- **Price check: "Shown by line …" knows campaign from maps**: rules for the campaign only count for an item from the campaign (by its item level; currency and cards count as maps).
- **Show all currency** (a button on the Currency page of the Loot filter): for the league start, every currency tier shows, also the ones your filter hides (Portal and Wisdom scrolls, Augmentations…) or switched off for your strictness, each with its own look. Press it again to go back to your filter's choices.
- **Scarabs are gone from the Loot filter list** (and from Price review), as they leave the game. Your filter's own scarab rules stay as FilterBlade wrote them.
- **Regex: Magic item mods** (was Item mods), redone for rolling magic items: pick the item type (and for armour the defence: Armour, Evasion, Energy Shield or a mix; every base of one type rolls the same mods) and tick any of T1 to T4 of the mods you want. The search uses the mods' names, which a magic item has in its own name ("Searing Goat's Horn of Success"), and the item must have every mod you tick. No item level or match options any more, and searches can be saved like the map ones.
- **Folded category list: subcategories open in a small menu** next to the icon you click (a little corner mark shows which icons have them). Esc or a click elsewhere closes it.
- **Atlas and Hideout: dropdown lists are readable** (they opened light grey with light text).
- **Regex: Beasts has no red / yellow choice any more**: every beast you can capture is a red beast now.
- **Hide item types: "Rapiers (thrusting swords)"** is spelled out, and every button shows a few example bases when you hover it. Rusted Spike and the other rapiers are their own item type in game, so One Hand Swords doesn't hide them.
- **WealthyExile shows the missing pictures:** gems, astrolabes, runegrafts, essences, divination cards and the rest now look in the right poe.ninja list, including items that have no price right now.

## 1.0.22 - 2026-11-06

- **Campaign → Hide item types** (new, in the Loot filter list): click the item types your build doesn't use (claws, wands, shields, body armours…) and their normal and magic drops are hidden while you level. Greyed out = hidden, click again to show. Choose up to which area level (67 = the whole campaign), keep linked items (4-links and more by default), and hide rares of those types too if you like.
- **Base ranks → Hide whole groups is a switch now.** A hidden group is greyed out; click it again and every base gets back the rank it had (bases that are also in another hidden group stay hidden with it). This replaces the Undo button and is remembered.
- **Regex: Item mods.** Pick an item class, a base and its item level (and up to two influences) to see every prefix and suffix it can roll with their tiers. Click the mods you want, pick "T3 or better" and the like, and choose Any one of them, All of them, or A prefix and a suffix. The string lights up the item in your stash search while you roll it. All mods of gear, flasks and jewels come with the app (from the game data).
- **Regex: Beasts.** Search strings for the beasts you want in the Bestiary or among itemised beasts in your stash: red (recipe), yellow and Harvest beasts, a price range from poe.ninja, family and group, and a click on any beast adds it or leaves it out. Each beast gets the shortest piece of its name no other beast has; when they don't fit in one search (250 characters) you get several to copy one after another.
- **Regex sits right below WealthyExile** in the menu.
- **Atlas is the default look now.** You're switched to it once with this update (if you picked Hideout, you keep it). Dark is still in Settings → Appearance.
- **Fold the Loot filter's category list down to its icons** with the « button next to the search box (» brings the names back). Hover an icon to see its name; a click opens that category (the subcategory you were on, or its first one). The app remembers your choice.

## 1.0.21 - 2026-11-06

- **Two new looks, Hideout and Atlas** (Settings → Appearance, or the three dots at the bottom of the menu). Hideout is dark stone with bronze trim and gold headings; Atlas is night blue with silver-blue trim. Both use the game font for headings and buttons. Dark stays the default, and items keep the colours your filter gives them.
- **Cards & gems sit right below Fragments** in the Loot filter list.
- **Abyss jewels in parts like normal jewels:** Normal, Special (corrupted) and Levelling, with the four abyss jewels as tick boxes. Jewel tiers only show the item level slider (no area level or quality).
- **The area level slider is only on campaign tiers** (levelling flasks, rares, currency, gems…), where it sets the area level they stop at; endgame tiers (flasks, tinctures, RGB, maps…) don't show it.
- **Settings: Updates sit right below Requests**, so Check now is in view straight away.
- **Rares, Crafting bases and Special bases moved to Miscellaneous** at the bottom of the list (Base ranks does most of that work now).
- **Gems, FilterBlade style:** Generic first, then Special, then Exceptional. Each page is in FilterBlade's sections (gems with gem levels, with quality, +1 gems, the campaign; top gems; the exceptional tier list S/A/B/C; transfigured and special cases), the tiers have FilterBlade's names (Level 21+, Level 20, Level 18-19, Level 2-17, Quality 23%+…), and gem level, area level and quality have sliders. Tiers without a list show a gem (Blight) instead of the category name.

## 1.0.20 - 2026-11-06

- **Base ranks: the kinds of drop are Rares, High ilvl bases, Fractured and Influenced**, in that order, and all start at "All ranks". Synthesised items are left to your filter. ("Crafting bases" is now called High ilvl bases.)
- **Base ranks: more views**: Caster weapons (wands, sceptres, staves), Melee weapons (axes, swords, claws, rapiers, maces, daggers), Bows (bows and quivers) and Minion (Convoking Wand, Bone Helmet, the spirit shields…). They're for looking only: every base keeps its one rank.
- **Share your loot filter settings** (Settings): Export saves everything you set up for the filter (tiers and looks, base ranks, my bases, clusters, your rules, category prices, the tier designer and your own drop sounds) to one file. A friend presses Import and gets your setup; their account, league and filter file stay theirs, and Undo import brings their own back.
- **Divination cards: Stacked cards are their own subcategory** instead of sitting above Tier 1.
- **Set category prices**, on every priced category's page: the Price review table (a price per tier, Include, the moves it suggests) for that category only, right above its tiers. ("Auto-tier…" used to take you to the Price review tab.)
- **Tiers show the price you set** ("39 bases, 20d+") instead of the typical price, once you've typed one.
- **Special bases: the Fractured part is gone from the list**; Base ranks decides fractured items.

## 1.0.19 - 2026-11-06

- **Jewellery ranks fixed.** They were one rank off: Vermillion, Amethyst, Prismatic, Two-Stone Ring, Onyx, Agate, Citrine, Turquoise Amulet and Stygian Vise are S; Cerulean, Steel, Diamond Ring, Heavy Belt, Bone Ring and the rest of that list A; Seaglass Amulet, Gold Ring, Chain Belt, Rustic Sash… B; nothing in C; the rest D.
- **Stygian Vise is a belt** on the Base ranks page (it was listed with the amulets).
- **Base ranks: always sorted by rank.** Every column shows S first and D last.
- **Regex: map types are left out of the stash search.** Shaper, Elder, Conqueror, Originator and blighted maps have their own sections in the map stash, so the search is shorter; they still go into the trade search.
- **Flasks and tinctures, FilterBlade style.** Their tiers show item level, area level and quality (at least / at most / exactly / any, with a slider), rarity, and their bases as boxes you can untick. Tincture and flask labels show a real item instead of the category name.
- **Tiers FilterBlade left empty take items again** (Tier 1 of essences, say): drag or add items into them; an empty one never catches everything.
- **Flasks & jewels are no longer in Base ranks** either.
- **Heist and Ritual bases are no longer in Base ranks**: your filter's own Heist and Ritual settings show them.
- **No separate Minion tab**: minion bases are in Armours and Weapons or Jewellery; "All minion bases" in Hide whole groups still hides them all.

## 1.0.18 - 2026-11-06

- **WealthyExile works again.** The page stayed empty since 1.0.15 (a part it needs went missing when the Price check history page was removed).
- **Base ranks: Armours and Weapons, Jewellery and Minion.** Three tabs on the page. Jewellery starts from the usual ranking (Vermillion, Amethyst, Two-Stone… S; Cerulean, Steel, Vanguard Belt… A; Gold Ring, Chain Belt, Rustic Sash… C); rings, amulets and belts you ranked yourself keep their rank. Minion shows the minion bases (Convoking Wand, Bone Helmet, Bone Ring, the spirit shields…) with their rank.
- **Hide whole groups, rearranged:** Off-hand (Shields, Quivers), one-handed and two-handed weapons, All minion bases, and armour bases by defence.
- **Base ranks: an item level for every kind of drop.** Fractured, Synthesised, Influenced, Crafting bases and Rares each have an "Item level ≥" slider (and a box to type it); 1 means any.
- **The loot filter file options moved to Settings** (Loot filter file): the filter you build on, Write filter, rewriting on a new download and the filter folder.
- **Loot filter: nothing is pinned by default.** Currency, Divination cards, Scarabs and Uniques are no longer pinned for you; pin what you like.
- **Regex: the search is always your whole setup.** Every wanted mod and every number you fill in must be on the map, together with the mods you skip; the "Any one / All" switches are gone.
- **Regex: Shaper, Elder, Conqueror, Originator, Blighted and Blight-ravaged maps are skipped by default**, with a line between them and the map's rarity.
- **Regex: favourite mods.** Click the star of a mod to keep it at the top of the list in every search (it isn't skipped or wanted by that).
- **Updates install without the installer window.** After you press Restart to update, the new version installs quietly in the same folder and the app opens again by itself. (This update itself still shows the window one last time.)

## 1.0.17 - 2026-11-06

- **Regex: "Reach all / Any one"** replaces the "Any one is enough" switch in Numbers, so it's clear the map must reach every minimum unless you pick Any one.
- **Regex: "Skip all shown" and "Unpick shown" are gone.**
- **Base ranks: hide whole groups.** Move all shields, a weapon type (all staves, all bows…) or the armour bases of one defence (all pure Armour, all Armour / ES…) to D in one click, with Undo.
- **Regex: saved searches can be changed.** Load one, change what you like and press Update; Save as new keeps it under another name. Delete works on the loaded one (it didn't before).

## 1.0.16 - 2026-11-06

- **Base ranks have five ranks and start from the usual ranking.** S, A, B, C and D (untiered, the lowest and the default). Every base starts where FilterBlade's ranking puts it (Royal Plate S, Vaal Regalia B…); Reset all brings that ranking back. "All ranks" is now D and up, and "C and up" is new.
- **Regex: Nightmare maps.** Tier 17 maps are called Nightmare maps now. They're always rare and never influenced, so those choices are left out for them; corrupted and identified still apply.
- **Regex: the quality box is gone**, and the Nightmare mods of regular maps are called Originator mods, so they aren't mixed up with Nightmare maps.
- **Regex: saving a search works.** Type a name next to the Save button.
- **Regex: quick buttons for the trade search**: Tier 16 and 8 mods, instead of typing them.

## 1.0.15 - 2026-11-06

- **New Regex page, starting with Map mods.** Click the mods you can't run to skip maps with them (right click the ones you want), set the quantity, rarity, pack size, more maps / currency / scarabs / divination cards and quality you want, pick the map type, rarity, corrupted and identified, and copy the search for the stash or map device box. One short piece covers several mods where it can (every curse in one), and it warns you past the game's 250 characters. Regular and Tier 17 maps each have their own list; Nightmare mods can be shown too. Save your searches by name.
- **Buy maps like these:** the same choices as a trade site search (instant buyout, cheapest first, the tier you pick), opened in your browser, including more maps / currency / scarabs / divination cards, and "at least 8 mods" for fully rolled maps.
- **Map warnings are gone**, from the overlay and from Settings, with their saved list.
- **Base ranks** replace the base visibility table. Every base has a rank, S (best) to C (the lowest and the default). Left click a base for a rank up, right click for a rank down, or drag to paint with the S/A/B/C brush, just like the cluster jewel grid.
- **Lowest rank shown, per kind of drop**: Fractured, Synthesised, Influenced, Crafting bases (normal and magic at item level 82+, adjustable) and Rares each pick S only, A and up, B and up, all ranks, hide all, or leave it to your filter. "Rares: S only" with "Fractured: B and up" hides a B rank Vaal Regalia as a plain rare but shows it fractured. Uniques and 6-socket items are never hidden by this.
- **Show by rank**: one column per rank for the bases you're looking at, or "All bases" to see every base by rank, so you can see what's in and what's out.
- **Rank by base order** ranks every column in one go (best base S, next two A, next two B, the rest C).
- Your old fractured choices move over: the top look becomes S, the fractured look B, and Fractured is set to "B and up".
- **Tier 1's border is the colour of its text** instead of white, on the white Tier 1 label (your themes and filter are updated once). The "Keep white with the Divine sound" switch is gone: Tier 1 always keeps the white look and FilterBlade's sound; you still pick its text colour and size.
- **Game sound previews moved to the Tier designer**, below the design, where you pick the sounds.
- **The Price check history page is gone from the menu.** Your recent checks are on the Overview.
- **Daily lab works when poelab turns the app away.** poelab is behind Cloudflare, which sometimes answers plain requests with "poelab answered 403" (a new PC or network, say). The app now opens poelab like a normal browser instead, in a hidden window. If Cloudflare wants you to tick "Verify you are human", that window shows itself for you to click, then closes. The pass is kept, so it's needed only now and then.

## 1.0.14 - 2026-11-05

- **The category list really stays put now.** Opening Cluster jewels, Base visibility or Your bases showed an empty page for a moment while their data loaded, which threw you back to the top. The new page is now built first and swapped in at once, so the list on the left stays exactly where it was.

## 1.0.13 - 2026-11-05

- **WealthyExile is a dashboard.** Your worth by category (Currency, Scarabs, Divination cards, Uniques…) as cards with pictures, value, share and their top items; click one to list only its items, or search. Every item shows its picture, amount, price each and value, and your tabs are compared as bars. New snapshots keep each item's picture from your stash.
- **Loot filter: the add box only takes items of that category.** Typing in Delirium suggests delirium orbs, not every item in the game; a name from another category is refused, with the closest matches to pick from.
- **Loot filter: the category list stays on screen.** It's pinned to the top while you scroll the tiers, so picking a category (Belts, say) no longer throws you back up the page; the new category opens at the top of its tiers.
- **Fractured bases have their own palette.** A new top look for the best fractured bases (big, orange beam, star), next to the fractured look. In Base visibility, "Fractured: keep only the best" sets it all at once: in every column the 2 best bases get the top look, the next 3 the fractured look, and the rest are hidden when they drop fractured. There's a "Fractured: top" brush too. Plain copies are left alone, so you can hide a base and still see it fractured.
- **Cluster jewels: left and right click.** Left click moves a cell one step up (hidden → filter decides → good → top), right click one step down; an enchantment or a passive count does it for the whole row or column. Dragging still paints with the brush.
- **Tier designer: 8 more themes and Random.** Rose gold, Emerald, Arctic, Toxic, Royal gold, Crimson night, Sunset and Cyber, plus a Random card that rolls a new colour palette each time; Save as theme keeps one you like.
- **Settings: map warnings can be deleted,** one by one or all at once, and the usual list can be brought back.
- **Settings: Updates come before the patch notes.**
- **Reset everything.** Settings → Start over puts every look, tier, base, cluster, sound, hotkey and setting you changed back to a fresh install, and rewrites your filter to match. Your account, league, filter choice, history, net worth, saved themes and game sound copies stay. It can be undone once.
- The GitHub test build writes its release notes first, so it no longer fails.

## 1.0.12 - 2026-11-05

- **Tier designer: no more jumping to the top.** Changing a sound, colour or anything else keeps you where you are on the page.
- **Tier designer: no Apply button any more.** "Use this theme" puts the theme into every category of your filter straight away, and your changes to a tier go in by themselves a moment after you make them. "Undo last change" and "Save as theme" stay.

## 1.0.11 - 2026-11-05

- **Hear the game's own drop sounds.** PoE Helper finds your Path of Exile install and makes preview copies of its item filter sounds: Game sound 1 to 16 and the named ones (ShDivine, ShMirror, ShExalted…). Every ▶ for a game sound now plays the real sound, in the price check, the Loot filter page and the designer. It happens by itself at start, again after a game patch, and from Settings → Game sound previews ("Find my game", or pick the folder if it's somewhere unusual). Nothing from the game comes with the app: each PC makes its own copies from its own install. Your own recordings still work and take over where you added one.

## 1.0.10 - 2026-11-05

- **Corrupted 8-mod maps show their real look in the price check.** NeverSink gives corrupted maps with 8 or more mods a purple look; the app counted the rule's search letters instead of the map's mods, so it showed the plain tier look. The tier's rule now reads "corrupted and identified and 8 or more mods".
- **Giga and Big belts are back.** Resetting a category (or everything) also wiped the app's own tiers in every other category, and they were never made again. They come back once now, and a reset only touches the categories you reset: resetting Currency or Uniques brings back the default Giga or Big belts tier. A tier you delete yourself stays deleted.

## 1.0.9 - 2026-11-05

- **Fixes the empty window in 1.0.8.** A typo in the Tier designer page stopped the app's pages from loading, so the window stayed blank. Everything from 1.0.8 is still in.

## 1.0.8 - 2026-11-05

- **Tier 1 currency has FilterBlade's Divine sound again.** Themes had replaced it with the app's own "Divine tink" file; Tier 1 (and Giga) now play the game's alert sound 6, the sound FilterBlade gives your top currency. Your current filter and your saved designs are switched over once.
- **Items you hid can be brought back from the price check.** An item you hid with Hide used to say it "isn't in any tier" and offer unrelated tiers. Now it says it's hidden by you and lists every tier of its category, the one your filter had it in first; "Show here" puts it back.
- **Maps show their real tier in the price check.** The game now writes a map's tier only in its name ("Map (Tier 16)"), so the app read every map as having no tier and showed "Everything else". It reads the tier from the name now.
- **Unidentified items.** The price check offers only the mods you can see (implicits and enchantments), and has a new "Identified or not / Identified only / Unidentified only" choice, set to Unidentified only for an unidentified item. The map help text ("Travel to a Map of this tier or lower…") is no longer listed as a mod.
- **Forbidden Shako can be price checked by its supports.** The list of possible gems the advanced copy adds after each support ("Ice Bite(Greater Multiple Projectiles-Hallow)") is left out, the supports are searched with the trade site's support stats, and they're ticked from the start at your gem level or higher.

## 1.0.7 - 2026-11-05

- **Menu with game pictures.** Overview: Exalted Orb, Loot filter: Chaos Orb, Price check history: Mageblood, WealthyExile: Divine Orb, What to farm: Mirror of Kalandra, Daily lab: Offering to the Goddess, Tier designer: Orb of Alteration, Settings: Blacksmith's Whetstone. "Price check" is now "Price check history" and "Net worth" is "WealthyExile".
- **Expedition has its own category** under League mechanics, below Delve, with the logbook picture: Expedition currency (Astragali, Exotic Coinage, Scrap Metal, Burial Medallion), its big and small stacks, and Logbooks. The currencies still sit in your filter's currency tiers, so moving one there moves it in Currency too.
- **Mirrors no longer look like Divines.** The Giga tier takes Tier 1's look reversed: Tier 1's colour as the background with gold text and border, a beam and star in that colour and its own sound. It follows every theme, and the theme previews show it. Before, both were the same white label.
- **One Cluster jewels entry.** It opens the enchantment grid; "Edit the size looks" there opens the size tiers ("Large: the rest" and so on).
- **The cluster tables line up:** the passive columns of the large, medium and small tables sit under each other.
- **Readable tier names everywhere.** Every tier of the filter has a proper name now, like "4-link rares", "Corrupted maps", "Tier 1, item level 86+" or "12 passives, item level 84+: top", instead of ids like "Fourlinkedrares". The price check uses the same names as the Loot filter page.
- **Price check: moving an item to another tier.** The tier list shows each tier's typical price ("Tier 2, typically 46c"), picking a tier shows its look on the item at the top, and after Move the popup stays open with the item in its new look.
- **Price check: maps by tier.** A regular map like Map (Tier 16) shows the tier that takes it by map tier, with a button to hide or show that tier, instead of offering an unrelated tier like Valdo's maps.
- **Mageblood can be price checked by its flask count.** "Leftmost 4 Magic Utility Flasks…" didn't match the trade site, which writes it in the singular; mods now match whether singular or plural. On Mageblood it's ticked from the start, at exactly your number.
- **Price check: implicits from Ctrl+Alt+C.** Mods under an implicit header (like a corruption implicit "+1 to Maximum Frenzy Charges") are searched as implicit mods, not explicit.
- **Expired website login: click to log in again.** When pathofexile.com no longer accepts your login (GGG answers 403), you get one message instead of one per snapshot. Click it and the login window opens; the snapshot runs again as soon as you're logged in.
- **The price check stays open on the way to it.** Passing over other items while you move the mouse to the popup no longer closes it; it closes when the mouse is far from both the item and the popup, or when you click elsewhere.

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
