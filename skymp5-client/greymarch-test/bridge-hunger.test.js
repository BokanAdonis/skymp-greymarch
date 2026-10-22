"use strict";
// Hunger's client half (gamemode hunger.js): greymarchStagger plays a stagger on the player or on another player's copy; greymarchHungerFx turns regeneration off and on.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");

test("both packets are let through and handled", () => {
  assert.match(auth, /case 'greymarchStagger':/);
  assert.match(auth, /case 'greymarchHungerFx':/);
  assert.match(src, /if \(type === "greymarchStagger"\) \{ if \(Number\(msg\.actor\) > 0\) \(this\.greymarchStaggerQueue/);
  assert.match(src, /if \(type === "greymarchHungerFx"\) \{ this\.greymarchHungerRegen = msg\.regen !== false; return; \}/);
  assert.match(src, /this\.greymarchHungerDrive\(\); \/\/ hunger/);
});

test("the stagger: the player's own with sendAnimationEvent, another player's copy through SkyMP's animation path", () => {
  assert.match(src, /if \(q\[i\]\.self\) \{ this\.sp\.Debug\.sendAnimationEvent\(this\.sp\.Game\.getPlayer\(\), "staggerStart"\); continue; \}/);
  assert.match(src, /animMod\.applyAnimation\(ref, \{ animEventName: "staggerStart", numChanges: 1 \}/);
});

test("regeneration: HealRate and StaminaRate to 0 while starving, put back after", () => {
  assert.match(src, /player\.setActorValue\("HealRate", 0\); player\.setActorValue\("StaminaRate", 0\);/);
  assert.match(src, /player\.setActorValue\("HealRate", Number\.isFinite\(saved\.heal\)/);
});

test("the hunger bowl: greymarchHunger is let through and handed to the HUD page", () => {
  assert.match(auth, /case 'greymarchHunger':/);
  assert.match(src, /if \(type === "greymarchHunger"\) \{ this\.greymarchHudToPage\("hunger", \{ stage: String\(msg\.stage \|\| "fed"\) \}\); return; \}/);
});
