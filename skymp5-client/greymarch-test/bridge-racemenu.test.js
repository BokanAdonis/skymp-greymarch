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
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => id }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} }, "./racemenuLook": rm };
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
  assert.deepStrictEqual(rm.pickRaceMenuParts(rm.withoutHeight(t.body.live)), {}, "every other slider cleared");
  assert.strictEqual(rm.heightInLook(t.body.live), 1.1, "the Height is left to the Height check (2026-11-10: a preset load no longer writes it)");
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
  assert.strictEqual(s.log.lines.filter((l) => /can read RaceMenu presets, the extra sliders are not kept/.test(l)).length, 1);
  const t = make();
  t.sp.callNative = () => undefined; // RaceMenu not installed: no file written
  t.say({ customPacketType: "greymarchRaceMenuLook", look: MINE });
  for (let i = 0; i < 10; i++) t.step();
  assert.strictEqual(t.log.lines.filter((l) => /RaceMenu wrote no preset/.test(l)).length, 1);
});

test("a SkyrimPlatform without the preset functions uses GreymarchCamera.dll 1.8, piece by piece (2026-11-02, the owner: the extra face sliders were never kept)", () => {
  const s = make();
  delete s.sp.readCharGenPreset; delete s.sp.writeCharGenPreset;
  const charGen = s.sp.callNative;
  const pieces = { read: 0, write: 0 };
  s.sp.callNative = (cls, fn, self, ...args) => {
    if (cls !== "GreymarchCam") return charGen(cls, fn, self, ...args);
    const file = Buffer.from(s.log.files[args[0]] || "", "utf8");
    if (fn === "ReadCharGenPresetPart") { pieces.read++; return file.subarray(args[1], args[1] + 8000).toString("utf8"); }
    if (fn === "WriteCharGenPresetPart") { pieces.write++; s.log.files[args[0]] = (args[2] ? (s.log.files[args[0]] || "") : "") + args[1]; return true; }
    throw new Error("unexpected " + fn);
  };
  // a long preset (over one piece) with a character outside ASCII
  const big = { morphs: { custom: Array.from({ length: 900 }, (_, i) => ({ name: "Slideré" + i, value: 0.5 })) } };
  s.menu(true); s.step();
  s.body.live = preset(big);
  s.menu(false); s.step(100); s.step(1000);
  assert.strictEqual(s.log.sent.length, 1, "sent");
  assert.deepStrictEqual(s.log.sent[0].look, rm.pickRaceMenuParts(preset(big)), "read back whole, across the pieces");
  assert.ok(pieces.read > 2, "read in pieces");
  // after a relog the kept parts are written for RaceMenu through the DLL and loaded
  const t = make();
  delete t.sp.readCharGenPreset; delete t.sp.writeCharGenPreset;
  const charGen2 = t.sp.callNative;
  t.sp.callNative = (cls, fn, self, ...args) => {
    if (cls !== "GreymarchCam") return charGen2(cls, fn, self, ...args);
    const file = Buffer.from(t.log.files[args[0]] || "", "utf8");
    if (fn === "ReadCharGenPresetPart") return file.subarray(args[1], args[1] + 8000).toString("utf8");
    if (fn === "WriteCharGenPresetPart") { t.log.files[args[0]] = (args[2] ? (t.log.files[args[0]] || "") : "") + args[1]; return true; }
    throw new Error("unexpected " + fn);
  };
  t.body.live = preset({});
  t.say({ customPacketType: "greymarchRaceMenuLook", look: rm.pickRaceMenuParts(preset(big)) });
  for (let i = 0; i < 6; i++) t.step();
  assert.strictEqual(loads(t.log).length, 1);
  assert.deepStrictEqual(t.body.live.morphs.custom, big.morphs.custom, "the sliders are back");
});

