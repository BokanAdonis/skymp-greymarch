"use strict";
// The emote wheel, the game's half (src/greymarch/bridge.ts + src/greymarch/emotes.ts): G opens the wheel, the page asks for an emote, the bridge plays the game's own idle
// with playIdle, and an emote that lasts ends when the player moves, draws a weapon or picks Stop.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const tr = (f) => ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", f), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const load = (js, mods) => { const mod = { exports: {} }; new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod); return mod.exports; };
const emotes = load(tr("emotes.ts"), {});
const bridgeJs = tr("bridge.ts");

function make(opts = {}) {
  const log = { idles: [], events: [], notes: [], pages: [], lines: [], thirdPerson: 0, focused: [], sent: [], faces: {} };
  const faceLog = (who) => ({ clearExpressionOverride: () => (log.faces[who] = []), resetExpressionOverrides: () => (log.faces[who] = []), setExpressionOverride: (m, s) => (log.faces[who] = log.faces[who] || []).push(["mood", m, s]), setExpressionPhoneme: (i, v) => (log.faces[who] = log.faces[who] || []).push(["ph", i, v]) });
  const mods = { "../sync/inventory": { greymarchStripPoison: (ref) => { log.stripped = (log.stripped || 0) + 1; return 1; }, getInventory: () => ({ entries: state.inv || [] }) }, "../messages": { MsgType: { CustomPacket: 77 } }, "./emotes": emotes, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (opts.others || {})[id] || 0, localIdToRemoteId: (id) => (id >= 0xff000000 ? 0 : id) }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const bridge = load(bridgeJs, mods);
  const state = { drawn: false, speed: 0, menu: null, refuse: false };
  const player = {
    playIdle: (idle) => { log.idles.push(idle.id); return !state.refuse; },
    placeAtMe: (base) => { const n = (log.ghosts || []).length; const g = { base, at: null, rot: null, gone: false, id: 0xff000100 + n, getFormID: () => g.id, getBaseObject: () => ({ getFormID: () => base.id }), blockActivation: (v) => { g.blocked = v; }, setMotionType: (t) => { g.motion = t; g.motions = (g.motions || 0) + 1; }, setPosition: (x, y, z) => { g.at = [x, y, z]; g.moves = (g.moves || 0) + 1; }, setAngle: (a, b, c) => { g.rot = [a, b, c]; }, getAngleZ: () => (g.rot ? g.rot[2] : 0), getAngleX: () => (g.rot ? g.rot[0] : 0), getPositionX: () => (g.at ? g.at[0] + (g.fell || 0) : 0), getPositionY: () => (g.at ? g.at[1] : 0), getPositionZ: () => (g.at ? g.at[2] - (g.fell || 0) : 0), is3DLoaded: () => !state.no3d, translateTo: (...a) => { (g.turns = g.turns || []).push(a); }, disable() { g.gone = true; }, delete() { g.gone = true; } }; if (base.id === 0x5eae2) { g.id = 0xff100000 + (log.lights || []).length; (log.lights = log.lights || []).push(g); } else (log.ghosts = log.ghosts || []).push(g); (log.world = log.world || {})[g.id] = g; return g; },
    setActorValue: (n, v) => { (log.avSet = log.avSet || []).push([n, v]); }, getActorValue: (n) => (state.av || {})[n] || 0, damageActorValue: (n, v) => { log.damage = (log.damage || []).concat([[n, Math.round(v)]]); state.av[n] -= v; },
    getFormID: () => 0x14, isWeaponDrawn: () => state.drawn, sheatheWeapon: () => { log.sheathed = (log.sheathed || 0) + 1; state.sheathing = true; }, isDead: () => !!state.dead, isOnMount: () => !!state.mounted,
    getHeadingAngle: () => 30, getAngleZ: () => 100, setAngle: (a, b, c) => { log.turned = c; }, setPosition: (x, y, z) => { log.stood = [x, y, z]; }, moveTo: (ref, dx, dy, dz, match) => { log.movedTo = [ref.id, dx, dy, dz, match]; }, getPositionX: () => (log.stood ? log.stood[0] : 480), getPositionY: () => (log.stood ? log.stood[1] : 560), getPositionZ: () => (log.stood ? log.stood[2] : 44),
    getFurnitureReference: () => (state.furn ? { getFormID: () => state.furn } : null),
    getSitState: () => state.sitState || 0,
    getAnimationVariableFloat: (n) => (n === "Speed" ? state.speed : 0),
    ...faceLog("me"),
  };
  const actors = {}; for (const local of Object.values(opts.others || {})) actors[local] = faceLog(local.toString(16));
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => player, getFormEx: (id) => (log.world && log.world[id] ? (log.world[id].gone ? null : log.world[id]) : { id }), getFormFromFile: (id, file) => (file === "Missing.esp" ? null : { id, file, getFormID: () => id }), forceThirdPerson: () => { log.thirdPerson++; state.cam = 9; }, forceFirstPerson: () => { log.firstPerson = (log.firstPerson || 0) + 1; state.cam = 0; }, getCameraState: () => (state.cam === undefined ? 9 : state.cam), disablePlayerControls: (...a) => (a[2] === true && !a[0] && !a[1] ? (log.pov = log.pov || []) : (log.controls = log.controls || [])).push(["off", ...a]), enablePlayerControls: (...a) => (a[2] === true && !a[0] && !a[1] ? (log.pov = log.pov || []) : (log.controls = log.controls || [])).push(["on", ...a]) },
    callNative: (cls, fn, self, a, b) => { (log.natives = log.natives || []).push([cls, fn, a]); if (cls !== "GreymarchCam" || state.noDll) throw new Error("Native function not found"); if (fn === "GetFurnitureMarker") return state.marker ? state.marker[b] : -99999; if (fn === "SetFreeCamera") { state.free = !!a; return true; } if (fn === "IsFreeCamera") return !!state.free; if (fn === "GetCamera") return (state.cam || [0, 0, 0, 0, 1, 0])[a]; return undefined; },
    EffectShader: { from: (f) => (f ? { shaderId: f.id } : null) }, Idle: { from: (f) => f || null }, ObjectReference: { from: (f) => (f && f.setPosition ? f : f && f.id ? { id: f.id, getPositionX: () => 500, getPositionY: () => 600, getPositionZ: () => 10, getAngleZ: () => 90 } : null) }, Actor: { from: (f) => (f && actors[f.id]) || null }, Potion: { from: (f) => (f && f.potion) || null },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push(name), notification: (t) => log.notes.push(t) },
    Ui: { isMenuOpen: (name) => name === state.menu },
    Input: { tapKey: (k) => { log.taps = (log.taps || []).concat([k]); if (state.menu === "InventoryMenu" || state.menu === "FavoritesMenu") state.menu = null; }, getMappedKey: (c) => (c === "Tween Menu" ? state.tweenKey || 15 : 0) },
    Utility: { isInMenuMode: () => false },
    browser: { setVisible() {}, setFocused: (v) => log.focused.push(v), isFocused: () => state.focused !== false, executeJavaScript: (js) => { const m = /window\.__gmEmoteRun\((.*)\);$/.exec(js); if (m) log.pages.push(JSON.parse(m[1])); const c = /window\.__gmCraftRun\((.*)\);$/.exec(js); if (c) (log.craft = log.craft || []).push(JSON.parse(c[1])); const fo = /window\.__gmForgeRun\((.*)\);$/.exec(js); if (fo) (log.forge = log.forge || []).push(JSON.parse(fo[1])); } },
    setCollision(id, on) { (this.__coll = this.__coll || []).push([id, on]); },
    on() {}, storage: {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, m) => { if (n === "sendMessage") { const c = JSON.parse(m.message.contentJsonDump); if (c.customPacketType !== "greymarchLog") log.sent.push(c); } } } };
  const gm = new bridge.GreymarchBridge(sp, controller);
  let t = 1_000_000;
  const realNow = Date.now;
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const tick = (ms = 50) => { t += ms; at(() => gm.greymarchEmoteTick(t)); };
  const key = (code, down) => at(() => gm.greymarchKey({ code, isDown: down }));
  const page = (msg) => at(() => gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify(msg)] }));
  const shown = () => log.pages.filter((p) => p.fn === "show");
  const say = (msg) => at(() => gm.greymarchPacket(msg));
  const eat = (name, food = true, poison = false, fid = 0x3eaea, mgefs = [0x3eb15]) => at(() => gm.greymarchConsumeNote({ potion: { isFood: () => food, isPoison: () => poison, getNumEffects: () => mgefs.length, getNthEffectMagicEffect: (i) => ({ getFormID: () => mgefs[i] }) }, getName: () => name, getFormID: () => fid }));
  const camTick = (ms = 50) => { t += ms; at(() => gm.greymarchBuildCamTick(t)); };
  const chopTick = (ms = 1000) => { t += ms; at(() => gm.greymarchChopTick(t)); };
  return { at, gm, log, state, tick, camTick, chopTick, key, page, shown, say, eat, bridgeSrc: bridgeJs };
}

test("holding G opens the wheel (hold mode) with every group, from the update phase; letting go tells the page", () => {
  const s = make();
  s.key(34, true);
  assert.strictEqual(s.shown().length, 0, "not from the key event itself");
  s.tick();
  const show = s.shown();
  assert.strictEqual(show.length, 1);
  assert.strictEqual(show[0].arg.mode, "hold");
  assert.strictEqual(show[0].arg.groups.length, emotes.EMOTE_GROUPS.length);
  assert.ok(s.gm.greymarchEmoteOn && s.gm.greymarchPanelHasKeys(), "the wheel holds the keyboard and the cursor");
  s.key(34, false);
  assert.deepStrictEqual(s.log.pages.at(-1), { fn: "release", arg: true });
});

test("a quick tap of G (let go before the next frame) opens the wheel to click on", () => {
  const s = make();
  s.key(34, true); s.key(34, false); s.tick();
  assert.strictEqual(s.shown()[0].arg.mode, "open");
});

test("G does nothing in a game menu, while typing in the chat, or as a beast", () => {
  const s = make();
  s.state.menu = "RaceSex Menu";
  s.key(34, true); s.tick(); s.key(34, false);
  assert.strictEqual(s.shown().length, 0, "typing a g in the name box");
  s.state.menu = null;
  s.gm.greymarchChatTyping = true;
  s.key(34, true); s.tick(); s.key(34, false);
  assert.strictEqual(s.shown().length, 0, "typing in the chat");
  s.gm.greymarchChatTyping = false;
  s.gm.greymarchWolfOn = true;
  s.key(34, true); s.tick(); s.key(34, false);
  assert.strictEqual(s.shown().length, 0);
  assert.deepStrictEqual(s.log.notes, ["A beast has no emotes"]);
});

test("an emote from the wheel plays the game's own idle in third person; an id not on the list is ignored", () => {
  const s = make();
  s.page({ type: "emote", id: "wave" }); s.tick();
  assert.deepStrictEqual(s.log.idles, [0x3ea32], "IdleWave");
  assert.strictEqual(s.log.thirdPerson, 1);
  assert.strictEqual(s.gm.greymarchEmoteNow, null, "a one-off leaves nothing to stop");
  s.page({ type: "emote", id: "nope" }); s.page({ type: "emote", id: 0x3ea32 }); s.tick();
  assert.deepStrictEqual(s.log.idles, [0x3ea32]);
  assert.ok(s.log.lines.some((l) => /emote: wave \(idle 3ea32, once\) played/.test(l)), "logged for the test server");
});

