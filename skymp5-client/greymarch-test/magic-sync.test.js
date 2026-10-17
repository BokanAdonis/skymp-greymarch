"use strict";
// The end of a spell cast (magicSyncService.ts): sent on the "equipped" animation event or when the hand holds another spell, never just
// because an "is casting" animation variable went off (that version stopped every cast in other players' games at once). The variables and
// the animation events a cast goes through are reported to the server log with the end.
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

const FLAMES = 0x12fcd, FIREBOLT = 0x12fd0, FIREBALL = 0x1c789, FIREBALL_BLAST = 0x1cea3, PLAYER_REMOTE = 0xff000013;
// castingType 2 = concentration (held), 1 = fire and forget
const SPELLS = { [FLAMES]: { type: 2 }, [FIREBOLT]: { type: 1 }, [FIREBALL]: { type: 1, explosion: FIREBALL_BLAST } };

function make() {
  const handlers = {}, onceUpdate = [], sent = [], logs = [];
  let animHook = null, now = 1000;
  const player = {
    vars: { IsCastingLeft: false, IsCastingRight: false, IsCastingDual: false },
    hands: { 0: null, 1: FLAMES },
    getFormID: () => 0x14,
    getAnimationVariableBool(n) { return !!this.vars[n]; },
    getEquippedSpell(slot) { const id = this.hands[slot]; return id ? { getFormID: () => id } : null; },
    getEquippedItemType: () => 0,
  };
  const skyrimPlatform = {
    Actor: { from: (f) => f },
    Game: { getPlayer: () => player, getFormEx: (id) => (id === 0x14 ? player : spellForm(id)) },
    getAnimationVariablesFromActor: () => ({ booleans: new ArrayBuffer(1), floats: new ArrayBuffer(1), integers: new ArrayBuffer(1) }),
    SpellType: { Left: 0, Right: 1, Voise: 2, Instant: 3 },
    SlotType: { Left: 0, Right: 1 },
    EquippedItemType: { Staff: 8 },
  };
  const controller = {
    on: (n, f) => { handlers[n] = f; },
    once: (n, f) => { if (n === "update") onceUpdate.push(f); },
    emitter: { emit: (n, e) => { if (n === "sendMessage" && e.message.t === 23) sent.push(e.message.data); if (n === "greymarchStage") logs.push(e); } },
  };
  const spellForm = (id) => {
    const d = SPELLS[id];
    if (!d) return null;
    const effect = { getCastingType: () => d.type, getExplosion: () => (d.explosion ? { getFormID: () => d.explosion } : null) };
    return { getFormID: () => id, getNumEffects: () => 1, getNthEffectMagicEffect: (i) => (i === 0 ? effect : null) };
  };
  const sp = { hooks: { sendAnimationEvent: { add: (h) => { animHook = h; } } }, Spell: { from: (f) => f } };
  const mods = {
    skyrimPlatform,
    "./clientListener": { ClientListener: class {} },
    "../../logging": { logTrace() {} },
    "../../messages": { MsgType: { SpellCast: 23, UpdateAnimVariables: 24 } },
    "../../view/worldViewMisc": { localIdToRemoteId: (id) => (id === 0x14 ? PLAYER_REMOTE : id), remoteIdToLocalId: (id) => (id === PLAYER_REMOTE ? 0 : id) }, // as in the game: the player's own server id does not map back to 0x14
  };
  const realNow = Date.now;
  Date.now = () => now;
  const { MagicSyncService } = load("magicSyncService.ts", mods);
  const service = new MagicSyncService(sp, controller);
  const frame = (ms = 16) => { now += ms; handlers.update(); onceUpdate.splice(0).forEach((f) => f()); };
  const cast = (spell, castingSource = 1) => handlers.spellCast({ caster: player, target: null, spell: { getFormID: () => spell }, castingSource, isDualCasting: false, aimAngle: 0, aimHeading: 0 });
  const animEvent = (animEventName) => animHook.leave({ animEventName, animationSucceeded: true });
  return { player, service, sent, logs, frame, cast, animEvent, done: () => { Date.now = realNow; } };
}

