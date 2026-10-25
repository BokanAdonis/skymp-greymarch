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
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./emotes": emotes, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (opts.others || {})[id] || 0 }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const bridge = load(bridgeJs, mods);
  const state = { drawn: false, speed: 0, menu: null, refuse: false };
  const player = {
    playIdle: (idle) => { log.idles.push(idle.id); return !state.refuse; },
    placeAtMe: (base) => { const g = { base, at: null, rot: null, gone: false, setPosition: (x, y, z) => { g.at = [x, y, z]; }, setAngle: (a, b, c) => { g.rot = [a, b, c]; }, disable() { g.gone = true; }, delete() { g.gone = true; } }; (log.ghosts = log.ghosts || []).push(g); return g; },
    getActorValue: (n) => (state.av || {})[n] || 0, damageActorValue: (n, v) => { log.damage = (log.damage || []).concat([[n, Math.round(v)]]); state.av[n] -= v; },
    isWeaponDrawn: () => state.drawn,
    getAnimationVariableFloat: (n) => (n === "Speed" ? state.speed : 0),
    ...faceLog("me"),
  };
  const actors = {}; for (const local of Object.values(opts.others || {})) actors[local] = faceLog(local.toString(16));
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => player, getFormEx: (id) => ({ id }), getFormFromFile: (id, file) => (file === "Missing.esp" ? null : { id, file }), forceThirdPerson: () => { log.thirdPerson++; } },
    callNative: (cls, fn, self, a) => { (log.natives = log.natives || []).push([cls, fn, a]); if (cls !== "GreymarchCam" || state.noDll) throw new Error("Native function not found"); if (fn === "SetFreeCamera") { state.free = !!a; return true; } if (fn === "IsFreeCamera") return !!state.free; if (fn === "GetCamera") return (state.cam || [0, 0, 0, 0, 1, 0])[a]; return undefined; },
    Idle: { from: (f) => f || null }, Actor: { from: (f) => (f && actors[f.id]) || null }, Potion: { from: (f) => (f && f.potion) || null },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push(name), notification: (t) => log.notes.push(t) },
    Ui: { isMenuOpen: (name) => name === state.menu },
    Input: { tapKey: (k) => { log.taps = (log.taps || []).concat([k]); if (state.menu === "InventoryMenu" || state.menu === "FavoritesMenu") state.menu = null; }, getMappedKey: (c) => (c === "Tween Menu" ? state.tweenKey || 15 : 0) },
    Utility: { isInMenuMode: () => false },
    browser: { setVisible() {}, setFocused: (v) => log.focused.push(v), isFocused: () => true, executeJavaScript: (js) => { const m = /window\.__gmEmoteRun\((.*)\);$/.exec(js); if (m) log.pages.push(JSON.parse(m[1])); } },
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
  return { gm, log, state, tick, camTick, key, page, shown, say, eat, bridgeSrc: bridgeJs };
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
  assert.strictEqual(s.log.thirdPerson, 0, "the camera is left alone"); assert.deepStrictEqual(s.log.notes, [], "no notice");
  for (let i = 0; i < 90; i++) s.tick(50); // 4.5 s
  assert.ok(s.gm.greymarchEmoteNow, "still eating");
  for (let i = 0; i < 12; i++) s.tick(50);
  assert.strictEqual(s.gm.greymarchEmoteNow, null, "done after EAT_SECONDS"); assert.strictEqual(s.log.idles[s.log.idles.length - 1], emotes.IDLE_STOP);
  s.log.idles.length = 0;
  s.eat("Ale"); s.tick(); assert.deepStrictEqual(s.log.idles, [idleOf("mug")], "the standing drinking idle");
  for (let i = 0; i < 102; i++) s.tick(50); assert.strictEqual(s.gm.greymarchEmoteNow, null, "a drink also takes five seconds"); s.log.idles.length = 0;
  s.eat("Ale"); s.tick(); s.log.idles.length = 0; s.state.speed = 100; s.tick(800); assert.strictEqual(s.gm.greymarchEmoteNow, null, "walking off ends it early"); s.state.speed = 0; s.log.idles.length = 0;
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
  const g = s.log.ghosts[0]; assert.deepStrictEqual(g.base, { id: 0xd932f, file: "Skyrim.esm" });
  assert.deepStrictEqual(g.at, [1000, 2400, 300], "400 units ahead"); assert.deepStrictEqual(g.rot, [0, 0, 180], "facing the camera");
  s.key(200, true); s.key(200, false); s.key(205, true); s.key(205, false); s.key(201, true); s.key(201, false); s.camTick(50);
  assert.deepStrictEqual(g.at, [1000, 2440, 310]); assert.deepStrictEqual(g.rot, [0, 0, 195]);
  s.key(28, true); s.key(28, false);
  const sent = s.log.sent.filter((m) => m.customPacketType === "greymarchAdmin").pop();
  assert.deepStrictEqual([sent.op, sent.args.sub, sent.args.key, sent.args.pos, sent.args.rot], ["build", "place_at", "d932f:Skyrim.esm", [1000, 2440, 310], 195]);
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
