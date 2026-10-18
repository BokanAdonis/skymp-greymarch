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
  const log = { idles: [], events: [], notes: [], pages: [], lines: [], thirdPerson: 0, focused: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./emotes": emotes, "../view/worldViewMisc": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const bridge = load(bridgeJs, mods);
  const state = { drawn: false, speed: 0, menu: null, refuse: false };
  const player = {
    playIdle: (idle) => { log.idles.push(idle.id); return !state.refuse; },
    isWeaponDrawn: () => state.drawn,
    getAnimationVariableFloat: (n) => (n === "Speed" ? state.speed : 0),
  };
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => player, getFormEx: (id) => ({ id }), forceThirdPerson: () => { log.thirdPerson++; } },
    Idle: { from: (f) => f || null },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push(name), notification: (t) => log.notes.push(t) },
    Ui: { isMenuOpen: (name) => name === state.menu },
    Utility: { isInMenuMode: () => false },
    browser: { setVisible() {}, setFocused: (v) => log.focused.push(v), isFocused: () => true, executeJavaScript: (js) => { const m = /window\.__gmEmoteRun\((.*)\);$/.exec(js); if (m) log.pages.push(JSON.parse(m[1])); } },
    on() {}, storage: {},
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new bridge.GreymarchBridge(sp, controller);
  let t = 1_000_000;
  const realNow = Date.now;
  const at = (fn) => { Date.now = () => t; try { return fn(); } finally { Date.now = realNow; } };
  const tick = (ms = 50) => { t += ms; at(() => gm.greymarchEmoteTick(t)); };
  const key = (code, down) => at(() => gm.greymarchKey({ code, isDown: down }));
  const page = (msg) => at(() => gm.greymarchBrowserMessage({ arguments: ["greymarch", JSON.stringify(msg)] }));
  const shown = () => log.pages.filter((p) => p.fn === "show");
  return { gm, log, state, tick, key, page, shown, bridgeSrc: bridgeJs };
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
      assert.ok(Number.isInteger(e.idle) && e.idle > 0 && e.idle < 0x1000000, e.id + " is a Skyrim.esm idle");
      assert.ok(["once", "loop", "walk"].includes(e.kind), e.id);
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
