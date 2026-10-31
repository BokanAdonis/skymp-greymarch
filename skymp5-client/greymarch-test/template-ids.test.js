"use strict";
// The start save (assets/template.ess) re-creates 141 objects its old game made, under their old runtime ids. An object THIS game made before the load
// with one of those ids got the old data applied and the game crashed in the load (2026-10-31: the save's actor FF000D7D on "Vidrald").
// templateIds.ts removes such objects just before loadGameService asks SkyrimPlatform to load the world.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const ess = path.join(root, "..", "skyrim-platform", "src", "platform_se", "skyrim_platform", "assets", "template.ess");
const { readCreatedIds } = require("../tools/greymarch-template-pinned");
const load = (rel, mods = {}) => {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, "src", ...rel.split("/")), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  return mod.exports;
};
const pinned = load("greymarch/templatePinned.ts");
const { clearTemplateIds } = load("greymarch/templateIds.ts", { "./templatePinned": pinned });

test("the start save's 141 runtime ids, FF000D7D (the crash) among them, are what the generator reads from template.ess", () => {
  const ids = readCreatedIds(fs.readFileSync(ess));
  assert.strictEqual(ids.length, 141);
  assert.ok(ids.includes(0xff000d7d));
  assert.strictEqual(ids[0], 0xff00081a);
  assert.strictEqual(ids[ids.length - 1], 0xff000db9);
  assert.deepStrictEqual(pinned.TEMPLATE_CREATED, ids, "the checked-in list matches (rerun tools/greymarch-template-pinned.js after changing the save)");
});

test("references with those ids are removed; other forms are reported, not touched; ids nobody has are skipped", () => {
  const removed = [];
  const game = {
    find: (id) => ({ 0xff000d7d: { isRef: true, isActor: true, name: "Vidrald", type: 62 }, 0xff000900: { isRef: true, isActor: false, name: "", type: 61 }, 0xff000898: { isRef: false, isActor: false, name: "Nord", type: 43 } }[id] || null),
    remove: (id) => removed.push(id),
  };
  const r = clearTemplateIds(game, [0xff000898, 0xff000900, 0xff000d7d, 0xff000d7e]);
  assert.deepStrictEqual(removed, [0xff000900, 0xff000d7d]);
  assert.deepStrictEqual(r.removed, ["ff000900 object", "ff000d7d actor 'Vidrald'"]);
  assert.deepStrictEqual(r.kept, ["ff000898 form type 43 'Nord'"]);
});

test("loadGameService clears those ids before it asks SkyrimPlatform to load the world", () => {
  const src = fs.readFileSync(path.join(root, "src", "services", "services", "loadGameService.ts"), "utf8");
  const body = src.slice(src.indexOf("public loadGame("), src.indexOf("private greymarchClearTemplateIds"));
  assert.ok(body.indexOf("this.greymarchClearTemplateIds();") > 0);
  assert.ok(body.indexOf("this.greymarchClearTemplateIds();") < body.indexOf("this.sp.loadGame("), "before the load");
});
