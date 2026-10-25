"use strict";
// The aim a cast goes out with (spellAim.ts, magicSyncService.ts). Facing a wall in third person, the game's aim offsets swing round to
// behind and above the player; other games replayed the cast from them, so watchers saw frost spells and Ice Prism leave backwards and
// upwards. An aim further than 35 degrees from where the player looks is now sent as that look direction; a normal aim is untouched.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, mods) {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", file), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  return mod.exports;
}

const aim = load("spellAim.ts", {});
const DEG = Math.PI / 180;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-5, `${msg}: ${a} vs ${b}`);

// 19 floats as SkyrimPlatform sends them (bytes), with the aim offsets at 13 / 14 and the magic arm offsets at 17 / 18
function floatBytes(values) {
  const f = new Float32Array(19);
  for (const [i, v] of Object.entries(values)) f[i] = v;
  return Array.from(new Uint8Array(f.buffer));
}
const readFloats = (bytes) => new Float32Array(new Uint8Array(bytes).buffer);

test("an aim close to where the player looks is kept as the game gave it", () => {
  const r = aim.sanitizeAim(0.1, 1.2, 0.05, 1.0);
  assert.deepStrictEqual(r, { aimAngle: 0.1, aimHeading: 1.2, fixed: false });
});

test("an aim pointing behind the player (facing a wall) is replaced by their look direction", () => {
  const r = aim.sanitizeAim(-1.3, 1.0 + Math.PI, 0.05, 1.0);
  assert.strictEqual(r.fixed, true);
  close(r.aimAngle, 0.05, "pitch");
  close(r.aimHeading, 1.0, "heading");
});

test("a steep upward aim is replaced even when the heading is right", () => {
  const r = aim.sanitizeAim(-70 * DEG, 1.0, 0, 1.0);
  assert.strictEqual(r.fixed, true);
  close(r.aimAngle, 0, "pitch");
});

test("headings either side of north are compared the short way round", () => {
  const r = aim.sanitizeAim(0, 2 * Math.PI - 5 * DEG, 0, 5 * DEG);
  assert.strictEqual(r.fixed, false, "355 and 5 degrees are 10 degrees apart");
});

test("a missing aim (NaN) falls back to the look direction", () => {
  const r = aim.sanitizeAim(NaN, NaN, 0.2, 2.0);
  assert.deepStrictEqual(r, { aimAngle: 0.2, aimHeading: 2.0, fixed: true });
});

test("animation variables: normal aim offsets go out unchanged (the very same bytes)", () => {
  const bytes = floatBytes({ 13: -0.1, 14: 0.2, 17: 0.3, 18: 0.1 });
  const r = aim.sanitizeAimFloats(bytes, 0.1);
  assert.strictEqual(r.fixed, false);
  assert.strictEqual(r.bytes, bytes);
});

test("animation variables: aim offsets swung round behind are reset to straight ahead at the look pitch, magic arm offsets to neutral", () => {
  const bytes = floatBytes({ 0: 7, 13: 1.2, 14: 2.8, 17: 1.5, 18: -0.9, 8: 4 });
  const r = aim.sanitizeAimFloats(bytes, 0.25);
  assert.strictEqual(r.fixed, true);
  close(r.pitch, 1.2, "the game's pitch is reported");
  const f = readFloats(r.bytes);
  close(f[13], -0.25, "AimPitchCurrent = -look pitch");
  close(f[14], 0, "AimHeadingCurrent");
  close(f[17], 0, "MagicAimOffsetHeading");
  close(f[18], 0, "MagicAimOffsetPitch");
  close(f[0], 7, "other floats untouched");
  close(f[8], 4, "Pitch untouched");
});

test("animation variables: too few floats (an unknown layout) are left alone", () => {
  const bytes = [0, 0, 0, 0];
  assert.strictEqual(aim.sanitizeAimFloats(bytes, 0).bytes, bytes);
});

test("look direction from Papyrus degrees", () => {
  const l = aim.lookFromAngles(-10, 90);
  close(l.lookPitch, -10 * DEG, "pitch");
  close(l.bodyHeading, Math.PI / 2, "heading");
});

