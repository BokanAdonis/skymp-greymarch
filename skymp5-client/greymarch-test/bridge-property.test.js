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
  assert.strictEqual(objectFor(0x1200).name, "Door 1200", "back to the game's own name, never an empty one");
  assert.strictEqual(objectFor(0x1201).name, "Honeyside");
  assert.ok(![...log.names.values()].some((v) => v === ""), "an empty display name is never set (it crashes the game)");
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

const NL = String.fromCharCode(10);

test("an owned door shows its name with 'Owned by: ...' on a second line; a door with no name of its own keeps the game's name above it", () => {
  const { gm, objectFor } = make();
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 512: { label: "Breezehome", owner: "Alda Ring" }, 513: { label: "", owner: "Bram Hale" } } });
  gm.greymarchDoorNamesApply(10000);
  assert.strictEqual(objectFor(0x1200).name, "Breezehome" + NL + "Owned by: Alda Ring");
  assert.strictEqual(objectFor(0x1201).name, "Door 1201" + NL + "Owned by: Bram Hale", "the base game's own name stays on top");
});

test("a redesignation, a new owner and a removed owner all change what the door says within a few seconds", () => {
  const { gm, objectFor } = make();
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 512: { label: "Breezehome", owner: "Alda Ring" } } });
  gm.greymarchDoorNamesApply(10000);
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 512: { label: "Breezehome Manor", owner: "Alda Ring" } } }); // staff redesignate it
  gm.greymarchDoorNamesApply(10001);
  assert.strictEqual(objectFor(0x1200).name, "Breezehome Manor" + NL + "Owned by: Alda Ring");
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 512: { label: "Breezehome Manor", owner: "Bram Hale" } } }); // a new owner
  gm.greymarchDoorNamesApply(10002);
  assert.strictEqual(objectFor(0x1200).name, "Breezehome Manor" + NL + "Owned by: Bram Hale");
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 512: { label: "Breezehome Manor", owner: "" } } }); // the owner is removed
  gm.greymarchDoorNamesApply(10003);
  assert.strictEqual(objectFor(0x1200).name, "Breezehome Manor");
  gm.greymarchPacket({ customPacketType: "greymarchProps", doors: { 512: { label: "", owner: "" } } }); // nothing left but the base name
  gm.greymarchDoorNamesApply(10004);
  assert.strictEqual(objectFor(0x1200).name, "Door 1200", "back to the game's own name");
});
