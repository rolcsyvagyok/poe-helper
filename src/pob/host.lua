-- PoE Helper's host for Path of Building (Community), run headless with PoB's own LuaJIT.
-- Path of Building is MIT licensed (c) 2016 David Gowor and contributors; this file follows its
-- HeadlessWrapper.lua. It loads your installed PoB, then answers requests from the app:
--   load(xml)           a build from your PoB builds folder
--   compare(itemText)   what equipping that item does to the build's DPS, life and defences
--   import(character)   a new build from your character on pathofexile.com, the way PoB's Import tab makes it
-- PoB's files start with a "#@" line its own launcher reads; plain Lua can't, so it's skipped here.

local l_loadfile = loadfile
local function readSource(path)
	local f, err = io.open(path, "rb")
	if not f then return nil, err end
	local text = f:read("*a")
	f:close()
	if text:sub(1, 2) == "#@" then text = "--" .. text end
	return text
end
function loadfile(path, ...)
	if path == nil then return l_loadfile(path, ...) end
	local text, err = readSource(path)
	if not text then return nil, err end
	return loadstring(text, "@" .. path)
end
function dofile(path)
	local f, err = loadfile(path)
	if not f then error(err, 2) end
	return f()
end
table.insert(package.loaders, 2, function(name)
	local rel = name:gsub("%.", "/")
	for pattern in package.path:gmatch("[^;]+") do
		local path = pattern:gsub("%?", rel)
		local f = io.open(path, "rb")
		if f then
			f:close()
			local fn, err = loadfile(path)
			if fn then return fn end
			error(err)
		end
	end
end)

arg = arg or { } -- the command line; PoB reads it, and there is none inside the app
-- PoB's stand-ins for its graphics runtime: the app runs its own copy first (src/pob/SimpleGraphic.lua),
-- because an installed Path of Building doesn't have this file; a source checkout of PoB does
if not SetCallback then dofile("_SimpleGraphic.def.lua") end
function GetVirtualScreenSize() return 1920, 1080 end
__callbackTable__ = { }
function runCallback(name, ...)
	if __callbackTable__[name] then
		return __callbackTable__[name](...)
	elseif __mainObject__ and __mainObject__[name] then
		return __mainObject__[name](__mainObject__, ...)
	end
end
local l_require = require
function require(name)
	if name == "lcurl.safe" then return end
	return l_require(name)
end

-- PoB caches its unpacked timeless jewel tables as .bin files in its own folder; the app doesn't write there
do
	local open = io.open
	io.open = function(name, mode)
		if type(name) == "string" and mode and mode:find("w") and name:find("TimelessJewelData") and name:find("%.bin$") then return nil end
		return open(name, mode)
	end
end
dofile("Launch.lua")
__mainObject__.continuousIntegrationMode = false
runCallback("OnInit")
runCallback("OnFrame")
if __mainObject__.promptMsg then
	POEHELPER_STARTUP_ERROR = tostring(__mainObject__.promptMsg)
	function handle() return '{"error":"Path of Building could not start"}' end
	if not POEHELPER_EMBEDDED then io.stdout:write("ERR\t" .. POEHELPER_STARTUP_ERROR:gsub("\n", " ") .. "\n"); io.stdout:flush() end
	return
end

