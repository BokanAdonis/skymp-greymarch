"use strict";
// Tests for the X menu half of the Greymarch bridge (src/greymarch/bridge.ts), run against a pretend game.
//   node --test skymp5-client/greymarch-test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const BIT = 0xff000000;

function make() {
  const log = { js: [], visible: [], focused: [], sent: [], lines: [], names: new Map(), blocked: [], blockArgs: [], notes: [] };
  const misc = { remoteIdToLocalId: (id) => (id === 0xdead ? 0 : id - BIT + 0x100), localIdToRemoteId: (id) => (id >= 0x100 ? id - 0x100 + BIT : 0), getViewFromStorage: () => null };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./launchGuard": { launchGuard: { refused: "", joinedWith: null }, TITLE: "", HINT: "" }, "../view/worldViewMisc": misc, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const actors = new Map();
  const actorFor = (localId) => {
    if (!actors.has(localId)) {
      const a = { id: localId, name: "#" + localId.toString(16), getDisplayName() { return this.name; }, setDisplayName(n) { this.name = n; log.names.set(localId, n); return true; }, blockActivation(...args) { log.blocked.push(localId); log.blockArgs.push(args.length); } };
      actors.set(localId, a);
    }
    return actors.get(localId);
  };
  let crosshair = null;
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => ({ id: 0x14 }), getFormEx: (id) => (id === 0x999 ? null : actorFor(id)), getCurrentCrosshairRef: () => crosshair },
    Actor: { from: (f) => f },
    browser: { executeJavaScript: (j) => log.js.push(j), setVisible: (v) => log.visible.push(v), setFocused: (v) => log.focused.push(v) },
    Debug: { notification: (t) => log.notes.push(t) },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, p) => log.sent.push([n, p]) } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const toPage = () => log.js.filter((x) => x.includes("__gmMenuSend(")).map((x) => JSON.parse(x.slice(x.lastIndexOf("__gmMenuSend(") + 13).replace(/\);$/, "")));
  return { gm, log, actors, actorFor, toPage, setCrosshair: (r) => { crosshair = r; } };
}

test("hold X while looking at a player opens the menu for THAT player; letting go tells the page; Esc asks the page to close", () => {
  const { gm, log, toPage, setCrosshair } = make();
  gm.greymarchOthers = [BIT + 5];
  setCrosshair({ getFormID: () => 0x105 }); // local id 0x105 = remote ff000005
  gm.greymarchKey({ code: 45, isDown: true });
  assert.strictEqual(gm.greymarchMenuOn, true);
  assert.deepStrictEqual(log.visible, [true]);
  assert.deepStrictEqual(log.focused, [true]);
  assert.deepStrictEqual(toPage()[0], { fn: "show", arg: { mode: "hold", looking: BIT + 5, object: false } });
  gm.greymarchKey({ code: 45, isDown: true }); // key repeat while held
  assert.strictEqual(toPage().length, 1);
  gm.greymarchKey({ code: 45, isDown: false }); // let go
  assert.deepStrictEqual(toPage().pop(), { fn: "release", arg: true });
  assert.strictEqual(gm.greymarchMenuOn, true, "the page decides whether to close (it may keep a quick tap open)");
  gm.greymarchKey({ code: 1, isDown: false });
  gm.greymarchKey({ code: 1, isDown: true });
  assert.deepStrictEqual(toPage().pop(), { fn: "escape", arg: true });
  assert.strictEqual(gm.greymarchMenuOn, true);
  gm.greymarchMenuEscAt = Date.now() - 1000; // the page never answered
  gm.greymarchTick();
  assert.strictEqual(gm.greymarchMenuOn, false, "hidden anyway after a moment");
  assert.deepStrictEqual(log.visible.pop(), false);
});

test("nothing opens when you are not looking at a player (a hint is shown), over the select screen, or over the staff panel; F7 does not open the panel over the menu", () => {
  const a = make();
  a.gm.greymarchOthers = [BIT + 5];
  a.gm.greymarchKey({ code: 45, isDown: true }); // no crosshair target
  assert.ok(!a.gm.greymarchMenuOn);
  assert.deepStrictEqual(a.log.notes, ["Look at a player, a door or a chest and hold X"]);
  const a2 = make();
  a2.gm.greymarchOthers = [BIT + 5];
  a2.setCrosshair({ getFormID: () => 0x777 }); // something that is not a player
  a2.gm.greymarchKey({ code: 45, isDown: true });
  assert.ok(!a2.gm.greymarchMenuOn);
  const b = make();
  b.gm.greymarchOthers = [BIT + 5]; b.setCrosshair({ getFormID: () => 0x105 }); b.gm.greymarchScreenUp = true;
  b.gm.greymarchKey({ code: 45, isDown: true });
  assert.ok(!b.gm.greymarchMenuOn);
  const c = make();
  c.gm.greymarchOthers = [BIT + 5]; c.setCrosshair({ getFormID: () => 0x105 }); c.gm.greymarchAdminOn = true;
  c.gm.greymarchKey({ code: 45, isDown: true });
  assert.ok(!c.gm.greymarchMenuOn);
  const d = make();
  d.gm.greymarchOthers = [BIT + 5]; d.setCrosshair({ getFormID: () => 0x105 });
  d.gm.greymarchKey({ code: 45, isDown: true });
  d.gm.greymarchKey({ code: 65, isDown: false });
  d.gm.greymarchKey({ code: 65, isDown: true });
  assert.ok(!d.gm.greymarchAdminOn);
});

