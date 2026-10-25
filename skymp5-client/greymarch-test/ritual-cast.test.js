"use strict";
// Ritual spells (both hands, held: Dragon Breath 040265A3), 2026-10-25. Watchers saw no fire after the ritual charge:
// - the game reports the cast when the charge begins (about 5 s before any fire) and never plays an "equipped" event, so the cast went out
//   too early and stayed open for minutes (349 s in the test server log);
// - the watcher's copy of the caster held nothing (the server had refused their equipment), and a held spell does not keep burning on empty hands.
// Now the caster sends the cast when the fire starts (RitualSpellAimConcentrationStart) and its end on RitualSpellOut, and the watcher puts the
// spell in both of the copy's hands before replaying it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const tsc = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
function load(file, mods) {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", file), "utf8");
  const mod = { exports: {} };
  new Function("require", "exports", "module", tsc(src))((p) => mods[p] || {}, mod.exports, mod);
  return mod.exports;
}

const DRAGON_BREATH = 0x40265a3, FLAMES = 0x12fcd, FIREBALL = 0x1c789, PLAYER_REMOTE = 0xff004225;
const BOTH_HANDS = 0x13f45, EITHER_HAND = 0x13f44;
// castingType 2 = held, 1 = fire and forget
const SPELLS = { [DRAGON_BREATH]: { type: 2, slot: BOTH_HANDS }, [FLAMES]: { type: 2, slot: EITHER_HAND }, [FIREBALL]: { type: 1, slot: BOTH_HANDS } };

function make() {
  const handlers = {}, onceUpdate = [], sent = [], logs = [];
  let animHook = null, now = 1000;
  const player = {
    hands: { 0: DRAGON_BREATH, 1: DRAGON_BREATH },
    getFormID: () => 0x14,
    getAnimationVariableBool: () => false,
    getEquippedSpell(slot) { const id = this.hands[slot]; return id ? { getFormID: () => id } : null; },
    getEquippedItemType: () => 0,
  };
  const spellForm = (id) => {
    const d = SPELLS[id];
    if (!d) return null;
    const effect = { getCastingType: () => d.type, getExplosion: () => null };
    return { getFormID: () => id, getNumEffects: () => 1, getNthEffectMagicEffect: () => effect, getEquipType: () => ({ getFormID: () => d.slot }) };
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
    emitter: { emit: (n, e) => { if (n === "sendMessage" && e.message.t === 23) sent.push({ ...e.message.data, at: now }); if (n === "greymarchStage") logs.push(e); } },
  };
  const sp = { hooks: { sendAnimationEvent: { add: (h) => { animHook = h; } } }, Spell: { from: (f) => f } };
  const mods = {
    skyrimPlatform,
    "./spellAim": load("spellAim.ts", {}),
    "./clientListener": { ClientListener: class {} },
    "../../logging": { logTrace() {} },
    "../../messages": { MsgType: { SpellCast: 23, UpdateAnimVariables: 24 } },
    "../../view/worldViewMisc": { localIdToRemoteId: (id) => (id === 0x14 ? PLAYER_REMOTE : id), remoteIdToLocalId: () => 0 },
  };
  const realNow = Date.now;
  Date.now = () => now;
  const { MagicSyncService } = load("magicSyncService.ts", mods);
  const service = new MagicSyncService(sp, controller);
  const frame = (ms = 16) => { now += ms; handlers.update(); onceUpdate.splice(0).forEach((f) => f()); };
  const wait = (ms) => { for (let t = 0; t < ms; t += 16) frame(); };
  const cast = (spell, castingSource = 1) => handlers.spellCast({ caster: player, target: null, spell: { getFormID: () => spell }, castingSource, isDualCasting: false, aimAngle: 0, aimHeading: 0 });
  const anim = (animEventName) => { animHook.leave({ animEventName, animationSucceeded: true }); frame(); };
  return { player, service, sent, logs, frame, wait, cast, anim, done: () => { Date.now = realNow; } };
}

test("Dragon Breath: nothing goes out during the ritual charge; the cast goes out when the fire starts and ends on RitualSpellOut", () => {
  const g = make();
  g.cast(DRAGON_BREATH);
  g.wait(2900);
  g.anim("RitualSpellOut"); // the end of the charge, before any fire: ignored
  g.wait(2500);
  assert.strictEqual(g.sent.length, 0, "no cast during the charge");
  g.anim("RitualSpellAimConcentrationStart");
  assert.deepStrictEqual(g.sent.map((m) => [m.spell, m.castingSource, m.interruptCast]), [[DRAGON_BREATH, 1, false]]);
  g.cast(DRAGON_BREATH); // the game reports the cast again as the fire starts: a reminder, not a new cast
  g.wait(2100); // reminders every second while it burns
  assert.ok(g.sent.every((m) => m.interruptCast === false));
  assert.ok(g.sent.length >= 3, "the cast, the game's second report and reminders");
  g.anim("RitualSpellOut");
  const last = g.sent[g.sent.length - 1];
  assert.deepStrictEqual([last.spell, last.interruptCast], [DRAGON_BREATH, true], "the end on RitualSpellOut");
  const n = g.sent.length;
  g.wait(5000);
  assert.strictEqual(g.sent.length, n, "nothing after the end");
  assert.match(g.logs[0], /^magic: ritual cast 40265a3 hand 1 by ff004225: sent when its fire starts$/);
  assert.ok(g.logs.some((l) => /^magic: ritual fire 40265a3 hand 1: cast sent \d+ ms after the cast$/.test(l)), g.logs.join("\n"));
  assert.ok(g.logs.some((l) => /^magic: end 40265a3 hand 1 after \d+ ms \(RitualSpellOut\)/.test(l)));
  g.done();
});

