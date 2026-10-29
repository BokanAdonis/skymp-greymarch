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
    hasSpell: (s) => (log.known = log.known || new Set()).has(s.id), addSpell: (s) => { (log.known = log.known || new Set()).add(s.id); (log.added = log.added || []).push(s.id); }, removeSpell: (s) => { (log.known = log.known || new Set()).delete(s.id); (log.removed = log.removed || []).push(s.id); },
    playIdleWithTarget: (idle, target) => { log.idles.push([idle.id, target.name]); return true; },
    name: "me",
  };
  const other = { name: "them", playIdleWithTarget: (idle, target) => { log.idles.push([idle.id, target.name, "remote"]); return true; } };
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    browser: { executeJavaScript: (s) => { const m = /__gmHudSend\((.*)\);$/.exec(s); if (m) log.hud.push(JSON.parse(m[1])); } },
    Game: { getPlayer: () => player, getFormEx: (id) => (id === 0x5000 ? other : { id }), getFormFromFile: (id, file) => (file === "Dawnguard.esm" ? { id: DG + id, getFormID: () => DG + id } : file === "Skyrim.esm" ? { id, getFormID: () => id } : null) },
    Spell: { from: (f) => f }, Idle: { from: (f) => f }, Actor: { from: (f) => (f === other ? other : null) },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push([ref.name, name]), notification: (t) => log.notes.push(t) },
    on() {},
  };
  if (opts.native) sp.callNative = opts.native; // GreymarchCamera.dll's Papyrus functions
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

test("blue eyes: every listed vampire gets the eye part for their glow, their own come back; the teeth are never changed (the fangs are a worn item)", () => {
  const s = make({ others: { 0xff000002: 0x5000 } });
  const sp = s.gm.sp;
  const GM = 0x0a000000, FANG_M = GM + 0x81c, FANG_F = GM + 0x81d;
  const typeOf = (id) => (id === FANG_M || id === FANG_F || id === 0x333 || id === 0x444 ? 0 : 2);
  const part = (id) => ({ getFormID: () => id, getType: () => typeOf(id) });
  const worn = { me: { 2: 0x111, 0: 0x333 }, them: { 2: 0x222, 0: 0x444 } }; // name -> type -> head part id
  const body = (name, race, sex) => ({ name, getRace: () => ({ getFormID: () => race }), getBaseObject: () => ({ name, sex }), changeHeadPart: (hp) => { if (hp.getType() === 0 && worn[name][0]) throw new Error("changeHeadPart only adds a second Misc part: the teeth stay"); worn[name][hp.getType()] = hp.getFormID(); }, regenerateHead: () => {} });
  Object.assign(sp.Game.getPlayer(), body("me", 0x13746, 1));
  const them = body("them", 0x13745, 0); // a Khajiit: not made yet
  sp.Game.getFormEx = (id) => (id === 0x5000 ? them : { id });
  sp.Actor.from = (f) => f;
  sp.Game.getFormFromFile = (id, file) => (file === "GreymarchCore.esp" ? { id: GM + id } : file === "Dawnguard.esm" ? { getFormID: () => DG + id } : null);
  sp.HeadPart = { from: (f) => (f ? part(f.id) : null) };
  sp.ActorBase = { from: (b) => (b ? { getSex: () => b.sex, getNumHeadParts: () => 2, getNthHeadPart: (i) => part(worn[b.name][i === 0 ? 2 : 0]), setNthHeadPart: (hp, i) => { worn[b.name][i === 0 ? 2 : 0] = hp.getFormID(); } } : null) };
  let t = 5_000_000; const realNow = Date.now; Date.now = () => t;
  const look = (list) => { s.say({ customPacketType: "greymarchVampLooks", vampires: list }); s.tick(); t += 2500; };
  try {
    s.say({ customPacketType: "greymarchGhosts", ghosts: [], me: 0xff000001 });
    look([{ actor: 0xff000001, glow: 3, fangs: true }, { actor: 0xff000002, glow: 2, fangs: true }]);
    assert.strictEqual(worn.me[2], GM + 0x815 + 3, "a woman at glow 3: GM_VampEyesFemaleBlue3");
    assert.strictEqual(worn.me[0], 0x333, "their own teeth: the fangs are the worn item the server puts on");
    assert.deepStrictEqual(worn.them, { 2: 0x222, 0: 0x444 }, "a Khajiit keeps their eyes and teeth (not made yet)");
    look([{ actor: 0xff000001, glow: 0, fangs: false }]);
    assert.strictEqual(worn.me[2], 0x111, "/eyes off: their own eyes");
    look([{ actor: 0xff000001, glow: 2, fangs: true }]);
    assert.strictEqual(worn.me[0], 0x333);
    look([]);
    assert.deepStrictEqual(worn.me, { 2: 0x111, 0: 0x333 }, "no longer a vampire: their own eyes and teeth");
  } finally { Date.now = realNow; }
});

