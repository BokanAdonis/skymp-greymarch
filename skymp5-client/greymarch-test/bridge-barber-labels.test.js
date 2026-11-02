"use strict";
// src/greymarch/bridge.ts greymarchBarberLabels: every barber spot the server lists is named "Barber's <its name> (<price> gold)" on this game (2026-11-02, the owner:
// "make it so the assigned barber spots are easily identified"); a spot taken off the list gets its own name back.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
function make() {
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (id === 0xff000123 ? 0xff000aaa : 0), localIdToRemoteId: (id) => id } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  const mk = (name) => { const r = { shown: name, getBaseObject: () => ({ getName: () => name }), getDisplayName: () => r.shown, setDisplayName: (n, force) => { assert.strictEqual(force, true); r.shown = n; } }; return r; };
  const chair = mk("Chair"), mirror = mk("Mirror");
  const sp = { printConsole() {}, writeLogs() {}, on() {}, storage: {}, ObjectReference: { from: (f) => f || null },
    Game: { getFormFromFile: (id, file) => (id === 0x1a2b && file === "Skyrim.esm" ? chair : null), getFormEx: (id) => (id === 0xff000aaa ? mirror : null) } };
  const gm = new mod.exports.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchLog = () => {};
  return { gm, chair, mirror };
}

test("barber spots are named with the price, a placed one too; taken off the list, the old name is back", () => {
  const { gm, chair, mirror } = make();
  gm.greymarchPacket({ customPacketType: "greymarchBarberSpots", spots: ["1a2b:Skyrim.esm", "ff:ff000123", "99:Missing.esp"], price: 100 });
  gm.greymarchBarberLabels(1000);
  assert.strictEqual(chair.shown, "Barber's Chair (100 gold)");
  assert.strictEqual(mirror.shown, "Barber's Mirror (100 gold)");
  chair.shown = "Chair"; // the cell loaded again
  gm.greymarchBarberLabels(1500);
  assert.strictEqual(chair.shown, "Chair", "every 2 s, not every frame");
  gm.greymarchBarberLabels(3100);
  assert.strictEqual(chair.shown, "Barber's Chair (100 gold)", "named again");
  gm.greymarchPacket({ customPacketType: "greymarchBarberSpots", spots: ["ff:ff000123"], price: 0 });
  gm.greymarchBarberLabels(3200);
  assert.strictEqual(chair.shown, "Chair", "no longer a spot: its own name");
  assert.strictEqual(mirror.shown, "Barber's Mirror", "free: no price shown");
});

test("the glow (2026-11-02, the owner: \"glowing slightly\"): the picked effect plays on each loaded spot, is swapped when staff change it, stops when the spot goes", () => {
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: (id) => id } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  const calls = [];
  const chair = { loaded: true, shown: "Chair", is3DLoaded: () => chair.loaded, getBaseObject: () => ({ getName: () => "Chair" }), getDisplayName: () => chair.shown, setDisplayName: (n) => { chair.shown = n; } };
  const shader = (id) => ({ play: (r, d) => calls.push(["play", id, d]), stop: () => calls.push(["stop", id]) });
  const sp = { printConsole() {}, writeLogs() {}, on() {}, storage: {}, ObjectReference: { from: (f) => f || null }, EffectShader: { from: (f) => f },
    Game: { getFormFromFile: (id, file) => (id === 0x1a2b ? chair : null), getFormEx: (id) => shader(id) } };
  const gm = new mod.exports.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchLog = () => {};
  gm.greymarchPacket({ customPacketType: "greymarchBarberSpots", spots: ["1a2b:Skyrim.esm"], price: 100, glow: "white" });
  gm.greymarchBarberLabels(1000);
  assert.deepStrictEqual(calls, [["play", 0x0c34b1, -1]], "white: played without end");
  gm.greymarchBarberLabels(3100);
  assert.strictEqual(calls.length, 1, "not played again while it shows");
  gm.greymarchPacket({ customPacketType: "greymarchBarberSpots", spots: ["1a2b:Skyrim.esm"], price: 100, glow: "gold" });
  gm.greymarchBarberLabels(3200);
  assert.deepStrictEqual(calls.slice(1), [["stop", 0x0c34b1], ["play", 0x012fd9, -1]], "swapped");
  chair.loaded = false; gm.greymarchBarberLabels(5300);
  chair.loaded = true; gm.greymarchBarberLabels(7400);
  assert.deepStrictEqual(calls.slice(-1), [["play", 0x012fd9, -1]], "its 3D back: played again");
  gm.greymarchPacket({ customPacketType: "greymarchBarberSpots", spots: [], price: 100, glow: "gold" });
  gm.greymarchBarberLabels(7500);
  assert.deepStrictEqual(calls.slice(-1), [["stop", 0x012fd9]], "no longer a spot: no glow");
});
