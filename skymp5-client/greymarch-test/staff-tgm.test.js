"use strict";
// src/greymarch/bridge.ts greymarchEffects: the staff panel's TGM switches the game's own god mode (Debug.SetGodMode, what the console's tgm does), once per change,
// separately from God (setGhost) (2026-10-27). The server keeps working out other players' hits, so TGM never protects against them (gamemode admin.js).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make() {
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: (id) => id }, "../sync/appearance": { applyAppearanceToPlayer() {} }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  const calls = [];
  const player = { setActorValue() {}, setGhost: (v) => calls.push(["ghost", v]), restoreActorValue() {} };
  const sp = { printConsole() {}, writeLogs() {}, Game: { getPlayer: () => player }, Debug: { setGodMode: (v) => calls.push(["godmode", v]), toggleCollisions: () => calls.push(["collisions"]) } };
  const gm = new mod.exports.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchLog = () => {};
  for (const k of ["greymarchNoHostApply", "greymarchGhostApply", "greymarchNamesApply", "greymarchInvisApply", "greymarchSeenLog", "greymarchStatsApply", "greymarchCombatApply"]) gm[k] = () => {};
  let t = 1_000_000;
  const realNow = Date.now;
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const fx = (m) => at(() => gm.greymarchPacket({ customPacketType: "greymarchFx", noclip: false, speed: 100, frozen: false, god: false, me: 0xff000001, ...m }));
  const step = () => { t += 500; at(() => gm.greymarchEffects()); };
  return { calls, fx, step };
}

test("TGM on turns the game's god mode on once, off turns it off once, and God (setGhost) is a separate switch", () => {
  const g = make();
  g.fx({ tgm: true });
  g.step(); g.step();
  assert.deepStrictEqual(g.calls, [["godmode", true]], "switched on once, not every update");
  g.fx({ tgm: true, god: true });
  g.step();
  assert.deepStrictEqual(g.calls.slice(1), [["ghost", true]], "God adds the ghost flag and leaves the game's god mode alone");
  g.fx({ tgm: false, god: true });
  g.step();
  assert.deepStrictEqual(g.calls.slice(2), [["godmode", false]], "TGM off turns only the game's god mode off");
});

test("a server without the tgm flag (older gamemode) never touches the game's god mode", () => {
  const g = make();
  g.fx({});
  g.step();
  assert.deepStrictEqual(g.calls, []);
});
