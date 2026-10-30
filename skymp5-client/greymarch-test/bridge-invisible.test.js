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
  const sp = { printConsole() {}, writeLogs() {}, Game: { getFormEx: (id) => (id === 0xff000aaa ? actor : null) }, Actor: { from: (f) => f }, callNative: (cls, fn, self, a, b) => { assert.deepStrictEqual([cls, fn], ["ObjectReference", "BlockActivation"]); self.blockActivation(a, b); }, on() {}, storage: {} };
  const gm = new bridge.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchInvisList = [0xff000002]; gm.greymarchMeActor = 0xff000001;
  gm.greymarchInvisApply(1000);
  assert.deepStrictEqual(calls, [["alpha", 0], ["block", true, true]]);
  calls.length = 0;
  gm.greymarchInvisList = [];
  gm.greymarchInvisApply(5000);
  assert.deepStrictEqual(calls, [["alpha", 1], ["block", false, false]], "visible again: the prompt comes back");
});

test("no E Talk on any other living player (2026-10-30, the owner); a dead body stays open (a werewolf feeds with E); not your own body", () => {
  const calls = [];
  const mk = (name, dead) => ({ isDead: () => dead, setAlpha() {}, blockActivation: (...a) => calls.push([name, ...a]) });
  const bodies = { 0xff000aa1: mk("alive", false), 0xff000aa2: mk("dead", true) };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./emotes": emotes, "../view/worldViewMisc": { remoteIdToLocalId: (id) => ({ 0xff000002: 0xff000aa1, 0xff000003: 0xff000aa2 })[id] || 0, localIdToRemoteId: () => 0 }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const bridge = load(tr("bridge.ts"), mods);
  const sp = { printConsole() {}, writeLogs() {}, Game: { getFormEx: (id) => bodies[id] || null }, Actor: { from: (f) => f }, callNative: (cls, fn, self, a, b) => self.blockActivation(a, b), on() {}, storage: {} };
  const gm = new bridge.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchOthers = [0xff000002, 0xff000003]; gm.greymarchInvisList = [];
  gm.greymarchNoTalkApply(1000);
  assert.deepStrictEqual(calls, [["alive", true, true], ["dead", false, false]]);
  gm.greymarchNoTalkApply(1500);
  assert.strictEqual(calls.length, 2, "every 2 seconds, not every frame");
  gm.greymarchNoTalkApply(3100);
  assert.strictEqual(calls.length, 4, "put on again (a body built again would show the prompt)");
});

test("the prompt is hidden through the game's own BlockActivation with both arguments (callNative); without it, the one-argument call", () => {
  const calls = [], lines = [];
  const actor = { setAlpha() {}, blockActivation: (...a) => calls.push(["sp", ...a]) };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./emotes": emotes, "../view/worldViewMisc": { remoteIdToLocalId: () => 0xff000aaa, localIdToRemoteId: () => 0 }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const bridge = load(tr("bridge.ts"), mods);
  const mk = (callNative) => { const gm = new bridge.GreymarchBridge({ printConsole() {}, writeLogs: (n, l) => lines.push(l), Game: { getFormEx: () => actor }, Actor: { from: (f) => f }, callNative, on() {}, storage: {} }, { on() {}, emitter: { on() {}, emit: () => {} } }); gm.greymarchLog = (l) => lines.push(l); return gm; };
  mk((cls, fn, self, a, b) => calls.push(["native", cls, fn, a, b])).greymarchNoPrompt(actor, true);
  assert.deepStrictEqual(calls, [["native", "ObjectReference", "BlockActivation", true, true]]);
  assert.ok(lines.some((l) => /talk prompt: hidden (BlockActivation, 2 arguments)/.test(l)));
  calls.length = 0;
  mk(() => { throw new Error("no such function"); }).greymarchNoPrompt(actor, true);
  assert.deepStrictEqual(calls, [["sp", true]], "the old call as a fallback");
});
