"use strict";
// HEAD TRACKING SYNC (greymarch/headLook.ts): the player's camera direction goes out as their movement's lookAt; another game's copy of them looks at a marker there.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const load = () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "headLook.ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
  return mod.exports;
};

const player = { getPositionX: () => 100, getPositionY: () => 200, getPositionZ: () => 50 };

test("the own look point: LOOK_DIST ahead of the head along the camera; nothing when the camera cannot be read", () => {
  const h = load();
  const cam = { 3: 0, 4: 2, 5: 0 }; // north, not normalised
  const sp = { callNative: (cls, fn, self, i) => { assert.deepStrictEqual([cls, fn], ["GreymarchCam", "GetCamera"]); return cam[i]; } };
  assert.deepStrictEqual(h.ownLookAt(sp, player), [100, 200 + h.LOOK_DIST, 50 + h.HEAD_UP]);
  cam[4] = 0;
  assert.strictEqual(h.ownLookAt(sp, player), undefined, "a camera that reads nothing");
  const h2 = load();
  assert.strictEqual(h2.ownLookAt({ callNative: () => { throw new Error("no DLL"); } }, player), undefined);
  assert.strictEqual(h2.ownLookAt({ callNative: () => 1 }, player, Date.now() + 1000), undefined, "not tried again right away once the read failed");
  assert.ok(h2.ownLookAt({ callNative: () => 1 }, player, Date.now() + h2.CAMERA_RETRY_MS + 1000), "tried again after 10 s (it once stayed off for the session)");
});

function world() {
  const log = { placed: 0, moves: [], looks: [], deleted: 0 };
  const sp = { Game: { getFormEx: (id) => (id === 0x3b ? { xmarker: true } : null) } };
  const copy = (id, place = 0x3c) => ({
    place,
    getFormID: () => id, isAIEnabled: () => true, getDistance: () => 0,
    getWorldSpace() { return { getFormID: () => this.place }; },
    getParentCell: () => null,
    placeAtMe(base) { assert.ok(base.xmarker); log.placed++; const ref = { setPosition: (x, y, z) => log.moves.push([id, x, y, z]), disable() {}, delete: () => log.deleted++ }; return ref; },
    setHeadTracking: (on) => log.looks.push([id, "tracking", on]),
    setLookAt: (ref) => log.looks.push([id, "look"]),
  });
  return { sp, copy, log };
}

test("a copy looks at a marker at the point: placed once, moved only when the point moved, the head pointed again every second", () => {
  const h = load();
  const w = world();
  const c = w.copy(0xff000010);
  assert.strictEqual(h.lookAtPoint(w.sp, c, [0, 1000, 0], 1000), true);
  assert.strictEqual(w.log.placed, 1);
  assert.deepStrictEqual(w.log.looks, [[0xff000010, "tracking", true], [0xff000010, "look"]]);
  h.lookAtPoint(w.sp, c, [10, 1000, 0], 1300);
  assert.strictEqual(w.log.moves.length, 1, "a small change: not moved");
  h.lookAtPoint(w.sp, c, [500, 1000, 0], 1400);
  assert.deepStrictEqual(w.log.moves[1], [0xff000010, 500, 1000, 0], "moved");
  h.lookAtPoint(w.sp, c, [900, 1000, 0], 1450);
  assert.strictEqual(w.log.moves.length, 2, "not more often than MOVE_GAP_MS");
  assert.strictEqual(w.log.looks.length, 2, "not pointed again within a second");
  h.lookAtPoint(w.sp, c, [900, 1000, 0], 2100);
  assert.strictEqual(w.log.looks.length, 4, "pointed again after a second");
  assert.strictEqual(w.log.placed, 1, "still one marker");
});

test("a copy in another world gets a new marker; at most MAX_MARKERS, the least used goes", () => {
  const h = load();
  const w = world();
  const c = w.copy(0xff000010);
  h.lookAtPoint(w.sp, c, [0, 0, 0], 1000);
  c.place = 0x1234;
  h.lookAtPoint(w.sp, c, [0, 0, 0], 1100);
  assert.strictEqual(w.log.placed, 2);
  assert.strictEqual(w.log.deleted, 1, "the old one deleted");
  for (let i = 0; i < h.MAX_MARKERS + 5; i++) h.lookAtPoint(w.sp, w.copy(0xff000100 + i), [0, 0, 0], 2000 + i);
  assert.strictEqual(h._markers(), h.MAX_MARKERS);
});
