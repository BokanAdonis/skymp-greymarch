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
  const menus = new Set();
  const focus = { on: true };
  const sp = {
    Ui: { isMenuOpen: (n) => menus.has(n) },
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => ({ id: 0x14 }), getFormEx: () => null, getCurrentCrosshairRef: () => null },
    Actor: { from: (f) => f },
    Debug: { notification() {} },
    browser: { isFocused: () => focus.on, executeJavaScript: (j) => log.js.push(j), setVisible: (v) => log.visible.push(v), setFocused: (v) => log.focused.push(v) },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, p) => log.sent.push([n, p]) } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const toPage = () => log.js.filter((x) => x.includes("__gmChatSend(")).map((x) => JSON.parse(x.slice(x.lastIndexOf("__gmChatSend(") + 13).replace(/\);$/, "")));
  const sentPackets = () => log.sent.map(([, p]) => JSON.parse(p.message.contentJsonDump));
  return { gm, log, toPage, sentPackets, menus, focus };
}
const enter = (gm, immediately) => { if (!immediately) gm.greymarchChatClosedAt = 0; gm.greymarchKey({ code: 28, isDown: false }); gm.greymarchKey({ code: 28, isDown: true }); gm.greymarchChatPending(); }; // Enter, as the update phase handles it (a real press, not the very same Enter that just closed it)

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

test("Enter opens the input; Esc cancels; the page letting go gives the keyboard back; an Enter that reaches the game while the input is open changes nothing (it never closes or restarts it)", () => {
  const { gm, log, toPage } = make();
  gm.greymarchChatShow();
  log.visible.length = 0;
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, true);
  assert.deepStrictEqual(log.focused, [true]);
  assert.deepStrictEqual(toPage().pop(), { fn: "open", arg: {} });
  assert.strictEqual(toPage().filter((m) => m.fn === "open").length, 1);
  enter(gm); enter(gm); // Enter reaching the game while typing
  assert.strictEqual(gm.greymarchChatTyping, true, "still typing");
  assert.strictEqual(toPage().filter((m) => m.fn === "open").length, 1, "the input was not reopened");
  assert.ok(!toPage().some((m) => m.fn === "close"), "and not closed");
  gm.greymarchKey({ code: 1, isDown: false }); gm.greymarchKey({ code: 1, isDown: true });
  assert.strictEqual(gm.greymarchChatTyping, false);
  assert.deepStrictEqual(toPage().pop(), { fn: "close", arg: true });
  assert.strictEqual(log.focused.pop(), false);
});

test("an Enter whose key-up was never seen still opens the chat the next time (a missed release cannot swallow a press)", () => {
  const { gm } = make();
  gm.greymarchChatShow();
  gm.greymarchChatClosedAt = 0; gm.greymarchKey({ code: 28, isDown: true }); gm.greymarchChatPending();
  assert.strictEqual(gm.greymarchChatTyping, true);
  gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "chat-focus", on: false })] });
  gm.greymarchChatClosedAt = 0; gm.greymarchKey({ code: 28, isDown: true }); gm.greymarchChatPending(); // no key-up in between
  assert.strictEqual(gm.greymarchChatTyping, true);
});

test("Enter does nothing while the console or any game menu is open", () => {
  for (const menu of ["Console", "InventoryMenu", "MapMenu", "Dialogue Menu", "MessageBoxMenu"]) {
    const { gm, menus } = make();
    gm.greymarchChatShow();
    menus.add(menu);
    enter(gm);
    assert.ok(!gm.greymarchChatTyping, menu);
    menus.delete(menu);
    enter(gm);
    assert.strictEqual(gm.greymarchChatTyping, true, "and works again once " + menu + " is closed");
  }

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

test("Esc cancels the input whenever it is open, even if no key-up was ever seen; with the input closed Esc does nothing to the chat (the messages stay)", () => {
  const { gm, toPage } = make();
  gm.greymarchChatShow();
  gm.greymarchKey({ code: 1, isDown: true }); // input not open: nothing at all happens to the chat
  assert.ok(!toPage().some((m) => m.fn === "close" || m.fn === "conceal"));
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, true);
  gm.greymarchKey({ code: 1, isDown: true }); // no key-up before it
  assert.strictEqual(gm.greymarchChatTyping, false);
  assert.deepStrictEqual(toPage().pop(), { fn: "close", arg: true });
  assert.ok(!toPage().some((m) => m.fn === "conceal" || (m.arg && m.arg.hide)), "nothing is ever hidden: the messages stay on screen");
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, true, "and Enter opens it again straight away");
});

test("an input the page no longer has the keyboard for is closed after a moment, never while the page is focused", () => {
  const { gm, focus, toPage } = make();
  gm.greymarchChatShow();
  enter(gm);
  const t0 = Date.now();
  gm.greymarchChatWatch(t0 + 500); gm.greymarchChatWatch(t0 + 5000); // focused: left alone
  assert.strictEqual(gm.greymarchChatTyping, true);
  focus.on = false;
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(t0 + 6000); // first time it is noticed
  assert.strictEqual(gm.greymarchChatTyping, true, "one look is not enough");
  gm.greymarchChatWatch(t0 + 6300); gm.greymarchChatWatch(t0 + 8000);
  assert.strictEqual(gm.greymarchChatTyping, false);
  assert.ok(!toPage().some((m) => m.arg && m.arg.hide), "nothing is ever hidden");
});
const sync = (gm, typing) => gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "chat-sync", typing })] });

