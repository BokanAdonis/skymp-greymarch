"use strict";
// The werewolf, the game's half (src/greymarch/bridge.ts): the transformation animation before the change, the roar on R, the feeding animation on the server's word.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const BEAST = 0xcdd84, NORD = 0x13746;
function make(opts = {}) {
  const log = { lines: [], idles: [], events: [], races: [], waits: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": {}, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
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
    Game: { getPlayer: () => player, getFormEx: (id) => ({ id }), setBeastForm() {}, enableFastTravel() {}, disablePlayerControls() {}, enablePlayerControls() {}, forceThirdPerson() {}, showFirstPersonGeometry() {} },
    Spell: { from: pass }, MagicEffect: { from: pass }, Race: { from: (f) => race(f.id) }, Idle: { from: pass }, FormList: { from: () => null }, ImageSpaceModifier: { from: () => null }, Sound: { from: () => null }, ActorBase: { from: () => null },
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