test("the sliders just made are never put back over before they are sent (2026-11-02, the owner: it all set back; the server had none kept yet)", () => {
  const s = make();
  const OLD = { morphs: { custom: [{ name: "EarPoint", value: 0.9 }] } };
  s.body.live = preset({});
  s.say({ customPacketType: "greymarchRaceMenuLook", look: OLD }); // after logging in: the kept sliders are put back
  for (let i = 0; i < 8; i++) s.step();
  assert.strictEqual(loads(s.log).length, 1, "put back once at login");
  s.menu(true); s.step();
  s.say({ customPacketType: "greymarchRaceMenuLook", look: {} }); // a different kept look arrives while the menu is open
  s.step();
  s.body.live = preset(MINE); // the player moves RaceMenu's sliders
  s.menu(false);
  for (let i = 0; i < 10; i++) s.step(100); // the second after the menu closes, step by step
  for (let i = 0; i < 6; i++) s.step();
  assert.strictEqual(loads(s.log).length, 1, "nothing loaded over the new sliders after the menu closed");
  assert.strictEqual(s.log.sent.length, 1);
  assert.deepStrictEqual(s.log.sent[0].look, rm.pickRaceMenuParts(preset(MINE)), "the new sliders are what is sent");
  assert.deepStrictEqual(s.body.live.morphs.custom, MINE.morphs.custom, "and still on the body");
});

test("others see them (2026-11-02, the owner): another player's kept sliders are put on this game's copy of them once it has been loaded 4 s, again after it is rebuilt", () => {
  const s = make();
  const copy = { live: preset({}), loaded: true, id: 0x42 };
  const copyActor = { is3DLoaded: () => copy.loaded, isDisabled: () => false, getRace: () => ({ getName: () => "Nord" }) };
  s.sp.Actor = { from: (f) => (f === copy ? copyActor : null) };
  s.sp.Game.getFormEx = (id) => (id === copy.id ? copy : null);
  const charGen = s.sp.callNative;
  s.sp.callNative = (cls, fn, self, ...args) => {
    if (args[0] === copyActor) {
      s.log.natives.push(["copy:" + fn]);
      if (fn === "SaveCharacterPreset") { s.log.files[args[1]] = JSON.stringify(copy.live); return undefined; }
      if (fn === "LoadCharacterPresetEx") { copy.live = JSON.parse(s.log.files[args[1]]); return true; }
    }
    return charGen(cls, fn, self, ...args);
  };
  s.gm.greymarchRmCopies = null;
  s.say({ customPacketType: "greymarchRaceMenuLookOf", actorId: 0x42, look: MINE.morphs ? { morphs: MINE.morphs } : {} });
  const copyLoads = () => s.log.natives.filter((n) => n[0] === "copy:LoadCharacterPresetEx").length;
  for (let i = 0; i < 3; i++) s.gm.greymarchRaceMenuCopiesTick(200000 + i * 1000);
  assert.strictEqual(copyLoads(), 0, "waits until the copy has been there 4 s");
  for (let i = 3; i < 7; i++) s.gm.greymarchRaceMenuCopiesTick(200000 + i * 1000);
  assert.strictEqual(copyLoads(), 1, "then put on");
  assert.deepStrictEqual(copy.live.morphs.custom, MINE.morphs.custom, "the copy has them");
  for (let i = 7; i < 12; i++) s.gm.greymarchRaceMenuCopiesTick(200000 + i * 1000);
  assert.strictEqual(copyLoads(), 1, "once");
  copy.loaded = false; s.gm.greymarchRaceMenuCopiesTick(212000);
  copy.loaded = true; copy.live = preset({}); // rebuilt: the copy lost them
  for (let i = 13; i < 20; i++) s.gm.greymarchRaceMenuCopiesTick(200000 + i * 1000);
  assert.strictEqual(copyLoads(), 2, "again after a rebuild");
});