test("a second stream right after (the game does not report the cast again) goes out from the last one", () => {
  const g = make();
  g.cast(DRAGON_BREATH);
  g.wait(3000);
  g.anim("RitualSpellAimConcentrationStart");
  g.wait(600);
  g.anim("RitualSpellOut");
  g.wait(700);
  g.anim("RitualSpellAimConcentrationStart");
  const casts = g.sent.filter((m) => !m.interruptCast);
  const ends = g.sent.filter((m) => m.interruptCast);
  assert.strictEqual(ends.length, 1);
  assert.strictEqual(casts[casts.length - 1].at > ends[0].at, true, "a new cast after the end");
  g.anim("RitualSpellOut");
  assert.strictEqual(g.sent[g.sent.length - 1].interruptCast, true);
  g.wait(16000);
  const n = g.sent.length;
  g.anim("RitualSpellAimConcentrationStart"); // much later, with no cast: nothing to restart
  assert.strictEqual(g.sent.length, n);
  g.done();
});

test("a ritual whose fire never starts is sent anyway after 8 s (as before), and one dropped for another spell is never sent", () => {
  const g = make();
  g.cast(DRAGON_BREATH);
  g.wait(7900);
  assert.strictEqual(g.sent.length, 0);
  g.wait(200);
  assert.deepStrictEqual(g.sent.map((m) => m.interruptCast), [false]);
  assert.ok(g.logs.some((l) => /no fire start in 8000 ms, sent anyway/.test(l)));
  g.done();

  const h = make();
  h.cast(DRAGON_BREATH);
  h.wait(1000);
  h.player.hands[1] = FLAMES;
  h.wait(10000);
  assert.strictEqual(h.sent.length, 0, "the hand holds another spell: the waiting ritual is dropped");
  h.done();
});

test("other spells go out at once as before: a held one-hand spell, and a fire-and-forget spell even with a both-hands slot", () => {
  const g = make();
  g.player.hands[1] = FLAMES;
  g.cast(FLAMES);
  assert.deepStrictEqual(g.sent.map((m) => m.spell), [FLAMES]);
  g.anim("RitualSpellOut");
  assert.strictEqual(g.sent.length, 1, "RitualSpellOut never ends a cast that is not a ritual");
  g.player.hands[1] = FIREBALL;
  g.cast(FIREBALL);
  assert.strictEqual(g.sent[g.sent.length - 1].spell, FIREBALL);
  g.done();
});

// watcher side: remoteServer.ts greymarchEquipForCast
const remote = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "remoteServer.ts"), "utf8");
function equipper() {
  const a = remote.indexOf("  private greymarchEquipForCast(");
  const b = remote.indexOf("  private greymarchIsHeld(");
  const src = "class G {\n" + remote.slice(a, b).replace("private ", "") + "\n}\nmodule.exports = G;";
  const mod = { exports: {} };
  new Function("require", "exports", "module", tsc(src))(() => ({}), mod.exports, mod);
  return new mod.exports();
}
const copy = () => ({ equips: [], equipSpell(spell, hand) { this.equips.push([spell.getFormID(), hand]); } });
const spellOf = (id, slot) => ({ getFormID: () => id, getEquipType: () => (slot ? { getFormID: () => slot } : null) });

test("watcher: a ritual spell goes into both of the copy's hands, a one-hand spell into its casting hand, nothing for a voice or power", () => {
  const g = equipper();
  const c1 = copy();
  assert.strictEqual(g.greymarchEquipForCast(c1, spellOf(DRAGON_BREATH, BOTH_HANDS), 1), true);
  assert.deepStrictEqual(c1.equips, [[DRAGON_BREATH, 0], [DRAGON_BREATH, 1]]);
  const c2 = copy();
  g.greymarchEquipForCast(c2, spellOf(FLAMES, EITHER_HAND), 0);
  assert.deepStrictEqual(c2.equips, [[FLAMES, 0]]);
  const c3 = copy();
  assert.strictEqual(g.greymarchEquipForCast(c3, spellOf(FLAMES, EITHER_HAND), 2), false);
  assert.deepStrictEqual(c3.equips, []);
  assert.strictEqual(g.greymarchEquipForCast({ equipSpell() { throw new Error("not loaded"); } }, spellOf(FLAMES, null), 1), false);
});

test("watcher: it runs only for a held spell the copy does not hold, before castSpellImmediate", () => {
  const i = remote.indexOf("private onSpellCastMessage(");
  const callAt = remote.indexOf("const equipped = isHeld && !held && !!spell && this.greymarchEquipForCast(ac, spell, msg.data.castingSource);", i);
  assert.ok(callAt > i, "called with those conditions");
  assert.ok(callAt < remote.indexOf("castSpellImmediate(ac.getFormID()", i), "before the cast is replayed");
  assert.ok(callAt > remote.indexOf("showing.lastSeen = Date.now();", i), "not for the reminders of a cast already shown");
});
