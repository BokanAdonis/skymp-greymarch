"use strict";
// src/greymarch/bridge.ts greymarchFoodFxNote: one food effect at a time in the player's own game (gamemode foodeffects.js; 2026-11-02, the owner: "make sure
// no food that gives an effect can be stacked so no one becomes unkillable or able to sprint forever")
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
function make() {
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: (id) => id } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  const gm = new mod.exports.GreymarchBridge({ printConsole() {}, writeLogs() {}, on() {}, storage: {} }, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchLog = () => {};
  gm.greymarchAvSnap = { health: 50, magicka: 60, stamina: 70 };
  return gm;
}
const food = (durations) => ({ getNumEffects: () => durations.length, getNthEffectMagicEffect: (i) => ({ getFormID: () => 0xf33cb + i }), getNthEffectDuration: (i) => durations[i] });
const named = { getName: () => "Goat Cheese Wheel" };

test("a second food with an effect while the first is on is undone in this game; plain food never is; after the effect it works again", () => {
  const gm = make();
  gm.greymarchFoodFxNote(food([0]), named);
  assert.ok(!gm.greymarchPotionUndo, "the first one works");
  assert.ok(gm.greymarchFoodFxUntil - Date.now() > 55000, "an instant effect blocks for a minute");
  gm.greymarchFoodFxNote(food([]), named);
  assert.ok(!gm.greymarchPotionUndo, "bread has no effect to stack");
  gm.greymarchFoodFxNote(food([300]), named);
  assert.ok(gm.greymarchPotionUndo, "the second is undone");
  assert.deepStrictEqual(gm.greymarchPotionUndo.snap, { health: 50, magicka: 60, stamina: 70 }, "health, magicka and stamina go back to the frame before");
  assert.ok(gm.greymarchPotionUndo.mgefs[0xf33cb], "its effects are ended");
  gm.greymarchPotionUndo = null; gm.greymarchFoodFxUntil = Date.now() - 1;
  gm.greymarchFoodFxNote(food([0, 720]), named);
  assert.ok(!gm.greymarchPotionUndo, "the block is over: it works");
  assert.ok(gm.greymarchFoodFxUntil - Date.now() > 700000, "and blocks for its longest effect, 12 minutes");
});

test("the server's word on a block is taken (a game that lost count after a relog), and the packet is allowed through", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
  assert.ok(src.includes('if (type === "greymarchFoodFx") {'));
  assert.ok(src.includes("if (pot.isFood() && !pot.isPoison()) this.greymarchFoodFxNote(pot, baseObj);"), "every food eaten is noted");
  assert.ok(fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8").includes("case 'greymarchFoodFx':"));
});
