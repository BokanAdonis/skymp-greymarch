"use strict";
// Creature forms, the game's half (src/greymarch/bridge.ts): the server says which creature, the body changes; the server says back, the body, the head and the gear come back.
// Clicks play the creature's own attack animations and report the swing to the server.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const NORD = 0x13746, GOAT = 0x131fa, GIANT = 0x131f9;
const ATTACKS = { normal: ["attackStart_ClubAttack1", "attackStart_ClubAttack2"], power: ["attackPowerStart_Stomp"] };
function make(opts = {}) {
  const log = { lines: [], races: [], calls: [], equipped: [], events: [], sent: [], notes: [], applied: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: (id) => id - 0xff000000 + 0x10000 }, "../sync/appearance": { applyAppearanceToPlayer: (a) => log.applied.push(a) }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const race = (id) => ({ id, getFormID: () => id });
  let current = NORD, menu = false, crosshair = null;
  const items = { 0x12eb7: 1, 0x13911: 1 };
  const base = { parts: [0xe1, 0xe2, 0xe3], sex: opts.female ? 1 : 0, getNumHeadParts: () => base.parts.length, getNthHeadPart: (i) => ({ getFormID: () => base.parts[i] }), getSex: () => base.sex, setNthHeadPart: (hp, i) => { base.parts[i] = hp.id; }, getRace: () => race(current) };
  const player = {
    getRace: () => race(current), setRace: (r) => { current = r.id; log.races.push(r.id); },
    unequipAll: () => log.calls.push("unequipAll"), getBaseObject: () => base, queueNiNodeUpdate: () => log.calls.push("redraw"),
    getItemCount: (f) => items[f.id] || 0, equipItem: (f) => log.equipped.push(f.id),
    hasSpell: () => false, hasMagicEffect: () => false,
  };
  const call = (name) => (...a) => log.calls.push(name + (a.length ? ":" + a[0] : ""));
  const storage = {};
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l), storage,
    Game: { getPlayer: () => player, getFormEx: (id) => (opts.noRace && id === opts.noRace ? null : { id }), getFormFromFile: () => null, setBeastForm: call("beastForm"), enableFastTravel: call("fastTravel"), disablePlayerControls: call("controlsOff"), enablePlayerControls: call("controlsOn"), forceThirdPerson: call("thirdPerson"), showFirstPersonGeometry() {}, getCurrentCrosshairRef: () => crosshair },
    Race: { from: (f) => (f ? race(f.id) : null) }, ActorBase: { from: (b) => b }, HeadPart: { from: (f) => f }, Spell: { from: () => null }, MagicEffect: { from: () => null },
    TESModPlatform: { resizeHeadpartsArray: (b, n) => { b.parts.length = n; }, setNpcSex: (b, s) => { b.sex = s; } },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push(name), notification: (t) => log.notes.push(t) }, Utility: { isInMenuMode: () => menu }, on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, m) => { if (n !== "sendMessage") return; const j = JSON.parse(m.message.contentJsonDump); if (j.customPacketType === "greymarchShapeAttack") log.sent.push(j); } } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  let t = 1_000_000;
  const realNow = Date.now;
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const tick = (ms = 300) => { t += ms; at(() => gm.greymarchShapeTick()); };
  const say = (msg) => at(() => gm.greymarchPacket({ customPacketType: "greymarchShape", ...msg }));
  const click = (code = 256) => at(() => { gm.greymarchKey({ code, isDown: true }); gm.greymarchKey({ code, isUp: true }); });
  return { gm, log, tick, say, click, base, storage, race: () => current, setRace: (id) => { current = id; }, setMenu: (v) => { menu = v; }, aim: (id) => { crosshair = id ? { getFormID: () => id } : null; } };
}
const giant = { on: true, race: GIANT, back: NORD, name: "Giant", attacks: ATTACKS };

