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
  const player = { isInCombat: () => who.combat, isWeaponDrawn: () => who.drawn };
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    browser: { executeJavaScript: (code) => { const m = /__gmHudSend\((\{.*\})\);$/.exec(code); if (m) log.page.push(JSON.parse(m[1])); } },
    Game: { getPlayer: () => player },
    // Skyrim Platform's real Ui: getFloat/setFloat (there is no getNumber/setNumber)
    Ui: { isMenuOpen: () => false, getFloat: (menu, t) => (menu === "HUD Menu" && t in hud ? hud[t] : undefined), setFloat: (menu, t, v) => { if (menu === "HUD Menu") hud[t] = v; } },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { gm.greymarchCompassNext = 0; gm.greymarchCompassTick(); } };
  return { gm, log, hud, who, tick };
}
const C = "_root.HUDMovieBaseInstance.CompassShoutMeterHolder.";
const hudAt = () => ({ [C + "_xscale"]: 100, [C + "_yscale"]: 100, [C + "_alpha"]: 100, [C + "_x"]: 640, [C + "Compass.CompassFrame._alpha"]: 100 });

test("the compass loses its bar, shows at 80% at its own size and place, fades out in combat or with a weapon drawn, and back after", () => {
  const s = make(hudAt());
  s.tick(20);
  assert.equal(s.hud[C + "Compass.CompassFrame._alpha"], 0, "the bar hidden");
  assert.equal(s.hud[C + "_alpha"], 80, "faded a little");
  assert.equal(s.hud[C + "_xscale"], 100); assert.equal(s.hud[C + "_x"], 640, "its own size and place");
  s.who.combat = true; s.tick(1);
  assert.equal(s.hud[C + "_alpha"], 72, "fading, a step at a time");
  s.tick(12);
  assert.equal(s.hud[C + "_alpha"], 0, "gone in combat");
  s.who.combat = false; s.who.drawn = true; s.tick(10);
  assert.equal(s.hud[C + "_alpha"], 0, "a weapon drawn: still gone");
  s.who.drawn = false; s.tick(12);
  assert.equal(s.hud[C + "_alpha"], 80, "back once it is over");
});

test("the size the first build set is put back to 100%; no HUD yet: nothing", () => {
  const s = make({ ...hudAt(), [C + "_xscale"]: 75, [C + "_yscale"]: 75 });
  s.tick();
  assert.equal(s.hud[C + "_xscale"], 100); assert.equal(s.hud[C + "_yscale"], 100);
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
