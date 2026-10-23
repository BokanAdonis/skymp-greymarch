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
  assert.match(src, /pool\.refs\[k\]\.setAngle\(pitch, 0, heading\);/);
  assert.match(src, /pools\[key2\]\.refs\[j\]\.disable\(false\); pools\[key2\]\.refs\[j\]\.delete\(\);/);
});
