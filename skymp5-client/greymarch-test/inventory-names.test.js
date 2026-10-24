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
const { getDiff, hasExtras, sumInventories, roundHealth, withRoundedHealth } = mod.exports;

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

test("condition: tempered gear rounds to 0.1 as before; report papers keep five decimals below 1.1 (no quality word); 1.015 and below is no condition", () => {
  assert.strictEqual(roundHealth(1.100000023841858), 1.1, "a 32-bit 1.1 from the server is 1.1");
  assert.strictEqual(roundHealth(1.2345), 1.2, "tempered gear as before");
  assert.strictEqual(roundHealth(1.0204100370407104), 1.02041, "a guard report paper (GR-0042) keeps its own condition");
  assert.strictEqual(roundHealth(1.0999800205230713), 1.09998);
  assert.strictEqual(roundHealth(1.01), undefined, "what AddItemEx gives every item is no condition");
  assert.strictEqual(roundHealth(1), undefined);
  assert.strictEqual(roundHealth(undefined), undefined);
});

test("two report papers with their own condition stay two entries, and the server's float copy compares equal to the game's", () => {
  const server = inv({ baseId: PAPER, count: 1, name: "Guard Report GR-0001", health: 1.0199999809265137 }, { baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: 1.0200099945068359 }, { baseId: SWORD, count: 1, health: 1.100000023841858 });
  const game = inv({ baseId: PAPER, count: 1, name: "Guard Report GR-0001", health: 1.02 }, { baseId: PAPER, count: 1, name: "Guard Report GR-0002", health: 1.02001 }, { baseId: SWORD, count: 1, health: 1.1 });
  assert.deepStrictEqual(getDiff(withRoundedHealth(server), game, true).entries, [], "nothing to add or remove");
  assert.deepStrictEqual(withRoundedHealth(inv({ baseId: SWORD, count: 2, health: 1.01 })).entries, [{ baseId: SWORD, count: 2 }], "no condition is dropped");
  assert.strictEqual(server.entries[0].health, 1.0199999809265137, "the server's copy itself is not changed");
});
