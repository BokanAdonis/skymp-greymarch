"use strict";
// Combat skill perks (COMBAT-OVERHAUL.md): the gamemode sends greymarchCombatPerks { blockSpeed, bowSpeed, fastDraw } and the bridge gives the
// game's own Block Runner, Ranger and Quick Shot perks, and takes away only the ones it gave.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");

test("greymarchCombatPerks is let through and read as three booleans", () => {
  assert.match(auth, /case 'greymarchCombatPerks':/);
  assert.match(src, /if \(type === "greymarchCombatPerks"\) \{ this\.greymarchPerksWant = \{ blockSpeed: msg\.blockSpeed === true, bowSpeed: msg\.bowSpeed === true, fastDraw: msg\.fastDraw === true, sprintPower: msg\.sprintPower === true \}; this\.greymarchPerksDirty = true; return; \}/);
});

test("the vanilla perk ids are Block Runner, Ranger and Quick Shot", () => {
  assert.match(src, /const GREYMARCH_PERK_BLOCK_RUNNER = 0x00106253;/);
  assert.match(src, /const GREYMARCH_PERK_RANGER = 0x00058F63;/);
  assert.match(src, /const GREYMARCH_PERK_QUICK_SHOT = 0x00105F19;/);
});

test("the effects pass runs the perks and does not skip while a change is due", () => {
  assert.match(src, /!this\.greymarchPerksDue\(now\) && \(this\.greymarchSelfCleared/);
  assert.match(src, /this\.greymarchCombatApply\(player\); this\.greymarchPerksApply\(now, player\);/);
});

test("a perk is added when wanted and missing, removed only when this bridge added it", () => {
  assert.match(src, /if \(w\[e\.key\] && !has\) \{ player\.addPerk\(perk\); added\[e\.id\] = true;/);
  assert.match(src, /else if \(!w\[e\.key\] && has && added\[e\.id\]\) \{ player\.removePerk\(perk\); added\[e\.id\] = false;/);
});

// the apply logic itself, pulled out of the source and run against a fake player
test("apply: on, off, and a perk the player had before is left alone", () => {
  const start = src.indexOf("    greymarchPerksDue(now: number): any {");
  const end = src.indexOf("    // STAT MAXIMUMS set by staff");
  const body = src.slice(start, end).replace(/\(now: number\): any/g, "(now)").replace(/\(now: number, player: any\): any/g, "(now, player)");
  const Cls = new Function("GREYMARCH_PERK_BLOCK_RUNNER", "GREYMARCH_PERK_RANGER", "GREYMARCH_PERK_QUICK_SHOT", "GREYMARCH_PERK_CRITICAL_CHARGE", "GREYMARCH_PERK_GREAT_CRITICAL_CHARGE", "return class {\n" + body + "\n};")(1, 2, 3, 4, 5);
  const b = new Cls();
  const logs = [];
  b.greymarchLog = (m) => logs.push(m);
  b.sp = { Perk: { from: (f) => f }, Game: { getFormEx: (id) => ({ id }) } };
  const perks = new Set([3]); // already had Quick Shot
  const player = { hasPerk: (p) => perks.has(p.id), addPerk: (p) => perks.add(p.id), removePerk: (p) => perks.delete(p.id) };

  assert.strictEqual(b.greymarchPerksDue(0), false);
  b.greymarchPerksWant = { blockSpeed: true, bowSpeed: false, fastDraw: false };
  b.greymarchPerksDirty = true;
  b.greymarchPerksApply(0, player);
  assert.deepStrictEqual([...perks].sort(), [1, 3]); // Quick Shot was not ours: kept
  assert.strictEqual(b.greymarchPerksDue(1000), false);
  assert.strictEqual(b.greymarchPerksDue(6000), true); // re-checked every 5 s

  b.greymarchPerksWant = { blockSpeed: false, bowSpeed: true, fastDraw: false };
  b.greymarchPerksDirty = true;
  b.greymarchPerksApply(7000, player);
  assert.deepStrictEqual([...perks].sort(), [2, 3]);

  // rank 5 melee: the sprinting power attack (the lunge) needs Critical Charge and Great Critical Charge (2026-10-31, the owner)
  b.greymarchPerksWant = { blockSpeed: false, bowSpeed: false, fastDraw: false, sprintPower: true };
  b.greymarchPerksDirty = true;
  b.greymarchPerksApply(14000, player);
  assert.deepStrictEqual([...perks].sort(), [3, 4, 5]);
});

test("fast draw is a little faster (2026-10-31, the owner): WeaponSpeedMult 1.15 while a bow or crossbow is in hand, put back after", () => {
  const start = src.indexOf("    greymarchFastDrawApply(now: number, player: any): any {");
  const end = src.indexOf("    // STAT MAXIMUMS set by staff");
  const body = src.slice(start, end).replace(/\(now: number, player: any\): any/g, "(now, player)");
  const Cls = new Function("GREYMARCH_FAST_DRAW_SPEED", "return class {\n" + body + "\n};")(1.15);
  const b = new Cls();
  let av = 0, type = 7;
  const player = { getEquippedWeapon: () => ({ getWeaponType: () => type }), getActorValue: () => av, setActorValue: (k, v) => { assert.strictEqual(k, "WeaponSpeedMult"); av = v; } };
  b.greymarchPerksWant = { fastDraw: true };
  b.greymarchFastDrawApply(0, player); assert.strictEqual(av, 1.15, "a bow in hand");
  type = 1; b.greymarchFastDrawApply(1000, player); assert.strictEqual(av, 0, "a sword: put back");
  type = 9; b.greymarchFastDrawApply(2000, player); assert.strictEqual(av, 1.15, "a crossbow too");
  b.greymarchPerksWant = { fastDraw: false }; b.greymarchFastDrawApply(3000, player); assert.strictEqual(av, 0, "the perk gone: put back");
});
