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
	local item = new("Item"):Item(text)
	if not item.base then return { error = "PoB doesn't know this item's base." } end
	local calcFunc, base = build.calcsTab:GetMiscCalculator()
	-- builds that count every skill ("Full DPS") are compared on that, the rest on the main skill
	local full = (base.FullDPS or 0) > 0
	local slots = { }
	for _, slot in pairs(build.itemsTab.slots) do
		if not slot.inactive and build.itemsTab:IsItemValidForSlot(item, slot.slotName) then
			local cur = build.itemsTab.items[slot.selItemId]
			local out = calcFunc({ repSlotName = slot.slotName, repItem = item }, full)
			slots[#slots + 1] = { slot = slot.slotName, current = cur and cur.name or nil, stats = pick(out) }
		end
	end
	table.sort(slots, function(a, b) return a.slot < b.slot end)
	return { item = item.name, full = full, base = pick(base), slots = slots }
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
	local xml = build:SaveDB(req.name or "snapshot")
	if not xml then return { error = "PoB couldn't write the build." } end
	local s = summary()
	s.xml = xml
	return s
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