test("the page's answer keeps the game honest: a lock the page is not using is released, a fresh input is left alone, and an idle chat never holds the keyboard", () => {
  const { gm, log } = make();
  gm.greymarchChatShow();
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, true);
  sync(gm, false); // answer sent just as it opened: ignored
  assert.strictEqual(gm.greymarchChatTyping, true, "an input opened a moment ago stays");
  gm.greymarchChatOpenedAt = Date.now() - 3000;
  log.focused.length = 0;
  sync(gm, false); // the page is not typing, the game thought it was: movement would be locked
  assert.strictEqual(gm.greymarchChatTyping, false);
  assert.deepStrictEqual(log.focused.pop(), false, "the keyboard is given back");
  log.focused.length = 0;
  sync(gm, false); // neither is typing: the keyboard is released anyway
  assert.deepStrictEqual(log.focused, [false]);
  sync(gm, true); // the page is showing an input the game did not know about
  assert.strictEqual(gm.greymarchChatTyping, true);
  assert.strictEqual(log.focused.pop(), true);
});

test("an idle chat is not holding the keyboard while the staff panel, the X menu or the select screen has it", () => {
  for (const flag of ["greymarchAdminOn", "greymarchMenuOn", "greymarchScreenUp"]) {
    const { gm, log } = make();
    gm.greymarchChatShow();
    gm[flag] = true;
    log.focused.length = 0;
    sync(gm, false);
    assert.deepStrictEqual(log.focused, [], flag + ": their focus is left alone");
  }
});
test("the game's 'Cursor Menu' is open all the time in the world: it never stops Enter from opening the chat, a real menu still does", () => {
  const { gm, menus } = make();
  gm.greymarchChatShow();
  menus.add("Cursor Menu");
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, true, "opens although Cursor Menu is reported open");
  gm.greymarchChatClose(); gm.greymarchChatFocus(false); gm.greymarchChatClosedAt = 0;
  menus.add("InventoryMenu");
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, false, "a real menu blocks it");
});
test("HARD RULES: the Enter that sends a line and a held Enter never open the input again; a real press a moment later does", () => {
  const { gm } = make();
  gm.greymarchChatShow();
  enter(gm);
  gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "chat-focus", on: false })] }); // the page sent the line and closed
  assert.strictEqual(gm.greymarchChatTyping, false);
  enter(gm, true); // the game's own copy of that Enter arrives right after
  assert.strictEqual(gm.greymarchChatTyping, false, "not reopened");
  gm.greymarchChatClosedAt = Date.now() - 1000;
  gm.greymarchKey({ code: 28, isDown: true, isRepeating: true }); gm.greymarchChatPending();
  assert.strictEqual(gm.greymarchChatTyping, false, "a held key does not repeat it");
  gm.greymarchChatClosedAt = 0; gm.greymarchKey({ code: 28, isDown: true }); gm.greymarchChatPending();
  assert.strictEqual(gm.greymarchChatTyping, true, "a real press a moment later opens it");
});

test("HARD RULES: a menu or the console opening closes the input; it never stays open past two minutes; the keyboard is released again after a close", () => {
  const { gm, menus, log } = make();
  gm.greymarchChatShow();
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, true);
  menus.add("Console");
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(Date.now());
  assert.strictEqual(gm.greymarchChatTyping, false, "the console took over: the chat gives way");
  menus.clear();
  enter(gm);
  gm.greymarchChatOpenedAt = Date.now() - 121000;
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(Date.now());
  assert.strictEqual(gm.greymarchChatTyping, false, "closed after two minutes open");
  log.focused.length = 0;
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(Date.now());
  assert.deepStrictEqual(log.focused, [false], "the keyboard is released once more a moment after the close");
  gm.greymarchChatReleaseUntil = Date.now() - 1; log.focused.length = 0;
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(Date.now());
  assert.deepStrictEqual(log.focused, [], "and then it is left alone");
});

test("HARD RULES: a menu or the console opening closes the input; it never stays open past two minutes; the keyboard is released again after a close", () => {
  const { gm, menus, log } = make();
  gm.greymarchChatShow();
  enter(gm);
  assert.strictEqual(gm.greymarchChatTyping, true);
  menus.add("Console");
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(Date.now());
  assert.strictEqual(gm.greymarchChatTyping, false, "the console took over: the chat gives way");
  menus.clear();
  enter(gm);
  gm.greymarchChatOpenedAt = Date.now() - 121000;
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(Date.now());
  assert.strictEqual(gm.greymarchChatTyping, false, "closed after two minutes open");
  log.focused.length = 0;
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(Date.now());
  assert.deepStrictEqual(log.focused, [false], "the keyboard is released once more a moment after the close");
  gm.greymarchChatReleaseUntil = Date.now() - 1; log.focused.length = 0;
  gm.greymarchChatWatchNext = 0; gm.greymarchChatWatch(Date.now());
  assert.deepStrictEqual(log.focused, [], "and then it is left alone");
});