test("their height at once (2026-11-07, the owner: heights not always right on first draw): set the moment the copy is drawn, read again every 2 s, put right after a rebuild; a new copy is done afresh", () => {
  const s = make();
  const copy = { loaded: false, id: 0x42, scale: 0, sets: [] };
  const copyActor = { is3DLoaded: () => copy.loaded, isDisabled: () => false, getRace: () => ({ getName: () => "Nord" }), getBaseObject: () => "base" };
  s.sp.Actor = { from: (f) => (f === copy ? copyActor : null) };
  s.sp.ActorBase = { from: () => ({ getSex: () => 0 }) };
  s.sp.Game.getFormEx = (id) => (id === copy.id ? copy : null);
  s.sp.callNative = (cls, fn, self, actor, fp, female, node, key, v) => {
    assert.strictEqual(cls, "NiOverride");
    assert.strictEqual(actor, copyActor);
    if (fn === "GetNodeTransformScale") return copy.scale;
    if (fn === "AddNodeTransformScale") { assert.strictEqual(fp, false); copy.sets.push(v); copy.scale = v; return; }
    if (fn === "RemoveNodeTransformScale") { copy.sets.push(1); copy.scale = 0; return; }
    if (fn === "UpdateNodeTransform") return;
    throw new Error("unexpected " + fn);
  };
  s.gm.greymarchRmCopies = null;
  s.say({ customPacketType: "greymarchRaceMenuLookOf", actorId: 0x42, look: { transforms: MINE.transforms } });
  let t = 300000;
  const tick = (ms) => { for (let e = t + ms; t < e; t += 250) s.gm.greymarchRaceMenuHeightsTick(t); };
  tick(1000);
  assert.deepStrictEqual(copy.sets, [], "nothing before it is drawn");
  copy.loaded = true; tick(250);
  assert.deepStrictEqual(copy.sets, [1.1], "drawn: the Height goes on within a quarter second, no 4 s wait");
  tick(5000);
  assert.deepStrictEqual(copy.sets, [1.1], "right: left alone");
  s.gm.greymarchRmCopies[0x42].hDirty = true; tick(2250);
  assert.deepStrictEqual(copy.sets, [1.1, 1.1], "a preset load stored the scale without drawing it (2026-11-10, a staff /height seen by nobody): put on once anyway");
  copy.sets = [1.1];
  copy.scale = 0; tick(2250);
  assert.deepStrictEqual(copy.sets, [1.1, 1.1], "lost (a rebuild, a load): put back within 2 s");
  s.say({ customPacketType: "greymarchRaceMenuLookOf", actorId: 0x42, look: {} });
  tick(500);
  assert.deepStrictEqual(copy.sets, [1.1, 1.1, 1], "no Height kept any more: taken off");
  copy.scale = 0; copy.sets = [];
  s.sp.ActorBase = { from: () => ({ getSex: () => 0 }) };
  copyActor.getRace = () => ({ getName: () => "WerewolfBeastRace" });
  s.say({ customPacketType: "greymarchRaceMenuLookOf", actorId: 0x42, look: { transforms: MINE.transforms } });
  tick(3000);
  assert.deepStrictEqual(copy.sets, [], "never on a werewolf body");
});

