"use strict";
// RaceMenu's extra sliders, the game's half (src/greymarch/racemenuLook.ts + bridge.ts greymarchRaceMenuTick): exported and sent when the race menu
// closes, put back on the vanilla look SkyMP applied after a relog, never while the race menu is open or the body is the werewolf or a creature.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const load = (file, mods) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", file), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  return mod.exports;
};
const rm = load("racemenuLook.ts", {});

// A preset as RaceMenu writes it: vanilla parts plus RaceMenu's own
const preset = (own) => ({
  version: { formatVersion: 3 }, headParts: [{ formIdentifier: "Skyrim.esm|1" }], actor: { weight: 50 },
  morphs: { default: { morphs: [0.1], presets: [1] }, custom: [], sculptDivisor: 10000, sculpt: [], ...(own.morphs || {}) },
  transforms: own.transforms || [], bodyMorphs: own.bodyMorphs || [], overrides: [], skinOverrides: [],
});
const MINE = { morphs: { custom: [{ name: "NoseTip", value: 0.4 }] }, transforms: [{ firstPerson: false, node: "NPC", keys: [{ name: "RSMPlugin", values: [{ data: 1.1, index: 0, key: 20, type: 2 }] }] }] };

test("pick keeps only RaceMenu's sections; splice puts them on another preset and empties the rest; key order and float noise do not count", () => {
  const p = rm.pickRaceMenuParts(preset(MINE));
  assert.deepStrictEqual(Object.keys(p).sort(), ["morphs", "transforms"]);
  assert.deepStrictEqual(p.morphs, { custom: [{ name: "NoseTip", value: 0.4 }] });
  assert.deepStrictEqual(rm.pickRaceMenuParts(preset({})), {});
  const other = preset({ bodyMorphs: [{ name: "Old", keys: [{ key: "x", value: 1 }] }] });
  const s = rm.spliceRaceMenuParts(other, p);
  assert.deepStrictEqual(s.headParts, other.headParts, "the vanilla parts stay the current look's");
  assert.deepStrictEqual(s.morphs.default, other.morphs.default);
  assert.deepStrictEqual(s.morphs.custom, p.morphs.custom);
  assert.deepStrictEqual(s.bodyMorphs, [], "a section the kept look does not have is emptied");
  const serverOrder = { morphs: { custom: [{ value: 0.40000001, name: "NoseTip" }] }, transforms: [{ node: "NPC", firstPerson: false, keys: [{ name: "RSMPlugin", values: [{ key: 20, type: 2, index: 0, data: 1.1 }] }] }] };
  assert.strictEqual(rm.sameRaceMenuParts(preset(MINE), serverOrder), true);
  assert.strictEqual(rm.sameRaceMenuParts(preset({}), serverOrder), false);
});

function make() {
  const log = { lines: [], sent: [], natives: [], files: {} };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": {}, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} }, "./racemenuLook": rm };
  const bridge = load("bridge.ts", mods);
  let menuOpen = false;
  const body = { live: preset({}), loaded: true }; // what RaceMenu holds for the player right now
  const player = { is3DLoaded: () => body.loaded };
  const sp = {
    printConsole() {}, writeLogs() {}, on() {}, // every line also reaches the server log (counted from there)
    Ui: { isMenuOpen: (name) => name === "RaceSex Menu" && menuOpen },
    Game: { getPlayer: () => player },
    readCharGenPreset: (name) => log.files[name] || "",
    writeCharGenPreset: (name, text) => { log.files[name] = text; },
    callNative: (cls, fn, self, ...args) => {
      assert.strictEqual(cls, "CharGen");
      log.natives.push([fn, args[1], args[3]]);
      if (fn === "SaveCharacterPreset") { log.files[args[1]] = JSON.stringify(body.live); return undefined; }
      if (fn === "LoadCharacterPresetEx") { body.live = JSON.parse(log.files[args[1]]); return true; }
      throw new Error("unexpected " + fn);
    },
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, m) => { if (n !== "sendMessage") return; const c = JSON.parse(m.message.contentJsonDump); if (c.customPacketType === "greymarchLog") log.lines.push(c.text); else log.sent.push(c); } } };
  const gm = new bridge.GreymarchBridge(sp, controller);
  let t = 100000;
  return { gm, sp, log, body, step: (ms = 1000) => { t += ms; gm.greymarchRaceMenuTick(t); }, menu: (on) => { menuOpen = on; }, say: (m) => gm.greymarchPacket(m) };
}
const loads = (log) => log.natives.filter((n) => n[0] === "LoadCharacterPresetEx");

