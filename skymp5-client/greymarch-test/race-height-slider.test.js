"use strict";
// Our Height slider on RaceMenu's Body tab (bridge.ts greymarchHeightModEvent / greymarchHeightFrame): RaceMenu's own Body Scales tab never showed under
// SkyMP, so the game adds a Height slider the way RaceMenu's scripts add theirs and sets the same node scale RaceMenu's slider would (NPC, key RSMPlugin),
// inside the race's range. The first builds failed in game: getActorBase is not a function, then "Invalid _skyrimPlatform_indexInPool: 0" (native calls
// made inside the mod event callback).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const body = src.slice(src.indexOf("    greymarchHeightState(): any {"), src.indexOf("    greymarchRaceMenuTick(now: number): any {"));
const fn = (name) => { const i = body.indexOf(`    ${name}(`); assert.ok(i >= 0, name); const j = body.indexOf("\n    greymarch", i + 10); return body.slice(i, j < 0 ? undefined : j); };

test("listens to the game's mod events and runs every frame from the tick", () => {
  assert.match(src, /this\.sp\.on\("modEvent", \(e: any\) => this\.greymarchHeightModEvent\(e\)\)/);
  assert.match(src, /const GM_HEIGHT_CALLBACK = "GM_ChangeHeight";/);
  assert.match(src, /this\.greymarchHeightFrame\(Date\.now\(\)\);[^\n]*\r?\n\s*this\.greymarchRaceMenuQuestsTick\(Date\.now\(\)\);/);
});

test("nothing native inside the mod event callback: it only notes builds, readiness and the wanted value", () => {
  const cb = fn("greymarchHeightModEvent");
  assert.doesNotMatch(cb, /callNative|invokeStringA|getPlayer|isMenuOpen|greymarchHeightAdd\(|greymarchHeightSet\(/);
  assert.match(cb, /if \(name === "RSM_Reinitialized" \|\| \(name === "RSMDT_SendDataRequest" && \(num & 32\) === 32\)\) \{ h\.build\+\+; h\.buildAt = Date\.now\(\); h\.ready = true; return; \}/);
  assert.match(cb, /if \(name === "RSM_Initialized"\) \{ h\.ready = true; return; \}/);
  assert.match(cb, /if \(name === "RSM_SliderChange" && String\(e\.strArg\) === GM_HEIGHT_CALLBACK\) h\.want = num;/);
  assert.match(cb, /"racemenu: the race menu says " \+ name/, "every event name logged the first time");
});

test("the frame: a build when the menu opens; the slider once per build, when the menu is ready or 2 s in; a move applied; nothing while closed", () => {
  const f = fn("greymarchHeightFrame");
  assert.match(f, /open = !!this\.sp\.Ui\.isMenuOpen\("RaceSex Menu"\)/);
  assert.match(f, /if \(!open\) \{ h\.wasOpen = false; h\.want = undefined; return; \}/);
  assert.match(f, /if \(!h\.wasOpen\) \{ h\.wasOpen = true; h\.build\+\+; h\.buildAt = now; h\.ready = false; \}/);
  assert.match(f, /if \(h\.added !== h\.build && \(h\.ready \|\| now - h\.buildAt > 2000\)\) \{\s*h\.added = h\.build;/);
  assert.match(f, /if \(h\.want !== undefined\) \{ var v = h\.want; h\.want = undefined; this\.greymarchHeightSet\(v\); \}/);
});

test("the slider line is RaceMenuBase.AddSlider's (7 fields, section 4 = Body), sent to the menu's RSM_AddSliders", () => {
  const a = fn("greymarchHeightAdd");
  assert.match(a, /var line = "\$Height;;4;;" \+ GM_HEIGHT_CALLBACK \+ ";;" \+ r\[0\] \+ ";;" \+ r\[1\] \+ ";;0\.005;;" \+ \(Math\.round\(v \* 1000\) \/ 1000\);/);
  assert.match(a, /sp\.Ui\.invokeString\("RaceSex Menu", "_root\.RaceSexMenuBaseInstance\.RaceSexPanelsInstance\.RSM_AddSliders", line\)/);
  assert.doesNotMatch(body, /invokeStringA\(/, "the array form failed in game: 'JsObjectToNativeObject - Invalid _skyrimPlatform_indexInPool: 0'");
  // what that makes for a Bosmer man at his tallest
  const r = [0.878, 0.979], v = 0.979;
  const line = "$Height;;4;;GM_ChangeHeight;;" + r[0] + ";;" + r[1] + ";;0.005;;" + (Math.round(v * 1000) / 1000);
  assert.strictEqual(line, "$Height;;4;;GM_ChangeHeight;;0.878;;0.979;;0.005;;0.979");
  assert.strictEqual(line.split(";;").length, 7);
});

test("moving it sets RaceMenu's own body scale (NPC, RSMPlugin), third and first person, inside the range; 1 takes it off; read back in the log", () => {
  const s = fn("greymarchHeightSet");
  assert.match(s, /Math\.min\(r\[1\], Math\.max\(r\[0\], value\)\)/);
  assert.match(s, /"AddNodeTransformScale", undefined, player, false, female, "NPC", "RSMPlugin", v\)\);/);
  assert.match(s, /"AddNodeTransformScale", undefined, player, true, female, "NPC", "RSMPlugin", v\)\);/);
  assert.match(s, /"RemoveNodeTransformScale", undefined, player, false, female, "NPC", "RSMPlugin"\)/);
  assert.match(s, /"UpdateNodeTransform", undefined, player, false, female, "NPC"\)/);
  assert.match(s, /"UpdateNodeTransform", undefined, player, true, female, "NPC"\)/);
  assert.match(s, /the skeleton reads " \+ this\.greymarchHeightNow\(player, female\)/);
});

test("the sex from the base object (Actor has no getActorBase in this SkyrimPlatform); the range the server's, 0.93-1.07 until it comes", () => {
  assert.doesNotMatch(body, /getActorBase\(/);
  assert.match(body, /sp\.ActorBase\.from\(player\.getBaseObject\(\)\)/);
  assert.match(src, /if \(Array\.isArray\(msg\.height\) && msg\.height\.length === 2 && msg\.height\[0\] > 0 && msg\.height\[1\] >= msg\.height\[0\]\) this\.greymarchHeightRange = \[Number\(msg\.height\[0\]\), Number\(msg\.height\[1\]\)\];/);
  assert.match(body, /return Array\.isArray\(r\) \? r : \[0\.93, 1\.07\];/);
});

test("the old race menu tick no longer adds the slider itself", () => {
  const i = src.indexOf("    greymarchRaceMenuTick(now: number): any {");
  assert.doesNotMatch(src.slice(i, i + 3000), /greymarchHeightAdd/);
});

test("every native step is named in the error when it throws; a scale that cannot be read starts the slider at 1 instead of stopping it", () => {
  assert.match(body, /greymarchHeightStep\(what: string, run: \(\) => any\): any \{\s*try \{ return run\(\); \} catch \(err\) \{ throw new Error\(what \+ ": " \+ err\); \}/);
  for (const w of ["invokeString RSM_AddSliders", "NiOverride.GetNodeTransformScale", "ActorBase of the player", "NiOverride.AddNodeTransformScale", "NiOverride.UpdateNodeTransform"]) assert.ok(body.includes(`"${w}`), w);
  assert.match(fn("greymarchHeightAdd"), /catch \(readErr\) \{ this\.greymarchLog\("racemenu: the Height slider starts at 1, the scale could not be read: "/);
});

