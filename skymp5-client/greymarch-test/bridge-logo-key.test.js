"use strict";
// F1 hides and shows the Greymarch logo top right (greymarch-hud.html, fn "logoToggle"; 2026-10-31, the owner).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("F1 (scan code 59) reaches the key handler and toggles the logo, not while typing in the chat", () => {
  assert.match(src, /e\.code !== 37 && e\.code !== 34 && e\.code !== 59\) return;/);
  assert.match(src, /if \(e\.code === 59\) \{ if \(!this\.greymarchChatTyping\) this\.greymarchHudToPage\("logoToggle", true\); return; \}/);
});
