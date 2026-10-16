"use strict";
// The end of a spell cast reaches everyone else: magicSyncService.ts sends it once the caster's own "is casting" animation variable for that
// hand is off, also when the game never sends the "equipped" animation event (letting go of Flames), so the fire stops in other games.
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

const FLAMES = 0x12fcd, FIREBOLT = 0x12fd0, PLAYER_REMOTE = 0xff000013;

function make() {
  const handlers = {}, onceUpdate = [], sent = [];
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
    Game: { getPlayer: () => player, getFormEx: (id) => (id === 0x14 ? player : null) },
    getAnimationVariablesFromActor: () => ({ booleans: new ArrayBuffer(1), floats: new ArrayBuffer(1), integers: new ArrayBuffer(1) }),
    SpellType: { Left: 0, Right: 1, Voise: 2, Instant: 3 },
    SlotType: { Left: 0, Right: 1 },
    EquippedItemType: { Staff: 8 },
  };
  const controller = {
    on: (n, f) => { handlers[n] = f; },
    once: (n, f) => { if (n === "update") onceUpdate.push(f); },
    emitter: { emit: (n, e) => { if (n === "sendMessage" && e.message.t === 23) sent.push(e.message.data); } },
  };
  const sp = { hooks: { sendAnimationEvent: { add: (h) => { animHook = h; } } } };
  const mods = {
    skyrimPlatform,
    "./clientListener": { ClientListener: class {} },
    "../../logging": { logTrace() {} },
    "../../messages": { MsgType: { SpellCast: 23, UpdateAnimVariables: 24 } },
    "../../view/worldViewMisc": { localIdToRemoteId: (id) => (id === 0x14 ? PLAYER_REMOTE : id), remoteIdToLocalId: (id) => (id === PLAYER_REMOTE ? 0x14 : id) },
  };
  const realNow = Date.now;
  Date.now = () => now;
  const { MagicSyncService } = load("magicSyncService.ts", mods);
  new MagicSyncService(sp, controller);
  const frame = (ms = 16) => { now += ms; handlers.update(); onceUpdate.splice(0).forEach((f) => f()); };
  const cast = (spell, castingSource = 1) => handlers.spellCast({ caster: player, target: null, spell: { getFormID: () => spell }, castingSource, isDualCasting: false, aimAngle: 0, aimHeading: 0 });
  const animEvent = (animEventName) => animHook.leave({ animEventName, animationSucceeded: true });
  return { player, sent, frame, cast, animEvent, done: () => { Date.now = realNow; } };
}

test("Flames: the end is sent when the caster lets go, without the equipped animation event", () => {
  const g = make();
  g.player.vars.IsCastingRight = true;
  g.cast(FLAMES);
  for (let i = 0; i < 120; i++) g.frame(); // two seconds of fire
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false]);
  g.player.vars.IsCastingRight = false; // lets go
  g.frame();
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false, true]);
  assert.strictEqual(g.sent[1].spell, FLAMES);
  assert.strictEqual(g.sent[1].castingSource, 1);
  assert.strictEqual(g.sent[0].interruptCast, false, "the cast message itself is not changed");
  for (let i = 0; i < 30; i++) g.frame();
  g.animEvent("MRh_Equipped_Event");
  for (let i = 0; i < 3; i++) g.frame();
  assert.strictEqual(g.sent.length, 2, "the end goes out once");
  g.done();
});

test("a cast whose casting variable is never seen on (a fire-and-forget bolt) is ended after 400 ms", () => {
  const g = make();
  g.player.hands[1] = FIREBOLT;
  g.cast(FIREBOLT);
  for (let i = 0; i < 20; i++) g.frame(); // 320 ms
  assert.strictEqual(g.sent.length, 1);
  for (let i = 0; i < 10; i++) g.frame();
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false, true]);
  g.done();
});

test("another spell in that hand ends the cast", () => {
  const g = make();
  g.player.vars.IsCastingRight = true;
  g.cast(FLAMES);
  g.frame();
  g.player.hands[1] = FIREBOLT; // swapped while the casting variable still reads on
  g.frame();
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false, true]);
  g.done();
});

test("a new cast from the same hand ends the one before it first; the other hand is separate", () => {
  const g = make();
  g.player.hands[0] = FLAMES;
  g.player.vars.IsCastingRight = true;
  g.player.vars.IsCastingLeft = true;
  g.cast(FLAMES, 1);
  g.cast(FLAMES, 0);
  g.cast(FLAMES, 1);
  assert.deepStrictEqual(g.sent.map((m) => [m.castingSource, m.interruptCast]), [[1, false], [0, false], [1, true], [1, false]]);
  g.frame();
  g.player.vars.IsCastingLeft = false;
  g.frame();
  assert.deepStrictEqual(g.sent.slice(4).map((m) => [m.castingSource, m.interruptCast]), [[0, true]]);
  g.done();
});

test("the equipped animation event still ends every open cast", () => {
  const g = make();
  g.player.vars.IsCastingRight = true;
  g.cast(FLAMES);
  g.frame();
  g.animEvent("MRh_Equipped_Event");
  g.frame();
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false, true]);
  g.done();
});