// through magicSyncService: what actually goes out with a cast
function make(floats) {
  const handlers = {}, sent = [], logs = [];
  const player = {
    angleX: 5, angleZ: 90,
    getFormID: () => 0x14,
    getAngleX() { return this.angleX; },
    getAngleZ() { return this.angleZ; },
    getAnimationVariableBool: () => false,
    getEquippedSpell: () => null,
    getEquippedItemType: () => 0,
  };
  const npc = { getFormID: () => 0xff000500, getAngleX: () => 0, getAngleZ: () => 0 };
  const FIREBOLT = 0x12fd0;
  const effect = { getCastingType: () => 1, getExplosion: () => null };
  const spellForm = { getFormID: () => FIREBOLT, getNumEffects: () => 1, getNthEffectMagicEffect: () => effect };
  const skyrimPlatform = {
    Actor: { from: (f) => f },
    Game: { getPlayer: () => player, getFormEx: (id) => (id === 0x14 ? player : spellForm) },
    getAnimationVariablesFromActor: () => ({ booleans: new ArrayBuffer(1), floats: new Uint8Array(floats).buffer, integers: new ArrayBuffer(1) }),
    SpellType: { Left: 0, Right: 1, Voise: 2, Instant: 3 },
    SlotType: { Left: 0, Right: 1 },
    EquippedItemType: { Staff: 8 },
  };
  const controller = {
    on: (n, f) => { handlers[n] = f; },
    once: () => {},
    emitter: { emit: (n, e) => { if (n === "sendMessage" && e.message.t === 23) sent.push(e.message.data); if (n === "greymarchStage") logs.push(e); } },
  };
  const sp = { hooks: { sendAnimationEvent: { add: () => {} } }, Spell: { from: (f) => f } };
  const mods = {
    skyrimPlatform,
    "./spellAim": aim,
    "./clientListener": { ClientListener: class {} },
    "../../logging": { logTrace() {} },
    "../../messages": { MsgType: { SpellCast: 23, UpdateAnimVariables: 24 } },
    "../../view/worldViewMisc": { localIdToRemoteId: (id) => id, remoteIdToLocalId: (id) => id },
  };
  const { MagicSyncService } = load("magicSyncService.ts", mods);
  new MagicSyncService(sp, controller);
  const cast = (caster, aimAngle, aimHeading) => handlers.spellCast({ caster, target: null, spell: spellForm, castingSource: 1, isDualCasting: false, aimAngle, aimHeading });
  return { player, npc, sent, logs, cast };
}

test("cast facing a wall: the angles and the aim variables go out pointing where the player looks", () => {
  const g = make(floatBytes({ 13: 1.3, 14: 3.0, 17: 1.0 }));
  g.cast(g.player, -1.3, 90 * DEG + Math.PI);
  const m = g.sent[0];
  close(m.aimAngle, 5 * DEG, "aimAngle = look pitch");
  close(m.aimHeading, 90 * DEG, "aimHeading = heading");
  const f = readFloats(m.actorAnimationVariables.floats);
  close(f[13], -5 * DEG, "AimPitchCurrent");
  close(f[14], 0, "AimHeadingCurrent");
  close(f[17], 0, "MagicAimOffsetHeading");
  assert.ok(g.logs.some((l) => /^magic: aim of 12fd0 replaced: game -1\.30\/4\.71, look 0\.09\/1\.57 \(rad\)$/.test(l)), g.logs.join("\n"));
  assert.ok(g.logs.some((l) => /^magic: aim variables replaced: game pitch 1\.30 heading 3\.00/.test(l)));
});

test("a normal cast goes out exactly as the game reported it", () => {
  const bytes = floatBytes({ 13: -0.05, 14: 0.1 });
  const g = make(bytes);
  g.cast(g.player, 0.08, 90 * DEG - 0.1);
  close(g.sent[0].aimAngle, 0.08, "aimAngle");
  close(g.sent[0].aimHeading, 90 * DEG - 0.1, "aimHeading");
  assert.deepStrictEqual(g.sent[0].actorAnimationVariables.floats, bytes);
  assert.ok(!g.logs.some((l) => /aim/.test(l)));
});

test("an NPC this game runs keeps its own aim (only the player's crosshair aim goes wrong)", () => {
  const g = make(floatBytes({ 13: 1.3, 14: 3.0 }));
  g.cast(g.npc, -1.3, Math.PI);
  close(g.sent[0].aimAngle, -1.3, "aimAngle");
  close(g.sent[0].aimHeading, Math.PI, "aimHeading");
});

test("the aim lines in the server log stop after five", () => {
  const g = make(floatBytes({ 13: 1.3, 14: 3.0 }));
  for (let i = 0; i < 10; i++) g.cast(g.player, -1.3, 0);
  assert.strictEqual(g.logs.filter((l) => /aim/.test(l)).length, 5);
});

test("aim lines still reach the log after the 40 cast lines are used up", () => {
  const bytes = floatBytes({ 13: -0.05, 14: 0.1 });
  const g = make(bytes);
  for (let i = 0; i < 45; i++) g.cast(g.player, 0.08, 90 * DEG); // normal casts use up the cast lines
  assert.ok(!g.logs.some((l) => /aim/.test(l)));
  g.cast(g.player, -1.3, 0);
  assert.ok(g.logs.some((l) => /^magic: aim of 12fd0 replaced/.test(l)), "the aim line is still written");
});
