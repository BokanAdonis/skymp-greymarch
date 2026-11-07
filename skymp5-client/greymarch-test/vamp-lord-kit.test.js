"use strict";
// The Vampire Lord's kit (bridge.ts greymarchLordKitTick; gamemode vampire.js lordKit): the owner found the Lord "naked in lord form, no cloth and no powers".
// The server teaches the powers and puts the robes in the pack; the game wears the robes (and on the NPC shown in npc mode), puts the powers in hand, keeps the
// menus for this form only and takes off any other armor.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const body = src.slice(src.indexOf("    greymarchLordKitTick(now: number): any {"), src.indexOf("    greymarchShapeMsg(msg: any): any {"));

test("the Lord message keeps the kit (robe and hands) and drops it when the form ends", () => {
  assert.match(src, /if \(!msg\.on\) this\.greymarchLordKit = null;/);
  assert.match(src, /else if \(fiOk\(msg\.robe\) && msg\.hands && typeof msg\.hands === "object" && !this\.greymarchLordKit\) this\.greymarchLordKit = \{ robe: msg\.robe,/);
});

test("runs from the tick, twice a second, only while in a form", () => {
  assert.match(src, /this\.greymarchLordKitTick\(Date\.now\(\)\);[^\n]*\r?\n\s*this\.greymarchVampTick\(\); \/\/ a vampire/);
  assert.match(body, /if \(!kit \|\| !this\.greymarchShapeOn \|\| now < kit\.next\) return;\s*kit\.next = now \+ 500;/);
});

test("the robes go on the player (others see them) and on the NPC shown here in npc mode", () => {
  assert.match(body, /if \(robe && player\.getItemCount\(robe\) > 0 && !player\.isEquipped\(robe\)\) \{ player\.equipItem\(robe, false, true\);/);
  assert.match(body, /if \(robe && pup && pup\.ready && kit\.puppetDressed !== pup\.id\) \{/);
  assert.match(body, /if \(!pa\.isEquipped\(robe\)\) pa\.equipItem\(robe, false, true\); kit\.puppetDressed = pup\.id;/);
});

test("the powers go in hand once each, as soon as the player knows them: left 0, right 1, power 2", () => {
  assert.match(body, /var slots: any = \{ left: 0, right: 1, power: 2 \};/);
  assert.match(body, /if \(!spell \|\| !player\.hasSpell\(spell\)\)/);
  assert.match(body, /player\.equipSpell\(spell, slots\[k\]\);\s*kit\.done\[k\] = true;/);
});

test("no armor but the robes and the fangs; never the body's own skin", () => {
  assert.match(body, /var w = player\.getWornForm\(\(1 << b\) >>> 0\);/);
  assert.match(body, /if \(wid === robeId \|\| wid === fangId \|\| !sp\.Armor\.from\(w\) \|\| player\.getItemCount\(w\) <= 0\) continue;/);
  assert.match(body, /player\.unequipItem\(w, false, true\);/);
});

test("the menus stay for a form that says so (the Lord); beast form for every other form, in both modes", () => {
  assert.match(src, /mode: msg\.mode === "race" \? "race" : "npc", menus: msg\.menus === true, weapon: Number\(msg\.weapon\) >>> 0, drawn: msg\.drawn === true, speed: shapeSpeedOf\(msg\.speed\) \};/);
  const n = (src.match(/step = "beast form"; if \(!want\.menus\) sp\.Game\.setBeastForm\(true\);/g) || []).length;
  assert.strictEqual(n, 2, "npc and race mode");
});

test("a creature attack waits for its combat stance; a drawn form keeps the stance; the hidden body's pace follows the creature's gait (2026-11-06, the giant)", () => {
  assert.match(src, /else this\.greymarchShapePending = \{ ev: ev, power: power, until: now \+ SHAPE_STANCE_WAIT_MS \};/);
  assert.match(src, /if \(ready \|\| now >= pend\.until\)/);
  assert.match(src, /if \(want\.drawn\) \{ this\.greymarchShapeCombatUntil = now \+ 6000;/);
  assert.match(src, /gait = player\.isSprinting\(\) \? "sprint" : player\.isRunning\(\) \? "run" : "walk";/);
  assert.match(src, /this\.greymarchShapePending = null; this\.greymarchShapeCombatUntil = 0;\r?\n\s+this\.greymarchShapeSpeedReset\(player\);/);
});
