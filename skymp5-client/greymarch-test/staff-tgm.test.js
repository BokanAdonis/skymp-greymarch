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
  const av = { Magicka: 1, Stamina: 1, voice: 0 };
  const player = {
    setActorValue() {}, setGhost: (v) => calls.push(["ghost", v]),
    restoreActorValue: (n, x) => { if (n === "Magicka" || n === "Stamina") { av[n] = 1; calls.push(["restore", n]); } },
    getActorValuePercentage: (n) => av[n], getVoiceRecoveryTime: () => av.voice, setVoiceRecoveryTime: (s) => { av.voice = s; calls.push(["voice", s]); },
    modActorValue: (n, x) => calls.push(["mod", n, x]),
  };
  const sp = { printConsole() {}, writeLogs() {}, Game: { getPlayer: () => player }, Debug: { setGodMode: (v) => calls.push(["godmode", v]), toggleCollisions: () => calls.push(["collisions"]) } };
  const gm = new mod.exports.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchLog = () => {};
  for (const k of ["greymarchNoHostApply", "greymarchGhostApply", "greymarchNamesApply", "greymarchInvisApply", "greymarchSeenLog", "greymarchStatsApply", "greymarchCombatApply"]) gm[k] = () => {};
  let t = 1_000_000;
  const realNow = Date.now;
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const fx = (m) => at(() => gm.greymarchPacket({ customPacketType: "greymarchFx", noclip: false, speed: 100, frozen: false, god: false, me: 0xff000001, ...m }));
  const step = () => { t += 500; at(() => gm.greymarchEffects()); };
  const frame = () => at(() => gm.greymarchTgmFrame());
  return { calls, fx, step, frame, av };
}

test("TGM on turns the game's god mode on once, off turns it off once, and God (setGhost) is a separate switch", () => {
  const g = make();
  g.fx({ tgm: true });
  g.step(); g.step();
  assert.deepStrictEqual(g.calls, [["godmode", true], ["mod", "CarryWeight", 100000]], "switched on once, not every update, with the carry weight bonus");
  g.fx({ tgm: true, god: true });
  g.step();
  assert.deepStrictEqual(g.calls.slice(2), [["ghost", true]], "God adds the ghost flag and leaves the game's god mode alone");
  g.fx({ tgm: false, god: true });
  g.step();
  assert.deepStrictEqual(g.calls.slice(3), [["godmode", false], ["mod", "CarryWeight", -100000]], "TGM off turns the game's god mode off and takes the carry weight back");
});

test("a server without the tgm flag (older gamemode) never touches the game's god mode", () => {
  const g = make();
  g.fx({});
  g.step();
  assert.deepStrictEqual(g.calls, []);
});

test("every frame with TGM on, magicka and stamina are put back to full the moment they drop and the shout cooldown is cleared; nothing when off", () => {
  const g = make();
  g.av.Magicka = 0.4; g.av.Stamina = 0.9; g.av.voice = 30;
  g.frame();
  assert.deepStrictEqual(g.calls, [], "TGM off: the frame does nothing");
  g.fx({ tgm: true });
  g.frame();
  assert.deepStrictEqual(g.calls, [["restore", "Magicka"], ["restore", "Stamina"], ["voice", 0]]);
  g.frame();
  assert.strictEqual(g.calls.length, 3, "full bars and no cooldown: nothing to do on the next frame");
  g.av.Stamina = 0.99;
  g.frame();
  assert.deepStrictEqual(g.calls.at(-1), ["restore", "Stamina"], "a sprint is refilled on the very next frame");
});