test("the looks packet says which vampire is this player, so their own eyes and fangs go on without the ghosts or effects packets", () => {
  const s = make();
  assert.ok(!s.gm.greymarchMeActor);
  s.say({ customPacketType: "greymarchVampLooks", vampires: [{ actor: 0xff000009, glow: 1, fangs: true }], me: 0xff000009 });
  assert.strictEqual(s.gm.greymarchMeActor, 0xff000009);
});

test("a fang head part an earlier build left in the parts is swapped back for the race's teeth, once; only the player's own head is rebuilt", () => {
  const s = make({ others: { 0xff000002: 0x5000 } });
  const sp = s.gm.sp;
  const GM = 0x0a000000, FANG_M = GM + 0x81c;
  const part = (id) => ({ getFormID: () => id, getType: () => (id === 0x111 || id === 0x222 ? 2 : 0) });
  const parts = { me: [0x111, 0x330151da, FANG_M], them: [0x222, FANG_M] };
  const calls = [];
  const body = (name) => ({ name, getRace: () => ({ getFormID: () => 0x13746 }), getBaseObject: () => ({ name }), changeHeadPart() {}, regenerateHead: () => calls.push(name + ": head"), queueNiNodeUpdate: () => calls.push(name + ": model") });
  Object.assign(sp.Game.getPlayer(), body("me"));
  const them = body("them");
  sp.Game.getFormEx = (id) => (id === 0x5000 ? them : { id });
  sp.Actor.from = (f) => f;
  sp.Game.getFormFromFile = (id, file) => (file === "GreymarchCore.esp" ? { id: GM + id } : null);
  sp.HeadPart = { from: (f) => (f ? part(f.id) : null) };
  sp.ActorBase = { from: (b) => (b ? { getSex: () => 0, getNumHeadParts: () => parts[b.name].length, getNthHeadPart: (i) => part(parts[b.name][i]), setNthHeadPart: (hp, i) => { parts[b.name][i] = hp.getFormID(); } } : null) };
  let t = 5_000_000; const realNow = Date.now; Date.now = () => t;
  const look = () => { s.say({ customPacketType: "greymarchVampLooks", vampires: [{ actor: 0xff000001, glow: 1, fangs: true }, { actor: 0xff000002, glow: 1, fangs: true }], me: 0xff000001 }); s.tick(); t += 2500; };
  try {
    look(); look();
    assert.deepStrictEqual(parts.me, [0x111, 0x330151da, 0x51631], "the race's teeth back; the hairstyle's part untouched");
    assert.strictEqual(parts.them[1], 0x51631);
    assert.deepStrictEqual(calls.filter((c) => /head|model/.test(c)), ["me: head"], "once, and never a full model refresh");
  } finally { Date.now = realNow; }
});

test("a Potion of Blood drunk from the inventory (the equip event) is reported too", () => {
  const s = make();
  s.fire("equip", { baseObj: { getFormID: () => DG + 0x18ef3 }, actor: me });
  s.fire("equip", { baseObj: { getFormID: () => 0x3eadd }, actor: me }); // a healing potion: not ours
  s.tick();
  assert.deepStrictEqual(s.log.sent.filter((m) => m.customPacketType === "greymarchVamp"), [{ customPacketType: "greymarchVamp", op: "drank" }]);
});