test("with a weapon drawn, or when the game refuses, the player is told and nothing lasts", () => {
  const s = make();
  s.state.drawn = true;
  s.page({ type: "emote", id: "pray" }); s.tick();
  assert.deepStrictEqual(s.log.idles, []);
  assert.deepStrictEqual(s.log.notes, ["Sheathe your weapon first"]);
  s.state.drawn = false; s.state.refuse = true;
  s.page({ type: "emote", id: "pray" }); s.tick();
  assert.strictEqual(s.log.notes.at(-1), "You cannot do that right now");
  assert.ok(!s.gm.greymarchEmoteNow);
});

test("a loop ends with W A S D or Space (IdleStop_Loose), or when the player starts moving or draws a weapon", () => {
  for (const code of [17, 30, 31, 32, 57]) {
    const s = make();
    s.page({ type: "emote", id: "pray" }); s.tick();
    assert.strictEqual(s.gm.greymarchEmoteNow.id, "pray");
    s.key(code, true); s.tick();
    assert.deepStrictEqual(s.log.idles, [0x6f300, emotes.IDLE_STOP], "key " + code);
    assert.ok(!s.gm.greymarchEmoteNow);
  }
  const m = make();
  m.page({ type: "emote", id: "lute" }); m.tick();
  m.state.speed = 80; m.tick(300);
  assert.deepStrictEqual(m.log.idles, [0x96f8d], "not in the first moments (the idle can nudge the speed)");
  m.tick(600);
  assert.deepStrictEqual(m.log.idles, [0x96f8d, emotes.IDLE_STOP], "moved with rebound keys");
  const d = make();
  d.page({ type: "emote", id: "sweep" }); d.tick();
  d.state.drawn = true; d.tick(300);
  assert.deepStrictEqual(d.log.idles, [0x640fe, emotes.IDLE_STOP]);
});

test("a carry is walked with: W does not end it, Stop on the wheel does (OffsetStop); the drunk walk ends with its own stop", () => {
  const s = make();
  s.page({ type: "emote", id: "basket" }); s.tick();
  s.key(17, true); s.state.speed = 120; s.tick(1000);
  assert.strictEqual(s.gm.greymarchEmoteNow.id, "basket");
  s.page({ type: "emote-stop" }); s.tick();
  assert.deepStrictEqual(s.log.idles, [0x19925, emotes.OFFSET_STOP]);
  const d = make();
  d.page({ type: "emote", id: "drunk" }); d.tick();
  d.page({ type: "emote-stop" }); d.tick();
  assert.deepStrictEqual(d.log.idles, [0xcefd0, emotes.DRUNK_STOP]);
  const r = make();
  r.page({ type: "emote", id: "pot" }); r.tick();
  r.state.refuse = true; r.page({ type: "emote-stop" }); r.tick();
  assert.deepStrictEqual(r.log.events, ["OffsetStop"], "the stop event itself when the stop idle is refused");
});

test("the wheel shows what is playing, so its middle can stop it; Esc and the page close it", () => {
  const s = make();
  s.page({ type: "emote", id: "pray" }); s.tick();
  s.key(34, true); s.tick();
  assert.strictEqual(s.shown()[0].arg.playing, "pray");
  s.key(34, false);
  s.key(1, true);
  assert.strictEqual(s.gm.greymarchEmoteOn, false, "Esc");
  assert.deepStrictEqual(s.log.pages.at(-1), { fn: "hide", arg: true });
  s.key(1, false);
  s.key(34, true); s.tick(); s.key(34, false);
  s.page({ type: "emote-close" });
  assert.strictEqual(s.gm.greymarchEmoteOn, false);
  assert.strictEqual(s.log.focused.at(-1), false, "the keyboard goes back to the game");
});

test("the other windows stay shut while the wheel is up, and the wheel does not open over them", () => {
  const s = make();
  s.key(34, true); s.tick(); s.key(34, false);
  s.key(37, true); s.key(37, false);
  assert.ok(!s.gm.greymarchProfWanted, "K");
  s.key(45, true); s.key(45, false);
  assert.ok(!s.gm.greymarchMenuOn, "X");
  const o = make();
  o.gm.greymarchProfOn = true;
  o.key(34, true); o.tick();
  assert.strictEqual(o.shown().length, 0);
});