test("the page's requests become packets to the server; its close button closes it; server replies and events go to the page", () => {
  const { gm, log, toPage } = make();
  gm.greymarchMenuShow({ mode: "hold", looking: BIT + 5 });
  gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "menu", rid: 7, op: "introduce", args: { target: "#BBBB" } })] });
  const [name, payload] = log.sent.pop();
  assert.strictEqual(name, "sendMessage");
  assert.strictEqual(payload.message.t, 77);
  assert.deepStrictEqual(JSON.parse(payload.message.contentJsonDump), { customPacketType: "greymarchMenu", rid: 7, op: "introduce", args: { target: "#BBBB" } });
  gm.greymarchPacket({ customPacketType: "greymarchMenuReply", rid: 7, ok: true, data: { message: "x" } });
  assert.deepStrictEqual(toPage().pop(), { fn: "reply", arg: { customPacketType: "greymarchMenuReply", rid: 7, ok: true, data: { message: "x" } } });
  gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "menu-close" })] });
  assert.strictEqual(gm.greymarchMenuOn, false);
});

test("a trade invitation (or a trade starting) opens the menu by itself in invite mode, but does not reopen one that is already open", () => {
  const { gm, toPage } = make();
  gm.greymarchPacket({ customPacketType: "greymarchMenuEvent", type: "trade_invite", id: 1, from: "Stranger" });
  assert.strictEqual(gm.greymarchMenuOn, true);
  assert.deepStrictEqual(toPage().map((m) => m.fn), ["show", "event"]);
  assert.deepStrictEqual(toPage()[0].arg, { mode: "invite", looking: 0, object: false });
  gm.greymarchPacket({ customPacketType: "greymarchMenuEvent", type: "trade_invite", id: 2, from: "Stranger" });
  assert.deepStrictEqual(toPage().map((m) => m.fn), ["show", "event", "event"]);
  const other = make();
  other.gm.greymarchPacket({ customPacketType: "greymarchMenuEvent", type: "trade", phase: "open" });
  assert.strictEqual(other.gm.greymarchMenuOn, true);
});

test("names: everyone else is a Stranger unless the server says this player knows them; activation is blocked on them", () => {
  const { gm, log, actors } = make();
  gm.greymarchOthers = [BIT + 1, BIT + 2];
  gm.greymarchPacket({ customPacketType: "greymarchKnown", names: { [BIT + 1]: "Alda Ring" } });
  gm.greymarchNamesApply(10000);
  assert.strictEqual(actors.get(0x101).name, "Alda Ring");
  assert.strictEqual(actors.get(0x102).name, "Stranger");
  assert.deepStrictEqual(log.blocked.sort(), [0x101, 0x102]);
  assert.ok(log.blockArgs.every((n) => n === 2), "asked to hide the activation text too");
});

test("names: checked every 1.5 seconds, put right again when SkyMP writes the character ID back, and learned names apply at once", () => {
  const { gm, log, actors } = make();
  gm.greymarchOthers = [BIT + 2];
  gm.greymarchNamesApply(10000);
  const setCount = () => log.names.size;
  const a = actors.get(0x102);
  const before = log.blocked.length;
  gm.greymarchNamesApply(10500); // too soon
  assert.strictEqual(log.blocked.length, before);
  gm.greymarchNamesApply(11600); // nothing to fix: nothing set again
  assert.strictEqual(a.name, "Stranger");
  a.name = "#2"; // SkyMP draws the actor again and writes the character ID
  gm.greymarchNamesApply(13200);
  assert.strictEqual(a.name, "Stranger");
  gm.greymarchPacket({ customPacketType: "greymarchKnown", names: { [BIT + 2]: "Bram Hale" } });
  gm.greymarchNamesApply(13300); // the packet reset the timer
  assert.strictEqual(a.name, "Bram Hale");
  assert.ok(setCount() >= 1);
});

test("names: an actor this game has not made yet is skipped, and nothing breaks when there is nobody", () => {
  const { gm, log } = make();
  gm.greymarchNamesApply(10000);
  gm.greymarchOthers = [0xdead];
  gm.greymarchNamesApply(12000);
  assert.strictEqual(log.names.size, 0);
});

test("a menu that is open keeps the browser layer visible when the loading veil lifts or the staff panel closes", () => {
  const { gm, log } = make();
  gm.greymarchMenuShow({ mode: "hold", looking: BIT + 5 });
  log.visible.length = 0;
  gm.greymarchReveal = { at: 0 };
  gm.greymarchLift("test");
  assert.strictEqual(log.visible.pop(), true);
});
