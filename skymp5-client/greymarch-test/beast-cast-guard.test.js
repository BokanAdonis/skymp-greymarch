"use strict";
// remoteServer.ts greymarchIsBeastCopy (2026-10-23): another player's spell casts and animation variables are never replayed onto this game's copy of
// them while that copy is a werewolf, a werebear or a creature form. Replayed, they wrote the caster's graph variables into the werewolf graph: a watching
// game crashed in the voice-cast step (2026-10-22 17:28) and the moment a werewolf roared (2026-10-23 17:02; R casts the howl voice in the roarer's game).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const remote = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "remoteServer.ts"), "utf8");
const a = remote.indexOf("  private greymarchIsBeastCopy(");
const b = remote.indexOf("  private greymarchWerebearRace = -1;");
const method = remote.slice(a, b);

const BEAR = 0x0401e17b, WOLF = 0xcdd84, NORD = 0x13746, ELDER = 0xfe000875;
function guard(forms, wolfRaceMap) {
  const switchSrc = fs.readFileSync(path.join(__dirname, "..", "src", "view", "beastSwitch.ts"), "utf8");
  const sw = { exports: {} };
  new Function("require", "exports", "module", ts.transpileModule(switchSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText)(() => ({}), sw.exports, sw);
  const src = "class G { constructor(forms) { this.forms = forms; this.greymarchWerebearRace = -1; } getWorldModel() { return { forms: this.forms }; }\n" + method.replace("private ", "") + "\n}\nmodule.exports = G;";
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  const Game = { getFormFromFile: (id, file) => (id === 0x1e17b && file === "Dragonborn.esm" ? { getFormID: () => BEAR } : null) };
  const g = Function("return this")(); g.__gmWolfRace = wolfRaceMap || {};
  new Function("require", "exports", "module", "Game", "isWereRace", js)(() => ({}), mod.exports, mod, Game, sw.exports.isWereRace);
  return new mod.exports(forms);
}
const actor = (race) => ({ getRace: () => (race ? { getFormID: () => race } : null) });
const person = { refrId: 0xff000023, appearance: { raceId: NORD, headpartIds: [1, 2] } };
const beast = { refrId: 0xff000023, appearance: { raceId: WOLF, headpartIds: [] } };

test("a copy whose race is a were-race is a beast: the werewolf, the werebear, a form's race", () => {
  const g = guard([person], { 1: ELDER });
  assert.strictEqual(g.greymarchIsBeastCopy(0xff000023, actor(WOLF)), true);
  assert.strictEqual(g.greymarchIsBeastCopy(0xff000023, actor(BEAR)), true);
  assert.strictEqual(g.greymarchIsBeastCopy(0xff000023, actor(ELDER)), true, "a form's race (the Elder Alpha)");
});

test("a copy still a person stand-in (race Nord) whose server look is a beast look is a beast too; a person is not", () => {
  assert.strictEqual(guard([beast]).greymarchIsBeastCopy(0xff000023, actor(NORD)), true, "the stand-in: the look has no head parts");
  assert.strictEqual(guard([person]).greymarchIsBeastCopy(0xff000023, actor(NORD)), false, "a person: casts are replayed as before");
  assert.strictEqual(guard([]).greymarchIsBeastCopy(0xff000099, actor(NORD)), false, "not in the world model: as before");
});

test("remoteServer.ts asks it before replaying a cast or its end, and before copying animation variables", () => {
  const i = remote.indexOf("private onSpellCastMessage(");
  const guardAt = remote.indexOf("if (this.greymarchIsBeastCopy(msg.data.caster, ac)) {", i);
  assert.ok(guardAt > i && guardAt < remote.indexOf("if (msg.data.interruptCast) {", i), "before both the end (interruptCast) and the cast (castSpellImmediate)");
  const j = remote.indexOf("private onUpdateAnimVariablesMessage(");
  const vars = remote.indexOf("if (this.greymarchIsBeastCopy(msg.data.actorRemoteId, ac)) return;", j);
  assert.ok(vars > j && vars < remote.indexOf("applyAnimationVariablesToActor(ac.getFormID()", j), "before the variables are applied");
});