test("the emote list: unique ids, at most 12 per group, real idle numbers, the page sees names only", () => {
  const ids = new Set();
  for (const g of emotes.EMOTE_GROUPS) {
    assert.ok(g.items.length >= 1 && g.items.length <= 12, g.id);
    for (const e of g.items) {
      assert.ok(!ids.has(e.id), "duplicate " + e.id); ids.add(e.id);
      if (e.kind !== "face") assert.ok(Number.isInteger(e.idle) && e.idle > 0 && e.idle < 0x1000000, e.id + " is a Skyrim.esm idle");
      assert.ok(["once", "loop", "walk", "face"].includes(e.kind), e.id);
      if (e.kind === "walk") assert.ok(e.stop, e.id + " has its own stop");
    }
  }
  assert.ok(ids.size >= 90);
  const pageList = JSON.stringify(emotes.emoteGroupsForPage());
  assert.ok(!/idle|stop/.test(pageList.replace(/"name":"[^"]*"/g, "")), "no idle numbers go to the page");
  assert.strictEqual(emotes.emoteById("wave").idle, 0x3ea32);
  assert.strictEqual(emotes.emoteById({}), null);
});

test("the wheel's loader shows greymarch-emote.html in its own layer and treats letting go of G in the page as a release", () => {
  const s = make();
  let js = "";
  s.gm.sp.browser.executeJavaScript = (x) => { js = x; };
  s.gm.greymarchEmoteToPage("show", {});
  assert.ok(js.includes("greymarch-emote.html") && js.includes("__gmEmoteRun") && js.includes("2147483223"));
  assert.ok(js.includes("e.key==='g'||e.key==='G'") && !js.includes("e.key==='x'"));
});

const CLEAN = Array.from({ length: 16 }, (_, i) => ["ph", i, 0]); // every mouth shape off, before a face goes on or when it comes off
test("a face (Bare fangs): put on the player's own face, reported to the server, the camera to third person; picking it again or the middle of the wheel takes it off", () => {
  const s = make();
  s.page({ type: "emote", id: "fangs" }); s.tick();
  assert.deepStrictEqual(s.log.faces.me, [...CLEAN, ["mood", 15, 100], ["ph", 5, 0.8], ["ph", 1, 0.4]], "combat anger with the teeth shown and the mouth a little open");
  assert.deepStrictEqual(s.log.sent, [{ customPacketType: "greymarchFace", face: "fangs" }]);
  assert.strictEqual(s.log.thirdPerson, 1);
  assert.deepStrictEqual(s.log.idles, [], "no animation");
  s.key(17, true); s.tick(); s.key(17, false);
  assert.strictEqual(s.gm.greymarchFaceMine.id, "fangs", "walking keeps the face");
  s.log.faces.me = null; s.tick(1100);
  assert.deepStrictEqual(s.log.faces.me, [["mood", 15, 100], ["ph", 5, 0.8], ["ph", 1, 0.4]], "put on again every second (the game drops it)");
  s.key(34, true); s.tick();
  assert.strictEqual(s.shown()[0].arg.playing, "fangs", "the wheel's middle shows it");
  s.key(34, false);
  s.page({ type: "emote-stop" }); s.tick();
  assert.deepStrictEqual(s.log.faces.me, CLEAN, "cleared, the mouth shapes too");
  assert.deepStrictEqual(s.log.sent.at(-1), { customPacketType: "greymarchFace", face: null });
  s.page({ type: "emote", id: "open" }); s.tick(); s.page({ type: "emote", id: "open" }); s.tick();
  assert.deepStrictEqual(s.log.sent.slice(-2).map((m) => m.face), ["open", null], "the same face again takes it off");
});

test("another player's face: put on the character this game draws for them, every second, and taken off when the server says so", () => {
  const s = make({ others: { 0xff000777: 0xff000021 } });
  s.say({ customPacketType: "greymarchFaceOf", actor: 0xff000777, face: "open" });
  s.say({ customPacketType: "greymarchFaceOf", actor: 0xff000888, face: "smile" }); // not drawn here
  s.say({ customPacketType: "greymarchFaceOf", actor: 0xff000777, face: "explode" }); // not a face
  s.tick();
  assert.deepStrictEqual(s.log.faces["ff000021"], [...CLEAN, ["ph", 1, 0.65]]);
  s.log.faces["ff000021"] = null; s.tick(1100);
  assert.deepStrictEqual(s.log.faces["ff000021"], [["ph", 1, 0.65]], "again a second later");
  s.say({ customPacketType: "greymarchFaceOf", actor: 0xff000777, face: null }); s.tick(1100);
  assert.deepStrictEqual(s.log.faces["ff000021"], CLEAN);
  assert.deepStrictEqual(Object.keys(s.gm.greymarchFaceOthers), ["4278192264"], "only the one not drawn here waits");
});

test("Open mouth, then Close mouth: the open shape is taken off before the lips are pressed shut (the mouth stayed open)", () => {
  const s = make();
  s.page({ type: "emote", id: "open" }); s.tick();
  s.page({ type: "emote", id: "closed" }); s.tick();
  const ph = s.log.faces.me.filter((x) => x[0] === "ph");
  assert.deepStrictEqual(ph.at(-1), ["ph", 2, 1], "BMP at full strength last");
  assert.ok(ph.some((x) => x[1] === 1 && x[2] === 0), "BigAah (Open mouth's shape) set back to 0");
  assert.ok(!ph.some((x) => x[2] > 0 && x[1] !== 2), "nothing else holds the mouth open");
});

test("the faces are the ones the server knows (gamemode faces.js)", () => {
  const faces = emotes.EMOTE_GROUPS.find((g) => g.id === "face").items;
  assert.deepStrictEqual(faces.map((x) => x.id), ["open", "closed", "fangs", "snarl", "shout", "smile", "frown", "sad", "surprise", "fear", "disgust"]);
  for (const x of faces) assert.ok(x.kind === "face" && x.face && (typeof x.face.mood === "number" || (x.face.phonemes || []).length), x.id);
});

// moving mouths: the launcher says who is talking (greymarchVoiceMessage), the bridge works their mouths (greymarchLipTick)
const lipTick = (s, ms = 120) => { s.tick(0); s.gm.__t = (s.gm.__t || 2_000_000) + ms; const real = Date.now; Date.now = () => s.gm.__t; try { s.gm.greymarchLipTick(s.gm.__t); } finally { Date.now = real; } };
const phonemes = (list) => (list || []).filter((x) => x[0] === "ph");

test("talking in voice (push-to-talk held): the player's own mouth changes shape every step, and closes when they stop", () => {
  const s = make();
  s.gm.greymarchVoiceMessage({ hud: false, listen: true, talking: true, speaking: [] });
  s.log.faces.me = [];
  for (let i = 0; i < 6; i++) lipTick(s);
  const ph = phonemes(s.log.faces.me);
  const opens = ph.filter((x) => x[2] > 0), closes = ph.filter((x) => x[2] === 0);
  assert.strictEqual(opens.length, 6, "a new mouth shape each step");
  assert.strictEqual(closes.length, 5, "the shape before it is let go each time");
  assert.ok(opens.every((x) => x[2] <= 1 && [0, 1, 2, 4, 5, 6, 8, 10, 11].includes(x[1])), JSON.stringify(opens));
  assert.ok(new Set(opens.map((x) => x[1])).size >= 2, "the mouth does not hold one shape");
  s.gm.greymarchVoiceMessage({ hud: false, listen: true, talking: false, speaking: [] });
  s.log.faces.me = [];
  lipTick(s);
  assert.deepStrictEqual(phonemes(s.log.faces.me).map((x) => x[2]), [0], "closed");
  s.log.faces.me = [];
  lipTick(s);
  assert.deepStrictEqual(s.log.faces.me, [], "and then left alone");
});

test("another player talking: the mouth of the character drawn for them moves, with the voice display on or off; not when they are not drawn here", () => {
  const s = make({ others: { 0xff000777: 0xff000021 } });
  s.gm.greymarchEarsSeen = { "#ABCD": { x: 0, y: 0, z: 0, at: 2_000_000, localId: 0xff000021 }, "#WXYZ": { x: 0, y: 0, z: 0, at: 0, localId: 0xff000099 } };
  s.gm.greymarchVoiceMessage({ hud: false, listen: true, talking: false, speaking: ["#ABCD", "#WXYZ"] });
  lipTick(s); lipTick(s);
  assert.ok(phonemes(s.log.faces["ff000021"]).some((x) => x[2] > 0), "their mouth moves");
  assert.strictEqual(s.log.faces.me, undefined, "not this player's");
  assert.deepStrictEqual(Object.keys(s.gm.greymarchLipOn), [String(0xff000021)], "#WXYZ was last seen long ago: not moved");
});

test("a face from the wheel goes back on when the talking stops; a beast's own mouth is left alone", () => {
  const s = make();
  s.page({ type: "emote", id: "fangs" }); s.tick();
  s.gm.greymarchVoiceMessage({ hud: true, listen: true, talking: true, speaking: [] });
  lipTick(s); lipTick(s);
  s.gm.greymarchVoiceMessage({ hud: true, listen: true, talking: false, speaking: [] });
  s.log.faces.me = [];
  lipTick(s);
  assert.deepStrictEqual(s.log.faces.me.slice(1), [["mood", 15, 100], ["ph", 5, 0.8], ["ph", 1, 0.4]], "Bare fangs again right after the mouth closed");
  const w = make();
  w.gm.greymarchWolfOn = true;
  w.gm.greymarchVoiceMessage({ hud: false, listen: true, talking: true, speaking: [] });
  lipTick(w);
  assert.strictEqual(w.log.faces.me, undefined);
});

test("eating, drinking and potions: the matching idle once the menu is closed; eating and drinking take five seconds; poisons, a drawn weapon or a running emote play nothing", () => {
  assert.deepStrictEqual(["Venison Stew", "Nord Mead", "Jug of Milk", "Frost Mirriam Tea Sandwich", "Stros M'Kai Rum Cake", "Watermelon"].map((n) => emotes.consumeEmoteId({ food: true, poison: false, name: n })), ["bread", "mug", "mug", "bread", "bread", "bread"]);
  assert.strictEqual(emotes.consumeEmoteId({ food: false, poison: false, name: "Potion of Healing" }), "potion");
  assert.strictEqual(emotes.consumeEmoteId({ food: false, poison: true, name: "Deadly Poison" }), null);
  const idleOf = (id) => emotes.emoteById(id).idle;
  const s = make();
  s.state.menu = "MagicMenu"; s.eat("Venison Stew"); s.tick();
  assert.deepStrictEqual(s.log.idles, [], "not while a menu is open (one it does not close itself)");
  s.state.menu = null; s.tick();
  assert.deepStrictEqual(s.log.idles, [idleOf("bread")], "the standing eating idle");
  assert.strictEqual(s.log.thirdPerson, 1, "seen in third person (2026-11-02)"); assert.deepStrictEqual(s.log.notes, [], "no notice");
  for (let i = 0; i < 90; i++) s.tick(50); // 4.5 s
  assert.ok(s.gm.greymarchEmoteNow, "still eating");
  for (let i = 0; i < 12; i++) s.tick(50);
  assert.strictEqual(s.gm.greymarchEmoteNow, null, "done after EAT_SECONDS"); assert.strictEqual(s.log.idles[s.log.idles.length - 1], emotes.IDLE_STOP);
  s.log.idles.length = 0;
  s.eat("Ale"); s.tick(); assert.deepStrictEqual(s.log.idles, [idleOf("mug")], "the standing drinking idle");
  for (let i = 0; i < 102; i++) s.tick(50); assert.strictEqual(s.gm.greymarchEmoteNow, null, "a drink also takes five seconds"); s.log.idles.length = 0;
  s.eat("Ale"); s.tick(); s.log.idles.length = 0; s.state.speed = 100; s.tick(800); assert.ok(s.gm.greymarchEmoteNow && s.gm.greymarchEmoteNow.meal, "moving does not end a meal"); s.state.speed = 0; for (let i = 0; i < 90; i++) s.tick(50); assert.strictEqual(s.gm.greymarchEmoteNow, null); s.log.idles.length = 0;
  s.eat("Potion of Healing", false); s.tick(); assert.deepStrictEqual(s.log.idles, [idleOf("potion")], "a potion is a quick swig");
  s.eat("Deadly Poison", false, true); s.tick(); assert.strictEqual(s.log.idles.length, 1, "a poison: nothing");
  s.state.drawn = true; s.eat("Apple Pie"); s.tick(); assert.strictEqual(s.log.idles.length, 1, "weapon drawn: nothing");
  s.state.drawn = false; s.eat("Apple Pie"); s.tick(20000); assert.strictEqual(s.log.idles.length, 1, "forgotten after 15 seconds");
});

test("food or a drink used from the inventory or favorites closes that menu (the Tween Menu key, Tab unless rebound); a potion leaves it open; no menu, no key", () => {
  const s = make();
  s.state.menu = "InventoryMenu"; s.eat("Venison Stew");
  assert.deepStrictEqual(s.log.taps, [15], "Tab"); assert.strictEqual(s.state.menu, null);
  s.tick(); assert.strictEqual(s.log.idles.length, 1, "and the meal plays at once");
  const t = make(); t.state.tweenKey = 0x30; t.state.menu = "FavoritesMenu"; t.eat("Nord Mead");
  assert.deepStrictEqual(t.log.taps, [0x30], "a rebound key");
  const u = make(); u.state.menu = "InventoryMenu"; u.eat("Potion of Healing", false);
  assert.strictEqual(u.log.taps, undefined, "a potion: the inventory stays open"); assert.strictEqual(u.state.menu, "InventoryMenu");
  const v = make(); v.eat("Apple Pie");
  assert.strictEqual(v.log.taps, undefined, "no menu open (a hotkey): nothing pressed");
  const w = make(); w.state.menu = "ContainerMenu"; w.eat("Apple Pie");
  assert.strictEqual(w.log.taps, undefined, "another menu: left alone");
});

test("a potion: the player's drink plays the swig and its instant effect is undone (effects ended, values back to the frame before); the server's drink after the swig keeps its effect and plays nothing", () => {
  const s = make();
  s.state.av = { health: 40, magicka: 100, stamina: 80 };
  s.tick(); // the frame before the drink is noted
  s.eat("Potion of Healing", false);
  s.state.av.health = 90; // the game healed at once
  let dispelled = 0; s.gm.greymarchPotionUndo.effects.push({ dispel: () => dispelled++ });
  s.tick();
  assert.strictEqual(s.state.av.health, 40, "back to before the drink"); assert.strictEqual(dispelled, 1, "its effect ended");
  assert.deepStrictEqual(s.log.idles, [emotes.emoteById("potion").idle], "the swig");
  for (let i = 0; i < 12; i++) s.tick(50);
  assert.strictEqual(s.gm.greymarchPotionUndo, null, "the undo lasts half a second");
  s.log.idles.length = 0;
  s.eat("Potion of Healing", false); // the server's drink, after the swig
  s.state.av.health = 90; s.tick();
  assert.strictEqual(s.state.av.health, 90, "its effect stays"); assert.deepStrictEqual(s.log.idles, [], "no second swig");
  s.eat("Potion of Healing", false); s.tick();
  assert.deepStrictEqual(s.log.idles, [emotes.emoteById("potion").idle], "the next one the player drinks swigs again");
});

test("the build system's free camera: Place in the Build tab turns it on, a preview stands where the camera looks, the arrows move and turn it, Enter sends the exact spot, B or Esc leaves", () => {
  const s = make();
  s.state.cam = [1000, 2000, 300, 0, 1, 0]; // at 1000,2000,300 looking north
  s.page({ type: "build-cam", mode: "place", key: "d932f:Skyrim.esm", name: "Blacksmith Forge" }); s.camTick();
  assert.strictEqual(s.state.free, true, "the game's free camera is on");
  const g = s.log.ghosts[0]; assert.deepStrictEqual({ id: g.base.id, file: g.base.file }, { id: 0xd932f, file: "Skyrim.esm" });
  assert.deepStrictEqual(g.at, [1000, 2400, 300], "400 units ahead"); assert.deepStrictEqual(g.rot, [0, 0, 180], "facing the camera");
  s.key(200, true); s.key(200, false); s.key(205, true); s.key(205, false); s.key(201, true); s.key(201, false); s.camTick(50);
  assert.deepStrictEqual(g.at, [1000, 2425, 325], "the step: 25 units, 15 degrees"); assert.deepStrictEqual(g.rot, [0, 0, 195]);
  s.key(28, true); s.key(28, false);
  const sent = s.log.sent.filter((m) => m.customPacketType === "greymarchAdmin").pop();
  assert.deepStrictEqual([sent.op, sent.args.sub, sent.args.key, sent.args.pos, sent.args.rot], ["build", "place_at", "d932f:Skyrim.esm", [1000, 2425, 325], 195]);
  assert.ok(s.gm.greymarchBuildCam, "placing keeps the camera on for the next one");
  s.say({ customPacketType: "greymarchAdminReply", rid: sent.rid, ok: true, data: { message: "Blacksmith Forge placed." } });
  s.key(1, true); s.key(1, false);
  assert.strictEqual(s.gm.greymarchBuildCam, null); assert.strictEqual(s.state.free, false, "Esc leaves: the camera is the player's again"); assert.ok(g.gone, "the preview is gone");
  // moving a placed piece ends with the move
  s.page({ type: "build-cam", mode: "move", key: "6c:Skyrim.esm", name: "Chest", id: 4278190240 }); s.camTick(50);
  s.key(28, true); s.key(28, false);
  const mv = s.log.sent.filter((m) => m.customPacketType === "greymarchAdmin").pop();
  assert.deepStrictEqual([mv.args.sub, mv.args.id], ["move_to", 4278190240]); assert.strictEqual(s.gm.greymarchBuildCam, null);
  // no plugin: says so, nothing changes
  const t = make(); t.state.noDll = true;
  t.page({ type: "build-cam", mode: "place", key: "d932f:Skyrim.esm", name: "Forge" }); t.camTick();
  assert.ok(!t.gm.greymarchBuildCam, "no plugin: no free camera, nothing changes");
});

test("precision in the free camera (2026-10-31): [ and ] pick the step (1, 5, 25, 100 units / 1, 5, 15, 90 degrees), L locks the preview where it is while the camera flies, the arrows then move it the way the camera looks, comma and period turn it, L again follows from where it is", () => {
  const s = make();
  s.state.cam = [1000, 2000, 300, 0, 1, 0]; // looking north
  s.page({ type: "build-cam", mode: "place", key: "d932f:Skyrim.esm", name: "Sign" }); s.camTick();
  const g = s.log.ghosts[0];
  s.key(26, true); s.key(26, false); s.key(26, true); s.key(26, false); // [ twice: 1 unit, 1 degree
  s.key(200, true); s.key(200, false); s.camTick(50);
  assert.deepStrictEqual(g.at, [1000, 2401, 300]);
  s.key(38, true); s.key(38, false); // L: locked at 1000,2401,300
  s.state.cam = [5000, 5000, 900, 1, 0, 0]; s.camTick(100); // the camera flies off, looking east
  assert.deepStrictEqual(g.at, [1000, 2401, 300], "locked: it stays where it was");
  s.key(200, true); s.key(200, false); s.camTick(150); // forward the way the camera looks: east, 1 unit
  assert.deepStrictEqual(g.at, [1001, 2401, 300]);
  s.key(27, true); s.key(27, false); // ] : 5 units, 5 degrees
  s.key(205, true); s.key(205, false); s.key(201, true); s.key(201, false); s.key(52, true); s.key(52, false); s.camTick(200); // right of east is south, up, turn
  assert.deepStrictEqual(g.at, [1001, 2396, 305]); assert.deepStrictEqual(g.rot, [0, 0, 185]);
  s.key(28, true); s.key(28, false);
  const sent = s.log.sent.filter((m) => m.customPacketType === "greymarchAdmin").pop();
  assert.deepStrictEqual([sent.args.pos, sent.args.rot], [[1001, 2396, 305], 185], "Enter sends the locked spot");
  s.state.cam = [1001, 2000, 280, 0, 1, 0]; // the camera looks towards it again (north, from below)
  s.key(38, true); s.key(38, false); s.camTick(250); // unlocked: it follows the camera from where it is, no jump
  assert.deepStrictEqual(g.at.map(Math.round), [1001, 2396, 305]);
});

test("the chopping block: while the player sits in furniture its id goes to the server once a second, 0 once on getting up, nothing while standing", () => {
  const s = make();
  const chops = () => s.log.sent.filter((m) => m.customPacketType === "greymarchChop").map((m) => m.ref);
  s.chopTick(); s.chopTick(); assert.deepStrictEqual(chops(), [], "standing: nothing sent");
  s.state.furn = 0x10a3b5; s.chopTick(); s.chopTick(400); s.chopTick(600); s.chopTick();
  assert.deepStrictEqual(chops(), [0x10a3b5, 0x10a3b5, 0x10a3b5], "once a second, not every frame");
  s.state.furn = 0; s.chopTick(); s.chopTick(); s.chopTick();
  assert.deepStrictEqual(chops(), [0x10a3b5, 0x10a3b5, 0x10a3b5, 0], "got up: one 0, then quiet");
});

test("the crafting panel: the server opens it at a station, the page's requests go to the server as greymarchCraft, replies reach the page, Esc or the page closes it", () => {
  const s = make();
  s.say({ customPacketType: "greymarchCraftOpen", station: "kiln", title: "Charcoal kiln" });
  assert.strictEqual(s.gm.greymarchCraftOn, true);
  assert.deepStrictEqual(s.log.craft.pop(), { fn: "show", arg: { customPacketType: "greymarchCraftOpen", station: "kiln", title: "Charcoal kiln" } });
  assert.strictEqual(s.log.focused.pop(), true, "the panel has the mouse and keyboard");
  s.page({ type: "craft", rid: 4, op: "craft", args: { recipeId: "wc_charcoal", qty: 2 } });
  assert.deepStrictEqual(s.log.sent.pop(), { customPacketType: "greymarchCraft", rid: 4, op: "craft", args: { recipeId: "wc_charcoal", qty: 2 } });
  s.say({ customPacketType: "greymarchCraftReply", rid: 4, ok: true }); assert.strictEqual(s.log.craft.pop().fn, "reply");
  s.say({ customPacketType: "greymarchCraftDone", rid: 4, ok: true }); assert.strictEqual(s.log.craft.pop().fn, "done");
  s.key(1, true); s.key(1, false);
  assert.strictEqual(s.gm.greymarchCraftOn, false, "Esc closes it"); assert.strictEqual(s.log.craft.pop().fn, "hide");
  s.say({ customPacketType: "greymarchCraftOpen", station: "kiln", title: "Charcoal kiln" }); s.page({ type: "craft-close" });
  assert.strictEqual(s.gm.greymarchCraftOn, false, "the page's close button closes it");
  assert.ok(/case 'greymarchCraftOpen':/.test(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8")), "the packets reach the bridge");
});

test("the forge window: the game says it has it on entering the world; the server opens it at a forge; requests go to the server as greymarchForge; Esc or the page closes it", () => {
  let s = make();
  try { s.say({ customPacketType: "greymarchEntered" }); } catch (e) { /* the rest of entering the world is not this test's */ }
  assert.ok(s.log.sent.some((m) => m.customPacketType === "greymarchForgeReady"), "the server learns this game has the forge window");
  assert.ok(!s.gm.greymarchForgeOn); s.say({ customPacketType: "greymarchForgeOpen" }); assert.ok(!s.gm.greymarchForgeOn || !s.gm.greymarchScreenUp, "never over the select screen");
  s = make();
  s.say({ customPacketType: "greymarchForgeOpen", title: "Forge", forge: 0xc430a });
  assert.strictEqual(s.gm.greymarchForgeOn, true); assert.strictEqual(s.log.forge.pop().fn, "show");
  assert.strictEqual(s.log.turned, undefined, "nothing from the packet itself (the game refuses calls there)");
  s.at(() => s.gm.greymarchForgeTick(Date.now()));
  assert.deepStrictEqual(s.log.movedTo, [0xc430a, 0, 0, 0, true], "moved onto the forge's working spot with its rotation (MoveTo), on the next frame");
  s.state.menu = "Crafting Menu"; s.at(() => s.gm.greymarchForgeTick(Date.now() + 300));
  assert.deepStrictEqual(s.log.natives.filter((n) => n[1] === "CloseMenu").pop(), ["GreymarchCam", "CloseMenu", "Crafting Menu"], "the game's own crafting menu is closed under the forge window");
  s.state.menu = null;
  const told = s.log.natives.filter((n) => n[1] === "SetForge").pop(); assert.strictEqual(told[2].id, 0xc430a, "the plugin is told the forge, so its bellows follow the pulls");
  assert.notStrictEqual(s.log.events[s.log.events.length - 1], "IdleBlackSmithForgeEnter", "the hammering waits until the smith is there");
  s.at(() => s.gm.greymarchForgeTick(Date.now() + 400)); assert.strictEqual(s.log.events.pop(), "IdleBlackSmithForgeEnter", "at work like the game's own forge menu");
  s.page({ type: "forge", rid: 3, op: "craft", args: { id: 12, qty: 2, tab: "weapons" } });
  assert.deepStrictEqual(s.log.sent.pop(), { customPacketType: "greymarchForge", rid: 3, op: "craft", args: { id: 12, qty: 2, tab: "weapons" } });
  s.say({ customPacketType: "greymarchForgeReply", rid: 3, ok: true }); assert.strictEqual(s.log.forge.pop().fn, "reply");
  s.page({ type: "forge-preview", key: "20:skyrim.esm" }); s.at(() => s.gm.greymarchForgePreviewTick(Date.now()));
  assert.strictEqual(s.log.ghosts.length, 1, "the picked piece is shown"); assert.strictEqual(s.log.ghosts[0].blocked, true, "it cannot be used or picked up"); assert.strictEqual(s.log.ghosts[0].motion, 4, "keyframed");
  s.key(1, true); s.key(1, false);
  assert.strictEqual(s.gm.greymarchForgeOn, false, "Esc closes it"); assert.strictEqual(s.log.forge.pop().fn, "hide");
  s.at(() => s.gm.greymarchForgePreviewTick(Date.now())); assert.strictEqual(s.log.ghosts[0].gone, true, "the display goes with the window");

  s.at(() => s.gm.greymarchForgeTick(Date.now()));
  assert.strictEqual(s.log.events.pop(), "IdleChairExitStart", "steps out of the forge's animation, on the next frame");
  assert.deepStrictEqual(s.log.natives.filter((n) => n[1] === "SetForge").pop(), ["GreymarchCam", "SetForge", null], "and the plugin lets the forge go");
  s.say({ customPacketType: "greymarchForgeOpen" }); s.page({ type: "forge-close" });
  assert.strictEqual(s.gm.greymarchForgeOn, false, "the page's close button closes it");
  assert.ok(/case 'greymarchForgeOpen':/.test(require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8")), "the packets reach the bridge");
});

test("the station windows: a smelter opens the forge window in its station mode; the worker is put at the furniture's marker, facing its way, and does the smelter's own animation; requests name the station", () => {
  const s = make();
  s.state.marker = [520, 640, 12, Math.PI / 2];
  s.say({ customPacketType: "greymarchForgeOpen", station: "smelter", title: "Smelter", ref: 0xc4321, anim: "IdleSmelterEnter" });
  assert.strictEqual(s.gm.greymarchForgeOn, true);
  assert.deepStrictEqual(s.log.forge.pop(), { fn: "show", arg: { station: "smelter", title: "Smelter" } }, "the page opens as the smelter");
  s.at(() => s.gm.greymarchForgeTick(Date.now()));
  assert.deepStrictEqual(s.log.movedTo.slice(1), [20, 40, 2, false], "moved onto the smelter's marker (its world spot less the furniture's), on the next frame");
  assert.strictEqual(Math.round(s.log.turned), 90, "facing the marker's way");
  assert.ok(!s.log.natives.some((n) => n[1] === "SetForge"), "no bellows: it is not a forge");
  s.at(() => s.gm.greymarchForgeTick(Date.now() + 400)); assert.strictEqual(s.log.events.pop(), "IdleSmelterEnter", "at work like the game's own smelter");
  s.page({ type: "forge", rid: 4, op: "craft", args: { station: "smelter", id: 2, qty: 1, tab: "ingots" } });
  assert.deepStrictEqual(s.log.sent.pop(), { customPacketType: "greymarchForge", rid: 4, op: "craft", args: { station: "smelter", id: 2, qty: 1, tab: "ingots" } });
  s.key(1, true); s.key(1, false); s.at(() => s.gm.greymarchForgeTick(Date.now()));
  assert.strictEqual(s.log.events.pop(), "IdleSmelterExit", "steps out with the smelter's own exit");
  const k = make(); // the kiln: no marker, no animation, only the window
  k.say({ customPacketType: "greymarchForgeOpen", station: "kiln", title: "Charcoal Kiln", ref: 0x1234, anim: "" });
  k.at(() => k.gm.greymarchForgeTick(Date.now()));
  assert.strictEqual(k.log.movedTo, undefined, "nobody is moved at a station with no animation");
  const o = make(); o.state.marker = null; // an older GreymarchCamera.dll (no marker): the window opens, nobody is moved into the furniture
  o.say({ customPacketType: "greymarchForgeOpen", station: "tan", title: "Tanning Rack", ref: 0x1234, anim: "IdleTanningEnter" });
  o.at(() => o.gm.greymarchForgeTick(Date.now())); o.at(() => o.gm.greymarchForgeTick(Date.now() + 400));
  assert.strictEqual(o.log.movedTo, undefined); assert.ok(!o.log.events.includes("IdleTanningEnter"));
  const w = make(); w.state.marker = null; // a spinning wheel (the loom): no marker in its mesh, so the spot the server gives, turned with the wheel (angle 90 here)
  w.say({ customPacketType: "greymarchForgeOpen", station: "loom", title: "Loom", ref: 0x1234, anim: "IdleAlchemyEnter", stand: [0, -55, 0] });
  w.at(() => w.gm.greymarchForgeTick(Date.now()));
  assert.deepStrictEqual(w.log.movedTo.slice(1).map(Math.round), [-55, 0, 0, 0], "55 units in front of the wheel, turned with it");
  assert.strictEqual(Math.round(w.log.turned), 90, "facing the way the wheel faces");
  w.at(() => w.gm.greymarchForgeTick(Date.now() + 400)); assert.strictEqual(w.log.events.pop(), "IdleAlchemyEnter");
});

test("the pointer: while a window holds the mouse and has the focus but the game's Cursor Menu is closed, the focus is dropped and taken again (it opens it); never while it is open", () => {
  const s = make();
  s.say({ customPacketType: "greymarchForgeOpen" });
  const n = s.log.focused.length;
  s.state.menu = "Cursor Menu"; s.at(() => s.gm.greymarchPointerGuard(Date.now() + 1000));
  assert.strictEqual(s.log.focused.length, n, "the Cursor Menu is open: nothing touched (dropping the focus then would close it)");
  s.state.menu = null; s.at(() => s.gm.greymarchPointerGuard(Date.now() + 2000));
  assert.deepStrictEqual(s.log.focused.slice(n), [false, true], "closed: dropped and taken again, which opens it");
  s.state.focused = false; s.at(() => s.gm.greymarchPointerGuard(Date.now() + 3000));
  assert.strictEqual(s.log.focused.length, n + 2, "no focus: left to the window's own focus guard");
  s.state.focused = true; s.page({ type: "forge-close" }); const m = s.log.focused.length;
  s.at(() => s.gm.greymarchPointerGuard(Date.now() + 4000));
  assert.strictEqual(s.log.focused.length, m, "no window open: nothing");
});

test("a meal while sitting: the seated eating or drinking idle in a chair or on an edge, ended with the IdleStop event (still sitting); cross-legged on the ground: nothing", () => {
  const s = make();
  s.state.sitState = 3; // in a chair
  s.eat("Venison Stew"); s.tick();
  assert.deepStrictEqual(s.log.idles, [0x65d06], "ChairEatingStart, not the standing idle");
  assert.ok(s.gm.greymarchEmoteNow && s.gm.greymarchEmoteNow.meal, "a meal, the controls locked");
  for (let i = 0; i < 102; i++) s.tick(50);
  assert.ok(s.gm.greymarchEmoteNow && s.gm.greymarchEmoteNow.meal, "still eating after five seconds: a seated meal is longer");
  for (let i = 0; i < 60; i++) s.tick(50);
  assert.strictEqual(s.gm.greymarchEmoteNow, null, "over after SEAT_EAT_SECONDS (8)");
  assert.deepStrictEqual(s.log.events, ["IdleStop"], "back to sitting: the event the chair graph listens to");
  assert.ok(!s.log.idles.includes(emotes.IDLE_STOP), "not the IdleStop_Loose idle");
  s.log.idles.length = 0; s.log.events.length = 0;
  s.eat("Nord Mead"); s.tick(); assert.deepStrictEqual(s.log.idles, [0x65d07], "a drink: ChairDrinkingStart");
  for (let i = 0; i < 162; i++) s.tick(50); assert.deepStrictEqual(s.log.events, ["IdleStop"]);

  const e = make(); // on an edge (the wheel): the game wants a real seat, so the event itself; still sitting on the edge after
  e.page({ type: "emote", id: "sitledge" }); e.tick(); e.state.refuse = true; e.log.events.length = 0;
  e.eat("Apple Pie"); e.tick();
  assert.deepStrictEqual(e.log.events, ["ChairEatingStart"]);
  for (let i = 0; i < 162; i++) e.tick(50);
  assert.deepStrictEqual(e.log.events, ["ChairEatingStart", "IdleStop"]);
  assert.ok(e.gm.greymarchEmoteNow && e.gm.greymarchEmoteNow.id === "sitledge", "still sitting on the edge: moving stands up as before");
  e.state.speed = 100; for (let i = 0; i < 20; i++) e.tick(50);
  assert.strictEqual(e.gm.greymarchEmoteNow, null); assert.strictEqual(e.log.events.at(-1), "IdleChairExitStart");

  const g = make(); // cross-legged on the ground: no seated meal fits, so nothing plays (as before)
  g.page({ type: "emote", id: "sit" }); g.tick(); g.log.idles.length = 0; g.log.events.length = 0;
  g.eat("Apple Pie"); g.tick(); assert.deepStrictEqual([g.log.idles, g.log.events], [[], []]);
  assert.strictEqual(g.gm.greymarchEmoteNow.id, "sit");
});

test("no first person during an emote or a meal (2026-11-02, the owner: they cannot even try; eating and drinking too): the game's camera switch is off while it lasts, a one-off emote for 5 seconds; on again after; a potion leaves it alone", () => {
  const s = make();
  s.page({ type: "emote", id: "hey" }); s.tick();
  assert.strictEqual(s.log.thirdPerson, 1, "the emote starts in third person");
  assert.deepStrictEqual((s.log.pov || []).map((c) => c[0]), ["off"], "the camera switch is turned off");
  s.state.speed = 100; for (let i = 0; i < 20; i++) s.tick(50);
  assert.strictEqual(s.gm.greymarchEmoteNow, null, "moving ends it");
  s.tick(2100); // getting up: third person 2 s more (2026-11-03)
  assert.strictEqual(s.log.pov.at(-1)[0], "on", "and the camera switch is on again");
  const o = make();
  o.page({ type: "emote", id: "wave" }); o.tick();
  assert.strictEqual(o.log.pov.at(-1)[0], "off", "a wave too");
  o.tick(4000); assert.strictEqual(o.log.pov.at(-1)[0], "off", "still off 4 seconds in");
  o.tick(1500); assert.strictEqual(o.log.pov.at(-1)[0], "on", "on again after 5 seconds");
  const m = make();
  m.eat("Venison Stew"); m.tick();
  assert.strictEqual(m.log.thirdPerson, 1, "eating: third person");
  assert.strictEqual(m.log.pov.at(-1)[0], "off", "and no first person while eating");
  for (let i = 0; i < 102; i++) m.tick(50);
  assert.strictEqual(m.gm.greymarchEmoteNow, null); assert.strictEqual(m.log.pov.at(-1)[0], "on", "back after the meal");
  const p = make();
  p.eat("Potion of Healing", false); for (let i = 0; i < 20; i++) p.tick(50);
  assert.strictEqual(p.log.thirdPerson, 0, "a potion: the camera is left alone"); assert.strictEqual(p.log.pov, undefined);
});

test("back to first person after an emote or a meal, only if they were in first person before it (2026-11-02, the owner)", () => {
  const s = make(); s.state.cam = 0;
  s.page({ type: "emote", id: "hey" }); s.tick();
  assert.strictEqual(s.state.cam, 9, "third person while it lasts");
  s.state.speed = 100; for (let i = 0; i < 20; i++) s.tick(50);
  assert.strictEqual(s.gm.greymarchEmoteNow, null);
  assert.strictEqual(s.state.cam, 9, "still third person while getting up (2026-11-03)"); s.tick(2100);
  assert.strictEqual(s.state.cam, 0, "first person again"); assert.strictEqual(s.log.firstPerson, 1);
  const t = make(); // in third person already: left there
  t.page({ type: "emote", id: "hey" }); t.tick(); t.state.speed = 100; for (let i = 0; i < 20; i++) t.tick(50);
  assert.strictEqual(t.log.firstPerson, undefined);
  const m = make(); m.state.cam = 0;
  m.eat("Nord Mead"); m.tick(); assert.strictEqual(m.state.cam, 9);
  for (let i = 0; i < 102; i++) m.tick(50);
  assert.strictEqual(m.state.cam, 0, "after a drink too");
  const r = make(); r.state.cam = 0; r.state.drawn = true;
  r.page({ type: "emote", id: "hey" }); r.tick(); r.state.drawn = false; r.state.cam = 9; r.tick();
  r.page({ type: "emote", id: "hey" }); r.tick(); r.state.speed = 100; for (let i = 0; i < 20; i++) r.tick(50);
  assert.strictEqual(r.log.firstPerson, undefined, "a refused emote is forgotten: the next one asks afresh (they were in third person by then)");
});

test("profession work in third person (2026-11-02, the owner: skinning with the bow out stayed in first person): the weapon is put away, the kneel waits for it, third person and no first person while the mini game is up, first person again after", () => {
  const s = make(); s.state.cam = 0; s.state.drawn = true;
  s.say({ customPacketType: "greymarchMinigame", token: "t1", kind: "skin", level: 1, target: 0x1234, emote: "searchbody", animal: "Deer" });
  s.tick();
  assert.strictEqual(s.log.sheathed, 1, "the bow is put away");
  assert.strictEqual(s.state.cam, 9, "third person");
  assert.strictEqual(s.log.pov.at(-1)[0], "off", "no first person");
  assert.deepStrictEqual(s.log.idles, [], "the kneel waits for the bow");
  assert.ok(!s.log.notes.includes("Sheathe your weapon first"), "no complaint");
  s.state.drawn = false; s.tick(300);
  assert.deepStrictEqual(s.log.idles, [], "not while the put-away animation still plays (the game says not drawn as it starts)");
  s.tick(1300);
  assert.deepStrictEqual(s.log.idles, [emotes.emoteById("searchbody").idle], "then the kneel");
  s.say({ customPacketType: "greymarchMinigameDone", ok: true, target: 0x1234 });
  for (let i = 0; i < 40; i++) s.tick(50);
  s.tick(2100); // up from the kneel: third person 2 s more
  assert.strictEqual(s.log.pov.at(-1)[0], "on", "first person allowed again");
  assert.strictEqual(s.state.cam, 0, "and back in it");
});

test("the mouse wheel cannot zoom into first person during an emote (2026-11-02): first person is put back to third the next frame", () => {
  const s = make();
  s.page({ type: "emote", id: "hey" }); s.tick();
  const n = s.log.thirdPerson;
  s.state.cam = 0; s.tick(16);
  assert.strictEqual(s.state.cam, 9); assert.strictEqual(s.log.thirdPerson, n + 1);
  const q = make(); q.state.cam = 0; q.tick(16); q.tick(16);
  assert.strictEqual(q.state.cam, 0, "no emote: first person is theirs");
});

test("a meal cannot be skipped: the controls are locked for its five seconds (not looking, the camera or the menus); moving, a weapon, W or Stop do not end it", () => {
  const LOCK = [true, true, false, false, true, false, true, false, 0];
  const s = make();
  s.eat("Venison Stew"); s.tick();
  assert.deepStrictEqual(s.log.controls, [["off", ...LOCK]], "movement, fighting, sneaking, activating");
  s.key(17, true); s.key(17, false); s.state.speed = 120; s.state.drawn = true;
  s.page({ type: "emote-stop" });
  for (let i = 0; i < 40; i++) s.tick(50); // 2 s
  assert.ok(s.gm.greymarchEmoteNow && s.gm.greymarchEmoteNow.meal, "still eating");
  s.page({ type: "emote", id: "wave" }); s.tick();
  assert.strictEqual(s.log.notes.at(-1), "Finish eating first", "no wheel emote over a meal");
  for (let i = 0; i < 70; i++) s.tick(50);
  assert.strictEqual(s.gm.greymarchEmoteNow, null, "over after five seconds");
  assert.deepStrictEqual(s.log.controls, [["off", ...LOCK], ["on", ...LOCK]], "and free again (only what the meal locked)");
  assert.strictEqual(s.log.idles.at(-1), emotes.IDLE_STOP);
});

test("a second meal waits for the first and plays after it; a meal is never replaced", () => {
  const s = make();
  const bread = emotes.emoteById("bread").idle, mug = emotes.emoteById("mug").idle;
  s.eat("Venison Stew"); s.tick();
  s.eat("Nord Mead"); s.tick();
  assert.deepStrictEqual(s.log.idles, [bread], "the drink waits");
  for (let i = 0; i < 101; i++) s.tick(50);
  assert.deepStrictEqual(s.log.idles.filter((x) => x !== emotes.IDLE_STOP), [bread, mug], "then plays (waiting did not use up its 15 seconds)");
  assert.ok(s.gm.greymarchEmoteNow && s.gm.greymarchEmoteNow.id === "mug");
  assert.strictEqual(s.log.controls.filter((c) => c[0] === "off").length, 2);
});

test("the controls always come back: death, a beast form, a staff freeze is left alone", () => {
  const d = make();
  d.eat("Venison Stew"); d.tick();
  d.state.dead = true; d.tick(300);
  assert.strictEqual(d.gm.greymarchEmoteNow, null);
  assert.strictEqual(d.log.controls.at(-1)[0], "on", "dead: free");
  const w = make();
  w.eat("Venison Stew"); w.tick();
  w.gm.greymarchWolfOn = true; w.tick(); w.tick();
  assert.strictEqual(w.log.controls.at(-1)[0], "on", "a beast form: free");
  assert.strictEqual(w.gm.greymarchMealLocked, false);
  const o = make();
  o.eat("Venison Stew"); o.tick();
  o.gm.greymarchEmoteNow = null; o.tick();
  assert.strictEqual(o.log.controls.at(-1)[0], "on", "the meal dropped any other way: free next frame");
  const f = make();
  f.eat("Venison Stew"); f.tick();
  f.gm.greymarchFxHave = { frozen: true };
  for (let i = 0; i < 110; i++) f.tick(50);
  assert.strictEqual(f.log.controls.length, 1, "staff froze the player: the meal does not unfreeze them");
});

test("potions stay a quick swig: no lock", () => {
  const s = make();
  s.eat("Potion of Healing", false); s.tick();
  assert.strictEqual(s.log.controls, undefined);
});

test("the server asks for an emote (greymarchEmote, a salt deposit): played like the wheel's, ended like Stop after ms; ignored when dead, in furniture, mounted, eating or unknown", () => {
  const kneel = emotes.emoteById("searchbody").idle;
  const s = make();
  s.say({ customPacketType: "greymarchEmote", emote: "searchbody", ms: 4000 });
  assert.deepStrictEqual(s.log.idles, [], "nothing from the packet handler");
  s.tick();
  assert.deepStrictEqual(s.log.idles, [kneel], "kneels");
  assert.strictEqual(s.log.thirdPerson, 1, "as from the wheel");
  for (let i = 0; i < 70; i++) s.tick(50); // 3.5 s
  assert.deepStrictEqual(s.log.idles, [kneel], "still kneeling");
  for (let i = 0; i < 12; i++) s.tick(50);
  assert.deepStrictEqual(s.log.idles, [kneel, emotes.IDLE_STOP], "up after 4 s, the way Stop does it");
  assert.strictEqual(s.gm.greymarchEmoteNow, null);
  const m = make();
  m.say({ customPacketType: "greymarchEmote", emote: "searchbody", ms: 4000 }); m.tick();
  m.state.speed = 120; m.tick(800);
  assert.strictEqual(m.gm.greymarchEmoteNow, null, "walked off: it just ends");
  m.state.speed = 0; m.log.idles.length = 0;
  m.say({ customPacketType: "greymarchEmote", emote: "pray", ms: 4000 }); m.tick();
  for (let i = 0; i < 100; i++) m.tick(50);
  assert.deepStrictEqual(m.log.idles, [emotes.emoteById("pray").idle, emotes.IDLE_STOP], "an emote picked again later is not ended by an old timer");
  const no = (setup, emote) => { const x = make(); setup(x); x.say({ customPacketType: "greymarchEmote", emote, ms: 4000 }); x.tick(); return x.log.idles.length; };
  assert.strictEqual(no((x) => { x.state.dead = true; }, "searchbody"), 0, "dead");
  assert.strictEqual(no((x) => { x.state.furn = 0x1234; }, "searchbody"), 0, "in furniture");
  assert.strictEqual(no((x) => { x.state.mounted = true; }, "searchbody"), 0, "mounted");
  assert.strictEqual(no(() => {}, "explode"), 0, "unknown");
  assert.strictEqual(no(() => {}, "fangs"), 0, "a face is not an emote here");
  assert.strictEqual(no((x) => { x.eat("Venison Stew"); x.tick(); x.log.idles.length = 0; }, "searchbody"), 0, "eating");
});

test("the forge display (2026-10-26, back with guards): never left behind, never picked up; a copy the game still has is deleted again until it is gone; an id now used by something else is never touched", () => {
  const s = make(); let t = 5_000_000; const tick = (ms = 50) => { t += ms; s.gm.greymarchForgePreviewTick(t); };
  // the game's forms by id (a copy deleted from a cell that unloaded is still there)
  s.state.cam = [480, 560, 150, 0, 1, 0]; // the camera at the smith, looking north
  const world = {}; const was = s.gm.sp.Game.getFormEx; s.gm.sp.Game.getFormEx = (id) => (id in world ? world[id] : was(id)); s.gm.sp.ObjectReference.from = (f) => f || null;
  s.page({ type: "forge-preview", key: "20:skyrim.esm" }); tick();
  assert.strictEqual((s.log.ghosts || []).length, 0, "nothing is placed while the window is closed");
  s.say({ customPacketType: "greymarchForgeOpen", title: "Forge", forge: 0xc430a });
  s.page({ type: "forge-preview", key: "20:skyrim.esm" }); tick();
  const g1 = s.log.ghosts[0]; assert.ok(g1 && !g1.gone && g1.blocked === true && g1.motion === 4);
  assert.ok(g1.at && g1.rot, "placed in front of the camera");
  for (let i = 0; i < 60; i++) tick(50);
  assert.strictEqual(g1.moves, 1, "placed ONCE: moving it every frame redraws it (it flickered)");
  assert.ok(g1.turns && g1.turns.length === 1, "set to its front view once (the smooth movement), then it stands still: " + (g1.turns || []).length);
  assert.strictEqual(g1.rot[0], 0, "not a weapon or armour: as it is");
  let again = 0; world[g1.id] = { getBaseObject: () => ({ getFormID: () => 0x20 }), disable() {}, delete() { again++; } }; // the game keeps the form after a delete (its cell unloaded)
  // a new pick: the old copy goes, the new one is shown
  s.page({ type: "forge-preview", key: "21:skyrim.esm" }); tick();
  assert.strictEqual(again, 2, "the old copy is deleted (fetched by its id), and swept at once"); const g2 = s.log.ghosts[1]; assert.ok(g2 && !g2.gone);
  // the old copy is still in the game: the sweep deletes it again, until it is gone
  tick(2100); assert.strictEqual(again, 3, "deleted again"); tick(2100); assert.strictEqual(again, 4, "and again while the game has it");
  delete world[g1.id]; tick(2100); tick(2100); assert.strictEqual(again, 4, "gone: let go");
  assert.strictEqual(g2.gone, false, "the shown copy is not swept");
  // a weapon stands up (it is made lying down, how it rests when dropped)
  s.gm.sp.Weapon = { from: (f) => (f && f.id === 0x21 ? f : null) }; s.gm.sp.Armor = { from: () => null };
  s.page({ type: "forge-preview", key: "21:skyrim.esm" }); s.page({ type: "forge-preview", key: "20:skyrim.esm" }); tick(); s.page({ type: "forge-preview", key: "21:skyrim.esm" }); tick();
  const gw = s.log.ghosts.at(-1); assert.strictEqual(gw.rot[0], -90, "a weapon is stood up");
  assert.ok(s.log.ghosts.slice(0, -1).every((g) => g.gone), "only one copy at a time");
  const g2b = gw;
  // too far from the smith (a teleport): removed
  s.gm.sp.Game.getPlayer().getPositionX = () => 99999; tick(); assert.strictEqual(g2b.gone, true, "too far: removed");
  // its id given to something else since (another base): never touched
  let touched = 0; world[g2b.id] = { getBaseObject: () => ({ getFormID: () => 0x999 }), disable() { touched++; }, delete() { touched++; } };
  tick(2100); tick(2100); assert.strictEqual(touched, 0, "an id now used by something else is left alone");
  // the window closes with a copy shown: it goes
  s.gm.sp.Game.getPlayer().getPositionX = () => 480;
  s.page({ type: "forge-preview", key: "22:skyrim.esm" }); tick(); const g3 = s.log.ghosts.at(-1); assert.ok(g3 && !g3.gone);
  s.page({ type: "forge-close" }); tick(); assert.strictEqual(g3.gone, true, "the display goes with the window");
  s.page({ type: "forge-preview", key: "23:skyrim.esm" }); const made = s.log.ghosts.length; tick(); assert.strictEqual(s.log.ghosts.length, made, "nothing while closed");
});

test("the forge display holds still: placed ONCE and left to load (placing it again restarts its 3D: it never loaded, 2026-10-26), keyframed once its 3D is there, and a piece that drops is moved back smoothly", () => {
  const s = make(); let t = 7_000_000; const tick = (ms = 50) => { t += ms; s.gm.greymarchForgePreviewTick(t); };
  s.state.cam = [480, 560, 150, 0, 1, 0];
  s.say({ customPacketType: "greymarchForgeOpen", title: "Forge", forge: 0xc430a });
  s.state.no3d = true;
  s.page({ type: "forge-preview", key: "20:skyrim.esm" }); tick();
  const g = s.log.ghosts[0]; const asked = g.motions;
  for (let i = 0; i < 40; i++) tick(50);
  assert.strictEqual(g.moves, 1, "placed once and left to load: not placed again every frame");
  assert.strictEqual(g.motions, asked, "not keyframed before its 3D is there");
  for (let i = 0; i < 20; i++) tick(50);
  tick(100); assert.strictEqual(g.moves, 2, "not loaded after 3 s: placed once more");
  s.state.no3d = false; tick();
  assert.strictEqual(g.motions, asked + 1, "keyframed once its 3D is there"); assert.strictEqual(g.motion, 4);
  const coll = s.log.natives.filter((n) => n[0] === "PO3_SKSEFunctions" && n[1] === "SetCollisionLayer").at(-1);
  assert.ok(coll && coll[2] && coll[2].id === g.id, "its 3D put on the non-collidable layer (the Papyrus Extender): the smith cannot push themselves on it");
  for (let i = 0; i < 20; i++) tick(50);
  assert.strictEqual(g.moves, 2, "then never placed again (that would restart its 3D)");
  const turns = g.turns.length;
  g.fell = 30; tick(250); tick(250); g.fell = 0;
  const back = g.turns.slice(turns).find((a) => a[6] === 500);
  assert.ok(back, "it dropped: moved back with the smooth movement, fast"); assert.deepStrictEqual(back.slice(0, 3), g.at);
  assert.strictEqual(g.motions, asked + 2, "and keyframed again"); assert.strictEqual(g.moves, 2);
  assert.strictEqual(g.gone, false, "still shown");
});

test("the forge display is only ever reached by its form id, fetched each frame: a handle from an earlier frame is refused by the game (Invalid _skyrimPlatform_indexInPool, 2026-10-26)", () => {
  const s = make(); let t = 9_000_000; const tick = (ms = 50) => { t += ms; s.gm.greymarchForgePreviewTick(t); };
  s.state.cam = [480, 560, 150, 0, 1, 0];
  s.say({ customPacketType: "greymarchForgeOpen", title: "Forge", forge: 0xc430a });
  s.page({ type: "forge-preview", key: "20:skyrim.esm" }); tick();
  const g = s.log.ghosts[0];
  // from now on the handle placeAtMe gave is stale, like in the game: only a fresh fetch by id works
  const stale = () => { throw new Error("SP3NativeValueCasts::JsObjectToNativeObject - Invalid _skyrimPlatform_indexInPool"); };
  const fresh = { ...g }; for (const k of ["setPosition", "setAngle", "translateTo", "disable", "delete", "setMotionType", "getAngleZ", "getPositionX", "getPositionY", "getPositionZ"]) { const own = g[k]; fresh[k] = (...a) => own(...a); g[k] = stale; }
  s.gm.sp.Game.getFormEx = (id) => (id === g.id ? (fresh.gone || g.gone ? null : fresh) : { id });
  const ok = fresh.setPosition; let used = 0; fresh.setPosition = (...a) => { used++; return ok(...a); };
  for (let i = 0; i < 40; i++) tick(50);
  assert.strictEqual(s.gm.greymarchForgeGhostId, g.id, "still shown");
  assert.ok(!s.log.lines.some((l) => /display removed/.test(l)), "never removed for a stale handle");
  s.page({ type: "forge-close" }); tick();
  assert.strictEqual(g.gone, true, "deleted through a fresh fetch when the window closes");
});

test("the forge display stands still and is examined with the mouse (2026-10-26, the owner): a drag turns it round or tips it, the wheel brings it closer or farther, a double-click puts it back", () => {
  const s = make(); let t = 11_000_000; const tick = (ms = 50) => { t += ms; s.gm.greymarchForgePreviewTick(t); };
  s.state.cam = [480, 560, 150, 0, 1, 0]; // looking north: facing the smith is 180
  s.say({ customPacketType: "greymarchForgeOpen", title: "Forge", forge: 0xc430a });
  s.page({ type: "forge-preview", key: "30:skyrim.esm" }); for (let i = 0; i < 40; i++) tick(50);
  const g = s.log.ghosts.at(-1); const n0 = g.turns.length;
  for (let i = 0; i < 40; i++) tick(50);
  assert.strictEqual(g.turns.length, n0, "still by itself");
  const last = () => g.turns.at(-1);
  s.page({ type: "forge-turn", dx: 60, dy: 0 }); tick(50);
  assert.strictEqual(Math.round(last()[5]), 150, "dragged 60 px right: turned 30 degrees"); assert.deepStrictEqual(last().slice(6), [500, 600], "turned at a steady speed towards it (snapping there was jerky)");
  s.page({ type: "forge-turn", dx: 0, dy: 50 }); tick(50);
  assert.strictEqual(Math.round(last()[3]), 20, "dragged down: tipped 20 degrees");
  s.page({ type: "forge-turn", dx: 0, dy: 5000 }); tick(50); assert.strictEqual(Math.round(last()[3]), 20, "a silly drag is ignored");
  s.page({ type: "forge-turn", dx: 0, dy: 400 }); tick(50); assert.strictEqual(((Math.round(last()[3]) % 360) + 360) % 360, 180, "tips all the way over (a piece facing away can be turned to the smith)");
  const y0 = last()[1];
  s.page({ type: "forge-turn", zoom: -1 }); tick(50);
  assert.strictEqual(Math.round(y0 - last()[1]), 10, "the wheel up: 10 units closer");
  for (let i = 0; i < 20; i++) s.page({ type: "forge-turn", zoom: -1 }); tick(50);
  assert.strictEqual(Math.round(last()[1] - (560 + 50)), 0, "no closer than 50 from the camera");
  s.page({ type: "forge-turn", reset: true }); tick(50);
  assert.deepStrictEqual([Math.round(last()[1]), Math.round(last()[3]), Math.round(last()[5])], [650, 0, 180], "a double-click: back to the front view");
  s.page({ type: "forge-close" }); tick(); const n1 = g.turns.length;
  s.page({ type: "forge-turn", dx: 100 }); tick(); assert.strictEqual(g.turns.length, n1, "nothing once the window is closed");
});

test("the forge display has its own lamp (2026-10-26, the owner: at night the piece could hardly be seen): the game's steady shadowless light, between the smith and the piece, moved with it, removed with it", () => {
  const s = make(); let t = 13_000_000; const tick = (ms = 50) => { t += ms; s.gm.greymarchForgePreviewTick(t); };
  s.state.cam = [480, 560, 150, 0, 1, 0]; // looking north
  s.say({ customPacketType: "greymarchForgeOpen", title: "Forge", forge: 0xc430a });
  s.page({ type: "forge-preview", key: "20:skyrim.esm" }); tick();
  const g = s.log.ghosts[0], l = s.log.lights[0];
  assert.deepStrictEqual({ id: l.base.id, file: l.base.file }, { id: 0x5eae2, file: "Skyrim.esm" }, "DefaultSunlight01NS_NotPortalStrict");
  assert.deepStrictEqual(l.at.map(Math.round), [Math.round(g.at[0]), Math.round(g.at[1] - 40), Math.round(g.at[2] + 25)], "40 units towards the smith, 25 up");
  for (let i = 0; i < 10; i++) tick(50);
  s.page({ type: "forge-turn", zoom: 1 }); tick(50);
  assert.strictEqual(Math.round(l.at[1]), Math.round(s.gm.greymarchForgeGhostAt[1] - 40), "moved with the piece");
  s.page({ type: "forge-preview", key: "21:skyrim.esm" }); tick();
  assert.strictEqual(l.gone, true, "a new piece: the old lamp goes"); assert.strictEqual(s.log.lights.length, 2); const l2 = s.log.lights[1];
  s.page({ type: "forge-close" }); tick();
  assert.strictEqual(l2.gone, true, "the window closes: the lamp goes"); assert.strictEqual(s.log.ghosts[1].gone, true);
});

test("the forge display is never shown at the smelter or the charcoal kiln (2026-10-26, the owner); other stations show it", () => {
  const s = make(); let t = 15_000_000; const tick = (ms = 50) => { t += ms; s.gm.greymarchForgePreviewTick(t); };
  s.state.cam = [480, 560, 150, 0, 1, 0];
  s.say({ customPacketType: "greymarchForgeOpen", station: "smelter", title: "Smelter", ref: 0xc4321 });
  s.page({ type: "forge-preview", key: "5ace4:skyrim.esm" }); tick();
  assert.strictEqual((s.log.ghosts || []).length, 0, "nothing at the smelter");
  s.page({ type: "forge-close" }); tick();
  s.say({ customPacketType: "greymarchForgeOpen", station: "kiln", title: "Charcoal Kiln", ref: 0xc4323 });
  s.page({ type: "forge-preview", key: "33:skyrim.esm" }); tick();
  assert.strictEqual((s.log.ghosts || []).length, 0, "nothing at the charcoal kiln");
  s.page({ type: "forge-close" }); tick();
  s.say({ customPacketType: "greymarchForgeOpen", station: "tan", title: "Tanning Rack", ref: 0xc4322 });
  s.page({ type: "forge-preview", key: "20:skyrim.esm" }); tick();
  assert.strictEqual(s.log.ghosts.length, 1, "the tanning rack shows its pieces");
});

test("sitting down (2026-10-30): the game refuses the sitting idle away from a seat, so its own event sits the player anywhere; moving stands them up with IdleChairExitStart; it counts as rest", () => {
  const s = make();
  s.state.refuse = true; // GetSitting == 2: playIdle says no on open ground
  s.page({ type: "emote", id: "sit" }); s.tick();
  assert.deepStrictEqual(s.log.idles, [0xc4ef9], "IdleSitCrossLeggedEnter tried first");
  assert.deepStrictEqual(s.log.events, ["IdleSitCrossLeggedEnter"]);
  assert.ok(!s.log.notes.includes("You cannot do that right now"));
  assert.strictEqual(s.gm.greymarchEmoteNow.id, "sit");
  s.chopTick();
  assert.deepStrictEqual(s.log.sent.filter((m) => m.customPacketType === "greymarchChop").at(-1), { customPacketType: "greymarchChop", ref: 0, rest: true }, "resting (exhaustion.js)");
  s.key(17, true); s.tick();
  assert.deepStrictEqual(s.log.idles, [0xc4ef9, 0xc4efa], "IdleSitCrossLeggedExit tried");
  assert.deepStrictEqual(s.log.events, ["IdleSitCrossLeggedEnter", "IdleChairExitStart"], "then its own event");
  assert.ok(!s.gm.greymarchEmoteNow);
  const l = make();
  l.state.refuse = true;
  l.page({ type: "emote", id: "sitledge" }); l.tick();
  assert.deepStrictEqual(l.log.events, ["IdleSitLedgeEnter"]);
  const g = emotes.EMOTE_GROUPS.find((x) => x.id === "sit");
  assert.deepStrictEqual(g.items.map((x) => x.id), ["sit", "sitledge", "lie", "wounded2", "wounded3"]);
});

test("standing up from sitting puts the body back to normal 2 seconds later (2026-11-02, the owner: it looked like falling, then they floated); not if another emote started or they sit in a real seat", () => {
  const s = make(); s.state.refuse = true;
  s.page({ type: "emote", id: "sit" }); s.tick();
  s.key(17, true); s.tick();
  assert.deepStrictEqual(s.log.events.slice(-1), ["IdleChairExitStart"]);
  s.tick(1500); assert.ok(!s.log.events.includes("IdleForceDefaultState"), "the stand-up plays first");
  s.tick(600); assert.strictEqual(s.log.events.at(-1), "IdleForceDefaultState", "then the body is back to normal");
  const e = make(); e.state.refuse = true;
  e.page({ type: "emote", id: "sit" }); e.tick(); e.key(17, true); e.tick(); e.key(17, false);
  e.state.refuse = false; e.page({ type: "emote", id: "hey" }); e.tick();
  e.tick(2500); assert.ok(!e.log.events.includes("IdleForceDefaultState"), "another emote meanwhile: left alone");
  const c = make(); c.state.refuse = true;
  c.page({ type: "emote", id: "sit" }); c.tick(); c.key(17, true); c.tick(); c.state.sitState = 3; c.state.furn = 0x1234;
  c.tick(2500); assert.ok(!c.log.events.includes("IdleForceDefaultState"), "in a real seat: left alone");
});

test("sitting in first person: back to first person only after the stand-up is over (2026-11-02, the owner: going back mid stand-up made them fall and float)", () => {
  const s = make(); s.state.refuse = true; s.state.cam = 0;
  s.page({ type: "emote", id: "sit" }); s.tick();
  assert.strictEqual(s.state.cam, 9);
  s.key(17, true); s.tick();
  assert.strictEqual(s.state.cam, 9, "still third person as the stand-up starts");
  s.tick(1500); assert.strictEqual(s.state.cam, 9, "and while it plays");
  s.tick(600);
  assert.strictEqual(s.log.events.at(-1), "IdleForceDefaultState");
  assert.strictEqual(s.state.cam, 9, "still third person: the stand-up takes 5 s (2026-11-05)");
  s.tick(3000); assert.strictEqual(s.state.cam, 0, "then first person");
});

test("poisons on weapons (2026-11-03): the server says the hit used it, it comes off the blade; a paralysing poison paralyses this player for its seconds, let go after or at death", () => {
  const s = make();
  s.say({ customPacketType: "greymarchPoisonUsed" }); s.tick();
  assert.strictEqual(s.log.stripped, 1, "off the blade, on the next frame");
  s.tick(); assert.strictEqual(s.log.stripped, 1, "once");
  const LOCK = [true, true, false, false, true, false, true, false, 0];
  s.say({ customPacketType: "greymarchPoisonFx", paralyze: 5 }); s.tick();
  assert.deepStrictEqual(s.log.controls, [["off", ...LOCK]], "the controls, not the game's Paralysis (no ragdoll, 2026-11-03)");
  assert.strictEqual(s.log.avSet, undefined, "the Paralysis actor value is never touched");
  s.tick(4000); assert.strictEqual(s.log.controls.length, 1, "still paralysed");
  s.tick(1100); assert.deepStrictEqual(s.log.controls.at(-1), ["on", ...LOCK], "free after 5 seconds");
  const d = make();
  d.say({ customPacketType: "greymarchPoisonFx", paralyze: 30 }); d.tick(); d.state.dead = true; d.tick();
  assert.deepStrictEqual(d.log.controls.at(-1), ["on", ...LOCK], "free at death");
  const m = make(); // a meal ending while paralysed does not free them; the paralysis ending during a meal does not either
  m.eat("Venison Stew"); m.tick(); m.say({ customPacketType: "greymarchPoisonFx", paralyze: 10 }); m.tick();
  for (let i = 0; i < 110; i++) m.tick(50);
  assert.notDeepStrictEqual(m.log.controls.at(-1), ["on", ...LOCK], "the meal is over, the paralysis is not");
  m.tick(5000); assert.deepStrictEqual(m.log.controls.at(-1), ["on", ...LOCK], "then free");
  const x = make(); x.say({ customPacketType: "greymarchPoisonFx", paralyze: 999 }); x.tick();
  assert.strictEqual(x.log.controls, undefined, "nonsense is ignored");
});

test("a poison put on the weapon in hand is reported to the server (2026-11-03: the game sends no equip event for it); once; not what was already on at entering", () => {
  const s = make();
  s.state.inv = [{ baseId: 0x557f5, count: 1, worn: true, poisonId: 0x73f30 }];
  s.tick(600); // the first look: already on, only noted
  assert.strictEqual(s.log.sent.filter((m) => m.customPacketType === "greymarchPoisonApplied").length, 0);
  s.state.inv = [{ baseId: 0x557f5, count: 1, worn: true }]; s.tick(600);
  s.state.inv = [{ baseId: 0x557f5, count: 1, worn: true, poisonId: 0x73f31 }]; s.tick(600);
  assert.deepStrictEqual(s.log.sent.filter((m) => m.customPacketType === "greymarchPoisonApplied"), [{ customPacketType: "greymarchPoisonApplied", poison: 0x73f31 }]);
  s.tick(600); s.tick(600);
  assert.strictEqual(s.log.sent.filter((m) => m.customPacketType === "greymarchPoisonApplied").length, 1, "once");
  s.state.inv = [{ baseId: 0x557f5, count: 1, worn: false, poisonId: 0x73f31 }, { baseId: 0x12eb7, count: 1, worn: true }]; s.tick(600);
  assert.strictEqual(s.log.sent.filter((m) => m.customPacketType === "greymarchPoisonApplied").length, 1, "a poisoned weapon in the pack is not in hand");
});

test("a poisoned blade glows (2026-11-03): the server's list goes to GreymarchCam.SetWeaponGlow on the weapon, again when it is drawn or put away and every 5 s, off when the poison is used", () => {
  const OTHER = 0xff000777;
  const s = make({ others: { [OTHER]: 0xff000abc } });
  const glows = () => (s.log.natives || []).filter((n) => n[1] === "SetWeaponGlow");
  s.say({ customPacketType: "greymarchPoisoned", actors: [OTHER] }); s.tick(600);
  assert.strictEqual(glows().length, 1, "another player's blade glows in this game");
  s.tick(600); assert.strictEqual(glows().length, 1, "not asked again at once");
  s.tick(5000); assert.strictEqual(glows().length, 2, "asked again after 5 s (a body drawn again loses it)");
  s.say({ customPacketType: "greymarchPoisoned", actors: [] }); s.tick(600);
  assert.strictEqual(glows().length, 3, "taken off");
  s.tick(600); s.tick(5000); assert.strictEqual(glows().length, 3, "nothing more");
});

test("getting up from lying down or wounded in first person: back to first person only 2 seconds after it ends (2026-11-03: someone floated again)", () => {
  for (const id of ["lie", "wounded2", "wounded3", "hey"]) {
    const s = make(); s.state.cam = 0;
    s.page({ type: "emote", id }); s.tick();
    assert.strictEqual(s.state.cam, 9, id + ": third person");
    s.state.speed = 100; for (let i = 0; i < 20; i++) s.tick(50); // 1 s: moved, it ended
    assert.strictEqual(s.gm.greymarchEmoteNow, null, id);
    assert.strictEqual(s.state.cam, 9, id + ": still third person while getting up");
    const wait = emotes.GETUP_MS[id] || 2000; // 2026-11-05: longer from the ground
    s.tick(wait - 300); assert.strictEqual(s.state.cam, 9, id + ": still getting up " + (wait - 300) + " ms on");
    s.tick(400);
    assert.strictEqual(s.state.cam, 0, id + ": then first person");
    assert.strictEqual(s.log.events.at(-1), "IdleForceDefaultState", id + ": the body back to normal before first person");
  }
});

test("a wheel sit leaves the game saying 'sitting' after the stand-up (2026-11-05, the owner: still floating): the body is put back to normal all the same; only a real seat (a chair the player uses) is left alone", () => {
  const s = make(); s.state.refuse = true;
  s.page({ type: "emote", id: "sit" }); s.tick(); s.state.sitState = 3; // the sitting state, with no seat
  s.key(17, true); s.tick(); s.key(17, false);
  s.tick(2100);
  assert.strictEqual(s.log.events.at(-1), "IdleForceDefaultState", "stood up: back to normal although the game still says sitting");
  s.state.cam = 0; s.tick(); assert.strictEqual(s.state.cam, 9, "scrolling mid stand-up: back to third at once (2026-11-05)");
  s.tick(3000); const n = s.log.events.length; s.state.cam = 0; s.tick();
  assert.strictEqual(s.log.events.length, n + 1, "and again on scrolling into first person once it is over");
  const c = make(); c.state.refuse = true;
  c.page({ type: "emote", id: "hey" }); c.tick(); c.state.speed = 100; for (let i = 0; i < 20; i++) c.tick(50); c.state.speed = 0; c.tick(2100);
  c.state.furn = 0x1234; c.state.sitState = 3; c.state.cam = 0; c.tick();
  assert.ok(!c.log.events.includes("IdleForceDefaultState"), "sat in a chair since: left alone");
});

test("scrolling into first person right after an emote puts the body back to normal (2026-11-05, the owner: people floated through walls); not with a weapon out, not long after", () => {
  const s = make(); // third person throughout
  s.page({ type: "emote", id: "lie" }); s.tick();
  s.state.speed = 100; for (let i = 0; i < 20; i++) s.tick(50); s.state.speed = 0;
  s.state.cam = 0; s.tick(); assert.strictEqual(s.state.cam, 9, "still locked: the wheel's first person is put back");
  s.tick(5100); assert.strictEqual(s.log.pov.at(-1)[0], "on", "the lock let go");
  assert.ok(!s.log.events.includes("IdleForceDefaultState"), "in third person: the body is left alone");
  s.state.cam = 0; s.tick();
  assert.strictEqual(s.log.events.at(-1), "IdleForceDefaultState", "first person: the body is put back to normal at once");
  const n = s.log.events.length; s.state.cam = 9; s.tick(); s.state.cam = 0; s.tick();
  assert.strictEqual(s.log.events.length, n, "once");
  const o = make(); // a one-off emote
  o.page({ type: "emote", id: "surrender" }); o.tick(); o.tick(5100);
  o.state.cam = 0; o.tick(); assert.strictEqual(o.log.events.at(-1), "IdleForceDefaultState", "after a one-off too");
  const w = make(); // a weapon out
  w.page({ type: "emote", id: "hey" }); w.tick(); w.state.drawn = true; for (let i = 0; i < 6; i++) w.tick(50); w.tick(2100);
  w.state.cam = 0; w.tick(); assert.ok(!w.log.events.includes("IdleForceDefaultState"), "drawing the weapon already ended the pose");
  const l = make(); // long after
  l.page({ type: "emote", id: "hey" }); l.tick(); l.state.speed = 100; for (let i = 0; i < 20; i++) l.tick(50); l.state.speed = 0; l.tick(2100);
  l.tick(11000); l.state.cam = 0; l.tick();
  assert.ok(!l.log.events.includes("IdleForceDefaultState"), "10 s later it is ordinary first person");
});
