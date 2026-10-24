"use strict";
// SkyrimPlatform's start save (assets/template.ess) pins objects to their unmodded spots (2026-10-24: the Jorrvaskr door 077FA2). tools/greymarch-template-pinned.js
// lists them into src/greymarch/templatePinned.ts and src/greymarch/templateFix.ts moves a loaded one still at that spot to where its plugins put it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const ess = path.join(root, "..", "skyrim-platform", "src", "platform_se", "skyrim_platform", "assets", "template.ess");
const { readPinned } = require("../tools/greymarch-template-pinned");
const load = (rel, mods = {}) => {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, "src", ...rel.split("/")), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  return mod.exports;
};
const pinned = load("greymarch/templatePinned.ts");
const { TemplateFix, PER_CALL, MAX_MOVES } = load("greymarch/templateFix.ts", { "./templatePinned": pinned });

test("the start save pins the Jorrvaskr door 077FA2 to its unmodded spot (995, -298, -103); the list holds every promoted or moved object with a position", () => {
  const list = readPinned(fs.readFileSync(ess));
  assert.strictEqual(list.length, 3921);
  assert.deepStrictEqual(list.find((e) => e[0] === 0x77fa2), [0x77fa2, 995, -298, -103]);
  assert.ok(list.every((e) => e.length === 4 && e.every(Number.isFinite)));
});

test("the checked-in templatePinned.ts is exactly what the generator makes from template.ess (rerun tools/greymarch-template-pinned.js after changing the save)", () => {
  const flat = [].concat(...readPinned(fs.readFileSync(ess)));
  assert.deepStrictEqual(pinned.TEMPLATE_PINNED, flat);
});

// a pretend world: id -> { x, y, z, loaded, actor }; missing ids are not in this load order
function world(objects) {
  const moved = [];
  return {
    moved,
    api: {
      look: (id) => (objects[id] ? { ...objects[id] } : null),
      move: (id) => { moved.push(id); objects[id] = { ...objects[id], x: 616, y: 120, z: -472 }; },
    },
  };
}

test("a loaded object still at the save's spot is moved once; one already elsewhere, unloaded, an actor or missing is left alone", () => {
  const list = [1, 995, -298, -103, 2, 10, 10, 10, 3, 0, 0, 0, 4, 5, 5, 5, 5, 7, 7, 7];
  const objects = {
    1: { x: 994.99, y: -298.03, z: -103.05, loaded: true, actor: false }, // the door
    2: { x: 400, y: 10, z: 10, loaded: true, actor: false }, // a mod put it elsewhere and that won: nothing to do
    3: { x: 0, y: 0, z: 0, loaded: false, actor: false }, // not loaded yet: looked at again later
    4: { x: 5, y: 5, z: 5, loaded: true, actor: true }, // an actor: never
  };
  const w = world(objects);
  const fix = new TemplateFix(list);
  assert.deepStrictEqual(fix.tick(w.api), [1]);
  assert.deepStrictEqual(w.moved, [1]);
  fix.tick(w.api); fix.tick(w.api);
  assert.deepStrictEqual(w.moved, [1], "moved once: it is no longer at the save's spot");
  objects[3].loaded = true;
  fix.tick(w.api);
  assert.deepStrictEqual(w.moved, [1, 3], "picked up once it loads");
});

test("a call looks at a bounded slice and moves a bounded number, and goes round the whole list over calls", () => {
  const n = PER_CALL * 2 + 7;
  const list = [], objects = {};
  for (let i = 1; i <= n; i++) { list.push(i, 1, 2, 3); objects[i] = { x: 1, y: 2, z: 3, loaded: true, actor: false }; }
  const w = world(objects);
  const fix = new TemplateFix(list);
  const first = fix.tick(w.api);
  assert.strictEqual(first.length, MAX_MOVES);
  let calls = 1;
  while (w.moved.length < n && calls < 10000) { fix.tick(w.api); calls++; }
  assert.strictEqual(w.moved.length, n, "everything reached");
  assert.strictEqual(new Set(w.moved).size, n, "nothing twice");
});