local dkjson = require("dkjson")
local applyConfig -- set further down (PoB's Configuration tab)
local autoConfig -- set further down too
-- An item from its text. PoB's released versions build it with new("Item", raw); its newer code with
-- newItem(raw). Works with both.
local function newItem(raw)
	local o = new("Item")
	if type(o.Item) == "function" then return o:Item(raw) end
	return new("Item", raw)
end
-- a slot the build has: PoB hides some (a third ring, abyssal sockets) unless something grants them
local function usable(slot)
	if not slot or slot.inactive then return false end
	if type(slot.shown) == "function" then
		local ok, v = pcall(slot.shown)
		if ok and not v then return false end
	end
	return true
end
local build

local function loadBuild(xml, name)
	__mainObject__.main:SetMode("BUILD", false, name or "", xml)
	runCallback("OnFrame")
	build = __mainObject__.main.modes["BUILD"]
	return build ~= nil
end

-- the numbers worth showing, from a calculated output
local STATS = { "FullDPS", "CombinedDPS", "TotalDPS", "TotalDotDPS", "AverageHit", "Speed", "CritChance",
	"Life", "EnergyShield", "Mana", "Ward", "Armour", "Evasion", "TotalEHP", "SpellSuppressionChance", "BlockChance",
	"FireResist", "ColdResist", "LightningResist", "ChaosResist", "MovementSpeedMod", "LifeRegenRecovery", "Str", "Dex", "Int" }
local function pick(out)
	local r = { }
	for _, k in ipairs(STATS) do
		local v = out[k]
		if type(v) == "number" and v == v and v ~= math.huge then r[k] = v end
	end
	return r
end

local function summary()
	local out = build.calcsTab.mainOutput
	local skill = build.calcsTab.mainEnv and build.calcsTab.mainEnv.player.mainSkill
	return {
		name = build.buildName, class = build.spec and build.spec.curClassName, ascendancy = build.spec and build.spec.curAscendClassName,
		level = build.characterLevel, skill = skill and skill.activeEffect and skill.activeEffect.grantedEffect and skill.activeEffect.grantedEffect.name,
		stats = pick(out),
	}
end

-- every slot the item could go in, with what it does there (like PoB's item tooltip)
local function compare(text)
	local item = newItem(text)
	if not item.base then return { error = "PoB doesn't know this item's base." } end
	local calcFunc, base = build.calcsTab:GetMiscCalculator()
	-- builds that count every skill ("Full DPS") are compared on that, the rest on the main skill
	local full = (base.FullDPS or 0) > 0
	local slots = { }
	for _, slot in pairs(build.itemsTab.slots) do
		if usable(slot) and build.itemsTab:IsItemValidForSlot(item, slot.slotName) then
			local cur = build.itemsTab.items[slot.selItemId]
			local out = calcFunc({ repSlotName = slot.slotName, repItem = item }, full)
			slots[#slots + 1] = { slot = slot.slotName, current = cur and cur.name or nil, stats = pick(out) }
		end
	end
	table.sort(slots, function(a, b) return a.slot < b.slot end)
	return { item = item.name, full = full, base = pick(base), slots = slots }
end

-- The socket group whose skill does the most damage becomes the main skill.
local function groupDps()
	local o = build.calcsTab.mainOutput or { }
	return math.max(o.CombinedDPS or 0, o.TotalDPS or 0, o.TotalDotDPS or 0)
end
local function setMainGroup(i)
	build.mainSocketGroup = i
	build.buildFlag = true
	runCallback("OnFrame")
end
local function pickMainSkill()
	local groups = build.skillsTab.socketGroupList
	local best, bestDps = build.mainSocketGroup, -1
	for i, g in ipairs(groups) do
		local active = false
		for _, gem in ipairs(g.gemList or { }) do
			local ge = gem.gemData and gem.gemData.grantedEffect or gem.grantedEffect
			if ge and not ge.support and gem.enabled ~= false then active = true end
		end
		if active and g.enabled ~= false then
			setMainGroup(i)
			local d = groupDps()
			if d > bestDps then best, bestDps = i, d end
		end
	end
	setMainGroup(best)
end
local function skillGroups()
	local list = { }
	for i, g in ipairs(build.skillsTab.socketGroupList) do
		local names = { }
		for _, gem in ipairs(g.gemList or { }) do
			local ge = gem.gemData and gem.gemData.grantedEffect or gem.grantedEffect
			if ge and not ge.support then names[#names + 1] = gem.nameSpec end
		end
		if #names > 0 and g.enabled ~= false then list[#list + 1] = { index = i, name = table.concat(names, ", "), slot = g.slot, main = i == build.mainSocketGroup } end
	end
	return list
end

-- A snapshot of a character: PoB's own Import tab code, fed the same answers pathofexile.com gives it
-- (character-window/get-passive-skills and get-items), into a new build. Returns the build file's text.
local function importCharacter(req)
	if not loadBuild(nil, req.name) then return { error = "PoB couldn't make a new build." } end
	local tab = build.importTab
	local passives = req.passives or { }
	-- like ImportTab:DownloadPassiveTree: quest choices the site leaves out keep the build's values
	passives.bandit_choice = passives.bandit_choice or build.configTab.input.bandit
	passives.pantheon_major = passives.pantheon_major or build.configTab.input.pantheonMajorGod
	passives.pantheon_minor = passives.pantheon_minor or build.configTab.input.pantheonMinorGod
	local tree = copyTable(req.character)
	tree.passives = passives
	tree.jewels = passives.items
	tab:ImportPassiveTreeAndJewels(tree, true)
	-- like ImportTab:DownloadItems, with "delete equipment" and "delete skills" ticked
	local gear = copyTable(req.character)
	gear.equipment = (req.items and req.items.items) or { }
	gear.guardian = req.items and req.items.guardian
	tab:ImportItemsAndSkills(gear, true, true, false)
	tab.lastCharacterHash = common.sha1(req.character.name or "")
	-- your Configuration ticks for this character, so a new snapshot doesn't need them again
	if req.config then applyConfig(req.config) end
	build.buildFlag = true
	runCallback("OnFrame")
	-- PoB's import makes the group with the most gems the main skill (often an aura link); take the one
	-- that does the most damage instead
	pickMainSkill()
	-- then the Configuration ticks the build tells (charges, Onslaught and other buffs, rage...)
	local autoList
	if req.auto ~= false then
		local ok, vals, list = pcall(autoConfig)
		if ok and next(vals) then applyConfig(vals); autoList = list; pickMainSkill() end
	end
	local xml = build:SaveDB(req.name or "snapshot")
	if not xml then return { error = "PoB couldn't write the build." } end
	local s = summary()
	s.xml = xml
	s.autoConfig = autoList
	return s
end

-- Everything about the loaded build, like PoB's left-hand stat panel plus its gear and gems.
local DETAIL = { "FullDPS", "CombinedDPS", "TotalDPS", "TotalDotDPS", "WithPoisonDPS", "WithBleedDPS", "IgniteDPS", "BleedDPS", "PoisonDPS", "ImpaleDPS",
	"AverageHit", "AverageDamage", "Speed", "HitChance", "CritChance", "CritMultiplier", "ManaCost", "LifeCost",
	"Life", "LifeUnreserved", "LifeRegenRecovery", "LifeLeechGainRate", "EnergyShield", "EnergyShieldRegenRecovery", "Mana", "ManaUnreserved", "ManaRegenRecovery", "Ward",
	"TotalEHP", "PhysicalMaximumHitTaken", "FireMaximumHitTaken", "ColdMaximumHitTaken", "LightningMaximumHitTaken", "ChaosMaximumHitTaken",
	"Armour", "PhysicalDamageReduction", "Evasion", "MeleeEvadeChance", "ProjectileEvadeChance", "BlockChance", "SpellBlockChance", "SpellSuppressionChance",
	"FireResist", "ColdResist", "LightningResist", "ChaosResist", "FireResistOverCap", "ColdResistOverCap", "LightningResistOverCap", "ChaosResistOverCap",
	"FireResistTotal", "ColdResistTotal", "LightningResistTotal", "ChaosResistTotal",
	"PowerChargesMax", "FrenzyChargesMax", "EnduranceChargesMax", "MovementSpeedMod", "Str", "Dex", "Int", "Devotion" }
local function detail(out)
	local r = { }
	for _, k in ipairs(DETAIL) do
		local v = out[k]
		if type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge then r[k] = v end
	end
	return r
end
-- an item's text for the gear tooltip: PoB's own item text, without its bookkeeping lines
local HIDE_LINES = { "BasePercentile:", "^Unique ID:", "^Item Level:", "^LevelReq:", "^Prefix:", "^Suffix:", "^Selected Variant:", "^Has Alt Variant", "^Selected Alt Variant", "^League:", "^Catalyst", "^Radius:", "^Limited to:", "^Variant:", "^Crafted:", "^Quality:", "^Sockets:", "^Influence" }
local function itemText(item)
	local ok, raw = pcall(item.BuildRaw, item)
	if not ok or type(raw) ~= "string" then return nil end
	local out = { }
	for line in raw:gmatch("[^\n]+") do
		local keep = true
		for _, p in ipairs(HIDE_LINES) do if line:match(p) then keep = false break end end
		if keep then out[#out + 1] = (line:gsub("{[^}]*}", "")) end
	end
	return table.concat(out, "\n")
end
local GEAR = { "Weapon 1", "Weapon 2", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Ring 3", "Belt",
	"Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5" }
local function gear()
	local list = { }
	for _, name in ipairs(GEAR) do
		local slot = build.itemsTab.slots[name]
		local item = usable(slot) and build.itemsTab.items[slot.selItemId]
		if item then list[#list + 1] = { slot = name, name = item.name, title = item.title, base = item.baseName, rarity = item.rarity, text = itemText(item) } end
	end
	-- jewels in the tree
	for _, slot in pairs(build.itemsTab.slots) do
		local item = slot.nodeId and build.itemsTab.items[slot.selItemId]
		if item and build.spec.allocNodes[slot.nodeId] then list[#list + 1] = { slot = "Jewel", name = item.name, title = item.title, base = item.baseName, rarity = item.rarity, text = itemText(item) } end
	end
	return list
end
local function gems()
	local list = { }
	for i, group in ipairs(build.skillsTab.socketGroupList) do
		local g = { slot = group.slot, label = group.label ~= "" and group.label or nil, enabled = group.enabled ~= false, main = i == build.mainSocketGroup, gems = { } }
		for _, gem in ipairs(group.gemList) do
			local ge = gem.gemData and gem.gemData.grantedEffect or gem.grantedEffect
			g.gems[#g.gems + 1] = { name = gem.nameSpec, level = gem.level, quality = gem.quality, enabled = gem.enabled ~= false, support = ge and ge.support or false }
		end
		if #g.gems > 0 then list[#list + 1] = g end
	end
	return list
end
local function stats(mainGroup)
	if mainGroup and build.skillsTab.socketGroupList[mainGroup] and mainGroup ~= build.mainSocketGroup then setMainGroup(mainGroup) end
	local out = build.calcsTab.mainOutput
	local s = summary()
	s.detail = detail(out)
	local skills = { }
	for _, sk in ipairs(out.SkillDPS or { }) do skills[#skills + 1] = { name = sk.name, dps = sk.dps, count = sk.count, part = sk.skillPart } end
	-- PoB only fills the full DPS list when a skill is ticked "include in full DPS"
	if #skills == 0 then
		local calcFunc = build.calcsTab:GetMiscCalculator()
		local o = calcFunc({ }, true)
		for _, sk in ipairs(o.SkillDPS or { }) do skills[#skills + 1] = { name = sk.name, dps = sk.dps, count = sk.count, part = sk.skillPart } end
	end
	s.skills = skills
	s.gear = gear()
	s.gems = gems()
	s.skillGroups = skillGroups()
	s.mainGroup = build.mainSocketGroup
	return s
end

-- Upgrade finder: each gear slot's item with one more good mod, the way PoB's trade search weighs mods.
-- Candidates are typical high rolls; only mods that item kind can have are tried.
local KINDS = {
	["Weapon 1"] = "weapon", ["Weapon 2"] = "offhand", Helmet = "helmet", ["Body Armour"] = "body", Gloves = "gloves", Boots = "boots",
	Amulet = "amulet", ["Ring 1"] = "ring", ["Ring 2"] = "ring", ["Ring 3"] = "ring", Belt = "belt" }
local ARMOUR = { helmet = true, body = true, gloves = true, boots = true, shield = true }
local CANDIDATES = {
	{ "+90 to maximum Life", { helmet = 1, body = 1, gloves = 1, boots = 1, belt = 1, amulet = 1, ring = 1, shield = 1 } },
	{ "+48 to maximum Energy Shield", { amulet = 1, ring = 1, belt = 1 } },
	{ "+60 to maximum Energy Shield", { helmet = 1, body = 1, gloves = 1, boots = 1, shield = 1 } },
	{ "100% increased Energy Shield", { helmet = 1, body = 1, gloves = 1, boots = 1, shield = 1 } },
	{ "100% increased Armour", { helmet = 1, body = 1, gloves = 1, boots = 1, shield = 1 } },
	{ "100% increased Evasion Rating", { helmet = 1, body = 1, gloves = 1, boots = 1, shield = 1 } },
	{ "+20% chance to Suppress Spell Damage", { body = 1, gloves = 1, boots = 1, shield = 1 } },
	{ "+45% to Fire Resistance", { helmet = 1, body = 1, gloves = 1, boots = 1, belt = 1, amulet = 1, ring = 1, shield = 1 } },
	{ "+45% to Cold Resistance", { helmet = 1, body = 1, gloves = 1, boots = 1, belt = 1, amulet = 1, ring = 1, shield = 1 } },
	{ "+45% to Lightning Resistance", { helmet = 1, body = 1, gloves = 1, boots = 1, belt = 1, amulet = 1, ring = 1, shield = 1 } },
	{ "+35% to Chaos Resistance", { helmet = 1, body = 1, gloves = 1, boots = 1, belt = 1, amulet = 1, ring = 1, shield = 1 } },
	{ "+16% to all Elemental Resistances", { amulet = 1, ring = 1 } },
	{ "+50 to Strength", { helmet = 1, body = 1, gloves = 1, boots = 1, belt = 1, amulet = 1, ring = 1 } },
	{ "+50 to Dexterity", { helmet = 1, body = 1, gloves = 1, boots = 1, amulet = 1, ring = 1, weapon = 1 } },
	{ "+50 to Intelligence", { helmet = 1, body = 1, gloves = 1, boots = 1, amulet = 1, ring = 1, weapon = 1 } },
	{ "30% increased Movement Speed", { boots = 1 } },
	{ "+5% Chance to Block", { shield = 1 } },
	-- offence on jewellery and gloves
	{ "Adds 16 to 28 Physical Damage to Attacks", { gloves = 1, amulet = 1, ring = 1 } },
	{ "Adds 30 to 55 Fire Damage to Attacks", { gloves = 1, amulet = 1, ring = 1 } },
	{ "Adds 30 to 55 Cold Damage to Attacks", { gloves = 1, amulet = 1, ring = 1 } },
	{ "Adds 6 to 90 Lightning Damage to Attacks", { gloves = 1, amulet = 1, ring = 1 } },
	{ "16% increased Attack Speed", { gloves = 1, amulet = 1, ring = 1, shield = 1 } },
	{ "15% increased Cast Speed", { amulet = 1, ring = 1, shield = 1 } },
	{ "38% increased Global Critical Strike Chance", { amulet = 1, ring = 1 } },
	{ "+38% to Global Critical Strike Multiplier", { amulet = 1, ring = 1, gloves = 1 } },
	{ "42% increased Elemental Damage with Attack Skills", { amulet = 1, ring = 1, belt = 1 } },
	{ "30% increased Spell Damage", { amulet = 1, ring = 1, shield = 1 } },
	{ "+1 to Level of all Skill Gems", { amulet = 1 } },
	{ "+1 to Level of all Minion Skill Gems", { helmet = 1, amulet = 1 } },
	-- weapons (local to the weapon)
	{ "170% increased Physical Damage", { weapon = 1 } },
	{ "Adds 25 to 50 Physical Damage", { weapon = 1 } },
	{ "Adds 80 to 140 Fire Damage", { weapon = 1 } },
	{ "27% increased Attack Speed", { weapon = 1 } },
	{ "38% increased Critical Strike Chance", { weapon = 1 } },
	{ "+38% to Global Critical Strike Multiplier", { weapon = 1 } },
	{ "100% increased Spell Damage", { weapon = 1 } },
	{ "+2 to Level of all Spell Skill Gems", { weapon = 1 } },
}
local function upgrades()
	local calcFunc, base = build.calcsTab:GetMiscCalculator()
	local full = (base.FullDPS or 0) > 0
	local function dps(o) return full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0) end
	local baseDps, baseEhp, baseLife, baseEs = dps(base), base.TotalEHP or 0, base.Life or 0, base.EnergyShield or 0
	local out = { full = full, base = { dps = baseDps, ehp = baseEhp }, slots = { } }
	for _, name in ipairs({ "Weapon 1", "Weapon 2", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Belt" }) do
		local slot = build.itemsTab.slots[name]
		local item = usable(slot) and build.itemsTab.items[slot.selItemId]
		local kind = KINDS[name]
		if item and kind and item.rarity ~= "UNIQUE" and item.rarity ~= "RELIC" then
			if kind == "offhand" then kind = item.type == "Shield" and "shield" or (item.base and item.base.weapon and "weapon") or nil end
			if kind == "weapon" and item.type == "Shield" then kind = "shield" end
		else kind = nil end
		if kind then
			local res = { slot = name, item = item.name, mods = { } }
			for _, c in ipairs(CANDIDATES) do
				if c[2][kind] then
					local test = newItem(item:BuildRaw())
					test.explicitModLines[#test.explicitModLines + 1] = { line = c[1], custom = true }
					test:BuildAndParseRaw()
					local o = calcFunc({ repSlotName = name, repItem = test }, full)
					local d, e = dps(o), o.TotalEHP or 0
					local m = { mod = c[1], dps = d - baseDps, dpsPct = baseDps > 0 and (d - baseDps) / baseDps * 100 or 0,
						ehp = e - baseEhp, ehpPct = baseEhp > 0 and (e - baseEhp) / baseEhp * 100 or 0, life = (o.Life or 0) - baseLife, es = (o.EnergyShield or 0) - baseEs }
					if math.abs(m.dpsPct) >= 0.05 or math.abs(m.ehpPct) >= 0.05 then res.mods[#res.mods + 1] = m end
				end
			end
			out.slots[#out.slots + 1] = res
		end
	end
	return out
end

-- Trade search weights: the slot's item swapped for a blank one of the same base, then one mod at a time
-- on that blank item. What each mod does (DPS and effective HP, in %) against the blank item, and what your
-- item does against it, so the search can ask for items at least as good.
local function weights(req)
	local slot = build.itemsTab.slots[req.slot]
	if not usable(slot) then return { error = "This build has no " .. tostring(req.slot) .. " slot." } end
	local cur = build.itemsTab.items[slot.selItemId]
	local baseName = cur and cur.baseName or req.base
	if not baseName then return { error = "Nothing in " .. req.slot .. " to search for; put an item there in the build first." } end
	local function make(lines)
		local raw = "Rarity: Rare\nNew Item\n" .. baseName .. "\nItem Level: 86\n--------\n" .. table.concat(lines, "\n")
		local it = newItem(raw)
		return it
	end
	local blank = make({ })
	if not blank.base then return { error = "PoB doesn't know the base " .. baseName .. "." } end
	local calcFunc, base = build.calcsTab:GetMiscCalculator()
	local full = (base.FullDPS or 0) > 0
	local function dps(o) return full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0) end
	local b = calcFunc({ repSlotName = req.slot, repItem = blank }, full)
	local bd, be = dps(b), b.TotalEHP or 0
	local function rel(o) return { dpsPct = bd > 0 and (dps(o) - bd) / bd * 100 or 0, ehpPct = be > 0 and ((o.TotalEHP or 0) - be) / be * 100 or 0 } end
	local out = { slot = req.slot, base = baseName, type = blank.type, full = full, level = build.characterLevel, results = { } }
	out.current = cur and rel(base) or { dpsPct = 0, ehpPct = 0 }
	out.currentName = cur and cur.name or nil
	for i, line in ipairs(req.lines or { }) do
		local it = make({ line })
		out.results[i] = rel(calcFunc({ repSlotName = req.slot, repItem = it }, full))
	end
	return out
end

-- PoB's Configuration tab: its options for the loaded build (the ones PoB shows for this build, plus any you
-- set that it hides), and setting them. Values: true/false for ticks, numbers, list values, text.
local configVars
local function cleanLabel(l)
	if type(l) ~= "string" then return nil end
	return (l:gsub("%^x%x%x%x%x%x%x", ""):gsub("%^%d", ""):gsub(":%s*$", ""))
end
local function configInput()
	local tab = build.configTab
	return tab.configSets and tab.configSets[tab.activeConfigSetId].input or tab.input
end
local function configList()
	configVars = configVars or LoadModule("Modules/ConfigOptions")
	local tab = build.configTab
	local input = configInput()
	local out, section = { }, nil
	for _, v in ipairs(configVars) do
		if v.section then
			section = v.section
		elseif v.var and v.type and v.type ~= "text" and section ~= "Custom Modifiers" then
			local ctrl = tab.varControls and tab.varControls[v.var]
			local shown = true
			if ctrl and ctrl.shown ~= nil then
				if type(ctrl.shown) == "function" then
					local ok, r = pcall(ctrl.shown, ctrl)
					shown = not ok or not not r
				else shown = not not ctrl.shown end
			end
			local cur = input[v.var]
			local def = tab:GetDefaultState(v.var, type(cur))
			local list
			if v.list then
				list = { }
				-- map mods: their proper names from PoB's map mod data, not the dropdown's packed labels
				local affixes = v.var:match("^Map[PS][ru][ef][f]?[ix]*%d$") and data.mapMods and data.mapMods.AffixData
				for _, it in ipairs(v.list) do
					local label = cleanLabel(it.label) or tostring(it.val)
					if affixes and it.val ~= "NONE" then
						local a = affixes[it.val]
						local what = a and cleanLabel(a.label)
						what = what and what:gsub("[?:]%s*$", "") or nil
						label = what and (it.val .. ": " .. what) or tostring(it.val)
					end
					list[#list + 1] = { val = it.val, label = label }
				end
			end
			out[#out + 1] = { var = v.var, label = cleanLabel(v.label) or v.var, section = section, type = v.type, value = cur, default = def,
				changed = cur ~= nil and cur ~= def, shown = shown, list = list, tooltip = type(v.tooltip) == "string" and cleanLabel(v.tooltip) or nil }
		end
	end
	return { options = out }
end
function applyConfig(values)
	if type(values) ~= "table" then return end
	local input = configInput()
	local ctrls = build.configTab.varControls or { }
	for k, v in pairs(values) do
		if v == dkjson.null then v = nil end
		input[k] = v
		-- PoB reads some choices (the map tier) from its dropdown, not the value: keep the dropdown in step
		local c = ctrls[k]
		if c and c.SelByValue and v ~= nil then pcall(c.SelByValue, c, v, "val") end
		if c and c.state ~= nil and type(v) == "boolean" then c.state = v end
	end
	build.configTab:BuildModList()
	build.buildFlag = true
	runCallback("OnFrame")
end

-- one request (a JSON line) -> one answer (a JSON line)
-- PoB's Calcs tab: every section, row and cell as PoB shows them now (cells are referred to as "s:ss:r:c")
local function calcsTab() return build.calcsTab end
local function calcsActor()
	local ct = calcsTab()
	return ct.input.showMinion and ct.calcsEnv.minion or ct.calcsEnv.player
end
local function colourOf(c)
	if type(c) == "string" then return c end
	if type(c) == "table" then return string.format("^x%02X%02X%02X", math.floor((c[1] or 0) * 255 + 0.5), math.floor((c[2] or 0) * 255 + 0.5), math.floor((c[3] or 0) * 255 + 0.5)) end
	return nil
end
local function calcs()
	local ct = calcsTab()
	-- the Calcs tab has a skill picker of its own: show the build's main skill there
	local grp = build.skillsTab.socketGroupList[build.mainSocketGroup or 1]
	if ct.input.skill_number ~= build.mainSocketGroup or not ct.calcsEnv or (grp and grp.mainActiveSkillCalcs ~= grp.mainActiveSkill) then
		ct.input.skill_number = build.mainSocketGroup or 1
		if grp then grp.mainActiveSkillCalcs = grp.mainActiveSkill end
		ct:BuildOutput()
	end
	local actor = calcsActor()
	local out = { }
	for si, sec in ipairs(ct.sectionList) do
		local secOn = ct:CheckFlag(sec)
		local subs = { }
		local any = false
		for ssi, sub in ipairs(sec.subSection or { }) do
			local rows = { }
			if secOn then
				for ri, row in ipairs(sub.data or { }) do
					if ct:CheckFlag(row) then
						local cells = { }
						for ci, col in ipairs(row) do
							if col.format and not col.control and ct:CheckFlag(col) then
								local ok, txt = pcall(formatCalcStr, col.format, actor, col)
								local hasBreakdown = false
								for _, d in ipairs(col) do if d.breakdown or d.modName then hasBreakdown = true break end end
								cells[#cells + 1] = { ref = si..":"..ssi..":"..ri..":"..ci, text = ok and tostring(txt) or "?", breakdown = hasBreakdown }
							else
								cells[#cells + 1] = { text = "" }
							end
						end
						local filled = false
						for _, c in ipairs(cells) do if c.ref then filled = true break end end
						if filled then
							rows[#rows + 1] = { label = row.label, color = row.color, bg = colourOf(row.bgCol), cells = cells }
							any = true
						end
					end
				end
			end
			local extra = nil
			if secOn and sub.data and sub.data.extra then
				local ok, t = pcall(formatCalcStr, sub.data.extra, actor)
				extra = ok and tostring(t) or nil
			end
			subs[#subs + 1] = { label = sub.label, extra = extra, collapsed = sub.defaultCollapsed or nil, rows = rows }
		end
		if not sec.hasControls then
			out[#out + 1] = { id = sec.id, group = sec.group, width = sec.width, colour = colourOf(sec.colour), on = (secOn and any) or false, subs = subs }
		end
	end
	local ms = ct.calcsEnv.player.mainSkill
	local flags = { }
	for k, v in pairs(ms and ms.skillFlags or { }) do if v then flags[#flags + 1] = k end end
	return { sections = out, colWidth = ct.colWidth, skill = ms and ms.activeEffect and ms.activeEffect.grantedEffect and ms.activeEffect.grantedEffect.name, group = ct.input.skill_number, flags = table.concat(flags, ",") }
end

-- what PoB shows when you hover a cell: its breakdown (text lines and tables)
local function str(v)
	if type(v) == "string" then return v end
	if type(v) == "number" then return formatNumSep and formatNumSep(tostring(round(v, 2))) or tostring(v) end
	if type(v) == "boolean" then return v and "Yes" or "No" end
	return nil
end
local function breakdown(ref)
	local ct = calcsTab()
	local si, ssi, ri, ci = ref:match("^(%d+):(%d+):(%d+):(%d+)$")
	local sec = ct.sectionList[tonumber(si or 0)]
	local sub = sec and sec.subSection[tonumber(ssi)]
	local row = sub and sub.data[tonumber(ri)]
	local col = row and row[tonumber(ci)]
	if not col then return { error = "No such cell." } end
	local bd = ct.controls.breakdown
	bd:SetBreakdownData(nil)
	bd.sourceData = nil
	bd:SetBreakdownData(col)
	local list = { }
	for _, sec2 in ipairs(bd.sectionList or { }) do
		if sec2.type == "TEXT" then
			local lines = { }
			for _, l in ipairs(sec2.lines or { }) do lines[#lines + 1] = str(l) or "" end
			list[#list + 1] = { type = "TEXT", lines = lines }
		elseif sec2.type == "TABLE" then
			local cols, used = { }, { }
			for _, c in ipairs(sec2.colList or { }) do
				for _, r in ipairs(sec2.rowList or { }) do if str(r[c.key]) and str(r[c.key]) ~= "" then used[c.key] = true break end end
				if used[c.key] then cols[#cols + 1] = { label = c.label, key = c.key, right = c.right or nil } end
			end
			local rows = { }
			for _, r in ipairs(sec2.rowList or { }) do
				local o = { }
				for _, c in ipairs(cols) do o[c.key] = str(r[c.key]) end
				if r.sourceNameNode and r.sourceNameNode.id then o._node = r.sourceNameNode.id end
				rows[#rows + 1] = o
			end
			list[#list + 1] = { type = "TABLE", label = sec2.label, footer = sec2.footer, cols = cols, rows = rows }
		elseif sec2.type == "RADIUS" then
			list[#list + 1] = { type = "RADIUS", radius = sec2.radius }
		end
	end
	return { ref = ref, label = row.label, sections = list }
end

-- PoB's Tree tab: the passive tree of the build (positions, links, what is allocated)
local TYPE_CODE = { Normal = 0, Notable = 1, Keystone = 2, Socket = 3, Mastery = 4, ClassStart = 5, AscendClassStart = 6 }
-- the nodes drawn: the main tree and your ascendancy
local function treeFilter(spec)
	local asc = { }
	if spec.curAscendClassName then asc[spec.curAscendClassName] = true end
	if spec.curSecondaryAscendClassName then asc[spec.curSecondaryAscendClassName] = true end
	return function(n) return n and n.x and n.y and not n.isProxy and not (n.group and n.group.isProxy) and (not n.ascendancyName or asc[n.ascendancyName]) end
end
-- the effects a mastery can take (not the ones another mastery of the same kind already has)
local function masteryOpts(spec, node)
	local out = { }
	for _, e in ipairs(node.masteryEffects or { }) do
		local taken = isValueInTable and isValueInTable(spec.masterySelections, e.effect)
		local eff = spec.tree.masteryEffects[e.effect]
		if eff and (not taken or taken == node.id) then out[#out + 1] = { id = e.effect, label = table.concat(eff.sd or e.stats or { }, " / ") } end
	end
	return out
end
-- the art of a node, from PoB's own sprite sheets (the files of the passive tree GGG publishes, in PoB's
-- TreeData folder): which sheet, and where on it
local function spriteOf(tree, spriteType, name)
	local data = name and tree.skillSprites and tree.skillSprites[spriteType]
	if not data then return nil end
	local z = data[0.3835] or data[1] or data[#data] or data
	local c = z and z.coords and z.coords[name]
	if not c or not z.filename then return nil end
	local function v(a) return type(a) == "table" and a[#a] or a end
	return { f = (z.filename:gsub("%?%x+$", ""):gsub(".*/", "")), x = v(c.x), y = v(c.y), w = v(c.w), h = v(c.h) }
end
local function frameSprite(tree, name)
	if not name or not tree.skillSprites then return nil end
	for t in pairs(tree.skillSprites) do
		local sp = spriteOf(tree, t, name)
		if sp then return sp end
	end
	return nil
end
local function treeArt(spec, n, o, sprites, index)
	local tree = spec.tree
	local function add(sp)
		if not sp then return nil end
		local key = sp.f .. ":" .. sp.x .. ":" .. sp.y .. ":" .. sp.w .. ":" .. sp.h
		if not index[key] then sprites[#sprites + 1] = sp; index[key] = #sprites end
		return index[key]
	end
	local ty = n.type
	if ty == "Normal" or ty == "Notable" or ty == "Keystone" then
		o.ia = add(spriteOf(tree, ty:lower() .. "Active", n.icon))
		o.iu = add(spriteOf(tree, ty:lower() .. "Inactive", n.icon))
	elseif ty == "Mastery" then
		o.ia = add(spriteOf(tree, "masteryActiveSelected", n.activeIcon) or spriteOf(tree, "mastery", n.icon))
		o.iu = add(spriteOf(tree, "masteryInactive", n.inactiveIcon) or spriteOf(tree, "mastery", n.icon))
	end
	local ov = tree.nodeOverlay and tree.nodeOverlay[ty]
	if ov and ty ~= "Mastery" then
		local asc = n.ascendancyName and "Ascend" or ""
		o.fa = add(frameSprite(tree, ov["alloc" .. asc] or ov.alloc))
		o.fu = add(frameSprite(tree, ov["unalloc" .. asc] or ov.unalloc))
	end
end
local function tree()
	local spec = build.spec
	local shown = treeFilter(spec)
	local nodes, edges, seen = { }, { }, { }
	local sprites, spriteIndex = { }, { }
	local startId
	for id, n in pairs(spec.nodes) do
		if shown(n) then
			local o = { i = id, x = math.floor(n.x + 0.5), y = math.floor(n.y + 0.5), t = TYPE_CODE[n.type] or 0, n = n.dn, a = n.alloc and 1 or nil, asc = n.ascendancyName and 1 or nil }
			pcall(treeArt, spec, n, o, sprites, spriteIndex)
			if n.type == "ClassStart" then
				-- only your class's start counts
				if n.alloc then startId = id else o.n = nil end
			end
			local sd = { }
			for _, l in ipairs(n.sd or { }) do sd[#sd + 1] = l end
			if n.type == "Mastery" and not n.alloc and n.masteryEffects then
				-- the choices this mastery has
				for _, e in ipairs(n.masteryEffects) do
					local eff = spec.tree.masteryEffects[e.effect]
					if eff and eff.sd then sd[#sd + 1] = "• " .. table.concat(eff.sd, " / ") end
				end
			end
			if #sd > 0 then o.s = sd end
			if n.type == "Mastery" then o.m = masteryOpts(spec, n); o.ms = spec.masterySelections[id] end
			if not n.alloc and not n.path and n.type ~= "ClassStart" and n.type ~= "AscendClassStart" then o.u = 1 end
			if n.reminderText and #n.reminderText > 0 and n.type ~= "Mastery" then o.r = n.reminderText end
			if n.type == "Socket" then
				local itemId = spec.jewels and spec.jewels[id]
				local item = itemId and build.itemsTab.items[itemId]
				if item then o.j = item.name; o.jr = item.rarity; o.jt = itemText(item) end
			end
			if n.group and n.o and n.o > 0 then o.gx = n.group.x; o.gy = n.group.y; o.g = n.g; o.o = n.o; o.an = n.angle; o.rad = spec.tree.orbitRadii[n.o + 1] end
			nodes[#nodes + 1] = o
			for _, other in ipairs(n.linked or { }) do
				if shown(other) and n.type ~= "ClassStart" and other.type ~= "ClassStart" and n.type ~= "Mastery" and other.type ~= "Mastery"
					and n.ascendancyName == other.ascendancyName then
					local a, b = math.min(id, other.id), math.max(id, other.id)
					local key = a .. ":" .. b
					if not seen[key] then
						seen[key] = true
						edges[#edges + 1] = { a, b, (n.g == other.g and n.o == other.o and (n.o or 0) > 0) and 1 or 0 }
					end
				end
			end
		end
	end
	local used, ascUsed = spec:CountAllocNodes()
	local extra = build.calcsTab.mainOutput and build.calcsTab.mainOutput.ExtraPoints or 0
	local maxPoints = math.min(math.max(build.characterLevel or 1, 1), 100) - 1 + 23 + extra
	return { nodes = nodes, edges = edges, start = startId, class = spec.curClassName, ascendancy = spec.curAscendClassName, used = used, ascUsed = ascUsed, maxPoints = maxPoints, ascMax = 8,
		level = build.characterLevel, treeVersion = spec.treeVersion, sprites = sprites }
end

-- what a node does: PoB's "Allocating this node will give you" (and the path to it), or the reverse for an allocated one
local function nodeDiff(id)
	local spec = build.spec
	local node = spec.nodes[id]
	if not node then return { error = "No such node." } end
	local calcFunc, base = build.calcsTab:GetMiscCalculator(build)
	local path = (node.alloc and node.depends) or node.path or { }
	local pathNodes, pathIds = { }, { }
	for _, n in pairs(path) do pathNodes[n] = true; pathIds[#pathIds + 1] = n.id end
	local one, all
	if node.alloc then
		one = calcFunc({ removeNodes = { [node] = true } })
		if #path > 1 then all = calcFunc({ removeNodes = pathNodes }) end
	else
		if node.type == "Mastery" then one = nil else one = calcFunc({ addNodes = { [node] = true } }) end
		if #path > 1 then all = calcFunc({ addNodes = pathNodes }) end
	end
	return { id = id, alloc = node.alloc or false, base = pick(base), one = one and pick(one) or nil, all = all and pick(all) or nil, count = #path, path = pathIds }
end

-- change the tree like clicking in PoB: allocate a node (with the path to it), or remove it (with what hangs on it)
local function treeEdit(req)
	if asTemp then removeLevelSkill(asTemp); asTemp = nil end
	local spec = build.spec
	if req.undo then
		spec:Undo()
	else
		local node = spec.nodes[tonumber(req.node) or 0]
		if not node then return { error = "No such node." } end
		if node.type == "ClassStart" or node.type == "AscendClassStart" then return { error = "That's where your class starts." } end
		if node.type == "Mastery" and req.effect then
			local effect = spec.tree.masteryEffects[tonumber(req.effect)]
			if not effect then return { error = "No such mastery effect." } end
			if not node.alloc and not node.path then return { error = "Path of Building can't reach this mastery from your tree." } end
			node.sd = effect.sd
			node.allMasteryOptions = false
			node.reminderText = { "Tip: Right click to select a different effect" }
			spec.tree:ProcessStats(node)
			spec.masterySelections[node.id] = effect.id
			if not node.alloc then spec:AllocNode(node) end
		elseif node.alloc then
			spec:DeallocNode(node)
		elseif node.type == "Mastery" then
			return { needEffect = true, options = masteryOpts(spec, node) }
		else
			if not node.path then return { error = "Path of Building can't reach this node from your tree." } end
			spec:AllocNode(node)
		end
	end
	spec:AddUndoState()
	build.buildFlag = true
	runCallback("OnFrame")
	local r = tree()
	r.summary = summary()
	if req.save then r.xml = build:SaveDB(req.name or "build") end
	return r
end

-- how much every node is worth to the build (PoB's node power): added for the ones you don't have,
-- lost for the ones you have. In pieces, so the app can colour the tree as it goes.
local powerState
local function power(req)
	local spec = build.spec
	local mainOut = build.calcsTab.mainOutput
	if not powerState or powerState.out ~= mainOut or powerState.spec ~= spec then
		local shown = treeFilter(spec)
		local granted = build.calcsTab.mainEnv and build.calcsTab.mainEnv.grantedPassives or { }
		local list = { }
		for id, n in pairs(spec.nodes) do
			if shown(n) and n.type ~= "ClassStart" and n.type ~= "AscendClassStart" and n.type ~= "Mastery" and not granted[id] and n.sd and #n.sd > 0 then list[#list + 1] = id end
		end
		table.sort(list)
		local calcFunc, base = build.calcsTab:GetMiscCalculator(build)
		powerState = { out = mainOut, spec = spec, list = list, calcFunc = calcFunc, base = base, full = (base.FullDPS or 0) > 0, cache = { } }
	end
	local P = powerState
	local function dps(o) return P.full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0) end
	local function pct(a, b) if not b or b == 0 then return 0 end return (a - b) / math.abs(b) * 100 end
	local from = tonumber(req.from) or 0
	local count = tonumber(req.count) or 150
	local res = { }
	for k = from + 1, math.min(from + count, #P.list) do
		local id = P.list[k]
		local n = spec.nodes[id]
		local key = (n.alloc and "-" or "+") .. table.concat(n.sd, "|")
		local v = P.cache[key]
		if not v then
			local o = n.alloc and P.calcFunc({ removeNodes = { [n] = true } }, P.full) or P.calcFunc({ addNodes = { [n] = true } }, P.full)
			local sign = n.alloc and -1 or 1
			v = { d = sign * pct(dps(o), dps(P.base)), l = sign * pct(o.Life or 0, P.base.Life), e = sign * pct(o.TotalEHP or 0, P.base.TotalEHP) }
			P.cache[key] = v
		end
		res[#res + 1] = { i = id, d = v.d, l = v.l, e = v.e }
	end
	return { total = #P.list, from = from, results = res, done = from + count >= #P.list }
end

-- The tree optimiser: with the same points, swap the nodes worth least for paths worth more, one swap a step,
-- while life, effective HP, resistances and attribute requirements stay where you asked.
local opt
local function optValue(o)
	if opt.goal == "l" then return o.Life or 0 end
	if opt.goal == "e" then return o.TotalEHP or 0 end
	return opt.full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0)
end
local function optOk(o)
	local L = opt.limits
	if L.life and (o.Life or 0) < L.life then return false end
	if L.ehp and (o.TotalEHP or 0) < L.ehp then return false end
	if L.dps and (opt.full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0)) < L.dps then return false end
	for _, r in ipairs({ "FireResist", "ColdResist", "LightningResist", "ChaosResist" }) do
		if L[r] and (o[r] or -999) < L[r] then return false end
	end
	for _, a in ipairs({ "Str", "Dex", "Int" }) do
		if L["Req" .. a] and (o[a] or 0) < (o["Req" .. a] or 0) then return false end
	end
	return true
end
local function nodeName(n) return n.dn or ("#" .. n.id) end
local function optStart(req)
	local spec = build.spec
	spec:AddUndoState()
	local _, base = build.calcsTab:GetMiscCalculator(build)
	opt = { spec = spec, goal = req.goal or "d", full = (base.FullDPS or 0) > 0, limits = { }, iter = 0, log = { }, tried = { }, maxIter = tonumber(req.maxIter) or 40, useFree = req.useFree and true or false }
	local L = opt.limits
	if opt.goal ~= "l" and (req.lifePct or 100) > 0 then L.life = (base.Life or 0) * (req.lifePct or 100) / 100 end
	if opt.goal ~= "e" and (req.ehpPct or 95) > 0 then L.ehp = (base.TotalEHP or 0) * (req.ehpPct or 95) / 100 end
	if opt.goal ~= "d" and (req.dpsPct or 90) > 0 then
		local d = opt.full and (base.FullDPS or 0) or (base.CombinedDPS or base.TotalDPS or 0)
		L.dps = d * (req.dpsPct or 90) / 100
	end
	if req.keepRes ~= false then
		for _, r in ipairs({ "FireResist", "ColdResist", "LightningResist" }) do L[r] = (base[r] or 0) - 0.01 end
		if req.keepChaos then L.ChaosResist = (base.ChaosResist or 0) - 0.01 end
	end
	for _, a in ipairs({ "Str", "Dex", "Int" }) do
		if (base[a] or 0) >= (base["Req" .. a] or 0) then L["Req" .. a] = true end
	end
	opt.startValue = optValue(base)
	opt.startStats = pick(base)
	opt.startAlloc = { }
	for id in pairs(spec.allocNodes) do opt.startAlloc[id] = true end
	return { started = true, value = opt.startValue }
end
local function optStep()
	if not opt then return { error = "The optimiser isn't running." } end
	if opt.spec ~= build.spec then opt = nil; return { error = "Another build was opened, so the optimiser stopped." } end
	local spec = build.spec
	local calcFunc, base = build.calcsTab:GetMiscCalculator(build)
	local full = opt.full
	local cur = optValue(base)
	local granted = build.calcsTab.mainEnv and build.calcsTab.mainEnv.grantedPassives or { }
	local shown = treeFilter(spec)
	-- what you have that could go: nodes nothing else hangs on
	local leaves = { }
	for id, n in pairs(spec.allocNodes) do
		if n.type ~= "ClassStart" and n.type ~= "AscendClassStart" and not n.ascendancyName and not granted[id]
			and not (n.type == "Socket" and spec.jewels and spec.jewels[id]) and n.depends and #n.depends == 1 then
			local o = calcFunc({ removeNodes = { [n] = true } }, full)
			leaves[#leaves + 1] = { n = n, loss = cur - optValue(o), safe = optOk(o) }
		end
	end
	-- the ones that keep your limits first (life, resistances...), then the rest; least loss first in each
	table.sort(leaves, function(a, b) if a.safe ~= b.safe then return a.safe end return a.loss < b.loss end)
	local byLoss = { }
	for i, lf in ipairs(leaves) do byLoss[i] = lf end
	table.sort(byLoss, function(a, b) return a.loss < b.loss end)
	-- what you could take: paths of up to 4 points, best per point
	local adds = { }
	for id, n in pairs(spec.nodes) do
		if shown(n) and not n.alloc and n.path and #n.path > 0 and #n.path <= 4 and not n.ascendancyName and not granted[id]
			and n.type ~= "Mastery" and n.type ~= "ClassStart" and n.type ~= "AscendClassStart" and n.sd and #n.sd > 0 then
			local set = { }
			for _, pn in ipairs(n.path) do set[pn] = true end
			local o = calcFunc({ addNodes = set }, full)
			local gain = (optValue(o) - cur) / #n.path
			if gain > 0 then adds[#adds + 1] = { n = n, set = set, gain = gain } end
		end
	end
	table.sort(adds, function(a, b) return a.gain > b.gain end)
	local used = spec:CountAllocNodes()
	local extra = build.calcsTab.mainOutput and build.calcsTab.mainOutput.ExtraPoints or 0
	local maxPoints = math.min(math.max(build.characterLevel or 1, 1), 100) - 1 + 23 + extra
	local free = opt.useFree and math.max(0, maxPoints - used) or 0
	-- try the best paths against the leaves worth least
	local best
	opt.dbg = { leaves = #leaves, adds = #adds, notOk = 0, notBetter = 0, free = free }
	for k = 1, math.min(12, #adds) do
		local a = adds[k]
		local L = #a.n.path
		local near = { }
		for pn in pairs(a.set) do for _, l in ipairs(pn.linked or { }) do near[l] = true end end
		local need = math.max(0, L - free)
		for _, order in ipairs({ leaves, byLoss }) do
		local rem, remList = { }, { }
		for _, lf in ipairs(order) do
			if #remList >= need then break end
			if not near[lf.n] and not a.set[lf.n] then rem[lf.n] = true; remList[#remList + 1] = lf.n end
		end
		if #remList == need then
			local key = a.n.id
			for _, r in ipairs(remList) do key = key .. ":" .. r.id end
			if not opt.tried[key] then
				local o = calcFunc({ addNodes = a.set, removeNodes = rem }, full)
				local v = optValue(o)
				if not optOk(o) then opt.dbg.notOk = opt.dbg.notOk + 1 elseif v <= cur * 1.0005 then opt.dbg.notBetter = opt.dbg.notBetter + 1 end
				if optOk(o) and v > cur * 1.0005 and (not best or v > best.v) then best = { v = v, a = a, rem = remList, key = key } end
			end
		end
		end
	end
	opt.iter = opt.iter + 1
	local step = { iter = opt.iter, value = cur, startValue = opt.startValue, goal = opt.goal, dbg = opt.dbg }
	if not best then
		step.done = true
	else
		-- do it, then check PoB agrees (paths can change once nodes go)
		local before = pick(base)
		local removed, added, removedIds, addedIds = { }, { }, { }, { }
		for _, r in ipairs(best.rem) do removed[#removed + 1] = nodeName(r); removedIds[#removedIds + 1] = r.id; if r.alloc then spec:DeallocNode(r) end end
		local target = best.a.n
		if target.path then
			for _, pn in ipairs(target.path) do added[#added + 1] = nodeName(pn); addedIds[#addedIds + 1] = pn.id end
			spec:AllocNode(target)
		end
		build.buildFlag = true
		runCallback("OnFrame")
		local _, nb = build.calcsTab:GetMiscCalculator(build)
		if target.alloc and optValue(nb) > cur and optOk(nb) then
			spec:AddUndoState()
			local entry = { removed = removed, added = added, removedIds = removedIds, addedIds = addedIds, target = nodeName(target), before = before, after = pick(nb) }
			opt.log[#opt.log + 1] = entry
			step.swap = entry
			step.value = optValue(nb)
		else
			-- not better after all: take it back and don't try it again
			spec:AddUndoState()
			spec:Undo()
			build.buildFlag = true
			runCallback("OnFrame")
			opt.tried[best.key] = true
			step.retry = true
		end
		if opt.iter >= opt.maxIter then step.done = true end
	end
	step.startStats = opt.startStats
	if step.done then
		step.log = opt.log
		local now = { }
		for id in pairs(spec.allocNodes) do now[id] = true end
		local gone, new = { }, { }
		for id in pairs(opt.startAlloc) do if not now[id] then gone[#gone + 1] = id end end
		for id in pairs(now) do if not opt.startAlloc[id] then new[#new + 1] = id end end
		step.gone = gone
		step.new = new
		local _, nb = build.calcsTab:GetMiscCalculator(build)
		step.stats = pick(nb)
	end
	local t = tree()
	t.summary = summary()
	step.tree = t
	return step
end
local function optEnd(req)
	local r = { }
	if req.keep then
		build.spec:AddUndoState()
		r.xml = build:SaveDB(req.name or "build")
		r.summary = summary()
	end
	opt = nil
	return r
end

-- Support gem optimiser for the main skill: tries every support that can support it, at the highest level
-- you can use at your character level, in place of each of your supports; keeps the best set (slot by slot).
local function maxGemLevel(gemData, charLevel)
	local ge = gemData.grantedEffect
	local top = gemData.naturalMaxLevel or 20
	if not ge.levels[top] then top = #ge.levels end
	for l = top, 1, -1 do
		if ge.levels[l] and (ge.levels[l].levelRequirement or 0) <= charLevel then return l end
	end
	return nil
end
local function supportGems(req)
	local group = build.skillsTab.socketGroupList[build.mainSocketGroup or 1]
	if not group then return { error = "No main skill." } end
	local mainSkill = build.calcsTab.mainEnv and build.calcsTab.mainEnv.player.mainSkill
	if not mainSkill then return { error = "No main skill." } end
	local charLevel = math.max(1, math.min(100, tonumber(req.level) or build.characterLevel or 1))
	local quality = math.max(0, math.min(23, tonumber(req.quality) or 20))
	local calcFunc, base = build.calcsTab:GetMiscCalculator(build)
	local full = false
	local function value(o) return full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0) end
	local function eval() local o = calcFunc(nil, full); return value(o), o end
	-- what each gem slot holds now, to put back afterwards
	local saved = { }
	for i, gem in ipairs(group.gemList) do saved[i] = { gemId = gem.gemId, skillId = gem.skillId, nameSpec = gem.nameSpec, level = gem.level, quality = gem.quality, enabled = gem.enabled } end
	local function setGem(i, gd, level, q)
		local gem = group.gemList[i]
		gem.gemId = gd.id; gem.skillId = gd.grantedEffectId; gem.nameSpec = gd.name; gem.level = level; gem.quality = q; gem.enabled = true
	end
	local function restore()
		for i, sv in ipairs(saved) do local gem = group.gemList[i]; for k, v in pairs(sv) do gem[k] = v end end
		build.skillsTab:ProcessSocketGroup(group)
	end
	local function refresh() build.skillsTab:ProcessSocketGroup(group) end
	-- your supports (slots that can change)
	local slots = { }
	local have = { }
	for i, gem in ipairs(group.gemList) do
		local ge = gem.gemData and gem.gemData.grantedEffect
		if ge and ge.support and gem.enabled ~= false then slots[#slots + 1] = i end
		if gem.gemData then have[gem.gemData.grantedEffectId] = true end
	end
	if #slots == 0 and not req.fill then return { error = "The main skill has no support gems to swap." } end
	-- every support that can support this skill, at the level you can use
	local cands = { }
	for id, gd in pairs(build.data.gems) do
		local ge = gd.grantedEffect
		if ge and ge.support and not ge.unsupported and not (gd.tags and gd.tags.exceptional and not req.exceptional)
			and not (gd.name:match("^Awakened ") and not req.awakened) then
			local lvl = maxGemLevel(gd, charLevel)
			local ok, can = pcall(calcLib.canGrantedEffectSupportActiveSkill, ge, mainSkill)
			if lvl and ok and can then cands[#cands + 1] = { gd = gd, level = lvl } end
		end
	end
	full = (base.FullDPS or 0) > 0 and req.fullDps and true or false
	-- empty sockets to fill (a levelling skill): each gets the best support for it, one after the other
	local want = tonumber(req.fill) or 0
	while #slots < want and #cands > 0 do
		local i = #group.gemList + 1
		group.gemList[i] = { gemId = cands[1].gd.id, skillId = cands[1].gd.grantedEffectId, nameSpec = cands[1].gd.name, level = cands[1].level, quality = quality, enabled = true, count = 1 }
		saved[i] = { gemId = nil, skillId = nil, nameSpec = "", level = 1, quality = 0, enabled = false }
		local inGroup = { }
		for j, g in ipairs(group.gemList) do if j ~= i and g.gemData then inGroup[g.gemData.grantedEffectId] = true end end
		local bestC, bestV
		for _, c in ipairs(cands) do
			if not inGroup[c.gd.grantedEffectId] then
				setGem(i, c.gd, c.level, quality); refresh()
				local v = eval()
				if not bestV or v > bestV then bestV = v; bestC = c end
			end
		end
		setGem(i, bestC.gd, bestC.level, quality); refresh()
		slots[#slots + 1] = i
	end
	local startValue, startOut = eval()
	-- first: your own gems at the highest level you can use (what levelling them gives)
	local levelled = { }
	-- (every gem of the skill, the skill gem too: at a lower planned level they can't be as high as now)
	local isSlot = { }
	for _, i in ipairs(slots) do isSlot[i] = true end
	local unusable = { }
	for i, gem in ipairs(group.gemList) do
		local l = gem.gemData and gem.enabled ~= false and maxGemLevel(gem.gemData, charLevel)
		if gem.gemData and gem.enabled ~= false and not l then
			-- too high a level needed for this gem: it can't be used yet (supports get swapped for ones that can)
			local lv1 = gem.gemData.grantedEffect.levels[1]
			unusable[#unusable + 1] = { name = gem.nameSpec, req = lv1 and lv1.levelRequirement or nil, support = isSlot[i] or false }
			if isSlot[i] then gem.enabled = false end
		elseif l and l ~= (gem.level or 1) and (l > (gem.level or 1) or (gem.level or 1) <= (gem.gemData.naturalMaxLevel or 20)) then
			levelled[#levelled + 1] = { name = gem.nameSpec, from = gem.level, to = l }
			gem.level = l
		end
		if isSlot[i] and (gem.quality or 0) < quality then gem.quality = quality end
	end
	refresh()
	local levelledValue = eval()
	-- then: slot by slot, the best gem for it
	local cur = levelledValue
	local alts = { }
	local changes = { }
	local locked = { }
	for _, i in ipairs(req.keep or { }) do locked[tonumber(i)] = true end
	for pass = 1, 2 do
		local changed = false
		for _, i in ipairs(slots) do if not locked[i] then
			local gem = group.gemList[i]
			local keep = { gemId = gem.gemId, skillId = gem.skillId, nameSpec = gem.nameSpec, level = gem.level, quality = gem.quality, enabled = gem.enabled }
			local inGroup = { }
			for j, g in ipairs(group.gemList) do if j ~= i and g.gemData then inGroup[g.gemData.grantedEffectId] = true end end
			local list = { }
			for _, c in ipairs(cands) do
				if not inGroup[c.gd.grantedEffectId] then
					setGem(i, c.gd, c.level, quality)
					refresh()
					local v = eval()
					list[#list + 1] = { name = c.gd.name, level = c.level, v = v }
				end
			end
			table.sort(list, function(a, b) return a.v > b.v end)
			for k, v in pairs(keep) do gem[k] = v end
			refresh()
			local best = list[1]
			local off = gem.enabled == false
			if best and (best.v > cur * 1.002 or (off and best.v > cur)) and (best.name ~= keep.nameSpec or off) then
				local c
				for _, x in ipairs(cands) do if x.gd.name == best.name then c = x break end end
				changes[#changes + 1] = { from = keep.nameSpec, fromLevel = keep.level, to = best.name, toLevel = best.level, gain = (best.v - cur) / math.max(1, cur) * 100 }
				setGem(i, c.gd, c.level, quality)
				refresh()
				cur = eval()
				changed = true
			end
			-- the top alternatives for this slot (on the last pass)
			local top = { }
			for k = 1, math.min(6, #list) do top[k] = { name = list[k].name, level = list[k].level, pct = (list[k].v - cur) / math.max(1, cur) * 100 } end
			alts[i] = top
		end end
		if not changed then break end
	end
	local finalValue, finalOut = eval()
	local final = { }
	for _, i in ipairs(slots) do local g = group.gemList[i]; final[#final + 1] = { slot = i, name = g.nameSpec, level = g.level, quality = g.quality, alts = alts[i], locked = locked[i] or nil, was = saved[i].nameSpec, wasLevel = saved[i].level, off = g.enabled == false or nil } end
	local skillGem = mainSkill.activeEffect.gemData
	local skillReq = skillGem and skillGem.grantedEffect.levels[1] and skillGem.grantedEffect.levels[1].levelRequirement or nil
	local result = { charLevel = charLevel, quality = quality, skill = mainSkill.activeEffect.grantedEffect.name, skillReq = skillReq, startValue = startValue, levelledValue = levelledValue, finalValue = finalValue,
		levelled = levelled, unusable = unusable, changes = changes, final = final, candidates = #cands, before = pick(startOut), after = pick(finalOut),
		manaBefore = startOut.ManaCost, manaAfter = finalOut.ManaCost, full = full }
	if req.apply then
		-- keep the new gems in the build
		build.buildFlag = true
		runCallback("OnFrame")
		result.summary = summary()
		if req.save then result.xml = build:SaveDB(req.name or "build") end
	else
		restore()
	end
	return result
end

-- Timeless jewels: every seed of a jewel in one of your sockets, worked out by PoB (it conquers the passives in
-- radius exactly like a real jewel), scored by what it does to your build.
local TIMELESS = {
	{ id = 1, name = "Glorious Vanity", race = "Vaal", line = "Bathed in the blood of %d sacrificed in the name of %s", conquerors = { "Doryani", "Xibaqua", "Ahuana" }, trade = "vaal" },
	{ id = 2, name = "Lethal Pride", race = "Karui", line = "Commanded leadership over %d warriors under %s", conquerors = { "Kaom", "Rakiata", "Akoya" }, trade = "karui" },
	{ id = 3, name = "Brutal Restraint", race = "Maraketh", line = "Denoted service of %d dekhara in the akhara of %s", conquerors = { "Asenath", "Nasima", "Balbala" }, trade = "maraketh" },
	{ id = 4, name = "Militant Faith", race = "Templar", line = "Carved to glorify %d new faithful converted by High Templar %s", conquerors = { "Avarius", "Dominus", "Maxarius" }, trade = "templar" },
	{ id = 5, name = "Elegant Hubris", race = "Eternal Empire", line = "Commissioned %d coins to commemorate %s", conquerors = { "Cadiro", "Victario", "Caspiro" }, trade = "eternal", step = 20 },
	{ id = 6, name = "Heroic Tragedy", race = "Kalguur", line = "Remembrancing %d songworthy deeds by the line of %s", conquerors = { "Vorana", "Uhtred", "Medved" }, trade = "kalguur" },
}
local tl -- the search running now
local function timelessJewelItem(t, seed, conqueror)
	local raw = "Rarity: UNIQUE\n" .. t.name .. "\nTimeless Jewel\nRadius: Large\nLimited to: 1 Historic\nImplicits: 0\n"
		.. string.format(t.line, seed, conqueror) .. "\nPassives in radius are Conquered by the " .. t.race .. "\nHistoric"
	return newItem(raw)
end
local function timelessSockets()
	local spec = build.spec
	local out = { }
	local large, outer = 3, 1500
	for i, r in ipairs(data.jewelRadius or { }) do if r.label == "Large" then large = i; outer = r.outer; break end end
	for id, n in pairs(spec.nodes) do
		if n.type == "Socket" and n.alloc and not n.expansionJewel and n.nodesInRadius then
			local itemId = spec.jewels and spec.jewels[id]
			local item = itemId and itemId ~= 0 and build.itemsTab.items[itemId]
			local inR, notables = 0, { }
			for nid in pairs(n.nodesInRadius[large] or { }) do
				local m = spec.nodes[nid]
				if m and m.alloc and m.type ~= "Socket" and m.type ~= "Mastery" and not m.ascendancyName then
					inR = inR + 1
					if m.type == "Notable" or m.type == "Keystone" then notables[#notables + 1] = m.dn end
				end
			end
			out[#out + 1] = { id = id, x = n.x, y = n.y, radius = outer, jewel = item and item.name or nil, allocatedInRadius = inR, notables = notables }
		end
	end
	table.sort(out, function(a, b) return a.allocatedInRadius > b.allocatedInRadius end)
	local types = { }
	for _, t in ipairs(TIMELESS) do types[#types + 1] = { id = t.id, name = t.name, conquerors = t.conquerors, min = data.timelessJewelSeedMin[t.id] * (t.step or 1), max = data.timelessJewelSeedMax[t.id] * (t.step or 1), step = t.step or 1 } end
	return { sockets = out, types = types }
end
local function timelessStart(req)
	local spec = build.spec
	local socket = spec.nodes[tonumber(req.socket) or 0]
	if not socket or socket.type ~= "Socket" or not socket.alloc then return { error = "Pick one of your allocated jewel sockets." } end
	local t
	for _, x in ipairs(TIMELESS) do if x.id == tonumber(req.type) then t = x end end
	if not t then return { error = "Pick a timeless jewel." } end
	local conqueror = t.conquerors[1]
	local any = true
	for _, c in ipairs(t.conquerors) do if c == req.conqueror then conqueror = c; any = false end end
	local item = timelessJewelItem(t, data.timelessJewelSeedMin[t.id] * (t.step or 1), conqueror)
	if not item.jewelData or not item.jewelData.conqueredBy then return { error = "Path of Building didn't read the jewel." } end
	build.itemsTab:AddItem(item, true)
	local before = spec.jewels[socket.id]
	local _, base = build.calcsTab:GetMiscCalculator(build)
	tl = { spec = spec, t = t, conqueror = conqueror, socket = socket.id, item = item, before = before, base = base, full = (base.FullDPS or 0) > 0,
		min = data.timelessJewelSeedMin[t.id], max = data.timelessJewelSeedMax[t.id], next = data.timelessJewelSeedMin[t.id], results = { }, seen = { }, evals = 0, any = any }
	spec.jewels[socket.id] = item.id
	-- the passives that matter: yours in the jewel's radius (only Glorious Vanity changes small passives by seed)
	tl.watch = { }
	for nid in pairs(socket.nodesInRadius[item.jewelRadiusIndex] or { }) do
		local m = spec.nodes[nid]
		if m and m.alloc and not m.ascendancyName and (m.type == "Notable" or (t.id == 1 and m.type == "Normal")) and data.nodeIDList[nid] then tl.watch[#tl.watch + 1] = nid end
	end
	table.sort(tl.watch)
	return { started = true, total = tl.max - tl.min + 1 }
end
local function timelessPut(seed)
	-- the seed as the jewel's number (Elegant Hubris counts in twenties)
	tl.item.jewelData.conqueredBy.id = seed * (tl.t.step or 1)
	build.spec:BuildAllDependsAndPaths()
end
local function timelessStep(req)
	if not tl or tl.spec ~= build.spec then return { error = "The timeless jewel search isn't running." } end
	local calcFunc = build.calcsTab:GetMiscCalculator(build)
	local t0 = os.clock()
	local budget = tonumber(req.seconds) or 1.5
	local count = 0
	while tl.next <= tl.max and os.clock() - t0 < budget do
		local seed = tl.next
		tl.next = seed + 1
		-- seeds that change your passives the same way score the same: worked out once
		local parts = { }
		for _, nid in ipairs(tl.watch) do
			local ok, lut = pcall(data.readLUT, seed * (tl.t.step or 1), nid, tl.t.id)
			parts[#parts + 1] = ok and type(lut) == "table" and table.concat(lut, ",") or "?"
		end
		local sig = table.concat(parts, "|")
		local r = tl.seen[sig]
		if not r then
			timelessPut(seed)
			local o = calcFunc(nil, tl.full)
			r = { dps = tl.full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0), life = o.Life or 0, ehp = o.TotalEHP or 0 }
			tl.seen[sig] = r
			tl.evals = tl.evals + 1
		end
		tl.results[#tl.results + 1] = { seed = seed * (tl.t.step or 1), dps = r.dps, life = r.life, ehp = r.ehp, sig = sig }
		count = count + 1
	end
	return { done = tl.next > tl.max, got = tl.next - tl.min, total = tl.max - tl.min + 1, count = count, evals = tl.evals, seconds = os.clock() - t0 }
end
local function timelessResults(req)
	if not tl then return { error = "The timeless jewel search isn't running." } end
	local B = tl.base
	local function dps(o) return tl.full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0) end
	local bd, bl, be = dps(B), B.Life or 0, B.TotalEHP or 0
	local wD, wL, wE = tonumber(req.wDps) or 1, tonumber(req.wLife) or 0, tonumber(req.wEhp) or 0
	local list = { }
	for _, r in ipairs(tl.results) do
		local pd = bd > 0 and (r.dps - bd) / bd * 100 or 0
		local pl = bl > 0 and (r.life - bl) / bl * 100 or 0
		local pe = be > 0 and (r.ehp - be) / be * 100 or 0
		list[#list + 1] = { seed = r.seed, dps = pd, life = pl, ehp = pe, score = wD * pd + wL * pl + wE * pe }
	end
	table.sort(list, function(a, b) return a.score > b.score end)
	local top = { }
	for k = 1, math.min(tonumber(req.top) or 25, #list) do top[k] = list[k] end
	local ids = data.timelessJewelTradeIDs and data.timelessJewelTradeIDs[tl.t.id] and data.timelessJewelTradeIDs[tl.t.id].keystone or { }
	local ci
	for i, c in ipairs(tl.t.conquerors) do if c == tl.conqueror then ci = i end end
	return { top = top, count = #list, jewel = tl.t.name, conqueror = tl.conqueror, anyConqueror = tl.any or false, tradeIds = ids, conquerorIndex = ci, full = tl.full, socket = tl.socket }
end
-- what a seed does to the passives in radius (for the result you look at)
local function timelessShow(req)
	if not tl then return { error = "The timeless jewel search isn't running." } end
	local seed = math.floor((tonumber(req.seed) or 0) / (tl.t.step or 1))
	timelessPut(seed)
	local spec = build.spec
	local socket = spec.nodes[tl.socket]
	local nodes = { }
	for nid in pairs(socket.nodesInRadius[tl.item.jewelRadiusIndex] or { }) do
		local m = spec.nodes[nid]
		if m and m.alloc and m.conqueredBy and (m.type == "Notable" or m.type == "Keystone") then
			nodes[#nodes + 1] = { id = nid, name = m.dn, sd = m.sd }
		end
	end
	table.sort(nodes, function(a, b) return a.name < b.name end)
	return { seed = req.seed, nodes = nodes }
end
local function timelessEnd(req)
	if tl and tl.spec == build.spec then
		local spec = build.spec
		if req.keep and req.seed then
			-- put the chosen jewel in the socket for good
			timelessPut(math.floor(tonumber(req.seed) / (tl.t.step or 1)))
			local item = timelessJewelItem(tl.t, tonumber(req.seed), tl.conqueror)
			build.itemsTab:AddItem(item, true)
			spec.jewels[tl.socket] = item.id
			if build.itemsTab.sockets and build.itemsTab.sockets[tl.socket] then pcall(function() build.itemsTab.sockets[tl.socket]:SetSelItemId(item.id) end) end
		else
			spec.jewels[tl.socket] = tl.before
		end
		if build.itemsTab.items[tl.item.id] then pcall(function() build.itemsTab:DeleteItem(tl.item, true) end) end
		spec:BuildAllDependsAndPaths()
		build.buildFlag = true
		runCallback("OnFrame")
	end
	tl = nil
	local r = { }
	if req.keep and req.save then r.xml = build:SaveDB(req.name or "build"); r.summary = summary() end
	return r
end

-- a levelling skill: put in its own socket group for a while, made the main skill, with the best supports
local LEVEL_LABEL = "PoE Helper levelling skill"
local function addLevelSkill(gemId, supports)
	local gd = build.data.gems[gemId]
	if not gd or not gd.grantedEffect or gd.grantedEffect.support then return nil, "Pick an active skill gem." end
	local list = build.skillsTab.socketGroupList
	local group = { label = LEVEL_LABEL, enabled = true, includeInFullDPS = false, mainActiveSkill = 1, mainActiveSkillCalcs = 1,
		gemList = { { gemId = gd.id, skillId = gd.grantedEffectId, nameSpec = gd.name, level = 1, quality = 0, enabled = true, count = 1 } } }
	for _, sp in ipairs(supports or { }) do
		for id, g in pairs(build.data.gems) do
			if g.name == sp.name and g.grantedEffect and g.grantedEffect.support then
				group.gemList[#group.gemList + 1] = { gemId = id, skillId = g.grantedEffectId, nameSpec = g.name, level = tonumber(sp.level) or 1, quality = tonumber(sp.quality) or 0, enabled = true, count = 1 }
				break
			end
		end
	end
	if supports and supports.skillLevel then group.gemList[1].level = supports.skillLevel end
	list[#list + 1] = group
	build.skillsTab:ProcessSocketGroup(group)
	local prev = build.mainSocketGroup
	setMainGroup(#list)
	local t = { group = group, index = #list, prev = prev }
	-- a skill your weapon can't use (Sunder with a sword): a plain weapon it can use, the best base for your level
	local ms = build.calcsTab.mainEnv and build.calcsTab.mainEnv.player.mainSkill
	local wt = gd.grantedEffect.weaponTypes
	if ms and ms.disableReason and wt then
		local level = tonumber(supports and supports.charLevel) or build.characterLevel or 1
		local best, bestV
		for name, b in pairs(data.itemBases) do
			if b.weapon and not b.hidden and wt[b.type] and ((b.req and b.req.level) or 1) <= level then
				local v = ((b.weapon.PhysicalMin or 0) + (b.weapon.PhysicalMax or 0)) / 2 * (b.weapon.AttackRateBase or 1)
				if not bestV or v > bestV then bestV = v; best = name end
			end
		end
		if best then
			local item = newItem("Rarity: NORMAL\n" .. best)
			build.itemsTab:AddItem(item, true)
			local s1, s2 = build.itemsTab.slots["Weapon 1"], build.itemsTab.slots["Weapon 2"]
			t.weapon = { item = item, base = best, prev1 = s1 and s1.selItemId, prev2 = s2 and s2.selItemId, reason = ms.disableReason }
			if s1 then s1.selItemId = item.id end
			local bt = item.base and item.base.type or ""
			if s2 and (bt:match("^Two Handed") or bt == "Staff" or bt == "Bow") then s2.selItemId = 0 end
			build.buildFlag = true
			runCallback("OnFrame")
		end
	end
	return t
end
local function removeLevelSkill(t)
	local list = build.skillsTab.socketGroupList
	for i = #list, 1, -1 do if list[i] == t.group then table.remove(list, i) end end
	if t.weapon then
		local s1, s2 = build.itemsTab.slots["Weapon 1"], build.itemsTab.slots["Weapon 2"]
		if s1 then s1.selItemId = t.weapon.prev1 or 0 end
		if s2 then s2.selItemId = t.weapon.prev2 or 0 end
		pcall(function() build.itemsTab:DeleteItem(t.weapon.item, true) end)
	end
	setMainGroup(math.min(t.prev or 1, #list))
end
-- another skill as the main one for a while (a levelling skill: "upgrades for Sunder"), with the best supports
-- you can use at that level; asSkillOff takes it out again. Nothing of it is ever saved.
local asTemp
local function asSkillOn(req)
	if asTemp then removeLevelSkill(asTemp); asTemp = nil end
	local t, err = addLevelSkill(req.skill, { charLevel = req.level })
	if not t then return { error = err } end
	asTemp = t
	local links = math.max(1, math.min(6, tonumber(req.links) or 4))
	local level = tonumber(req.level) or build.characterLevel
	local ok, r = pcall(supportGems, { level = level, quality = req.quality or 0, fill = links - 1, apply = true })
	if not ok or (r and r.error and links > 1) then
		if not (r and r.error) then return { error = tostring(r) } end
	end
	local gems = { }
	for _, g in ipairs(t.group.gemList) do if g.enabled ~= false then gems[#gems + 1] = { name = g.nameSpec, level = g.level } end end
	return { skill = t.group.gemList[1].nameSpec, gems = gems, dps = r and r.finalValue, weapon = t.weapon and t.weapon.base or nil, weaponReason = t.weapon and t.weapon.reason or nil }
end
local function asSkillOff()
	if asTemp then removeLevelSkill(asTemp); asTemp = nil end
	return { ok = true }
end
local function activeSkills()
	local out = { }
	for id, gd in pairs(build.data.gems) do
		local ge = gd.grantedEffect
		if ge and not ge.support and not ge.hidden and not gd.name:match("^Vaal ") and ge.levels and ge.levels[1] then
			out[#out + 1] = { id = id, name = gd.name, req = ge.levels[1].levelRequirement or 1, tags = gd.tagString }
		end
	end
	table.sort(out, function(a, b) return a.name < b.name end)
	return { skills = out }
end
local function levelSkill(req)
	local links = math.max(1, math.min(6, tonumber(req.links) or 4))
	local t, err = addLevelSkill(req.skill, { charLevel = req.level })
	if not t then return { error = err } end
	local ok, r = pcall(supportGems, { level = req.level, quality = req.quality or 0, fill = links - 1 })
	removeLevelSkill(t)
	if not ok then return { error = tostring(r) } end
	if t.weapon and type(r) == "table" then r.weapon = t.weapon.base; r.weaponReason = t.weapon.reason end
	return r
end

-- Levelling plan: the order to take your tree in, from your class start: each time the path (through nodes of
-- your final tree) worth most per point, for DPS and life together. Ascendancy points follow the labyrinths.
local lp
local function lpValue(o, full)
	return full and (o.FullDPS or 0) or (o.CombinedDPS or o.TotalDPS or 0), o.Life or 0, o.TotalEHP or 0
end
local function levelPlanStart(req)
	local spec = build.spec
	local final, finalAsc = { }, { }
	local start, ascStart
	for id, n in pairs(spec.allocNodes) do
		if n.type == "ClassStart" then start = n
		elseif n.type == "AscendClassStart" then ascStart = n
		elseif n.type ~= "Mastery" or spec.masterySelections[id] then
			if n.ascendancyName then finalAsc[id] = n else final[id] = n end
		end
	end
	if not start then return { error = "The build has no class start." } end
	-- with a levelling skill: the tree is ordered for it until you switch to the build's skill
	local temp
	if req.skill then
		local sup = req.supports or { }
		sup.skillLevel = tonumber(req.skillLevel) or 20
		temp = addLevelSkill(req.skill, sup)
	end
	local calcFunc, base = build.calcsTab:GetMiscCalculator(build)
	lp = { temp = temp, switchPoints = tonumber(req.switchPoints) or 0, spec = spec, final = final, finalAsc = finalAsc, start = start, ascStart = ascStart, calcFunc = calcFunc, full = (base.FullDPS or 0) > 0,
		taken = { [start.id] = true }, takenAsc = { }, order = { }, ascOrder = { }, goal = req.goal or "dl" }
	if ascStart then lp.takenAsc[ascStart.id] = true end
	local n, na = 0, 0
	for _ in pairs(final) do n = n + 1 end
	for _ in pairs(finalAsc) do na = na + 1 end
	lp.total, lp.totalAsc = n, na
	return { started = true, total = n, totalAsc = na }
end
-- the value of having only these nodes of your tree (the rest of your final tree taken away)
local function lpEval(taken, takenAsc)
	local rem = { }
	for id, n in pairs(lp.final) do if not taken[id] then rem[n] = true end end
	for id, n in pairs(lp.finalAsc) do if not takenAsc[id] then rem[n] = true end end
	local o = lp.calcFunc({ removeNodes = rem }, lp.full)
	return o
end
local function lpScore(o, b)
	local d1, l1, e1 = lpValue(o, lp.full)
	local d0, l0, e0 = lpValue(b, lp.full)
	local r = function(a, z) return z > 0 and (a - z) / z or (a > 0 and 1 or 0) end
	if lp.goal == "d" then return r(d1, d0) end
	if lp.goal == "l" then return r(l1, l0) + 0.5 * r(e1, e0) end
	return r(d1, d0) + r(l1, l0)
end
-- the paths from what you have to the rest of your tree (within it), up to 6 points, shortest first
local function lpPaths(final, taken, maxLen)
	local prev, dist, queue = { }, { }, { }
	for id in pairs(taken) do dist[id] = 0; queue[#queue + 1] = id end
	local qi = 1
	while qi <= #queue do
		local id = queue[qi]; qi = qi + 1
		local n = lp.spec.nodes[id]
		if dist[id] < maxLen then
			for _, m in ipairs(n.linked or { }) do
				if final[m.id] and not dist[m.id] then dist[m.id] = dist[id] + 1; prev[m.id] = id; queue[#queue + 1] = m.id end
			end
		end
	end
	local paths = { }
	for id, d in pairs(dist) do
		if d > 0 then
			local p, c = { }, id
			while c and not taken[c] do p[#p + 1] = c; c = prev[c] end
			paths[#paths + 1] = { target = id, nodes = p }
		end
	end
	return paths
end
local function levelPlanStep(req)
	if not lp or lp.spec ~= build.spec then return { error = "The levelling plan isn't running." } end
	local t0 = os.clock()
	local budget = tonumber(req.seconds) or 2
	local function stepFor(final, taken, takenOther, order, isAsc)
		local base = isAsc and lpEval(takenOther, taken) or lpEval(taken, takenOther)
		local best
		for _, p in ipairs(lpPaths(final, taken, 6)) do
			local t2 = { }
			for k in pairs(taken) do t2[k] = true end
			for _, id in ipairs(p.nodes) do t2[id] = true end
			local o = isAsc and lpEval(takenOther, t2) or lpEval(t2, takenOther)
			local v = lpScore(o, base) / #p.nodes
			-- among equals, the shorter path
			if not best or v > best.v + 1e-9 or (math.abs(v - best.v) <= 1e-9 and #p.nodes < #best.p.nodes) then best = { v = v, p = p, o = o } end
		end
		if not best then return false end
		local names = { }
		for i = #best.p.nodes, 1, -1 do
			local id = best.p.nodes[i]
			taken[id] = true
			local n = lp.spec.nodes[id]
			names[#names + 1] = { id = id, name = n.dn, type = TYPE_CODE[n.type] or 0 }
		end
		local d, l, e = lpValue(best.o, lp.full)
		order[#order + 1] = { nodes = names, points = #best.p.nodes, dps = d, life = l, ehp = e }
		return true
	end
	local more = true
	local function pointsTaken() local n = 0 for _, o in ipairs(lp.order) do n = n + o.points end return n end
	while more and os.clock() - t0 < budget do
		if lp.temp and pointsTaken() >= lp.switchPoints then
			-- time to switch to the build's own skill
			removeLevelSkill(lp.temp)
			lp.temp = nil
			lp.switchedAt = #lp.order
			local cf, b = build.calcsTab:GetMiscCalculator(build)
			lp.calcFunc = cf; lp.full = (b.FullDPS or 0) > 0
		end
		more = stepFor(lp.final, lp.taken, lp.takenAsc, lp.order, false)
	end
	if not more and lp.temp then removeLevelSkill(lp.temp); lp.temp = nil; local cf, b = build.calcsTab:GetMiscCalculator(build); lp.calcFunc = cf; lp.full = (b.FullDPS or 0) > 0 end
	local ascMore = true
	if not more then
		while ascMore and os.clock() - t0 < budget + 2 do
			ascMore = lp.ascStart and stepFor(lp.finalAsc, lp.takenAsc, lp.taken, lp.ascOrder, true) or false
		end
	end
	local done = not more and not ascMore
	local got = 0
	for _, o in ipairs(lp.order) do got = got + o.points end
	local r = { done = done, got = got, total = lp.total }
	if done then
		r.order = lp.order
		r.ascOrder = lp.ascOrder
		local extra = build.calcsTab.mainOutput and build.calcsTab.mainOutput.ExtraPoints or 0
		r.extra = extra
		r.level = build.characterLevel
		r.switchedAt = lp.switchedAt
		lp = nil
	end
	return r
end

-- Configuration ticks the build itself tells: charges you generate, Onslaught and the other buffs you gain,
-- rage (at its maximum), a flask, a warcry. Only options still at their default are set.
local AUTO_RULES = {
	{ var = "usePowerCharges", gain = "power charge", gems = { "Power Charge On Critical", "Assassin's Mark" } },
	{ var = "useFrenzyCharges", gain = "frenzy charge", gems = { "Frenzy", "Blood Rage", "Poacher's Mark" } },
	{ var = "useEnduranceCharges", gain = "endurance charge", gems = { "Enduring Cry", "Endurance Charge on Melee Stun", "Warlord's Mark" } },
	{ var = "buffOnslaught", gain = "onslaught", have = "you have onslaught", flask = "Silver Flask" },
	{ var = "buffArcaneSurge", gain = "arcane surge", gems = { "Arcane Surge" } },
	{ var = "buffUnholyMight", gain = "unholy might" },
	{ var = "buffChaoticMight", gain = "chaotic might" },
	{ var = "buffFortification", gain = "fortif", also = "fortify", gems = { "Fortify" } },
	{ var = "buffTailwind", gain = "tailwind" },
	{ var = "buffAdrenaline", gain = "adrenaline" },
	{ var = "buffLifetap", gems = { "Lifetap" } },
	{ var = "conditionOnConsecratedGround", gain = "consecrated ground", also = "create consecrated ground" },
}
local function buildText()
	local lines, gems, flasks = { }, { }, { }
	for _, n in pairs(build.spec.allocNodes) do for _, l in ipairs(n.sd or { }) do lines[#lines + 1] = l:lower() end end
	for name, slot in pairs(build.itemsTab.slots) do
		local it = slot.selItemId and build.itemsTab.items[slot.selItemId]
		if it and not name:find("Swap") then
			for _, key in ipairs({ "implicitModLines", "explicitModLines", "enchantModLines", "scourgeModLines", "crucibleModLines" }) do
				for _, ml in ipairs(it[key] or { }) do if ml.line then lines[#lines + 1] = ml.line:lower() end end
			end
			if name:match("^Flask") then flasks[#flasks + 1] = it.baseName or it.name or "" end
		end
	end
	local warcry = false
	for _, g in ipairs(build.skillsTab.socketGroupList or { }) do
		if g.enabled ~= false then
			for _, gem in ipairs(g.gemList or { }) do
				if gem.enabled ~= false and gem.gemData then
					gems[gem.gemData.name or gem.nameSpec or ""] = true
					if gem.gemData.tags and gem.gemData.tags.warcry then warcry = true end
				end
			end
		end
	end
	return lines, gems, flasks, warcry
end
function autoConfig()
	local lines, gems, flasks, warcry = buildText()
	local input = build.configTab.input or { }
	local out, why = { }, { }
	local function gains(word)
		for _, l in ipairs(lines) do
			if l:find(word, 1, true) and (l:find("%f[%a]gains?%f[%A]") or l:find("%f[%a]grants?%f[%A]") or l:find("%f[%a]generat") or l:find("maximum " .. word, 1, true)) and not l:find("lose all", 1, true) then return l end
		end
	end
	for _, r in ipairs(AUTO_RULES) do
		local hit = r.gain and gains(r.gain)
		if not hit and r.have then for _, l in ipairs(lines) do if l:find(r.have, 1, true) then hit = l break end end end
		if not hit and r.also then for _, l in ipairs(lines) do if l:find(r.also, 1, true) then hit = l break end end end
		if not hit and r.gems then for _, g in ipairs(r.gems) do if gems[g] then hit = g .. " (gem)" break end end end
		if not hit and r.flask then for _, f in ipairs(flasks) do if f:find(r.flask, 1, true) then hit = f break end end end
		if hit then out[r.var] = true; why[r.var] = hit end
	end
	if #flasks > 0 then out.conditionUsingFlask = true; why.conditionUsingFlask = flasks[1] end
	if warcry then out.conditionUsedWarcryRecently = true; why.conditionUsedWarcryRecently = "a warcry gem" end
	-- rage: PoB knows when you can gain it; at its maximum
	local env = build.calcsTab.mainEnv
	local canRage = env and env.player and env.player.modDB and env.player.modDB:Flag(nil, "Condition:CanGainRage")
	local maxRage = build.calcsTab.mainOutput and build.calcsTab.mainOutput.MaximumRage
	if canRage and maxRage and maxRage > 0 then out.multiplierRage = maxRage; why.multiplierRage = string.format("maximum Rage %d", maxRage) end
	-- only what you haven't set yourself
	local list = { }
	for var, v in pairs(out) do
		local cur = input[var]
		if cur == nil or cur == false or cur == 0 then list[#list + 1] = { var = var, value = v, why = why[var] } else out[var] = nil end
	end
	table.sort(list, function(a, b) return a.var < b.var end)
	return out, list
end

-- PoB's own item tooltip (Items tab): the item, then what equipping it in each slot does (its stat compares).
-- PoB draws it on a tooltip object; here a stand-in collects the lines.
local function itemTooltip(text)
	local item = newItem(text)
	if not item or not item.base then return { error = "PoB doesn't know this item's base." } end
	local lines = { }
	local tt = setmetatable({ lines = lines }, { __index = function(t, k)
		if k == "AddLine" then return function(_, size, txt, font) lines[#lines + 1] = { size = size, text = tostring(txt or "") } end end
		if k == "AddSeparator" then return function(_, size) lines[#lines + 1] = { sep = true } end end
		if type(k) == "string" and k:match("^%u") then return function() end end
		return nil
	end })
	tt.maxWidth = 600
	local ok, err = pcall(build.itemsTab.AddItemTooltip, build.itemsTab, tt, item)
	if not ok then return { error = tostring(err) } end
	return { item = item.name, rarity = item.rarity, lines = lines }
end

function handle(line)
	local ok, req = pcall(dkjson.decode, line)
	if not ok or type(req) ~= "table" then return dkjson.encode({ error = "bad request" }) end
	local fine, res = pcall(function()
			if req.op == "load" then
				if not loadBuild(req.xml, req.name) then return { error = "PoB couldn't open that build." } end
				return summary()
			elseif req.op == "itemTooltip" then
				if not build then return { error = "No build loaded." } end
				return itemTooltip(req.item or "")
			elseif req.op == "compare" then
				if not build then return { error = "No build loaded." } end
				return compare(req.item)
			elseif req.op == "import" then
				if type(req.character) ~= "table" then return { error = "No character." } end
				return importCharacter(req)
			elseif req.op == "stats" then
				if not build then return { error = "No build loaded." } end
				return stats(req.mainGroup)
			elseif req.op == "upgrades" then
				if not build then return { error = "No build loaded." } end
				return upgrades()
			elseif req.op == "config" then
				if not build then return { error = "No build loaded." } end
				local r = configList()
				r.summary = summary()
				return r
			elseif req.op == "setConfig" then
				if not build then return { error = "No build loaded." } end
				applyConfig(req.values)
				local r = summary()
				if req.save then r.xml = build:SaveDB(req.name or "build") end
				return r
			elseif req.op == "main" then
				if not build then return { error = "No build loaded." } end
				if build.skillsTab.socketGroupList[req.group] then setMainGroup(req.group) end
				return summary()
			elseif req.op == "weights" then
				if not build then return { error = "No build loaded." } end
				return weights(req)
			elseif req.op == "calcs" then
				if not build then return { error = "No build loaded." } end
				return calcs()
			elseif req.op == "breakdown" then
				if not build then return { error = "No build loaded." } end
				return breakdown(tostring(req.ref or ""))
			elseif req.op == "tree" then
				if not build then return { error = "No build loaded." } end
				local r = tree()
				r.summary = summary()
				return r
			elseif req.op == "node" then
				if not build then return { error = "No build loaded." } end
				return nodeDiff(tonumber(req.node) or 0)
			elseif req.op == "treeEdit" then
				if not build then return { error = "No build loaded." } end
				return treeEdit(req)
			elseif req.op == "power" then
				if not build then return { error = "No build loaded." } end
				return power(req)
			elseif req.op == "optStart" then
				if not build then return { error = "No build loaded." } end
				return optStart(req)
			elseif req.op == "optStep" then
				if not build then return { error = "No build loaded." } end
				return optStep()
			elseif req.op == "optEnd" then
				if not build then return { error = "No build loaded." } end
				return optEnd(req)
			elseif req.op == "supportGems" then
				if not build then return { error = "No build loaded." } end
				return supportGems(req)
			elseif req.op == "timelessSockets" then
				if not build then return { error = "No build loaded." } end
				return timelessSockets()
			elseif req.op == "timelessStart" then
				if not build then return { error = "No build loaded." } end
				return timelessStart(req)
			elseif req.op == "timelessStep" then
				if not build then return { error = "No build loaded." } end
				return timelessStep(req)
			elseif req.op == "timelessResults" then
				return timelessResults(req)
			elseif req.op == "timelessShow" then
				return timelessShow(req)
			elseif req.op == "timelessEnd" then
				if not build then return { error = "No build loaded." } end
				return timelessEnd(req)
			elseif req.op == "levelPlanStart" then
				if not build then return { error = "No build loaded." } end
				return levelPlanStart(req)
			elseif req.op == "levelPlanStep" then
				if not build then return { error = "No build loaded." } end
				return levelPlanStep(req)
			elseif req.op == "asSkillOn" then
				if not build then return { error = "No build loaded." } end
				return asSkillOn(req)
			elseif req.op == "asSkillOff" then
				if not build then return { ok = true } end
				return asSkillOff()
			elseif req.op == "autoConfig" then
				if not build then return { error = "No build loaded." } end
				local vals, list = autoConfig()
				return { values = vals, list = list }
			elseif req.op == "activeSkills" then
				if not build then return { error = "No build loaded." } end
				return activeSkills()
			elseif req.op == "levelSkill" then
				if not build then return { error = "No build loaded." } end
				return levelSkill(req)
			elseif req.op == "ping" then return { ok = true }
			end
			return { error = "unknown request" }
		end)
	if fine then res.id = req.id; return dkjson.encode(res) end
	return dkjson.encode({ id = req.id, error = tostring(res) })
end

-- run as a program (luajit host.lua): answer requests on stdin; inside the app the worker calls handle()
if not POEHELPER_EMBEDDED then
	io.stdout:write(dkjson.encode({ ready = true }), "\n"); io.stdout:flush()
	for line in io.stdin:lines() do io.stdout:write(handle(line), "\n"); io.stdout:flush() end
end
