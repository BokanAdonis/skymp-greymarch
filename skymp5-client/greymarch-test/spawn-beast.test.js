"use strict";
// SkyMP's SpawnProcess (src/view/spawnProcess.ts) with a GREYMARCH guard: a look with no head parts (a werewolf, a creature form) is not given applyTints,
// which would give the actor's base the player's form ID (the werewolf's animation graph then crashed other players' games).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "view", "spawnProcess.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

async function spawn(appearance) {
  const tinted = [], resurrected = [];
  const refr = { getFormID: () => 0xff000ac8, setPosition: () => Promise.resolve(), enable: () => Promise.resolve(), getBaseObject: () => ({}) , setMotionType: () => Promise.resolve() };
  const actor = { resurrect: () => { resurrected.push(appearance); return Promise.resolve(); } };
  const mods = {
    skyrimPlatform: { ObjectReference: { from: () => refr }, Game: { getFormEx: () => refr }, Actor: { from: () => actor }, MotionType: { Keyframed: 4 } },
    "../sync/appearance": { applyTints: (ac, a) => tinted.push(a) },
    "../sync/movement": {},
    "../extensions/objectReferenceEx": { ObjectReferenceEx: { dealWithRef() {} } },
  };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  let done; const finished = new Promise((r) => { done = r; });
  new mod.exports.SpawnProcess(appearance, [0, 0, 0], 0xff000ac8, () => done());
  await finished;
  spawn.resurrected = resurrected;
  return tinted;
}

test("a person's look gets its tints as before", async () => {
  const human = { raceId: 0x13746, headpartIds: [1, 2, 3], tints: [] };
  assert.deepStrictEqual(await spawn(human), [human]);
});

test("a werewolf's or creature's look (no head parts) is not given applyTints, so its base never claims the player's form ID", async () => {
  assert.deepStrictEqual(await spawn({ raceId: 0xcdd84, headpartIds: [], tints: [] }), []);
  assert.deepStrictEqual(await spawn({ raceId: 0x131e8, headpartIds: [], tints: [] }), [], "a creature form too");
});

test("a beast look is not resurrected (its 3D reset freed the werewolf's half-built animation graph and crashed the watching games); a person's look still is", async () => {
  await spawn({ raceId: 0xcdd84, headpartIds: [], tints: [] });
  assert.deepStrictEqual(spawn.resurrected, [], "the werewolf is enabled and done");
  const human = { raceId: 0x13746, headpartIds: [1], tints: [] };
  await spawn(human);
  assert.deepStrictEqual(spawn.resurrected, [human]);
  await spawn(null);
  assert.strictEqual(spawn.resurrected.length, 1, "SkyMP's own NPCs as before");
});

test("no look (SkyMP's own NPCs) is spawned as before", async () => {
  assert.deepStrictEqual(await spawn(null), []);
});