test("own height (2026-11-10, the owner: /height did not change the player's own body): the server's Height put on the own skeleton with first person, kept there, never in the race menu, in the 10 s after it, or in a beast body", () => {
  const s = make();
  const me = { scale: 0, sets: [] };
  const player = { is3DLoaded: () => true, getRace: () => ({ getName: () => "Nord" }), getBaseObject: () => "base" };
  s.sp.Game.getPlayer = () => player;
  s.sp.ActorBase = { from: () => ({ getSex: () => 0 }) };
  s.sp.callNative = (cls, fn, self, actor, fp, female, node, key, v) => {
    if (cls !== "NiOverride") return true;
    assert.strictEqual(actor, player);
    if (fn === "GetNodeTransformScale") return fp ? 0 : me.scale;
    if (fn === "AddNodeTransformScale") { me.sets.push([v, fp]); if (!fp) me.scale = v; return; }
    if (fn === "RemoveNodeTransformScale") { me.sets.push([1, fp]); if (!fp) me.scale = 0; return; }
    if (fn === "UpdateNodeTransform") return;
    throw new Error("unexpected " + fn);
  };
  const rmS = s.gm.greymarchRmState();
  rmS.want = { transforms: [{ firstPerson: false, node: "NPC", keys: [{ name: "RSMPlugin", values: [{ data: 2.146, index: 0, key: 20, type: 2 }] }] }] };
  rmS.loadedSince = 1;
  let t = 400000;
  const tick = (ms) => { for (let e = t + ms; t < e; t += 250) s.gm.greymarchOwnHeightTick(t); };
  tick(1000);
  assert.deepStrictEqual(me.sets, [[2.146, false], [2.146, true]], "on, third and first person");
  tick(5000);
  assert.strictEqual(me.sets.length, 2, "right: left alone");
  me.scale = 1; tick(1250);
  assert.strictEqual(me.sets.length, 4, "lost (a load, the preset): put back within a second");
  rmS.menuWas = true; me.scale = 1; me.sets = []; tick(3000);
  assert.deepStrictEqual(me.sets, [], "never while the race menu is open");
  rmS.menuWas = false; rmS.ownHeightHold = t + 10000; tick(9000);
  assert.deepStrictEqual(me.sets, [], "not in the 10 s after the race menu (the player's own slider is on its way)");
  tick(2000);
  assert.strictEqual(me.sets.length, 2, "then the server's again");
  me.sets = []; me.scale = 2.146; rmS.ownHeightDirty = true; tick(1000);
  assert.strictEqual(me.sets.length, 2, "a preset load stored the scale without drawing it: put on (drawn) once anyway");
  tick(3000);
  assert.strictEqual(me.sets.length, 2, "then left alone");
  me.scale = 1; me.sets = []; player.getRace = () => ({ getName: () => "WerewolfBeastRace" }); tick(3000);
  assert.deepStrictEqual(me.sets, [], "never on a werewolf body");
});

test("height kept apart from presets (2026-11-10, the owner: heights not seen right, a Height slider reset): a preset carries the body's Height as it is, a look without a Height never sets one", () => {
  const look = { morphs: { custom: [{ name: "NoseTip", value: 0.4 }] }, transforms: [{ firstPerson: false, node: "NPC", keys: [{ name: "RSMPlugin", values: [{ data: 2.1, index: 0, key: 20, type: 2 }] }, { name: "Other", values: [{ data: 3, index: 0, key: 20, type: 2 }] }] }, { firstPerson: false, node: "NPC Head [Head]", keys: [{ name: "RSMPlugin", values: [{ data: 1.2, index: 0, key: 20, type: 2 }] }] }] };
  assert.strictEqual(rm.heightInLook(look), 2.1);
  assert.strictEqual(rm.heightInLook({ morphs: {} }), null, "none kept");
  assert.strictEqual(rm.heightOfLook({ morphs: {} }), 1);
  const bare = rm.withoutHeight(look);
  assert.strictEqual(rm.heightInLook(bare), null);
  assert.deepStrictEqual(bare.transforms.map((t) => [t.node, t.keys.map((k) => k.name)]), [["NPC", ["Other"]], ["NPC Head [Head]", ["RSMPlugin"]]], "only the NPC node's RSMPlugin goes; the head scale stays");
  const body = { transforms: [{ firstPerson: false, node: "NPC", keys: [{ name: "RSMPlugin", values: [{ data: 0.98, index: 0, key: 20, type: 2 }] }] }] };
  assert.strictEqual(rm.heightInLook(rm.keepHeight(look, body)), 0.98, "the preset carries the body's Height, not the look's");
  assert.strictEqual(rm.heightInLook(rm.keepHeight(look, {})), null);
  assert.strictEqual(rm.sameRaceMenuParts(rm.withoutHeight(look), rm.withoutHeight(rm.keepHeight(look, body))), true, "a Height difference alone loads no preset");
});

