"use strict";
// Creature forms, the game's half (src/greymarch/bridge.ts): the server says which creature, the body changes; the server says back, the body and the gear come back.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const NORD = 0x13746, GOAT = 0x131fa, GIANT = 0x131f9;
function make(opts = {}) {
  const log = { lines: [], races: [], calls: [], equipped: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0 }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const race = (id) => ({ id, getFormID: () => id });
  let current = NORD;
  const items = { 0x12eb7: 1, 0x13911: 1 };
  const player = {
    getRace: () => race(current), setRace: (r) => { current = r.id; log.races.push(r.id); },
    unequipAll: () => log.calls.push("unequipAll"), getBaseObject: () => null,
    getItemCount: (f) => items[f.id] || 0, equipItem: (f) => log.equipped.push(f.id),
    hasSpell: () => false, hasMagicEffect: () => false,
  };
  const call = (name) => (...a) => log.calls.push(name + (a.length ? ":" + a[0] : ""));
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => player, getFormEx: (id) => (opts.noRace && id === opts.noRace ? null : { id }), getFormFromFile: () => null, setBeastForm: call("beastForm"), enableFastTravel: call("fastTravel"), disablePlayerControls: call("controlsOff"), enablePlayerControls: call("controlsOn"), forceThirdPerson: call("thirdPerson"), showFirstPersonGeometry() {} },
    Race: { from: (f) => (f ? race(f.id) : null) }, ActorBase: { from: () => null }, Spell: { from: () => null }, MagicEffect: { from: () => null },
    Debug: { sendAnimationEvent() {}, notification() {} }, Utility: { isInMenuMode: () => false }, on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  let t = 1_000_000;
  const realNow = Date.now;
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const tick = (ms = 300) => { t += ms; at(() => gm.greymarchShapeTick()); };
  const say = (msg) => at(() => gm.greymarchPacket({ customPacketType: "greymarchShape", ...msg }));
  return { gm, log, tick, say, race: () => current, setRace: (id) => { current = id; } };
}

test("the server says goat: menus and fast travel off, third person, gear off, then the goat's race", () => {
  const s = make();
  s.say({ on: true, race: GOAT, back: NORD, name: "Goat" });
  s.tick();
  assert.strictEqual(s.race(), GOAT);
  assert.deepStrictEqual(s.log.calls, ["beastForm:true", "fastTravel:false", "controlsOff:false", "thirdPerson", "unequipAll"]);
  assert.ok(s.log.lines.some((l) => /became Goat \(race now 131fa, will change back to 13746\)/.test(l)));
  s.tick(); s.tick();
  assert.deepStrictEqual(s.log.races, [GOAT], "changed once, not every tick");
});

test("the server says back: their own race, controls and menus back, and the gear they wore goes back on a moment later", () => {
  const s = make();
  s.say({ on: true, race: GOAT, back: NORD, name: "Goat" }); s.tick();
  s.log.calls.length = 0;
  s.say({ on: false, back: NORD, wear: [0x12eb7, 0x13911, 0x99999] });
  s.tick();
  assert.strictEqual(s.race(), NORD);
  assert.deepStrictEqual(s.log.calls, ["controlsOn:false", "beastForm:false", "fastTravel:true"]);
  assert.deepStrictEqual(s.log.equipped, [], "not at once");
  s.tick(1100);
  assert.deepStrictEqual(s.log.equipped, [0x12eb7, 0x13911], "what they still carry is put on; what they do not have is skipped");
  assert.ok(s.log.lines.some((l) => /put 2 of 3 worn items back on/.test(l)));
});

test("one creature to another changes only the race; the way back is still their own race", () => {
  const s = make();
  s.say({ on: true, race: GOAT, back: NORD, name: "Goat" }); s.tick();
  s.say({ on: true, race: GIANT, back: NORD, name: "Giant" }); s.tick();
  assert.strictEqual(s.race(), GIANT);
  assert.strictEqual(s.log.calls.filter((c) => c === "unequipAll").length, 1, "the menus and gear steps happen once");
  s.say({ on: false, back: NORD, wear: [] }); s.tick();
  assert.strictEqual(s.race(), NORD);
});

test("a race the game put back is set again (every 3 seconds at most)", () => {
  const s = make();
  s.say({ on: true, race: GOAT, back: NORD, name: "Goat" }); s.tick();
  s.setRace(NORD);
  s.tick(3500);
  assert.strictEqual(s.race(), GOAT);
  assert.ok(s.log.lines.some((l) => /set again/.test(l)));
});

test("no word from the server for 20 seconds: they change back by themselves; the repeats keep the form", () => {
  const s = make();
  s.say({ on: true, race: GOAT, back: NORD, name: "Goat" }); s.tick();
  for (let i = 0; i < 6; i++) { s.tick(5000); s.say({ on: true, race: GOAT, back: NORD, name: "Goat" }); }
  assert.strictEqual(s.race(), GOAT, "said every 5 seconds: still a goat after 30 seconds");
  s.tick(21000);
  assert.strictEqual(s.race(), NORD);
  assert.ok(s.log.lines.some((l) => /no word from the server/.test(l)));
});

test("a race this game does not have is logged, not retried every quarter second, and nothing breaks", () => {
  const s = make({ noRace: 0x4014495 });
  s.say({ on: true, race: 0x4014495, back: NORD, name: "Lurker" }); s.tick(); s.tick(); s.tick();
  assert.strictEqual(s.race(), NORD);
  assert.strictEqual(s.log.lines.filter((l) => /change failed at step 'race'/.test(l)).length, 1);
  s.say({ on: false, back: NORD, wear: [] }); s.tick();
  assert.strictEqual(s.race(), NORD);
});