test("closing the race menu sends RaceMenu's parts a second later, and the player's own look is not loaded over", () => {
  const s = make();
  s.menu(true); s.step();
  s.body.live = preset(MINE); // the player moves RaceMenu's sliders
  s.menu(false); s.step(100);
  assert.strictEqual(s.log.sent.length, 0);
  s.step(1000);
  assert.strictEqual(s.log.sent.length, 1);
  assert.strictEqual(s.log.sent[0].customPacketType, "greymarchRaceMenuLook");
  assert.deepStrictEqual(s.log.sent[0].look, rm.pickRaceMenuParts(preset(MINE)));
  for (let i = 0; i < 10; i++) s.step();
  assert.strictEqual(loads(s.log).length, 0);
});

test("after a relog the kept parts are put on the vanilla look SkyMP applied, once the body has been there 4 seconds", () => {
  const s = make();
  s.body.live = preset({}); // a fresh game: SkyMP's vanilla look, no RaceMenu data
  s.say({ customPacketType: "greymarchRaceMenuLook", look: { morphs: { custom: [{ name: "NoseTip", value: 0.4 }] } } });
  s.step(); s.step(); s.step();
  assert.strictEqual(loads(s.log).length, 0, "waits for SkyMP's look first");
  s.step(); s.step();
  assert.strictEqual(loads(s.log).length, 1);
  assert.deepStrictEqual(loads(s.log)[0], ["LoadCharacterPresetEx", "greymarch-look", 15]);
  assert.deepStrictEqual(s.body.live.morphs.custom, [{ name: "NoseTip", value: 0.4 }]);
  assert.deepStrictEqual(s.body.live.headParts, preset({}).headParts);
  assert.match(s.log.lines.join("\n"), /racemenu: sliders put back \(1 extra face sliders\)/);
  for (let i = 0; i < 10; i++) s.step();
  assert.strictEqual(loads(s.log).length, 1, "once");
});

test("an empty kept look on a body that has nothing is not loaded; one that still has another character's sliders is cleared", () => {
  const s = make();
  s.say({ customPacketType: "greymarchRaceMenuLook", look: {} });
  for (let i = 0; i < 8; i++) s.step();
  assert.strictEqual(loads(s.log).length, 0);
  const t = make();
  t.body.live = preset(MINE);
  t.say({ customPacketType: "greymarchRaceMenuLook", look: {} });
  for (let i = 0; i < 8; i++) t.step();
  assert.strictEqual(loads(t.log).length, 1);
  assert.deepStrictEqual(rm.pickRaceMenuParts(t.body.live), {});
});

test("nothing is loaded while the race menu is open or the body is the werewolf; done again after changing back", () => {
  const s = make();
  s.say({ customPacketType: "greymarchRaceMenuLook", look: MINE });
  s.gm.greymarchWolfOn = true;
  for (let i = 0; i < 8; i++) s.step();
  assert.strictEqual(loads(s.log).length, 0);
  s.gm.greymarchWolfOn = false;
  for (let i = 0; i < 8; i++) s.step();
  assert.strictEqual(loads(s.log).length, 1);
  s.gm.greymarchWolfOn = true; s.step();
  s.body.live = preset({}); // the beast body lost them
  s.gm.greymarchWolfOn = false;
  for (let i = 0; i < 8; i++) s.step();
  assert.strictEqual(loads(s.log).length, 2);
  s.menu(true);
  s.say({ customPacketType: "greymarchRaceMenuLook", look: {} });
  for (let i = 0; i < 8; i++) s.step();
  assert.strictEqual(loads(s.log).length, 2, "the race menu is the editor while it is open");
});

test("a SkyrimPlatform without the preset functions, or no RaceMenu, logs once and never throws", () => {
  const s = make();
  delete s.sp.readCharGenPreset;
  s.say({ customPacketType: "greymarchRaceMenuLook", look: MINE });
  for (let i = 0; i < 10; i++) s.step();
  assert.strictEqual(s.log.lines.filter((l) => /cannot read RaceMenu presets/.test(l)).length, 1);
  const t = make();
  t.sp.callNative = () => undefined; // RaceMenu not installed: no file written
  t.say({ customPacketType: "greymarchRaceMenuLook", look: MINE });
  for (let i = 0; i < 10; i++) t.step();
  assert.strictEqual(t.log.lines.filter((l) => /RaceMenu wrote no preset/.test(l)).length, 1);
});
