"use strict";
// A new character's starting clothes (src/greymarch/bridge.ts greymarchTick, greymarchReset): after each reset the body is redrawn once the clothes are on and the race
// menu is closed (2026-10-28: the iron armor of the game's default gear stayed on screen after it had left the inventory, until a race change rebuilt the body).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("a reset asks for a redraw; it happens once the clothes are on, outside the race menu, with the body loaded", () => {
  const reset = src.slice(src.indexOf("greymarchReset(eq: any, player: any, why: any): any {"), src.indexOf("eq.resets++;"));
  assert.ok(reset.includes("eq.redraw = true;"), "every reset asks for it");
  assert.ok(src.includes("if (eq.redraw && eq.ids.length === 0 && !raceMenuOpen) {"), "only once the clothes are on and the race menu is closed");
  assert.ok(src.includes("if (player.is3DLoaded()) { player.queueNiNodeUpdate();"), "the body is redrawn, only when it is loaded");
  const at = src.indexOf("if (eq.redraw && eq.ids.length === 0 && !raceMenuOpen) {");
  assert.ok(at > src.indexOf('this.greymarchLog("put on " + form.getName());') && at < src.indexOf("if (eq.menuClosed && eq.pending.length === 0 && eq.ids.length === 0) this.greymarchEquip = null;"), "after the clothes go on, before the watch ends");
});
