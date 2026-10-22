"use strict";
// Staff god mode makes the player a ghost; an NPC whose AI ran in that game ignored the ghost and every other player, so it stood still for everyone
// (a GM in a dungeon, 2026-10-22). A game in god mode drops the NPCs it hosts and asks for none while another player is near, who takes them over; alone it runs them (NPCs nobody runs walked through the ground and the sky).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const read = (...p) => fs.readFileSync(path.join(__dirname, "..", "src", ...p), "utf8");
const bridge = read("greymarch", "bridge.ts");
const inputs = read("services", "services", "sendInputsService.ts");
const remote = read("services", "services", "remoteServer.ts");

function bridgeClass() {
  const ts = require("typescript");
  const js = ts.transpileModule(bridge, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  const misc = { remoteIdToLocalId: (id) => id - 0x1000 };
  new Function("require", "exports", "module", js)((p) => (p === "../view/worldViewMisc" ? misc : new Proxy({}, { get: () => ({}) })), mod.exports, mod);
  return mod.exports.GreymarchBridge;
}
function fake(others) {
  const storage = { hosted: [5, 6] };
  const at = (x) => ({ is3DLoaded: () => true, getPositionX: () => x, getPositionY: () => 0 });
  const actors = new Map(others.map(([id, x]) => [id - 0x1000, at(x)]));
  const self = { greymarchOthers: others.map(([id]) => id), greymarchGhostList: [], greymarchLog() {}, sp: { storage, Actor: { from: (f) => f }, Game: { getFormEx: (id) => actors.get(id) || null } } };
  const B = bridgeClass();
  self.greymarchOtherHostNear = B.prototype.greymarchOtherHostNear;
  const apply = (now, god) => B.prototype.greymarchNoHostApply.call(self, now, at(0), god);
  return { self, storage, apply };
}

test("god mode with another player within two cells: this game drops its NPCs and hosts none; alone (or the other far away or a staff ghost) it runs them", () => {
  const near = fake([[0x5000, 3000]]);
  near.apply(10000, true);
  assert.deepStrictEqual([near.storage.greymarchNoHost, near.storage.hosted], [true, []]);
  near.apply(20000, false);
  assert.strictEqual(near.storage.greymarchNoHost, false, "god mode off: hosting as usual");

  const alone = fake([]);
  alone.apply(10000, true);
  assert.ok(alone.storage.greymarchNoHost !== true, "alone in god mode: NPCs nobody else would run are still run here");
  assert.deepStrictEqual(alone.storage.hosted, [5, 6]);

  const far = fake([[0x5000, 9000]]);
  far.apply(10000, true);
  assert.ok(far.storage.greymarchNoHost !== true, "the other player is more than two cells away");

  const ghost = fake([[0x5000, 1000]]);
  ghost.self.greymarchGhostList = [{ actor: 0x5000 }];
  ghost.apply(10000, true);
  assert.ok(ghost.storage.greymarchNoHost !== true, "a staff ghost is no better host");
});

test("no host request is sent and no host start is taken while the flag is on", () => {
  const fn = inputs.slice(inputs.indexOf("private sendHostAttempts()"), inputs.indexOf("t: MsgType.Host"));
  assert.match(fn, /const remoteId = nextHostAttempt\(\);[\s\S]*if \(\(this\.sp\.storage as any\)\["greymarchNoHost"\] === true\) \{\s*return;/, "the queued attempt is used up, not sent");
  const start = remote.slice(remote.indexOf("private onHostStartMessage("), remote.indexOf("private onHostStopMessage("));
  assert.match(start, /if \(\(storage as any\)\["greymarchNoHost"\] === true\) return;/);
});
