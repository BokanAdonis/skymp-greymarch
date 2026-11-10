"use strict";
// FRAME-DROP LOG (greymarch/frameWatch.ts): one line to the server log when frames drop, with where the player stands; never a flood.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const load = (rel) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", ...rel.split("/")), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
  return mod.exports;
};

const sp = {
  Game: { getPlayer: () => ({
    getWorldSpace: () => ({ getFormID: () => 0x3c, getName: () => "Skyrim" }),
    getParentCell: () => ({ getFormID: () => 0x9c84, getName: () => "", getNumRefs: () => 12 }),
    getPositionX: () => 116259.4, getPositionY: () => 111530, getPositionZ: () => -7720,
  }) },
  Weather: { getCurrentWeather: () => ({ getFormID: () => 0xc8220 }) },
};

// frames at a fixed interval from t, returns the time after the last one
const run = (fw, lines, t, ms, n) => { for (let i = 0; i < n; i++) { t += ms; fw.frameWatchTick(sp, t, (s) => lines.push(s)); } return t; };

test("smooth frames log nothing", () => {
  const fw = load("greymarch/frameWatch.ts");
  const lines = [];
  run(fw, lines, 1000, 16, 2000);
  assert.deepStrictEqual(lines, []);
});

test("a slow window logs one line with the rate, the world update and the place", () => {
  const fw = load("greymarch/frameWatch.ts");
  const lines = [];
  let t = run(fw, lines, 1000, 16, 1);
  fw.frameWatchWorld(9, 140);
  fw.frameWatchForm(7, 0xff00abcd);
  t = run(fw, lines, t, 50, 220); // 20 fps for 11 s
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /^frames: 10 s at 20 fps, worst frame 50 ms/);
  assert.match(lines[0], /slowest form ff00abcd 7 ms\), 140 forms/);
  assert.match(lines[0], /world 3c "Skyrim", cell 9c84 at 116259,111530,-7720; 12 characters in the cell; weather c8220/);
});

test("hitches alone are logged; reports are spaced and capped", () => {
  const fw = load("greymarch/frameWatch.ts");
  const lines = [];
  let t = 1000;
  fw.frameWatchTick(sp, t, () => {});
  for (let w = 0; w < 200; w++) { // 200 windows of 60 fps with 3 hitches each
    t = run(fw, lines, t, 16, 600);
    t = run(fw, lines, t, 200, 3);
  }
  assert.ok(lines.length >= 1 && lines.length <= fw.MAX_LINES, String(lines.length));
  assert.match(lines[0], /3 over 150 ms/);
  assert.strictEqual(lines.length, fw.MAX_LINES);
  assert.match(lines[lines.length - 1], /the last frame line this game/);
});

test("a pause (loading, a menu) is not a frame", () => {
  const fw = load("greymarch/frameWatch.ts");
  const lines = [];
  let t = run(fw, lines, 1000, 16, 300);
  t += 30000; // loading screen
  run(fw, lines, t, 16, 1000);
  assert.deepStrictEqual(lines, []);
});
