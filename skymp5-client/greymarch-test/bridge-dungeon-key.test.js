"use strict";
// F6 opens the staff panel straight on its Dungeons tab (greymarch-admin.html show "dungeons"); F7, H, B and F6 ask the server first (bridge-staff-only.test.js).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("F6 (scan code 64) reaches the key handler and opens the panel in dungeons mode", () => {
  assert.match(src, /if \(e\.code !== 65 && e\.code !== 66 && e\.code !== 64 && e\.code !== 35 && e\.code !== 48 && /);
  assert.match(src, /if \(code === 64 && !this\.greymarchAdminOn && !this\.greymarchMenuOn && !this\.greymarchChatTyping\) \{[^}]*this\.greymarchStaffOpen\("dungeons"\); \}/);
  assert.match(src, /this\.greymarchAdminToPage\("show", mode === "tester" \|\| mode === "dungeons" \|\| mode === "encounters" \|\| mode === "build" \? mode : true\);/);
  assert.match(src, /if \(code === 65 && !this\.greymarchAdminOn && !this\.greymarchMenuOn\) \{ if \(this\.greymarchEmoteOn\) this\.greymarchEmoteHide\(\); this\.greymarchStaffOpen\(\); \}/, "F7 through the staff check (bridge-staff-only.test.js)");
});

test("H (scan code 35) opens the panel in encounters mode, not while typing in the chat or another window has the keys", () => {
  assert.match(src, /if \(code === 35 && !this\.greymarchAdminOn && !this\.greymarchMenuOn && !this\.greymarchChatTyping && !this\.greymarchPanelHasKeys\(\)\) this\.greymarchStaffKeyWanted = \{ at: Date\.now\(\), mode: "encounters", key: "H" \};/, "through the game-menu check first (greymarchStaffKeyPending), as K");
});

test("B (scan code 48) opens the panel on its Build tab, not while typing or another window has the keys; a turned piece is turned in this game too", () => {
  assert.match(src, /if \(code === 48 && !this\.greymarchAdminOn && !this\.greymarchMenuOn && !this\.greymarchChatTyping && !this\.greymarchPanelHasKeys\(\)\) this\.greymarchStaffKeyWanted = \{ at: Date\.now\(\), mode: "build", key: "B" \};/, "through the game-menu check first, as K");
  assert.match(src, /if \(type === "greymarchBuildAngle"\)/);
  assert.match(src, /if \(ref\) ref\.setAngle\(0, 0, q\[i\]\.z\);/);
  assert.match(src, /this\.greymarchBuildAngleTick\(\);/);
  const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");
  assert.match(auth, /case 'greymarchBuildAngle':/, "the packet is let through");
});