test("Flames: the cast keeps going while the casting variables flicker; the equipped animation event ends it once", () => {
  const g = make();
  g.player.vars.IsCastingRight = true;
  g.cast(FLAMES);
  g.animEvent("MRh_SpellAimedConcentrationStart");
  for (let i = 0; i < 30; i++) g.frame();
  g.player.vars.IsCastingRight = false; // a variable going off is NOT the end
  for (let i = 0; i < 120; i++) g.frame(); // two more seconds of fire
  assert.ok(g.sent.every((m) => m.interruptCast === false), "no end while held");
  assert.strictEqual(g.sent.length, 1 + 2, "the cast and a reminder every second (2.4 s held)");
  g.animEvent("MRh_Equipped_Event");
  g.frame();
  assert.strictEqual(g.sent[g.sent.length - 1].interruptCast, true);
  assert.strictEqual(g.sent[g.sent.length - 1].spell, FLAMES);
  assert.strictEqual(g.sent[0].interruptCast, false, "the cast message itself is not changed");
  const n = g.sent.length;
  g.animEvent("MRh_Equipped_Event");
  for (let i = 0; i < 120; i++) g.frame();
  assert.strictEqual(g.sent.length, n, "the end goes out once, and no reminder after it");
  assert.match(g.logs[0], /^magic: cast 12fcd hand 1 by ff000013$/);
  assert.match(g.logs[1], /^magic: end 12fcd hand 1 after \d+ ms \(MRh_Equipped_Event\); repeats 0; IsCastingRight on@16 off@496/);
  assert.match(g.logs[1], /events MRh_SpellAimedConcentrationStart@0 MRh_Equipped_Event@/);
  g.done();
});

test("a held spell is repeated every second while held, with the same spell and hand", () => {
  const g = make();
  g.cast(FLAMES);
  for (let i = 0; i < 64; i++) g.frame(); // 1.02 s
  assert.deepStrictEqual(g.sent.map((m) => [m.spell, m.castingSource, m.interruptCast]), [[FLAMES, 1, false], [FLAMES, 1, false]]);
  g.done();
});

test("a fire-and-forget spell is sent once and gets no end and no reminder", () => {
  const g = make();
  g.player.hands[1] = FIREBOLT;
  g.cast(FIREBOLT);
  g.animEvent("MRh_Equipped_Event");
  for (let i = 0; i < 200; i++) g.frame();
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false]);
  assert.match(g.logs[0], /\(fire and forget\)$/);
  g.done();
});

test("an explosion is matched to the recent cast whose effect explodes into it, only for 5 s and only for that caster", () => {
  const g = make();
  g.player.hands[1] = FIREBALL;
  g.cast(FIREBALL);
  assert.strictEqual(g.service.findSpellForExplosion(0x14, FIREBALL_BLAST), FIREBALL);
  assert.strictEqual(g.service.findSpellForExplosion(0xff000099, FIREBALL_BLAST), 0, "another caster");
  assert.strictEqual(g.service.findSpellForExplosion(0x14, 0x1234), 0, "another explosion");
  for (let i = 0; i < 320; i++) g.frame(); // 5.1 s
  assert.strictEqual(g.service.findSpellForExplosion(0x14, FIREBALL_BLAST), 0, "too long ago");
  g.done();
});

test("the same spell reported again from that hand is sent again without an end in between", () => {
  const g = make();
  g.cast(FLAMES);
  g.frame();
  g.cast(FLAMES);
  g.frame();
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false, false]);
  g.done();
});

test("another spell in that hand ends the cast", () => {
  const g = make();
  g.cast(FLAMES);
  g.frame();
  g.player.hands[1] = FIREBOLT;
  g.frame();
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false, true]);
  g.done();
});

test("a cast of another spell from the same hand ends the one before it first; the other hand is separate", () => {
  const g = make();
  g.player.hands[0] = FLAMES;
  g.cast(FLAMES, 1);
  g.cast(FLAMES, 0);
  g.player.hands[1] = FIREBOLT;
  g.cast(FIREBOLT, 1);
  assert.deepStrictEqual(g.sent.map((m) => [m.castingSource, m.spell, m.interruptCast]), [[1, FLAMES, false], [0, FLAMES, false], [1, FLAMES, true], [1, FIREBOLT, false]]);
  g.frame();
  assert.strictEqual(g.sent.length, 4, "the left hand's Flames is still open");
  g.done();
});

test("the server log gets at most 40 lines from this service per session", () => {
  const g = make();
  for (let i = 0; i < 60; i++) { g.cast(FLAMES); g.animEvent("MRh_Equipped_Event"); g.frame(); }
  assert.strictEqual(g.sent.length, 120); // each: the cast and its end
  assert.strictEqual(g.logs.length, 40);
  g.done();
});
