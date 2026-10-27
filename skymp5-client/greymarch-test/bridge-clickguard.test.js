"use strict";
// THE CLICK GUARD (src/greymarch/bridge.ts greymarchClickGuard): the click on a window's X must not reach the game as a swing (2026-10-26, the owner: closing
// the guard ledger or the scribe's desk drew the sword or raised the fists). After a window closes, fighting controls are off for CLICK_GUARD_MS.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const bridge = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8").split("\r\n").join("\n");
const fnBody = (name) => { const at = bridge.indexOf(`    ${name}(): any {\n`); assert.ok(at >= 0, name); return bridge.slice(at, bridge.indexOf("\n    }\n", at)); };

test("every window the mouse can close starts the guard when it really closes", () => {
  for (const h of ["Menu", "Prof", "Chancery", "VampMenu", "Ledger", "Scribe", "Mini", "Craft", "Forge", "Emote"]) {
    const b = fnBody(`greymarch${h}Hide`);
    const ret = b.search(/\) return;/), guard = b.indexOf("this.greymarchClickGuard();");
    assert.ok(guard > 0, `${h}: guarded`);
    assert.ok(ret > 0 && ret < guard, `${h}: only after its "not open" return (a hide of a closed window starts nothing)`);
  }
  assert.ok(fnBody("greymarchAdminHide").includes("if (this.greymarchAdminOn) this.greymarchClickGuard();"), "the staff panel: only when it was open");
});

test("the guard: fighting controls off from the update phase, on again after CLICK_GUARD_MS, unless a meal or a staff freeze holds them", () => {
  assert.match(bridge, /const CLICK_GUARD_MS = \d+;/);
  assert.ok(bridge.includes("this.greymarchClickGuardTick(); // the click that closed a window is not a swing"), "ticked every update");
  const tick = fnBody("greymarchClickGuardTick");
  assert.ok(tick.includes("sp.Game.disablePlayerControls(false, true, false, false, false, false, false, false, 0)"), "only fighting");
  assert.ok(tick.includes("now >= (this.greymarchClickGuardUntil || 0)"));
  assert.ok(tick.includes("if (!this.greymarchMealLocked && !(fx && fx.frozen)) { try { sp.Game.enablePlayerControls(false, true, false, false, false, false, false, false, 0);"), "never undoes a meal lock or a staff freeze");
});
