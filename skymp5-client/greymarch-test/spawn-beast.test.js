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
  const refr = { getFormID: () => 0xff000ac8, setPosition: () => { (spawn.calls || (spawn.calls = [])).push("setPosition"); return Promise.resolve(); }, enable: () => { (spawn.calls || (spawn.calls = [])).push("enable"); return Promise.resolve(); }, disable: () => { spawn.calls.push("disable"); return Promise.resolve(); }, delete: () => spawn.calls.push("delete"), getBaseObject: () => ({}) , setMotionType: () => Promise.resolve() };
  const actor = { resurrect: () => { resurrected.push(appearance); return Promise.resolve(); }, enableAI: (on) => spawn.calls.push("ai " + (on ? "on" : "off")) };
  const mods = {
    skyrimPlatform: { ObjectReference: { from: () => refr }, Game: { getFormEx: () => refr }, Actor: { from: () => actor }, MotionType: { Keyframed: 4 } },
    "../sync/appearance": { applyTints: (ac, a) => tinted.push(a) },
    "../sync/movement": {},
    "../extensions/objectReferenceEx": { ObjectReferenceEx: { dealWithRef() {} } },
  };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  let done; const finished = new Promise((r) => { done = r; });
  spawn.calls = []; spawn.mod = mod;
  if (spawn.atSpot) { mod.exports.gmSpawnedAtSpot.add(0xff000ac8); spawn.atSpot = false; }
  if (spawn.abandonBefore) { mod.exports.gmAbandonedSpawns.set(0xff000ac8, () => spawn.calls.push("unprotect")); spawn.abandonBefore = false; new mod.exports.SpawnProcess(appearance, [0, 0, 0], 0xff000ac8, () => spawn.calls.push("callback")); await new Promise((r) => setTimeout(r, 20)); return tinted; }
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
  assert.strictEqual(spawn.resurrected.length, 0, "a server NPC (no look) is alive already: no Resurrect (it rebuilt the body and some came out with their height locked, 2026-10-24)");
});

test("formView.ts: a beast look gets no full model refresh when it comes on screen, and its gear only 3 seconds after the spawn (both rebuilt the half-built werewolf graph)", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("const gmBeastLook = (!!model.appearance && !(Array.isArray(model.appearance.headpartIds) && model.appearance.headpartIds.length > 0)) || !!this.gmBeast;"));
  assert.ok(fv.includes("if (isOnScreen && !gmBeastLook) {"), "no redraw of a beast's tints");
  assert.ok(fv.includes("(!gmBeastLook || (!!this.gmBeast && !beastHeld(this.gmBeast, Date.now())))"), "a beast's gear waits until it has settled after its race switch");
  assert.ok(fv.includes("if (gmBeastLook && (this.animState.useAnimOverrides || beastHeld(this.gmBeast, Date.now()) || "), "no replayed or early animation for a fresh beast");
  assert.ok(fv.indexOf("const gmBeastLook") < fv.indexOf("applyAnimation(refr, model.animation"), "known before the animations");
  assert.ok(fv.includes('String(model.animation.animEventName || "").toLowerCase().startsWith("howl")'), "never a relayed howl on a beast");
  assert.ok(fv.includes("this.gmSpawnedBeast = gmBeastSpawn;"), "the spawn remembers a beast");
  assert.ok(fv.includes("const gmHoldStill = this.gmSpawnedBeast && beastHeld(this.gmBeast, Date.now());"), "a fresh beast is held still while it settles");
  assert.ok(/!gmHoldStill && \(\s*\+\(model\.numMovementChanges as number\)/.test(fv), "SkyMP's movement waits for it (the movement controller crashed the half-built graph)");
  const removal = fv.slice(fv.indexOf("if (refrId >= 0xff000000 && gmBeast) {"), fv.indexOf("if (refrId >= 0xff000000 && gmBeast) {") + 2400);
  assert.ok(/gone\.delete\(\);[\s\S]{0,120}unprotect\(\);\s*\}\);/.test(removal), "the world cleaner's protection is dropped only after the delete (a second delete by the cleaner crashed the watching game)");
  assert.ok(!/modWcProtection\(refrId, -1\);\s*return;/.test(removal), "not at once any more");
  assert.ok(fv.includes("if (gmBeastMove) { try { const gmAc = Actor.from(refr); if (gmAc) forcedWeapDrawn = gmAc.isWeaponDrawn(); }"), "a beast's NPC is never ordered to draw (ActionDraw played WerewolfDraw and crashed the watching game)");
  assert.ok(fv.indexOf("forcedWeapDrawn = gmAc.isWeaponDrawn()") < fv.indexOf("applyMovement(refr, model.movement"), "decided before the movement is applied");
  assert.ok(fv.includes("/^skympfake/i.test("), "nor given SkyMP's fake equip");
  assert.ok(/if \(refrId >= 0xff000000 && gmBeast\) \{[\s\S]{0,1500}refr\.disable\(false\)\.then\(\(\) => \{[\s\S]{0,120}gone\.delete\(\);[\s\S]{0,200}return;/.test(fv), "a beast NPC is disabled, then deleted, and given nothing after");
});

test("crash breadcrumbs: formView.ts writes a flushed line before each risky step on another NPC (spawn, remove, model refresh, gear, an idle or a beast animation)", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("writeLogs(\"greymarch-crumbs\""), "its own file, greymarch-crumbs-logs.txt");
  for (const step of ["gmCrumb(\"spawn \"", "gmCrumb(\"spawned \"", "gmCrumb(\"remove \"", "gmCrumb(\"model refresh \"", "gmCrumb(\"gear \"", "gmCrumb(\"anim \""]) assert.ok(fv.includes(step), step);
  assert.ok(fv.indexOf("gmCrumb(\"spawn \"") < fv.indexOf("spawnMethod.triggerSpawnProcess(refr"), "written BEFORE the spawn");
  assert.ok(fv.indexOf("gmCrumb(\"model refresh \"") < fv.indexOf("actor.queueNiNodeUpdate();"), "and before the refresh");
});

