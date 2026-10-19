"use strict";
// Plants and crops ask the server first (src/extensions/objectReferenceEx.ts): their activation is blocked in the game like chests and furniture,
// so a character without the Harvester profession is refused up front instead of the game picking the plant and the server taking it back later.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "extensions", "objectReferenceEx.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const FormType = { Activator: 24, Container: 28, Door: 29, Flora: 39, Furniture: 40, NPC: 43, Tree: 38, Static: 34, Ingredient: 30 };
const mods = {
  skyrimPlatform: { FormType, MotionType: { Keyframed: 4 }, Flora: { from: () => ({ getIngredient: () => ({}) }) } },
  "./formTypeEx": { FormTypeEx: { isItem: (t) => t === FormType.Ingredient } },
};
const mod = { exports: {} };
new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
const { ObjectReferenceEx } = mod.exports;

function blockedFor(type) {
  let blocked = null;
  const refr = { blockActivation: (b) => { blocked = b; }, isLocked: () => false, setMotionType() {}, getBaseObject: () => ({ getFormID: () => 0x1234 }) };
  ObjectReferenceEx.dealWithRef(refr, { getType: () => type });
  return blocked;
}

test("plants and trees (crops, Nirnroot, wheat ...) are blocked: the server decides the harvest", () => {
  assert.strictEqual(blockedFor(FormType.Flora), true);
  assert.strictEqual(blockedFor(FormType.Tree), true);
});

test("the types SkyMP already blocked stay blocked, and other things stay free", () => {
  for (const t of [FormType.Furniture, FormType.Activator, FormType.Container, FormType.NPC, FormType.Door, FormType.Ingredient]) assert.strictEqual(blockedFor(t), true, `type ${t}`);
  assert.strictEqual(blockedFor(FormType.Static), false);
});
