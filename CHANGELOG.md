# Patch notes

Newest first. Each `## <version> - <date>` section is shown in the app (Settings → Patch notes)
and used as the text of the GitHub release, so write it for players. Lines starting with `* ` are the short
"What's new" list shown after an update (only what a player needs to know); `[Place]` at the start adds a
button to that page. Lines starting with `- ` are the full notes.

## 1.0.124 - 2026-11-16

* [Trade searches] Twice corrupted items are price checked as twice corrupted, by their corruption implicits.
* [Trade searches] The trade site's new long search links can be saved.
- Price check: "Twice Corrupted" items were read as not corrupted, so the search looked for uncorrupted ones and the flavour text showed as mods. They are now searched as twice corrupted (the trade site's own filter), with their corruption implicits ticked.
- Price check: an identified unique is no longer searched from its item level up; it only hid cheaper listings.
- Trade searches: the trade site's newer long links (…/trade/search/Covens/H4sI…) can be saved. The search is read from the link itself, without asking GGG, and the item's name is used when you don't give one.

## 1.0.123 - 2026-11-16

* [Trade searches] Imbued gems are now searched with their support; the trade site showed it as "Unavailable Stat" before.
- Price check: an imbued gem's support was sent to the trade site in a form it didn't know ("Unavailable Stat"). It is now sent as the site's own "Imbued" stat.

## 1.0.122 - 2026-11-16

* [Trade searches] Imbued gems: the built-in support is now found on the trade site, so it can be ticked.
- Price check: an imbued gem's support could show greyed out ("can't be searched") when the game's copy had odd spaces or link marks in it. It is now matched loosely, by the support's name.

## 1.0.121 - 2026-11-16

* [My collection] Uniques you don't have yet are no longer hidden by your filter's cheap unique tiers.
- Loot filter: FilterBlade hides cheap unique tiers by base (Lakishu's Blade on an Elegant Sword at Semi-Strict). With a unique collection, a base that has a unique you don't have yet is now shown with the same look. It goes by base: another unique on that base shows too.

## 1.0.120 - 2026-11-16

* [Trade searches] Imbued gems can be price checked: the search finds the same gem with the same built-in support.
- Price check: an imbued gem's built-in support ("Supported by Level 1 Spell Echo") is read, shown under "Imbued support" and ticked, so the search finds the same gem with that support. Its poe.ninja price is the one for that support, not another one.
- Price check: league mods the trade site lists on their own (veiled, mercenary, imbued, Delve) are now shown in the price check; before, they were searched but not shown.

## 1.0.119 - 2026-11-16

* [Trade searches] A map's yellow mods (Area contains an Evocator of Ghorr, a buried Apex Sentinel, a Mirage…) are always ticked in the price check.
- Price check: every "Rare-only" map mod (the yellow line on the map) starts ticked, since it's what the map sells for. Before, only the Mirage was.

## 1.0.118 - 2026-11-16

* [Tier designer] 6-socket items always use FilterBlade's white look, whatever design you pick.
* [Rare looks] Magic items are now shown in the game's magic blue, like rares in yellow.
- Loot filter: 6-socket items (the 7 Jeweller's Orbs vendor recipe) keep FilterBlade's white look (white text and border on grey, grey beam and minimap hexagon) in every Tier designer theme, so they don't pass for a rare or currency.
- Rare looks: with Game rare yellow on, magic items get the game's magic blue (blue text or label, blue beam, blue circle on the minimap). FilterBlade's gear and crafting base rules take normal, magic and rare items in one rule; a magic-only blue copy now goes before each, stronger for better ranks and higher item tiers. "My theme's colours" turns it off.

## 1.0.117 - 2026-11-16

* [Rare looks] Rares are now shown in the game's rare yellow, so they never look like currency or fragments. Better ranks and higher item tiers get a stronger yellow, a beam and a yellow diamond on the minimap.
* [Base ranks] High ilvl bases now also hides unidentified magic and normal items without an item tier, below the rank you pick.
- Rare looks: new "Rares" choice: Game rare yellow (new default) or My theme's colours. Plain rares, with or without an item tier, use the yellow; the base rank sets how strong it is and the item tier makes it louder (Tier 4 and 5 of the best ranks get a beam). Untiered rares are a step quieter. Influenced, fractured and other rares keep your theme.
- Base ranks: an unidentified magic or normal item without an item tier (like a magic Majestic Pelt) was left to FilterBlade. Your High ilvl bases choice now hides its lower ranks too.

## 1.0.116 - 2026-11-16

* [Base ranks] Untiered now really hides unidentified rares without an item tier, below the rank you pick.
- Base ranks: the 1.0.115 rule for unidentified rares without an item tier matched nothing in game. It now sits right after FilterBlade's item tier rules, so it only takes what those leave.

## 1.0.115 - 2026-11-16

* [Base ranks] Untiered now also hides unidentified rares that have no item tier, below the rank you pick.
- Base ranks: an unidentified rare with no item tier (its copy says "Unidentified", not "Unidentified (Tier 3)") was left to FilterBlade, because no item tier choice takes it. Your Untiered choice now hides its lower ranks too.

## 1.0.114 - 2026-11-16

* [Trade searches] Maps with "Area contains a Mirage" are searched with the Mirage ticked.
* [Trade searches] Fractured mods on magic items are searched as fractured, and fractured mods show in the game's fractured colour.
* [Base ranks] Changing an item tier no longer widens the lower tiers: a tier set to Nothing stays Nothing. Tier 0 is now called Untiered.
* [Trade searches] Price check shows cluster jewels with the same loot filter look as in the game.
- Price check: the loot filter look of a cluster jewel now reads its number of passives and its small passive kind (for example "Attack Damage while Dual Wielding"), as the filter does.
- Base ranks, Unid item tier: a choice only narrows the lower tiers that show more than it. Setting Tier 5 to Only S leaves a lower tier at Nothing; setting Tier 1 to Nothing sets Untiered to Nothing too.
- Base ranks: Tier 0 (rares without an item tier) is renamed Untiered, here and on the price check.
- Price check: a Wickerman buff with a fixed number in its text ("…in the past 2 seconds", Greater Golemic Stone) is searched without that number as a minimum.
- Price check: a fractured mod copied with Ctrl+Alt+C ("{ Fractured Suffix Modifier … }") was read as a normal mod, so a fractured magic item was searched without its fractured mod. It is now searched as fractured.
- Price check: fractured mods are shown in the game's fractured colour, with a small "fractured" mark.
- Price check: a negative "damage taken" roll (Lesser Poacher's Leg: "-25 Physical Damage taken from Hits by Animals") is searched as a maximum, since lower is better. It used to find worse rolls too.
- Price check: "Area contains a Mirage" on a map is ticked, like the map's influence.
- Price check: when a mod isn't in the trade site's mod list (often a mod new this league), the app gets a new list, at most once a day.

## 1.0.113 - 2026-11-16

* [Trade searches] Wickerman parts are searched by their buff as an implicit, as the trade site lists them.
- Price check: a Wickerman part's buff (Hydra's Head: "Arrows Pierce all Targets after Forking") was searched as an explicit mod, so the search found nothing. It is now searched as an implicit.

## 1.0.112 - 2026-11-16

* [Trade searches] Wickerman parts like Greater Golemic Stone can be price checked.
- Price check: Wickerman parts are searched by the name the trade site uses. Some, like Greater Golemic Stone, are listed by their full name, others ("Hag's Stomach") without Lesser / Greater.
- Price check: a long Wickerman buff that the game copies on two lines is shown as one line.

## 1.0.111 - 2026-11-16

* [Trade searches] Price check finds the gem on Replica Dragonfang's Flight (and other "+3 to Level of all … Gems" items) and searches for it.
- Price check: "+3 to Level of all Purity of Elements(...) Gems" was not recognised because of the "(...)" the game adds. It is now read, shown and ticked, since the gem sets the price.
- Price check: on Replica Dragonfang's Flight every one of the 287 gems is searched with the trade site's own Dragonfang stat. Raise Spectre and Raise Zombie used to search a different item's stat, and Kinetic Fusillade (listed twice on the trade site) now finds either.

## 1.0.110 - 2026-11-16

* [Trade searches] Price check shows the 3 cheapest listings first. Click Show more to see the rest.
- Price check: the loot filter line (Shown · …) moved to the bottom, under the search.
- Price check: the results show the 3 cheapest listings, with a Show more button for the rest.
- Price check: a long seller name is cut short (hover it for the whole name) instead of pushing the window wider and cutting off the buttons on the right.

## 1.0.109 - 2026-11-16

* Price check: the base, item level and defences (or a weapon's DPS) are at the top, and ticked when a defence mod is tier 2 or better

- Price check: the base, the item level and Armour / Evasion / Energy Shield at 20% quality (or a weapon's DPS) are the first lines, above the totals and mods.
- Price check: mods with fixed numbers in their text read the right value: "6% increased Elemental Damage per 1% … above 75%" is searched as 6, not 27.3 (the average of 6, 1 and 75).
- Synthesised items ("Synthesised Void Sceptre", like Nebulis) are read as their base (Void Sceptre) plus synthesised, so the loot filter and the trade site find them.
- Price check: the defences start ticked when the item has a tier 1 or 2 defence mod; otherwise unticked (they said little about the price).
- Price check: Linked sockets only shows on body armours and two-handed weapons, and the "Rare items only" line is gone (rares are searched among rares and magic items of the base, as before 1.0.104).

## 1.0.108 - 2026-11-16

* [Loot filter] "Update prices" button: see what would move at today's prices, one category at a time, and apply it

- Loot filter: an "Update prices" button next to the Tiers / Price review / Check an item tabs opens a popup with every change poe.ninja's prices suggest. Pick a category (Currency, Divination cards, Fragments…) to see only its changes, untick what you want to keep, and apply them.
- Price review: the same category chips at the top; Apply moves only the category you're looking at.
- Price check: fragments the currency exchange doesn't list (Blood-filled Vessels) get the normal trade search by name instead of an empty exchange search.

## 1.0.107 - 2026-11-16

* [WealthyExile] Fixed: items listed under the wrong stash tab, and tabs read wrongly after you moved tabs
* Price check: search results show at the top, no scrolling needed
* [Loot filter] Cleaner tiers: prices and arrows only show when you press Check prices; a price update shows one short list of what moved

- Price check: the search results show at the top, right under the item, and the window scrolls up to them when you search from further down.
- WealthyExile: Income / d is the change over the day before each snapshot, and only shows once snapshots are an hour apart (no more one-dot charts); a session's profit per hour shows after half an hour. The time labels under a chart no longer pile up when the snapshots are minutes apart.
- Midnight look: "PoE Helper" in the top left uses the game font, as in Atlas.
- Loot filter: the tiers show just the items. Prices, ▲/▼ and price-spike badges, and the "items priced like a different tier" bar only show after Check prices (or Review suggestions).
- Loot filter: after a price update (Apply all price changes, or the automatic one) a short card at the top lists what moved: the item, its old tier → new tier, ▲ or ▼ and its price, most valuable first. Undo puts them all back; ✕ hides the card until the next update.
- Loot filter: Divination Cards have Check prices and Set category prices too, like currency and fragments.
- WealthyExile: the tabs you track are remembered by GGG's tab id, not by their position, and each snapshot reads the tab list as it is now (1 more request, none if the list is less than a minute old). Before, moving or adding a tab made a snapshot read the wrong tabs and put items under the wrong tab names. Snapshots taken before this keep their wrong tab names; the next ones are right.

## 1.0.106 - 2026-11-16

- Price check: every Ritual base is searched by its base and implicit only, the helmets (Blizzard Crown, Archdemon Crown, Sorrow Mask…) and gloves (Nexus, Aetherwind and Leyline Gloves) as well as the boots.

## 1.0.105 - 2026-11-16

* Item pictures on Base ranks, in the loot filter's tiers and in the price check
* Price check: a cleaner window with the price big in the header, the loot filter in one line, and Search always in reach
* Price check: each mod shows its tier (T1 best); listings get a Whisper button
* Hover a chart point for its value and time; dark dropdowns and tooltips everywhere; a cleaner Loot filter page

- Price check: the price is big at the top right with how sure it is (plenty / some / few listings); the item's picture is on the left; a thin line on top in the item's rarity colour.
- Price check: the loot filter is one line ("Shown · Currency, Tier 1") with Change (moving or hiding the tier) and Show in loot filter; the tier controls only open when you want them.
- Price check: the Search row stays at the bottom of the window while the mods scroll; Enter searches; smaller min / max boxes, so more fits without scrolling. The sound in the header is just its ▶ (its name is in the tooltip).
- Price check: with the Ctrl+Alt+C copy every mod shows a tier badge (T1–T2 blue, T3–T4 grey, T5 and lower orange).
- Price check: each listing has a Whisper button that copies the message to the seller.
- Charts (WealthyExile, Overview, What to farm): hover for the exact value and time of a snapshot.
- Look: dropdowns and hover tooltips are dark, matching the app, instead of the plain Windows ones.
- Loot filter page: plain section titles, tier cards with more room and softer edges, item chips in the new style, and the category list stays in view while you scroll.
- Price check: Ritual boots (Stormrider Boots, Brimstone Treads, Dreamquest Slippers and the rest) are searched by their base and implicit only; their other mods and evasion start unticked.
- Price check: corpses are searched by their name only, without their monster mods or item level.
- Item pictures: every base on Base ranks, every item in the loot filter's tier lists and the item in the price check's header show their picture (from GGG's image server, found through poe.ninja's lists). Items poe.ninja has no picture for show without one.

## 1.0.104 - 2026-11-16

* Price check: jewels count 2 prefixes and 2 suffixes, every mod can be ticked where it is, and "rare" in the header ticks "Rare items only"
* Cleaner pages: explanations are behind a small ⓘ, with the same header and spacing everywhere

- Price check: jewels show "1 of 2" prefixes / suffixes (magic items 1, other rares 3).
- Price check: mods in the Prefixes and Suffixes lists are normal tick boxes again, also the ones counted in a total.
- Price check: the "prices from…" and "Tick the mods…" lines are gone; All / none sits next to Search.
- Price check: clicking "rare" in the header ticks "Rare items only" (else magic items of the base count too).
- Midnight look: buttons have a dark textured look instead of white; the main buttons have a blue edge.
- Look: every page has the same clean header; its explanation is behind a small ⓘ (hover or click it) instead of a paragraph on top. Long section explanations went behind an ⓘ too.
- Look: one spacing and heading style on every page, wider pages on big screens, line icons instead of symbols on WealthyExile, and a short fade when you switch pages.
- Look: prices show as a bold number with a small grey unit (12.4 div), changes as small blue / orange pills with + or −; trade listings are small cards; cards lift a little under the mouse; loading shows a soft placeholder instead of a line of text.

## 1.0.103 - 2026-11-16

* [WealthyExile] New look: net worth chart with your sessions, a categories donut and every item with its stash tab
* [WealthyExile] Sessions: start one before you farm and see its profit, profit per hour and what each tab gained
* [Settings] New Midnight look: darker and more modern (the old looks are still under Appearance)
* [Rare looks] A higher item tier always looks more expensive; Tier 0 rares show their rank in the border

- WealthyExile: a bar on top with the league, last snapshot and session; the net worth chart (or income per day) shows your sessions as bands; categories as a donut or a list (click one to list only its items).
- WealthyExile: the items of the last snapshot in a table you can sort, search and filter by stash tab, with each item's tabs shown. New snapshots remember the tabs; older ones don't.
- WealthyExile: "Start session" takes a snapshot and starts counting; pick a session to see its profit chart, profit per hour, time played and the change per tab. "Stop session" takes the last snapshot.
- WealthyExile: tracked tabs, automatic snapshots and deleting history are under the ⋯ button.
- The app has a new default look, Midnight: near black, neutral greys, clean text and rounded cards. Atlas, Hideout and Dark are still in Settings → Appearance.
- Rare looks: rares without an item tier (Tier 0) no longer copy the item tier looks. They get the quiet "any base" look, and their rank shows in the border: gold for rank S, silver for A, grey for B (S and A keep a minimap icon). So an item tier 5 always looks more expensive than any Tier 0 rare. "Use my theme's colours" does the same.

## 1.0.102 - 2026-11-15

- My collection: "Tick from my Unique stash tab" finds your PoE Ladder ladder when the league's names differ ("Covens" on poe.ninja is "Covens of Umbra" on PoE Ladder).

## 1.0.101 - 2026-11-15

* Price check: conqueror maps (Al-Hezmin's, Baran's, Drox's, Veritania's Citadel) search by their citadel
* Price check: magic items are compared with magic ones of the same base, at their own roll

- Price check: a map that contains a conqueror's Citadel is searched with that Citadel ticked. Its two lines are one mod on the trade site, so it couldn't be ticked before.
- Price check: magic items search their real base ("Vivid Crimson Jewel" is a Crimson Jewel), magic only, with their mods ticked at the roll they have (7% maximum Life is searched as 7% or more).

## 1.0.100 - 2026-11-15

* [Base ranks] Fated rares follow your Tier 0 rank choice, identified or not

- Base ranks: fated rares on bases below your Tier 0 rank are hidden now, unidentified ones too. Before, only identified ones were, so unidentified fated rares on any base still showed.

## 1.0.99 - 2026-11-15

* Price check: corpses and Wickerman parts can be price checked

- Price check: Necropolis corpses get their poe.ninja price and a trade search (by name and item level).
- Price check: Wickerman parts search by their plain name ("Greater Hag's Stomach" is a "Hag's Stomach" on the trade site) with their buff ticked; before, the site said the item didn't exist.

## 1.0.98 - 2026-11-15

* [Base ranks] Veiled rares have their own row, like Fractured and Influenced: pick the lowest rank to show

- Base ranks: a new "Veiled" row for identified rares with a veiled mod. Pick the lowest rank you want to see (all ranks at first); they show in your filter's veiled look, and lower ranks are hidden.

## 1.0.97 - 2026-11-15

* Gold has its cross on the minimap again
* [My collection] "Tick from my Unique stash tab" now works: it reads your Unique tab through PoE Ladder (join poeladder.com once)

- My collection: GGG only shows the Unique tab to sites it approved, so the button now asks PoE Ladder (poeladder.com), which reads it with your permission. Join PoE Ladder once with your Path of Exile account and your league's ladder; after that one click ticks every unique you have. No request to GGG.
- Loot filter: gold's minimap icon is a cross again (it had become a circle, the same as currency).

## 1.0.96 - 2026-11-15

* [Base ranks] Unid item tier: a choice is copied to every lower tier, so making Tier 5 stricter is one click

- Base ranks, Unid item tier: picking which bases a tier shows now sets the same for every lower tier (Tier 0 too). Before, a higher tier couldn't be made stricter until the lower ones were changed first.

## 1.0.95 - 2026-11-15

* [My collection] "Tick from my Unique stash tab" ticks every unique you have in your Unique tab and hides the cheap collected bases

- My collection: a new button reads your Unique stash tab on pathofexile.com (with your login from Settings) and ticks every unique in it. It only adds ticks, never removes one. Bases where you now have every unique and none is worth much are hidden in your filter right away (if "Remove not valuable from loot filter" is on).

## 1.0.94 - 2026-11-15

* Price check: Exarch / Eater implicits and mods like item rarity no longer start ticked
* Price check: mods are split into prefixes and suffixes, the search comes first, and the header facts (item level, base, links) tick that part of the search when clicked
* Price check: veiled mods can be searched
* Chat macros (F1…) no longer open the last price check

- Price check: Searing Exarch and Eater of Worlds implicits start unticked (they rarely make the item); tick them yourself for a good one.
- Price check: mods nobody pays for (item rarity, light radius, stun and block recovery, lower attribute requirements, accuracy, reflect, mana / life on kill) never start ticked, whatever their tier.
- Price check: the item's mods are listed as Prefixes and Suffixes (with how many of the 3 are used); crafted and fractured mods are marked.
- Price check: the search is at the top and "Show in loot filter" at the bottom; the filter text is gone for gear (DPS stays).
- Price check: the header no longer shows Searing Exarch / Eater of Worlds. Click item level, the base, links, influences or corrupted in the header to tick or untick it in the search; ticked ones show ✓.
- Price check: a "Veiled Prefix" or "Veiled Suffix" can be ticked and starts ticked.
- Chat macros: pressing F1 (or any macro) no longer pops up the last price check.

## 1.0.93 - 2026-11-15

* Price check ticks the mods that sell a rare: tier 1–2 mods, tier 3 key mods (like movement speed on boots) and special mods (mercenary, eldritch, Breach…)
* Fractured items are price checked by the fractured mod on the exact base, overquality items by the base and quality
* Jewels: the base and up to 3 useful mods; a resistance on a jewel counts as any element (Harvest swap)
* Every price check searches from the item's own item level up
* No more daily limit on pathofexile.com requests; the app still keeps every request inside GGG's own rate limits

- Price check on rares and magic items (with the Ctrl+Alt+C copy, which has the tiers): tier 1 and 2 mods start ticked, like Awakened PoE Trade, and tier 3 too when it's a mod that sells that kind of item (movement speed on boots, +levels to gems, spell suppression, crit multiplier on jewellery…). A total (movement speed, attributes) counts with its best mod's tier. At most 5 are ticked, best first, so the search doesn't come back empty.
- Special mods (mercenary, imbued, veiled, eldritch implicits, Breach, crucible, scourge…) always start ticked and aren't folded into the totals.
- Cluster jewels: the notables start ticked, and a cluster's "Added Small Passive Skills also grant: …" line is read as a mod again (it was taken for an item property, and that hid the notables). Voices: the number of jewel sockets is ticked, exactly.
- Rare and magic jewels: the exact base (Cobalt, Crimson, Viridian, Prismatic, Abyss…) and at most 3 useful mods start ticked: % life, crit multiplier, damage over time multiplier, energy shield, suppression, attack / cast speed, minion damage, flat added damage (abyss). Resistances, attributes and plain damage mods start unticked.
- Jewels: a single fire / cold / lightning resistance or maximum resistance is searched as any of the three at that value (Harvest can swap it). Maximum resistance is the most useful jewel mod.
- Overquality items (more than 20% quality, not flasks): the search is the exact base and the quality, nothing else.
- Watcher's Eye: the aura mods start ticked (from just under your roll); the life, mana and energy shield mods don't.
- Unidentified uniques search uniques of that base only (before, rares of the same base could show up).
- Every price check searches from the item's own item level up (86 and over counts as 86), so a lower item level item doesn't set the price. Maps (their tier counts), gems, heist contracts and Wickerman parts are left out.
- Special mods are also known by their name in the Ctrl+Alt+C copy: delve ("Subterranean"), incursion, veiled, essence, bestiary ("of Farrul"), Foulborn and influence mods ("Elevated Hunter's", "of the Crusade") all start ticked. The list comes from PoE Overlay.
- Enchantments on gear (labyrinth and others) start ticked.
- The daily limit on pathofexile.com requests is gone, and so are the request counters (sidebar, Overview, price check, Settings). GGG's own rate limits are still followed, so you can't get locked out.
- Searches use fewer requests: a price check reads the 10 cheapest listings in one request (a second only when they're all one or two sellers), the same search again within 3 minutes uses none, and only identified uniques are searched before you press Search.
- Corrupted items: the corruption implicit (from a Vaal Orb, like +1 to socketed gems or +1 maximum power charge) starts ticked.
- Fractured rares and magic items: the search is the fractured mod (as fractured) on the exact base; the other mods, totals, item level and DPS / defences start unticked. The fractured mod is no longer folded into a total.

## 1.0.92 - 2026-11-15

* [Chat macros] Chat macros press Backspace twice before the text, so a stray ^ no longer ends up in front of /hideout

- Chat macros: Enter, Backspace, Backspace, then your text. The Backspaces drop a waiting ^ (or another accent key). A tick box on the Chat macros page turns it off.

## 1.0.91 - 2026-11-15

* [My collection] My collection looks like the game's Unique stash tab, with a tile and a percentage per category
* [My collection] Replicas and unique maps are in My collection too
* [Regular maps] Hide white maps now means Tier 1–5, Hide yellow maps Tier 6–10
* [Settings] What's new shows only what changed since your last update, with a button to each place

- What's new (after an update): one short list of everything that changed since the version you had, without version numbers. Hover a line for the details, and the button next to it opens that place in the app. The full notes are still there, folded.
- My collection is laid out like the game's Unique stash tab: a row of category tiles (flasks, amulets, rings, claws, daggers, wands, one and two hand weapons, bows, staves, quivers, belts, gloves, boots, body armours, helmets, shields, jewels, maps, relics, tinctures), each with a picture and how much of it you have. Click a tile to show only that category.
- My collection lists Replica uniques and unique maps too. Replicas don't count towards hiding a base.
- Regular maps: "Hide white maps" hides Tier 1–5 maps and "Hide yellow maps" Tier 6–10 (by the map's tier, as the game colours them, not by rarity). The map cards say which ones are hidden.
- Tier designer → Text size is tidier: one small − / + control for everything, and only the categories you change are listed (pick one from "Change one category…").

## 1.0.90 - 2026-11-15

* [My collection] New page: My collection. Tick the uniques you own, with pictures
* [My collection] Cheap bases where you own every unique can be removed from your filter

- New page: My collection (under Wealth). Every unique that drops, with its picture, grouped into weapons, armour, jewellery, flasks, jewels, relics and tinctures. Click one when you have it (ticked ones get a ✓ and full colour). Show all, only missing or only the ones you have; sort by name, base or price; search. It shares the list with the price check, so a base where you have every unique and none is worth more than your limit is hidden in your filter, and the page marks those bases.
- My collection has a "Remove not valuable from loot filter" switch (on by default) with the price limit next to it, and every unique card has a tick box.

## 1.0.89 - 2026-11-15

* [Unique items] The Unique items page is laid out like FilterBlade's: S, A, B+C, D and High variety
* [Tier designer] Make every drop smaller or bigger, or just one category, in the Tier designer
* Price check: rares and magic items are only searched when you press Search

- Loot filter → Unique items looks like FilterBlade's page: compact rows with a tick box (shown in game), the name and the look (click it to edit). Predictable tiers: S, A, B+C and D (FilterBlade's three D tiers are one row). High variety tiers: jewels, top multi-bases, multi-bases, boss drops. Open a row to see its uniques; special cases (6-links, Kaom's, synthesised…) are one folded line.
- Moving uniques: select some, then pick the row in the bar at the bottom (no long list of FilterBlade's extra tiers).
- My collection: the price check on a unique lists every unique on its base with a tick box. Tick the ones you own. When you own every unique on a base and none is worth more than 5c (you can change it on the Unique items page), your filter hides that base. Foulborn and Replica uniques still show, and a base comes back if one of its uniques gets expensive.
- Tier designer → Text size: make every drop smaller or bigger with a click (A− / A+, 4 points a step), or one category on its own (currency, uniques, divination cards…). It goes on top of your theme; the game's biggest size is 45.
- Price check header: the item's facts (rare, item level, influence, fractured, corrupted…) sit next to the rank badge, where you see them first.
- Price check on rares and magic items: no poe.ninja base price and no search until you press Search (it said little about the item and cost GGG requests). Identified uniques are still searched at once.
- "Show in app" is now a blue "Show in loot filter" button.
- Price check: the "Search as: finished item / crafting base" choice is gone (it always searches the item as it is), and "+ My bases" and "Hide…" are quieter buttons.

## 1.0.88 - 2026-11-15

* [Rare looks] Rare looks follow your Tier designer theme
* [Rare looks] Influenced and fractured items get their own look instead of the rank colour

- Rare looks take your Tier designer theme's colours on their own now (once on update, and every time you apply a theme). The button is still there to do it again.
- Base ranks → Unid item tier and Memory Strands: no more "Filter decides / My choice"; your choice is always on, starting from what FilterBlade shows at Semi-Strict.
- Influenced and fractured items your Base ranks show get the influenced / fractured look (the one on Rare looks) instead of the rank colours, so an influenced rank D shield no longer looks like a plain dark red D base.
- Tier 0 lists its choices in the same order as the item tiers: Only S bases, A and up, B and up, C and up, Every base, Nothing.

## 1.0.87 - 2026-11-15

* [Rare looks] Use your theme's colours for every kind of rare with one click
* [Base ranks] Choose whether ranked bases show only rares, rares and magic, or every rarity
* [Base ranks] The rare categories covered by Base ranks and Rare looks are gone from the list

- Loot filter, Rare items: Rares by base, Unidentified & stranded gear, Chancing bases and Highlight specific bases aren't listed any more. Base ranks sets which bases show; Rare looks sets their looks.
- Rare looks has three more cards: Chancing bases, Fated gear highlight and FilterBlade's size highlights for rares.
- Rare looks → "Use my theme's colours": every rare and gear kind gets your Tier designer theme's looks: unidentified Tier 5 and rank S rares its Tier 2 look, then Tier 3, 4, 5, 6 down to "any base". Applying a theme in the Tier designer does the same, so rares follow your palette.
- Tier designer: unidentified item tiers and rares by base got the wrong level of a theme ("Tier 5" took the 5th look, rank S rares the white Tier 1 look); they're mapped by how good they are now, and FilterBlade's size highlights keep their own look.
- Rare looks cards fit narrow windows (the name and button go under the preview).
- Loot filter → Unique items works like FilterBlade's: one tier each for S, A, High variety, B+C and D (hidden), in value order, plus your own tiers. FilterBlade's extra tiers of the same letter (A - jewels, boss drops, early league…) fold under it, and its special cases (6-links, Kaom's, synthesised, corrupted…) fold at the bottom. A "Jump to" bar stays at the top.
- Base ranks: a "Ranked bases show as" switch right under the brushes: Rares only, Rares and magic, or White, magic and rare (FilterBlade's way, so S tier white bases show too). It starts on Rares only.
- Moving uniques: click bases to select them; the bar at the bottom has one-click S, A, High variety, B+C and D (hidden), next to the full list.

## 1.0.86 - 2026-11-15

* [Rare looks] New Rare looks page: one look for each kind of rare (item tiers, strands, influenced, fractured…)
* [Unique items] High variety uniques are fixed: cheap bases no longer fill it, and you can see which unique makes a base valuable
* Price check shows your base rank and the item tier at the top

- Uniques → High variety: the price review had filled "top multi-bases" with bases whose uniques are all about 1c (it went by the cheapest unique). High variety tiers now keep a base only while one of its versions is worth it (20c+ for top multi-bases, 5c+ for multi-bases), counting only prices with 5 or more listings. The next price review moves the others back to where FilterBlade had them.
- Unique bases on the Loot filter page: hover the price to see every unique on that base, most valuable first, with thin listings marked. The range uses prices with 5+ listings.
- Price check on an unidentified unique lists the uniques on its base, most valuable first.
- Filter check on normal (white) items: they have an item tier too, which the copy doesn't show, so the check now says what your filter does at each tier instead of "hidden".
- Filter check: rules for identified items no longer count white items (the game doesn't either), so white bases you show by item tier no longer say "hidden".
- Price check header: your base rank as a coloured badge and the item tier ("A  Tier 5 - Unidentified"). Hover it for the details.
- Loot filter → Rare items → "Unidentified & stranded gear": the looks of the unidentified item tier rules and the Memory Strand rules (the green look unidentified rares get). Edit them there; which bases and tiers show stays on Base ranks.
- Loot filter → Rare items → **Rare looks**: one card per kind of rare and gear drop: unidentified item tiers 5 / 4 / 3 / 2, any base, rares by base Tier 1–4, Memory Strands (and many strands), influenced, fractured, veiled, Exarch / Eater, quality and overquality, crafting bases by item level, special bases, corrupted and enchanted, identified with good mods, 6-links. Edit a look once and it goes on every FilterBlade rule of that kind; no base lists to wade through. "Use the FilterBlade look" puts them back.

## 1.0.85 - 2026-11-15

* [Base ranks] Pick how many Memory Strands you want to see per rank
* Price check reads quality unidentified rares and Memory Strands correctly

- Price check: unidentified rares with quality ("Superior Phantom Mitts") are read as their base, so the filter check, base rank and Show in app work for them.
- Filter check counts Memory Strands, so items shown by FilterBlade's Memory Strand rules no longer say "hidden".
- Base ranks has a Memory Strands row under Unid item tier: for rank S, A, B and every other base, pick the fewest strands you want to see (or hide them). It uses your ranks and keeps FilterBlade's looks. Stranded gear is no longer hidden by "rares below rank …".

## 1.0.84 - 2026-11-15

* [Regular maps] Hidden map tiers are marked on the map cards
* Price check finds the right filter rule for unidentified items
* Divine Vessel gets its fragment look again
* [Base ranks] Unidentified rares of lower ranks are no longer hidden by mistake

- Regular maps: the tiers the hide buttons cover are marked in the app ("✕ Hidden (below Tier 16)", "✕ Yellow hidden"), and below-Tier-16 cards are crossed out.
- Price check on unidentified items reads the new "Unidentified (Tier 5)" line. The filter check now finds the rule the game uses (for example "Shown: Unidentified Tier 5 and up, rank A bases") instead of saying it's hidden.
- Price check → Show in app on any armour, weapon or jewellery with a base rank opens Base ranks with that base marked.
- Divine Vessel (and other fragments that now drop as currency) gets its Fragments look and sound again. It fell into the pink "everything else" currency rule.
- Rares: with unidentified item tiers, "Base ranks: rares below rank …" now only hides identified rares. Before, it also hid unidentified rares of lower ranks that FilterBlade shows at Tier 4 and 5 (102 rank B bases in a Semi-Strict filter).
- Filter check knows each base's drop level, so it no longer says a high-level base is hidden by FilterBlade's "low drop level" rule.

## 1.0.83 - 2026-11-15

- Loot filter → Regular maps shows just the map tiers, Tier 16 first (the highlight rules aren't listed any more; "Special mods" maps moved to Special maps).
- Regular maps has three buttons at the top: Hide white maps, Hide yellow maps and Hide below Tier 16. Blighted maps and unique maps are never hidden by them.
- Price check → Show in app on a rare now opens Base ranks at the right weapon or armour list, scrolls to the base and marks it with a white frame and a ▶.
- Price check: "+30% to Item Rarity" (Le Heup of All and other uniques) can be ticked and searched now.

## 1.0.82 - 2026-11-15

- Base ranks → Unid item tier has a Tier 1 too (FilterBlade has no rule for it: the lowest rule of the rank then takes Tier 1 as well).
- Price check: an unidentified item's copy doesn't say its item tier, so "Hidden by the hide layer" could be wrong for something you see on the ground. It now says what your filter does at each tier ("Tier 3 and up shown (Unid item tiers); Tier 1–2 hidden (Hide layer)"), and the label at the top shows the look it gets when shown.

## 1.0.81 - 2026-11-15

- Base ranks → Unid item tier has a Tier 0: plain rares without an item tier (identified ones). Pick which bases you still see (every base, C, B or A and up, only S, nothing, or let the filter decide); they keep FilterBlade's look. It replaces the separate "Rares" row.
- Loot filter: the "big price changes this week" list is gone from the category pages. The tiers follow prices anyway (Price review and auto-tier).

## 1.0.80 - 2026-11-15

- Scrolls look exactly the same in every rule, whatever the tier: Portal Scroll bright blue, Scroll of Wisdom dark red, white text and border, full size. The Loot filter page shows them that way too (it showed the tier's own look before).

## 1.0.79 - 2026-11-15

- Portal Scrolls (bright blue, white border and text) and Scrolls of Wisdom (dark red, white border and text) now look the same in every rule that shows them, in every category and tier, also where they share a rule with other items. Nothing is shown or hidden differently.
- Fragments lists its pages as Threads, General, Splinters, Simulacrum, then the stacked splinters.
- Threads page: only the tiers that hold threads are listed (no more empty tiers), and the price notes are about threads only. Other fragment tiers are still there under "Move to".

## 1.0.78 - 2026-11-15

- Base ranks → Unid item tier is now set per item tier: for Tier 5, 4, 3 and 2 you pick which bases you see ("Every base", "B and up", "Only S bases" or "Nothing"). For example Tier 4 and up for every base, Tier 2 only for your S bases. A higher tier always shows at least what a lower one does.
- Tidier looks: the minimap icon's shape now says what kind of item dropped (currency circle, stacks hexagon, gear and bases diamond, gems triangle, maps and fragments square, cards kite, uniques star, jewels pentagon). Colours still say the tier, so a Tier 2 currency and a Tier 2 base no longer look the same on the minimap. Nothing is shown or hidden differently.
- Lifeforce and scrolls keep their own colour in every theme: Vivid lifeforce is yellow, Primal blue and Wild red; Portal Scrolls are blue and Scrolls of Wisdom dark red (background, and beam and minimap icon where the rule has them). Their tiers still decide size, border and sound.
- Fated rares follow the rank of their base: a Fated Imperial Claw is ranked like an Imperial Claw (S in FilterBlade's fated Tier 1, A in fated Tier 2, the rest like plain rares).

## 1.0.77 - 2026-11-15

- Base ranks → Unid item tier: unidentified items now use FilterBlade's own item tier rules and looks, with your ranks. Your S bases go in FilterBlade's best row, A in the second, B in the third; for each rank you pick the lowest item tier you want to see. C and D bases share one choice (FilterBlade's "any base" rules).
- Loot filter: "Other fragments" is now "Fragments", with a new "Threads" page under it listing every thread (Abyss Thread, Breach Thread...) in the fragment tiers.
- Threads are put into the fragment tiers by their poe.ninja price once (FilterBlade had them all in one tier). The price review keeps them right after.

## 1.0.76 - 2026-11-15

- Price check: the app waited far longer than the trade site needs. Searches seen from your browser or other tools counted as if they were all just made, so the 5-minute limit looked full for 5 minutes. A price check you click may now use most of GGG's allowance; the price watch and other background work still keep to half.
- Price check: the "wait" message no longer pops up over the buttons, so "Open on trade site" can be clicked straight away.

## 1.0.75 - 2026-11-15

- Rares go into FilterBlade's rare tiers by your base ranks: S bases Tier 1, A Tier 2, B Tier 3, C Tier 4, D left to the rest of the filter. They keep FilterBlade's look for that tier.
- Price check: gear shows its base rank and where the base sits on the Base ranks page ("Base rank: A for Prophecy Wand (Wands), so rares of it go into the filter's rare Tier 2").
- Price check: the top line also says fractured, synthesised, Searing Exarch, Eater of Worlds, Foulborn, mirrored, split and unidentified (with the item tier when the game shows it).
- Loot filter: FilterBlade's rare tiers by base have their own category, "Rares by base" (they were under Vendor recipes).
- Price check: normal, magic and rare gear says its rarity ("magic, Amethyst Ring, item level 84"), and the filter line says the rule is for it as a magic item.
- Price check: when the trade site makes the app wait (or the search fails), "Open on trade site" is still there and opens the same search in your browser.

## 1.0.74 - 2026-11-15

- Path of Building → Upgrades: "Best anointment for your amulet". Every notable an amulet can be anointed with is tried on yours (your own anointment taken off first) and listed by what it adds to DPS, effective HP or life, with the three oils. ▲ marks the ones better than yours.

## 1.0.73 - 2026-11-15

- Settings → Share your app settings: export your hotkeys, chat macros, price check and overlay choices, Regex page, saved trade searches and lab overlay to one file, and import someone else's (with Undo). Your account, login, league, folders, history and net worth are never in it.
- Price check: mods counted in a total, the weapon DPS or the defences (attack speed, critical strike chance, added damage, single resistances...) are no longer left out. "+ Show more mods" lists them, so you can tick them yourself.
- Price check: mods the trade site writes in the singular ("Chain an additional time") are found when your item has a number ("Chain 2 additional times").

## 1.0.72 - 2026-11-14

- Wickerman parts (Viscera) can be price checked: the trade search looks for the same part with its buff at your roll or better. If the trade site doesn't list them, the price check says so.
- Fixed: the price check showed the last item you copied when the game didn't copy the one under the mouse. It now says the game didn't copy an item.

## 1.0.71 - 2026-11-14

- Normal (white) items of a high item level keep your filter's own look too. Base ranks only hide the ranks below your choice.

## 1.0.70 - 2026-11-14

- Magic items of a high item level keep your filter's own look, like rares. Base ranks only hide the ranks below your choice. Normal (white) high item level bases still get the rank colours.

## 1.0.69 - 2026-11-14

- New theme in the Tier designer: Bubblegum, hot pink with soft lilac.
- Price check copies items more reliably when the game runs slow (busy maps): the copy keys are held for a moment instead of tapped, the app waits a little longer for the game, and tries once more before saying "Hover an item".

## 1.0.68 - 2026-11-14

- Map price check: only the map tier and the influence ("Area is influenced by The Elder") start ticked. Quantity, rarity, pack size and the map's mods start unticked, and maps no longer show open prefix / suffix rows.
- Maps no longer list "Close matches".

## 1.0.67 - 2026-11-14

- Rares in maps keep your filter's own tiers and look. Base ranks only hide the bases below the lowest rank you pick for rares.
- Other items FilterBlade draws in one of its tier colours (Dead Man's Sulphur stacks, Lifeforce, Simulacrum splinters, cluster jewels, relic keys and more) now take that tier's colours from your design, in every theme.
- Stacked currency (stacks of 3 and 6, supplies, splinters) now uses your tier design's colours. Its size, sound, beam and icon stay as FilterBlade has them.

## 1.0.66 - 2026-11-14

- Strictness, like FilterBlade's: Loot filter has a row from Soft to Uber Plus Strict. Each step hides more low value items. Your own tier changes stay on top, and each filter remembers its own strictness (yours and a friend's). Shared filter settings take it along.
- What your FilterBlade filter hides now stays hidden:
  - The price review no longer moves hidden items into shown tiers. Items it moved before are hidden again.
  - Folding currency Tier 7 and lower into Tier 6 no longer shows hidden tiers.
  - "Show all currency" is switched off once. You can switch it back on.
- Plain rares in maps are left to FilterBlade again, so it hides the poor ones. Showing every ranked rare showed them all. Your unidentified item tiers by rank and the other base rank kinds stay.
- Price check: open prefixes and suffixes are offered whenever a rare or magic item has room ("2 open prefixes"), not only when one slot is left.
- Tier designer: every look is full size and solid. Themes only change colours, sounds, beams and icons. Your current looks were updated to match.

## 1.0.65 - 2026-11-14

- Fixed: the price review could fill your own tiers (a "Giga" tier, say) with hundreds of items, cheap ones included. Your own tiers are now only filled by you. Items the review put there go back to their FilterBlade tier when you start the app.
- Fixed: moving an item to another tier also took it out of special cases like 6-link Tabula, Shaper + Elder uniques and big Dead Man's Sulphur stacks. Those stay now.
- Fixed: items moved into a tier FilterBlade left empty were shown by the loud "anything else" rule. That tier now switches on.
- Fixed: the "any Heist gear / brooch / tool" tiers were switched off in your filter. They are back.

## 1.0.64 - 2026-11-14

- Fixed: trade search for transfigured gems ("Unknown item base type"). They are now searched as their base gem with the transfigured version, the way the trade site lists them.
- Price check in the Labyrinth's Divine Font and other windows that only allow a plain copy: when the copy with mod tiers gives nothing, the app tries a plain copy.
- The price guess for rares is gone: poeprices.info has shut down (its address now points to a domain sale page).

## 1.0.63 - 2026-11-14

Price check works like Awakened PoE Trade now:
- **Copies with mod tiers** (Ctrl+Alt+C), so it knows each mod's tier, prefix or suffix, and roll range.
- **Totals instead of single mods**: elemental resistance, chaos resistance, life (Strength counts half), mana, attributes, attack and cast speed, crit, damage, life regeneration. The mods they add up from leave the list.
- **Armour, evasion and energy shield at 20% quality**, ticked on bases with one defence; weapon physical DPS at 20% quality too. The local mods that make them up are counted in.
- **What starts ticked**: on a rare, the life and resistance totals plus the defences or DPS, for any base of that type. On a unique, only the rolls that can change, with a min a tenth of the roll's range under yours (a perfect roll exactly); all of them when there are three or fewer.
- **Has an open prefix / suffix**: can be searched on a rare with five mods.
- **Crafting base**: an unfinished item worth crafting on (item level 82+, influenced, fractured or synthesised) can also be searched as a base: exact base, item level, influences, implicits and fractured mods.
- **Results**: the 20 cheapest, the same seller at the same price as one row with ×count, how long ago it was listed, and whether the seller is online, AFK or a merchant tab.
- **Uniques and unidentified items are searched at once**; rares wait for Search. Turn this off in Settings.
- Fewer requests: the next 10 listings are only fetched when the first 10 are mostly the same few sellers; the same search or listings again within 3 minutes cost nothing; and a search the trade site would make you wait more than 10 seconds for says so instead of hanging.
- A not corrupted rare or magic item is compared with not corrupted ones; influences are only ticked in the crafting-base search.
- **Live exchange** for currency, fragments, scarabs, divination cards and other stackables: what sellers online ask for one, paid in chaos or in divines, with stock, seller and how long ago (1 request).
- **Price guess for rares** from poeprices.info: a low-high range, how sure it is, and which mods count most. Turn it off in Settings (it sends the item's text to poeprices.info).
- **Cluster jewels**: the passive count searched the useful way (4 = at most 5, 3 / 6 / 10–12 = at least…), the small passives' bonus, item level brackets, jewel sockets hidden.
- **Flasks**: the exact base, top-tier mods ticked, harvest / instilling enchantments hidden. **Maps**: quantity, pack size, rarity (not when the map drops more scarabs, currency or cards) and "More Scarabs / Currency / Cards". **Heist contracts**: the job level and a priceless target.
- Fixed: stats with choices (like a cluster jewel's "Added Small Passive Skills grant") were searched wrong.

## 1.0.62 - 2026-11-14

- Find a better item on the trade site: the page now says what it's doing (working out stat weights, waiting for the trade site's rate limit, searching, testing listing 3 of 10…) instead of one message the whole time.
- When the trade site says the search is too complex, the app remembers how many stats it took, so the next search goes through the first time instead of being refused again.
- Testing the listings in Path of Building stops after a minute; any left are listed untested.
- Fixed: while that search waited for the trade site, the rest of the Path of Building page (the levelling guide, the tree, the stats) couldn't load. Path of Building is now only busy while it really works.
- When the trade site asks to wait more than 20 seconds, the search opens on the trade site in your browser instead of waiting.

## 1.0.61 - 2026-11-13

- Find an upgrade on trade (Path of Building): the **Weighted Sum** minimum is now your own item's sum, worked out from its mods the way the trade site counts a listing. Before, it used how much your whole item adds over an empty base of the same type, which was far too high and hid items as good as yours.
- Price check on a weapon (Alt+E): shows its **physical, elemental and total DPS** (its damage times attacks per second, as the game shows them).
- Trade search for a weapon: search by **Physical DPS, Elemental DPS or Total DPS** with a minimum (90% of yours to start). It's on by default, picks physical or elemental by which is higher, and leaves the damage and attack speed mods unticked, since the DPS already counts them.
- Melee weapons (axes, swords, maces, staves, claws, daggers) start with only **Physical DPS** ticked in the trade search: no mods, no same base, no item level. Tick more if you want.
- Price check compare with your build: shows only **Average Damage** and **Effective Hit Pool** (builds without an Average Damage line show their DPS instead).
- A **New snapshot** button in that compare: takes a fresh snapshot of your character (your gear now) and compares the item again with it.
- Weapons only ask for mods their type can roll: no more "+# to Level of all Minion Skill Gems", spell damage or cast speed on a two-handed axe or mace.

## 1.0.60 - 2026-11-13

- Path of Building: hover a gem to see where you get it while levelling, for your build's class: its quest reward, the first vendor that sells it, and Lilly Roth in Act 6. Transfigured, Vaal and Awakened gems say where they come from instead.
- Gem pictures now also show in a brand new league: poe.ninja has no gem lists for the first hours, so the pictures come from Standard until then.

## 1.0.59 - 2026-11-13

- **New league found at once**: PoE Helper now asks pathofexile.com which league is running (once at start and every 3 hours), so price checks, trade searches and net worth switch to a new league from its first minute instead of staying on Standard until poe.ninja adds it. You get a notification when it switches.
- Standard, Hardcore, Solo Self-Found and Ruthless are never picked as the current league. You can still choose any league yourself in Settings.

## 1.0.58 - 2026-11-13

- Tier designer: the theme sounds now show in the editor too (Tier 2: game sound 1, Tiers 3 to 6: game sound 2), for every theme you pick. Choosing "No sound" for a tier keeps it silent.

## 1.0.57 - 2026-11-13

- Tier sounds in every theme: Tier 2 plays game sound 1 and Tiers 3 to 6 game sound 2. Tier 1 keeps the Divine sound (game sound 6). Tiers a theme already styled get the new sounds now; a sound you picked for a tier yourself stays.
- Path of Building: every gem shows its picture next to its name, on the Build tab and in the levelling guide. The pictures come from poe.ninja's gem lists.

## 1.0.56 - 2026-11-13

- Loot filter: a new **Current league: Covens of Umbra** group with **Viscera**, **Allflame embers & map enchant currency** and **Fated items** (Fated rares, rings and amulets, belts, and the Fated gear look).
- Idols, coins, sulphur and ducats from earlier leagues moved to **Miscellaneous**.

## 1.0.55 - 2026-11-13

- Levelling guide: the list shows only your levelling guides now, not every Path of Building build.
- Levelling guide: the paste box is hidden until you press **Add a new guide**. After importing, you can name the new guide straight away.
- Levelling guide: a guide always opens at its first tree, gems and items (for example Level 1-12).
- Levelling guide: **Save gems as a gem search** saves the gem setup shown. The choice of setups is gone.
- **New page: Trade searches** (under Wealth). Save your pathofexile.com trade searches and live searches with a name, and open them in one click.
  - **Price watch:** type the most you want to pay and how often to look. PoE Helper runs the search again, cheapest first, and sends a Windows notification when something is at or under your price. Click the notification to open the trade site.
  - Each listing is only told once. A check takes 1 or 2 pathofexile.com requests, and the page shows how many a day your watches use. It runs while the app is open, also in the tray.
- **Overview** has a new look: a banner with Caspar David Friedrich's painting *The Abbey in the Oakwood* (1810, public domain) behind the title and your numbers. Pick your own picture there with **Change picture**, or remove it.
- Price check (Alt+E) with the build comparison is sturdier:
  - If Path of Building gets stuck, it restarts by itself on the next press, so you no longer have to restart the app.
  - If Path of Building is busy with a long job, the price still shows straight away and the comparison says so after 30 seconds, instead of waiting forever.
  - Hotkeys come back by themselves if recording a new hotkey in Settings is left unfinished.
- The app keeps a small log (poe-helper.log next to its settings) to help find problems. It never holds your POESESSID.
- Loot filter, ready for the new 3.30 FilterBlade filters:
  - **Viscera** and **Allflame embers** have their own pages under League mechanics. Allflame embers get poe.ninja prices and are part of the price review.
  - The new **unidentified item tier** rules are on the **Base ranks** page: for each rank, pick the lowest item tier you want to see (for example S from tier 2, C only at tier 5). Leave it on "Filter decides" to keep FilterBlade's own rules.

## 1.0.54 - 2026-11-13

- **Two levelling guides come with the app**: **Zerker** and **Minion slam** are imported into the Levelling guide by themselves a few seconds after the app starts (once; it needs Path of Building installed and an internet connection). If you already have them, nothing is added, and one you remove doesn't come back.

## 1.0.53 - 2026-11-13

- **Rename and Remove** on the Levelling guide, for guides you imported (and snapshots): Rename gives the guide a new name, Remove puts it in the Recycle Bin. Your own Path of Building builds can't be renamed or removed here.
- The build lists on the Path of Building page are read again each time you open a tab, so a levelling guide or snapshot made in the background shows up without restarting the app.

## 1.0.52 - 2026-11-13

- **FilterBlade's sounds everywhere**: every tier plays the sound FilterBlade gives it again: Tier 1 currency the Divine sound, uniques their own, maps by tier, and so on. Themes and the tier designer change looks only and keep each tier's FilterBlade sound (they used to put their own sounds on Tier 1-4 and none on Tier 5-6). Your filter gets this once on the update; sound files you added yourself stay. In the sound picker, each game sound now says what FilterBlade uses it for.
- **Gem searches from a build**: the Levelling guide has "Save gems as a gem search": the gems of the build (all its gem setups, the ones up to the setup shown, or only that one) saved on the Regex page's gem list under the name you give it.
- **Copy gem search** on the Levelling guide's Gems panel: copies a vendor search for every gem in the gem setup shown; paste it in a vendor's search box to light them up. When they don't fit in one search (250 characters), each press copies the next part.
- A `setup.json` in PoE Helper's data folder is read once at start and then deleted: it can set the Levelling guide build, import levelling guides from links and add saved gem searches (handy for setting up a copy for a friend). The Levelling guide list shows your imported guides first.

- **Levelling guide** replaces the levelling plan on the Path of Building page: import a levelling build (paste its Path of Building code, or a pobb.in, poe.ninja or Maxroll link) or pick one of your builds, then choose its trees and gem setups and see the tree and every gem with its supports. Picking a tree also picks the gem setup with the same name. It is only for looking: upgrades, the item tester and the price check never compare against it.
- **Your build stays picked**: the build you pick at the top of the Path of Building page, or your newest snapshot, stays the one in use (also after a restart) until you pick another or save a new snapshot. Upgrades, the item tester and the price check comparison always use it, so looking at another build, like the levelling guide, doesn't change it.
- The old levelling plan (tree order, gems per stage) is removed.

## 1.0.51 - 2026-11-11

- **Every tree and setup of your own Path of Building builds**: the Tree, Items, Skills and Config pickers on the Build tab now work for your own PoB builds too (they used to be greyed out), so a build with a levelling tree, a mapping tree and an endgame tree, each with its own gems and supports, can be looked at and used in every tab. For your own builds the choice is kept by PoE Helper and your PoB file is never changed; snapshots and imported builds save it in the build as before. Divider sets like "-------" can't be picked. Switching the skill set or tree puts the main skill back to that setup's own.

## 1.0.50 - 2026-11-10

- **One price check hotkey**: Alt+E prices the item and, under it, shows what it does to your build (what Ctrl+E did). Settings → Price check → the compare switch turns the build part off; then Path of Building isn't run and Alt+E only prices. The separate compare hotkey is gone, and so is "Price check with mod tiers" (the normal price check reads the mods anyway).

## 1.0.49 - 2026-11-10

- **Chat macros** (new page in the menu, under Tools): F1 to F5 each press Enter, type your text and press Enter again in game. F1 is **/exit** (log out to character select) and F2 is **/hideout** to start with; F3 to F5 are yours to fill, with ideas like /kingsmarch, /menagerie, /delve or @last as you type. Untick **Send** to only type the text, e.g. "@last " to start a reply. The keys only work while Path of Exile is the active window, so F1 to F5 keep working normally in every other app, and your clipboard is put back after each macro. One key press sends one message, the same as typing it yourself. Turn them all off with "Use chat macros".

## 1.0.48 - 2026-11-10

- **Compare items with your build in game (Ctrl+E)**: hover an item and press Ctrl+E. The price check pops up as usual, and under it Path of Building shows what the item does to your build, like the item tester: DPS, life, resistances and the rest, per slot it fits. It uses the build you last picked on the Path of Building page. The normal price check (Alt+E) never starts Path of Building, so it stays fast. Settings → Price check → "Compare items with my build" turns it off; then the hotkey does nothing and nothing is calculated. The hotkey can be changed there too.

- **Builds with several trees and setups**: an imported build (or a snapshot) that has more than one passive tree, item set, skill set or config set, like a levelling tree and an endgame tree, keeps all of them, and the Build tab gets **Tree**, **Items**, **Skills** and **Config** pickers to switch between them. Picking a tree also switches to the item, skill and config sets with the same name, like Path of Building's loadouts. Your choice is saved in the build, and every tab (Calcs, Tree, Upgrades, Support gems) uses it.

## 1.0.47 - 2026-11-10

- **Taskbar icon, the real fix**: the icon file stored its small sizes (16 to 48 pixels) as compressed PNG pictures. The title bar could read them, but the taskbar often can't, so it showed a blank square. The small sizes are now classic bitmaps that every part of Windows reads; only the 256 pixel size stays PNG. The same goes for the classic icon and for your own picked icon. After updating, quit PoE Helper from the tray and start it again.

## 1.0.46 - 2026-11-10

- **Stacked currency is simpler**: Small stacks come first, then Big stacks. Transmutes and Augmentations no longer have categories of their own: Orb of Transmutation and Orb of Augmentation join the lowest tier of Small stacks (3 or more), and FilterBlade's own blocks for them are switched off safely, so the filter still loads in game.
- **The menu is grouped**: Overview on top, then **Loot** (Loot filter, Tier designer), **Wealth** (WealthyExile, What to farm) and **Tools** (Path of Building, Regex, Daily lab), with Settings at the bottom.
- **Patch notes** show the last 5 versions, with a link to every release on GitHub.
- **Item tester** sits in its own column to the right of the stats on the Build tab (under them on a narrow window). There's no Test button any more: press Ctrl+V anywhere on the tab with an item copied and it is tested straight away. Gains and losses in Path of Building's tooltips are blue and orange too.

- **Taskbar icon, second try**: Windows ignored the icon PoE Helper gave the taskbar unless a "relaunch command" came with it, so the taskbar could still show a blank square. Now both are set, the window gets its icon from the real .ico file, and a copy run from the source folder gets its own taskbar identity so it never borrows the installed app's.
- **Small icons are clearer**: the tray and the small sizes of the app icon use a version drawn for small sizes (closer on the flask, brighter red, no smoky texture), and the menu shows the bare flask with a soft red glow instead of a dark square on the dark menu.

## 1.0.45 - 2026-11-10

- **Colour-blind friendly everywhere**: gains, losses, on and off are now blue and orange across the whole app (Compare snapshots, net worth per hour, prices, regex picks and more), like the tree. The + and − signs stay.
- **Overview**: a net worth chart for the last day (from snapshots you already have, no extra requests) and one-click cards for your most used pages. The empty bar under "Requests today" is gone until there are requests.
- **Menu**: the app's icon sits next to its name; the version, release date and install date each get their own line; the theme dots are labelled "Look".
- **Buttons**: small and plain buttons use the normal font instead of the game font, so long labels like "Log in again on pathofexile.com" read easily.
- **Settings → Speed** says what it means: "Normal (half of what GGG allows)".

- **New icon**: a tall, square life flask in a brass frame, seen from the side at an angle, with murky blood-red liquid and a red glow, in a worn brass border. The old gold diamond is still there: Settings → Tray and app icon → **Classic**. If you picked your own icon, yours stays. Windows may show the old icon for a while until it refreshes its icon cache.

## 1.0.44 - 2026-11-10

- **Cleaned out leftovers** from removed features: the old item test page, the automatic fractured tiering, a few unused background requests and settings, and about 40 unused styles. Nothing you use changes; the app just carries less.

- **The taskbar icon stays**: Windows sometimes showed a blank icon for PoE Helper (after it was hidden in the tray, or after an update). The taskbar now takes the icon straight from PoE Helper.exe, or from your own icon if you picked one, and it is set again each time the window comes back.

## 1.0.43 - 2026-11-10

- Notes for developers who work on PoE Helper (how it is built and released). Nothing changes in the app itself.

## 1.0.42 - 2026-11-10

- **Tree changes stand out**: nodes the optimiser takes get a bright blue ring with a glow, nodes it gives up an orange ring and a cross; a + or − badge says which is which. Both sit on a dark band so they show over the node art. The connections it takes are blue and the ones it gives up dashed orange. Pointing at a swap dims the rest of the tree.
- **Passive points match your level**: the tree counted every quest point at any level (51 at level 28). Now it counts level − 1 plus the quest points of the acts you have probably done by that level (as in the levelling plan), and the bandits' point after act 2: 32 at level 28. Hover the points to see which act it assumes. Ascendancy points follow the labyrinths the same way. The optimiser's "Use unspent points" uses this too.

- **Skill parts, like in Path of Building**: under Main skill on the Build tab you can now pick the skill of the group (Summon Sacred Wisps or Kinetic Blast), its part (Kinetic Blast: Projectile or Explosions; Explosive Arrow: fuses or the arrow), stages, active mines, and for minions the minion and its skill. Snapshots keep your choice, and the Build, Calcs, Tree, Upgrades and Support gems tabs all use it.

## 1.0.41 - 2026-11-10

- **Tree changes are colour-blind friendly**: new nodes are blue, nodes given up have a dashed orange ring, and the path to a node is a dashed white line (it was red and green before). The optimiser's lists and the tree tooltips use the same blue and orange.
- **Buffs you have under a condition are ticked when it holds**: "You have Tailwind if you have dealt a Critical Strike Recently" ticks Tailwind when you crit often enough (also Onslaught, Arcane Surge, Unholy and Chaotic Might, Fortification, Adrenaline, Elusive).
- **Have you Crit Recently** is ticked with at least 40% crit chance, and **Have you dealt a Non-Crit Recently** below 90%.
- **The enemy's conditions are ticked too** (For Effective DPS), as an estimate from your main skill: **Shocked** with a good chance to shock or mostly lightning hits, **Chilled** with a fair share of cold, **Frozen** with a high chance to freeze, **Ignited** and **Burning** with a good chance to ignite, and **Blinded, Intimidated, Crushed, Unnerved, covered in Ash or Frost, on Consecrated Ground** when your tree, gear or gems inflict it. Only options you haven't set; **Tick from my build** does it for a snapshot you have.

## 1.0.40 - 2026-11-10

- **Upgrades and Support gems start with your main skill** in "For the skill", and links default to the most links your build has.
- **Support gems uses the character level of the build you pick**, and **Gem quality is a choice of 0 (new gems) or 20**.
- **Upgrades: a search the trade site won't take from the app opens on the trade site by itself** (with every weight filled in), without a message about it.
- **Configuration: the sections are packed in columns**, so a short section (Skill Options, say) no longer leaves an empty gap next to a long one.

## 1.0.39 - 2026-11-10

- **Fixed: "No such node"** on the Tree tab: pointing at a node or clicking it asked Path of Building about the wrong node, so the stats of a node and changing the tree didn't work.
- **Fixed: "Path of Building stopped (3221226505)"** for builds with a timeless jewel (or other conquered passives): unpacking Path of Building's timeless jewel tables went through a call from Path of Building back into the app, which could crash it. The tables are now unpacked once into the app's own folder beforehand (Path of Building does the same with its .bin files). If Path of Building ever stops, the message now says what it was doing, and it starts again by itself.
- **Stats is now the Build tab**, right after Snapshot, and **Save snapshot opens it** with the new snapshot.
- **The item tester is on the Build tab and looks like Path of Building's Items tab**: paste or copy an item and you get Path of Building's own tooltip, the item on the left and "Equipping this item in … will give you" with every stat it changes on the right, for each slot it fits.
- **Snapshots tick the Configuration for you**: charges you generate (power, frenzy, endurance), Onslaught, Arcane Surge, Unholy and Chaotic Might, Fortification, Tailwind, Adrenaline, Lifetap and Consecrated Ground when your tree, gear or gems give them, **Rage at its maximum** when you can gain Rage, a flask when you have one and a warcry when you use one. Only options you haven't set are changed, and your own ticks still carry over to the next snapshot. **Tick from my build** on the Configuration tab does the same for a snapshot you already have.
- **Full screen tree**: the button in the tree's corner fills the window with it (Esc leaves).
- **Optimiser: point at a swap to see it on the tree** (new nodes green, given-up ones red); click it to go there.
- **The tree has the real art now**: every passive's icon and frame, allocated or not, like in Path of Building. They come from your Path of Building folder (the passive tree files GGG publishes for tools like it), read when you look at the tree; the app doesn't ship them.

## 1.0.38 - 2026-11-10

- **Path of Building → Tree**: your passive tree from Path of Building, with what you allocated, jewels in their sockets and your ascendancy. **Point at a node** to see its stats and what it does to your build, like Path of Building's tooltip ("Allocating this node will give you…", also with the whole path to it, which lights up). Search, drag to move, scroll to zoom.
- **Change the tree of a snapshot**: click a node to allocate it with the path to it, click an allocated one to remove it (and what hangs on it), click a mastery to pick its effect. Points used / available are shown, what the change did shows at the bottom, and **Undo** takes it back. The snapshot is saved with the new tree.
- **Path of Building → Levelling plan**: how to get to the build from level 1. Path of Building works out the order to take its passive tree in (each time the path worth most per point for damage and life, only through nodes of the build), shown in stages (level 12, 22, 32, 40, 50, 60, 68, 75…) with the points you have by then (quests counted), the notables to take, the ascendancy points by labyrinth, and, if you ask, the best support gems you can use at each stage.
- **Upgrades and Support gems for any skill** ("For the skill" on both tabs): type a skill gem (Sunder in act 1, say) and the gear upgrades, the weighted trade search, the best mods and the best supports are worked out for it at your level, with its sockets filled with the best supports you can use (links by level, or pick them). If your weapon can't use it, a plain weapon it can (the best base for your level) is used, and the app says so. Nothing is saved.
- **Levelling plan: pick your levelling skill** (any skill gem, say Rolling Magma or Splitting Steel). It gets the best supports at every stage (2-link before 12, 3 until 31, 4 until 60, then 5), with its gem level at that character level; the tree is ordered for it until you switch, and the plan says where to switch to your build's skill (when that one does more, or at the level you choose).
- **Timeless jewel finder** (Path of Building → Tree → Timeless jewel): pick one of your jewel sockets and a jewel (Glorious Vanity, Lethal Pride, Brutal Restraint, Militant Faith, Elegant Hubris, Heroic Tragedy). Path of Building puts the jewel in with **every seed**, conquers the passives in radius like the real jewel, and ranks the seeds by what they do to your DPS, life or effective HP. **Show** lists what your notables become (and marks them on the tree), **Search the trade site** opens the best seeds cheapest first, and **Use it** puts the jewel in the snapshot. Most jewels take a second or two; Glorious Vanity a few minutes.
- **Share and import builds** (Path of Building → Snapshot): **Copy build code** puts the build's Path of Building code on the clipboard; **Share on pobb.in** uploads it and copies the link. **Import** takes a code or a link (pobb.in, poe.ninja, pob.codes, Maxroll, Pastebin, Rentry, poedb), saves it with your snapshots and opens it, so Stats, Tree, Calcs, the optimisers and Open in Path of Building all work on it.
- **Open in Path of Building**: a button next to the build picker starts Path of Building with that snapshot (or build) open. (Path of Building opens the build it had last, so the app sets that in its settings first; a copy of the settings is kept as Settings.xml.poehelper-backup.)
- **Path of Building → Support gems**: finds the best support gems for your main skill. Every support that can support it is tried in place of each of yours, **at the highest gem level you can use at your character level** (or a level you type in, to plan ahead), and Path of Building keeps the set with the most DPS. It shows what to take out and put in, the gain, the mana cost, and the next best gems for every socket. Gems that need a higher level than the one you plan for are counted as not usable, and their sockets get gems you can use. Tick gems to keep them (Fortify, say); Awakened and exceptional gems are optional. **Put these in the snapshot** applies them.
- **Tree optimiser** (Tree → Optimise): with the same points, it gives up the nodes worth least and takes paths worth more, one swap at a time, for DPS, life or effective HP, while the limits you set hold (life, effective HP, DPS, resistances, and your gear's attribute requirements). Every swap is checked by Path of Building and listed; new nodes show green on the tree and the ones given up in red. Nothing is saved until you press **Keep this tree**; **Go back to my tree** leaves the snapshot as it was.
- **Tree heatmap**: colours every node by how much DPS, life or effective HP it adds on its own (Path of Building's node power), so the best next picks stand out; allocated nodes that add nothing to it are dimmed.
- **Path of Building → Calcs**: Path of Building's Calcs tab for your main skill, laid out the same way. **Point at a number** to see how it's worked out: the base, the multipliers and the table of every modifier with its source (tree node, item, skill), like in Path of Building. Click to keep it open.
- **Configuration: map modifiers are tick lists** at the bottom of the page: tick the prefixes and suffixes your map has (up to 4 each, like Path of Building's slots) instead of picking them from 8 menus.
- **Configuration shows what a change did**, right away at the bottom of the window: DPS, life, effective HP, defences and the rest, before → after.
- **Search the trade site:** when the trade site still says "Query is too complex", the app searches again with fewer stats instead of stopping, and **Full search on the trade site** opens the trade site with every weight filled in (logged in there, it allows the bigger search).

## 1.0.37 - 2026-11-10

- **Scrolls are a subcategory of Currency**, right below General: Wisdom scroll, Wisdom scroll 3+, 5+, 10+, then Portal scroll, 3+, 5+, 10+, then Scroll fragment. The campaign scroll rules stay in Levelling currency.
- **Levelling currency is under Campaign** in the category list.
- **Tier designer: Smaller / Bigger** changes the text size of Tier 2 to Tier 6 at once (2 points a press, within the game's 18-45). Tier 1 keeps its size.

## 1.0.36 - 2026-11-10

- **Path of Building → Configuration**: Path of Building's Configuration tab in the app (charges, Onslaught, Fortify, enemy is Shocked, boss type, map mods, shrines and the rest), only the options that matter for the build unless you ask for all, with search. Changes are saved into the snapshot and recalculated right away. **A new snapshot keeps them**: it starts with the ticks of your last snapshot of that character, whether you set them here or in Path of Building.
- **Path of Building → Stats: point at a gear row** to see the exact item, like the game's tooltip.
- **Path of Building uses its own icon** in the menu (from the Path of Building.exe on your PC) and sits right above Settings.
- **Search the trade site: "Query is too complex" fixed.** The search is sent with your login (POESESSID, to pathofexile.com only) so the trade site allows the bigger search Path of Building makes; without a login it keeps the 8 stats worth most.
- **WealthyExile: the snapshot comes first.** Take snapshot and what your stash is worth are at the top; below it every snapshot is listed with its change, and clicking one shows your stash as it was then. Tabs and automatic snapshots are folded away once set up.
- **Loot filter:** Check prices and Set category prices are only on currency, fragments and league mechanics, not on gear bases. Show in app from the price check scrolls the category list to where you are.

## 1.0.35 - 2026-11-10

- **Currency has six tiers.** FilterBlade's currency Tier 7, 8 and lower go into Tier 6, so the six looks of a tier design cover all of it. This is worked out again from every FilterBlade download, and a move into Tier 7 or lower (yours or price review's) lands in Tier 6.
- **Scrolls page** under Currency: every Portal Scroll, Scroll of Wisdom and Scroll Fragment rule of your filter in one list (stacked, campaign and the plain ones), biggest stacks first. Each keeps FilterBlade's look; show, hide or restyle them there.

## 1.0.34 - 2026-11-10

- **Base ranks only in maps.** In the campaign bases keep FilterBlade's own look; the rank looks (and hiding bases below your rank, as before) start at area level 68.
- **Search the trade site (Path of Building → Upgrades):** the search is now sent exactly the way Path of Building sends its own (search engine and weapon categories as PoB has them). If the trade site still refuses a search, PoE Helper now shows the reason the trade site gives instead of just "GGG 400".

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
