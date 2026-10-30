"use strict";
// Staff invisibility, the game's half (src/greymarch/bridge.ts greymarchInvisApply): the body at alpha 0, and (2026-10-30, the owner) no "E Talk" prompt on it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const tr = (f) => ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", f), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const load = (js, mods) => { const mod = { exports: {} }; new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod); return mod.exports; };
const emotes = load(tr("emotes.ts"), {});

test("an invisible player's body: alpha 0, activation blocked with the prompt hidden; both undone when they show again", () => {
  const calls = [];
  const actor = { setAlpha: (a) => calls.push(["alpha", a]), blockActivation: (...a) => calls.push(["block", ...a]) };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./emotes": emotes, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (id === 0xff000002 ? 0xff000aaa : 0), localIdToRemoteId: () => 0 }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const bridge = load(tr("bridge.ts"), mods);
  const sp = { printConsole() {}, writeLogs() {}, Game: { getFormEx: (id) => (id === 0xff000aaa ? actor : null) }, Actor: { from: (f) => f }, on() {}, storage: {} };
  const gm = new bridge.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchInvisList = [0xff000002]; gm.greymarchMeActor = 0xff000001;
  gm.greymarchInvisApply(1000);
  assert.deepStrictEqual(calls, [["alpha", 0], ["block", true, true]]);
  calls.length = 0;
  gm.greymarchInvisList = [];
  gm.greymarchInvisApply(5000);
  assert.deepStrictEqual(calls, [["alpha", 1], ["block", false, false]], "visible again: the prompt comes back");
});
