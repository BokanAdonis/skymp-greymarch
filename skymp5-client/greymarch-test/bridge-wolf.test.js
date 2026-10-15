"use strict";
// The werewolf, the game's half (src/greymarch/bridge.ts): the transformation animation before the change, the roar on R, the feeding animation on the server's word.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const BEAST = 0xcdd84, NORD = 0x13746, ALPHA = 0xfe000804;
function make(opts = {}) {
  const log = { lines: [], idles: [], events: [], races: [], waits: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (opts.others || {})[id] || 0 }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const race = (id) => ({ id, getFormID: () => id });
  let current = NORD, menu = false;
  const player = {
    getRace: () => race(current), setRace: (r) => { current = r.id; log.races.push(r.id); },
    playIdle: (idle) => { log.idles.push(idle.id); return opts.refuseIdle ? false : true; },
    waitForAnimationEvent: (name) => new Promise((resolve) => log.waits.push({ name, resolve })),
    hasSpell: () => true, hasMagicEffect: () => false, dispelSpell() {}, unequipAll() {}, getBaseObject: () => null,
  };
  const pass = (f) => (f ? f : null);
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => player, getFormEx: (id) => ({ id }), getFormFromFile: (id, file) => (opts.noAlpha || id !== 0x804 || file !== "GreymarchCore.esp" ? null : { getFormID: () => ALPHA }), setBeastForm() {}, enableFastTravel() {}, disablePlayerControls() {}, enablePlayerControls() {}, forceThirdPerson() {}, showFirstPersonGeometry() {} },
    Spell: { from: pass }, MagicEffect: { from: pass }, Race: { from: (f) => race(f.id) }, Actor: { from: (f) => (f && opts.actors && opts.actors[f.id]) || null }, Idle: { from: pass }, FormList: { from: () => null }, ImageSpaceModifier: { from: () => null }, Sound: { from: () => null }, ActorBase: { from: () => null },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push(name), notification() {} },
    Utility: { isInMenuMode: () => menu },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  let t = 1_000_000;
  const realNow = Date.now;
  const tick = (ms = 300) => { t += ms; Date.now = () => t; try { gm.greymarchWolfTick(); } finally { Date.now = realNow; } };
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const say = (msg) => at(() => gm.greymarchPacket(msg));
  const key = (code, down) => at(() => gm.greymarchKey({ code, isDown: down }));
  return { gm, log, tick, say, key, race: () => current, setMenu: (v) => { menu = v; } };
}
const flush = () => new Promise((r) => setImmediate(r));

test("the server says changed: the transformation animation plays first, and the race changes on its SetRace cue", async () => {
  const s = make();
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  assert.deepStrictEqual(s.log.idles, [0x2a59d], "IdleWerewolfTransformation");
  assert.strictEqual(s.race(), NORD, "still human while the animation plays");
  assert.deepStrictEqual(s.log.waits.map((w) => w.name), ["SetRace"]);
  s.tick(); s.tick();
  assert.strictEqual(s.race(), NORD, "nothing before the cue");
  s.log.waits[0].resolve(true); await flush();
  s.tick();
  assert.strictEqual(s.race(), BEAST, "the cue changes the body");
  assert.ok(s.log.lines.some((l) => /SetRace cue/.test(l)));
});