test("own height: a server look without a Height never sets one; a body not at 1 sends its look to the server once (its Height lived only in this game)", () => {
  const s = make();
  const me = { scale: 1.085, sets: [] };
  const player = { is3DLoaded: () => true, getRace: () => ({ getName: () => "Nord" }), getBaseObject: () => "base" };
  s.sp.Game.getPlayer = () => player;
  s.sp.ActorBase = { from: () => ({ getSex: () => 0 }) };
  const reports = [];
  s.gm.greymarchRaceMenuReport = () => reports.push(1);
  s.sp.callNative = (cls, fn, self, actor, fp) => {
    if (cls !== "NiOverride") return true;
    if (fn === "GetNodeTransformScale") return fp ? 0 : me.scale;
    if (fn === "AddNodeTransformScale" || fn === "RemoveNodeTransformScale") { me.sets.push(fn); return; }
    return;
  };
  const rmS = s.gm.greymarchRmState();
  rmS.want = { morphs: { custom: [] } };
  rmS.loadedSince = 1; rmS.ownHeightDirty = true;
  let t = 500000;
  for (let e = t + 5000; t < e; t += 250) s.gm.greymarchOwnHeightTick(t);
  assert.deepStrictEqual(me.sets, [], "never set to 1 from a look that keeps no Height (it reset a player's slider)");
  assert.strictEqual(reports.length, 1, "their Height sent to the server once");
});

test("HEIGHT HARD SAVED (2026-11-11, the owner: people growing and shrinking): the report keeps the server's Height unless the player moved the Height slider, and then says so", () => {
  const s = make();
  const hOf = (h) => ({ transforms: [{ firstPerson: false, node: "NPC", keys: [{ name: "RSMPlugin", values: [{ key: 20, type: 2, index: 0, data: h }] }] }] });
  s.sp.Game.getPlayer = () => ({});
  s.gm.greymarchRaceMenuExport = () => hOf(0.97); // the body has a stale 0.97
  const rmS = s.gm.greymarchRmState();
  rmS.want = hOf(1.04); // the server's
  s.gm.greymarchRaceMenuReport();
  let sent = s.log.sent.filter((c) => c.customPacketType === "greymarchRaceMenuLook").pop();
  assert.strictEqual(sent.heightMoved, undefined, "no move: not said");
  assert.strictEqual(sent.look.transforms.find((t) => t.node === "NPC" && !t.firstPerson).keys[0].values[0].data, 1.04, "the server's Height kept, not the body's");
  assert.strictEqual(rmS.ownHeightDirty, true, "and put back on the body");
  rmS.heightMoved = 0.99;
  s.gm.greymarchRaceMenuReport();
  sent = s.log.sent.filter((c) => c.customPacketType === "greymarchRaceMenuLook").pop();
  assert.strictEqual(sent.heightMoved, 0.99, "moved: said");
  assert.strictEqual(rmS.heightMoved, undefined, "said once");
});

const bridgeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
test("HEIGHT HARD SAVED: a slider move away from where it started is noted; the menu opening forgets it; the saved Height is put on again every 10 s", () => {
  assert.match(bridgeSrc, /h\.start = Math\.round\(v \* 1000\) \/ 1000;/);
  assert.match(bridgeSrc, /if \(h\.start === undefined \|\| Math\.abs\(v - h\.start\) > 0\.003\) this\.greymarchRmState\(\)\.heightMoved = v;/);
  assert.match(bridgeSrc, /if \(!rm\.menuWas && open\) rm\.heightMoved = undefined;/);
  assert.match(bridgeSrc, /if \(now >= \(c\.hForceAt \|\| 0\)\) c\.hDirty = true;/);
  assert.match(bridgeSrc, /if \(now >= \(rm\.ownHeightForceAt \|\| 0\)\) rm\.ownHeightDirty = true;/);
});

