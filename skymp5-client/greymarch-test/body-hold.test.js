"use strict";
// Select BEFORE the world (greymarch/bodyHold.ts, networkingService.ts, bridge.ts): after the server's greymarchHold the game keeps its own body's
// message (no world load) and lets the newest one go once a character is chosen, so the world loads once, straight into the chosen character.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const load = (rel, mods = {}) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", ...rel.split("/")), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  return mod.exports;
};
const { BodyHold, SETTLE_MS, NO_SELECT_MS } = load("greymarch/bodyHold.ts");

test("nothing is held unless the server asked for it", () => {
  const h = new BodyHold();
  assert.strictEqual(h.keep({ message: { isMe: true } }), false);
  assert.strictEqual(h.due(Date.now()), null);
});

test("held from the announcement; the NEWEST body goes out shortly after a character is chosen, once", () => {
  const h = new BodyHold();
  h.arm(1000);
  assert.strictEqual(h.keep({ id: "waiting body" }), true);
  h.sawSelect(1500);
  assert.strictEqual(h.keep({ id: "chosen body" }), true, "the bind of the chosen body replaces the waiting one");
  assert.strictEqual(h.due(60000), null, "the player may take as long as they like on the screen");
  h.entered(70000);
  assert.strictEqual(h.due(70000 + SETTLE_MS - 1), null, "a moment for the bind's message, in case it comes after 'entered'");
  const out = h.due(70000 + SETTLE_MS);
  assert.deepStrictEqual(out.event, { id: "chosen body" });
  assert.strictEqual(h.due(80000), null, "once");
  assert.strictEqual(h.keep({ id: "later" }), false, "after that, bodies go straight through (switching in the world works as before)");
});

test("no select screen within 20 s lets the body go: never stuck at the main menu", () => {
  const h = new BodyHold();
  h.arm(0);
  h.keep({ id: "body" });
  assert.strictEqual(h.due(NO_SELECT_MS - 1), null);
  const out = h.due(NO_SELECT_MS);
  assert.match(out.reason, /no character select/);
  assert.deepStrictEqual(out.event, { id: "body" });
});

test("chosen before any body arrived: the hold ends with nothing, and the body that comes later is not held", () => {
  const h = new BodyHold();
  h.arm(0); h.sawSelect(10); h.entered(20);
  const out = h.due(20 + SETTLE_MS);
  assert.strictEqual(out.event, null);
  assert.strictEqual(h.keep({ id: "late" }), false);
});

test("a new connection starts the hold over", () => {
  const h = new BodyHold();
  h.arm(0); h.keep({ id: "old" }); h.sawSelect(1); h.entered(2); h.due(2 + SETTLE_MS);
  h.arm(5000);
  assert.strictEqual(h.keep({ id: "new" }), true);
  h.sawSelect(5001); h.entered(5002);
  assert.deepStrictEqual(h.due(5002 + SETTLE_MS).event, { id: "new" });
});

test("networkingService keeps our own body while held and passes everyone else's on", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "networkingService.ts"), "utf8");
  const at = src.indexOf("msgAny.t === MsgType.CreateActor");
  const block = src.slice(at, at + 900);
  assert.ok(/msgAny\.isMe && bodyHold\.keep\(event\)/.test(block), "only isMe, only through the hold");
  assert.ok(block.indexOf("return;") < block.indexOf('emit("createActorMessage"'), "a held body is not passed on");
});

test("the bridge: greymarchHold arms the hold and answers the server; select and entered are reported; the body goes out on tick", () => {
  const hold = new BodyHold();
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: (id) => id }, "../sync/appearance": { applyAppearanceToPlayer() {} }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} }, "../services/services/loadGameService": { LoadGameService: function () {} }, "./bodyHold": { bodyHold: hold } };
  const { GreymarchBridge } = load("greymarch/bridge.ts", mods);
  const sent = [], emitted = [];
  const sp = { printConsole() {}, writeLogs() {}, storage: {}, on() {}, browser: { executeJavaScript() {}, setVisible() {}, setFocused() {}, isFocused: () => true } };
  const controller = { on() {}, lookupListener: () => null, emitter: { on() {}, emit: (n, e) => { if (n === "sendMessage") sent.push(JSON.parse(e.message.contentJsonDump)); else emitted.push([n, e]); } } };
  const gm = new GreymarchBridge(sp, controller);
  gm.greymarchLog = () => {};
  gm.greymarchPacket({ customPacketType: "greymarchHold" });
  assert.ok(hold.armed);
  assert.deepStrictEqual(sent, [{ customPacketType: "greymarchHolding" }], "the server learns this game holds");
  hold.keep({ message: { isMe: true, idx: 4 } });
  gm.greymarchPacket({ customPacketType: "greymarchSelect", max: 2, characters: [] });
  assert.ok(hold.selectSeen);
  gm.greymarchPacket({ customPacketType: "greymarchEntered", id: "#ABCD", isNew: false });
  gm.greymarchBodyTick(Date.now() + SETTLE_MS + 5);
  assert.deepStrictEqual(emitted.map(([n]) => n), ["createActorMessage", "anyMessage"], "handed to SkyMP as if it had just arrived");
  // the veil's timer starts again when the world has loaded
  const before = gm.greymarchReveal.at;
  gm.greymarchRebaseAfterLoad(gm.greymarchHeldLoadAt + 9000);
  assert.strictEqual(gm.greymarchReveal.at, before + 9000);
});
