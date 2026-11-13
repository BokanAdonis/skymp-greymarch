"use strict";
// The free camera a GM gives for a recording (bridge.ts greymarchFreecam*, gamemode freecam.js): F10 while the server says it lasts
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8").replace(/\r\n/g, "\n");

test("F10 is asked for in the key handler and turned in the update phase", () => {
  assert.ok(src.includes("const FREECAM_KEY = 68;"));
  assert.ok(src.includes("if (e.code === FREECAM_KEY) {"));
  assert.ok(src.includes("if (fcDown && !fcWas && !this.greymarchChatTyping) this.greymarchFreecamWanted = Date.now(); return; }"));
  assert.ok(src.includes("this.greymarchFreecamTick(Date.now()); // the free camera a GM gave for a recording (F10)"));
});

test("the server's packet sets how long it lasts; 0 ends it", () => {
  assert.ok(src.includes('if (type === "greymarchFreecam") { this.greymarchFreecamGrant(Number(msg.seconds)); return; }'));
  assert.ok(src.includes("this.greymarchFreecamUntil = s > 0 ? now + s * 1000 : 0;"));
  assert.ok(src.includes('if (!s && had) { this.greymarchLog("freecam: ended by the server"); this.greymarchFreecamEndWanted = "a GM ended it or it ran out"; }'));
});

test("only with a grant; on with the game's free camera; off when the time runs out or the game left it; the interface hidden and put back", () => {
  assert.ok(src.includes("if (until <= now) { this.greymarchToast({ title: \"Free camera\", text: \"You do not have the free camera."));
  assert.ok(src.includes('on = !!sp.callNative("GreymarchCam", "SetFreeCamera", undefined, true);'));
  assert.ok(src.includes('if (until <= now) { this.greymarchFreecamStop("the time ran out");'));
  assert.ok(src.includes('if (!still) { this.greymarchFreecamStop("the game left the free camera"); return; }'));
  assert.ok(src.includes("if (sp.browser.isVisible()) sp.browser.setVisible(false);"));
  assert.ok(src.includes("this.sp.browser.setVisible(st ? st.wasVisible !== false : true);"));
});
