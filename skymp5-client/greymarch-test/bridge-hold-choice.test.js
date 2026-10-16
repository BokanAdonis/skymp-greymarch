"use strict";
// bridge.ts: Play / Create chosen while the world from logging in is still loading is held until the game has reported that load, because a second
// world load on top of an unfinished one is never finished by the game (stuck after choosing, 2026-10-16). Delete is never held.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make() {
  const LoadGameService = function () {};
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: (id) => id }, "../sync/appearance": { applyAppearanceToPlayer() {} }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} }, "../services/services/loadGameService": { LoadGameService } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const sent = [], page = [];
  const state = { pending: true };
  const sp = { printConsole() {}, writeLogs() {}, storage: {}, on() {}, browser: { executeJavaScript: (c) => { const m = /window\.__gmSend\((.*)\);$/.exec(c); if (m) page.push(JSON.parse(m[1])); }, setVisible() {}, setFocused() {} } };
  const controller = {
    on() {}, lookupListener: (cls) => (cls === LoadGameService ? { greymarchLoadPending: () => state.pending } : null),
    emitter: { on() {}, emit: (n, e) => { if (n === "sendMessage") sent.push(JSON.parse(e.message.contentJsonDump)); } },
  };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  gm.greymarchLog = () => {};
  const choose = (body) => gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify(body)] });
  return { gm, sent, page, state, choose };
}

test("Play while the world is still loading is held, the screen says so, and it goes out once the load is reported", () => {
  const g = make();
  g.choose({ type: "play", id: "#SSGK" });
  assert.deepStrictEqual(g.sent, [], "not sent while the first load is running");
  assert.ok(g.page.some((m) => m.fn === "busy"), "the screen shows it is working");
  g.gm.greymarchChoiceTick(Date.now());
  assert.deepStrictEqual(g.sent, [], "still loading: still held");
  g.state.pending = false;
  g.gm.greymarchChoiceTick(Date.now());
  assert.deepStrictEqual(g.sent, [{ customPacketType: "greymarchChoice", type: "play", id: "#SSGK" }]);
  g.gm.greymarchChoiceTick(Date.now());
  assert.strictEqual(g.sent.length, 1, "sent once");
});

test("nothing loading: Play goes out at once; Delete is never held", () => {
  const g = make();
  g.choose({ type: "delete", id: "#OLD1" });
  assert.strictEqual(g.sent.length, 1, "delete is sent even while loading");
  g.state.pending = false;
  g.choose({ type: "create", name: "Sera" });
  assert.strictEqual(g.sent.length, 2);
  assert.strictEqual(g.sent[1].type, "create");
});

test("a load that never reports does not hold the choice forever (60 s at most)", () => {
  const g = make();
  g.choose({ type: "play", id: "#SSGK" });
  g.gm.greymarchChoiceTick(Date.now() + 61000);
  assert.strictEqual(g.sent.length, 1);
});