test("a spawn its FormView removed midway is never enabled: the spawn disables and deletes it itself, drops the protection after, and does not call back (the damageable 'clone' others saw)", async () => {
  spawn.abandonBefore = true;
  await spawn({ raceId: 0x13746, headpartIds: [1], tints: [] });
  assert.deepStrictEqual(spawn.calls.filter((c) => c !== "setPosition"), ["disable", "delete", "unprotect"]);
  assert.ok(!spawn.calls.includes("enable") && !spawn.calls.includes("callback"));
  await spawn({ raceId: 0x13746, headpartIds: [1], tints: [] });
  assert.ok(spawn.calls.includes("enable"), "the next spawn of the same id is normal again");
});

test("formView.ts: a removal during a spawn is handed to the spawn; a late spawn's callback does not touch the view", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("const gmMidSpawn = refrId >= 0xff000000 && this.gmSpawningId === refrId;"));
  assert.ok(fv.includes("gmAbandonedSpawns.set(refrId,"));
  assert.ok(fv.includes("if (this.gmSpawningId !== gmSpawnId) return;"));
});

test("formView.ts: a werewolf form switch is taken only once it has settled (4 s unchanged, the last switch settled), or at once with a new look; never once per click, and never a rebuild", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("const GM_WOLF_RACE_SETTLE_MS = 4000;"));
  assert.ok(fv.includes("if (gmWolfRace !== this.gmWolfRacePending) { this.gmWolfRacePending = gmWolfRace; this.gmWolfRacePendingAt = Date.now(); }"), "each new race restarts the wait");
  assert.ok(fv.includes("const gmBuildingAnyway = this.appearanceBasedBaseId === 0 || this.gmLookJustChanged;"), "with a new look (human to werewolf) the race goes in with that build or that switch");
  assert.ok(fv.includes("const gmSettled = Date.now() - this.gmWolfRacePendingAt >= GM_WOLF_RACE_SETTLE_MS && !(this.gmSpawnedBeast && beastHeld(this.gmBeast, Date.now()));"), "otherwise only when settled");
  const block = fv.slice(fv.indexOf("if (gmWolfRace !== this.gmWolfRace) {"), fv.indexOf("} else this.gmWolfRacePending = gmWolfRace;"));
  assert.ok(/if \(gmBuildingAnyway \|\| gmSettled\) \{[\s\S]*this\.gmWolfRace = gmWolfRace;/.test(block), "the new race is behind the settle rule");
  assert.strictEqual((block.match(/appearanceBasedBaseId = 0/g) || []).length, 0, "and the NPC is never rebuilt for it (the stand-in is switched with SetRace)");
});

test("no AI switching for anyone (a beast with its AI off never started its animations, T-posed, and crashed the watching game when it came back on, 2026-10-22 13:26)", async () => {
  await spawn({ raceId: 0xcdd84, headpartIds: [], tints: [] });
  assert.ok(!spawn.calls.some((c) => c.startsWith("ai ")), "a beast: no AI change");
  await spawn({ raceId: 0x13746, headpartIds: [1], tints: [] });
  assert.ok(!spawn.calls.some((c) => c.startsWith("ai ")), "a person: no AI change");
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(!fv.includes("enableAI("), "formView.ts switches no AI");
});

