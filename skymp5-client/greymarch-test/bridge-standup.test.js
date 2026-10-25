"use strict";
// Getting up (greymarchStandUp, gamemode professions.js after a won mining game) and plain notices, both done in the update phase (bridge.ts greymarchStandUpTick,
// greymarchNoticeTick): the packet handler only queues them, because Skyrim Platform calls do nothing outside the update phase.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const tr = (f) => ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", f), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const load = (js, mods) => { const mod = { exports: {} }; new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod); return mod.exports; };
const emotes = load(tr("emotes.ts"), {});
const bridgeJs = tr("bridge.ts");
const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");

function make() {
  const log = { events: [], notes: [], sent: [], lines: [] };
  const state = { furn: null };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./emotes": emotes, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: () => 0 }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const bridge = load(bridgeJs, mods);
  const player = { getFurnitureReference: () => (state.furn ? { getFormID: () => state.furn } : null), getFormID: () => 0x14 };
  const sp = {
    printConsole() {}, writeLogs() {},
    Game: { getPlayer: () => player, getFormEx: (id) => ({ id }) },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push(name), notification: (t) => log.notes.push(t) },
    Ui: { isMenuOpen: () => false }, Utility: { isInMenuMode: () => false },
    browser: { setVisible() {}, setFocused() {}, isFocused: () => false, executeJavaScript() {} },
    on() {}, storage: {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, m) => { if (n !== "sendMessage") return; const c = JSON.parse(m.message.contentJsonDump); if (c.customPacketType === "greymarchLog") log.lines.push(c.text); else log.sent.push(c); } } };
  const gm = new bridge.GreymarchBridge(sp, controller);
  let t = 1_000_000;
  const realNow = Date.now;
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const say = (msg) => at(() => gm.greymarchPacket(msg));
  const tick = (ms = 50) => { t += ms; at(() => { gm.greymarchStandUpTick(t); gm.greymarchNoticeTick(); }); };
  return { gm, log, state, say, tick };
}

test("the packet is let through, queued in the handler and done in the update phase", () => {
  assert.match(auth, /case 'greymarchStandUp':/);
  const s = make();
  s.state.furn = 0xff00abcd;
  s.say({ customPacketType: "greymarchStandUp", reason: "vein" });
  assert.deepStrictEqual(s.log.events, [], "nothing from the packet handler");
  s.tick();
  assert.deepStrictEqual(s.log.events, ["IdleFurnitureExit"], "the furniture's own get-up");
  assert.ok(s.log.lines.some((l) => /standup: getting up from ff00abcd \(IdleFurnitureExit\)/.test(l)));
});

test("up by itself: no second step, and it is logged; not in furniture: nothing at all", () => {
  const s = make();
  s.state.furn = 0xff00abcd;
  s.say({ customPacketType: "greymarchStandUp" }); s.tick();
  s.state.furn = null; s.tick(1600);
  assert.deepStrictEqual(s.log.events, ["IdleFurnitureExit"]);
  assert.ok(s.log.lines.some((l) => /standup: up after \d+ ms/.test(l)));
  const n = make();
  n.say({ customPacketType: "greymarchStandUp" }); n.tick(); n.tick(2000);
  assert.deepStrictEqual(n.log.events, [], "standing already: no animation");
  assert.ok(n.log.lines.some((l) => /not in furniture/.test(l)));
});

test("still in the same furniture 1.5 s later: snapped to standing (never a stagger, never an activation)", () => {
  const s = make();
  s.state.furn = 0xff00abcd;
  s.say({ customPacketType: "greymarchStandUp" }); s.tick();
  s.tick(1000);
  assert.deepStrictEqual(s.log.events, ["IdleFurnitureExit"], "waits for the get-up first");
  s.tick(600);
  assert.deepStrictEqual(s.log.events, ["IdleFurnitureExit", "IdleForceDefaultState"]);
  s.tick(3000);
  assert.strictEqual(s.log.events.length, 2, "once");
  assert.ok(!s.log.events.includes("staggerStart"));
});

test("a request that waited too long is dropped", () => {
  const s = make();
  s.state.furn = 0xff00abcd;
  s.say({ customPacketType: "greymarchStandUp" });
  s.tick(6000);
  assert.deepStrictEqual(s.log.events, []);
});

test("entering the world tells the server this game can get up (beside the forge window)", () => {
  const s = make();
  try { s.say({ customPacketType: "greymarchEntered" }); } catch (e) { /* other parts of entering need more of the game than this test has */ }
  const kinds = s.log.sent.map((m) => m.customPacketType);
  assert.ok(kinds.includes("greymarchForgeReady") && kinds.includes("greymarchStandUpReady"), JSON.stringify(kinds));
});

test("plain notices (no title) are the game's own message, shown from the update phase, two per frame", () => {
  const s = make();
  s.say({ customPacketType: "greymarchNotice", text: "You mine 2 Iron Ore. The vein is spent." });
  s.say({ customPacketType: "greymarchNotice", text: "two" });
  s.say({ customPacketType: "greymarchNotice", text: "three" });
  assert.deepStrictEqual(s.log.notes, [], "not from the packet handler");
  s.tick();
  assert.deepStrictEqual(s.log.notes, ["You mine 2 Iron Ore. The vein is spent.", "two"]);
  s.tick();
  assert.deepStrictEqual(s.log.notes, ["You mine 2 Iron Ore. The vein is spent.", "two", "three"]);
  for (let i = 0; i < 30; i++) s.say({ customPacketType: "greymarchNotice", text: "flood " + i });
  for (let i = 0; i < 20; i++) s.tick();
  assert.strictEqual(s.log.notes.length, 3 + 20, "at most 20 wait");
});
