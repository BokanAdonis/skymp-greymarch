"use strict";
// A BEAST IS NEVER BUILT AS A BEAST (src/view/beastSwitch.ts, 2026-10-23): a beast look's NPC on a watching game is a hidden person stand-in that the engine
// switches to the beast's race (SetRace), then shows; a form switch is another SetRace; it is held after every switch.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "view", "beastSwitch.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const mod = { exports: {} };
new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
const B = mod.exports;
const WOLF = 0xcdd84, ALPHA = 0xfe000804, ELDER = 0xfe000875;

test("a fresh stand-in waits for its 3D (1 s), is switched to the beast's race once, shown 1.5 s later, and held for 6 s after the switch", () => {
  const st = B.beastSpawned(1000);
  assert.strictEqual(st.raceApplied, B.GM_STANDIN_RACE);
  assert.ok(B.beastHeld(st, 1000), "held from the start");
  assert.deepStrictEqual(B.beastSwitchStep(st, 1500, ELDER, true), {}, "not before 1 s");
  assert.deepStrictEqual(B.beastSwitchStep(st, 2500, ELDER, false), {}, "not while its 3D is not in");
  assert.deepStrictEqual(B.beastSwitchStep(st, 2600, ELDER, true), { setRace: ELDER, first: true }, "switched once its 3D is in");
  assert.deepStrictEqual(B.beastSwitchStep(st, 2700, ELDER, true), {}, "only once");
  assert.ok(B.beastHeld(st, 2600 + B.GM_BEAST_SETTLE_MS - 1), "held for 6 s after the switch");
  assert.ok(!B.beastHeld(st, 2600 + B.GM_BEAST_SETTLE_MS));
  assert.deepStrictEqual(B.beastSwitchStep(st, 4000, ELDER, true), {}, "not shown before 1.5 s");
  assert.deepStrictEqual(B.beastSwitchStep(st, 4100, ELDER, true), { show: true }, "shown 1.5 s after the switch");
  assert.deepStrictEqual(B.beastSwitchStep(st, 4200, ELDER, true), {}, "shown once");
});

test("a stand-in whose 3D never reports loaded is switched anyway after 10 s (it must not stay a hidden person)", () => {
  const st = B.beastSpawned(0);
  assert.deepStrictEqual(B.beastSwitchStep(st, 9999, WOLF, false), {});
  assert.deepStrictEqual(B.beastSwitchStep(st, 10000, WOLF, false), { setRace: WOLF, first: true });
});

test("a form switch is another SetRace on the same NPC, only once the last switch has settled; no switch without a race", () => {
  const st = B.beastSpawned(0);
  B.beastSwitchStep(st, 1000, WOLF, true); // the first switch at 1 s
  assert.deepStrictEqual(B.beastSwitchStep(st, 3000, ALPHA, true), { show: true }, "a new form waits while the first switch settles (only the reveal happens)");
  assert.deepStrictEqual(B.beastSwitchStep(st, 1000 + B.GM_BEAST_SETTLE_MS, ALPHA, true), { setRace: ALPHA, first: false }, "then switched");
  assert.ok(B.beastHeld(st, 1000 + B.GM_BEAST_SETTLE_MS + 100), "held again after the form switch");
  assert.deepStrictEqual(B.beastSwitchStep(st, 30000, ALPHA, true), {}, "the same race: nothing");
  const none = B.beastSpawned(0);
  assert.deepStrictEqual(B.beastSwitchStep(none, 5000, 0, true), {}, "no wanted race: the stand-in waits");
  assert.ok(!B.beastHeld(null, 0), "no beast: not held");
});

test("formView.ts builds a beast look as the stand-in, hides it, switches it with SetRace from beastSwitchStep and shows it; a form switch is not a rebuild", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("const gmLook = gmWereLook(gmAp, this.gmWolfRace) ? { ...gmAp, raceId: GM_STANDIN_RACE } : gmAp;"), "the base of a werewolf or werebear look is a person stand-in");
  assert.ok(fv.includes("this.gmBeast = gmWere ? beastSpawned(Date.now()) : null;"), "only a were-race gets the switch");
  assert.ok(fv.includes("if (gmWere) {") && fv.includes("gmSi.setAlpha(0, false)"), "spawned hidden");
  assert.ok(fv.includes("beastSwitchStep(this.gmBeast, Date.now(), gmWanted, gmLoaded)") && fv.includes("gmSwAc.setRace(gmRace)"), "the engine switches its race");
  assert.ok(fv.includes("gmSwAc.setAlpha(1, false)"), "then it is shown");
  assert.ok(fv.includes("const gmHoldStill = this.gmSpawnedBeast && beastHeld(this.gmBeast, Date.now());"), "held while it settles");
  const block = fv.slice(fv.indexOf("if (gmWolfRace !== this.gmWolfRace) {"), fv.indexOf("} else this.gmWolfRacePending = gmWolfRace;"));
  assert.ok(block.length > 0 && !/appearanceBasedBaseId = 0/.test(block), "a form switch does not rebuild the NPC");
  assert.ok(!fv.includes("{ ...this.appearanceState.appearance, raceId: this.gmWolfRace }"), "the variant's race is not built in any more");
});

test("only the were-races take the stand-in path: the werewolf, the werebear (its id in this load order) and the forms' races; a creature form does not", () => {
  const BEAR = 0x0401e17b, POLAR = 0xfe000861, HORKER = 0x13200;
  assert.ok(B.isWereRace(WOLF, BEAR, []), "the vanilla werewolf");
  assert.ok(B.isWereRace(BEAR, BEAR, []), "the werebear");
  assert.ok(B.isWereRace(POLAR, BEAR, [ALPHA, POLAR]), "a form's race");
  assert.ok(!B.isWereRace(HORKER, BEAR, [ALPHA, POLAR]), "a creature form is built as before");
  assert.ok(!B.isWereRace(0, BEAR, []) && !B.isWereRace(BEAR, 0, []), "no race, or no werebear in this load order");
});