test("an actor made at its spot (a beast look, formView.ts) is not moved before it is enabled; everything else still is", async () => {
  spawn.atSpot = true;
  await spawn({ raceId: 0xcdd84, headpartIds: [], tints: [] });
  assert.ok(!spawn.calls.includes("setPosition"), "at its spot: no setPosition, so the engine's tweener has no move to ease");
  assert.ok(spawn.calls.includes("enable"));
  assert.strictEqual(spawn.mod.exports.gmSpawnedAtSpot.size, 0, "the mark is used once");
  await spawn({ raceId: 0xcdd84, headpartIds: [], tints: [] });
  assert.ok(spawn.calls.indexOf("setPosition") >= 0 && spawn.calls.indexOf("setPosition") < spawn.calls.indexOf("enable"), "not made at its spot: moved first, as before");
});

test("formView.ts makes a beast look at its spot (the hidden marker) and falls back to the player", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("const gmBeastLookNow = !!model.appearance && !(Array.isArray(model.appearance.headpartIds) && model.appearance.headpartIds.length > 0);"));
  assert.ok(fv.includes("if (gmBeastLookNow) {") && fv.includes("if (atSpot) { gmSpawnedAtSpot.add(atSpot.getFormID());"), "marked for spawnProcess.ts");
  const i = fv.indexOf("if (gmBeastLookNow) {"), j = fv.indexOf("return player.placeAtMe(", i);
  assert.ok(i > 0 && j > i, "the player is still the fallback");
});

test("no look (SkyMP's own NPCs) is spawned as before", async () => {
  assert.deepStrictEqual(await spawn(null), []);
});

// "Players cloning" (2026-10-27, live): a person's Resurrect is latent, and a FormView that let go of the spawn while it ran (a second look change in a row) left the
// resurrected actor standing with no gear and no floating ID. The spawn looks at the mark once more when it ends.
async function spawnLetGoDuringResurrect(appearance, opts = {}) {
  const calls = [];
  const refr = { getFormID: () => 0xff000ac9, setPosition: () => Promise.resolve(), enable: () => { calls.push("enable"); return Promise.resolve(); }, disable: () => { calls.push("disable"); return Promise.resolve(); }, delete: () => calls.push("delete"), getBaseObject: () => ({}), setMotionType: () => { calls.push("keyframed"); if (opts.letGo) opts.letGo(); return Promise.resolve(); } };
  let mod;
  const actor = { resurrect: () => { calls.push("resurrect"); if (opts.letGo) opts.letGo(); return Promise.resolve(); } };
  const mods = {
    skyrimPlatform: { ObjectReference: { from: () => refr }, Game: { getFormEx: () => refr }, Actor: { from: () => (opts.notActor ? null : actor) }, MotionType: { Keyframed: 4 } },
    "../sync/appearance": { applyTints() {} },
    "../sync/movement": {},
    "../extensions/objectReferenceEx": { ObjectReferenceEx: { dealWithRef() {} } },
  };
  mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  if (opts.markDuringLastStep) opts.letGo = () => mod.exports.gmAbandonedSpawns.set(0xff000ac9, () => calls.push("unprotect"));
  new mod.exports.SpawnProcess(appearance, [0, 0, 0], 0xff000ac9, () => calls.push("callback"));
  await new Promise((r) => setTimeout(r, 20));
  return { calls, left: mod.exports.gmAbandonedSpawns.size };
}

test("a person's spawn its FormView let go of DURING the Resurrect is removed when the Resurrect ends, not handed back (the untagged, gearless 'Stranger' copy)", async () => {
  const { calls, left } = await spawnLetGoDuringResurrect({ raceId: 0x13746, headpartIds: [1], tints: [] }, { markDuringLastStep: true });
  assert.deepStrictEqual(calls, ["enable", "resurrect", "disable", "delete", "unprotect"]);
  assert.strictEqual(left, 0, "the mark is used up");
});

test("the same for a non-actor reference let go of while it is made keyframed", async () => {
  const { calls } = await spawnLetGoDuringResurrect(null, { markDuringLastStep: true, notActor: true });
  assert.deepStrictEqual(calls, ["enable", "keyframed", "disable", "delete", "unprotect"]);
});

test("a spawn nobody let go of still ends in its callback, and is not removed", async () => {
  const { calls } = await spawnLetGoDuringResurrect({ raceId: 0x13746, headpartIds: [1], tints: [] });
  assert.deepStrictEqual(calls, ["enable", "resurrect", "callback"]);
});
