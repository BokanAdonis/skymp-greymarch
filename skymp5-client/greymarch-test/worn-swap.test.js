"use strict";
// A worn piece swapped for the server's copy of the same item stays on (greymarch/wornSwap.ts, sync/inventory.ts applyInventory)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", "src", ...rel.split("/")), "utf8");
const load = (rel) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
  return mod.exports;
};
const { keepWornOnSwap, swapReason } = load("greymarch/wornSwap.ts");
const ARMOR = 0x18388, HELM = 0x56a9e, CHEESE = 0xa05f06d;

test("the upgraded armor the game wears, replaced by the server's copy at login, is put on again", () => {
  const diff = [
    { baseId: ARMOR, count: -1, worn: true, health: 1.1 },
    { baseId: ARMOR, count: 1, health: 1.2 },
    { baseId: CHEESE, count: 1 },
  ];
  const r = keepWornOnSwap(diff);
  assert.strictEqual(r.pairs.length, 1);
  assert.strictEqual(diff[1].worn, true);
  assert.strictEqual(diff[2].worn, undefined, "other items untouched");
  assert.strictEqual(swapReason(r.pairs[0].out, r.pairs[0].in), "health 1.1 -> 1.2");
});

test("left hand stays left; a plain take-off (no copy added) is not changed; one copy is used once", () => {
  const diff = [
    { baseId: HELM, count: -1, wornLeft: true },
    { baseId: HELM, count: 1, name: "Old" },
    { baseId: ARMOR, count: -1, worn: true },
  ];
  const r = keepWornOnSwap(diff);
  assert.strictEqual(diff[1].wornLeft, true);
  assert.strictEqual(diff[1].worn, undefined);
  assert.strictEqual(r.pairs.length, 1, "the armor taken with nothing in its place stays taken");
});

test("wired into applyInventory", () => {
  const inv = read("sync/inventory.ts");
  assert.match(inv, /keepWornOnSwap\(diff/);
  assert.match(inv, /import \{ keepWornOnSwap, swapReason \} from '\.\.\/greymarch\/wornSwap'/);
});

test("PUT ON FOR REAL (2026-11-11 evening, the owner's log: kept on, then two unequips each and nothing worn): each swapped piece is equipped after the swap", () => {
  const src = read("sync/inventory.ts").replace(/\r\n/g, "\n");
  const swapAt = src.indexOf("swapPairs = swap.pairs;"), equipAt = src.indexOf("if (swapPairs.length && !enableCrashProtection)"), loopAt = src.indexOf("diff.forEach((e, i) => {");
  assert.ok(swapAt > 0 && equipAt > loopAt && loopAt > swapAt, "the equip comes after the add/remove loop");
  assert.match(src, /if \(f\.getType\(\) === FormType\.Weapon\) ac\.equipItemEx\(f, p\.in\.wornLeft \? 2 : 1, false, false\);\n\s*else ac\.equipItem\(f, false, true\);/);
  assert.match(src, /put on again after the swap/);
});
