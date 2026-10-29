"use strict";
// Drops and puts into containers reach the server again (2026-10-28, the owner: a dropped poison came back and stayed on the ground, ingredients put in a sack
// came back). Breadcrumbs: every drop came with "reference none", and every put was "sent nothing": the missing SweetCantDrop keyword made hasKeyword(null) say no.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const svc = (f) => fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", f), "utf8");

test("no SweetCantDrop keyword in the game: every item can be dropped and put away", () => {
  const src = svc("sweetTaffySweetCantDropService.ts");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, (m) => (m.endsWith("clientListener") ? { ClientListener: class {} } : {}));
  const make = (keyword, has) => new mod.exports.SweetTaffySweetCantDropService({ Game: { getFormEx: () => ({ hasKeyword: (k) => has(k) }) }, Keyword: { getKeyword: () => keyword } }, {});
  assert.strictEqual(make(null, () => true).canDropOrPutItem(1), true, "no keyword: hasKeyword(null) is never asked");
  assert.strictEqual(make({ k: 1 }, (k) => !!k).canDropOrPutItem(1), false, "an item that has the keyword still cannot");
  assert.strictEqual(make({ k: 1 }, () => false).canDropOrPutItem(1), true);
});

test("a drop is told to the server without a reference on the event (the dropped copy is found nearby)", () => {
  const src = svc("dropItemService.ts");
  const gate = src.slice(src.indexOf("        if (\n") >= 0 ? src.indexOf("        if (\n") : src.indexOf("        if (\r\n"), src.indexOf("const radius"));
  assert.ok(gate.includes("isPlayer &&") && gate.includes("noContainer &&") && !gate.includes("isReference &&"), "the gate no longer needs a reference");
  assert.ok(src.includes("if (!numFound)"), "a change with no dropped copy nearby (a drink, a poison on a blade) is still not a drop");
});
