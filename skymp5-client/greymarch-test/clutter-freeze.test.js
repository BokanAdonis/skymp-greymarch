"use strict";
// clutterFreezeService.ts: clutter stays put (2026-11-02, the owner: running over a table must not knock everything off).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const FT = { Misc: 32, Ingredient: 30, Potion: 46, Book: 27, Weapon: 41, Armor: 26, Key: 45, SoulGem: 52, ScrollItem: 23, Ammo: 42, Light: 31, MovableStatic: 36, Static: 34, Furniture: 40, Container: 28, NPC: 43 };
function load(mods) {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "clutterFreezeService.ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  return mod.exports;
}
const M = load({ skyrimPlatform: { FormType: FT, MotionType: { Keyframed: 4 } }, "./clientListener": { ClientListener: class {} }, "../../logging": { logError() {} } });

function setup() {
  const handlers = {}, packets = [], set = [];
  const refs = new Map(); // id -> { type, loaded }
  const sp = {
    Game: { getFormEx: (id) => (refs.has(id) ? { id } : null) },
    ObjectReference: { from: (f) => (f && refs.has(f.id) ? { getBaseObject: () => ({ getType: () => refs.get(f.id).type }), is3DLoaded: () => refs.get(f.id).loaded !== false, setMotionType: (m, a) => { set.push([f.id, m, a]); return Promise.resolve(); } } : null) },
    printConsole() {},
  };
  const controller = { on: (ev, f) => (handlers[ev] = f), emitter: { on: (ev, f) => packets.push(f) } };
  new M.ClutterFreezeService(sp, controller);
  const loaded = (id, type, loaded = true) => { refs.set(id, { type, loaded }); handlers.objectLoaded({ object: { getFormID: () => id }, isLoaded: true }); };
  const packet = (o) => packets.forEach((f) => f({ message: { contentJsonDump: JSON.stringify(o) } }));
  return { handlers, set, refs, loaded, packet, update: () => handlers.update() };
}

test("loose clutter from the world is frozen (keyframed) on the next update; furniture, statics, containers and people are not", () => {
  const s = setup();
  s.loaded(0x000a0001, FT.Misc); s.loaded(0x000a0002, FT.MovableStatic); s.loaded(0x000a0003, FT.Potion);
  s.loaded(0x000a0004, FT.Furniture); s.loaded(0x000a0005, FT.Static); s.loaded(0x000a0006, FT.Container); s.loaded(0x000a0007, FT.NPC);
  assert.deepStrictEqual(s.set, [], "nothing inside the event itself");
  s.update();
  assert.deepStrictEqual(s.set, [[0x000a0001, 4, false], [0x000a0002, 4, false], [0x000a0003, 4, false]]);
  for (const t of [FT.Misc, FT.Ingredient, FT.Potion, FT.Book, FT.Weapon, FT.Armor, FT.Key, FT.SoulGem, FT.ScrollItem, FT.Ammo, FT.Light, FT.MovableStatic]) assert.ok(M.isLoose(t));
  for (const t of [FT.Static, FT.Furniture, FT.Container, FT.NPC]) assert.ok(!M.isLoose(t));
});

test("a dropped item (made in game, 0xff...) falls first: frozen only after DROP_SETTLE_MS", () => {
  const s = setup();
  const realNow = Date.now; let t = 1_000_000; Date.now = () => t;
  try {
    s.loaded(0xff000123, FT.Misc);
    s.update();
    assert.deepStrictEqual(s.set, [], "still falling");
    t += M.DROP_SETTLE_MS;
    s.update();
    assert.deepStrictEqual(s.set, [[0xff000123, 4, false]]);
    assert.ok(M.madeInGame(0xff000001) && !M.madeInGame(0x0001f4a2));
  } finally { Date.now = realNow; }
});

test("again whenever its 3D loads again (a cell reload), and a reference whose 3D is gone or that was picked up is skipped", () => {
  const s = setup();
  s.loaded(0x000b0001, FT.Book); s.update();
  s.loaded(0x000b0001, FT.Book); s.update();
  assert.strictEqual(s.set.length, 2);
  s.loaded(0x000b0002, FT.Book, false); s.refs.delete(0x000b0003); s.handlers.objectLoaded({ object: { getFormID: () => 0x000b0003 }, isLoaded: true }); s.update();
  assert.strictEqual(s.set.length, 2);
  s.handlers.objectLoaded({ object: { getFormID: () => 0x000b0004 }, isLoaded: false }); s.update();
  assert.strictEqual(s.set.length, 2, "an unload is ignored");
});

