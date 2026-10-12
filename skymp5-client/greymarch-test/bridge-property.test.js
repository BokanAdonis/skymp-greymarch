"use strict";
// Houses and storage, the game's half (src/greymarch/bridge.ts): holding X on a door or a chest, and the names staff gave doors.
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
  const look = (localId, baseType) => { crosshair = { getFormID: () => localId, getBaseObject: () => (baseType === undefined ? null : { getType: () => baseType }) }; };
  return { gm, log, toPage, look, objectFor };
}
const press = (gm) => { gm.greymarchKey({ code: 45, isDown: false }); gm.greymarchKey({ code: 45, isDown: true }); };

test("hold X on a door or a chest opens the menu about THAT object (the page is told it is an object); anything else gives the hint", () => {
  for (const [type, what] of [[29, "door"], [28, "chest"]]) {
    const { gm, look, toPage } = make();
    look(0x1200, type); // remote id 0x200
    press(gm);
    assert.strictEqual(gm.greymarchMenuOn, true, what);
    assert.deepStrictEqual(toPage()[0], { fn: "show", arg: { mode: "hold", looking: 0x200, object: true } }, what);
  }
  for (const [type, what] of [[41, "a weapon"], [0, "no base"], [undefined, "a base that cannot be read"]]) {
    const { gm, look, log } = make();
    look(0x1300, type);
    press(gm);
    assert.ok(!gm.greymarchMenuOn, what);
    assert.deepStrictEqual(log.notes, ["Look at a player, a door or a chest and hold X"], what);
  }
});

test("a player still opens the menu as a player, and a player is never mistaken for an object", () => {
  const { gm, look, toPage } = make();
  gm.greymarchOthers = [0x305];
  look(0x1305, 41);
  press(gm);
  assert.deepStrictEqual(toPage()[0], { fn: "show", arg: { mode: "hold", looking: 0x305, object: false } });
});

test("the names staff gave doors are put on the doors every few seconds, only when they differ, and a door that loses its name goes back", () => {
  const { gm, objectFor, log } = make();
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 512: "Breezehome", 513: "Honeyside" } });
  gm.greymarchDoorNamesApply(10000);
  assert.strictEqual(objectFor(0x1200).name, "Breezehome");
  assert.strictEqual(objectFor(0x1201).name, "Honeyside");
  const n = log.names.size;
  gm.greymarchDoorNamesApply(10500); // too soon
  gm.greymarchDoorNamesApply(14000); // already right: nothing set again
  assert.strictEqual(log.names.size, n);
  objectFor(0x1200).name = "Whiterun Door"; // the game puts the old name back (the door was reloaded)
  gm.greymarchDoorNamesApply(18000);
  assert.strictEqual(objectFor(0x1200).name, "Breezehome");
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 513: "Honeyside" } }); // the first door lost its name
  gm.greymarchDoorNamesApply(18001);
  assert.strictEqual(objectFor(0x1200).name, "", "back to the game's own name");
  assert.strictEqual(objectFor(0x1201).name, "Honeyside");
});

test("a door this game has not loaded, or cannot rename, never breaks the game and is reported once", () => {
  const { gm, objectFor, log } = make();
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 57005: "Gone", 512: "Breezehome", 513: "Honeyside" } });
  objectFor(0x1200).fail = true;
  objectFor(0x1201).fail = true;
  gm.greymarchDoorNamesApply(10000);
  assert.strictEqual(log.lines.filter((l) => /could not name door/.test(l)).length, 1, "reported once");
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: "nonsense" });
  gm.greymarchDoorNamesApply(20000);
});
