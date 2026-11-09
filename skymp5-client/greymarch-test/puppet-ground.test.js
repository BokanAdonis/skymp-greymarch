"use strict";
// A hunting server-driven animal moved by its victim's game never climbs into the air (src/view/formView.ts gmPuppetDriveLocal; 2026-11-09, the owner:
// "Wolves teleport around and fly"): its height stays within GM_PUPPET_Z_SLACK of the server's, which the server keeps on its ground map.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const formView = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");

test("the local step is held within GM_PUPPET_Z_SLACK of the server's height, after the step is worked out and before it is applied", () => {
  assert.match(formView, /const GM_PUPPET_Z_SLACK = 120;/);
  const fn = formView.slice(formView.indexOf("private gmPuppetDriveLocal("), formView.indexOf("private gmPuppetReport("));
  const step = fn.indexOf("tz = wz + (pz - wz)");
  const hold = fn.indexOf("tz = Math.max(gz - GM_PUPPET_Z_SLACK, Math.min(gz + GM_PUPPET_Z_SLACK, tz))");
  const apply = fn.indexOf("pos: [tx, ty, tz]");
  assert.ok(step > 0 && hold > step && apply > hold, "step, then hold, then apply");
  assert.match(fn, /const gz = Number\(f\.pos && f\.pos\[2\]\);\s+if \(Number\.isFinite\(gz\)\)/, "only with a server height");
});
