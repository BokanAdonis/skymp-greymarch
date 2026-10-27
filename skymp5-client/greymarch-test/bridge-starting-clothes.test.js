"use strict";
// A new character's starting clothes (src/greymarch/bridge.ts greymarchTick, greymarchReset): after each reset the body is redrawn once the clothes are on, and again a
// second later, in the race menu too (2026-10-28: the iron armor of the game's default gear stayed on screen after it had left the inventory, until a race change rebuilt
// the body; the first fix waited for the race menu to close, and its preview kept the iron).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("a reset asks for two redraws (at once and a second later); they happen once the clothes are on, in the race menu too, with the body loaded", () => {
  const reset = src.slice(src.indexOf("greymarchReset(eq: any, player: any, why: any): any {"), src.indexOf("eq.resets++;"));
  assert.ok(reset.includes("eq.redrawAt = [Date.now(), Date.now() + 1000];"), "every reset asks for them");
  assert.ok(src.includes("if (eq.redrawAt && eq.redrawAt.length && eq.ids.length === 0) {"), "once the clothes are on");
  assert.ok(!src.includes("eq.ids.length === 0 && !raceMenuOpen"), "not held back while the race menu is open");
  assert.ok(src.includes("if (player.is3DLoaded()) { player.queueNiNodeUpdate();"), "the body is redrawn, only when it is loaded");
  assert.ok(src.includes("eq.ids.length === 0 && !(eq.redrawAt && eq.redrawAt.length)) this.greymarchEquip = null;"), "the watch does not end with a redraw still to come");
  const at = src.indexOf("if (eq.redrawAt && eq.redrawAt.length && eq.ids.length === 0) {");
  assert.ok(at > src.indexOf('this.greymarchLog("put on " + form.getName());'), "after the clothes go on");
});
