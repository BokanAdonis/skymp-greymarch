"use strict";
// remoteServer.ts onDestroyActorMessage: a removal for an object this game never got must not count as "my own body is gone" (getId gives -1 for an
// unknown object, and SkyMP's "my own body" is also -1 until the game knows it: SkyMP quit to the main menu).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "remoteServer.ts"), "utf8");

test("an unknown object's removal returns before anything is changed or compared with the player's own body", () => {
  const start = src.indexOf("private onDestroyActorMessage");
  assert.ok(start > 0);
  const body = src.slice(start, start + 2500);
  const guard = body.indexOf("if (i < 0) return;");
  assert.ok(guard > 0, "the guard is there");
  assert.ok(guard < body.indexOf("this.worldModel.forms[i] = undefined"), "before the form is cleared");
  assert.ok(guard < body.indexOf("playerCharacterFormIdx === i"), "before the own-body comparison");
});
