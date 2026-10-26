"use strict";
// The scribe's desk, the game's half (src/greymarch/bridge.ts): the server opens it, the page's requests go to the server as greymarchScribe packets,
// the answers go back to the page, it closes from the page or with Esc, and it never opens over another window (nor another window over it).
//   node --test skymp5-client/greymarch-test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make() {
  const log = { js: [], visible: [], focused: [], sent: [], lines: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: () => 0, getViewFromStorage: () => null }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => ({ id: 0x14 }), getFormEx: () => null, getCurrentCrosshairRef: () => null },
    browser: { executeJavaScript: (j) => log.js.push(j), setVisible: (v) => log.visible.push(v), setFocused: (v) => log.focused.push(v) },
    Debug: { notification() {} },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, p) => { if (n === "sendMessage") log.sent.push(JSON.parse(p.message.contentJsonDump)); } } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const toPage = (fn) => log.js.filter((x) => x.includes(`${fn}(`)).map((x) => JSON.parse(x.slice(x.lastIndexOf(`${fn}(`) + fn.length + 1).replace(/\);$/, "")));
  const page = (data) => gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify(data)] });
  return { gm, log, toPage, page, say: (m) => gm.greymarchPacket(m) };
}

test("the server opens the desk: its own frame (greymarch-scribe.html, its own layer), shown, with the keyboard", () => {
  const { gm, log, toPage, say } = make();
  say({ customPacketType: "greymarchScribeOpen" });
  assert.strictEqual(gm.greymarchScribeOn, true);
  assert.deepStrictEqual(toPage("__gmScribeRun"), [{ fn: "show", arg: true }]);
  const script = log.js[log.js.length - 1];
  assert.match(script, /f\.src='greymarch-scribe\.html'/);
  assert.match(script, /z-index:2147483227/);
  assert.doesNotMatch(script, /greymarch-ledger|__gmLedgerRun/);
  assert.deepStrictEqual([log.visible.pop(), log.focused.pop()], [true, true]);
  assert.strictEqual(gm.greymarchPanelHasKeys(), true, "letters typed on the desk are not hotkeys");
});

test("the page's requests go to the server as greymarchScribe packets (the server decides); the answers go back to the page", () => {
  const { log, toPage, say, page } = make();
  say({ customPacketType: "greymarchScribeOpen" });
  page({ type: "scribe", rid: 4, op: "write", args: { kind: "letter", body: "Dear Brand" } });
  assert.deepStrictEqual(log.sent.pop(), { customPacketType: "greymarchScribe", rid: 4, op: "write", args: { kind: "letter", body: "Dear Brand" } });
  say({ customPacketType: "greymarchScribeReply", rid: 4, op: "write", ok: true, data: { message: "written" } });
  assert.deepStrictEqual(toPage("__gmScribeRun").pop(), { fn: "reply", arg: { customPacketType: "greymarchScribeReply", rid: 4, op: "write", ok: true, data: { message: "written" } } });
});

test("it closes from the page and with Esc, and gives the keyboard back", () => {
  const { gm, log, toPage, say, page } = make();
  say({ customPacketType: "greymarchScribeOpen" });
  page({ type: "scribe-close" });
  assert.strictEqual(gm.greymarchScribeOn, false);
  assert.deepStrictEqual(toPage("__gmScribeRun").pop(), { fn: "hide", arg: true });
  assert.strictEqual(log.focused.pop(), false);
  assert.strictEqual(gm.greymarchPanelHasKeys(), false);
  say({ customPacketType: "greymarchScribeOpen" });
  gm.greymarchKey({ code: 1, isDown: true });
  gm.greymarchKey({ code: 1, isDown: false });
  assert.strictEqual(gm.greymarchScribeOn, false, "Esc closes it");
});

test("never on top of another window: not over the guard ledger, and the ledger and K window not over it", () => {
  const { gm, toPage, say } = make();
  say({ customPacketType: "greymarchLedgerOpen" });
  say({ customPacketType: "greymarchScribeOpen" });
  assert.ok(!gm.greymarchScribeOn);
  assert.deepStrictEqual(toPage("__gmScribeRun"), []);
  gm.greymarchLedgerHide();
  say({ customPacketType: "greymarchScribeOpen" });
  assert.strictEqual(gm.greymarchScribeOn, true);
  say({ customPacketType: "greymarchLedgerOpen" });
  assert.ok(!gm.greymarchLedgerOn, "the ledger waits while the desk is open");
  gm.greymarchKey({ code: 37, isDown: true }); gm.greymarchKey({ code: 37, isDown: false }); // K
  assert.ok(!gm.greymarchProfOn, "K does not open the K window over the desk");
  assert.strictEqual(gm.greymarchScribeOn, true);
});

test("the client lets the two server packets through (authService whitelist)", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");
  assert.match(auth, /case 'greymarchScribeReply':/);
  assert.match(auth, /case 'greymarchScribeOpen':/);
});
