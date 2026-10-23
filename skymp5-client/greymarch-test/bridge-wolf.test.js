"use strict";
// The werewolf, the game's half (src/greymarch/bridge.ts): the transformation animation before the change, the roar on R, the feeding animation on the server's word.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

const BEAST = 0xcdd84, NORD = 0x13746, ALPHA = 0xfe000804, PUP = 0xfe00080a, BLACK = 0xfe00085c, POLAR = 0xfe000861;
const FROST = 0xfe000866, RABID = 0xfe00086b, MOONBORN = 0xfe000870, ELDER = 0xfe000875; // the forms of 2026-10-21
function make(opts = {}) {
  const log = { lines: [], idles: [], events: [], races: [], waits: [], sent: [], applied: [], equipped: [], sounds: [], redraws: 0 };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (opts.others || {})[id] || 0 }, "../sync/appearance": { applyAppearanceToPlayer: (a) => log.applied.push(a) }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const race = (id) => ({ id, getFormID: () => id });
  let current = NORD, menu = false;
  const player = {
    getRace: () => race(current), setRace: (r) => { current = r.id; log.races.push(r.id); },
    playIdle: (idle) => { log.idles.push(idle.id); return opts.refuseIdle ? false : true; },
    waitForAnimationEvent: (name) => new Promise((resolve) => log.waits.push({ name, resolve })),
    hasSpell: () => true, hasMagicEffect: () => false, dispelSpell() {}, getBaseObject: () => null,
    unequipAll() { log.unequipped = true; },
    getWornForm: (mask) => ((opts.worn || {})[mask] ? { getFormID: () => opts.worn[mask] } : null),
    getEquippedWeapon: (left) => (!left && opts.weapon ? { getFormID: () => opts.weapon } : null), getEquippedShield: () => null,
    getEquippedSpell: (slot) => (slot === 2 && opts.slotted !== false ? { getFormID: () => 0x92c48 } : null),
    getItemCount: (form) => ((opts.have || []).includes(form.id) ? 1 : 0), equipItem: (form) => log.equipped.push(form.id), queueNiNodeUpdate: () => { log.redraws++; },
  };
  const pass = (f) => (f ? f : null);
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => player, getFormEx: (id) => ({ id }), getFormFromFile: (id, file) => (opts.noAlpha || file !== "GreymarchCore.esp" ? null : id === 0x804 ? { getFormID: () => ALPHA } : id === 0x80a ? { getFormID: () => PUP } : id === 0x85c ? { getFormID: () => BLACK } : id === 0x861 ? { getFormID: () => POLAR } : ({ 0x866: FROST, 0x86b: RABID, 0x870: MOONBORN, 0x875: ELDER })[id] ? { getFormID: () => ({ 0x866: FROST, 0x86b: RABID, 0x870: MOONBORN, 0x875: ELDER })[id] } : null), setBeastForm() {}, enableFastTravel() {}, disablePlayerControls() {}, enablePlayerControls() {}, forceThirdPerson() {}, showFirstPersonGeometry() {} },
    Spell: { from: pass }, MagicEffect: { from: pass }, Race: { from: (f) => race(f.id) }, Actor: { from: (f) => (f && opts.actors && opts.actors[f.id]) || null }, Idle: { from: pass }, FormList: { from: () => null }, ImageSpaceModifier: { from: () => null }, Sound: { from: (f) => (f ? { play: (at) => { log.sounds.push([f.id, at && at.id !== undefined ? at.id : "player"]); return 1; } } : null) }, ObjectReference: { from: (f) => (f ? { id: f.id } : null) }, ActorBase: { from: () => null },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push(name), notification() {} },
    Utility: { isInMenuMode: () => menu },
    on() {},
    storage: {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, m) => { if (n === "sendMessage") log.sent.push(JSON.parse(m.message.contentJsonDump)); } } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  let t = 1_000_000;
  const realNow = Date.now;
  const tick = (ms = 300) => { t += ms; Date.now = () => t; try { gm.greymarchWolfTick(); } finally { Date.now = realNow; } };
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const say = (msg) => at(() => gm.greymarchPacket(msg));
  const key = (code, down) => at(() => gm.greymarchKey({ code, isDown: down }));
  return { gm, log, sp, tick, say, key, race: () => current, setMenu: (v) => { menu = v; } };
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