test("the vampire window: the server opens it, the page's questions go to the server, the answers come back, Esc and the page close it", () => {
  const s = make();
  const js = [];
  s.gm.sp.browser = { executeJavaScript: (x) => js.push(x), setVisible() {}, setFocused() {} };
  s.say({ customPacketType: "greymarchVampMenuOpen" });
  assert.strictEqual(s.gm.greymarchVampMenuOn, true);
  assert.ok(js.some((x) => x.includes("greymarch-vampire.html") && x.includes('window.__gmVampRun({"fn":"show"')));
  s.gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "vampire", rid: 3, op: "eyes" })] });
  assert.deepStrictEqual(s.log.sent.filter((m) => m.customPacketType === "greymarchVampMenu"), [{ customPacketType: "greymarchVampMenu", rid: 3, op: "eyes" }]);
  s.say({ customPacketType: "greymarchVampMenuReply", rid: 3, ok: true });
  assert.ok(js.some((x) => x.includes('window.__gmVampRun({"fn":"reply"')));
  s.gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify({ type: "vampire-close" })] });
  assert.strictEqual(s.gm.greymarchVampMenuOn, false);
});

test("eye colours: each bloodline's colour picks its own eye parts (Volkihar red, glow 4)", () => {
  const s = make();
  const sp = s.gm.sp, GM = 0x0a000000;
  const worn = { 2: 0x111, 0: 0x333 };
  const part = (id) => ({ getFormID: () => id, getType: () => (id === 0x333 || id === GM + 0x81c ? 0 : 2) });
  Object.assign(sp.Game.getPlayer(), { getRace: () => ({ getFormID: () => 0x13746 }), getBaseObject: () => ({ sex: 0 }), changeHeadPart: (hp) => { worn[hp.getType()] = hp.getFormID(); } });
  sp.Game.getFormFromFile = (id, file) => (file === "GreymarchCore.esp" ? { id: GM + id } : null);
  sp.HeadPart = { from: (f) => (f ? part(f.id) : null) };
  sp.ActorBase = { from: (b) => (b ? { getSex: () => b.sex, getNumHeadParts: () => 2, getNthHeadPart: (i) => part(worn[i === 0 ? 2 : 0]) } : null) };
  s.say({ customPacketType: "greymarchGhosts", ghosts: [], me: 0xff000001 });
  s.say({ customPacketType: "greymarchVampLooks", vampires: [{ actor: 0xff000001, glow: 4, fangs: false, eyes: "red" }] });
  s.tick();
  assert.strictEqual(worn[2], GM + 0x81f + 4, "GM_VampEyesMaleRed4");
});

test("a bloodline change turns the eyes at once; a game that starts with one of our eye parts already on still knows the character's own eyes", () => {
  const s = make();
  const sp = s.gm.sp, GM = 0x0a000000;
  const worn = { 2: GM + 0x80e + 3, 0: 0x333 }; // already wearing our blue glow-3 part (a reload of the game's script)
  const part = (id) => ({ getFormID: () => id, getType: () => (id === 0x333 ? 0 : 2) });
  Object.assign(sp.Game.getPlayer(), { getRace: () => ({ getFormID: () => 0x13746 }), getBaseObject: () => ({ sex: 0 }), changeHeadPart: (hp) => { worn[hp.getType()] = hp.getFormID(); } });
  sp.Game.getFormFromFile = (id, file) => (file === "GreymarchCore.esp" ? { id: GM + id } : null);
  sp.Game.getFormEx = (id) => ({ id });
  sp.HeadPart = { from: (f) => (f ? part(f.id) : null) };
  sp.ActorBase = { from: (b) => (b ? { getSex: () => b.sex, getNumHeadParts: () => 2, getNthHeadPart: (i) => part(worn[i === 0 ? 2 : 0]) } : null) };
  let t = 7_000_000; const realNow = Date.now; Date.now = () => t;
  const look = (v) => { s.say({ customPacketType: "greymarchVampLooks", vampires: [Object.assign({ actor: 0xff000001, fangs: false }, v)] }); s.tick(); t += 2500; };
  try {
    s.say({ customPacketType: "greymarchGhosts", ghosts: [], me: 0xff000001 });
    look({ glow: 3, eyes: "blue" });
    look({ glow: 3, eyes: "red" });
    assert.strictEqual(worn[2], GM + 0x81f + 3, "Volkihar: red at once");
    look({ glow: 0, eyes: "red" });
    assert.strictEqual(worn[2], GM + 0x81f, "no own eyes known yet (ours were on from the start): red without glow rather than nothing");
    worn[2] = 0x111; // SkyMP puts the character's saved look back: their own eyes
    look({ glow: 0, eyes: "red" });
    assert.strictEqual(worn[2], 0x111, "now their own eyes are known and shown while /eyes hides them");
    look({ glow: 4, eyes: "green" });
    assert.strictEqual(worn[2], GM + 0x83d + 4);
    assert.ok(s.log.lines.some((l) => /has green eyes, glow 4/.test(l)));
  } finally { Date.now = realNow; }
});

