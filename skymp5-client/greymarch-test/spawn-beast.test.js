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
  const refr = { getFormID: () => 0xff000ac8, setPosition: () => Promise.resolve(), enable: () => { (spawn.calls || (spawn.calls = [])).push("enable"); return Promise.resolve(); }, disable: () => { spawn.calls.push("disable"); return Promise.resolve(); }, delete: () => spawn.calls.push("delete"), getBaseObject: () => ({}) , setMotionType: () => Promise.resolve() };
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
  assert.strictEqual(spawn.resurrected.length, 1, "SkyMP's own NPCs as before");
});

test("formView.ts: a beast look gets no full model refresh when it comes on screen, and its gear only 3 seconds after the spawn (both rebuilt the half-built werewolf graph)", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("const gmBeastLook = !!model.appearance && !(Array.isArray(model.appearance.headpartIds) && model.appearance.headpartIds.length > 0);"));
  assert.ok(fv.includes("if (isOnScreen && !gmBeastLook) {"), "no redraw of a beast's tints");
  assert.ok(fv.includes("const GM_BEAST_SETTLE_MS = 6000;"), "a fresh beast is left alone for 6 seconds (3 until 2026-10-22)");
  assert.ok(fv.includes("(!gmBeastLook || Date.now() - this.spawnMoment > GM_BEAST_SETTLE_MS)"), "a beast's gear waits for its graph");
  assert.ok(fv.includes("if (gmBeastLook && (this.animState.useAnimOverrides || Date.now() - this.spawnMoment < GM_BEAST_SETTLE_MS || "), "no replayed or early animation for a fresh beast");
  assert.ok(fv.indexOf("const gmBeastLook") < fv.indexOf("applyAnimation(refr, model.animation"), "known before the animations");
  assert.ok(fv.includes('String(model.animation.animEventName || "").toLowerCase().startsWith("howl")'), "never a relayed howl on a beast");
  assert.ok(fv.includes("this.gmSpawnedBeast = gmBeastSpawn;"), "the spawn remembers a beast");
  assert.ok(fv.includes("const gmHoldStill = this.gmSpawnedBeast && Date.now() - this.spawnMoment < GM_BEAST_SETTLE_MS;"), "a fresh beast is held still while it settles");
  assert.ok(/!gmHoldStill && \(\s*\+\(model\.numMovementChanges as number\)/.test(fv), "SkyMP's movement waits for it (the movement controller crashed the half-built graph)");
  const removal = fv.slice(fv.indexOf("if (refrId >= 0xff000000 && gmBeast) {"), fv.indexOf("if (refrId >= 0xff000000 && gmBeast) {") + 1400);
  assert.ok(/gone\.delete\(\);[\s\S]{0,120}unprotect\(\);\s*\}\);/.test(removal), "the world cleaner's protection is dropped only after the delete (a second delete by the cleaner crashed the watching game)");
  assert.ok(!/modWcProtection\(refrId, -1\);\s*return;/.test(removal), "not at once any more");
  assert.ok(fv.includes("if (gmBeastMove) { try { const gmAc = Actor.from(refr); if (gmAc) forcedWeapDrawn = gmAc.isWeaponDrawn(); }"), "a beast's NPC is never ordered to draw (ActionDraw played WerewolfDraw and crashed the watching game)");
  assert.ok(fv.indexOf("forcedWeapDrawn = gmAc.isWeaponDrawn()") < fv.indexOf("applyMovement(refr, model.movement"), "decided before the movement is applied");
  assert.ok(fv.includes("/^skympfake/i.test("), "nor given SkyMP's fake equip");
  assert.ok(/if \(refrId >= 0xff000000 && gmBeast\) \{[\s\S]{0,900}refr\.disable\(false\)\.then\(\(\) => \{[\s\S]{0,120}gone\.delete\(\);[\s\S]{0,200}return;/.test(fv), "a beast NPC is disabled, then deleted, and given nothing after");
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
  assert.deepStrictEqual(spawn.calls, ["disable", "delete", "unprotect"]);
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

test("formView.ts: a werewolf form switch rebuilds the NPC only once it has settled (4 s unchanged, the last build settled), or at once with a new look; never once per click", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("const GM_WOLF_RACE_SETTLE_MS = 4000;"));
  assert.ok(fv.includes("if (gmWolfRace !== this.gmWolfRacePending) { this.gmWolfRacePending = gmWolfRace; this.gmWolfRacePendingAt = Date.now(); }"), "each new race restarts the wait");
  assert.ok(fv.includes("const gmBuildingAnyway = this.appearanceBasedBaseId === 0;"), "with a new look (human to werewolf) the race goes in with that build");
  assert.ok(fv.includes("const gmSettled = Date.now() - this.gmWolfRacePendingAt >= GM_WOLF_RACE_SETTLE_MS && !(this.gmSpawnedBeast && Date.now() - this.spawnMoment < GM_BEAST_SETTLE_MS);"), "otherwise only when settled");
  const block = fv.slice(fv.indexOf("if (gmWolfRace !== this.gmWolfRace) {"), fv.indexOf("} else this.gmWolfRacePending = gmWolfRace;"));
  assert.ok(/if \(gmBuildingAnyway \|\| gmSettled\) \{[\s\S]*this\.appearanceBasedBaseId = 0;/.test(block), "the rebuild is behind the settle rule");
  assert.strictEqual((block.match(/appearanceBasedBaseId = 0/g) || []).length, 1, "no other rebuild in the block");
});

test("a beast look is enabled with its AI off (the engine's movement update asked the loading werewolf graph for clips and crashed the watching game); a person's look keeps its AI", async () => {
  await spawn({ raceId: 0xcdd84, headpartIds: [], tints: [] });
  assert.deepStrictEqual(spawn.calls.filter((c) => c === "ai off" || c === "enable"), ["ai off", "enable"], "AI off before it is enabled");
  await spawn({ raceId: 0x13746, headpartIds: [1], tints: [] });
  assert.ok(!spawn.calls.some((c) => c.startsWith("ai ")), "a person: no AI change");
});

test("formView.ts turns a fresh beast's AI back on once it has settled, and not before", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("this.gmBeastAiOff = gmBeastSpawn;"), "marked when the beast is spawned");
  assert.ok(fv.includes("if (!gmHoldStill && this.gmBeastAiOff) {"), "only when the hold (GM_BEAST_SETTLE_MS) is over");
  assert.ok(fv.includes("gmAc.enableAI(true)"));
  assert.ok(fv.includes("if (gmHoldStill && this.gmBeastAiOff) {") && fv.includes("if (gmHeld && gmHeld.isAIEnabled()) { gmHeld.enableAI(false);"), "while held, AI found on is switched off every frame (and the crumbs say so)");
});

test("no look (SkyMP's own NPCs) is spawned as before", async () => {
  assert.deepStrictEqual(await spawn(null), []);
});