test("HEIGHT THE MOMENT A BODY LOADS (2026-11-11, the owner: more seamless): the load event puts a copy's Height on the next frame, no wait for the check; other objects ignored", () => {
  const s = make();
  const ID = 0xff000042;
  const copy = { scale: 0, sets: [] };
  const copyActor = { is3DLoaded: () => true, isDisabled: () => false, getRace: () => ({ getName: () => "Nord" }), getBaseObject: () => "base" };
  s.sp.Actor = { from: (f) => (f === copy ? copyActor : null) };
  s.sp.ActorBase = { from: () => ({ getSex: () => 0 }) };
  s.sp.Game.getFormEx = (id) => (id === ID ? copy : null);
  s.sp.callNative = (cls, fn, self, actor, fp, female, node, key, v) => {
    if (fn === "GetNodeTransformScale") return copy.scale;
    if (fn === "AddNodeTransformScale") { copy.sets.push(v); copy.scale = v; }
  };
  s.gm.greymarchRmCopies = null;
  s.say({ customPacketType: "greymarchRaceMenuLookOf", actorId: ID, look: { transforms: MINE.transforms } });
  s.gm.greymarchRaceMenuHeightsTick(300000);
  assert.deepStrictEqual(copy.sets, [1.1]);
  // drawn again (a door, a rebuild): the skeleton back at the race's own size while NiOverride still reads 1.1
  copy.sets = [];
  s.gm.greymarchHeightLoaded({ isLoaded: true, object: { getFormID: () => 0x1234 } });
  s.gm.greymarchHeightLoaded({ isLoaded: true, object: { getFormID: () => ID } });
  s.gm.greymarchHeightLoaded({ isLoaded: true, object: { getFormID: () => ID } });
  assert.deepStrictEqual(s.gm.greymarchHeightLoadQ, [ID], "only SkyMP's copies and the player, once each");
  s.gm.greymarchHeightLoadedTick(300100);
  assert.deepStrictEqual(copy.sets, [1.1], "put on at once, though the stored scale read right");
  s.gm.greymarchHeightLoaded({ isLoaded: false, object: { getFormID: () => ID } });
  assert.deepStrictEqual(s.gm.greymarchHeightLoadQ, [], "an unload is not a load");
  const bridgeSrc2 = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
  assert.match(bridgeSrc2, /this\.sp\.on\("objectLoaded", \(e: any\) => this\.greymarchHeightLoaded\(e\)\)/);
  assert.match(bridgeSrc2, /this\.greymarchHeightLoadedTick\(Date\.now\(\)\);[^\n]*\r?\n\s*this\.greymarchRaceMenuHeightsTick\(Date\.now\(\)\);/);
});

