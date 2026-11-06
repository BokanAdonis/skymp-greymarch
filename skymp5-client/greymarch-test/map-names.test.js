"use strict";
// No floating names over the map (2026-11-05, the owner: people near each other could see each other on the map, name and ID): the map and the skills screen
// move the camera into the sky, so src/view/formView.ts draws no floating name while either is open.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");

test("no floating names while the map or the skills screen is open", () => {
  assert.match(src, /const isVisibleByPlayer = !model\.movement\?\.isSneaking\s*\r?\n\s*&& !FormView\.gmSkyMenuOpen\(\)/, "the name is only drawn when no such menu is up");
  assert.match(src, /Ui\.isMenuOpen\("MapMenu"\) \|\| Ui\.isMenuOpen\("StatsMenu"\)/);
  assert.match(src, /import \{[^}]*\bUi\b[^}]*\} from "skyrimPlatform"/, "Ui is imported");
});
