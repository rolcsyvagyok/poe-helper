'use strict';
/**
 * Armour bases by item class and defence type, best (highest level) first, for the base visibility
 * matrix. Only names: they are checked against your FilterBlade filter before they're shown or written,
 * so a base this list has wrong (or one GGG renamed) simply doesn't appear.
 * Two-Toned Boots exist in three hybrid versions with the same name, so they sit in all three.
 */

const DEFENCES = [
  { id: 'ar', name: 'Armour' },
  { id: 'ev', name: 'Evasion Rating' },
  { id: 'es', name: 'Energy Shield' },
  { id: 'arev', name: 'Armour / Evasion' },
  { id: 'ares', name: 'Armour / ES' },
  { id: 'eves', name: 'Evasion / ES' },
];

const CLASSES = ['Body Armours', 'Boots', 'Gloves', 'Helmets', 'Shields'];

const s = (t) => t.split('|').map((x) => x.trim()).filter(Boolean);

const BASES = {
  'Body Armours': {
    ar: s('Royal Plate|Titan Plate|Legion Plate|Glorious Plate|Gladiator Plate|Astral Plate|Crusader Plate|Golden Plate|Majestic Plate|Colosseum Plate|Sun Plate|Lordly Plate|Bronze Plate|Battle Plate|Arena Plate|Full Plate|War Plate|Copper Plate|Chestplate|Plate Vest'),
    ev: s('Syndicate\'s Garb|Supreme Leather|Astral Leather|Assassin\'s Garb|Zodiac Leather|Exquisite Leather|Destiny Leather|Sharkskin Tunic|Cutthroat\'s Garb|Frontier Leather|Coronal Leather|Thief\'s Garb|Glorious Leather|Eelskin Tunic|Full Leather|Sun Leather|Buckskin Tunic|Wild Leather|Strapped Leather|Shabby Jerkin'),
    es: s('Twilight Regalia|Nightweave Robe|Arcane Vestment|Vaal Regalia|Widowsilk Robe|Occultist\'s Vestment|Necromancer Silks|Savant\'s Robe|Destroyer Regalia|Spidersilk Robe|Conjurer\'s Vestment|Silken Wrap|Sage\'s Robe|Cabalist Regalia|Silk Robe|Mage\'s Vestment|Silken Garb|Scholar\'s Robe|Silken Vest|Simple Robe'),
    arev: s('Conquest Lamellar|Dragonscale Doublet|Wyrmscale Doublet|Full Wyvernscale|Triumphant Lamellar|General\'s Brigandine|Marshall\'s Brigandine|Desert Brigandine|Full Wyrmscale|Commander\'s Brigandine|Battle Lamellar|Full Dragonscale|Soldier\'s Brigandine|Hussar Brigandine|Full Scale Armour|Field Lamellar|Infantry Brigandine|Light Brigandine|Scale Doublet|Scale Vest'),
    ares: s('Sacred Chainmail|Full Ringmail|Grand Ringmail|Paladin\'s Hauberk|Saintly Chainmail|Loricated Ringmail|Saint\'s Hauberk|Devout Chainmail|Conquest Chainmail|Elegant Ringmail|Holy Chainmail|Crusader Chainmail|Ornate Ringmail|Chain Hauberk|Latticed Ringmail|Full Chainmail|Ringmail Coat|Chainmail Doublet|Chainmail Tunic|Chainmail Vest'),
    eves: s('Necrotic Armour|Sacrificial Garb|Sanguine Raiment|Torturer Garb|Carnal Armour|Sadist Garb|Blood Raiment|Varnished Coat|Sentinel Jacket|Lacquered Garb|Crypt Armour|Quilted Jacket|Sleek Coat|Bone Armour|Waxed Garb|Crimson Raiment|Oiled Coat|Scarlet Raiment|Oiled Vest|Padded Jacket|Padded Vest'),
  },
  Boots: {
    ar: s('Leviathan Greaves|Precursor Greaves|Titan Greaves|Vaal Greaves|Goliath Greaves|Ancient Greaves|Antique Greaves|Reinforced Greaves|Plated Greaves|Steel Greaves|Iron Greaves'),
    ev: s('Phantom Boots|Harpyskin Boots|Slink Boots|Sharkskin Boots|Stealth Boots|Shagreen Boots|Eelskin Boots|Nubuck Boots|Deerskin Boots|Goathide Boots|Rawhide Boots'),
    es: s('Velour Boots|Warlock Boots|Sage Slippers|Sorcerer Boots|Arcanist Slippers|Conjurer Boots|Samite Slippers|Satin Slippers|Scholar Boots|Silk Slippers|Velvet Slippers|Wool Shoes'),
    arev: s('Wyvernscale Boots|Steelscale Boots|Chimerascale Boots|Two-Toned Boots|Dragonscale Boots|Hydrascale Boots|Wyrmscale Boots|Bronzescale Boots|Ironscale Boots|Serpentscale Boots|Leatherscale Boots'),
    ares: s('Paladin Boots|Martyr Boots|Two-Toned Boots|Crusader Boots|Legion Boots|Soldier Boots|Zealot Boots|Riveted Boots|Mesh Boots|Ringmail Boots|Chain Boots'),
    eves: s('Fugitive Boots|Infiltrator Boots|Two-Toned Boots|Murder Boots|Assassin\'s Boots|Carnal Boots|Ambush Boots|Trapper Boots|Shackled Boots|Clasped Boots|Strapped Boots|Wrapped Boots'),
  },
  Gloves: {
    ar: s('Leviathan Gauntlets|Precursor Gauntlets|Titan Gauntlets|Spiked Gloves|Vaal Gauntlets|Goliath Gauntlets|Ancient Gauntlets|Antique Gauntlets|Steel Gauntlets|Bronze Gauntlets|Plated Gauntlets|Iron Gauntlets'),
    ev: s('Phantom Mitts|Harpyskin Gloves|Gripped Gloves|Slink Gloves|Sharkskin Gloves|Stealth Gloves|Shagreen Gloves|Eelskin Gloves|Nubuck Gloves|Deerskin Gloves|Goathide Gloves|Rawhide Gloves'),
    es: s('Velour Gloves|Apothecary\'s Gloves|Warlock Gloves|Sage Gloves|Fingerless Silk Gloves|Sorcerer Gloves|Arcanist Gloves|Conjurer Gloves|Samite Gloves|Satin Gloves|Embroidered Gloves|Silk Gloves|Velvet Gloves|Wool Gloves'),
    arev: s('Wyvernscale Gauntlets|Steelscale Gauntlets|Chimerascale Gauntlets|Dragonscale Gauntlets|Hydrascale Gauntlets|Wyrmscale Gauntlets|Bronzescale Gauntlets|Ironscale Gauntlets|Serpentscale Gauntlets|Fishscale Gauntlets'),
    ares: s('Paladin Gloves|Martyr Gloves|Crusader Gloves|Legion Gloves|Soldier Gloves|Zealot Gloves|Riveted Gloves|Mesh Gloves|Ringmail Gloves|Chain Gloves'),
    eves: s('Infiltrator Mitts|Murder Mitts|Assassin\'s Mitts|Carnal Mitts|Ambush Mitts|Trapper Mitts|Clasped Mitts|Strapped Mitts|Wrapped Mitts'),
  },
  Helmets: {
    ar: s('Giantslayer Helmet|Conquest Helmet|Iron Hat|Conqueror\'s Helmet|General\'s Helmet|Royal Burgonet|Eternal Burgonet|Ezomyte Burgonet|Samnite Helmet|Reaver Helmet|Siege Helmet|Gladiator Helmet|Barbute Helmet|Cone Helmet|Battered Helm'),
    ev: s('Majestic Pelt|Dire Pelt|Grizzly Pelt|Lion Pelt|Sinner Tricorne|Noble Tricorne|Silken Hood|Ursine Pelt|Hunter Hood|Wolf Pelt|Tricorne|Leather Hood|Leather Cap'),
    es: s('Lich\'s Circlet|Sunfire Circlet|Moonlit Circlet|Hubris Circlet|Mind Cage|Solaris Circlet|Necromancer Circlet|Steel Circlet|Lunaris Circlet|Bone Circlet|Tribal Circlet|Torture Cage|Iron Circlet|Vine Circlet'),
    arev: s('Haunted Bascinet|Soldier Helmet|Nightmare Bascinet|Pig-Faced Bascinet|Fluted Bascinet|Lacquered Helmet|Close Helmet|Gilded Sallet|Visored Sallet|Secutor Helm|Fencer Helm|Sallet'),
    ares: s('Divine Crown|Paladin Crown|Knight Helm|Praetor Crown|Prophet Crown|Bone Helmet|Magistrate Crown|Faithful Helmet|Great Crown|Aventail Helmet|Zealot Helmet|Crusader Helmet|Great Helmet|Rusted Coif'),
    eves: s('Torturer\'s Mask|Ancient Mask|Jester Mask|Deicide Mask|Vaal Mask|Regicide Mask|Harlequin Mask|Callous Mask|Golden Mask|Raven Mask|Festival Mask|Iron Mask|Plague Mask|Scare Mask'),
  },
  Shields: {
    ar: s('Mahogany Tower Shield|Cedar Tower Shield|Copper Tower Shield|Pinnacle Tower Shield|Ezomyte Tower Shield|Colossal Tower Shield|Girded Tower Shield|Crested Tower Shield|Shagreen Tower Shield|Ebony Tower Shield|Bronze Tower Shield|Buckskin Tower Shield|Corroded Tower Shield|Reinforced Tower Shield|Painted Tower Shield|Rawhide Tower Shield|Splintered Tower Shield'),
    ev: s('Imperial Buckler|Crusader Buckler|Lacquered Buckler|Vaal Buckler|Golden Buckler|Ironwood Buckler|Battle Buckler|Enameled Buckler|Gilded Buckler|Oak Buckler|War Buckler|Corrugated Buckler|Hammered Buckler|Painted Buckler|Pine Buckler|Goathide Buckler'),
    es: s('Titanium Spirit Shield|Harmonic Spirit Shield|Vaal Spirit Shield|Fossilised Spirit Shield|Lacewood Spirit Shield|Thorium Spirit Shield|Chiming Spirit Shield|Ancient Spirit Shield|Ivory Spirit Shield|Walnut Spirit Shield|Brass Spirit Shield|Jingling Spirit Shield|Tarnished Spirit Shield|Bone Spirit Shield|Yew Spirit Shield|Twig Spirit Shield'),
    arev: s('Elegant Round Shield|Cardinal Round Shield|Spiny Round Shield|Crimson Round Shield|Baroque Round Shield|Teak Round Shield|Spiked Round Shield|Scarlet Round Shield|Splendid Round Shield|Maple Round Shield|Studded Round Shield|Rotted Round Shield|Fir Round Shield'),
    ares: s('Archon Kite Shield|Champion Kite Shield|Mosaic Kite Shield|Angelic Kite Shield|Branded Kite Shield|Etched Kite Shield|Ceremonial Kite Shield|Steel Kite Shield|Laminated Kite Shield|Reinforced Kite Shield|Layered Kite Shield|Linden Kite Shield|Plank Kite Shield'),
    eves: s('Alloyed Spiked Shield|Supreme Spiked Shield|Mirrored Spiked Shield|Sovereign Spiked Shield|Ezomyte Spiked Shield|Alder Spiked Shield|Compound Spiked Shield|Polished Spiked Shield|Burnished Spiked Shield|Ornate Spiked Shield|Redwood Spiked Shield|Driftwood Spiked Shield|Spiked Bundle'),
  },
};