test("R is the roar: a werewolf howls on its own body (HowlStart, HowlRelease) and it is reported; only while changed, never in a menu; no wait, one roar per press", () => {
  const s = make({ refuseIdle: true });
  s.key(19, true); s.key(19, false); s.tick();
  assert.deepStrictEqual(s.log.events, [], "human: R is the game's own key");
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  const calls = () => s.log.sent.filter((m) => m.customPacketType === "greymarchWolf" && m.op === "howl").length;
  s.key(19, true); s.tick(); s.tick();
  assert.strictEqual(calls(), 1);
  s.key(19, true); s.tick();
  assert.strictEqual(calls(), 1, "holding R is one roar");
  s.key(19, false); s.key(19, true); s.tick(); s.tick();
  assert.strictEqual(calls(), 2, "no wait: the next press roars at once");
  s.setMenu(true); s.key(19, false); s.key(19, true); s.tick();
  assert.strictEqual(calls(), 2, "not in a menu");
  s.setMenu(false);
  s.gm.greymarchChatTyping = true; s.key(19, false); s.key(19, true); s.tick();
  assert.strictEqual(calls(), 2, "typing in the chat is not a roar");
  assert.deepStrictEqual(s.log.events.filter((e) => /^howl/i.test(e)), ["HowlStart", "HowlRelease", "HowlStart", "HowlRelease"], "the vanilla howl, once per roar");
  assert.deepStrictEqual(s.log.sounds.filter((x) => x[0] === 0x101008 || x[0] === 0x0f95bb), [], "the howl brings its own sound here");
});

test("Z with Beast Form in the power slot and no cast seen (the game's own lock): the press is reported to the server once; not when the game casts it, not without the power slotted, not in a menu", () => {
  const games = (s) => s.log.sent.filter((m) => m.customPacketType === "greymarchWolf" && m.op === "game").length;
  const s = make({ refuseIdle: true });
  s.key(44, true); s.tick(100); s.key(44, false); s.tick(100);
  assert.strictEqual(games(s), 0, "the game gets its moment to cast it");
  s.tick(600);
  assert.strictEqual(games(s), 1, "no cast seen: the press is the use");
  assert.ok(s.log.lines.some((l) => /no cast seen/.test(l)));
  s.tick(300); s.tick(300);
  assert.ok(games(s) >= 1);
  const c = make({ refuseIdle: true });
  c.key(44, true); c.gm.greymarchWolfSignal("spellCast"); c.tick(100); c.tick(700); c.tick(300);
  assert.strictEqual(c.log.lines.filter((l) => /no cast seen/.test(l)).length, 0, "the game cast it: the cast is the use");
  assert.strictEqual(games(c), 1);
  const n = make({ refuseIdle: true, slotted: false });
  n.key(44, true); n.tick(100); n.tick(700); n.tick(300);
  assert.strictEqual(games(n), 0, "Z without Beast Form slotted is the player's other power or shout");
  const m = make({ refuseIdle: true });
  m.setMenu(true); m.key(44, true); m.tick(100); m.tick(700);
  assert.strictEqual(games(m), 0, "not from a menu");
});

test("crash breadcrumbs: the change, the howl and the change back each write a line first (greymarch-crumbs)", () => {
  const s = make({ refuseIdle: true });
  s.say({ customPacketType: "greymarchWolfForm", on: true }); s.tick();
  s.key(19, true); s.tick(); s.tick();
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
  const crumbs = s.log.lines.filter((l) => /^\d+\.\ds (beast|creature form):/.test(l)).map((l) => l.replace(/^\d+\.\ds /, ""));
  assert.deepStrictEqual(crumbs, ["beast: change starts", "beast: howl", "beast: change back"]);
});

