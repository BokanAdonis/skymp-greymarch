"use strict";
// Not while the map is open (2026-11-06, a player's crash in the world map on a Winterhold wall the server switched off as they came near): the server's
// word that a reference is switched off or on is held while MapMenu is open and applied once it closes (src/view/modelApplyUtils.ts).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "view", "modelApplyUtils.ts"), "utf8");

function load(state) {
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const updates = [];
  const refs = new Map();
  const sp = {
    Ui: { isMenuOpen: (n) => n === "MapMenu" && state.map },
    on: (ev, fn) => { if (ev === "update") updates.push(fn); },
    Game: { getFormEx: (id) => refs.get(id) || null },
    ObjectReference: { from: (f) => f },
  };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => (p === "skyrimPlatform" ? sp : {}), mod.exports, mod);
  const ref = (id) => { const r = { id, off: false, calls: [], getFormID: () => id, isDisabled: () => r.off, disable: () => { r.off = true; r.calls.push("disable"); }, enable: () => { r.off = false; r.calls.push("enable"); } }; refs.set(id, r); return r; };
  return { U: mod.exports.ModelApplyUtils, ref, tick: () => updates.forEach((f) => f()) };
}

test("a reference switched off while the map is open is switched off only once the map closes; the latest word for it counts", () => {
  const state = { map: false };
  const { U, ref, tick } = load(state);
  const wall = ref(0x1037f7e5);
  U.applyModelIsDisabled(wall, true);
  assert.deepStrictEqual(wall.calls, ["disable"], "map closed: at once");
  const door = ref(0x200);
  state.map = true;
  U.applyModelIsDisabled(door, true);
  U.applyModelIsDisabled(wall, false);
  tick();
  assert.deepStrictEqual([door.calls, wall.calls], [[], ["disable"]], "map open: held");
  U.applyModelIsDisabled(door, false); // a newer word while still open
  state.map = false; tick();
  assert.deepStrictEqual([door.calls, wall.calls], [[], ["disable", "enable"]], "closed: each gets its latest word (the door was already on)");
  tick();
  assert.deepStrictEqual(wall.calls, ["disable", "enable"], "applied once");
});
