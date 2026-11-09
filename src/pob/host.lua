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
	build.buildFlag = true
	runCallback("OnFrame")
	-- PoB's import makes the group with the most gems the main skill (often an aura link); take the one
	-- that does the most damage instead
	pickMainSkill()
	local xml = build:SaveDB(req.name or "snapshot")
	if not xml then return { error = "PoB couldn't write the build." } end
	local s = summary()
	s.xml = xml
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
local GEAR = { "Weapon 1", "Weapon 2", "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Ring 3", "Belt",
	"Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5" }
local function gear()
	local list = { }
	for _, name in ipairs(GEAR) do
		local slot = build.itemsTab.slots[name]
		local item = usable(slot) and build.itemsTab.items[slot.selItemId]
		if item then list[#list + 1] = { slot = name, name = item.name, title = item.title, base = item.baseName, rarity = item.rarity } end
	end
	-- jewels in the tree
	for _, slot in pairs(build.itemsTab.slots) do
		local item = slot.nodeId and build.itemsTab.items[slot.selItemId]
		if item and build.spec.allocNodes[slot.nodeId] then list[#list + 1] = { slot = "Jewel", name = item.name, title = item.title, base = item.baseName, rarity = item.rarity } end
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

-- one request (a JSON line) -> one answer (a JSON line)
function handle(line)
	local ok, req = pcall(dkjson.decode, line)
	if not ok or type(req) ~= "table" then return dkjson.encode({ error = "bad request" }) end
	local fine, res = pcall(function()
			if req.op == "load" then
				if not loadBuild(req.xml, req.name) then return { error = "PoB couldn't open that build." } end
				return summary()
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
			elseif req.op == "main" then
				if not build then return { error = "No build loaded." } end
				if build.skillsTab.socketGroupList[req.group] then setMainGroup(req.group) end
				return summary()
			elseif req.op == "weights" then
				if not build then return { error = "No build loaded." } end
				return weights(req)
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
