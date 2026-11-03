"use strict";
// The feeding of 2026-11-03 (the owner), the game's half (src/greymarch/bridge.ts): both players are locked while the feeding lasts (the vampire still ends it with
// a movement key), and a player drained to death walks drunk for the time the server says once they are up again.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make() {
  const log = { lines: [], controls: [], idles: [], imod: [], events: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (id === 0xff000002 ? 0x5000 : 0) }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const other = { name: "them", getAnimationVariableBool: () => true, playIdleWithTarget: () => true };
  const player = { name: "me", playIdle: (i) => { log.idles.push(i.id); return true; }, playIdleWithTarget: () => true, getAnimationVariableBool: () => true, hasSpell: () => false, getEquippedSpell: () => null };
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l), on() {}, storage: {},
    Game: { getPlayer: () => player, getFormEx: (id) => (id === 0x5000 ? other : { id }), getFormFromFile: (id, file) => (file === "BSHeartland.esm" ? { id, file } : null),
      disablePlayerControls: (...a) => log.controls.push(["off", ...a]), enablePlayerControls: (...a) => log.controls.push(["on", ...a]) },
    Actor: { from: (f) => (f === other ? other : null) }, Idle: { from: (f) => f }, Spell: { from: () => null },
    ImageSpaceModifier: { from: (f) => (f ? { applyCrossFade: (s) => log.imod.push(["apply", f.id, s]) } : null), removeCrossFade: (s) => log.imod.push(["remove", s]) },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push([ref.name, name]), notification() {} },
    Utility: { isInMenuMode: () => false },
  };
  const gm = new mod.exports.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  let t = 7_000_000; const realNow = Date.now; Date.now = () => t;
  return { gm, log, tick: (ms = 16) => { t += ms; gm.greymarchVampTick(); }, say: (m) => gm.greymarchPacket(m), done: () => { Date.now = realNow; } };
}

test("the feeding locks walking, fighting, sneaking and using things for both; the end unlocks them; the camera and menus stay", () => {
  const s = make();
  try {
    s.say({ customPacketType: "greymarchVampFeed", on: true, role: "victim", partner: 0xff000002 });
    s.tick();
    assert.deepStrictEqual(s.log.controls, [["off", true, true, false, false, true, false, true, false, 0]]);
    s.tick(); s.tick();
    assert.strictEqual(s.log.controls.length, 1, "locked once");
    s.say({ customPacketType: "greymarchVampFeed", on: false, why: "Stop feeding" });
    s.tick();
    assert.deepStrictEqual(s.log.controls[1], ["on", true, true, false, false, true, false, true, false, 0]);
    assert.ok(s.log.lines.some((l) => /feeding locks the controls/.test(l)) && s.log.lines.some((l) => /feeding unlocks the controls/.test(l)));
  } finally { s.done(); }
});

test("drained to death: the drunk walk and the swimming screen for the server's time, put on again every 10 s, then the walk is stopped and the screen fades", () => {
  const s = make();
  try {
    s.say({ customPacketType: "greymarchDrunk", on: true, ms: 25000 });
    s.tick();
    assert.deepStrictEqual(s.log.idles, [0x0cefd0], "IdleDrunkStart");
    assert.deepStrictEqual(s.log.imod, [["apply", 0x0c9cc5, 1]], "BSHeartland's drunk screen");
    s.tick(5000);
    assert.strictEqual(s.log.idles.length, 1, "not again before 10 s");
    s.tick(5100);
    assert.strictEqual(s.log.idles.length, 2, "again after 10 s (a jump or a fight ends the walk)");
    s.tick(15000);
    assert.deepStrictEqual(s.log.idles.slice(-1), [0x0cefd1], "IdleDrunkStop when the time is up");
    assert.deepStrictEqual(s.log.imod.slice(-1), [["remove", 1]]);
    assert.ok(s.log.lines.some((l) => /drunk: on for 25 s/.test(l)) && s.log.lines.some((l) => /drunk: over/.test(l)));
    s.say({ customPacketType: "greymarchDrunk", on: false }); s.tick();
    assert.deepStrictEqual(s.log.idles.slice(-1), [0x0cefd1], "nothing more to stop");
  } finally { s.done(); }
});