test("a big cell load is spread over frames (PER_UPDATE a frame)", () => {
  const s = setup();
  for (let i = 1; i <= M.PER_UPDATE + 10; i++) s.loaded(0x000c0000 + i, FT.Misc);
  s.update();
  assert.strictEqual(s.set.length, M.PER_UPDATE);
  s.update();
  assert.strictEqual(s.set.length, M.PER_UPDATE + 10);
});

test("the server can switch it off and on (greymarchClutterFreeze); other packets change nothing", () => {
  const s = setup();
  s.packet({ customPacketType: "somethingElse", on: false });
  s.loaded(0x000d0001, FT.Misc); s.update();
  assert.strictEqual(s.set.length, 1);
  s.packet({ customPacketType: "greymarchClutterFreeze", on: false });
  s.loaded(0x000d0002, FT.Misc); s.update();
  assert.strictEqual(s.set.length, 1, "off: nothing frozen");
  s.packet({ customPacketType: "greymarchClutterFreeze", on: true });
  s.loaded(0x000d0003, FT.Misc); s.update();
  assert.strictEqual(s.set.length, 2);
});

test("the client starts the service", () => {
  const index = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
  assert.match(index, /import \{ ClutterFreezeService \} from "\.\/services\/services\/clutterFreezeService";/);
  assert.match(index, /new ClutterFreezeService\(sp, controller\),/);
});

// the sweep (2026-11-05, the owner: weapons, shields and the keep's plates still thrown about): the player's cell is walked and what the load event missed is frozen
function sweepSetup() {
  const handlers = {}, set = [], logs = [];
  const cells = new Map(); // cellId -> [{ id, type, loaded }]
  let playerCell = 0x3c01;
  const asRef = (r) => ({ getFormID: () => r.id, getBaseObject: () => ({ getType: () => r.type }), is3DLoaded: () => r.loaded !== false, setMotionType: (m, a) => { set.push([r.id, m, a]); return Promise.resolve(); } });
  const cellOf = (id) => ({ getFormID: () => id, getNumRefs: () => (cells.get(id) || []).length, getNthRef: (i) => asRef(cells.get(id)[i]) });
  const sp = {
    Game: { getFormEx: (id) => ({ id }), getPlayer: () => ({ getParentCell: () => cellOf(playerCell) }) },
    Cell: { from: (f) => (f && cells.has(f.id) ? cellOf(f.id) : null) },
    ObjectReference: { from: () => null },
    writeLogs: (name, line) => logs.push([name, line]),
    printConsole() {},
  };
  const controller = { on: (ev, f) => (handlers[ev] = f), emitter: { on: () => {} } };
  new M.ClutterFreezeService(sp, controller);
  return { cells, set, logs, update: () => handlers.update(), move: (c) => { playerCell = c; } };
}

test("the sweep: the player's cell is walked and loose objects from the world the load event missed are frozen, once; dropped items, statics and unloaded ones are left", () => {
  const realNow = Date.now; let t = 1_000_000; Date.now = () => t;
  try {
    const s = sweepSetup();
    s.cells.set(0x3c01, [{ id: 0x1001, type: FT.Weapon }, { id: 0x1002, type: FT.Armor }, { id: 0x1003, type: FT.Static }, { id: 0xff000010, type: FT.Misc }, { id: 0x1004, type: FT.Misc, loaded: false }]);
    s.update();
    assert.deepStrictEqual(s.set, [[0x1001, 4, false], [0x1002, 4, false]], "a weapon and a shield on the wall");
    assert.match(s.logs.pop()[1], /cell 3c01: 3 loose objects, 2 frozen by the sweep/);
    t += M.SWEEP_MS; s.update();
    assert.strictEqual(s.set.length, 2, "not frozen twice");
    assert.strictEqual(s.logs.length, 0, "nothing new: no log line");
    s.cells.set(0x3c02, [{ id: 0x2001, type: FT.Misc }]);
    s.move(0x3c02); t += 10; s.update();
    assert.deepStrictEqual(s.set.pop(), [0x2001, 4, false], "a new cell is swept at once");
  } finally { Date.now = realNow; }
});

test("a big cell is swept over frames (SWEEP_PER_UPDATE a frame)", () => {
  const s = sweepSetup();
  s.cells.set(0x3c01, Array.from({ length: M.SWEEP_PER_UPDATE + 5 }, (_, i) => ({ id: 0x5000 + i, type: FT.Misc })));
  s.update();
  assert.strictEqual(s.set.length, M.SWEEP_PER_UPDATE);
  s.update();
  assert.strictEqual(s.set.length, M.SWEEP_PER_UPDATE + 5);
});
