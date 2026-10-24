"use strict";
// Item names given by the server keep items apart (src/sync/inventory.ts): two guard report papers are the same base item (a Roll of Paper) with
// different names. The name compare was switched off, so putting one paper in a chest was diffed against the other paper and the chest got the wrong
// one (or both as one stack of 2 under one name), and the earlier report could no longer be taken out.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "sync", "inventory.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const PAPER = 0x33761, SWORD = 0x12eb7;
const NAMES = { [PAPER]: "Roll of Paper", [SWORD]: "Iron Sword" };
const mods = { skyrimPlatform: { Game: { getFormEx: (id) => (NAMES[id] ? { getName: () => NAMES[id] } : null) } } };
const mod = { exports: {} };
new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
const { getDiff, hasExtras, sumInventories } = mod.exports;

const inv = (...entries) => ({ entries });

test("putting one of two named papers in a chest sends that paper, by its name", () => {
  const before = inv({ baseId: PAPER, count: 1, name: "Guard Report GR-0041" }, { baseId: PAPER, count: 1, name: "Guard Report GR-0042" });
  const after = inv({ baseId: PAPER, count: 1, name: "Guard Report GR-0042" });
  assert.deepStrictEqual(getDiff(before, after, false).entries, [{ baseId: PAPER, count: 1, name: "Guard Report GR-0041" }]);
});

test("taking a named paper back out is its own entry, never merged with another paper", () => {
  const before = inv({ baseId: PAPER, count: 1, name: "Guard Report GR-0042" });
  const after = inv({ baseId: PAPER, count: 1, name: "Guard Report GR-0042" }, { baseId: PAPER, count: 1, name: "Guard Report GR-0041" });
  assert.deepStrictEqual(getDiff(before, after, false).entries, [{ baseId: PAPER, count: -1, name: "Guard Report GR-0041" }]);
});

test("papers with the same title but another number stay apart (a bracket at the end is not taken for the game's own suffix)", () => {
  const before = inv({ baseId: PAPER, count: 1, name: "Theft at the docks (GR-0041)" }, { baseId: PAPER, count: 1, name: "Theft at the docks (GR-0042)" });
  const after = inv({ baseId: PAPER, count: 1, name: "Theft at the docks (GR-0041)" });
  assert.deepStrictEqual(getDiff(before, after, false).entries, [{ baseId: PAPER, count: 1, name: "Theft at the docks (GR-0042)" }]);
});

test("a named paper is not mixed up with plain paper", () => {
  const before = inv({ baseId: PAPER, count: 3 }, { baseId: PAPER, count: 1, name: "Guard Report GR-0041" });
  const after = inv({ baseId: PAPER, count: 1, name: "Guard Report GR-0041" });
  assert.deepStrictEqual(getDiff(before, after, false).entries, [{ baseId: PAPER, count: 3 }]);
  assert.strictEqual(hasExtras({ baseId: PAPER, count: 1, name: "Guard Report GR-0041" }), true);
  assert.strictEqual(hasExtras({ baseId: PAPER, count: 1 }), false);
});

test("the item's own name as the game shows it is still the same item (no extra moves for ordinary things)", () => {
  // no name, the plain form name and the game's suffix all count as one item
  assert.deepStrictEqual(getDiff(inv({ baseId: SWORD, count: 2 }), inv({ baseId: SWORD, count: 1, name: "Iron Sword" }), false).entries, [{ baseId: SWORD, count: 1 }]);
  assert.deepStrictEqual(getDiff(inv({ baseId: SWORD, count: 1, health: 1.1 }), inv({ baseId: SWORD, count: 1, health: 1.1, name: "Iron Sword (Fine)" }), false).entries, []);
  assert.deepStrictEqual(getDiff(inv({ baseId: SWORD, count: 1, health: 1.1, name: "Iron Sword (Fine)" }), inv({ baseId: SWORD, count: 1, health: 1.1, name: "Iron Sword (Superior)" }), false).entries, []);
  assert.strictEqual(hasExtras({ baseId: SWORD, count: 1, name: "Iron Sword" }), false, "the plain form name is no extra");
  assert.strictEqual(sumInventories(inv({ baseId: SWORD, count: 1 }), inv({ baseId: SWORD, count: 2 })).entries[0].count, 3, "plain items still add up");
});
