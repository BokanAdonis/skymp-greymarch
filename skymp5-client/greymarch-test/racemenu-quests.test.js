"use strict";
// RaceMenu's own quests (bridge.ts greymarchRaceMenuQuestsTick): the Body Scales tab (Height) comes from RaceMenuPlugin.esp's quest, which did not show
// under SkyMP; each RaceMenu quest not running once the body is in the world is started, three tries, and what was found is logged.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const body = src.slice(src.indexOf("    greymarchRaceMenuQuestsTick(now: number): any {"), src.indexOf("    greymarchRaceMenuTick(now: number): any {"));

test("the check runs every frame from the tick, next to the race menu sliders", () => {
  assert.match(src, /this\.greymarchRaceMenuQuestsTick\(Date\.now\(\)\);[^\n]*\r?\n\s*this\.greymarchRaceMenuTick\(Date\.now\(\)\);/);
  assert.ok(body.length > 200, "the method is there");
});

test("both of RaceMenu's quests, by their plugin and id", () => {
  assert.match(body, /\{ id: 0x801, file: "RaceMenuPlugin\.esp", name: "RaceMenuPlugin" \}/);
  assert.match(body, /\{ id: 0x800, file: "RaceMenu\.esp", name: "RaceMenu" \}/);
  assert.match(body, /sp\.Quest\.from\(sp\.Game\.getFormFromFile\(q\.id, q\.file\)\)/);
});

test("only once the body is in the world for 5 s; a quest not running and not starting is started, at most three times, 10 s apart", () => {
  assert.match(body, /if \(!player \|\| !player\.is3DLoaded\(\)\) \{ st\.since = 0; return; \}/);
  assert.match(body, /if \(now - st\.since < 5000\) return;/);
  assert.match(body, /if \(running\) \{/);
  assert.match(body, /if \(starting\) continue;/);
  assert.match(body, /if \(st\.tries >= 3\) \{ this\.greymarchLog\("racemenu: quest " \+ q\.name \+ " still not running after 3 starts"\); continue; \}/);
  assert.match(body, /quest\.start\(\);/);
  assert.match(body, /st\.next = now \+ 10000;/);
  assert.match(body, /if \(!off \|\| st\.tries >= 3\) \{ st\.done = true; return; \}/);
});

test("what was found is logged either way, and an error stops the check without throwing", () => {
  assert.match(body, /"racemenu: quest " \+ q\.name \+ " running"/);
  assert.match(body, /"racemenu: quest " \+ q\.name \+ " was not running: started \(try "/);
  assert.match(body, /"racemenu: quest " \+ q\.name \+ " not found \("/);
  assert.match(body, /catch \(err\) \{\s*this\.greymarchLog\("racemenu: the quests could not be checked: " \+ err\);\s*st\.done = true;/);
});
