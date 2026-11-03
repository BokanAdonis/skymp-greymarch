"use strict";
// Brass knuckles (2026-11-03): greymarchCombatMod carries the fists' own multiplier (fist) besides the attack multiplier (mult). The fists' goes on the
// game's unarmed damage (the race's base x fist), so a weapon in the left hand keeps only the attack multiplier, as the server's fistMult does.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("greymarchCombatMod reads fist (0.1 to 5, else 1) and the effects pass wakes for a fist change", () => {
  assert.match(src, /var fm = Number\(msg\.fist\); this\.greymarchFistWant = fm >= 0\.1 && fm <= 5 \? fm : 1;/);
  assert.match(src, /!\(this\.greymarchFistWant !== undefined && this\.greymarchFistWant !== this\.greymarchFistHave\) && /);
});

test("apply: the fists on the unarmed damage from its base, the attack multiplier apart, each once per change", () => {
  const start = src.indexOf("    greymarchCombatApply(player: any): any {");
  const end = src.indexOf("    // COMBAT SKILL PERKS (greymarchCombatPerks)");
  const body = src.slice(start, end).replace(/\(player: any\): any/g, "(player)");
  const Cls = new Function("return class {\n" + body + "\n};")();
  const b = new Cls(); b.greymarchLog = () => {};
  const set = []; const player = { getBaseActorValue: (k) => (k === "UnarmedDamage" ? 4 : 0), setActorValue: (k, v) => set.push([k, v]) };
  b.greymarchCombatWant = 0.75; b.greymarchFistWant = 1.8;
  b.greymarchCombatApply(player);
  assert.deepEqual(set, [["UnarmedDamage", 7.2], ["AttackDamageMult", 0.75]], "Iron knuckles with an off-skill sword in the left hand");
  b.greymarchCombatApply(player); assert.equal(set.length, 2, "nothing changed, nothing set");
  b.greymarchFistWant = 1; b.greymarchCombatApply(player);
  assert.deepEqual(set.pop(), ["UnarmedDamage", 4], "knuckles off: the race's own unarmed damage back");
  const noFist = new Cls(); noFist.greymarchLog = () => {}; const s2 = [];
  noFist.greymarchCombatWant = 1.25; noFist.greymarchCombatApply({ getBaseActorValue: () => 4, setActorValue: (k, v) => s2.push([k, v]) });
  assert.deepEqual(s2, [["UnarmedDamage", 4], ["AttackDamageMult", 1.25]], "an older gamemode (no fist): fists stay at the base");
});