test("the server says goat: menus and fast travel off, third person, gear off, the head taken off the record and male, then the goat's race", () => {
  const s = make({ female: true });
  s.say({ on: true, race: GOAT, back: NORD, name: "Goat", attacks: { normal: ["attackStart_Attack1"], power: [] } });
  s.tick();
  assert.strictEqual(s.race(), GOAT);
  assert.deepStrictEqual(s.log.calls, ["beastForm:true", "fastTravel:false", "controlsOff:false", "thirdPerson", "unequipAll"]);
  assert.deepStrictEqual(s.base.parts, [], "no human head on the goat");
  assert.strictEqual(s.base.sex, 0, "the male animation set");
  assert.strictEqual(s.storage.greymarchShapeOn, true, "the game's own hits are not reported");
  assert.ok(s.log.events.includes("IdleForceDefaultState"));
  assert.ok(s.log.lines.some((l) => /became Goat \(race now 131fa, will change back to 13746, 1 attacks, 0 power attacks\)/.test(l)));
  s.tick(); s.tick();
  assert.deepStrictEqual(s.log.races, [GOAT], "changed once, not every tick");
});

test("ONE race change each way (two in one frame left a headless person with a creature's race)", () => {
  const s = make();
  s.say(giant); s.tick();
  assert.deepStrictEqual(s.log.races, [GIANT]);
  s.say({ on: false, back: NORD, wear: [] }); s.tick();
  assert.deepStrictEqual(s.log.races, [GIANT, NORD]);
});

test("the character's own look that SkyMP kept aside during the form is put back a moment after the body is back", () => {
  const s = make();
  s.say(giant); s.tick();
  const own = { raceId: NORD, headpartIds: [0xe1], name: "Alda" };
  s.storage.greymarchPendingAppearance = own; // remoteServer.ts kept it (the form was on)
  s.say({ on: false, back: NORD, wear: [] }); s.tick();
  assert.deepStrictEqual(s.log.applied, [], "not at once");
  s.tick(1100);
  assert.deepStrictEqual(s.log.applied, [own]);
  assert.strictEqual(s.storage.greymarchPendingAppearance, null);
});

test("remoteServer.ts keeps a look with no head parts (a creature's) and any look during a form away from the player's own body", () => {
  const rs = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "remoteServer.ts"), "utf8");
  assert.ok(rs.includes("if (noHead || storage[\"greymarchShapeOn\"] === true) {"));
  assert.ok(rs.includes("storage[\"greymarchPendingAppearance\"] = noHead ? null : newAppearance;"));
});

test("the server says back: head, sex and race back, controls, and the gear a moment later", () => {
  const s = make({ female: true });
  s.say(giant); s.tick();
  s.log.calls.length = 0; s.log.races.length = 0;
  s.say({ on: false, back: NORD, wear: [0x12eb7, 0x13911, 0x99999] });
  s.tick();
  assert.deepStrictEqual(s.log.races, [NORD]);
  assert.strictEqual(s.race(), NORD);
  assert.deepStrictEqual(s.base.parts, [0xe1, 0xe2, 0xe3], "her own head");
  assert.strictEqual(s.base.sex, 1);
  assert.strictEqual(s.storage.greymarchShapeOn, false);
  assert.deepStrictEqual(s.log.calls, ["controlsOn:false", "beastForm:false", "fastTravel:true", "redraw"]);
  assert.deepStrictEqual(s.log.equipped, [], "not at once");
  s.tick(1100);
  assert.deepStrictEqual(s.log.equipped, [0x12eb7, 0x13911], "what they still carry is put on; what they do not have is skipped");
});

test("one creature to another changes only the race; the head and sex kept are still the character's own", () => {
  const s = make({ female: true });
  s.say({ on: true, race: GOAT, back: NORD, name: "Goat", attacks: ATTACKS }); s.tick();
  s.say(giant); s.tick();
  assert.strictEqual(s.race(), GIANT);
  assert.strictEqual(s.log.calls.filter((c) => c === "unequipAll").length, 1);
  s.say({ on: false, back: NORD, wear: [] }); s.tick();
  assert.strictEqual(s.race(), NORD);
  assert.deepStrictEqual(s.base.parts, [0xe1, 0xe2, 0xe3]);
  assert.strictEqual(s.base.sex, 1);
});

