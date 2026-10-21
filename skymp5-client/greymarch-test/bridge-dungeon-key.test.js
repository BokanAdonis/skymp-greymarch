"use strict";
// F6 opens the staff panel straight on its Dungeons tab (greymarch-admin.html show "dungeons"); F7 and F8 are unchanged.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("F6 (scan code 64) reaches the key handler and opens the panel in dungeons mode", () => {
  assert.match(src, /if \(e\.code !== 65 && e\.code !== 66 && e\.code !== 64 && /);
  assert.match(src, /else if \(e\.code === 64 && !this\.greymarchAdminOn && !this\.greymarchMenuOn && !this\.greymarchChatTyping\) \{[^}]*this\.greymarchAdminShow\("dungeons"\); \}/);
  assert.match(src, /this\.greymarchAdminToPage\("show", mode === "tester" \|\| mode === "dungeons" \? mode : true\);/);
  assert.match(src, /else if \(e\.code === 65 && !this\.greymarchAdminOn && !this\.greymarchMenuOn\) \{ if \(this\.greymarchEmoteOn\) this\.greymarchEmoteHide\(\); this\.greymarchAdminShow\(\); \}/, "F7 as before");
});