test("a vampire of a race without vampire eyes (khajiit, argonian) keeps their eyes, and the log says why once", () => {
  const s = make({ others: { 0xff000002: 0x5000 } });
  const sp = s.gm.sp;
  const them = { getRace: () => ({ getFormID: () => 0x13745 }), getBaseObject: () => ({}) };
  sp.Game.getFormEx = (id) => (id === 0x5000 ? them : { id });
  sp.Actor.from = (f) => f;
  sp.HeadPart = { from: () => null };
  let t = 9_000_000; const realNow = Date.now; Date.now = () => t;
  try {
    s.say({ customPacketType: "greymarchVampLooks", vampires: [{ actor: 0xff000002, glow: 2, fangs: true, eyes: "red" }] });
    s.tick(); t += 2500; s.tick();
    assert.strictEqual(s.log.lines.filter((l) => /keeps their eyes: no vampire eyes for race 13745/.test(l)).length, 1);
  } finally { Date.now = realNow; }
});

test("the worn fangs: on (kept on) only while the server's look of this player says they show, off when /fangs hides them; nothing without the item", () => {
  const s = make();
  const sp = s.gm.sp;
  const DB = 0x04000000, FANGS = DB + 0x0323fe; // DLC2ApocryphaBookWarpArmor
  let have = 0, on = false; const calls = [];
  sp.Game.getFormFromFile = (id, file) => (file === "Dragonborn.esm" ? { id: DB + id, getFormID: () => DB + id } : null);
  Object.assign(sp.Game.getPlayer(), { getItemCount: (f) => (f.id === FANGS ? have : 0), isEquipped: () => on,
    equipItem: (f, keep, silent) => { calls.push(["on", f.id, keep, silent]); on = true; }, unequipItem: (f, keep, silent) => { calls.push(["off", f.id]); on = false; } });
  const look = (fangs) => s.say({ customPacketType: "greymarchVampLooks", vampires: [{ actor: 0xff000001, glow: 1, fangs }], me: 0xff000001 });
  look(true);
  s.gm.greymarchVampFangsWear(1_000);
  assert.deepStrictEqual(calls, [], "nothing to wear");
  have = 1;
  s.gm.greymarchVampFangsWear(1_500);
  assert.deepStrictEqual(calls, [], "once a second");
  s.gm.greymarchVampFangsWear(2_100);
  assert.deepStrictEqual(calls, [["on", FANGS, true, true]], "on, and kept on");
  s.gm.greymarchVampFangsWear(3_200);
  assert.strictEqual(calls.length, 1, "already on");
  look(false); // /fangs hides them
  s.gm.greymarchVampFangsWear(4_300);
  assert.deepStrictEqual(calls.pop(), ["off", FANGS], "off");
  s.gm.greymarchVampFangsWear(5_400);
  assert.strictEqual(calls.length, 1, "and not put back on (it used to be, within a second)");
  look(true);
  s.gm.greymarchVampFangsWear(6_500);
  assert.deepStrictEqual(calls.pop(), ["on", FANGS, true, true], "bared again");
});

