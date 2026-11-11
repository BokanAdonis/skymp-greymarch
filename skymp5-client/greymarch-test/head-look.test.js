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
    getFormID: () => id, isAIEnabled: () => true, getDistance: () => 0, getAngleZ: () => 0, getPositionX: () => 0, getPositionY: () => 0, getPositionZ: () => 0, clearLookAt: () => log.looks.push([id, "clear"]),
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
  assert.deepStrictEqual(w.log.moves[1], [0xff000010, ...h.clampLook([0, 0, h.HEAD_UP], [500, 1000, 0], 0)], "moved (to the clamped point, seen from the head)");
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

test("no straight up or down (2026-11-10, the owner): from the copy's head the look is clamped to 30 up, 35 down, 70 to a side, put 1000 out; behind them: no look", () => {
  const h = load();
  const H = [0, 0, 100];
  const ang = (p) => [Math.round(Math.atan2(p[0] - H[0], p[1] - H[1]) * 180 / Math.PI), Math.round(Math.atan2(p[2] - H[2], Math.hypot(p[0] - H[0], p[1] - H[1])) * 180 / Math.PI), Math.round(Math.hypot(p[0] - H[0], p[1] - H[1], p[2] - H[2]))];
  assert.deepStrictEqual(ang(h.clampLook(H, [0, 2048, 100], 0)), [0, 0, 1000], "ahead, level");
  assert.deepStrictEqual(ang(h.clampLook(H, [0, 1, 5000], 0)), [0, 30, 1000], "straight up: 30 degrees up, no more");
  assert.deepStrictEqual(ang(h.clampLook(H, [0, 1, -5000], 0)), [0, -35, 1000], "straight down: 35 degrees down, no more");
  assert.deepStrictEqual(ang(h.clampLook(H, [0, 5, 0], 0)), [0, -35, 1000], "their own feet, right below the head: never flipped");
  assert.deepStrictEqual(ang(h.clampLook(H, [2048, 0, 100], 0)), [70, 0, 1000], "to the side: 70 at most");
  assert.deepStrictEqual(ang(h.clampLook(H, [0, 2048, 100], 90)), [20, 0, 1000], "a body facing east looking north: 70 to its left");
  assert.strictEqual(h.clampLook(H, [0, -2048, 100], 0), null, "behind them: no look");
  assert.strictEqual(h.clampLook(null, [0, 1, 0], 0), null);
});

test("a look that goes behind the copy turns its head tracking off once; back in front it is pointed again at once", () => {
  const h = load();
  const w = (() => { const log = { looks: [] }; return { log, sp: { Game: { getFormEx: () => ({ xmarker: true }) } } }; })();
  const c = { getFormID: () => 7, getAngleZ: () => 0, getPositionX: () => 0, getPositionY: () => 0, getPositionZ: () => 0, getWorldSpace: () => ({ getFormID: () => 0x3c }), getParentCell: () => null, isAIEnabled: () => true, getDistance: () => 0,
    placeAtMe: () => ({ setPosition() {}, disable() {}, delete() {} }), setHeadTracking: (on) => w.log.looks.push(["tracking", on]), setLookAt: () => w.log.looks.push(["look"]), clearLookAt: () => w.log.looks.push(["clear"]) };
  h.lookAtPoint(w.sp, c, [0, 1000, 120], 1000);
  assert.strictEqual(h.lookAtPoint(w.sp, c, [0, -1000, 120], 1100), false);
  assert.deepStrictEqual(w.log.looks.slice(2), [["clear"], ["tracking", false]]);
  h.lookAtPoint(w.sp, c, [0, -1000, 120], 1200);
  assert.strictEqual(w.log.looks.length, 4, "turned off only once");
  assert.strictEqual(h.lookAtPoint(w.sp, c, [0, 1000, 120], 1300), true, "in front again: pointed at once, not a second later");
});

test("GreymarchCamera 1.17 SetHeadLook (2026-11-11, the owner's test: the marker turned no head): the clamped point every frame, no marker; an older DLL: the marker", () => {
  const h = load();
  const calls = [], looks = [];
  let placed = 0;
  const sp = { Game: { getFormEx: () => ({ xmarker: true }) }, callNative: (cls, fn, self, ac, x, y, z) => { if (fn === "SetHeadLook") { calls.push([x, y, z].map(Math.round)); return true; } return 0; } };
  const c = { getFormID: () => 9, getAngleZ: () => 0, getPositionX: () => 0, getPositionY: () => 0, getPositionZ: () => 0, getWorldSpace: () => ({ getFormID: () => 0x3c }), getParentCell: () => null, isAIEnabled: () => true, getDistance: () => 0,
    placeAtMe: () => { placed++; return { setPosition() {}, disable() {}, delete() {} }; }, setHeadTracking: (on) => looks.push(["tracking", on]), setLookAt: () => looks.push(["look"]), clearLookAt: () => looks.push(["clear"]) };
  assert.strictEqual(h.lookAtPoint(sp, c, [0, 1000, 120], 1000), true);
  assert.strictEqual(h.lookAtPoint(sp, c, [0, 1000, 5000], 1016), true);
  assert.deepStrictEqual(calls, [[0, 1000, 120], [0, 866, 620]], "every frame; straight up clamped to 30 degrees");
  assert.strictEqual(placed, 0, "no marker");
  assert.deepStrictEqual(looks, [["clear"], ["tracking", true]], "the script look cleared and head tracking on, once");
  const old = load();
  const sp2 = { Game: sp.Game, callNative: () => undefined };
  old.lookAtPoint(sp2, c, [0, 1000, 120], 1000);
  assert.strictEqual(placed, 1, "an older DLL: the marker");
});
