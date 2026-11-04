"use strict";
// Our Height slider on RaceMenu's Body tab (bridge.ts greymarchHeightModEvent): RaceMenu's own Body Scales tab never showed under SkyMP, so the game adds
// a Height slider the way RaceMenu's scripts do and sets the same node scale RaceMenu's slider would (NPC, key RSMPlugin), inside the race's range.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const body = src.slice(src.indexOf("    greymarchHeightModEvent(e: any): any {"), src.indexOf("    greymarchRaceMenuTick(now: number): any {"));

test("listens to the game's mod events", () => {
  assert.match(src, /this\.sp\.on\("modEvent", \(e: any\) => this\.greymarchHeightModEvent\(e\)\)/);
  assert.match(src, /const GM_HEIGHT_CALLBACK = "GM_ChangeHeight";/);
});

test("the slider is added when the menu asks for sliders, in RaceMenu's own line format, on the Body section (4)", () => {
  assert.match(body, /name === "RSM_Initialized" \|\| name === "RSM_Reinitialized" \|\| \(name === "RSMDT_SendDataRequest" && \(Number\(e\.numArg\) & 32\) === 32\)/);
  assert.match(body, /var line = "\$Height;;4;;" \+ GM_HEIGHT_CALLBACK \+ ";;" \+ r\[0\] \+ ";;" \+ r\[1\] \+ ";;0\.005;;" \+ \(Math\.round\(v \* 1000\) \/ 1000\) \+ ";;;;0";/);
  assert.match(body, /this\.sp\.Ui\.invokeStringA\("RaceSex Menu", "_root\.RaceSexMenuBaseInstance\.RaceSexPanelsInstance\.RSM_AddSliders", \[line\]\);/);
});

test("and 2 s after the menu opens when no word came from it", () => {
  assert.match(src, /if \(open && !rm\.menuWas\) \{ rm\.openedAt = now; this\.greymarchHeightAdded = false; \}/);
  assert.match(src, /if \(open && !this\.greymarchHeightAdded && now - \(rm\.openedAt \|\| now\) > 2000\) \{/);
});

test("moving it sets RaceMenu's own body scale (NPC, RSMPlugin), third and first person, inside the range; 1 takes it off", () => {
  assert.match(body, /name === "RSM_SliderChange" && String\(e\.strArg\) === GM_HEIGHT_CALLBACK\) this\.greymarchHeightSet\(Number\(e\.numArg\)\)/);
  assert.match(body, /Math\.min\(r\[1\], Math\.max\(r\[0\], value\)\)/);
  assert.match(body, /"AddNodeTransformScale", undefined, player, false, female, "NPC", "RSMPlugin", v\); sp\.callNative\("NiOverride", "AddNodeTransformScale", undefined, player, true, female, "NPC", "RSMPlugin", v\);/);
  assert.match(body, /"RemoveNodeTransformScale", undefined, player, false, female, "NPC", "RSMPlugin"\)/);
  assert.match(body, /"UpdateNodeTransform", undefined, player, false, female, "NPC"\)/);
});

test("the range is the race's, sent by the server with the look; 0.93-1.07 until then", () => {
  assert.match(src, /if \(Array\.isArray\(msg\.height\) && msg\.height\.length === 2 && msg\.height\[0\] > 0 && msg\.height\[1\] >= msg\.height\[0\]\) this\.greymarchHeightRange = \[Number\(msg\.height\[0\]\), Number\(msg\.height\[1\]\)\];/);
  assert.match(body, /return Array\.isArray\(r\) \? r : \[0\.93, 1\.07\];/);
});

test("the sex comes from the base object (Actor has no getActorBase in this SkyrimPlatform: the first build threw on it)", () => {
  assert.doesNotMatch(body, /getActorBase\(/);
  assert.match(body, /this\.sp\.ActorBase\.from\(player\.getBaseObject\(\)\)/);
});