test("the powers the server names are added when the game is missing them, and the ones it added go again when the server stops naming them", () => {
  const s = make();
  const realNow = Date.now; let t = 1_000_000; Date.now = () => t;
  try {
    s.say(state({ spells: ["8d5bf:Skyrim.esm", "38ba:Dawnguard.esm", "1:Nowhere.esp"] }));
    s.tick();
    assert.deepStrictEqual(s.log.added, [0x8d5bf, DG + 0x38ba], "both added; a record this game does not have is skipped");
    assert.ok(s.log.lines.some((l) => /power 8d5bf:Skyrim.esm was missing from this game: added/.test(l)));
    t += 500; s.tick();
    assert.strictEqual(s.log.added.length, 2, "checked every 2 seconds, not every frame");
    t += 2000; s.tick();
    assert.strictEqual(s.log.added.length, 2, "already there: nothing added twice");
    s.say(state({ spells: ["8d5bf:Skyrim.esm"] })); // Mist Form cooling down
    t += 2000; s.tick();
    assert.deepStrictEqual(s.log.removed, [DG + 0x38ba]);
    s.say({ customPacketType: "greymarchVampire", on: false });
    t += 2000; s.tick();
    assert.deepStrictEqual(s.log.removed, [DG + 0x38ba, 0x8d5bf], "no longer a vampire: what this added goes");
  } finally { Date.now = realNow; }
});

test("the drain costs the server names go on the spell records (GreymarchCamera.dll), each told back; a record no longer named gets its own cost back; no DLL: nothing told", () => {
  const calls = [];
  const s = make({ native: (cls, fn, self, spell, cost) => { calls.push([cls, fn, spell.id, cost]); return cost < 0 ? 17 : cost; } });
  const told = () => s.log.sent.filter((m) => m.op === "cost");
  s.say(state({ costs: { "8d5c2:Skyrim.esm": 0 } }));
  s.tick(); s.tick();
  assert.deepStrictEqual(calls, [["GreymarchCam", "SetSpellCost", 0x8d5c2, 0]], "set once");
  assert.deepStrictEqual(told(), [{ customPacketType: "greymarchVamp", op: "cost", spell: "8d5c2:Skyrim.esm", cost: 0 }]);
  s.say(state({ costs: { "8d5c2:Skyrim.esm": 0 } })); s.tick();
  assert.strictEqual(told().length, 2, "told again after a state packet (a reconnect)");
  s.say(state({ costs: { "8d5c2:Skyrim.esm": 4, "19ad7:Dawnguard.esm": 30 } })); s.tick();
  assert.deepStrictEqual(calls.slice(-2), [["GreymarchCam", "SetSpellCost", 0x8d5c2, 4], ["GreymarchCam", "SetSpellCost", DG + 0x19ad7, 30]]);
  s.say({ customPacketType: "greymarchVampire", on: false }); s.tick();
  assert.deepStrictEqual(calls.slice(-2).map((c) => c[3]), [-1, -1], "vampirism gone: both records their own again");
  assert.deepStrictEqual(told().slice(-2).map((m) => m.cost), [null, null]);
  const old = make({ native: () => { throw new Error("no such function"); } });
  old.say(state({ costs: { "8d5c2:Skyrim.esm": 0 } })); old.tick(); old.tick();
  assert.deepStrictEqual(old.log.sent.filter((m) => m.op === "cost"), [], "an older DLL: the server keeps correcting");
  assert.strictEqual(old.log.lines.filter((l) => /GreymarchCamera.dll 1.5 missing/.test(l)).length, 1, "said once");
});

