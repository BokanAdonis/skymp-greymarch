"use strict";
// hitService.ts: every hit still goes to the server as before, and the first hits that involve the player are written to the server log
// with what was hit, by what, and whether it was sent or why not (to find out whether Flames hits are reported at all).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, mods) {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", file), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  return mod.exports;
}

const FLAMES = 0x12fcd, IRON_SWORD = 0x12eb7;
function make() {
  const handlers = {}, sent = [], logs = [];
  let now = 1000;
  const realNow = Date.now; Date.now = () => now;
  const form = (id, extra = {}) => ({ getFormID: () => id, getBaseObject: () => ({ getType: () => 62 }), ...extra });
  const player = form(0x14, { getActorValue: () => 87.4 });
  const sp = {
    Weapon: { from: (f) => (f && f.getFormID() === IRON_SWORD ? f : null) },
    Spell: { from: (f) => (f && f.getFormID() === FLAMES ? f : null) },
    Scroll: { from: () => null },
    Game: { getPlayer: () => player },
  };
  const controller = {
    on: (n, f) => { handlers[n] = f; },
    emitter: { emit: (n, e) => { if (n === "sendMessage") sent.push(e.message.data); if (n === "greymarchStage") logs.push(e); } },
  };
  const mods = {
    skyrimPlatform: { FormType: { Static: 34, MovableStatic: 36 }, storage: { hosted: [] } },
    "./clientListener": { ClientListener: class {} },
    "../../messages": { MsgType: { OnHit: 11 } },
    "../../view/worldViewMisc": { localIdToRemoteId: (id) => id },
  };
  const { HitService } = load("hitService.ts", mods);
  new HitService(sp, controller);
  const hit = (aggressor, target, source) => handlers.hit({ aggressor, target, source: form(source), projectile: null, isBashAttack: false, isHitBlocked: false, isPowerAttack: false, isSneakAttack: false });
  return { player, form, hit, sent, logs, later: (ms) => { now += ms; }, done: () => { Date.now = realNow; } };
}

test("the player's Flames on another player's copy is sent and logged; the repeats inside 100 ms are neither", () => {
  const g = make();
  const other = g.form(0xff00000f);
  g.hit(g.player, other, FLAMES);
  g.later(40); g.hit(g.player, other, FLAMES);
  g.later(80); g.hit(g.player, other, FLAMES);
  assert.strictEqual(g.sent.length, 2);
  assert.deepStrictEqual(g.logs, ["hit: 14 -> ff00000f source 12fcd projectile none: sent to the server", "hit: 14 -> ff00000f source 12fcd projectile none: sent to the server"]);
  g.done();
});

test("another player's copy hitting the player here is logged with the player's health and not sent", () => {
  const g = make();
  g.hit(g.form(0xff000017), g.player, FLAMES);
  assert.strictEqual(g.sent.length, 0);
  assert.deepStrictEqual(g.logs, ["hit: ff000017 -> 14 source 12fcd projectile none: skipped: another player's copy (their own game reports it) (my health 87)"]);
  g.done();
});

test("a source that is neither weapon, spell nor scroll says so; hits between other actors are not logged", () => {
  const g = make();
  g.hit(g.player, g.form(0xff00000f), 0x1234);
  g.hit(g.form(0xff000017), g.form(0xff00000f), IRON_SWORD);
  assert.deepStrictEqual(g.logs, ["hit: 14 -> ff00000f source 1234 projectile none: skipped: the source is not a weapon, spell or scroll"]);
  g.done();
});
