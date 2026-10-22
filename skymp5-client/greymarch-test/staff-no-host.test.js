"use strict";
// Staff god mode makes the player a ghost; an NPC whose AI ran in that game ignored the ghost and every other player, so it stood still for everyone
// (a GM in a dungeon, 2026-10-22). A game in god mode drops the NPCs it hosts and asks for none; another game nearby takes them over.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const read = (...p) => fs.readFileSync(path.join(__dirname, "..", "src", ...p), "utf8");
const bridge = read("greymarch", "bridge.ts");
const inputs = read("services", "services", "sendInputsService.ts");
const remote = read("services", "services", "remoteServer.ts");

test("god mode on: this game hosts no NPC (the flag, the hosted list emptied), god mode off: hosting as usual", () => {
  assert.match(bridge, /have\.god = !!want\.god; try \{ \(sp\.storage as any\)\["greymarchNoHost"\] = have\.god; if \(have\.god\) sp\.storage\["hosted"\] = \[\]; \}/);
});

test("no host request is sent and no host start is taken while the flag is on", () => {
  const fn = inputs.slice(inputs.indexOf("private sendHostAttempts()"), inputs.indexOf("t: MsgType.Host"));
  assert.match(fn, /const remoteId = nextHostAttempt\(\);[\s\S]*if \(\(this\.sp\.storage as any\)\["greymarchNoHost"\] === true\) \{\s*return;/, "the queued attempt is used up, not sent");
  const start = remote.slice(remote.indexOf("private onHostStartMessage("), remote.indexOf("private onHostStopMessage("));
  assert.match(start, /if \(\(storage as any\)\["greymarchNoHost"\] === true\) return;/);
});
