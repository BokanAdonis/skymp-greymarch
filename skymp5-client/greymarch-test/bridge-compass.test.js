"use strict";
// The quiet compass (src/greymarch/bridge.ts greymarchCompassTick, 2026-11-11, the owner: "make the compass less intrusive"; then "put it back in the middle ...
// make it transparent and go away in combat")
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

// hud: the HUD's numbers by "<clip>.<prop>"; who: the player's state
function make(hud, who = { combat: false, drawn: false }) {
  const log = { lines: [], page: [] };
  const misc = { remoteIdToLocalId: () => 0, localIdToRemoteId: () => 0, getViewFromStorage: () => null };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": misc, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const player = { getFormID: () => 0x14, isInCombat: () => who.combat, isWeaponDrawn: () => who.drawn };
  const actors = who.actors || {};
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    browser: { executeJavaScript: (code) => { const m = /__gmHudSend\((\{.*\})\);$/.exec(code); if (m) log.page.push(JSON.parse(m[1])); } },
    Game: { getPlayer: () => player, getFormEx: (id) => (id === 0x14 ? player : actors[id] || null) },
    Actor: { from: (f) => f },
    // Skyrim Platform's real Ui: getFloat/setFloat (there is no getNumber/setNumber)
    Ui: { isMenuOpen: () => false, getFloat: (menu, t) => (menu === "HUD Menu" && t in hud ? hud[t] : undefined), setFloat: (menu, t, v) => { if (menu === "HUD Menu") hud[t] = v; } },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { gm.greymarchCompassNext = 0; gm.greymarchCompassTick(); } };
  const etick = (now) => { gm.greymarchEnemyNext = 0; gm.greymarchEnemyTick(now); };
  return { gm, log, hud, who, tick, etick, actors };
}
const C = "_root.HUDMovieBaseInstance.CompassShoutMeterHolder.";
const hudAt = () => ({ [C + "_xscale"]: 100, [C + "_yscale"]: 100, [C + "_alpha"]: 100, [C + "_x"]: 640, [C + "Compass.CompassFrame._alpha"]: 100 });

test("the compass loses its bar, shows at 80% a little smaller (85%) in its own place, fades out in combat or with a weapon drawn, and back after", () => {
  const s = make(hudAt());
  s.tick(20);
  assert.equal(s.hud[C + "Compass.CompassFrame._alpha"], 0, "the bar hidden");
  assert.equal(s.hud[C + "_alpha"], 80, "faded a little");
  assert.equal(s.hud[C + "_xscale"], 85); assert.equal(s.hud[C + "_yscale"], 85); assert.equal(s.hud[C + "_x"], 640, "a little smaller, never moved");
  s.who.combat = true; s.tick(1);
  assert.equal(s.hud[C + "_alpha"], 72, "fading, a step at a time");
  s.tick(12);
  assert.equal(s.hud[C + "_alpha"], 0, "gone in combat");
  s.who.combat = false; s.who.drawn = true; s.tick(10);
  assert.equal(s.hud[C + "_alpha"], 0, "a weapon drawn: still gone");
  s.who.drawn = false; s.tick(12);
  assert.equal(s.hud[C + "_alpha"], 80, "back once it is over");
});

test("the size the first build set (75%) goes to 85%; no HUD yet: nothing", () => {
  const s = make({ ...hudAt(), [C + "_xscale"]: 75, [C + "_yscale"]: 75 });
  s.tick();
  assert.equal(s.hud[C + "_xscale"], 85); assert.equal(s.hud[C + "_yscale"], 85); assert.equal(s.hud[C + "_x"], 640);
  const none = make({});
  none.tick();
  assert.deepStrictEqual(none.hud, {});
});

test("the compass's design on the HUD page is told the compass's opacity: shown out of combat, 0 in combat", () => {
  const s = make(hudAt());
  s.tick(1);
  assert.deepStrictEqual(s.log.page.filter((m) => m.fn === "compass").pop(), { fn: "compass", arg: { a: 0.8 } });
  s.who.combat = true; s.tick(1);
  assert.deepStrictEqual(s.log.page.filter((m) => m.fn === "compass").pop(), { fn: "compass", arg: { a: 0 } });
  const n = s.log.page.length; s.tick(3);
  assert.equal(s.log.page.length, n, "not told again while nothing changes");
});

const E = "_root.HUDMovieBaseInstance.EnemyHealth_mc._alpha";
const mkActor = (id, name, hp) => { const a = { id, hp, dead: false, getFormID: () => id, getActorValuePercentage: (k) => (k === "Health" ? a.hp : 1), isDead: () => a.dead, getDisplayName: () => name, getBaseObject: () => null }; return a; };
const lastEnemy = (s) => s.log.page.filter((m) => m.fn === "enemy").pop();

test("our enemy bar: the one this player hits, its name and health; the game's enemy meter hidden; gone 10 s after the last hit", () => {
  const bandit = mkActor(0xff000123, "Bandit", 0.6);
  const s = make({ ...hudAt(), [E]: 100 }, { combat: true, drawn: true, actors: { [bandit.id]: bandit } });
  s.gm.greymarchHudOn = true;
  s.gm.greymarchEnemyHit({ aggressor: { getFormID: () => 0x14 }, target: bandit }, 1000);
  s.etick(1000);
  assert.equal(s.hud[E], 0, "the game's meter hidden");
  assert.deepStrictEqual(lastEnemy(s), { fn: "enemy", arg: { n: "Bandit", h: 0.6 } });
  bandit.hp = 0.25; s.etick(1200);
  assert.deepStrictEqual(lastEnemy(s).arg, { n: "Bandit", h: 0.25 });
  s.etick(12000);
  assert.deepStrictEqual(lastEnemy(s).arg, { off: true }, "gone after 10 s");
});

test("hit by someone with nobody fought yet: they show; a death shows 0 and then goes; our page away: the game's meter is given back", () => {
  const wolf = mkActor(0xff000200, "Wolf", 0.9), bear = mkActor(0xff000201, "Bear", 1);
  const s = make({ ...hudAt(), [E]: 100 }, { actors: { [wolf.id]: wolf, [bear.id]: bear } });
  s.gm.greymarchHudOn = true;
  s.gm.greymarchEnemyHit({ aggressor: wolf, target: { getFormID: () => 0x14 } }, 1000);
  s.gm.greymarchEnemyHit({ aggressor: bear, target: { getFormID: () => 0x14 } }, 1100);
  s.etick(1100);
  assert.equal(lastEnemy(s).arg.n, "Wolf", "the first one stays while it lasts");
  wolf.dead = true; s.etick(1300);
  assert.deepStrictEqual(lastEnemy(s).arg, { n: "Wolf", h: 0 });
  s.etick(3000);
  assert.deepStrictEqual(lastEnemy(s).arg, { off: true }, "a moment after the death");
  s.gm.greymarchHudOn = false; s.etick(3100);
  assert.equal(s.hud[E], 100, "the game's meter back while our page is away");
});
