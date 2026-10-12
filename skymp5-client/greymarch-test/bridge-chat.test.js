"use strict";
// Tests for the chatbox half of the Greymarch bridge (src/greymarch/bridge.ts), run against a pretend game.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make() {
  const log = { js: [], visible: [], focused: [], sent: [], lines: [] };
  const misc = { remoteIdToLocalId: (id) => id, localIdToRemoteId: (id) => id, getViewFromStorage: () => null };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": misc, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => ({ id: 0x14 }), getFormEx: () => null, getCurrentCrosshairRef: () => null },
    Actor: { from: (f) => f },
    Debug: { notification() {} },
    browser: { executeJavaScript: (j) => log.js.push(j), setVisible: (v) => log.visible.push(v), setFocused: (v) => log.focused.push(v) },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, p) => log.sent.push([n, p]) } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const toPage = () => log.js.filter((x) => x.includes("__gmChatSend(")).map((x) => JSON.parse(x.slice(x.lastIndexOf("__gmChatSend(") + 13).replace(/\);$/, "")));
  const sentPackets = () => log.sent.map(([, p]) => JSON.parse(p.message.contentJsonDump));
  return { gm, log, toPage, sentPackets };
}
const enter = (gm) => { gm.greymarchKey({ code: 28, isDown: false }); gm.greymarchKey({ code: 28, isDown: true }); };

test("the chat appears when the loading veil lifts, keeps the browser layer on, and goes away on the character select screen", () => {
  const { gm, log, toPage } = make();
  gm.greymarchReveal = { at: 0 };
  gm.greymarchLift("test");
  assert.strictEqual(gm.greymarchChatOn, true);
  assert.strictEqual(log.visible.pop(), true, "the layer stays visible for the chat");
  assert.deepStrictEqual(toPage().pop(), { fn: "show", arg: true });
  gm.greymarchPacket({ customPacketType: "greymarchSelect", characters: [] });
  assert.strictEqual(gm.greymarchChatOn, false);
  assert.deepStrictEqual(toPage().pop(), { fn: "hide", arg: true });
});

test("Enter opens the input once; Esc cancels; the page letting go gives the keyboard back", () => {
  const { gm, log, toPage } = make();
  gm.greymarchChatShow();
  log.visible.length = 0;
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, true);
  assert.deepStrictEqual(log.focused, [true]);
  assert.deepStrictEqual(toPage().pop(), { fn: "open", arg: {} });
  gm.greymarchKey({ code: 28, isDown: false }); gm.greymarchKey({ code: 28, isDown: true });
  assert.strictEqual(toPage().filter((m) => m.fn === "open").length, 1, "Enter again does not reopen it");
  gm.greymarchKey({ code: 1, isDown: false }); gm.greymarchKey({ code: 1, isDown: true });
  assert.strictEqual(gm.greymarchChatTyping, false);
  assert.deepStrictEqual(toPage().pop(), { fn: "close", arg: true });
  assert.strictEqual(log.focused.pop(), false);
});

test("the Enter that sends a line does not reopen the input a moment later", () => {
  const { gm } = make();
  gm.greymarchChatShow();
  enter(gm);
  gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "chat-focus", on: false })] }); // the page sent the line and closed
  assert.strictEqual(gm.greymarchChatTyping, false);
  enter(gm); // the game's own copy of that Enter
  assert.strictEqual(gm.greymarchChatTyping, false);
  gm.greymarchChatClosedAt = Date.now() - 1000;
  gm.greymarchKey({ code: 28, isDown: false }); gm.greymarchKey({ code: 28, isDown: true });
  assert.strictEqual(gm.greymarchChatTyping, true, "a real Enter a little later works");
});

test("nothing opens over the select screen, the staff panel or the X menu, or before you are in the world", () => {
  for (const flag of ["greymarchScreenUp", "greymarchAdminOn", "greymarchMenuOn"]) {
    const { gm } = make();
    gm.greymarchChatShow();
    gm[flag] = true;
    enter(gm);
    assert.ok(!gm.greymarchChatTyping, flag);
  }
  const { gm } = make();
  enter(gm);
  assert.ok(!gm.greymarchChatTyping, "chat not shown yet");
});

test("the page's lines become chat packets (text cut, tab checked); init asks what is allowed; server lines and info go to the page", () => {
  const { gm, toPage, sentPackets } = make();
  gm.greymarchChatShow();
  gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "chat", op: "send", text: "x".repeat(500), tab: "staff" })] });
  gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "chat", op: "send", text: "hello", tab: "something else" })] });
  gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "chat", op: "init" })] });
  const [a, b, c] = sentPackets();
  assert.deepStrictEqual([a.customPacketType, a.op, a.text.length, a.tab], ["greymarchChat", "send", 300, "staff"]);
  assert.deepStrictEqual([b.text, b.tab], ["hello", "local"]);
  assert.deepStrictEqual([c.op, c.text], ["init", undefined]);
  gm.greymarchPacket({ customPacketType: "greymarchChatLine", kind: "say", name: "Alda", text: "hi" });
  gm.greymarchPacket({ customPacketType: "greymarchChatInfo", staff: true, dm: true });
  const last = toPage().slice(-2);
  assert.deepStrictEqual(last[0].fn, "line");
  assert.strictEqual(last[0].arg.text, "hi");
  assert.deepStrictEqual([last[1].fn, last[1].arg.staff], ["info", true]);
});

test("the chat page is told to show itself again every few seconds (the game can rebuild the browser layer)", () => {
  const { gm, toPage } = make();
  gm.greymarchChatShow();
  const before = toPage().length;
  gm.greymarchChatNext = Date.now() - 1;
  gm.greymarchTick();
  assert.strictEqual(toPage().length, before + 1);
  assert.deepStrictEqual(toPage().pop(), { fn: "show", arg: true });
});

test("the voice display switching on or off cannot take the keyboard away from someone who is typing", () => {
  const { gm, log } = make();
  gm.greymarchChatShow();
  enter(gm);
  log.focused.length = 0;
  gm.greymarchVoiceMessage({ hud: false, speaking: [] });
  assert.ok(!log.focused.includes(false), "still focused");
});

test("a /gm request from the server goes to the chat page as a pop-up", () => {
  const { gm, toPage } = make();
  gm.greymarchChatShow();
  gm.greymarchPacket({ customPacketType: "greymarchGmAlert", from: "Alda Ring #AAAA", text: "stuck in the wall", at: 1 });
  const last = toPage().pop();
  assert.strictEqual(last.fn, "alert");
  assert.deepStrictEqual([last.arg.from, last.arg.text], ["Alda Ring #AAAA", "stuck in the wall"]);
});
