"use strict";
// formView.ts destroy(): a removed server copy (wildlife Deer crash 2026-11-12, MovementControllerNPC on a deleted actor) has its moves stopped and its AI
// turned off before the disable, and is deleted GM_DELETE_AFTER_FRAMES frames after the disable is done.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
const body = src.slice(src.indexOf("  destroy(): void {"), src.indexOf("private lastHarvestedApply"));

test("moves stopped, AI off and held in place, all before the disable", () => {
  const stop = body.indexOf("gmMover.stopTranslation()");
  const ai = body.indexOf("gmStill.enableAI(false)");
  const still = body.indexOf("gmStill.setDontMove(true)");
  const disable = body.indexOf("refr.disable(false).then(");
  assert.ok(stop > 0 && ai > 0 && still > 0 && disable > 0);
  assert.ok(stop < disable && ai < disable && still < disable);
});

test("the delete waits frames after the disable, and protection is dropped only after the delete", () => {
  const disable = body.indexOf("refr.disable(false).then(");
  const wait = body.indexOf("gmAfterFrames(GM_DELETE_AFTER_FRAMES, () => {");
  const del = body.indexOf("gone.delete()");
  const unprotect = body.indexOf("unprotect();", del);
  assert.ok(disable < wait && wait < del && del < unprotect);
  assert.ok(/export const GM_DELETE_AFTER_FRAMES = [1-9];/.test(src), "a small positive frame count");
});

test("gmAfterFrames runs the callback after exactly that many updates", () => {
  const line = src.split("\n").find((l) => l.startsWith("const gmAfterFrames"));
  const queue = [];
  const once = (ev, f) => { assert.strictEqual(ev, "update"); queue.push(f); };
  const gmAfterFrames = new Function("once", line.replace(/: number|: \(\) => void|: void/g, "") + "; return gmAfterFrames;")(once);
  let ran = 0;
  gmAfterFrames(3, () => ran++);
  for (let frame = 1; frame <= 3; frame++) { assert.strictEqual(ran, 0, "not before frame " + frame); queue.shift()(); }
  assert.strictEqual(ran, 1);
  assert.strictEqual(queue.length, 0);
  gmAfterFrames(0, () => ran++);
  assert.strictEqual(ran, 2, "zero frames runs at once");
});