// Other item classes, shown as groups of columns. Order follows FilterBlade's list (best first).
const GROUPS = [
  { id: 'weapons1', name: 'One-handed weapons', columns: {
    'Claws': s('Terror Claw|Vaal Claw|Great White Claw|Throat Stabber|Eye Gouger|Eagle Claw|Twin Claw|Hellion\'s Paw|Gemini Claw|Imperial Claw|Noble Claw|Prehistoric Claw|Gut Ripper|Tiger\'s Paw|Gouger|Thresher Claw|Double Claw|Fright Claw|Sparkling Claw|Timeworn Claw|Blinder|Cat\'s Paw|Awl|Sharktooth Claw|Nailed Fist'),
    'Daggers': s('Sai|Demon Dagger|Ezomyte Dagger|Ambusher|Imperial Skean|Gutting Knife|Slaughter Knife|Platinum Kris|Fiend Dagger|Trisula|Royal Skean|Golden Kris|Butcher Knife|Poignard|Imp Dagger|Copper Kris|Prong Dagger|Flaying Knife|Skean|Boot Knife|Stiletto|Carving Knife|Skinning Knife|Glass Shank'),
    'Wands': s('Convoking Wand|Profane Wand|Prophecy Wand|Coiled Wand|Demon\'s Horn|Tornado Wand|Heathen Wand|Opal Wand|Crystal Wand|Omen Wand|Kinetic Wand|Convening Wand|Faun\'s Horn|Blasting Wand|Pagan Wand|Sage Wand|Spiraled Wand|Calling Wand|Quartz Wand|Somatic Wand|Goat\'s Horn|Driftwood Wand'),
    // rapiers (thrusting swords) count as one-hand swords
    'One Hand Swords': s('Tiger Hook|Midnight Blade|Vaal Blade|Legion Sword|Gladius|Eternal Sword|Gemstone Sword|Lithe Blade|Corsair Sword|Grappler|Twilight Blade|Graceful Sword|Elder Sword|Battle Sword|Boot Blade|Baselard|Cutlass|Variscite Blade|Hook Sword|Dusk Blade|Elegant Sword|Ancient Sword|War Sword|Broad Sword|Sabre|Copper Sword|Rusted Sword|Dragoon Sword|Harpy Rapier|Vaal Rapier|Pecoraro|Spiraled Foil|Jewelled Foil|Tempered Foil|Dragonbone Rapier|Courtesan Sword|Apex Rapier|Fancy Foil|Primeval Rapier|Serrated Foil|Estoc|Burnished Foil|Battered Foil|Wyrmbone Rapier|Smallsword|Thorn Rapier|Elegant Foil|Antique Rapier|Jagged Foil|Basket Rapier|Whalebone Rapier|Rusted Spike'),
    'One Hand Axes': s('Infernal Axe|Royal Axe|Runic Hatchet|Butcher Axe|Karui Axe|Engraved Hatchet|Vaal Hatchet|Wraith Axe|Ceremonial Axe|Chest Splitter|Reaver Axe|War Axe|Siege Axe|Wrist Chopper|Tomahawk|Jasper Axe|Etched Hatchet|Spectral Axe|Decorative Axe|Arming Axe|Broad Axe|Cleaver|Boarding Axe|Jade Hatchet|Rusted Hatchet'),
    'One Hand Maces': s('Behemoth Mace|Auric Mace|Nightmare Mace|Pernach|Legion Hammer|Gavel|Tenderizer|Ancestral Club|Dragon Mace|Phantom Mace|Ornate Mace|Flanged Mace|Battle Hammer|Rock Breaker|Barbed Club|Petrified Club|Wyrm Mace|Dream Mace|Ceremonial Mace|Bladed Mace|War Hammer|Stone Hammer|Spiked Club|Tribal Club|Driftwood Club'),
    'Sceptres': s('Sambar Sceptre|Platinum Sceptre|Carnal Sceptre|Tyrant\'s Sekhem|Vaal Sceptre|Stag Sceptre|Karui Sceptre|Abyssal Sceptre|Void Sceptre|Opal Sceptre|Royal Sceptre|Blood Sceptre|Lead Sceptre|Crystal Sceptre|Sekhem|Horned Sceptre|Grinning Fetish|Shadow Sceptre|Ritual Sceptre|Ochre Sceptre|Iron Sceptre|Quartz Sceptre|Bronze Sceptre|Darkwood Sceptre|Driftwood Sceptre'),
  } },
  { id: 'weapons2', name: 'Two-handed weapons', columns: {
    'Bows': s('Maraketh Bow|Harbinger Bow|Assassin Bow|Ranger Bow|Imperial Bow|Citadel Bow|Steelwood Bow|Decimation Bow|Spine Bow|Sniper Bow|Highborn Bow|Thicket Bow|Ivory Bow|Short Bow|Compound Bow|Grove Bow|Decurve Bow|Royal Bow|Bone Bow|Reflex Bow|Death Bow|Recurve Bow|Composite Bow|Long Bow|Crude Bow'),
    'Staves': s('Eclipse Staff|Judgement Staff|Imperial Staff|Lathi|Primordial Staff|Moon Staff|Maelström Staff|Foul Staff|Highborn Staff|Ezomyte Staff|Serpentine Staff|Quarterstaff|Military Staff|Woodful Staff|Crescent Staff|Vile Staff|Royal Staff|Coiled Staff|Long Staff|Iron Staff|Primitive Staff|Gnarled Branch'),
    'Two Hand Swords': s('Exquisite Blade|Infernal Sword|Lion Sword|Vaal Greatsword|Ezomyte Blade|Headman\'s Sword|Wraith Sword|Tiger Sword|Reaver Sword|Engraved Greatsword|Highland Blade|Footman Sword|Butcher Sword|Curved Blade|Spectral Sword|Ornate Sword|Etched Greatsword|Two-Handed Sword|Bastard Sword|Longsword|Corroded Blade'),
    'Two Hand Axes': s('Fleshripper|Void Axe|Talon Axe|Karui Chopper|Abyssal Axe|Sundering Axe|Noble Axe|Labrys|Despot Axe|Vaal Axe|Ezomyte Axe|Headsman Axe|Timber Axe|Jasper Chopper|Dagger Axe|Shadow Axe|Gilded Axe|Double Axe|Poleaxe|Woodsplitter|Jade Chopper|Stone Axe'),
    'Two Hand Maces': s('Coronal Maul|Terror Maul|Colossus Mallet|Imperial Maul|Solar Maul|Karui Maul|Meatgrinder|Dread Maul|Piledriver|Plated Maul|Spiny Maul|Steelhead|Great Mallet|Totemic Maul|Morning Star|Fright Maul|Brass Maul|Jagged Maul|Sledgehammer|Mallet|Tribal Maul|Driftwood Maul'),
    'Quivers': s('Artillery Quiver|Primal Arrow Quiver|Vile Arrow Quiver|Heavy Arrow Quiver|Blazing Arrow Quiver|Broadhead Arrow Quiver|Spike-Point Arrow Quiver|Feathered Arrow Quiver|Two-Point Arrow Quiver|Blunt Arrow Quiver|Sharktooth Arrow Quiver|Penetrating Arrow Quiver|Fire Arrow Quiver|Serrated Arrow Quiver'),
  } },
  { id: 'jewellery', name: 'Jewellery', columns: {
    'Rings': s('Cerulean Ring|Vermillion Ring|Iolite Ring|Opal Ring|Steel Ring|Amethyst Ring|Bone Ring|Two-Stone Ring|Unset Ring|Prismatic Ring|Diamond Ring|Moonstone Ring|Ruby Ring|Topaz Ring|Sapphire Ring|Coral Ring|Gold Ring|Paua Ring|Iron Ring'),
    'Amulets': s('Blue Pearl Amulet|Marble Amulet|Seaglass Amulet|Onyx Amulet|Agate Amulet|Citrine Amulet|Turquoise Amulet|Amber Amulet|Jade Amulet|Lapis Amulet|Gold Amulet|Coral Amulet|Paua Amulet'),
    'Belts': s('Stygian Vise|Vanguard Belt|Crystal Belt|Heavy Belt|Leather Belt|Cloth Belt|Studded Belt|Chain Belt|Rustic Sash'),
  } },
  // Heist bases: only from Heist (blueprints, contracts, Rogue rewards). NeverSink lists them as "exotic heist bases".
  { id: 'heist', name: 'Heist bases', columns: {
    'One-handed weapons': s('Void Fangs|Malign Fangs|Pressurised Dagger|Pneumatic Dagger|Capricious Spiritblade|Anarchic Spiritblade|Banishing Blade|Blasting Blade|Flashfire Blade|Infernal Blade|Psychotic Axe|Disapprobation Axe|Crack Mace|Boom Mace|Stabilising Sceptre|Oscillating Sceptre|Alternating Sceptre|Accumulator Wand|Congregator Wand|Crushing Force Magnifier|Impact Force Propagator'),
    'Two-handed weapons': s('Solarine Bow|Foundry Bow|Reciprocation Staff|Battery Staff|Potentiality Rod|Eventuality Rod|Apex Cleaver|Honed Cleaver'),
    'Shields': s('Magmatic Tower Shield|Heat-attuned Tower Shield|Polar Buckler|Cold-attuned Buckler|Subsuming Spirit Shield|Transfer-attuned Spirit Shield'),
    'Rings': s('Ratcheting Ring|Manifold Ring|Helical Ring|Geodesic Ring|Composite Ring|Cogwork Ring'),
    'Amulets & belts': s('Astrolabe Amulet|Simplex Amulet|Focused Amulet|Micro-Distillery Belt|Mechalarm Belt|Mechanical Belt'),
  } },
  // Ritual bases: only from Ritual (the Tribute shop). NeverSink lists them as "exotic ritual bases".
  { id: 'ritual', name: 'Ritual bases', columns: {
    Boots: s('Dreamquest Slippers|Nightwind Slippers|Duskwalk Slippers|Cloudwhisper Boots|Windbreak Boots|Stormrider Boots|Brimstone Treads|Darksteel Treads|Basemetal Treads'),
    Gloves: s('Thwarting Gauntlets|Guarding Gauntlets|Preserving Gauntlets|Trapsetter Gloves|Apprentice Gloves|Tinker Gloves|Nexus Gloves|Aetherwind Gloves|Leyline Gloves'),
    Helmets: s('Blizzard Crown|Winter Crown|Gale Crown|Archdemon Crown|Demon Crown|Imp Crown|Atonement Mask|Penitent Mask|Sorrow Mask'),
  } },
  { id: 'flasks', name: 'Flasks & jewels', columns: {
    'Flasks': s('Eternal Life Flask|Eternal Mana Flask|Divine Life Flask|Divine Mana Flask|Sanctified Life Flask|Sanctified Mana Flask|Hallowed Life Flask|Hallowed Mana Flask|Sacred Life Flask|Sacred Mana Flask|Colossal Life Flask|Colossal Mana Flask|Aquamarine Flask|Basalt Flask|Corundum Flask|Diamond Flask|Gold Flask|Granite Flask|Jade Flask|Quartz Flask|Silver Flask|Stibnite Flask|Sulphur Flask|Giant Life Flask|Giant Mana Flask|Amethyst Flask|Grand Life Flask|Grand Mana Flask|Ruby Flask|Sapphire Flask|Topaz Flask|Greater Life Flask|Greater Mana Flask|Bismuth Flask|Large Life Flask|Large Mana Flask|Quicksilver Flask|Medium Life Flask|Medium Mana Flask|Small Life Flask|Small Mana Flask'),
    'Jewels': s('Cobalt Jewel|Crimson Jewel|Viridian Jewel|Ghastly Eye Jewel|Hypnotic Eye Jewel|Murderous Eye Jewel|Searching Eye Jewel'),
  } },
];

module.exports = { DEFENCES, CLASSES, BASES, GROUPS };
