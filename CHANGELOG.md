# Patch notes

Newest first. Each `## <version> - <date>` section is shown in the app (Settings → Patch notes)
and used as the text of the GitHub release, so write it for players.

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