test("another player's roar: the server's greymarchWolfRoar plays the sound on that player's NPC here (a bear's for a bear); nothing for a player not drawn here", () => {
  const s = make({ others: { 601: 0xff000c01, 602: 0xff000c02 } });
  s.say({ customPacketType: "greymarchWolfRoar", actor: 601, bear: false });
  s.say({ customPacketType: "greymarchWolfRoar", actor: 602, bear: true });
  s.say({ customPacketType: "greymarchWolfRoar", actor: 999, bear: false });
  s.tick();
  assert.deepStrictEqual(s.log.sounds, [[0x101008, 0xff000c01], [0x0f95bb, 0xff000c02]]);
  assert.ok(!s.log.events.some((e) => /^howl/i.test(e)), "no animation on another player's NPC");
});

test("the Bear Blood: the server says bear with the race, the body becomes the werebear; R howls on the werebear's body and adds a bear's roar; back to the human race at the end", () => {
  const BEARR = 0x0401e17b;
  const s = make({ refuseIdle: true });
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: false, bear: true, race: BEARR });
  s.tick();
  assert.strictEqual(s.race(), BEARR);
  assert.ok(s.log.lines.some((l) => /changed into the werebear/.test(l)));
  s.key(19, true); s.tick(); s.tick();
  assert.deepStrictEqual(s.log.events.filter((e) => /^howl/i.test(e)), ["HowlStart", "HowlRelease"], "the howl on the werebear's own body (back on the owner's call)");
  assert.deepStrictEqual(s.log.sounds.filter((x) => x[0] === 0x101008 || x[0] === 0x0f95bb), [[0x0f95bb, "player"]], "a bear's warning roar (NPCBearAggroWarning01)");
  assert.ok(s.log.sent.some((m) => m.customPacketType === "greymarchWolf" && m.op === "howl"), "reported, so others hear it");
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
  assert.strictEqual(s.race(), NORD, "and the person's race comes back, not the bear's");
});

test("the black bear: the server says bear and black, the body becomes GreymarchCore's black bear race; switched off mid-form it goes back to the werebear", () => {
  const BEARR = 0x0401e17b;
  const s = make({ refuseIdle: true });
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: false, bear: true, race: BEARR, black: true });
  s.tick();
  assert.strictEqual(s.race(), BLACK);
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: false, bear: true, race: BEARR, black: false });
  s.tick(3100);
  assert.strictEqual(s.race(), BEARR, "the plain werebear again");
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
  assert.strictEqual(s.race(), NORD);
});

test("the polar bear: the server says bear and polar, the body becomes GreymarchCore's polar bear race; other polar bears are drawn with it", () => {
  const BEARR = 0x0401e17b;
  const s = make({ refuseIdle: true, others: { 604: 0xff000c04 } });
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: false, bear: true, race: BEARR, black: false, polar: true });
  s.tick();
  assert.strictEqual(s.race(), POLAR);
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
  assert.strictEqual(s.race(), NORD);
  const g = Function("return this")();
  delete g.__gmWolfRace;
  s.say({ customPacketType: "greymarchWolfAlphas", actors: [], pups: [], blackbears: [], polarbears: [604] });
  s.tick(1100);
  assert.deepStrictEqual(g.__gmWolfRace, { 604: POLAR });
  assert.ok(s.log.lines.some((l) => /25c drawn as the polar bear/.test(l)));
  delete g.__gmWolfRace;
});

test("other black bears: the blackbears list puts GreymarchCore's black bear race into __gmWolfRace", () => {
  const s = make({ others: { 503: 0xff000a03 } });
  const g = Function("return this")();
  delete g.__gmWolfRace;
  s.say({ customPacketType: "greymarchWolfAlphas", actors: [], pups: [], blackbears: [503] });
  s.tick(1100);
  assert.deepStrictEqual(g.__gmWolfRace, { 503: BLACK });
  assert.ok(s.log.lines.some((l) => /1f7 drawn as the black bear/.test(l)));
  delete g.__gmWolfRace;
});

