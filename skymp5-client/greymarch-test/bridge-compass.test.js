"use strict";
// The quiet compass (src/greymarch/bridge.ts greymarchCompassTick, 2026-11-11, the owner: "make the compass less intrusive", smaller and faded, always)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

// hud: the HUD's numbers by "<clip>.<prop>"
function make(hud) {
  const log = { lines: [], set: [] };
  const misc = { remoteIdToLocalId: () => 0, localIdToRemoteId: () => 0, getViewFromStorage: () => null };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": misc, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => null },
    Ui: {
      isMenuOpen: () => false, // Skyrim Platform's real Ui: getFloat/setFloat (there is no getNumber/setNumber)
      getFloat: (menu, t) => (menu === "HUD Menu" && t in hud ? hud[t] : undefined),
      setFloat: (menu, t, v) => { if (menu === "HUD Menu") { hud[t] = v; log.set.push([t.replace("_root.HUDMovieBaseInstance.CompassShoutMeterHolder.", ""), v]); } },
    },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const tick = () => { gm.greymarchCompassNext = 0; gm.greymarchCompassTick(); };
  return { gm, log, hud, tick };
}
const C = "_root.HUDMovieBaseInstance.CompassShoutMeterHolder.";
const hudAt = (x, w) => ({ [C + "_xscale"]: 100, [C + "_yscale"]: 100, [C + "_alpha"]: 100, [C + "_x"]: x, [C + "_width"]: w });

test("the compass is made smaller and faded, kept centred when it is anchored at its left edge, and set again when the HUD puts it back", () => {
  const s = make(hudAt(440, 400)); // its middle (640) is the screen's middle: anchored left
  s.tick();
  assert.equal(s.hud[C + "_xscale"], 75); assert.equal(s.hud[C + "_yscale"], 75); assert.equal(s.hud[C + "_alpha"], 45);
  assert.equal(s.hud[C + "_x"], 490, "moved right by the 50 it lost on each side");
  assert.ok(s.log.lines.some((l) => /compass: x 440 width 400, anchored left/.test(l)));
  const n = s.log.set.length; s.tick();
  assert.equal(s.log.set.length, n, "already as set: nothing touched");
  Object.assign(s.hud, { [C + "_xscale"]: 100, [C + "_yscale"]: 100, [C + "_alpha"]: 100, [C + "_x"]: 440 }); // the HUD rebuilt it
  s.tick();
  assert.equal(s.hud[C + "_alpha"], 45); assert.equal(s.hud[C + "_x"], 490, "set again");
});

test("a compass anchored in its middle is only scaled and faded, not moved; no HUD yet: nothing", () => {
  const s = make(hudAt(640, 400));
  s.tick();
  assert.equal(s.hud[C + "_xscale"], 75); assert.equal(s.hud[C + "_x"], 640, "not moved");
  const none = make({});
  none.tick();
  assert.deepStrictEqual(none.log.set, []);
});
