"use strict";
// src/greymarch/bridge.ts greymarchStatsApply: the stat maximums (a staff-set value plus the professions' bonus, gamemode admin.js effectiveStats) are put back
// when the game resets them (2026-11-02, the owner: the Warrior's health bonus never showed, its stamina did; SkyMP sets the base values again at a spawn).
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
  const base = { Health: 100, Stamina: 100, Magicka: 100 }, calls = [];
  const player = { getBaseActorValue: (n) => base[n], setActorValue: (n, v) => { base[n] = v; calls.push(["set", n, v]); }, restoreActorValue: (n) => calls.push(["fill", n]) };
  const gm = new mod.exports.GreymarchBridge({ printConsole() {}, writeLogs() {}, on() {}, storage: {} }, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchLog = () => {};
  return { gm, player, base, calls };
}

test("a Warrior's health maximum is put back after the game resets it, without filling the bar; a new number still fills it", () => {
  const { gm, player, base, calls } = make();
  gm.greymarchStatsWant = { health: 120, stamina: 140 };
  gm.greymarchStatsApply(player);
  assert.deepStrictEqual([base.Health, base.Stamina], [120, 140]);
  assert.deepStrictEqual(calls.filter((c) => c[0] === "fill").map((c) => c[1]), ["Health", "Stamina"]);
  calls.length = 0;
  gm.greymarchStatsApply(player);
  assert.deepStrictEqual(calls, [], "nothing to do while it holds");
  base.Health = 100; // SkyMP spawned the character again
  gm.greymarchStatsApply(player);
  assert.strictEqual(base.Health, 120, "put back");
  assert.deepStrictEqual(calls, [["set", "Health", 120]], "no free heal");
  calls.length = 0;
  gm.greymarchStatsWant = { health: 124, stamina: 140 };
  gm.greymarchStatsApply(player);
  assert.deepStrictEqual(calls, [["set", "Health", 124], ["fill", "Health"]], "a new rank: set and filled");
});
