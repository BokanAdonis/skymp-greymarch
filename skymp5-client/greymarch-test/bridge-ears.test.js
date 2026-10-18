"use strict";
// Tests for "where each voice comes from" in the Greymarch bridge (src/greymarch/bridge.ts): the camera direction and the head positions sent to the launcher.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const mod = { exports: {} };
const misc = { remoteIdToLocalId: (id) => id, localIdToRemoteId: (id) => id, getViewFromStorage: () => null };
const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": misc, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
const { GreymarchBridge, greymarchCameraYaw } = mod.exports;

// A pretend camera at `cam` facing `yaw` (Skyrim degrees), 80 degrees wide, like worldPointToScreenPoint: [x 0..1 left to right, y, z > 0 in front]
function camera(cam, yaw, fov = 80) {
  const a = (yaw * Math.PI) / 180;
  const k = Math.tan(((fov / 2) * Math.PI) / 180);
  return (pts) => pts.map(([x, y]) => {
    const dx = x - cam[0], dy = y - cam[1];
    const fwd = dx * Math.sin(a) + dy * Math.cos(a), right = dx * Math.cos(a) - dy * Math.sin(a);
    return fwd > 0 ? [0.5 + (0.5 * right) / fwd / k, 0.5, 1] : [0.5 - (0.5 * right) / fwd / k, 0.5, -1];
  });
}
const angleOff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

test("camera direction: read from where points round the head cross the middle of the screen, whichever way it faces", () => {
  for (const yaw of [0, 7, 45, 90, 133, 180, 222.5, 270, 301, 359]) {
    const got = greymarchCameraYaw(camera([0, 0, 100], yaw), [0, 0, 100]);
    assert.ok(got !== null && angleOff(got, yaw) < 1.5, `facing ${yaw}: read ${got}`);
  }
});

test("camera direction: a third-person camera behind and beside the head is still read within a few degrees", () => {
  for (const yaw of [0, 90, 200]) {
    const a = (yaw * Math.PI) / 180;
    const cam = [-250 * Math.sin(a) + 60 * Math.cos(a), -250 * Math.cos(a) - 60 * Math.sin(a), 150]; // 250 behind, 60 to the right
    const got = greymarchCameraYaw(camera(cam, yaw), [0, 0, 100]);
    assert.ok(got !== null && angleOff(got, yaw) < 4, `facing ${yaw}: read ${got}`);
  }
});

test("camera direction: nothing usable on screen = null (the bridge then uses the way the character faces)", () => {
  assert.strictEqual(greymarchCameraYaw(() => [], [0, 0, 0]), null);
  assert.strictEqual(greymarchCameraYaw((pts) => pts.map(() => [0.5, 0.5, -1]), [0, 0, 0]), null);
});

function make() {
  const log = { js: [] };
  let on = {};
  const player = { getPositionX: () => 1000, getPositionY: () => 2000, getPositionZ: () => 0, getAngleZ: () => 33 };
  const sp = {
    Ui: { isMenuOpen: () => false },
    printConsole() {}, writeLogs() {},
    Game: { getPlayer: () => player, getFormEx: () => null, getCurrentCrosshairRef: () => null },
    Actor: { from: (f) => f },
    Debug: { notification() {} },
    NetImmerse: { getNodeWorldPositionX: () => 1000, getNodeWorldPositionY: () => 2000, getNodeWorldPositionZ: () => 120 },
    worldPointToScreenPoint: (...pts) => camera([1000, 2000, 120], 90)(pts),
    browser: { isFocused: () => false, executeJavaScript: (j) => log.js.push(j), setVisible() {}, setFocused() {} },
    on() {},
  };
  const controller = { on() {}, emitter: { on: (n, fn) => { on[n] = fn; }, emit() {} } };
  const gm = new GreymarchBridge(sp, controller);
  const ears = () => log.js.filter((x) => x.includes('"fn":"ears"')).map((x) => JSON.parse(x.slice(x.lastIndexOf("__gmHudSend(") + 12).replace(/\);$/, "")).arg);
  return { gm, log, on, ears, player, sp };
}

test("ears: nothing is sent until the launcher says it is in voice; then about 10 times a second, with the camera direction and nearby heads", () => {
  const { gm, on, ears } = make();
  on.greymarchEar({ name: "#ABCD", x: 1300.4, y: 2000, z: 130 });
  gm.greymarchEarsTick(Date.now());
  assert.strictEqual(ears().length, 0, "voice is not on: nothing goes to the page");
  gm.greymarchVoiceMessage({ hud: false, listen: true, speaking: [] });
  const t = Date.now();
  gm.greymarchEarsTick(t);
  gm.greymarchEarsTick(t + 50);
  assert.strictEqual(ears().length, 1, "not more than every 100 ms");
  const e = ears()[0];
  assert.ok(angleOff(e.yaw, 90) < 1.5, `camera faces east: ${e.yaw}`);
  assert.deepStrictEqual(e.me, [1000, 2000, 120]);
  assert.deepStrictEqual(e.list, [{ id: "#ABCD", x: 1300, y: 2000, z: 130 }]);
  gm.greymarchVoiceMessage({ hud: true, listen: false, speaking: [] });
  gm.greymarchEarsTick(t + 500);
  assert.strictEqual(ears().length, 1, "voice off again: it stops");
});

test("ears: players not seen for a moment drop out, junk names are never sent, and a broken camera falls back to the character's facing", () => {
  const { gm, on, ears, sp } = make();
  gm.greymarchVoiceMessage({ hud: false, listen: true, speaking: [] });
  on.greymarchEar({ name: "#ABCD", x: 1, y: 2, z: 3 });
  on.greymarchEar({ name: "<script>", x: 1, y: 2, z: 3 });
  on.greymarchEar({ name: "#WXYZ", x: NaN, y: 2, z: 3 });
  gm.greymarchEarsSeen["#ABCD"].at -= 1000;
  sp.worldPointToScreenPoint = () => { throw new Error("no camera"); };
  gm.greymarchEarsTick(Date.now());
  assert.strictEqual(ears().length, 0, "a throwing game call never breaks the tick");
  sp.worldPointToScreenPoint = () => [];
  gm.greymarchEarsNext = 0;
  gm.greymarchEarsTick(Date.now());
  const e = ears().pop();
  assert.deepStrictEqual(e.list, []);
  assert.strictEqual(e.yaw, 33, "the way the character faces");
});