test("PRESETS CARRY THE SERVER'S HEIGHT (2026-11-11, the live log: a copy put at 0.714, back at 1 after its preset load): a look with a Height keeps it; one without takes the body's", () => {
  const hOf = (h) => ({ transforms: [{ firstPerson: false, node: "NPC", keys: [{ name: "RSMPlugin", values: [{ key: 20, type: 2, index: 0, data: h }] }] }] });
  assert.strictEqual(rm.heightInLook(rm.withServerHeight(hOf(0.714), hOf(1))), 0.714, "the server's");
  assert.strictEqual(rm.heightInLook(rm.withServerHeight({ morphs: {} }, hOf(1.05))), 1.05, "none from the server: the body's as it is");
  const src2 = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
  assert.strictEqual((src2.match(/rmMod\.withServerHeight\(/g) || []).length, 2, "the copy's preset and the own preset");
  assert.match(src2, /": told Height " \+ hNow/);
});

test("EVERY COPY GETS ITS TURN (2026-11-11, the owner's log: told Height 1.155 for ff000a62, never put on): copies far away use no turn, so a drawn one with a high id is reached", () => {
  const s = make();
  const near = { scale: 0, sets: [] };
  const nearActor = { is3DLoaded: () => true, isDisabled: () => false, getRace: () => ({ getName: () => "Nord" }), getBaseObject: () => "base" };
  const far = { is3DLoaded: () => false, isDisabled: () => false };
  const NEAR = 0xff000a62;
  s.sp.Actor = { from: (f) => (f === near ? nearActor : f ? far : null) };
  s.sp.ActorBase = { from: () => ({ getSex: () => 0 }) };
  s.sp.Game.getFormEx = (id) => (id === NEAR ? near : { id });
  s.sp.callNative = (cls, fn, self, actor, fp, female, node, key, v) => {
    if (fn === "GetNodeTransformScale") return near.scale;
    if (fn === "AddNodeTransformScale") { near.sets.push(v); near.scale = v; }
  };
  s.gm.greymarchRmCopies = null;
  for (let i = 1; i <= 30; i++) s.say({ customPacketType: "greymarchRaceMenuLookOf", actorId: 0xff000000 + i, look: {} }); // lower ids, not drawn here
  s.say({ customPacketType: "greymarchRaceMenuLookOf", actorId: NEAR, look: { transforms: MINE.transforms } });
  let t = 400000;
  for (let e = t + 1000; t < e; t += 250) s.gm.greymarchRaceMenuHeightsTick(t);
  assert.deepStrictEqual(near.sets, [1.1], "put on within a second, though 30 lower ids are far away");
  assert.ok(s.log.lines.some((l) => /ff000a62: Height 0 -> 1\.1|ff000a62: Height 1 -> 1\.1/.test(l)) || near.sets.length === 1);
});

test("the drawn size (2026-11-12, the owner: XMCG saw them shorter while XMCG's game said the stored scale was right): a copy drawn at another size is put right, and scaled on the skeleton when NiOverride's put does not reach it", () => {
  const s = make();
  const copy = { loaded: true, id: 0x43, scale: 0, sets: [], drawn: 1, reaches: false, direct: [] };
  const copyActor = { is3DLoaded: () => copy.loaded, isDisabled: () => false, getRace: () => ({ getName: () => "Nord" }), getBaseObject: () => "base" };
  s.sp.Actor = { from: (f) => (f === copy ? copyActor : null) };
  s.sp.ActorBase = { from: () => ({ getSex: () => 0 }) };
  s.sp.Game.getFormEx = (id) => (id === copy.id ? copy : null);
  s.sp.NetImmerse = { getNodeScale: (a, node) => { assert.strictEqual(node, "NPC"); return copy.drawn; }, setNodeScale: (a, node, v) => { copy.direct.push(v); copy.drawn = v; } };
  s.sp.callNative = (cls, fn, self, actor, fp, female, node, key, v) => {
    if (fn === "GetNodeTransformScale") return copy.scale;
    if (fn === "AddNodeTransformScale") { copy.sets.push(v); copy.scale = v; if (copy.reaches) copy.drawn = v; return; }
    if (fn === "UpdateNodeTransform") return;
    throw new Error("unexpected " + fn);
  };
  s.gm.greymarchRmCopies = null;
  s.say({ customPacketType: "greymarchRaceMenuLookOf", actorId: 0x43, look: { transforms: [{ firstPerson: false, node: "NPC", keys: [{ name: "RSMPlugin", values: [{ data: 1.165, index: 0, key: 20, type: 2 }] }] }] } });
  let t = 500000;
  const tick = (ms) => { for (let e = t + ms; t < e; t += 250) s.gm.greymarchRaceMenuHeightsTick(t); };
  tick(250);
  assert.deepStrictEqual(copy.direct, [1.165], "the put did not reach the skeleton: the NPC node scaled directly");
  copy.scale = 1.165; copy.drawn = 1; copy.sets = []; copy.direct = []; copy.reaches = true;
  tick(2250);
  assert.deepStrictEqual([copy.sets, copy.direct], [[1.165], []], "stored right but drawn short: put on again, which reached it");
  assert.ok(s.log.lines.some((l) => /drawn at 1 while stored 1\.165; Height 1\.165 put on again, drawn now 1\.165/.test(l)), "said in the log");
  copy.sets = [];
  tick(5000);
  assert.deepStrictEqual(copy.sets, [], "drawn and stored right: left alone until the 10 s put");
});
