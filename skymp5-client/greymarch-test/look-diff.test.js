"use strict";
// formView.ts writes why a player's copy is built again (2026-11-02: an attacker's game rebuilt one player's copy every 3-8 s and hits went straight
// through). lookDiff.ts names the parts of the look that changed.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "lookDiff.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", js)(mod, mod.exports, require);
const { gmLookDiff } = mod.exports;

test("names the parts of the look that changed, not the name", () => {
  const a = { name: "A", raceId: 0x13746, weight: 50, headpartIds: [1, 2, 3], tints: [{ a: 1 }] };
  const b = { name: "B", raceId: 0x13746, weight: 60, headpartIds: [1, 2], tints: [{ a: 1 }] };
  assert.strictEqual(gmLookDiff(a, b), "weight 50 -> 60, headpartIds (3 -> 2 entries)");
});

test("the same look but the name says so; a missing side is shown", () => {
  assert.strictEqual(gmLookDiff({ name: "A", weight: 1 }, { name: "B", weight: 1 }), "nothing but the name");
  assert.strictEqual(gmLookDiff(null, { isFemale: true }), "isFemale undefined -> true");
});
