"use strict";
// The prisoner's chain in the world (gamemode guards.js): pieces of GM_PrisonerChain (GreymarchCore.esp 0x878) laid along a sagging curve from hand to hand;
// the HUD line only without the record.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("the chain record is looked up in GreymarchCore.esp; the HUD line is the fallback", () => {
  assert.match(src, /sp\.Game\.getFormFromFile\(0x878, "GreymarchCore\.esp"\)/);
  assert.match(src, /if \(this\.greymarchChain3D\(now\)\) \{/);
});

test("pieces follow a sagging curve from the prisoner's right hand to the holder's left hand, and go when the chain does", () => {
  assert.match(src, /var A = hand\(a, "NPC R Hand \[RHnd\]"\), B = hand\(b, "NPC L Hand \[LHnd\]"\);/);
  assert.match(src, /var sag = Math\.sqrt\(3 \* gap \* \(length - gap\) \/ 8\);/);
  assert.match(src, /player\.placeAtMe\(base, 1, false, false\)/);
  assert.match(src, /pr\.setAngle\(pitch, 0, heading\);/);
  // form ids only (2026-11-07: a SkyrimPlatform object is good for one frame; the log said Invalid _skyrimPlatform_indexInPool and the chain fell back to the HUD line)
  assert.match(src, /pool\.refs\.push\(r\.getFormID\(\) >>> 0\)/);
  assert.match(src, /var pr = refAt\(pool\.refs\[k\]\);/);
  assert.doesNotMatch(src, /this\.greymarchChainBase = sp\.Game\.getFormFromFile/);
  assert.match(src, /var jr = refAt\(pools\[key2\]\.refs\[j\]\); if \(jr\) \{ jr\.disable\(false\); jr\.delete\(\); \}/);
});
