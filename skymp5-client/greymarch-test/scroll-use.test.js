"use strict";
// A scroll read is seen by its count (greymarch/scrollUse.ts) and its cast sent (magicSyncService checkScrollReads): the game sends no cast for a scroll
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
const { scrollReads, serverCount } = load("greymarch/scrollUse.ts");
const ID = 0x96598;

test("a held scroll one fewer is a read, from the hand it was in", () => {
  const r = scrollReads({ [ID]: { count: 1, hand: 1, server: 1 } }, { [ID]: { count: 0, hand: -1, server: 1 } }, false);
  assert.deepStrictEqual(r, [{ id: ID, hand: 1 }]);
  assert.deepStrictEqual(scrollReads({ [ID]: { count: 3, hand: 0, server: 3 } }, { [ID]: { count: 2, hand: 0, server: 3 } }, false), [{ id: ID, hand: 0 }]);
});

test("not a read: a menu open, the server changed it, not in a hand, two at once, the same count", () => {
  assert.deepStrictEqual(scrollReads({ [ID]: { count: 1, hand: 1, server: 1 } }, { [ID]: { count: 0, hand: -1, server: 1 } }, true), []);
  assert.deepStrictEqual(scrollReads({ [ID]: { count: 2, hand: 1, server: 2 } }, { [ID]: { count: 1, hand: 1, server: 1 } }, false), []);
  assert.deepStrictEqual(scrollReads({ [ID]: { count: 2, hand: -1, server: 2 } }, { [ID]: { count: 1, hand: -1, server: 2 } }, false), []);
  assert.deepStrictEqual(scrollReads({ [ID]: { count: 3, hand: 1, server: 3 } }, { [ID]: { count: 1, hand: 1, server: 3 } }, false), []);
  assert.deepStrictEqual(scrollReads({ [ID]: { count: 2, hand: 1, server: 2 } }, { [ID]: { count: 2, hand: 1, server: 2 } }, false), []);
  assert.deepStrictEqual(scrollReads({ [ID]: { count: 1, hand: 1, server: 1 } }, {}, false), []);
});

test("the server's count sums its stacks", () => {
  assert.strictEqual(serverCount({ entries: [{ baseId: ID, count: 2 }, { baseId: 0xf, count: 9 }, { baseId: ID, count: 1, health: 1 }] }, ID), 3);
  assert.strictEqual(serverCount(undefined, ID), 0);
});

test("wired into magicSyncService: every 100 ms, the cast sent unless the game sent one", () => {
  const src = read("services/services/magicSyncService.ts").replace(/\r\n/g, "\n");
  for (const bit of [
    "        this.checkCharge();\n        this.checkScrollReads();\n",
    "if (now - this.scrollCheckAt < 100) return;",
    "if (f && this.sp.Scroll.from(f)) look(f.getFormID(), hand);",
    "const reads = scrollReads(this.scrollSeen, seen, menu);",
    "c.spell === r.id && now - c.at <= 1500)) continue;",
    "this.staffSend(me, r.id, r.hand, false);",
  ]) assert.ok(src.includes(bit), bit);
});
