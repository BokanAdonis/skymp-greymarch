"use strict";
// The werewolf's lunge (2026-11-03, the owner: "Lunge attack on werewolves didnt work ... don't knock down the character you hit because we can't sync that"):
// an attack while sprinting in beast form is the race's sprint attack (a leap). The game's own attack event is swapped for it; with none, the bridge plays it.
// The knockdown is taken off in GreymarchCore.esp (every werewolf race's AttackStart*Sprinting has Knockdown 0).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make() {
  const log = { lines: [], events: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0 }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const hooks = [];
  let sprinting = false;
  const player = { isSprinting: () => sprinting };
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l), on() {}, storage: {},
    hooks: { sendAnimationEvent: { add: (h, a, b, pattern) => hooks.push({ h, pattern }) } },
    Game: { getPlayer: () => player, getFormEx: (id) => ({ id }) },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push(name), notification() {} },
    Utility: { isInMenuMode: () => false },
  };
  const gm = new mod.exports.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  let t = 5_000_000; const realNow = Date.now; Date.now = () => t;
  // the game sends an attack event: every hook whose pattern fits sees it, as SkyrimPlatform does (case-sensitive prefix)
  const gameSends = (name) => { const ctx = { animEventName: name, selfId: 0x14 }; for (const { h, pattern } of hooks) if (name.startsWith(pattern.replace("*", ""))) h.enter(ctx); return ctx.animEventName; };
  const frame = (ms = 16) => { t += ms; gm.greymarchWolfLungeTick(player, t); };
  const click = (left) => { gm.greymarchKey({ code: left ? 257 : 256, isDown: true }); gm.greymarchKey({ code: left ? 257 : 256, isDown: false, isUp: true }); };
  return { gm, log, hooks, gameSends, frame, click, sprint: (v) => { sprinting = v; }, done: () => { Date.now = realNow; }, advance: (ms) => { t += ms; } };
}

test("the game's attack while the werewolf sprints becomes the leap; not sprinting, not changed, or a werebear: the game's own attack", () => {
  const s = make();
  try {
    assert.ok(s.hooks.some((h) => h.pattern === "attackStart*") && s.hooks.some((h) => h.pattern === "AttackStart*"), "both spellings hooked on the player");
    s.gm.greymarchWolfOn = true;
    s.frame();
    assert.strictEqual(s.gameSends("attackStartRight"), "attackStartRight", "walking: a normal swipe");
    s.sprint(true); s.frame();
    assert.strictEqual(s.gameSends("attackStartRight"), "AttackStartRightSprinting", "sprinting: the leap");
    s.frame();
    assert.ok(s.log.lines.some((l) => /wolf lunge: the game's attackStartRight -> AttackStartRightSprinting/.test(l)));
    assert.strictEqual(s.gameSends("AttackStartLeftPower"), "AttackStartLeftPower", "one leap per 1.5 s");
    s.advance(1600); s.frame();
    assert.strictEqual(s.gameSends("AttackStartLeftPower"), "AttackStartLeftSprinting", "the left paw: the left leap");
    assert.strictEqual(s.gameSends("AttackStartRightSprinting"), "AttackStartRightSprinting", "the leap itself is left alone");
    s.advance(1600); s.frame();
    s.gm.greymarchWolfBearRace = 0x123;
    assert.strictEqual(s.gameSends("attackStartRight"), "attackStartRight", "a werebear: its own attack");
    s.gm.greymarchWolfBearRace = 0; s.gm.greymarchWolfOn = false;
    assert.strictEqual(s.gameSends("attackStartRight"), "attackStartRight", "a person: its own attack");
  } finally { s.done(); }
});

test("when the game sends no attack while sprinting, the bridge plays the leap itself after a moment; a click while walking plays nothing", () => {
  const s = make();
  try {
    s.gm.greymarchWolfOn = true;
    s.frame();
    s.click(false); s.frame(100);
    assert.deepStrictEqual(s.log.events, [], "walking: nothing of ours");
    s.sprint(true); s.frame();
    s.click(false); s.frame(16);
    assert.deepStrictEqual(s.log.events, [], "the game still has its moment");
    s.frame(100);
    assert.deepStrictEqual(s.log.events, ["AttackStartRightSprinting"]);
    assert.ok(s.log.lines.some((l) => /no attack from the game while sprinting, played AttackStartRightSprinting/.test(l)));
    s.advance(1600); s.frame();
    s.click(true); s.gameSends("attackStartLeft"); s.frame(100);
    assert.deepStrictEqual(s.log.events, ["AttackStartRightSprinting"], "the game sent its own attack (swapped): nothing played twice");
  } finally { s.done(); }
});