test("if the cue never comes, the timer changes them; if the game refuses the animation, they change at once", () => {
  const s = make();
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  for (let i = 0; i < 13; i++) s.tick(300);
  assert.strictEqual(s.race(), NORD, "about 4 seconds: not yet");
  s.tick(600);
  assert.strictEqual(s.race(), BEAST);
  assert.ok(s.log.lines.some((l) => /\(timer,/.test(l)));
  const r = make({ refuseIdle: true });
  r.say({ customPacketType: "greymarchWolfForm", on: true });
  r.tick();
  assert.strictEqual(r.race(), BEAST, "no animation, no wait");
});

test("the server says no in the middle of the animation: it is stopped and nothing was changed", () => {
  const s = make();
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  s.say({ customPacketType: "greymarchWolfForm", on: false });
  s.tick();
  assert.deepStrictEqual(s.log.races, [], "the race was never touched");
  assert.ok(s.log.events.includes("IdleForceDefaultState"));
  assert.strictEqual(s.gm.greymarchWolfOn, false);
});

test("R roars only while changed, never mid-transformation or in a menu, and not again before the wait is over", () => {
  const s = make({ refuseIdle: true });
  s.key(19, true); s.key(19, false); s.tick();
  assert.deepStrictEqual(s.log.events, [], "human: R is the game's own key");
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  s.key(19, true); s.tick(); s.tick();
  assert.deepStrictEqual(s.log.events, ["HowlStart", "HowlRelease"]);
  s.key(19, false); s.key(19, true); s.tick();
  assert.deepStrictEqual(s.log.events, ["HowlStart", "HowlRelease"], "too soon");
  s.key(19, false); s.tick(4000);
  s.setMenu(true); s.key(19, true); s.tick();
  assert.strictEqual(s.log.events.length, 2, "not in a menu");
  s.setMenu(false); s.key(19, false); s.key(19, true); s.tick(); s.tick();
  assert.deepStrictEqual(s.log.events.slice(2), ["HowlStart", "HowlRelease"]);
  s.gm.greymarchChatTyping = true; s.key(19, false); s.tick(4000); s.key(19, true); s.tick();
  assert.strictEqual(s.log.events.length, 4, "typing in the chat is not a roar");
});

test("the server says the wolf fed: the vanilla feeding animation (SpecialFeeding) plays on the beast body", () => {
  const s = make();
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  s.say({ customPacketType: "greymarchWolfFeed" });
  s.tick();
  assert.deepStrictEqual(s.log.idles, [0x2a59d], "not during the transformation");
  s.tick(5000);
  assert.deepStrictEqual(s.log.idles, [0x2a59d], "not before the body has changed");
  s.say({ customPacketType: "greymarchWolfFeed" });
  s.tick();
  assert.deepStrictEqual(s.log.idles, [0x2a59d, 0xd23b7]);
});

test("the Alpha form: the server says alpha, the body becomes the Alpha race from GreymarchCore.esp; R and feeding work on it; changing back finds the human race", () => {
  const s = make({ refuseIdle: true });
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: true });
  s.tick();
  assert.strictEqual(s.race(), ALPHA);
  assert.ok(s.log.lines.some((l) => /changed into the Alpha beast/.test(l)));
  s.key(19, true); s.tick(); s.tick();
  assert.deepStrictEqual(s.log.events, ["HowlStart", "HowlRelease"], "the Alpha roars");
  s.say({ customPacketType: "greymarchWolfFeed" }); s.tick();
  assert.deepStrictEqual(s.log.idles.slice(-1), [0xd23b7], "and feeds");
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
  assert.strictEqual(s.race(), NORD);
});

test("the Alpha form: staff switch it on or off mid-form and the body follows; without the race in GreymarchCore.esp the normal werewolf is used", () => {
  const s = make({ refuseIdle: true });
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  assert.strictEqual(s.race(), BEAST);
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: true });
  s.tick(3100);
  assert.strictEqual(s.race(), ALPHA, "switched to the Alpha");
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false });
  s.tick(3100);
  assert.strictEqual(s.race(), BEAST, "and back");
  const n = make({ refuseIdle: true, noAlpha: true });
  n.say({ customPacketType: "greymarchWolfForm", on: true, alpha: true });
  n.tick();
  assert.strictEqual(n.race(), BEAST);
  assert.ok(n.log.lines.some((l) => /Alpha race is not in GreymarchCore.esp/.test(l)));
});

test("other players in the Alpha form: one drawn as the normal werewolf gets the Alpha race on this screen, and goes back when the server stops listing them", () => {
  const races = { 0xff000a01: BEAST, 0xff000a02: NORD };
  const other = (id) => ({ getRace: () => ({ getFormID: () => races[id] }), setRace: (r) => { races[id] = r.id; } });
  const s = make({ others: { 501: 0xff000a01, 502: 0xff000a02 }, actors: { 0xff000a01: other(0xff000a01), 0xff000a02: other(0xff000a02) } });
  s.say({ customPacketType: "greymarchWolfAlphas", actors: [501, 502] });
  s.tick(1100);
  assert.strictEqual(races[0xff000a01], ALPHA, "the werewolf is drawn as the Alpha");
  assert.strictEqual(races[0xff000a02], NORD, "a human (no wolf look) is left alone");
  s.say({ customPacketType: "greymarchWolfAlphas", actors: [] });
  s.tick(1100);
  assert.strictEqual(races[0xff000a01], BEAST, "no longer listed: the normal werewolf again");
});