test("the roar is a howl the server hears: one report per press, none for a human; no wait between presses", () => {
  const s = make({ refuseIdle: true });
  const howls = () => s.log.sent.filter((m) => m.customPacketType === "greymarchWolf" && m.op === "howl").length;
  s.key(19, true); s.key(19, false); s.tick();
  assert.strictEqual(howls(), 0, "human: R is the game's own key");
  s.say({ customPacketType: "greymarchWolfForm", on: true }); s.tick();
  s.key(19, true); s.tick();
  assert.strictEqual(howls(), 1);
  s.key(19, false); s.key(19, true); s.tick();
  assert.strictEqual(howls(), 2, "the next press is reported at once");
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
  assert.deepStrictEqual(s.log.events.filter((e) => /^howl/i.test(e)), ["HowlStart", "HowlRelease"], "the Alpha howls");
  assert.ok(s.log.sent.some((m) => m.customPacketType === "greymarchWolf" && m.op === "howl"), "the Alpha calls the pack");
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


test("Z while changed asks the server to change back (the server decides); not mid-transformation, not right after the change, not in a menu or the chat, and not as a human", () => {
  const s = make({ refuseIdle: true });
  const backs = () => s.log.sent.filter((m) => m.customPacketType === "greymarchWolf" && m.beast === false).length;
  s.key(44, true); s.key(44, false); s.tick();
  assert.strictEqual(backs(), 0, "human: Z is the game's own key");
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  assert.strictEqual(s.race(), BEAST);
  s.key(44, true); s.key(44, false); s.tick();
  assert.strictEqual(backs(), 0, "not in the first seconds after the change");
  s.tick(2500);
  s.setMenu(true); s.key(44, true); s.key(44, false); s.tick();
  assert.strictEqual(backs(), 0, "not in a menu");
  s.setMenu(false);
  s.gm.greymarchChatTyping = true; s.key(44, true); s.key(44, false); s.tick();
  assert.strictEqual(backs(), 0, "not while typing in the chat");
  s.gm.greymarchChatTyping = false;
  s.key(44, true); s.tick();
  assert.strictEqual(backs(), 1, "Z asks the server");
  assert.strictEqual(s.race(), BEAST, "nothing is changed before the server answers");
  s.tick(); assert.strictEqual(backs(), 1, "one press, one request (holding it does not repeat)");
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
  assert.strictEqual(s.race(), NORD, "the server's no changes them back");
});

test("Z during the transformation animation does nothing", () => {
  const s = make();
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  s.tick(2500);
  s.key(44, true); s.key(44, false); s.tick();
  assert.strictEqual(s.log.sent.filter((m) => m.beast === false).length, 0);
});

test("the pup: the server says pup, the body becomes the pup race from GreymarchCore.esp; staff switching it to the Alpha mid-form changes the body; back to the human race at the end", () => {
  const s = make({ refuseIdle: true });
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: true });
  s.tick();
  assert.strictEqual(s.race(), PUP);
  assert.ok(s.log.lines.some((l) => /changed into the pup beast/.test(l)));
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: true, pup: false });
  s.tick(3100);
  assert.strictEqual(s.race(), ALPHA, "switched to the Alpha");
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
  assert.strictEqual(s.race(), NORD);
});


test("the way back: while changed SkyMP keeps the character's own look aside (storage flag); a second after the race is back the kept look is put on and the gear goes back on", () => {
  const s = make({ refuseIdle: true, worn: { 4: 0x12eb7, 8: 0x13911 }, weapon: 0x1397e, have: [0x12eb7, 0x13911, 0x1397e] });
  s.say({ customPacketType: "greymarchWolfForm", on: true });
  s.tick();
  assert.strictEqual(s.race(), BEAST);
  assert.strictEqual(s.sp.storage.greymarchWolfOn, true, "SkyMP keeps a look the server sends aside while changed");
  assert.ok(s.log.unequipped);
  s.sp.storage.greymarchPendingAppearance = { raceId: NORD, headpartIds: [1, 2] }; // the server put the human look back; SkyMP kept it aside
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
  assert.strictEqual(s.race(), NORD);
  assert.strictEqual(s.sp.storage.greymarchWolfOn, false);
  assert.ok(s.log.redraws > 0, "the body is redrawn");
  assert.deepStrictEqual(s.log.applied, [], "not before the person's skeleton is in place");
  s.tick(1100);
  assert.deepStrictEqual(s.log.applied, [{ raceId: NORD, headpartIds: [1, 2] }], "the own look put on properly");
  assert.strictEqual(s.sp.storage.greymarchPendingAppearance, null);
  assert.deepStrictEqual(s.log.equipped.sort(), [0x12eb7, 0x13911, 0x1397e].sort(), "the armor and the weapon back on");
  assert.ok(s.log.lines.some((l) => /put 3 of 3 worn items back on/.test(l)));
  s.tick(1100);
  assert.strictEqual(s.log.equipped.length, 3, "only once");
});