test("a click plays one of the creature's own attacks and reports the swing about when it lands, with the actor under the crosshair", () => {
  const s = make();
  s.say(giant); s.tick();
  s.aim(0xff000005);
  s.click(); s.tick(10);
  assert.ok(ATTACKS.normal.includes(s.log.events[s.log.events.length - 1]), "a club attack");
  assert.deepStrictEqual(s.log.sent, [], "not reported yet");
  s.tick(500);
  assert.deepStrictEqual(s.log.sent, [{ customPacketType: "greymarchShapeAttack", power: false, target: 0x10005 }]);
});

test("right click is a power attack; the creature's pace is kept; a menu or the chat stops the click", () => {
  const s = make();
  s.say(giant); s.tick();
  s.click(257); s.tick(10);
  assert.strictEqual(s.log.events[s.log.events.length - 1], "attackPowerStart_Stomp");
  const n = s.log.events.length;
  s.click(); s.tick(600);
  assert.strictEqual(s.log.events.length, n, "too soon after a power attack");
  s.tick(1100); s.click(); s.tick(10);
  assert.strictEqual(s.log.events.length, n + 1, "rested");
  s.tick(2000); s.setMenu(true); s.click(); s.tick(10);
  assert.strictEqual(s.log.events.length, n + 1, "not in a menu");
  s.setMenu(false); s.gm.greymarchChatTyping = true; s.click(); s.tick(10);
  assert.strictEqual(s.log.events.length, n + 1, "not while typing");
});

test("a creature with no attacks says so (not every click); a person's click is not touched", () => {
  const s = make();
  s.click(); s.tick(10);
  assert.deepStrictEqual(s.log.events, [], "no form: the game's own attack");
  s.say({ on: true, race: 0xa919d, back: NORD, name: "Chicken", attacks: { normal: [], power: [] } }); s.tick();
  s.click(); s.tick(10); s.click(); s.tick(10);
  assert.deepStrictEqual(s.log.notes, ["A Chicken cannot attack."]);
  s.tick(600);
  assert.deepStrictEqual(s.log.sent, []);
});

test("a race the game put back is set again (every 3 seconds at most)", () => {
  const s = make();
  s.say(giant); s.tick();
  s.setRace(NORD);
  s.tick(3500);
  assert.strictEqual(s.race(), GIANT);
  assert.ok(s.log.lines.some((l) => /set again/.test(l)));
});

test("no word from the server for 20 seconds: they change back by themselves; the repeats keep the form", () => {
  const s = make();
  s.say(giant); s.tick();
  for (let i = 0; i < 6; i++) { s.tick(5000); s.say(giant); }
  assert.strictEqual(s.race(), GIANT, "said every 5 seconds: still a giant after 30 seconds");
  s.tick(21000);
  assert.strictEqual(s.race(), NORD);
  assert.deepStrictEqual(s.base.parts, [0xe1, 0xe2, 0xe3], "their head back even without the server");
  assert.ok(s.log.lines.some((l) => /no word from the server/.test(l)));
});

test("a race this game does not have is logged, not retried every quarter second, and nothing breaks", () => {
  const s = make({ noRace: 0x4014495 });
  s.say({ on: true, race: 0x4014495, back: NORD, name: "Lurker", attacks: ATTACKS }); s.tick(); s.tick(); s.tick();
  assert.strictEqual(s.race(), NORD);
  assert.strictEqual(s.log.lines.filter((l) => /change failed at step 'race'/.test(l)).length, 1);
  s.say({ on: false, back: NORD, wear: [] }); s.tick();
  assert.strictEqual(s.race(), NORD);
});

test("every packet the bridge handles is let through to it by authService.ts (a packet missing there never arrives: creature forms did nothing in game because of that)", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");
  const allowed = new Set([...auth.matchAll(/case '(greymarch[A-Za-z]+)':/g)].map((m) => m[1]));
  const handled = [...new Set([...src.matchAll(/type === "(greymarch[A-Za-z]+)"/g)].map((m) => m[1]))];
  assert.ok(handled.includes("greymarchShape"));
  for (const t of handled) assert.ok(allowed.has(t), t + " is handled by the bridge but authService.ts drops it");
});
