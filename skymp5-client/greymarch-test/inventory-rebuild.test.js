"use strict";
// applyInventory (src/sync/inventory.ts) against a pretend Skyrim that records every AddItemEx. Skyrim cannot be told which of several items of one base
// to remove (it takes whichever comes first), so when a loose item with extras (a guard report paper: one base, its own name and condition) must go,
// every item of that base is taken out and the server's own list of it is put back. Before, the wrong paper went and papers bounced between chest and pack.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "sync", "inventory.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const FormType = { Misc: 32, Book: 27, Weapon: 41, Armor: 26, Ammo: 42, Potion: 46, Ingredient: 30 };
const PAPER = 0x33761, NOTE = 0x2000, SWORD = 0x12eb7, GOLD = 0xf;
const FORMS = { [PAPER]: ["Roll of Paper", FormType.Misc], [NOTE]: ["Note", FormType.Book], [SWORD]: ["Iron Sword", FormType.Weapon], [GOLD]: ["Gold", FormType.Misc] };

// the pretend game: one container whose items are lists of extras, as getExtraContainerChanges reports them
function setup(items) {
  const calls = [];
  let changes = items;
  const form = (id) => (FORMS[id] ? { getName: () => FORMS[id][0], getType: () => FORMS[id][1], getFormID: () => id } : null);
  const sp = {
    Game: { getFormEx: form },
    FormType,
    storage: {},
    Ammo: { from: () => null },
    Actor: { from: () => null },
    Enchantment: { from: () => null },
    Potion: { from: () => null },
    printConsole: () => {},
    getContainer: () => [],
    getExtraContainerChanges: () => changes,
    TESModPlatform: {
      resetContainer() {},
      pushWornState() {},
      addItemEx: (refr, f, count, health, ench, maxCharge, rmOnUnequip, charge, name) => calls.push({ baseId: f.getFormID(), count, name, health }),
    },
    ObjectReference: class {},
    Form: class {},
  };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => (p === "skyrimPlatform" ? sp : {}), mod.exports, mod);
  const refr = { getFormID: () => 0x1234, getBaseObject: () => ({ getFormID: () => 0x99 }), removeAllItems() {} };
  return { inv: mod.exports, refr, calls, set: (c) => { changes = c; } };
}
// a paper as the game holds it: one item with its name and condition
const paper = (name, health) => ({ baseId: PAPER, countDelta: 1, extendDataList: [[{ type: "TextDisplayData", name }, { type: "Health", health: Math.fround(health) }]] });

test("the wrong paper in the game: every paper is taken out and the server's two are put back, each with its own name and condition", () => {
  // the game piled them (two of GR-0001), the server has GR-0001 and GR-0002
  const s = setup([{ baseId: PAPER, countDelta: 2, extendDataList: [[{ type: "Count", count: 2 }, { type: "TextDisplayData", name: "Guard Report GR-0001" }, { type: "Health", health: Math.fround(1.02) }]] }]);
  const server = { entries: [{ baseId: PAPER, count: 1, name: "Guard Report GR-0001", health: Math.fround(1.02) }, { baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: Math.fround(1.02001) }] };
  s.inv.applyInventory(s.refr, server, false, true);
  assert.deepStrictEqual(s.calls, [
    { baseId: PAPER, count: -2, name: "", health: 1 }, // no name: no extra list, so Skyrim removes two papers, whichever they are
    { baseId: PAPER, count: 1, name: "Guard Report GR-0001", health: 1.02 },
    { baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: 1.02001 },
  ]);
});

test("a paper taken from a chest of two: the chest is rebuilt from the server's list, not told to remove 'one of them'", () => {
  const s = setup([paper("Guard Report GR-0001", 1.02), paper("Guard Report GR-0002", 1.02001)]);
  s.inv.applyInventory(s.refr, { entries: [{ baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: 1.02001 }] }, false, true);
  assert.deepStrictEqual(s.calls, [{ baseId: PAPER, count: -2, name: "", health: 1 }, { baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: 1.02001 }]);
});

test("nothing to change: nothing is touched; a paper only added is just added", () => {
  const s = setup([paper("Guard Report GR-0001", 1.02)]);
  s.inv.applyInventory(s.refr, { entries: [{ baseId: PAPER, count: 1, name: "Guard Report GR-0001", health: 1.0199999809265137 }] }, false, true);
  assert.deepStrictEqual(s.calls, [], "the server's 32-bit condition is the game's");
  s.inv.applyInventory(s.refr, { entries: [{ baseId: PAPER, count: 1, name: "Guard Report GR-0001", health: 1.02 }, { baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: 1.02001 }] }, false, true);
  assert.deepStrictEqual(s.calls, [{ baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: 1.02001 }], "adding never needs the rebuild");
});

test("books and notes are loose items too (the letter idea); other bases in the same chest are not touched", () => {
  const s = setup([{ baseId: NOTE, countDelta: 1, extendDataList: [[{ type: "TextDisplayData", name: "Letter A" }]] }, { baseId: NOTE, countDelta: 1, extendDataList: [[{ type: "TextDisplayData", name: "Letter B" }]] }, { baseId: GOLD, countDelta: 50, extendDataList: [] }]);
  s.inv.applyInventory(s.refr, { entries: [{ baseId: NOTE, count: 1, name: "Letter B" }, { baseId: GOLD, count: 50 }] }, false, true);
  // books go one at a time (the game code splits anything that is not a misc item, potion or ingredient): two plain removals, then Letter B
  assert.deepStrictEqual(s.calls, [{ baseId: NOTE, count: -1, name: "", health: 1 }, { baseId: NOTE, count: -1, name: "", health: 1 }, { baseId: NOTE, count: 1, name: "Letter B", health: 1 }]);
});

test("equipment keeps the old way (nothing is taken off a body); plain items keep the old way; crash protection keeps the old way", () => {
  let s = setup([{ baseId: SWORD, countDelta: 1, extendDataList: [[{ type: "Health", health: Math.fround(1.2) }]] }, { baseId: SWORD, countDelta: 1, extendDataList: [[{ type: "Health", health: Math.fround(1.3) }]] }]);
  s.inv.applyInventory(s.refr, { entries: [{ baseId: SWORD, count: 1, health: 1.3 }] }, false, true);
  assert.deepStrictEqual(s.calls.map((c) => [c.count, c.health]), [[-1, 1.2]], "a weapon: only the one that differs, as before");
  s = setup([{ baseId: GOLD, countDelta: 50, extendDataList: [] }]);
  s.inv.applyInventory(s.refr, { entries: [{ baseId: GOLD, count: 40 }] }, false, true);
  assert.deepStrictEqual(s.calls.map((c) => [c.baseId, c.count, c.name]), [[GOLD, -10, "Gold"]], "plain gold: only the difference, as before");
  s = setup([paper("Guard Report GR-0001", 1.02), paper("Guard Report GR-0002", 1.02001)]);
  s.inv.applyInventory(s.refr, { entries: [{ baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: 1.02001 }] }, true, true);
  assert.deepStrictEqual(s.calls.map((c) => [c.count, c.name]), [[-1, "Guard Report GR-0001"]], "with crash protection one change at a time, as before");
});