test("a new bridge clears a werewolf flag left in storage (a script reload mid-form must not keep the player's look aside forever)", () => {
  const s = make();
  assert.strictEqual(s.sp.storage.greymarchWolfOn, false);
});

test("the way back: gear sold or dropped while changed is not put on; with no kept look nothing is applied", () => {
  const s = make({ refuseIdle: true, worn: { 4: 0x12eb7 }, have: [] });
  s.say({ customPacketType: "greymarchWolfForm", on: true }); s.tick();
  s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick(); s.tick(1100);
  assert.deepStrictEqual(s.log.equipped, []);
  assert.deepStrictEqual(s.log.applied, []);
  assert.ok(s.log.lines.some((l) => /put 0 of 1 worn items back on/.test(l)));
});

test("other Alphas and pups: the lists become __gmWolfRace (server id -> the variant's race) for formView.ts to build their NPC with; no SetRace on another player's actor (that crashed the game)", () => {
  const races = { 0xff000a01: BEAST, 0xff000a02: BEAST };
  const setRaces = [];
  const other = (id) => ({ getRace: () => ({ getFormID: () => races[id] }), setRace: (r) => { setRaces.push([id, r.id]); } });
  const s = make({ others: { 501: 0xff000a01, 502: 0xff000a02 }, actors: { 0xff000a01: other(0xff000a01), 0xff000a02: other(0xff000a02) } });
  const g = Function("return this")();
  delete g.__gmWolfRace;
  s.say({ customPacketType: "greymarchWolfAlphas", actors: [501], pups: [502] });
  s.tick(1100);
  assert.deepStrictEqual(g.__gmWolfRace, { 501: ALPHA, 502: PUP });
  assert.ok(s.log.lines.some((l) => /1f5 drawn as the Alpha/.test(l)) && s.log.lines.some((l) => /1f6 drawn as the pup/.test(l)));
  s.say({ customPacketType: "greymarchWolfAlphas", actors: [502], pups: [] });
  s.tick(1100);
  assert.deepStrictEqual(g.__gmWolfRace, { 502: ALPHA }, "a pup made an Alpha; one off the lists is the normal werewolf again");
  assert.ok(s.log.lines.some((l) => /1f5 drawn as the normal beast again/.test(l)));
  assert.deepStrictEqual(setRaces, [], "never a SetRace on another player's live actor");
  delete g.__gmWolfRace;
});

test("the forms of 2026-10-21: the server says kind (frost, rabid, moonborn, elder) and the body becomes that race from GreymarchCore.esp; staff switching it mid-form changes the body; R works on it; back to the human race", () => {
  for (const [kind, raceId, name] of [["frost", FROST, "Frost Wolf"], ["rabid", RABID, "Rabid Wolf"], ["moonborn", MOONBORN, "Moonborn"], ["elder", ELDER, "Elder Alpha"]]) {
    const s = make({ refuseIdle: true });
    s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: false, kind });
    s.tick();
    assert.strictEqual(s.race(), raceId, kind);
    assert.ok(s.log.lines.some((l) => l.includes("changed into the " + name + " beast")), name);
    s.say({ customPacketType: "greymarchWolfForm", on: false }); s.tick();
    assert.strictEqual(s.race(), NORD, "back to the human race");
  }
  const s = make({ refuseIdle: true });
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: false, kind: "rabid" }); s.tick();
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: false, kind: "elder" }); s.tick(3100);
  assert.strictEqual(s.race(), ELDER, "switched mid-form");
  s.say({ customPacketType: "greymarchWolfForm", on: true, alpha: true, pup: false }); s.tick(3100);
  assert.strictEqual(s.race(), ALPHA, "an old server's word (no kind) still works");
  const b = make({ refuseIdle: true });
  b.say({ customPacketType: "greymarchWolfForm", on: true, alpha: false, pup: false, kind: "polar" }); b.tick();
  assert.strictEqual(b.race(), BEAST, "a bear look as a wolf's kind is ignored: the normal werewolf");
});

