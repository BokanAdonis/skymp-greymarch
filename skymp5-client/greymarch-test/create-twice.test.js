"use strict";
// remoteServer.ts onCreateActorMessage: a create for an object this game already shows must replace it, never add a second copy.
// SkyMP's IdManager gave a second slot and left the first one (its form and FormView) behind: a frozen clone with its own floating name (2026-10-23).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const load = (rel) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", ...rel.split("/")), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
  return mod.exports;
};
const { IdManager } = load("lib/idManager.ts");
const remote = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "remoteServer.ts"), "utf8");

test("SkyMP's id manager on its own: a second create for the same object gets a second slot and the first is never freed (the clone)", () => {
  const ids = new IdManager();
  const first = ids.allocateIdFor(7);
  const second = ids.allocateIdFor(7);
  assert.notStrictEqual(first, second);
  ids.freeIdFor(7);
  assert.strictEqual(ids.getValueById(first), 7, "the first slot still belongs to the object after its removal");
});

test("what create now does (free the slot it already has, then allocate): one slot, the same one, and a removal leaves nothing behind", () => {
  const ids = new IdManager();
  ids.allocateIdFor(3);
  const first = ids.allocateIdFor(7);
  const again = () => { if (ids.getId(7) >= 0) ids.freeIdFor(7); return ids.allocateIdFor(7); };
  assert.strictEqual(again(), first, "the copy is redrawn in the same slot");
  assert.strictEqual(again(), first);
  ids.freeIdFor(7);
  assert.strictEqual(ids.getId(7), -1);
  assert.strictEqual(ids.getValueById(first), undefined, "nothing left over");
  assert.strictEqual(ids.getId(3), 0, "other objects keep their slots");
});

test("onCreateActorMessage clears the old form, removes its view and frees its slot BEFORE allocating, and logs it (at most 5 times)", () => {
  const start = remote.indexOf("private onCreateActorMessage");
  assert.ok(start > 0);
  const body = remote.slice(start, start + 6000);
  const guard = body.indexOf("const known = this.getIdManager().getId(msg.idx);");
  const alloc = body.indexOf("this.getIdManager().allocateIdFor(msg.idx)");
  assert.ok(guard > 0 && alloc > guard, "the check comes before the allocation");
  const block = body.slice(guard, alloc);
  assert.ok(block.includes("this.worldModel.forms[known] = undefined"), "the old form is cleared");
  assert.ok(block.includes("syncFormArray(this.worldModel)"), "its FormView is destroyed");
  assert.ok(block.includes("this.getIdManager().freeIdFor(msg.idx)"), "its slot is freed");
  assert.ok(/greymarchDoubleCreates <= 5/.test(block) && block.includes('"greymarchStage"'), "the server log hears about it, a few times per session");
});
