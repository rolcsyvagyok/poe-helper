'use strict';
// Realistic clipboard samples (Ctrl+C in PoE 1).

exports.divineOrb = `Item Class: Stackable Currency
Rarity: Currency
Divine Orb
--------
Stack Size: 7/20
--------
Randomises the numeric values of the random modifiers on an item
--------
Right click this item then left click a magic, rare or unique item to apply it.
Shift click to unstack.`;

exports.unique = `Item Class: Body Armours
Rarity: Unique
Kaom's Heart
Glorious Plate
--------
Armour: 553
--------
Requirements:
Level: 68
Str: 191
--------
Sockets: R-R-R-R-R-R
--------
Item Level: 84
--------
Has no Sockets
+500 to maximum Life
20% increased Fire Damage
--------
The warrior who fears will fall.`;

exports.rare = `Item Class: Rings
Rarity: Rare
Doom Loop
Two-Stone Ring
--------
Requirements:
Level: 63
--------
Item Level: 84
--------
+14% to Cold and Lightning Resistances (implicit)
--------
+45 to maximum Life
+38% to Fire Resistance
+12% to Chaos Resistance
5% reduced Mana Cost of Skills
+20 to Strength (crafted)
--------
Corrupted`;

exports.gem = `Item Class: Skill Gems
Rarity: Gem
Spark
--------
Projectile, Spell, Duration, Lightning
Level: 21
Cost: 10 Mana
Quality: +20% (augmented)
--------
Requirements:
Level: 72
--------
Deals lightning damage
--------
Corrupted`;

exports.map = `Item Class: Maps
Rarity: Rare
Grim Haven
Strand Map
--------
Map Tier: 16
Item Quantity: +78% (augmented)
Item Rarity: +40% (augmented)
Monster Pack Size: +25% (augmented)
--------
Item Level: 83
--------
Monster Level: 83
--------
Monsters reflect 18% of Elemental Damage
Players have 40% less Recovery Rate of Life and Energy Shield
Monsters fire 2 additional Projectiles
Area has patches of Shocked Ground
--------
Travel to this Map by using it in a personal Map Device.`;

exports.divCard = `Item Class: Divination Cards
Rarity: Divination Card
The Apothecary
--------
Stack Size: 1/5
--------
Mageblood
--------
"How fortunate."`;

exports.normalBase = `Item Class: Rings
Rarity: Normal
Vermillion Ring
--------
Requirements:
Level: 80
--------
Item Level: 86
--------
+(5-7)% increased maximum Life (implicit)
--------
Shaper Item`;

// Minimal NeverSink-ish filter
exports.filter = `#===============================================================================================================
# NeverSink's Indepth Loot Filter - test excerpt
#===============================================================================================================

Show # %D5 $type->currency $tier->t1
	Class == "Stackable Currency"
	BaseType == "Divine Orb" "Mirror of Kalandra"
	SetFontSize 45
	SetTextColor 255 0 0 255
	PlayAlertSound 6 300

Show # $type->uniques $tier->t1
	Rarity Unique
	BaseType == "Glorious Plate"
	SetFontSize 45

Hide # $type->rings $tier->lowlevel
	Class == "Rings"
	Rarity <= Rare
	ItemLevel < 75
	AreaLevel >= 68

Show # $type->decorators $tier->continue
	Class == "Rings"
	SetBorderColor 0 0 0 255
	Continue

Show # $type->rings $tier->any
	Class "Rings"
	SetFontSize 32
`;

// NeverSink-style excerpt with $type/$tier tags, as FilterBlade exports it
exports.nsFilter = `#===============================================================================================================
# NeverSink's Indepth Loot Filter - for Path of Exile
# TYPE: 1-REGULAR | STYLE: DEFAULT | AUTHOR: NeverSink
#===============================================================================================================

#------------------------------------
#   [4705] Currency - tiers
#------------------------------------

Show # %D5 $type->currency $tier->t1
	Class == "Stackable Currency"
	BaseType == "Divine Orb" "Mirror of Kalandra" "Mirror Shard"
	SetFontSize 45
	SetTextColor 255 0 0 255
	SetBorderColor 255 0 0 255
	SetBackgroundColor 255 255 255 255
	PlayAlertSound 6 300
	PlayEffect Red
	MinimapIcon 0 Red Star

Show # %D4 $type->currency $tier->t2
	Class == "Stackable Currency"
	BaseType == "Exalted Orb" "Orb of Annulment"
	SetFontSize 45
	SetTextColor 0 0 0 255
	SetBorderColor 0 0 0 255
	SetBackgroundColor 249 150 25 255
	PlayAlertSound 1 300
	PlayEffect White
	MinimapIcon 0 White Circle

Show # %D2 $type->currency $tier->t4
	Class == "Stackable Currency"
	BaseType == "Chaos Orb" "Orb of Alchemy" "Orb of Fusing"
	SetFontSize 40
	SetTextColor 0 0 0 255
	SetBackgroundColor 213 159 100 255
	PlayEffect Yellow Temp

Hide # $type->currency $tier->t6
	Class == "Stackable Currency"
	BaseType == "Portal Scroll" "Scroll of Wisdom"
	SetFontSize 32

#------------------------------------
#   [4805] Divination cards
#------------------------------------

Show # $type->divination $tier->t1
	Class == "Divination Cards"
	BaseType == "The Apothecary" "House of Mirrors"
	SetFontSize 45
	SetTextColor 255 0 175 255
	SetBackgroundColor 255 255 255 255
	CustomAlertSound "1maybevaluable.mp3" 300
	PlayEffect Red
	MinimapIcon 0 Pink Square

Show # $type->divination $tier->t5
	Class == "Divination Cards"
	BaseType == "Rain of Chaos" "The Carrion Crow"
	SetFontSize 30
	SetTextColor 0 0 0 255
	SetBackgroundColor 160 180 200 200

Show # $type->divination $tier->restex
	Class == "Divination Cards"
	SetFontSize 36
	SetTextColor 0 0 0 255
	SetBackgroundColor 255 0 175 255

#------------------------------------
#   [5000] Uniques
#------------------------------------

Show # $type->uniques $tier->t1
	Rarity Unique
	BaseType == "Glorious Plate" "Vaal Regalia"
	SetFontSize 45
	SetTextColor 175 96 37 255
	SetBorderColor 175 96 37 255
	SetBackgroundColor 255 255 255 255
	PlayAlertSound 6 300
	PlayEffect Brown
	MinimapIcon 0 Brown Star

Show # $type->uniques $tier->t3
	Rarity Unique
	BaseType == "Leather Belt" "Simple Robe"
	SetFontSize 36
	SetTextColor 175 96 37 255
	SetBorderColor 175 96 37 255
	SetBackgroundColor 0 0 0 255

Show # $type->uniques $tier->restex
	Rarity Unique
	SetFontSize 36
	SetTextColor 175 96 37 255
	SetBorderColor 175 96 37 255
	SetBackgroundColor 0 0 0 255
`;