test("other players in the forms of 2026-10-21: the lists (frosts, rabids, moonborns, elders) become __gmWolfRace with their races", () => {
  const s = make({ others: { 501: 0xff000a01, 502: 0xff000a02, 503: 0xff000a03, 504: 0xff000a04 } });
  const g = Function("return this")();
  delete g.__gmWolfRace;
  s.say({ customPacketType: "greymarchWolfAlphas", actors: [], pups: [], blackbears: [], polarbears: [], frosts: [501], rabids: [502], moonborns: [503], elders: [504] });
  s.tick(1100);
  assert.deepStrictEqual(g.__gmWolfRace, { 501: FROST, 502: RABID, 503: MOONBORN, 504: ELDER });
  assert.ok(s.log.lines.some((l) => /1f8 drawn as the Elder Alpha/.test(l)));
  s.say({ customPacketType: "greymarchWolfAlphas", actors: [], pups: [] });
  s.tick(1100);
  assert.deepStrictEqual(g.__gmWolfRace, {}, "an old server's packet (no such lists): all normal again");
  delete g.__gmWolfRace;
});

test("formView.ts gives a werewolf variant's NPC the variant's race (by SetRace on its stand-in, beast-switch.test.js), only for a werewolf look", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(fv.includes("__gmWolfRace"), "reads the bridge's map");
  assert.ok(fv.includes("gmMap && ap && !(Array.isArray(ap.headpartIds) && ap.headpartIds.length > 0)"), "only a beast look (no head parts): the werewolf's or the werebear's");
  assert.ok(fv.includes("const gmWanted = gmWereNow ? (this.gmWolfRace || (gmApW ? Number(gmApW.raceId) || 0 : 0)) : gmPersonRace;"), "the variant's race is the one the NPC is switched to");
});

test("a beast body gets no face, no moving mouth and no human pose: a were-race (the werewolf, a form's race), or a body with no head parts (a stand-in, a creature form)", () => {
  const s = make();
  const calls = [];
  const body = (raceId, headParts) => ({ getFormID: () => 0xff000a01, getRace: () => ({ getFormID: () => raceId }), getBaseObject: () => ({ headParts }),
    clearExpressionOverride: () => calls.push("clear"), resetExpressionOverrides() {}, setExpressionPhoneme: () => calls.push("phoneme"), setExpressionOverride: () => calls.push("mood") });
  s.sp.ActorBase.from = (b) => (b ? { getNumHeadParts: () => b.headParts } : null);
  assert.strictEqual(s.gm.greymarchIsBeastBody(body(BEAST, 0)), true, "the werewolf");
  assert.strictEqual(s.gm.greymarchIsBeastBody(body(ALPHA, 0)), true, "a form's race");
  assert.strictEqual(s.gm.greymarchIsBeastBody(body(NORD, 0)), true, "a stand-in (no head parts)");
  assert.strictEqual(s.gm.greymarchIsBeastBody(body(NORD, 7)), false, "a person");
  s.gm.greymarchFaceApply(body(BEAST, 0), { mood: 2, strength: 80, phonemes: [[0, 0.5]] }, true);
  assert.deepStrictEqual(calls, [], "no face on the werewolf");
  s.gm.greymarchFaceApply(body(NORD, 7), { mood: 2, strength: 80, phonemes: [[0, 0.5]] }, true);
  assert.ok(calls.includes("mood") && calls.includes("phoneme"), "a person's face as before");
});
