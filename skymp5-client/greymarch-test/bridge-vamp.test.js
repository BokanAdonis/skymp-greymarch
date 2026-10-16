"use strict";
// Vampires, the game's half (src/greymarch/bridge.ts): the blood drop passed to the HUD, Mist Form / Vampire Lord / Potion of Blood reported, the abilities the server
// names set and put back, Restoration spells taken out of the hands, the feeding animation on the server's word.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const DG = 0x02000000; // Dawnguard.esm's place in the load order
function make(opts = {}) {
  const log = { lines: [], sent: [], hud: [], av: {}, unequipped: [], idles: [], events: [], notes: [], dispelled: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (opts.others || {})[id] || 0 }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const handlers = {};
  let equipped = { 0: null, 1: null };
  const base = { WaterWalking: 0, PoisonResist: 0, DiseaseResist: 0, MagickaRateMult: 100 };
  const player = {
    getBaseActorValue: (n) => base[n], setActorValue: (n, v) => { log.av[n] = v; },
    getEquippedSpell: (slot) => equipped[slot], unequipSpell: (s, slot) => { log.unequipped.push(slot); equipped[slot] = null; },
    dispelSpell: (s) => log.dispelled.push(s.id),
    playIdleWithTarget: (idle, target) => { log.idles.push([idle.id, target.name]); return true; },
    name: "me",
  };
  const other = { name: "them", playIdleWithTarget: (idle, target) => { log.idles.push([idle.id, target.name, "remote"]); return true; } };
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    browser: { executeJavaScript: (s) => { const m = /__gmHudSend\((.*)\);$/.exec(s); if (m) log.hud.push(JSON.parse(m[1])); } },
    Game: { getPlayer: () => player, getFormEx: (id) => (id === 0x5000 ? other : { id }), getFormFromFile: (id, file) => (file === "Dawnguard.esm" ? { getFormID: () => DG + id } : null) },
    Spell: { from: (f) => f }, Idle: { from: (f) => f }, Actor: { from: (f) => (f === other ? other : null) },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push([ref.name, name]), notification: (t) => log.notes.push(t) },
    on() {},
  };
  const controller = { on: (n, fn) => { (handlers[n] = handlers[n] || []).push(fn); }, emitter: { on() {}, emit: (n, m) => { if (n === "sendMessage") log.sent.push(JSON.parse(m.message.contentJsonDump)); } } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const fire = (n, e) => (handlers[n] || []).forEach((fn) => fn(e));
  const spell = (school) => ({ getNthEffectMagicEffect: () => ({ getAssociatedSkill: () => school }) });
  return { gm, log, fire, tick: () => gm.greymarchVampTick(), say: (m) => gm.greymarchPacket(m), equip: (slot, s) => { equipped[slot] = s; }, spell };
}
const me = { getFormID: () => 0x14 };
const state = (extra) => Object.assign({ customPacketType: "greymarchVampire", on: true, rank: 1, blood: 60, empty: false, waterWalk: true, poisonResist: 100, diseaseResist: 100, magickaRegen: 0, noRestoration: true }, extra);

test("the server's state reaches the blood drop on the HUD", () => {
  const s = make();
  s.say(state({ blood: 12 }));
  assert.deepStrictEqual(s.log.hud.pop(), { fn: "blood", arg: { on: true, blood: 12, empty: false } });
  s.say({ customPacketType: "greymarchVampire", on: false });
  assert.deepStrictEqual(s.log.hud.pop(), { fn: "blood", arg: { on: false, empty: false } });
});

test("Mist Form, the Vampire Lord and a Potion of Blood are reported to the server (it decides)", () => {
  const s = make();
  s.fire("spellCast", { spell: { getFormID: () => DG + 0x38ba }, caster: me });
  s.fire("spellCast", { spell: { getFormID: () => DG + 0x283b }, caster: me });
  s.fire("spellCast", { spell: { getFormID: () => 0x12fcd }, caster: me }); // Flames: not ours
  s.fire("magicEffectApply", { effect: { getFormID: () => DG + 0x18ef4 }, target: me });
  s.tick();
  assert.deepStrictEqual(s.log.sent.filter((m) => m.customPacketType === "greymarchVamp"), [
    { customPacketType: "greymarchVamp", op: "game", power: "mist", on: true },
    { customPacketType: "greymarchVamp", op: "game", power: "lord", on: true },
    { customPacketType: "greymarchVamp", op: "drank" },
  ]);
});

test("the abilities the server names are set, and put back when vampirism goes", () => {
  const s = make();
  s.say(state({ magickaRegen: 15 }));
  s.tick();
  assert.deepStrictEqual(s.log.av, { WaterWalking: 1, PoisonResist: 100, DiseaseResist: 100, MagickaRateMult: 115 });
  s.say({ customPacketType: "greymarchVampire", on: false });
  s.tick();
  assert.deepStrictEqual(s.log.av, { WaterWalking: 0, PoisonResist: 0, DiseaseResist: 0, MagickaRateMult: 100 });
});

test("a Restoration spell put in a vampire's hand is taken out again; other schools stay", () => {
  const s = make();
  s.say(state());
  s.equip(0, s.spell("Restoration")); s.equip(1, s.spell("Destruction"));
  s.tick();
  assert.deepStrictEqual(s.log.unequipped, [0]);
  assert.strictEqual(s.log.notes.length, 1);
});

test("the feeding scene: the vampire's body plays the standing feed with the victim, on both games, and off ends it", () => {
  const v = make({ others: { 0xff000002: 0x5000 } });
  v.say({ customPacketType: "greymarchVampFeed", on: true, role: "vampire", partner: 0xff000002 });
  v.tick();
  assert.deepStrictEqual(v.log.idles, [[DG + 0xe6a8, "them"]], "the player bites the victim");
  v.say({ customPacketType: "greymarchVampFeed", on: false });
  v.tick();
  assert.deepStrictEqual(v.log.events, [["me", "IdleForceDefaultState"], ["them", "IdleForceDefaultState"]]);
  const victim = make({ others: { 0xff000001: 0x5000 } });
  victim.say({ customPacketType: "greymarchVampFeed", on: true, role: "victim", partner: 0xff000001 });
  victim.tick();
  assert.deepStrictEqual(victim.log.idles, [[DG + 0xe6a8, "me", "remote"]], "on the victim's game the vampire's body bites the player");
});

test("Mist Form refused or over: the game's own mist is ended", () => {
  const s = make();
  s.say({ customPacketType: "greymarchVampMist", on: false });
  s.tick();
  assert.deepStrictEqual(s.log.dispelled, [DG + 0x38ba]);
});

test("a vampire's request to feed opens the victim's X menu by itself (it was only sent to a closed menu)", () => {
  const s = make();
  const shown = [];
  s.gm.greymarchMenuShow = (arg) => { shown.push(arg); };
  s.say({ customPacketType: "greymarchMenuEvent", type: "feed_invite", from: "Stranger" });
  assert.deepStrictEqual(shown, [{ mode: "invite", looking: 0 }]);
});