test("the Spells balance tab's costs go on the spell records too (GreymarchCamera.dll), each told back as greymarchSpellCost; one no longer named gets its own cost back", () => {
  const calls = [];
  const s = make({ native: (cls, fn, self, spell, cost) => { calls.push([fn, spell.id, cost]); return cost < 0 ? 41 : cost; } });
  const tick = () => { s.gm.greymarchSpellCostNext = 0; s.gm.greymarchSpellCostTick(); };
  const told = () => s.log.sent.filter((m) => m.customPacketType === "greymarchSpellCost");
  tick(); assert.deepStrictEqual(calls, [], "nothing named: nothing touched");
  s.say({ customPacketType: "greymarchSpellCosts", costs: { "12fce:Skyrim.esm": 20, "12fcd:Skyrim.esm": 4 } });
  tick(); tick();
  assert.deepStrictEqual(calls, [["SetSpellCost", 0x12fce, 20], ["SetSpellCost", 0x12fcd, 4]], "each set once");
  assert.deepStrictEqual(told().map((m) => [m.spell, m.cost]), [["12fce:Skyrim.esm", 20], ["12fcd:Skyrim.esm", 4]]);
  s.say({ customPacketType: "greymarchSpellCosts", costs: { "12fce:Skyrim.esm": 30 } }); tick();
  assert.deepStrictEqual(calls.slice(-2), [["SetSpellCost", 0x12fce, 30], ["SetSpellCost", 0x12fcd, -1]], "changed, and Flames back to its own");
  assert.deepStrictEqual(told().slice(-2).map((m) => [m.spell, m.cost]), [["12fce:Skyrim.esm", 30], ["12fcd:Skyrim.esm", null]]);
  const old = make({ native: () => { throw new Error("no such function"); } });
  old.say({ customPacketType: "greymarchSpellCosts", costs: { "12fce:Skyrim.esm": 20 } }); old.gm.greymarchSpellCostTick();
  assert.deepStrictEqual(old.log.sent.filter((m) => m.customPacketType === "greymarchSpellCost"), [], "an older DLL: nothing told, the server keeps correcting");
});

test("another player's head is drawn again after their eyes change, so /eyes leaves no vampire eyes floating on the forehead (2026-10-29); this player's own head is not", () => {
  const s = make({ others: { 0xff000002: 0x5000 } });
  const sp = s.gm.sp;
  const GM = 0x0a000000;
  const part = (id) => ({ getFormID: () => id, getType: () => 2 });
  const worn = { me: { 2: 0x111 }, them: { 2: 0x222 } };
  const redrawn = { me: 0, them: 0 };
  const body = (name) => ({ name, getRace: () => ({ getFormID: () => 0x13746 }), getBaseObject: () => ({ name, sex: 0 }), changeHeadPart: (hp) => { worn[name][2] = hp.getFormID(); }, regenerateHead: () => {}, is3DLoaded: () => true, queueNiNodeUpdate: () => { redrawn[name]++; } });
  Object.assign(sp.Game.getPlayer(), body("me"));
  const them = body("them");
  sp.Game.getFormEx = (id) => (id === 0x5000 ? them : { id });
  sp.Actor.from = (f) => f;
  sp.Game.getFormFromFile = (id, file) => (file === "GreymarchCore.esp" ? { id: GM + id } : file === "Dawnguard.esm" ? { getFormID: () => DG + id } : null);
  sp.HeadPart = { from: (f) => (f ? part(f.id) : null) };
  sp.ActorBase = { from: (b) => (b ? { getSex: () => b.sex, getNumHeadParts: () => 1, getNthHeadPart: () => part(worn[b.name][2]), setNthHeadPart: () => {} } : null) };
  let t = 7_000_000; const realNow = Date.now; Date.now = () => t;
  const look = (list) => { s.say({ customPacketType: "greymarchVampLooks", vampires: list }); s.tick(); t += 2500; };
  try {
    s.say({ customPacketType: "greymarchGhosts", ghosts: [], me: 0xff000001 });
    look([{ actor: 0xff000001, glow: 2, fangs: false }, { actor: 0xff000002, glow: 2, fangs: false, eyes: "yellow" }]);
    assert.strictEqual(worn.them[2], GM + 0x82e + 2, "their yellow eyes");
    assert.strictEqual(redrawn.them, 1);
    look([{ actor: 0xff000001, glow: 2, fangs: false }, { actor: 0xff000002, glow: 2, fangs: false, eyes: "yellow" }]);
    assert.strictEqual(redrawn.them, 1, "nothing changed: not drawn again");
    look([{ actor: 0xff000001, glow: 2, fangs: false }, { actor: 0xff000002, glow: 0, fangs: false, eyes: "yellow" }]);
    assert.strictEqual(worn.them[2], 0x222, "/eyes: their own eyes");
    assert.strictEqual(redrawn.them, 2, "and the head drawn again, so the vampire eyes are gone");
    look([{ actor: 0xff000001, glow: 2, fangs: false }]);
    assert.strictEqual(redrawn.them, 3, "no longer a vampire: their own eyes put back and the head drawn again");
    assert.strictEqual(redrawn.me, 0, "this player's own head is left to the game");
  } finally { Date.now = realNow; }
});
