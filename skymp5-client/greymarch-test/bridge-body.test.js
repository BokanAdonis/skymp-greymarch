"use strict";
// The body of a dead wild animal, the game's half (src/greymarch/bridge.ts): holding X on a dead body, and E on one (the server's greymarchMenuEvent "body"),
// open the X menu on it; the server (gamemode wildlifesystem.js, social.js) shows what can be taken.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make() {
  const log = { js: [], visible: [], focused: [], notes: [], lines: [], names: new Map() };
  const misc = { remoteIdToLocalId: (id) => (id === 0xdead ? 0 : id + 0x1000), localIdToRemoteId: (id) => (id >= 0x1000 ? id - 0x1000 : 0), getViewFromStorage: () => null };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": misc, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  let crosshair = null;
  const objs = new Map();
  const objectFor = (local) => {
    if (!objs.has(local)) objs.set(local, { local, name: "Door " + local.toString(16), getDisplayName() { return this.name; }, setDisplayName(n) { if (this.fail) throw new Error("no"); this.name = n; log.names.set(local, n); return true; } });
    return objs.get(local);
  };
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => ({ id: 0x14 }), getFormEx: (id) => (id === 0x999 ? null : { id }), getCurrentCrosshairRef: () => crosshair },
    ObjectReference: { from: (f) => (f ? objectFor(f.id) : null) },
    Actor: { from: (f) => f },
    Debug: { notification: (t) => log.notes.push(t) },
    browser: { executeJavaScript: (j) => log.js.push(j), setVisible: (v) => log.visible.push(v), setFocused: (v) => log.focused.push(v) },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const toPage = () => log.js.filter((x) => x.includes("__gmMenuSend(")).map((x) => JSON.parse(x.slice(x.lastIndexOf("__gmMenuSend(") + 13).replace(/\);$/, "")));
  const look = (localId, baseType, dead) => { crosshair = { getFormID: () => localId, getBaseObject: () => (baseType === undefined ? null : { getType: () => baseType }), ...(dead === undefined ? {} : { isDead: () => dead }) }; };
  return { gm, log, toPage, look, objectFor };
}
const press = (gm) => { gm.greymarchKey({ code: 45, isDown: false }); gm.greymarchKey({ code: 45, isDown: true }); };

test("hold X on a dead body opens the menu about it as an actor (not an object); a living creature gives the hint", () => {
  const { gm, look, toPage } = make();
  look(0x1400, 43, true); // remote id 0x400, an NPC base
  press(gm);
  assert.strictEqual(gm.greymarchMenuOn, true);
  assert.deepStrictEqual(toPage()[0], { fn: "show", arg: { mode: "hold", looking: 0x400, object: false } });
  const alive = make();
  alive.look(0x1400, 43, false);
  press(alive.gm);
  assert.ok(!alive.gm.greymarchMenuOn);
  assert.deepStrictEqual(alive.log.notes, ["Look at a player, a door, a chest or a body and hold X"]);
});

test("E on a body: the server's \"body\" event opens the menu on it, open (not held); while the menu is up the event goes to the page instead", () => {
  const { gm, toPage } = make();
  gm.greymarchPacket({ customPacketType: "greymarchMenuEvent", type: "body", looking: 0x400 });
  assert.strictEqual(gm.greymarchMenuOn, true);
  assert.deepStrictEqual(toPage()[0], { fn: "show", arg: { mode: "open", looking: 0x400, object: false } });
  gm.greymarchPacket({ customPacketType: "greymarchMenuEvent", type: "body", looking: 0x401 });
  assert.deepStrictEqual(toPage().at(-1), { fn: "event", arg: { customPacketType: "greymarchMenuEvent", type: "body", looking: 0x401 } });
  const bad = make();
  bad.gm.greymarchPacket({ customPacketType: "greymarchMenuEvent", type: "body", looking: "x" });
  assert.ok(!bad.gm.greymarchMenuOn, "no body id: nothing opens");
});
