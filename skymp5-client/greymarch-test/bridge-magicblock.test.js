"use strict";
// NPC raise-the-dead and summons (gamemode magicblock.js): the list is taken in, and an effect on it is ended the frame after it starts when an NPC cast it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");

test("greymarchMagicBlock is let through and kept as a set of effect IDs", () => {
  assert.match(auth, /case 'greymarchMagicBlock':/);
  assert.match(src, /if \(type === "greymarchMagicBlock"\) \{ var mb: any = \{\};/);
});

test("a listed effect is queued from the game event and ended in the update, only when an NPC (a real base record) cast it", () => {
  assert.match(src, /this\.controller\.on\("magicEffectApply", \(e: any\) => \{ try \{ if \(e && e\.effect && e\.activeEffect && this\.greymarchMagicBlock && this\.greymarchMagicBlock\[e\.effect\.getFormID\(\) >>> 0\]\)/);
  assert.match(src, /this\.greymarchMagicBlockDrive\(\); \/\/ NPC raise-the-dead/);
  assert.match(src, /if \(q\[i\]\.caster === 0x14\) continue;/);
  assert.match(src, /if \(!baseId \|\| baseId >= 0xff000000\) continue;/);
  assert.match(src, /q\[i\]\.active\.dispel\(\);/);
});
